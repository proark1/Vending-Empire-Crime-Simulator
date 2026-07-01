import { activeRunModifier, machineTraitDefinitions, type MachineTraitDefinition } from "../game/content/replayability";
import type { GameState, Product, ProductId, Vec2, VendingMachine } from "../game/core/types";
import { getStarterMissionStep } from "../game/core/mission";
import {
  activeConflictEvents,
  activeLawInspections,
  activeMachineAlarms,
  activeVehicle,
  contractRemainingQuantity,
  currentProductCost,
  garageStorageUnits,
  installedMachines,
  machineStockUnits,
  optimizedRoutePlan,
  placementCostForLocation,
  playerHeatTier,
  routeTasks,
  selectedRouteTask,
  totalOwnedStockUnits,
  type RouteTask
} from "../game/core/selectors";

export interface CurrentJobCopy {
  detail: string;
  guidance: string;
  payoff: string;
  progressLabel: string;
  risk: string;
  targetLabel: string;
  title: string;
  tone: "good" | "warning" | "danger";
}

export interface RouteDecisionCopy {
  cost: string;
  payoff: string;
  risk: string;
  when: string;
}

export interface ProductTradeoff {
  product: Product;
  cost: number;
  label: string;
  payoff: string;
  risk: string;
  tone: "good" | "warning" | "danger";
}

export interface HeatForecast {
  action: string;
  detail: string;
  label: string;
  tone: "good" | "warning" | "danger";
}

export interface RecoveryNote {
  action: string;
  detail: string;
  title: string;
  tone: "good" | "warning" | "danger";
}

function targetLabelForTask(state: GameState, task: RouteTask): string {
  return state.locations[task.locationId]?.name ?? task.locationId;
}

export function routeTaskDecision(state: GameState, task: RouteTask): RouteDecisionCopy {
  const plan = optimizedRoutePlan(state);
  const stop = plan?.stops.find((candidate) => candidate.task.id === task.id);
  const eta = stop ? `${Math.max(1, Math.round(stop.etaHours * 60))}m ETA` : "manual timing";
  const riskScore = stop ? Math.round(stop.riskScore * 100) : task.tone === "danger" ? 80 : task.tone === "warning" ? 45 : 15;
  const location = state.locations[task.locationId];
  const vehicle = activeVehicle(state);
  const vehicleAtStop = vehicle?.locationId === task.locationId;
  const travel = vehicleAtStop ? "van already there" : vehicle ? `moves ${vehicle.name}` : "walk route";

  switch (task.type) {
    case "alarm":
      return {
        cost: `${eta}; ${travel}`,
        payoff: "Stops damage and keeps the stop under your control.",
        risk: "Miss it and the machine takes damage, pressure, or lost sales.",
        when: `Urgent: risk ${riskScore}`
      };
    case "conflict":
      return {
        cost: `${eta}; stamina/health check`,
        payoff: "Prevents route trouble from becoming a bigger street problem.",
        risk: "Bad timing can drain health, stall the van, or trigger more heat.",
        when: `Fight now: risk ${riskScore}`
      };
    case "inspection": {
      const inspection = task.inspectionId ? state.law.activeInspections[task.inspectionId] : undefined;
      return {
        cost: inspection ? `$${inspection.fine} fine exposure; ${eta}` : eta,
        payoff: "Protects permits, stock, and the legal route story.",
        risk: "Ignoring it posts fines and can confiscate stock.",
        when: `Deadline job: risk ${riskScore}`
      };
    }
    case "contract": {
      const contract = task.contractId ? state.contracts[task.contractId] : undefined;
      const product = contract ? state.products[contract.productId] : undefined;
      return {
        cost: contract && product ? `${contractRemainingQuantity(contract)}x ${product.name}; ${eta}` : eta,
        payoff: contract ? `Pays $${contract.rewardMoney} and proves this route can keep promises.` : "Pays cash and route credibility.",
        risk: "Missed promises add heat and give rivals room.",
        when: `Promise: risk ${riskScore}`
      };
    }
    case "supplier":
      return {
        cost: state.factions[state.playerFactionId].money < 25 ? "spends scarce cash" : "spends cash before it earns",
        payoff: "Turns empty storage into future route revenue.",
        risk: "Wrong stock can strand money in the garage.",
        when: garageStorageUnits(state) <= 0 ? "Go before stockouts" : `Restock option: risk ${riskScore}`
      };
    case "garage":
      return {
        cost: vehicleAtStop ? "no travel cost" : `${eta}; returns to base`,
        payoff: "Preps cargo, repairs, or van readiness before the route.",
        risk: "Leaving unprepared wastes travel time later.",
        when: "Prep before driving"
      };
    case "placement":
      return {
        cost: location ? `$${placementCostForLocation(state, location)} placement; ${eta}` : eta,
        payoff: "Claims territory and creates another earning stop.",
        risk: "Rent and rival attention rise with every public claim.",
        when: `Expansion: risk ${riskScore}`
      };
    case "stock":
      return {
        cost: `${eta}; commits carried stock`,
        payoff: "Restarts sales where demand is waiting.",
        risk: "Stocking the wrong stop can leave contracts short.",
        when: `Revenue unlock: risk ${riskScore}`
      };
    case "collect":
      return {
        cost: eta,
        payoff: "Moves stored machine cash into spendable money.",
        risk: "Delaying slows upgrades, repairs, and expansion.",
        when: `Cash run: risk ${riskScore}`
      };
    case "repair":
      return {
        cost: task.machineId ? `$${Math.ceil(10 + Math.min(35, state.machines[task.machineId]?.damage ?? 0) * 0.45)} repair; ${eta}` : eta,
        payoff: "Restores reliability and lowers route pressure.",
        risk: "Repair cash competes with stock and new machines.",
        when: `Stabilize: risk ${riskScore}`
      };
    case "pressure":
      return {
        cost: `${eta}; attention on the block`,
        payoff: "Checks a contested stop before it becomes an alarm.",
        risk: "Rivals push harder when pressure is ignored.",
        when: `Contest: risk ${riskScore}`
      };
    default:
      return {
        cost: eta,
        payoff: "Moves the route forward.",
        risk: "Leaving it open can create drag later.",
        when: `Route job: risk ${riskScore}`
      };
  }
}

