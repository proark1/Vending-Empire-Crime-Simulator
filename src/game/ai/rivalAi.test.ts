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

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "expand",
          locationId: "warehouse_club",
          type: "rival_action"
        })
      ])
    );
  });
});
