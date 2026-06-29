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
