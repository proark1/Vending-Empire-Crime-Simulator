import type { Faction, GameCommand, GameState, RivalMemoryState, VendingMachine } from "../core/types";
import { activeRunModifier } from "../content/replayability";
import { effectiveMachineSecurity, getMachineUpgradeEffects } from "../core/machineStats";
import { activeConflictEvents, activeLawInspections, activeMachineAlarms, districtProgress, installedMachines, installableLocation, isDistrictUnlockedForPlacement, machineAtLocation, placementCostForLocation } from "../core/selectors";
import { mostProfitablePlayerMachine } from "../systems/reducer";

const FIRST_UNDERCUT_MIN_ROUTE_HOURS = 14;

function hasExpansionSignal(state: GameState): boolean {
  return Object.keys(state.districts).some((districtId) => districtId !== "starter_suburb" && districtProgress(state, districtId).access !== "locked");
}

function expansionScore(state: GameState, locationDistrictId: string): number {
  if (locationDistrictId === "starter_suburb") {
    return 0;
  }

  const access = districtProgress(state, locationDistrictId).access;
  if (access === "unlocked") {
    return 0.55;
  }

  if (access === "scouted") {
    return 0.25;
  }

  return 0;
}

function machineCarriesGreyStock(state: GameState, machine: VendingMachine): boolean {
  return machine.slots.some((slot) => {
    if (slot.quantity <= 0) {
      return false;
    }
    const category = state.products[slot.productId]?.category;
    return category === "fictional-grey" || category === "fictional-contraband";
  });
}

function juiciestMachine(machines: VendingMachine[]): VendingMachine | undefined {
  return machines.slice().sort((a, b) => b.revenueStored - a.revenueStored)[0];
}

// Archetype-flavoured target choice so each rival goes after what it actually cares
// about, falling back to the most profitable machine when no themed target exists:
//  - corporate    → undercuts legitimate (legal-contract) business
//  - black_market → punishes machines carrying grey stock
//  - street_crew  → muscles in on expansion-district turf
function selectFactionTarget(state: GameState, faction: Faction): VendingMachine | undefined {
  const machines = installedMachines(state, state.playerFactionId);
  if (machines.length === 0) {
    return undefined;
  }
  const fallback = mostProfitablePlayerMachine(state);
  switch (faction.archetype) {
    case "corporate": {
      const legal = machines.filter((machine) => (machine.placementMethod ?? "legal_contract") === "legal_contract");
      return juiciestMachine(legal) ?? fallback;
    }
    case "black_market": {
      const grey = machines.filter((machine) => machineCarriesGreyStock(state, machine));
      return juiciestMachine(grey) ?? fallback;
    }
    case "street_crew": {
      const expansion = machines.filter((machine) => state.locations[machine.locationId]?.districtId !== "starter_suburb");
      return juiciestMachine(expansion) ?? fallback;
    }
    default:
      return fallback;
  }
}

// How hard the player has pushed back on this faction (exposes/disruptions/answered
// alarms) — high pushback makes a rival vengeful; heavy negotiation cools it down.
function rivalPushback(memory: RivalMemoryState | undefined): number {
  return memory ? memory.exposure + memory.disruption + memory.alarmConfronted : 0;
}

function rivalAppeasement(memory: RivalMemoryState | undefined): number {
  return memory ? memory.negotiation : 0;
}