export function buildCurrentJob(state: GameState, playerPosition: Vec2): CurrentJobCopy {
  const missionStep = getStarterMissionStep(state, playerPosition);
  const tasks = routeTasks(state);
  const task = selectedRouteTask(state) ?? tasks[0];

  if (task) {
    const decision = routeTaskDecision(state, task);
    return {
      title: task.title,
      targetLabel: targetLabelForTask(state, task),
      detail: task.detail,
      guidance: `${targetLabelForTask(state, task)}: ${decision.cost}. ${missionStep.guidance}`,
      payoff: decision.payoff,
      risk: decision.risk,
      progressLabel: missionStep.progressLabel,
      tone: task.tone
    };
  }

  const heat = playerHeatTier(state);
  return {
    title: missionStep.title,
    targetLabel: missionStep.targetLocationId ? state.locations[missionStep.targetLocationId]?.name ?? missionStep.targetLocationId : "Route",
    detail: missionStep.objective,
    guidance: missionStep.guidance,
    payoff: "Advances the starter route.",
    risk: heat.tone === "good" ? "Low immediate pressure." : heat.action,
    progressLabel: missionStep.progressLabel,
    tone: heat.tone
  };
}

export function productTradeoffs(state: GameState): ProductTradeoff[] {
  const candidates: ProductId[] = ["soda", "energy", "mystery_capsules"];
  const player = state.factions[state.playerFactionId];

  return candidates
    .map((productId) => {
      const product = state.products[productId];
      const cost = currentProductCost(state, productId);
      const quantity = Math.max(1, Math.min(10, Math.floor(player.money / Math.max(1, cost))));
      const total = cost * quantity;
      const tone: ProductTradeoff["tone"] = product.legality >= 2 ? "danger" : product.heat >= 1.5 ? "warning" : "good";
      const label = product.legality >= 2 ? "Grey payday" : product.demandTags.includes("commuter") || product.demandTags.includes("gym") ? "Fast demand" : "Safe starter";
      const payoff = product.legality >= 2
        ? "High margin and street rep if the route can carry heat."
        : product.demand >= 1.05
          ? "Moves quickly at busy stops and helps first contracts."
          : "Reliable sales with low law pressure.";
      const risk = product.legality >= 2
        ? `+${product.heat} heat per unit pressure and inspection attention.`
        : product.heat > 0
          ? `Small heat footprint: ${product.heat}.`
          : "Little heat, lower upside.";

      return { cost: total, label: `${label}: ${quantity}x`, payoff, product, risk, tone };
    })
    .filter((tradeoff) => Number.isFinite(tradeoff.cost) && tradeoff.cost > 0);
}

