import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import type { GameCommand, LocationId } from "./types";
import { reduceCommands } from "../systems/reducer";
import { getStarterMissionStep } from "./mission";

const startPosition = { x: -8, z: 1.4 };

function visit(locationId: LocationId): GameCommand {
  return { type: "set_player_location", actorId: "player", locationId };
}

describe("starter mission flow", () => {
  it("starts by guiding the player to the supplier", () => {
    const step = getStarterMissionStep(createInitialState(), startPosition);

    expect(step.id).toBe("buy_stock");
    expect(step.targetLocationId).toBe("supplier");
  });

  it("guides supplier crates to the garage first", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }
    ]).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("deposit_stock");
    expect(step.targetLocationId).toBe("garage");
  });

  it("guides stored stock into a carried route crate", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" }
    ]).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("load_crate");
    expect(step.targetLocationId).toBe("garage");
  });

  it("guides garage-loaded crates to the first machine", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" },
      { type: "load_crate", actorId: "player", productId: "soda", quantity: 5 }
    ]).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("stock_machine");
    expect(step.targetLocationId).toBe("laundromat");
  });

  it("progresses to repair after the starter machine has stock", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 5 }
    ]).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("repair_machine");
  });

  it("targets an affordable second placement after the first cash run", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 10 },
      { type: "repair_machine", actorId: "player", machineId: "machine_player_1" },
      { type: "advance_time", actorId: "player", hours: 10 },
      { type: "collect_revenue", actorId: "player", machineId: "machine_player_1" }
    ]).state;

    const step = getStarterMissionStep(state, { x: -5, z: -5 });

    expect(step.id).toBe("install_second");
    expect(step.targetLocationId).toBe("gym");
    expect(state.factions.player.money).toBeGreaterThanOrEqual(state.locations.gym.placementCost);
  });

  it("guides a claimed starter route toward scouting Iron Yard", () => {
    const state = createInitialState();
    state.mission.completed = true;

    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("scout_industrial");
    expect(step.targetLocationId).toBe("freight_depot");
  });

  it("guides scouted Iron Yard toward opening the district", () => {
    const state = createInitialState();
    state.mission.completed = true;
    state.factions.player.money = 120;
    state.progression.contractsCompletedTotal = 1;
    state.factions.player.streetReputation = 1;
    state.machines.machine_player_2 = {
      ...state.machines.machine_player_1,
      id: "machine_player_2",
      name: "Second Starter",
      locationId: "gym"
    };
    state.districtProgress.industrial_yards = {
      access: "scouted",
      districtId: "industrial_yards",
      scoutedHour: state.worldTimeHours
    };

    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("open_industrial");
    expect(step.targetLocationId).toBe("freight_depot");
  });

  it("guides unlocked Iron Yard toward the first district machine", () => {
    const state = createInitialState();
    state.mission.completed = true;
    state.factions.player.money = 250;
    state.districtProgress.industrial_yards = {
      access: "unlocked",
      districtId: "industrial_yards",
      scoutedHour: state.worldTimeHours,
      unlockedHour: state.worldTimeHours
    };

    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("install_industrial");
    expect(step.targetLocationId).toBe("freight_depot");
  });
});
