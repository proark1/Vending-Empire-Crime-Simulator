import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameCommand, GameState } from "../game/core/types";
import { LocalTransport } from "../game/core/transport";
import { createInitialState } from "../game/content/initialState";
import { applyRunLegacy } from "../game/content/replayability";
import { loadGame, saveGame, clearSave } from "../game/save/storage";
import { ApiError, loadRemoteGame, saveRemoteGame, saveRemoteGameBeacon, updateStoredGameSessionSaveRevision, type GameSession } from "../game/save/api";
import { planNpcCommands } from "../game/ai/rivalAi";
import { reduceCommands, reduceGameState } from "../game/systems/reducer";
import type { MultiplayerClient } from "../game/network/multiplayerClient";
import type { MultiplayerRole } from "../game/network/protocol";
import { perfNow, recordPerfCount, recordPerfDuration, recordPerfGauge } from "../game/core/performance";

// Commands a co-op guest may never trigger on the host: cheat/debug commands and
// host/AI-only actions. Everything else is ordinary shared-empire play.
const GUEST_FORBIDDEN_COMMANDS = new Set<GameCommand["type"]>([
  "debug_grant_cash",
  "debug_complete_requirements",
  "debug_set_district_access",
  "debug_set_rival_pressure",
  "debug_spawn_activity",
  "rival_action",
  "execute_ending"
]);

function isGuestCommandAllowed(command: GameCommand): boolean {
  return !GUEST_FORBIDDEN_COMMANDS.has(command.type);
}

export interface UseGameOptions {
  initialState?: GameState;
  multiplayerClient?: MultiplayerClient | null;
  multiplayerRole?: MultiplayerRole;
  session?: GameSession | null;
}

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "conflict" | "error";

export interface UseGameResult {
  state: GameState;
  transport: LocalTransport;
  sendCommand: (command: GameCommand) => void;
  advanceWorld: (hours: number) => void;
  save: () => void;
  reload: () => void;
  restart: (seed?: number) => void;
  saveStatus: SaveStatus;
}

