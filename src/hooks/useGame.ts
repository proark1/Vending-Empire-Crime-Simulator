import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameCommand, GameState } from "../game/core/types";
import { LocalTransport } from "../game/core/transport";
import { createInitialState } from "../game/content/initialState";
import { loadGame, saveGame, clearSave } from "../game/save/storage";
import { loadRemoteGame, saveRemoteGame, saveRemoteGameBeacon, type GameSession } from "../game/save/api";
import { planNpcCommands } from "../game/ai/rivalAi";
import { reduceCommands, reduceGameState } from "../game/systems/reducer";

export interface UseGameOptions {
  initialState?: GameState;
  session?: GameSession | null;
}

export interface UseGameResult {
  state: GameState;
  transport: LocalTransport;
  sendCommand: (command: GameCommand) => void;
  advanceWorld: (hours: number) => void;
  save: () => void;
  reload: () => void;
  restart: () => void;
}

export function useGame(options: UseGameOptions = {}): UseGameResult {
  const [state, setState] = useState<GameState>(() => options.initialState ?? loadGame());
  const stateRef = useRef(state);
  const sessionRef = useRef<GameSession | null>(options.session ?? null);
  const saveTimerRef = useRef<number | null>(null);
  const transport = useMemo(() => new LocalTransport(), []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    sessionRef.current = options.session ?? null;
  }, [options.session]);

  const persistState = useCallback((mode: "normal" | "beacon" = "normal") => {
    const currentState = stateRef.current;
    const session = sessionRef.current;
    saveGame(currentState);

    if (!session) {
      return;
    }

    if (mode === "beacon") {
      saveRemoteGameBeacon(session, currentState);
      return;
    }

    void saveRemoteGame(session, currentState).catch((error) => {
      console.warn("Remote save failed", error);
    });
  }, []);

  useEffect(() => {
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
  }, [persistState, state]);

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

  const sendCommand = useCallback(
    (command: GameCommand) => {
      transport.sendCommand(command);
    },
    [transport]
  );

  const advanceWorld = useCallback(
    (hours: number) => {
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
    const session = sessionRef.current;
    if (!session) {
      setState(loadGame());
      return;
    }

    void loadRemoteGame(session)
      .then((remote) => {
        setState(remote.save?.state ?? loadGame());
      })
      .catch(() => {
        setState(loadGame());
      });
  }, []);

  const restart = useCallback(() => {
    const nextState = createInitialState();
    clearSave();
    saveGame(nextState);
    setState(nextState);

    const session = sessionRef.current;
    if (session) {
      void saveRemoteGame(session, nextState).catch((error) => {
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
    restart
  };
}
