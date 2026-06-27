import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameCommand, GameState } from "../game/core/types";
import { LocalTransport } from "../game/core/transport";
import { createInitialState } from "../game/content/initialState";
import { loadGame, saveGame, clearSave } from "../game/save/storage";
import { ApiError, loadRemoteGame, saveRemoteGame, saveRemoteGameBeacon, updateStoredGameSessionSaveRevision, type GameSession } from "../game/save/api";
import { planNpcCommands } from "../game/ai/rivalAi";
import { reduceCommands, reduceGameState } from "../game/systems/reducer";
import type { MultiplayerClient } from "../game/network/multiplayerClient";
import type { MultiplayerRole } from "../game/network/protocol";

export interface UseGameOptions {
  initialState?: GameState;
  multiplayerClient?: MultiplayerClient | null;
  multiplayerRole?: MultiplayerRole;
  session?: GameSession | null;
}

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "conflict";

export interface UseGameResult {
  state: GameState;
  transport: LocalTransport;
  sendCommand: (command: GameCommand) => void;
  advanceWorld: (hours: number) => void;
  save: () => void;
  reload: () => void;
  restart: () => void;
  saveStatus: SaveStatus;
}

export function useGame(options: UseGameOptions = {}): UseGameResult {
  const [state, setState] = useState<GameState>(() => options.initialState ?? loadGame());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const stateRef = useRef(state);
  const sessionRef = useRef<GameSession | null>(options.session ?? null);
  const remoteSaveRevisionRef = useRef<number | null>(options.session?.saveRevision ?? null);
  const saveTimerRef = useRef<number | null>(null);
  const multiplayerClientRef = useRef<MultiplayerClient | null>(options.multiplayerClient ?? null);
  const multiplayerRoleRef = useRef<MultiplayerRole>(options.multiplayerRole ?? "idle");
  const multiplayerSnapshotSequenceRef = useRef(0);
  const lastRemoteSnapshotSequenceRef = useRef(0);
  const lastRoomPeerCountRef = useRef(0);
  const sentCommandSequenceRef = useRef(0);
  const seenRemoteCommandIdsRef = useRef(new Set<string>());
  const transport = useMemo(() => new LocalTransport(), []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    sessionRef.current = options.session ?? null;
    remoteSaveRevisionRef.current = options.session?.saveRevision ?? null;
  }, [options.session]);

  useEffect(() => {
    multiplayerClientRef.current = options.multiplayerClient ?? null;
  }, [options.multiplayerClient]);

  useEffect(() => {
    multiplayerRoleRef.current = options.multiplayerRole ?? "idle";
  }, [options.multiplayerRole]);

  const loadLatestRemoteSave = useCallback((session: GameSession) => {
    void loadRemoteGame(session)
      .then((remote) => {
        remoteSaveRevisionRef.current = remote.save?.revision ?? null;
        updateStoredGameSessionSaveRevision(remote.save?.revision ?? null, remote.save?.updatedAt ?? null);
        const nextState = remote.save?.state ?? createInitialState();
        saveGame(nextState);
        setState(nextState);
      })
      .catch((error) => {
        console.warn("Remote reload failed", error);
      });
  }, []);

  const persistState = useCallback((mode: "normal" | "beacon" = "normal") => {
    if (multiplayerRoleRef.current === "guest") {
      return;
    }

    const currentState = stateRef.current;
    const session = sessionRef.current;
    saveGame(currentState);

    if (!session || session.local) {
      return;
    }

    if (mode === "beacon") {
      saveRemoteGameBeacon(session, currentState, remoteSaveRevisionRef.current);
      return;
    }

    setSaveStatus("saving");
    void saveRemoteGame(session, currentState, remoteSaveRevisionRef.current)
      .then((result) => {
        remoteSaveRevisionRef.current = result.revision;
        sessionRef.current = {
          ...session,
          saveRevision: result.revision,
          saveUpdatedAt: result.updatedAt
        };
        setSaveStatus("saved");
        window.setTimeout(() => setSaveStatus((current) => (current === "saved" ? "idle" : current)), 1600);
      })
      .catch((error) => {
        if (error instanceof ApiError && error.code === "SAVE_CONFLICT") {
          console.warn("Remote save conflict; loading latest database save");
          setSaveStatus("conflict");
          loadLatestRemoteSave(session);
          window.setTimeout(() => setSaveStatus((current) => (current === "conflict" ? "idle" : current)), 2500);
          return;
        }

        // Don't lie that it saved: the cloud write failed, though local save persisted.
        console.warn("Remote save failed", error);
        setSaveStatus("offline");
      });
  }, [loadLatestRemoteSave]);

  useEffect(() => {
    if (options.multiplayerRole === "guest") {
      return;
    }

    saveGame(state);

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      persistState();
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [options.multiplayerRole, persistState, state]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      persistState("beacon");
    };

    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        persistState("beacon");
      }
    };

    window.addEventListener("beforeunload", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("beforeunload", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [persistState]);

  const applyCommand = useCallback(
    (command: GameCommand) => {
      setState((current) => {
        const result = reduceGameState(current, command);
        transport.emitEvents(result.events);
        transport.emitSnapshot(result.state);
        return result.state;
      });
    },
    [transport]
  );

  useEffect(() => {
    transport.connect(applyCommand);
  }, [applyCommand, transport]);

  useEffect(() => {
    const client = options.multiplayerClient;
    if (!client) {
      return;
    }

    return client.onGameMessage((message) => {
      if (message.type === "snapshot") {
        if (multiplayerRoleRef.current !== "guest" || message.sequence <= lastRemoteSnapshotSequenceRef.current) {
          return;
        }

        lastRemoteSnapshotSequenceRef.current = message.sequence;
        saveTimerRef.current && window.clearTimeout(saveTimerRef.current);
        setState(message.state);
        transport.emitSnapshot(message.state);
        return;
      }

      if (message.type !== "command" || multiplayerRoleRef.current !== "host" || seenRemoteCommandIdsRef.current.has(message.commandId)) {
        return;
      }

      seenRemoteCommandIdsRef.current.add(message.commandId);
      if (seenRemoteCommandIdsRef.current.size > 500) {
        seenRemoteCommandIdsRef.current = new Set([...seenRemoteCommandIdsRef.current].slice(-250));
      }
      transport.sendCommand(message.command);
    });
  }, [options.multiplayerClient, transport]);

  useEffect(() => {
    const client = options.multiplayerClient;
    if (!client) {
      return;
    }

    return client.onStatus((status) => {
      if (status.role !== "host" || !status.room) {
        lastRoomPeerCountRef.current = 0;
        return;
      }

      const peerCount = status.room.peers.length;
      if (peerCount === lastRoomPeerCountRef.current) {
        return;
      }

      lastRoomPeerCountRef.current = peerCount;
      client.sendGameMessage({
        sequence: ++multiplayerSnapshotSequenceRef.current,
        state: stateRef.current,
        type: "snapshot"
      });
    });
  }, [options.multiplayerClient]);

  useEffect(() => {
    const client = multiplayerClientRef.current;
    if (!client || multiplayerRoleRef.current !== "host" || !client.getStatus().room) {
      return;
    }

    client.sendGameMessage({
      sequence: ++multiplayerSnapshotSequenceRef.current,
      state,
      type: "snapshot"
    });
  }, [state]);

  const sendCommand = useCallback(
    (command: GameCommand) => {
      const client = multiplayerClientRef.current;
      if (multiplayerRoleRef.current === "guest" && client?.getStatus().room) {
        const commandId = `${client.getStatus().localPeer?.id ?? "guest"}_${Date.now()}_${++sentCommandSequenceRef.current}`;
        client.sendGameMessage({ command, commandId, type: "command" });
        return;
      }

      transport.sendCommand(command);
    },
    [transport]
  );

  const advanceWorld = useCallback(
    (hours: number) => {
      if (multiplayerRoleRef.current === "guest") {
        return;
      }

      setState((current) => {
        const timeResult = reduceGameState(current, { type: "advance_time", actorId: current.playerFactionId, hours });
        const npcCommands = planNpcCommands(timeResult.state);
        const npcResult = reduceCommands(timeResult.state, npcCommands);
        const allEvents = [...timeResult.events, ...npcResult.events];
        transport.emitEvents(allEvents);
        transport.emitSnapshot(npcResult.state);
        return npcResult.state;
      });
    },
    [transport]
  );

  const save = useCallback(() => {
    persistState();
  }, [persistState]);

  const reload = useCallback(() => {
    if (multiplayerRoleRef.current === "guest") {
      return;
    }

    const session = sessionRef.current;
    if (!session) {
      setState(loadGame());
      return;
    }

    loadLatestRemoteSave(session);
  }, [loadLatestRemoteSave]);

  const restart = useCallback(() => {
    if (multiplayerRoleRef.current === "guest") {
      return;
    }

    const nextState = createInitialState();
    clearSave();
    saveGame(nextState);
    setState(nextState);

    const session = sessionRef.current;
    if (session) {
      void saveRemoteGame(session, nextState, remoteSaveRevisionRef.current)
        .then((result) => {
          remoteSaveRevisionRef.current = result.revision;
        })
        .catch((error) => {
          console.warn("Remote reset save failed", error);
        });
    }
  }, []);

  return {
    state,
    transport,
    sendCommand,
    advanceWorld,
    save,
    reload,
    restart,
    saveStatus
  };
}
