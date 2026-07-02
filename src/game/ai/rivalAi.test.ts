import { describe, expect, it } from "vitest";
import type { GameState } from "../core/types";
import { createInitialState } from "../content/initialState";
import { planNpcCommands } from "./rivalAi";

/** Installed player machine that comfortably meets every sabotage precondition. */
function withSabotageableTarget(): GameState {
  const state = createInitialState();
  const machine = state.machines.machine_player_1;
  machine.locationId = "laundromat";
  machine.placementStatus = "installed";
  machine.placementMethod = "legal_contract";
  machine.revenueStored = 60;
  machine.damage = 10;
  state.worldTimeHours = 30;
  // Isolate Redline: park every other rival on its action cooldown so only Redline plans.
  for (const controller of Object.values(state.npcControllers)) {
    if (controller.factionId !== "rival_redline") {
      controller.lastActedHour = state.worldTimeHours;
    }
  }
  return state;
}

describe("rival AI", () => {
  it("sabotages a juicy player machine once its sabotage cooldown has elapsed", () => {
    const state = withSabotageableTarget();
    state.npcControllers.rival_redline.lastSabotagedHour = undefined;

    const sabotage = planNpcCommands(state).find(
      (command) => command.type === "rival_action" && command.action === "sabotage"
    );

    expect(sabotage).toMatchObject({ action: "sabotage", targetMachineId: "machine_player_1" });
  });

  it("holds off on sabotage while the sabotage cooldown is still active", () => {
    const state = withSabotageableTarget();
    // Redline sabotaged 5h ago; its sabotage cooldown is 9h, so it must not attack yet.
    state.npcControllers.rival_redline.lastSabotagedHour = state.worldTimeHours - 5;

    const commands = planNpcCommands(state);

    expect(commands.some((command) => command.type === "rival_action" && command.action === "sabotage")).toBe(false);
    // The rival is still active — it just pressures the machine another way instead of attacking it.
    expect(commands.some((command) => command.type === "rival_action")).toBe(true);
  });

  it("does not bypass the authored first Redline undercut delay", () => {
    const state = createInitialState();
    const machine = state.machines.machine_player_1;
    machine.locationId = "laundromat";
    machine.placementStatus = "installed";
    machine.placementMethod = "legal_contract";
    machine.revenueStored = 80;
    machine.damage = 0;
    machine.slots = [{ productId: "soda", quantity: 8, capacity: 24, price: 5, salesAccumulator: 0 }];
    state.progression.starterMachinePlaced = true;
    state.progression.starterMachinePlacedHour = 8;
    state.worldTimeHours = 12;

    const commands = planNpcCommands(state);

    expect(commands.some((command) => command.type === "rival_action" && command.targetMachineId === "machine_player_1")).toBe(false);
  });

  it("corporate rivals pressure with undercuts, not sabotage, when unprovoked", () => {
    const state = withSabotageableTarget();
    // Isolate Glassline (corporate) instead of Redline.
    for (const controller of Object.values(state.npcControllers)) {
      controller.lastActedHour = controller.factionId === "rival_glassline" ? 0 : state.worldTimeHours;
    }
    state.npcControllers.rival_glassline.lastSabotagedHour = undefined;

    const commands = planNpcCommands(state);

    expect(commands.some((command) => command.type === "rival_action" && command.action === "sabotage")).toBe(false);
    expect(commands.some((command) => command.type === "rival_action" && command.action === "undercut" && command.targetMachineId === "machine_player_1")).toBe(true);
  });

  it("a corporate rival the player has repeatedly exposed turns to sabotage", () => {
    const state = withSabotageableTarget();
    for (const controller of Object.values(state.npcControllers)) {
      controller.lastActedHour = controller.factionId === "rival_glassline" ? 0 : state.worldTimeHours;
    }
    state.npcControllers.rival_glassline.lastSabotagedHour = undefined;
    state.replay.rivalMemory.rival_glassline = {
      alarmConfronted: 1,
      disruption: 1,
      exposure: 2,
      expansion: 0,
      factionId: "rival_glassline",
      negotiation: 0,
      sabotage: 0,
      undercut: 0
    };

    const sabotage = planNpcCommands(state).find(
      (command) => command.type === "rival_action" && command.action === "sabotage"
    );

    expect(sabotage).toMatchObject({ action: "sabotage", targetMachineId: "machine_player_1" });
  });

  it("expands into opened expansion districts once the player signals expansion", () => {
    const state = createInitialState();
    delete state.machines.machine_player_1;
    state.worldTimeHours = 10;
    state.factions.rival_redline.money = 500;
    state.districtProgress.industrial_yards = {
      access: "unlocked",
      districtId: "industrial_yards",
      scoutedHour: 9,
      unlockedHour: 9.5
    };

    const commands = planNpcCommands(state);
    const expansion = commands.find((command) => command.type === "rival_action" && command.action === "expand");

    expect(expansion).toMatchObject({
      action: "expand",
      type: "rival_action"
    });
    if (!expansion || expansion.type !== "rival_action" || expansion.action !== "expand" || !expansion.locationId) {
      throw new Error("Expected rival expansion to choose an industrial location");
    }
    expect(state.locations[expansion.locationId]?.districtId).toBe("industrial_yards");
  });
});
