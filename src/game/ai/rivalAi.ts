import type { GameCommand, GameState } from "../core/types";
import { machineAtLocation, ownedMachines } from "../core/selectors";
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
      .filter((location) => location.kind !== "garage" && location.kind !== "supplier")
      .filter((location) => !machineAtLocation(state, location.id))
      .sort((a, b) => b.footTraffic + b.rivalPressure - (a.footTraffic + a.rivalPressure))[0];

    const playerMachineCount = ownedMachines(state, state.playerFactionId).length;
    const rivalMachineCount = ownedMachines(state, faction.id).length;

    if (target && target.revenueStored >= 28 && target.damage < 82) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "sabotage", targetMachineId: target.id });
      continue;
    }

    if (target && playerMachineCount >= rivalMachineCount) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "undercut", targetMachineId: target.id });
      continue;
    }

    if (openLocation && faction.money >= Math.round(openLocation.placementCost * 0.65)) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "expand", locationId: openLocation.id });
    } else if (target) {
      commands.push({ type: "rival_action", actorId: faction.id, action: "undercut", targetMachineId: target.id });
    }
  }

  return commands;
}
