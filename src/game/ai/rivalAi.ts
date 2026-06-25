import type { GameCommand, GameState } from "../core/types";
import { effectiveMachineSecurity, getMachineUpgradeEffects } from "../core/machineStats";
import { installableLocation, isDistrictUnlockedForPlacement, machineAtLocation, ownedMachines, placementCostForLocation } from "../core/selectors";
import { mostProfitablePlayerMachine } from "../systems/reducer";

export function planNpcCommands(state: GameState): GameCommand[] {
  const commands: GameCommand[] = [];

  for (const controller of Object.values(state.npcControllers)) {
    const faction = state.factions[controller.factionId];
    if (!faction || state.worldTimeHours - controller.lastActedHour < controller.cooldownHours) {
      continue;
    }

    const target = mostProfitablePlayerMachine(state);
    const openLocation = Object.values(state.locations)
      .filter(installableLocation)
      .filter((location) => isDistrictUnlockedForPlacement(state, location.districtId))
      .filter((location) => !machineAtLocation(state, location.id))
      .sort((a, b) => b.footTraffic + b.rivalPressure - (a.footTraffic + a.rivalPressure))[0];

    const playerMachineCount = ownedMachines(state, state.playerFactionId).length;
    const rivalMachineCount = ownedMachines(state, faction.id).length;

    const targetEffects = target ? getMachineUpgradeEffects(target) : undefined;
    const targetSecurity = target ? effectiveMachineSecurity(target) : 0;
    const sabotageRisk = targetSecurity + (targetEffects?.sabotageResistance ?? 0);

    if (target && target.revenueStored >= 28 && target.damage < 82 && sabotageRisk < 0.48) {
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