export function planNpcCommands(state: GameState): GameCommand[] {
  const commands: GameCommand[] = [];
  const expansionActive = hasExpansionSignal(state);
  const quietWindowActive = Boolean(state.pacing && state.worldTimeHours < state.pacing.nextDangerHour);
  const activeDanger = activeMachineAlarms(state).length > 0 || activeLawInspections(state).length > 0 || activeConflictEvents(state).length > 0;

  if (quietWindowActive || activeDanger) {
    return commands;
  }

  for (const controller of Object.values(state.npcControllers)) {
    const faction = state.factions[controller.factionId];
    if (!faction) {
      continue;
    }

    const memory = state.replay?.rivalMemory?.[faction.id];
    const pushback = rivalPushback(memory);
    const appeasement = rivalAppeasement(memory);
    // Memory shapes tempo: a faction the player keeps exposing/disrupting/alarming
    // turns vengeful and strikes sooner; one the player negotiates with eases off.
    const memoryCooldownDelta = Math.min(2.5, pushback * 0.4) - Math.min(2, appeasement * 0.3);
    const effectiveCooldown = Math.max(1.15, controller.cooldownHours - (expansionActive ? 0.45 : 0) - memoryCooldownDelta);
    if (state.worldTimeHours - controller.lastActedHour < effectiveCooldown) {
      continue;
    }

    // A rival the player has heavily negotiated with (and not provoked) stands down.
    if (appeasement >= 5 && pushback <= 1) {
      continue;
    }

    const target = selectFactionTarget(state, faction);
    const openLocation = Object.values(state.locations)
      .filter(installableLocation)
      .filter((location) => isDistrictUnlockedForPlacement(state, location.districtId))
      .filter((location) => !machineAtLocation(state, location.id))
      .sort((a, b) => b.footTraffic + b.rivalPressure + expansionScore(state, b.districtId) - (a.footTraffic + a.rivalPressure + expansionScore(state, a.districtId)))[0];

    const playerMachineCount = installedMachines(state, state.playerFactionId).length;
    const rivalMachineCount = installedMachines(state, faction.id).length;

    const targetEffects = target ? getMachineUpgradeEffects(target) : undefined;
    const targetSecurity = target ? effectiveMachineSecurity(target) : 0;
    const sabotageRisk = targetSecurity + (targetEffects?.sabotageResistance ?? 0);
    const targetLocation = target ? state.locations[target.locationId] : undefined;
    const targetIsExpansion = Boolean(targetLocation && targetLocation.districtId !== "starter_suburb");
    const firstUndercutDelay = Math.max(6, FIRST_UNDERCUT_MIN_ROUTE_HOURS + (activeRunModifier(state).effects.redlineUndercutHoursDelta ?? 0));
    const starterLessonPending =
      target?.id === "machine_player_1" &&
      !state.progression.firstUndercutTriggered &&
      typeof state.progression.starterMachinePlacedHour === "number" &&
      state.worldTimeHours - state.progression.starterMachinePlacedHour < firstUndercutDelay;
    const greyTarget = target ? machineCarriesGreyStock(state, target) : false;
    // Corporate rivals fight with law and money, not muscle — they only resort to
    // sabotage once the player has really provoked them. Black-market rivals hit
    // machines carrying grey stock harder (lower cash bar to bother sabotaging).
    const sabotageArchetypeAllowed = faction.archetype !== "corporate" || pushback >= 3;
    const blackMarketGreyBonus = faction.archetype === "black_market" && greyTarget ? 12 : 0;
    const sabotageCashThreshold = (targetIsExpansion ? 18 : 28) - blackMarketGreyBonus;
    const sabotageDamageLimit = targetIsExpansion ? 88 : 82;

    // Sabotage is the punishing, alarm-spawning action — keep it on a long, separate
    // cooldown so rivals stay busy (undercut/expand) without attacking machines constantly.
    const sabotageCooldown = controller.sabotageCooldownHours ?? 12;
    const sabotageReady = state.worldTimeHours - (controller.lastSabotagedHour ?? Number.NEGATIVE_INFINITY) >= sabotageCooldown;

    if (!starterLessonPending && sabotageArchetypeAllowed && sabotageReady && target && target.revenueStored >= sabotageCashThreshold && target.damage < sabotageDamageLimit && sabotageRisk < 0.48) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "sabotage", targetMachineId: target.id });
      continue;
    }

    if (!starterLessonPending && target && playerMachineCount >= rivalMachineCount) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "undercut", targetMachineId: target.id });
      continue;
    }

    if (openLocation && faction.money >= Math.round(placementCostForLocation(state, openLocation) * 0.65)) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "expand", locationId: openLocation.id });
    } else if (target) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "undercut", targetMachineId: target.id });
    }
  }

  return commands;
}