export function heatForecast(state: GameState): HeatForecast {
  const player = state.factions[state.playerFactionId];
  const tier = playerHeatTier(state);
  const inspections = activeLawInspections(state);
  const alarms = activeMachineAlarms(state);
  const conflicts = activeConflictEvents(state);
  const nextInspectionDelta = Math.max(0, state.law.nextInspectionHour - state.worldTimeHours);
  const activePressure = inspections.length + alarms.length + conflicts.length;
  const riskyStock = installedMachines(state, state.playerFactionId).reduce((sum, machine) => {
    return sum + machine.slots.reduce((slotSum, slot) => slotSum + (state.products[slot.productId]?.legality ? slot.quantity : 0), 0);
  }, 0);

  return {
    label: activePressure > 0 ? `${activePressure} active pressure` : `${tier.label} (${Math.round(player.heat)} heat)`,
    detail: inspections.length > 0
      ? `${inspections.length} inspection active; first deadline at ${Math.max(1, Math.ceil((inspections[0].deadlineHour - state.worldTimeHours) * 60))}m.`
      : `${Math.max(1, Math.round(nextInspectionDelta * 60))}m until the next inspection window; ${riskyStock} risky stock units visible.`,
    action: tier.action,
    tone: activePressure > 0 ? "danger" : tier.tone
  };
}

export function recoveryNotes(state: GameState): RecoveryNote[] {
  const player = state.factions[state.playerFactionId];
  const notes: RecoveryNote[] = [];
  const playerMachines = installedMachines(state, state.playerFactionId);
  const stockedMachines = playerMachines.filter((machine) => machineStockUnits(machine) > 0);

  if (player.money < 18 && totalOwnedStockUnits(state) === 0 && playerMachines.length < 2) {
    notes.push({
      title: "Cash and stock pinch",
      detail: "Collect any stored revenue or run the cheapest supplier crate before buying upgrades.",
      action: "Prioritize soda or chips, then stock the nearest owned machine.",
      tone: "danger"
    });
  }

  if (playerMachines.length > 0 && stockedMachines.length === 0) {
    notes.push({
      title: "Empty route",
      detail: "Installed machines cannot earn without product, and rivals read empty stops as weak.",
      action: "Buy stock, store it at the garage, then carry it to the current job.",
      tone: "warning"
    });
  }

  if (activeLawInspections(state).length > 0) {
    notes.push({
      title: "Inspection recovery",
      detail: "A permit answer is cleanest, a fine is predictable, and a bribe buys time but adds heat.",
      action: "Use the Law group before taking new grey-stock jobs.",
      tone: "danger"
    });
  }

  if (activeMachineAlarms(state).length > 0) {
    notes.push({
      title: "Alarm recovery",
      detail: "Answering alarms protects machine history and prevents pressure from compounding.",
      action: "Guide to the alarm and resolve it before collecting routine cash.",
      tone: "danger"
    });
  }

  return notes;
}

export function machineLifeSummary(state: GameState, machine: VendingMachine): string {
  const traits = state.replay?.machineTraits?.[machine.id] ?? [];
  const history = state.replay?.machineHistory?.[machine.id] ?? [];
  const traitNames = traits
    .map((trait) => (machineTraitDefinitions[trait.id] as MachineTraitDefinition | undefined)?.name ?? trait.id)
    .slice(0, 2);
  const latest = history[0]?.message;

  if (traitNames.length > 0 && latest) {
    return `${traitNames.join(" + ")}. Latest: ${latest}`;
  }

  if (traitNames.length > 0) {
    return `Known for ${traitNames.join(" + ")}.`;
  }

  if (latest) {
    return `Latest: ${latest}`;
  }

  const modifier = activeRunModifier(state);
  return `${modifier.name} run: this machine has not built a reputation yet.`;
}
