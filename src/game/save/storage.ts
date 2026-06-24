import type { GameState } from "../core/types";
import { createInitialState } from "../content/initialState";

const SAVE_KEY = "vendetta-vending.save.v1";

export function loadGame(): GameState {
  const raw = window.localStorage.getItem(SAVE_KEY);
  if (!raw) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== 1) {
      return createInitialState();
    }
    return parsed;
  } catch {
    return createInitialState();
  }
}

export function saveGame(state: GameState): void {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearSave(): void {
  window.localStorage.removeItem(SAVE_KEY);
}
