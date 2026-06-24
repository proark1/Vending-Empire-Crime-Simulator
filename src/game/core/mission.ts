import type { GameState, LocationId, Vec2 } from "./types";
import { carriedCrateUnits, garageStorageUnits, machineAtLocation, missionProgress, ownedMachines, totalOwnedStockUnits } from "./selectors";

export type MissionStepId =
  | "buy_stock"
  | "deposit_stock"
  | "load_crate"
  | "stock_machine"
  | "repair_machine"
  | "collect_cash"
  | "install_second"
  | "install_third"
  | "stabilize"
  | "completed";

export interface MissionStep {
  id: MissionStepId;
  title: string;
  objective: string;
  guidance: string;
  targetLocationId?: LocationId;
  progressLabel: string;
  progressRatio: number;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestOpenPlacement(state: GameState, from: Vec2): LocationId | undefined {
  const playerMoney = state.factions[state.playerFactionId].money;

  return Object.values(state.locations)
    .filter((location) => location.kind !== "garage" && location.kind !== "supplier")
    .filter((location) => !machineAtLocation(state, location.id))
    .sort((a, b) => {
      const aAffordable = a.placementCost <= playerMoney ? 0 : 1;
      const bAffordable = b.placementCost <= playerMoney ? 0 : 1;
      if (aAffordable !== bAffordable) {
        return aAffordable - bAffordable;
      }

      if (a.placementCost !== b.placementCost && aAffordable === bAffordable) {
        return a.placementCost - b.placementCost;
      }

      return distance(a.position, from) - distance(b.position, from);
    })[0]?.id;
}

function hasAffordableOpenPlacement(state: GameState): boolean {
  const playerMoney = state.factions[state.playerFactionId].money;
  return Object.values(state.locations)
    .filter((location) => location.kind !== "garage" && location.kind !== "supplier")
    .filter((location) => !machineAtLocation(state, location.id))
    .some((location) => location.placementCost <= playerMoney);
}

export function getStarterMissionStep(state: GameState, playerPosition: Vec2): MissionStep {
  const firstMachine = state.machines.machine_player_1;
  const playerMachines = ownedMachines(state, state.playerFactionId);
  const carriedUnits = carriedCrateUnits(state);
  const storageUnits = garageStorageUnits(state);
  const stockUnits = totalOwnedStockUnits(state);
  const starterStock = firstMachine.slots.reduce((sum, slot) => sum + slot.quantity, 0);
  const starterHasEverBeenStocked = firstMachine.slots.length > 0;
  const progress = missionProgress(state);

  if (state.mission.completed) {
    return {
      id: "completed",
      title: "District claimed",
      objective: "Cinderblock Row is yours.",
      guidance: "Keep machines stocked and watch for Redline retaliation.",
      progressLabel: "Starter district complete",
      progressRatio: 1
    };
  }

  if (stockUnits === 0 && !starterHasEverBeenStocked) {
    return {
      id: "buy_stock",
      title: "Get stock",
      objective: "Pick up a starter crate from Backdoor Supplier.",
      guidance: "Follow the yellow ping to the supplier and press E to buy one crate.",
      targetLocationId: "supplier",
      progressLabel: "Step 1 / 8",
      progressRatio: 1 / 8
    };
  }

  if (carriedUnits > 0 && state.player.carriedCrate?.source === "supplier" && !starterHasEverBeenStocked) {
    return {
      id: "deposit_stock",
      title: "Build the route",
      objective: "Store the supplier crate at your garage.",
      guidance: "Carry the crate to Storage Garage and press E to stash it.",
      targetLocationId: "garage",
      progressLabel: "Step 2 / 8",
      progressRatio: 2 / 8
    };
  }

  if (carriedUnits === 0 && storageUnits > 0 && !starterHasEverBeenStocked) {
    return {
      id: "load_crate",
      title: "Load out",
      objective: "Take one crate from garage storage.",
      guidance: "Face Storage Garage and press E to carry a crate for the route.",
      targetLocationId: "garage",
      progressLabel: "Step 3 / 8",
      progressRatio: 3 / 8
    };
  }

  if (carriedUnits > 0 && !starterHasEverBeenStocked) {
    return {
      id: "stock_machine",
      title: "Load Rusty Starter",
      objective: "Stock your first vending machine at Foam & Fold.",
      guidance: "Carry the crate to Rusty Starter and press E to load it.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 4 / 8",
      progressRatio: 4 / 8
    };
  }

  if (firstMachine.damage > 0) {
    return {
      id: "repair_machine",
      title: "Fix the asset",
      objective: "Repair Rusty Starter before rivals exploit it.",
      guidance: "Face the machine and press E to spend cash on repairs.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 5 / 8",
      progressRatio: 5 / 8
    };
  }

  if (playerMachines.length < 2 && hasAffordableOpenPlacement(state)) {
    return {
      id: "install_second",
      title: "Expand territory",
      objective: "Install a second machine at an open placement.",
      guidance: "Follow the green ping to a placement pad and press E.",
      targetLocationId: nearestOpenPlacement(state, playerPosition),
      progressLabel: "Step 7 / 8",
      progressRatio: 7 / 8
    };
  }

  if (firstMachine.revenueStored < 25 && playerMachines.length < 2) {
    return {
      id: "collect_cash",
      title: "First cash run",
      objective: "Let Rusty Starter earn $25, then collect it.",
      guidance: "Stay close to the machine or scout the block while revenue builds.",
      targetLocationId: firstMachine.locationId,
      progressLabel: `$${Math.round(firstMachine.revenueStored)} / $25 stored`,
      progressRatio: Math.min(6 / 8, 5 / 8 + firstMachine.revenueStored / 200)
    };
  }

  if (playerMachines.length < 2) {
    return {
      id: "install_second",
      title: "Expand territory",
      objective: "Install a second machine at an open placement.",
      guidance: "Follow the green ping to a placement pad and press E.",
      targetLocationId: nearestOpenPlacement(state, playerPosition),
      progressLabel: "Step 7 / 8",
      progressRatio: 7 / 8
    };
  }

  if (playerMachines.length < 3) {
    return {
      id: "install_third",
      title: "Pressure Redline",
      objective: "Claim one more location before Redline expands.",
      guidance: "Use the next green ping to reach a third machine site.",
      targetLocationId: nearestOpenPlacement(state, playerPosition),
      progressLabel: `${playerMachines.length} / 3 machines`,
      progressRatio: Math.min(0.96, playerMachines.length / 3)
    };
  }

  return {
    id: "stabilize",
    title: "Stabilize the route",
    objective: "Keep all three machines stocked and profitable.",
    guidance: "Collect stored cash and top off empty stock slots.",
    targetLocationId: playerMachines.find((machine) => machine.revenueStored > 0 || machine.slots.some((slot) => slot.quantity === 0))?.locationId,
    progressLabel: `${progress.profitableCount} / ${progress.target} profitable`,
    progressRatio: Math.min(0.98, progress.profitableCount / progress.target)
  };
}
