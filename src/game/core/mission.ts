import type { GameState, LocationId, Vec2 } from "./types";
import {
  activeAlarmForMachine,
  carriedCrateUnits,
  districtUnlockInfo,
  garageStorageUnits,
  installedMachines,
  installableLocation,
  isDistrictUnlockedForPlacement,
  machineAtLocation,
  missionProgress,
  placementCostForLocation,
  totalOwnedStockUnits
} from "./selectors";

export type MissionStepId =
  | "repair_starter"
  | "install_laundromat"
  | "buy_stock"
  | "deposit_stock"
  | "load_crate"
  | "stock_machine"
  | "repair_machine"
  | "collect_cash"
  | "answer_undercut"
  | "answer_retaliation"
  | "respond_undercut"
  | "install_second"
  | "install_third"
  | "scout_industrial"
  | "open_industrial"
  | "earn_expansion_cash"
  | "install_industrial"
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

export interface TutorialStep {
  id: string;
  label: string;
  completed: boolean;
  active: boolean;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestOpenPlacement(state: GameState, from: Vec2): LocationId | undefined {
  const playerMoney = state.factions[state.playerFactionId].money;

  return Object.values(state.locations)
    .filter(installableLocation)
    .filter((location) => isDistrictUnlockedForPlacement(state, location.districtId))
    .filter((location) => !machineAtLocation(state, location.id))
    .sort((a, b) => {
      const aCost = placementCostForLocation(state, a);
      const bCost = placementCostForLocation(state, b);
      const aAffordable = aCost <= playerMoney ? 0 : 1;
      const bAffordable = bCost <= playerMoney ? 0 : 1;
      if (aAffordable !== bAffordable) {
        return aAffordable - bAffordable;
      }

      if (aCost !== bCost && aAffordable === bAffordable) {
        return aCost - bCost;
      }

      return distance(a.position, from) - distance(b.position, from);
    })[0]?.id;
}

function hasAffordableOpenPlacement(state: GameState): boolean {
  const playerMoney = state.factions[state.playerFactionId].money;
  return Object.values(state.locations)
    .filter(installableLocation)
    .filter((location) => isDistrictUnlockedForPlacement(state, location.districtId))
    .filter((location) => !machineAtLocation(state, location.id))
    .some((location) => placementCostForLocation(state, location) <= playerMoney);
}

function playerOwnsMachineInDistrict(state: GameState, districtId: string): boolean {
  return installedMachines(state, state.playerFactionId).some((machine) => state.locations[machine.locationId]?.districtId === districtId);
}

function highestStoredRevenueLocation(state: GameState): LocationId | undefined {
  return installedMachines(state, state.playerFactionId)
    .slice()
    .sort((a, b) => b.revenueStored - a.revenueStored)[0]?.locationId;
}

export function getStarterTutorialSteps(state: GameState): TutorialStep[] {
  const firstMachine = state.machines.machine_player_1;
  const starterInstalled = (firstMachine.placementStatus ?? "installed") === "installed";
  const starterHasEverBeenStocked = firstMachine.slots.length > 0;
  const carriedUnits = carriedCrateUnits(state);
  const storageUnits = garageStorageUnits(state);
  const stockUnits = totalOwnedStockUnits(state);
  const playerMachines = installedMachines(state, state.playerFactionId);
  const firstCashCollected = state.progression.revenueCollectedToday > 0 || playerMachines.length > 1 || state.mission.completed;
  const carryingGarageCrate = carriedUnits > 0 && state.player.carriedCrate?.source === "garage";

  const steps = [
    {
      id: "repair",
      label: "Repair Rusty Starter in Storage Garage",
      completed: starterInstalled || firstMachine.damage <= 0
    },
    {
      id: "place",
      label: "Install it at Foam & Fold",
      completed: starterInstalled
    },
    {
      id: "buy",
      label: "Buy a stock crate from Backdoor Supplier",
      completed: stockUnits > 0 || starterHasEverBeenStocked
    },
    {
      id: "store",
      label: "Store supplier stock at the garage",
      completed: storageUnits > 0 || carryingGarageCrate || starterHasEverBeenStocked
    },
    {
      id: "load",
      label: "Carry a garage crate to the machine",
      completed: carryingGarageCrate || starterHasEverBeenStocked
    },
    {
      id: "stock",
      label: "Stock Rusty Starter and wait for sales",
      completed: starterHasEverBeenStocked
    },
    {
      id: "collect",
      label: "Collect first cash, then expand",
      completed: firstCashCollected
    }
  ];
  const activeIndex = Math.max(0, steps.findIndex((step) => !step.completed));

  return steps.map((step, index) => ({
    ...step,
    active: index === activeIndex && !step.completed
  }));
}

export function getStarterMissionStep(state: GameState, playerPosition: Vec2): MissionStep {
  const firstMachine = state.machines.machine_player_1;
  const playerMachines = installedMachines(state, state.playerFactionId);
  const carriedUnits = carriedCrateUnits(state);
  const storageUnits = garageStorageUnits(state);
  const stockUnits = totalOwnedStockUnits(state);
  const starterStock = firstMachine.slots.reduce((sum, slot) => sum + slot.quantity, 0);
  const starterHasEverBeenStocked = firstMachine.slots.length > 0;
  const starterInstalled = (firstMachine.placementStatus ?? "installed") === "installed";
  const starterAlarm = activeAlarmForMachine(state, firstMachine.id);
  const progress = missionProgress(state);
  const industrialInfo = districtUnlockInfo(state, "industrial_yards");
  const freightDepot = state.locations.freight_depot;
  const freightCost = freightDepot ? placementCostForLocation(state, freightDepot) : 0;
  const playerMoney = state.factions[state.playerFactionId].money;

  if (state.mission.completed && industrialInfo.progress.access === "locked") {
    return {
      id: "scout_industrial",
      title: "Scout Iron Yard",
      objective: "Map Iron Yard and prepare the first expansion route.",
      guidance: "Follow the orange ping to Freight Depot and press E to scout the district.",
      targetLocationId: "freight_depot",
      progressLabel: "Expansion step 1 / 3",
      progressRatio: 0.82
    };
  }

  if (state.mission.completed && industrialInfo.progress.access === "scouted" && industrialInfo.unmetRequirements.length > 0) {
    return {
      id: "open_industrial",
      title: "Build leverage",
      objective: `Finish Iron Yard requirements: ${industrialInfo.unmetRequirements.join(", ")}.`,
      guidance: "Complete route promises and keep starter machines running until Iron Yard is ready.",
      targetLocationId: highestStoredRevenueLocation(state) ?? firstMachine.locationId,
      progressLabel: "Expansion requirements",
      progressRatio: 0.86
    };
  }

  if (state.mission.completed && industrialInfo.progress.access === "scouted") {
    const district = state.districts.industrial_yards;
    if (district && playerMoney < district.unlockCost) {
      return {
        id: "earn_expansion_cash",
        title: "Raise opening cash",
        objective: `Save $${district.unlockCost} to open Iron Yard.`,
        guidance: "Collect stored cash, complete active jobs, then return to Freight Depot.",
        targetLocationId: highestStoredRevenueLocation(state) ?? firstMachine.locationId,
        progressLabel: `$${Math.round(playerMoney)} / $${district.unlockCost}`,
        progressRatio: Math.min(0.9, 0.86 + playerMoney / Math.max(1, district.unlockCost) * 0.04)
      };
    }

    return {
      id: "open_industrial",
      title: "Open Iron Yard",
      objective: "Pay the local setup cost and unlock Iron Yard pads.",
      guidance: "Face the Freight Depot pad and press E to open the district.",
      targetLocationId: "freight_depot",
      progressLabel: "Expansion step 2 / 3",
      progressRatio: 0.9
    };
  }

  if (state.mission.completed && !playerOwnsMachineInDistrict(state, "industrial_yards")) {
    if (freightDepot && playerMoney < freightCost) {
      return {
        id: "earn_expansion_cash",
        title: "Fund the first yard unit",
        objective: `Save $${freightCost} to place the first Iron Yard machine.`,
        guidance: "Collect from starter machines, then return to the Freight Depot pad.",
        targetLocationId: highestStoredRevenueLocation(state) ?? firstMachine.locationId,
        progressLabel: `$${Math.round(playerMoney)} / $${freightCost}`,
        progressRatio: Math.min(0.95, 0.9 + playerMoney / Math.max(1, freightCost) * 0.05)
      };
    }

    return {
      id: "install_industrial",
      title: "Plant the first yard unit",
      objective: "Install a machine in Iron Yard.",
      guidance: "Use the Freight Depot placement pad to establish the new route.",
      targetLocationId: "freight_depot",
      progressLabel: "Expansion step 3 / 3",
      progressRatio: 0.95
    };
  }

  if (state.mission.completed) {
    return {
      id: "completed",
      title: "Iron Yard foothold",
      objective: "The first expansion route is active.",
      guidance: "Keep machines stocked and watch for Redline retaliation across both districts.",
      progressLabel: "Expansion route online",
      progressRatio: 1
    };
  }

  if (!starterInstalled && firstMachine.damage > 0) {
    return {
      id: "repair_starter",
      title: "Repair Rusty Starter",
      objective: "Use the starter cash to fix the machine in your garage.",
      guidance: "Face Storage Garage and press E to repair Rusty Starter.",
      targetLocationId: "garage",
      progressLabel: "Step 1 / 10",
      progressRatio: 1 / 10
    };
  }

  if (!starterInstalled) {
    return {
      id: "install_laundromat",
      title: "Place at Foam & Fold",
      objective: "Install Rusty Starter at the laundromat.",
      guidance: "Follow the green ping to Foam & Fold and choose a placement method.",
      targetLocationId: "laundromat",
      progressLabel: "Step 2 / 10",
      progressRatio: 2 / 10
    };
  }

  if (starterAlarm?.kind === "undercut") {
    return {
      id: "answer_undercut",
      title: "Stop Redline's undercut",
      objective: "Confront the undercut crew before the laundromat route loses ground.",
      guidance: "Get to Foam & Fold and press E at Rusty Starter before the alarm expires.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 8 / 10",
      progressRatio: 8 / 10
    };
  }

  if (starterAlarm?.kind === "sabotage") {
    return {
      id: "answer_retaliation",
      title: "Survive retaliation",
      objective: "Stop Redline's retaliation at Rusty Starter.",
      guidance: "Get to Foam & Fold and press E to fight the intruder.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 9 / 10",
      progressRatio: 9 / 10
    };
  }

  if (state.progression.firstUndercutTriggered && !state.progression.firstRetaliationTriggered) {
    return {
      id: "respond_undercut",
      title: "Retaliate or hold legal",
      objective: "Answer Redline's price pressure without losing the route.",
      guidance: "Hit Redline's corner unit for street rep, or keep the laundromat clean and wait out the pressure.",
      targetLocationId: "rival_corner",
      progressLabel: "Step 8 / 10",
      progressRatio: 8 / 10
    };
  }

  if (stockUnits === 0 && !starterHasEverBeenStocked) {
    return {
      id: "buy_stock",
      title: "Get stock",
      objective: "Pick up a starter crate from Backdoor Supplier.",
      guidance: "Follow the yellow ping to the supplier and press E to buy an affordable starter crate.",
      targetLocationId: "supplier",
      progressLabel: "Step 3 / 10",
      progressRatio: 3 / 10
    };
  }

  if (carriedUnits > 0 && state.player.carriedCrate?.source === "supplier" && !starterHasEverBeenStocked) {
    return {
      id: "deposit_stock",
      title: "Build the route",
      objective: "Store the supplier crate at your garage.",
      guidance: "Carry the crate to Storage Garage and press E to stash it.",
      targetLocationId: "garage",
      progressLabel: "Step 4 / 10",
      progressRatio: 4 / 10
    };
  }

  if (carriedUnits === 0 && storageUnits > 0 && !starterHasEverBeenStocked) {
    return {
      id: "load_crate",
      title: "Load out",
      objective: "Take one crate from garage storage.",
      guidance: "Face Storage Garage and press E to carry a crate for the route.",
      targetLocationId: "garage",
      progressLabel: "Step 5 / 10",
      progressRatio: 5 / 10
    };
  }

  if (carriedUnits > 0 && !starterHasEverBeenStocked) {
    return {
      id: "stock_machine",
      title: "Load Rusty Starter",
      objective: "Stock your first vending machine at Foam & Fold.",
      guidance: "Carry the crate to Rusty Starter and press E to load it.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 6 / 10",
      progressRatio: 6 / 10
    };
  }

  if (firstMachine.damage > 0) {
    return {
      id: "repair_machine",
      title: "Fix the asset",
      objective: "Repair Rusty Starter before rivals exploit it.",
      guidance: "Face the machine and press E to spend cash on repairs.",
      targetLocationId: firstMachine.locationId,
      progressLabel: "Step 7 / 10",
      progressRatio: 7 / 10
    };
  }

  if (playerMachines.length < 2 && hasAffordableOpenPlacement(state)) {
    return {
      id: "install_second",
      title: "Expand territory",
      objective: "Install a second machine at an open placement.",
      guidance: "Follow the green ping to a placement pad and press E.",
      targetLocationId: nearestOpenPlacement(state, playerPosition),
      progressLabel: "Step 10 / 10",
      progressRatio: 0.9
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
      progressRatio: Math.min(7.5 / 10, 7 / 10 + firstMachine.revenueStored / 250)
    };
  }

  if (playerMachines.length < 2) {
    return {
      id: "install_second",
      title: "Expand territory",
      objective: "Install a second machine at an open placement.",
      guidance: "Follow the green ping to a placement pad and press E.",
      targetLocationId: nearestOpenPlacement(state, playerPosition),
      progressLabel: "Step 10 / 10",
      progressRatio: 0.9
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
