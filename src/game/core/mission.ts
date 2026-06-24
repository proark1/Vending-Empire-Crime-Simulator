import type { GameState, LocationId, Vec2 } from "./types";
import { inventoryUnits, machineAtLocation, missionProgress, ownedMachines } from "./selectors";

export type MissionStepId = "buy_stock" | "stock_machine" | "repair_machine" | "collect_cash" | "install_second" | "install_third" | "stabilize" | "completed";

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

      if (a.placementCost !== b.placementCost && aAffordable === 1) {
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
  const cargoUnits = inventoryUnits(state.player.cargo, state);
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

  if (cargoUnits === 0 && !starterHasEverBeenStocked) {
    return {
      id: "buy_stock",
      title: "Get stock",
      objective: "Buy starter stock from Backdoor Supplier.",
      guidance: "Follow the yellow ping to the supplier and press E.",
      targetLocationId: "supplier",
      progressLabel: "Step 1 / 6",
      progressRatio: 1 / 6
    };
  }

  if (cargoUnits > 0 && !starterHasEverBeenStocked) {
    return {
      id: "stock_machine",
      title: "Load Rusty Starter",
      objective: "Stock your first vending machine at Foam & Fold.",
      guidance: "Follow the teal ping to Rusty Starter and press E.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 2 / 6",
      progressRatio: 2 / 6
    };
  }

  if (firstMachine.damage > 0) {
    return {
      id: "repair_machine",
      title: "Fix the asset",
      objective: "Repair Rusty Starter before rivals exploit it.",
      guidance: "Face the machine and press E to spend cash on repairs.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 3 / 6",
      progressRatio: 3 / 6
    };
  }

  if (playerMachines.length < 2 && hasAffordableOpenPlacement(state)) {
    return {
      id: "install_second",
      title: "Expand territory",
      objective: "Install a second machine at an open placement.",
      guidance: "Follow the green ping to a placement pad and press E.",
      targetLocationId: nearestOpenPlacement(state, playerPosition),
      progressLabel: "Step 5 / 6",
      progressRatio: 5 / 6
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
      progressRatio: Math.min(4 / 6, 3 / 6 + firstMachine.revenueStored / 150)
    };
  }

  if (playerMachines.length < 2) {
    return {
      id: "install_second",
      title: "Expand territory",
      objective: "Install a second machine at an open placement.",
      guidance: "Follow the green ping to a placement pad and press E.",
      targetLocationId: nearestOpenPlacement(state, playerPosition),
      progressLabel: "Step 5 / 6",
      progressRatio: 5 / 6
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
