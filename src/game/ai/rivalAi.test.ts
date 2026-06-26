import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import { planNpcCommands } from "./rivalAi";

describe("rival AI", () => {
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
