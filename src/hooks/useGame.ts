import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameCommand, GameState } from "../game/core/types";
import { LocalTransport } from "../game/core/transport";
import { createInitialState } from "../game/content/initialState";
import { loadGame, saveGame, clearSave } from "../game/save/storage";
import { planNpcCommands } from "../game/ai/rivalAi";
import { reduceCommands, reduceGameState } from "../game/systems/reducer";

export interface UseGameResult {
  state: GameState;
  transport: LocalTransport;
  sendCommand: (command: GameCommand) => void;
  advanceWorld: (hours: number) => void;
  save: () => void;
  reload: () => void;
  restart: () => void;
}

export function useGame(): UseGameResult {
  const [state, setState] = useState<GameState>(() => loadGame());
  const stateRef = useRef(state);
  const transport = useMemo(() => new LocalTransport(), []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
    saveGame(stateRef.current);
  }, []);

  const reload = useCallback(() => {
    setState(loadGame());
  }, []);

  const restart = useCallback(() => {
    clearSave();
    setState(createInitialState());
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
