import type { GameCommand, GameState } from "../core/types";
import { effectiveMachineSecurity, getMachineUpgradeEffects } from "../core/machineStats";
import { districtProgress, installedMachines, installableLocation, isDistrictUnlockedForPlacement, machineAtLocation, placementCostForLocation } from "../core/selectors";
import { mostProfitablePlayerMachine } from "../systems/reducer";

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

export function planNpcCommands(state: GameState): GameCommand[] {
  const commands: GameCommand[] = [];
  const expansionActive = hasExpansionSignal(state);

  for (const controller of Object.values(state.npcControllers)) {
    const faction = state.factions[controller.factionId];
    const effectiveCooldown = Math.max(1.15, controller.cooldownHours - (expansionActive ? 0.45 : 0));
    if (!faction || state.worldTimeHours - controller.lastActedHour < effectiveCooldown) {
      continue;
    }

    const target = mostProfitablePlayerMachine(state);
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
    const sabotageCashThreshold = targetIsExpansion ? 18 : 28;
    const sabotageDamageLimit = targetIsExpansion ? 88 : 82;

    if (target && target.revenueStored >= sabotageCashThreshold && target.damage < sabotageDamageLimit && sabotageRisk < 0.48) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "sabotage", targetMachineId: target.id });
      continue;
    }

    if (target && playerMachineCount >= rivalMachineCount) {
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
