import type { GameState } from "../core/types";
import { createInitialState } from "../content/initialState";

const SAVE_KEY = "vendetta-vending.save.v1";

function migrateGameState(parsed: GameState): GameState {
  const baseline = createInitialState();
  if (parsed.version !== baseline.version) {
    return baseline;
  }

  return {
    ...baseline,
    ...parsed,
    products: {
      ...baseline.products,
      ...parsed.products
    },
    districts: {
      ...baseline.districts,
      ...parsed.districts
    },
    locations: {
      ...baseline.locations,
      ...parsed.locations
    },
    factions: {
      ...baseline.factions,
      ...parsed.factions
    },
    npcControllers: {
      ...baseline.npcControllers,
      ...parsed.npcControllers
    },
    machines: Object.fromEntries(
      Object.entries(parsed.machines ?? baseline.machines).map(([machineId, machine]) => [
        machineId,
        {
          ...machine,
          upgrades: Array.isArray(machine.upgrades) ? machine.upgrades : []
        }
      ])
    )
  };
}

export function loadGame(): GameState {
  const raw = window.localStorage.getItem(SAVE_KEY);
  if (!raw) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(raw) as GameState;
    return migrateGameState(parsed);
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
