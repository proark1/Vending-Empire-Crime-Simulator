import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import { reduceCommands, reduceGameState } from "../systems/reducer";
import { getStarterMissionStep } from "./mission";

const startPosition = { x: -8, z: 1.4 };

describe("starter mission flow", () => {
  it("starts by guiding the player to the supplier", () => {
    const step = getStarterMissionStep(createInitialState(), startPosition);

    expect(step.id).toBe("buy_stock");
    expect(step.targetLocationId).toBe("supplier");
  });

  it("guides supplier crates to the garage first", () => {
    const state = reduceGameState(createInitialState(), { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("deposit_stock");
    expect(step.targetLocationId).toBe("garage");
  });

  it("guides stored stock into a carried route crate", () => {
    const state = reduceCommands(createInitialState(), [
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      { type: "deposit_crate", actorId: "player" }
    ]).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("load_crate");
    expect(step.targetLocationId).toBe("garage");
  });

  it("guides garage-loaded crates to the first machine", () => {
    const state = reduceCommands(createInitialState(), [
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      { type: "deposit_crate", actorId: "player" },
      { type: "load_crate", actorId: "player", productId: "soda", quantity: 5 }
    ]).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("stock_machine");
    expect(step.targetLocationId).toBe("laundromat");
  });

  it("progresses to repair after the starter machine has stock", () => {
    const state = reduceCommands(createInitialState(), [
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 5 }
    ]).state;
    const step = getStarterMissionStep(state, startPosition);

    expect(step.id).toBe("repair_machine");
  });

  it("targets an affordable second placement after the first cash run", () => {
    const state = reduceCommands(createInitialState(), [
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
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
});
