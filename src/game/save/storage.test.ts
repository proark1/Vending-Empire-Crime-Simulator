import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import { migrateGameState } from "./storage";

describe("save migration", () => {
  it("restores starter cash for a broke pre-route save", () => {
    const state = createInitialState();
    state.factions.player.money = 0;

    const migrated = migrateGameState(state);

    expect(migrated.factions.player.money).toBe(120);
    expect(migrated.eventLog[0]).toMatchObject({
      id: "tutorial_starter_float",
      tone: "good"
    });
  });

  it("does not refill cash after the starter route has begun", () => {
    const state = createInitialState();
    state.factions.player.money = 0;
    state.machines.machine_player_1.damage = 0;
    state.machines.machine_player_1.locationId = "laundromat";
    state.machines.machine_player_1.placementStatus = "installed";
    state.progression.starterMachinePlaced = true;

    const migrated = migrateGameState(state);

    expect(migrated.factions.player.money).toBe(0);
  });
});
