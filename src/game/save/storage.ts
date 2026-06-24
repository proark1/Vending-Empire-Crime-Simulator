import type { GameState } from "../core/types";
import { createInitialState } from "../content/initialState";

const SAVE_KEY = "vendetta-vending.save.v1";

function migrateGameState(parsed: GameState): GameState {
  const baseline = createInitialState();
  if (parsed.version !== baseline.version) {
    return baseline;
  }

  const parsedPlayer = (parsed.player ?? baseline.player) as Partial<GameState["player"]>;
  const parsedPlayerRecord = parsedPlayer as Record<string, unknown>;
  const isLegacyLogistics = !("garageStorage" in parsedPlayerRecord) && !("carriedCrate" in parsedPlayerRecord);
  const garageStorage = isLegacyLogistics
    ? {
        ...baseline.player.garageStorage,
        ...(parsedPlayer.cargo ?? {})
      }
    : {
        ...baseline.player.garageStorage,
        ...(parsedPlayer.garageStorage ?? {})
      };

  return {
    ...baseline,
    ...parsed,
    nextEmployeeNumber: parsed.nextEmployeeNumber ?? baseline.nextEmployeeNumber,
    player: {
      ...baseline.player,
      ...parsedPlayer,
      activeVehicleId: parsedPlayer.activeVehicleId ?? baseline.player.activeVehicleId,
      currentLocationId: parsedPlayer.currentLocationId ?? baseline.player.currentLocationId,
      cargo: isLegacyLogistics ? {} : parsedPlayer.cargo ?? {},
      cargoCapacity: isLegacyLogistics ? baseline.player.cargoCapacity : parsedPlayer.cargoCapacity ?? baseline.player.cargoCapacity,
      carriedCrate: parsedPlayer.carriedCrate ?? null,
      garageStorage,
      garageCapacity: parsedPlayer.garageCapacity ?? baseline.player.garageCapacity
    },
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
    streetLife: {
      ...baseline.streetLife,
      ...(parsed.streetLife ?? {}),
      recentActivities: Array.isArray(parsed.streetLife?.recentActivities) ? parsed.streetLife.recentActivities : baseline.streetLife.recentActivities
    },
    machines: Object.fromEntries(
      Object.entries(parsed.machines ?? baseline.machines).map(([machineId, machine]) => [
        machineId,
        {
          ...machine,
          upgrades: Array.isArray(machine.upgrades) ? machine.upgrades : []
        }
      ])
    ),
    vehicles: Object.fromEntries(
      Object.entries({
        ...baseline.vehicles,
        ...(parsed.vehicles ?? {})
      }).map(([vehicleId, vehicle]) => [
        vehicleId,
        {
          ...vehicle,
          inventory: vehicle.inventory ?? {}
        }
      ])
    ),
    employees: parsed.employees ?? baseline.employees,
    routePlan: {
      ...baseline.routePlan,
      ...(parsed.routePlan ?? {})
    },
    contracts: {
      ...baseline.contracts,
      ...(parsed.contracts ?? {})
    },
    dayReports: parsed.dayReports ?? baseline.dayReports,
    progression: {
      ...baseline.progression,
      ...(parsed.progression ?? {})
    }
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