export function useGame(options: UseGameOptions = {}): UseGameResult {
  const [state, setState] = useState<GameState>(() => options.initialState ?? loadGame());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const stateRef = useRef(state);
  const sessionRef = useRef<GameSession | null>(options.session ?? null);
  const remoteSaveRevisionRef = useRef<number | null>(options.session?.saveRevision ?? null);
  const saveTimerRef = useRef<number | null>(null);
  const localSaveTimerRef = useRef<number | null>(null);
  const multiplayerClientRef = useRef<MultiplayerClient | null>(options.multiplayerClient ?? null);
  const multiplayerRoleRef = useRef<MultiplayerRole>(options.multiplayerRole ?? "idle");
  const multiplayerSnapshotSequenceRef = useRef(0);
  const hostSnapshotTimerRef = useRef<number | null>(null);
  const lastHostSnapshotAtRef = useRef(0);
  const lastRemoteSnapshotSequenceRef = useRef(0);
  const lastRoomPeerCountRef = useRef(0);
  const lastStateChangeKindRef = useRef<GameCommand["type"] | "remote_snapshot" | "restart" | "reload">("reload");
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

  const previousRoleRef = useRef<MultiplayerRole>(options.multiplayerRole ?? "idle");

  const persistLocalState = useCallback((currentState: GameState = stateRef.current): boolean => {
    const perfStart = perfNow();
    const result = saveGame(currentState);
    recordPerfDuration("save.local", perfNow() - perfStart);
    recordPerfGauge("save.local.bytes", result.bytes);
    if (!result.ok) {
      recordPerfCount("save.local.failed");
    }
    return result.ok;
  }, []);

  const sendHostSnapshot = useCallback(() => {
    const client = multiplayerClientRef.current;
    if (!client || multiplayerRoleRef.current !== "host" || !client.getStatus().room) {
      return;
    }

    const perfStart = perfNow();
    client.sendGameMessage({
      sequence: ++multiplayerSnapshotSequenceRef.current,
      state: stateRef.current,
      type: "snapshot"
    });
    lastHostSnapshotAtRef.current = perfNow();
    recordPerfDuration("multiplayer.snapshot.send", lastHostSnapshotAtRef.current - perfStart);
    recordPerfCount("multiplayer.snapshot.sent");
  }, []);

  const loadLatestRemoteSave = useCallback((session: GameSession) => {
    void loadRemoteGame(session)
      .then((remote) => {
        remoteSaveRevisionRef.current = remote.save?.revision ?? null;
        updateStoredGameSessionSaveRevision(remote.save?.revision ?? null, remote.save?.updatedAt ?? null);
        const nextState = remote.save?.state ?? createInitialState(Date.now());
        persistLocalState(nextState);
        lastStateChangeKindRef.current = "reload";
        setState(nextState);
      })
      .catch((error) => {
        console.warn("Remote reload failed", error);
      });
  }, [persistLocalState]);

  useEffect(() => {
    const previous = previousRoleRef.current;
    const current = options.multiplayerRole ?? "idle";
    previousRoleRef.current = current;

    // Leaving a co-op room (leave / room closed / socket drop all flip the role away
    // from "guest"). While a guest, the in-memory state was the host's world and
    // local persistence was suppressed, so localStorage still holds this player's own
    // pre-join save. Restore it before the persistence effect can write the host's
    // world over the guest's own local/cloud save.
    if (previous === "guest" && current !== "guest") {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (localSaveTimerRef.current) {
        window.clearTimeout(localSaveTimerRef.current);
        localSaveTimerRef.current = null;
      }
      lastStateChangeKindRef.current = "reload";
      setState(loadGame());
      const session = sessionRef.current;
      if (session && !session.local) {
        loadLatestRemoteSave(session);
      }
    }
  }, [loadLatestRemoteSave, options.multiplayerRole]);

  const persistState = useCallback((mode: "normal" | "beacon" = "normal", options: { saveLocal?: boolean } = {}) => {
    if (multiplayerRoleRef.current === "guest") {
      return;
    }

    const currentState = stateRef.current;
    const session = sessionRef.current;
    const localOk = options.saveLocal !== false ? persistLocalState(currentState) : true;

    if (!session || session.local) {
      // Pure-local player: the local write is the only copy, so a failure is worth
      // surfacing. For remote players we fall through and let the cloud save carry it.
      setSaveStatus(localOk ? (current) => (current === "error" ? "idle" : current) : "error");
      return;
    }

    if (mode === "beacon") {
      saveRemoteGameBeacon(session, currentState, remoteSaveRevisionRef.current);
      recordPerfCount("save.remote.beacon");
      return;
    }

    setSaveStatus("saving");
    const remoteSaveStart = perfNow();
    void saveRemoteGame(session, currentState, remoteSaveRevisionRef.current)
      .then((result) => {
        recordPerfDuration("save.remote", perfNow() - remoteSaveStart);
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
        recordPerfDuration("save.remote.failed", perfNow() - remoteSaveStart);
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
  }, [loadLatestRemoteSave, persistLocalState]);

  const saveDebounceForChange = useCallback((kind: GameCommand["type"] | "remote_snapshot" | "restart" | "reload"): { localMs: number; remoteMs: number } => {
    switch (kind) {
      case "drive_vehicle":
        return { localMs: 1600, remoteMs: 6000 };
      case "set_player_location":
        return { localMs: 1200, remoteMs: 4500 };
      case "advance_time":
        return { localMs: 900, remoteMs: 2600 };
      case "remote_snapshot":
        return { localMs: 1200, remoteMs: 0 };
      default:
        return { localMs: 250, remoteMs: 900 };
    }
  }, []);

  useEffect(() => {
    if (options.multiplayerRole === "guest") {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (localSaveTimerRef.current) {
      window.clearTimeout(localSaveTimerRef.current);
    }

    const debounce = saveDebounceForChange(lastStateChangeKindRef.current);

    localSaveTimerRef.current = window.setTimeout(() => {
      localSaveTimerRef.current = null;
      const ok = persistLocalState();
      if (!sessionRef.current || sessionRef.current.local) {
        setSaveStatus(ok ? (current) => (current === "error" ? "idle" : current) : "error");
      }
    }, debounce.localMs);

    if (debounce.remoteMs > 0) {
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        persistState("normal", { saveLocal: false });
      }, debounce.remoteMs);
    }

    return () => {
      if (localSaveTimerRef.current) {
        window.clearTimeout(localSaveTimerRef.current);
        localSaveTimerRef.current = null;
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [options.multiplayerRole, persistLocalState, persistState, saveDebounceForChange, state]);

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
        lastStateChangeKindRef.current = command.type;
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

    return client.onGameMessage((message, fromPeerId) => {
      if (message.type === "snapshot") {
        // Only the room host authors world state. Ignore any snapshot that did not
        // come from the host peer so a malicious guest can't forge a high-sequence
        // snapshot straight into another player and hijack their game.
        const hostPeerId = client.getStatus().room?.hostPeerId;
        if (multiplayerRoleRef.current !== "guest" || fromPeerId !== hostPeerId || message.sequence <= lastRemoteSnapshotSequenceRef.current) {
          return;
        }

        lastRemoteSnapshotSequenceRef.current = message.sequence;
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        if (localSaveTimerRef.current) {
          window.clearTimeout(localSaveTimerRef.current);
          localSaveTimerRef.current = null;
        }
        lastStateChangeKindRef.current = "remote_snapshot";
        setState(message.state);
        transport.emitSnapshot(message.state);
        return;
      }

      if (message.type !== "command" || multiplayerRoleRef.current !== "host" || seenRemoteCommandIdsRef.current.has(message.commandId)) {
        return;
      }

      // The host runs the authoritative reducer, so a guest's relayed command is
      // untrusted input. Drop cheat/AI-only commands outright and force the actor to
      // the shared player faction so a modified guest can't grant itself cash,
      // execute an ending, or act as a rival.
      if (!isGuestCommandAllowed(message.command)) {
        return;
      }

      seenRemoteCommandIdsRef.current.add(message.commandId);
      if (seenRemoteCommandIdsRef.current.size > 500) {
        seenRemoteCommandIdsRef.current = new Set([...seenRemoteCommandIdsRef.current].slice(-250));
      }
      transport.sendCommand({ ...message.command, actorId: stateRef.current.playerFactionId });
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
      sendHostSnapshot();
    });
  }, [options.multiplayerClient, sendHostSnapshot]);

  useEffect(() => {
    const client = multiplayerClientRef.current;
    if (!client || multiplayerRoleRef.current !== "host" || !client.getStatus().room) {
      return;
    }

    const now = perfNow();
    const elapsed = now - lastHostSnapshotAtRef.current;
    const delay = Math.max(0, 500 - elapsed);
    if (delay <= 0) {
      sendHostSnapshot();
      return;
    }

    if (hostSnapshotTimerRef.current === null) {
      hostSnapshotTimerRef.current = window.setTimeout(() => {
        hostSnapshotTimerRef.current = null;
        sendHostSnapshot();
      }, delay);
      recordPerfCount("multiplayer.snapshot.deferred");
    }
  }, [sendHostSnapshot, state]);

  useEffect(() => {
    return () => {
      if (localSaveTimerRef.current) {
        window.clearTimeout(localSaveTimerRef.current);
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (hostSnapshotTimerRef.current) {
        window.clearTimeout(hostSnapshotTimerRef.current);
      }
    };
  }, []);

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
        lastStateChangeKindRef.current = "advance_time";
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
      lastStateChangeKindRef.current = "reload";
      setState(loadGame());
      return;
    }

    loadLatestRemoteSave(session);
  }, [loadLatestRemoteSave]);

  const restart = useCallback((seed?: number) => {
    if (multiplayerRoleRef.current === "guest") {
      return;
    }

    // A caller (e.g. the ending screen's "next run preview") can pass the seed it
    // showed so the new run gets exactly the previewed modifier instead of a
    // different one from a fresh Date.now() seed.
    const nextState = createInitialState(typeof seed === "number" && Number.isFinite(seed) ? seed : Date.now());
    // New Game Plus: carry the finished run's unlocks/grudges into the fresh run.
    applyRunLegacy(nextState, stateRef.current);
    clearSave();
    persistLocalState(nextState);
    lastStateChangeKindRef.current = "restart";
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
  }, [persistLocalState]);

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
