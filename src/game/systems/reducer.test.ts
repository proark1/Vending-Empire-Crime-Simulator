import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import { reduceCommands, reduceGameState } from "./reducer";

describe("game reducer", () => {
  it("buys product into player cargo", () => {
    const state = createInitialState();
    const result = reduceGameState(state, { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 });

    expect(result.state.player.cargo.soda).toBe(5);
    expect(result.state.factions.player.money).toBe(110);
    expect(result.events[0]?.message).toContain("Bought 5x");
  });

  it("stocks an owned machine from cargo", () => {
    const state = createInitialState();
    const result = reduceCommands(state, [
      { type: "buy_product", actorId: "player", productId: "chips", quantity: 5 },
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "chips", quantity: 5 }
    ]);

    const machine = result.state.machines.machine_player_1;
    expect(result.state.player.cargo.chips).toBeUndefined();
    expect(machine.slots[0].quantity).toBe(5);
  });

  it("stores revenue over time and lets the player collect it", () => {
    const stocked = reduceCommands(createInitialState(), [
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 10 },
      { type: "repair_machine", actorId: "player", machineId: "machine_player_1" },
      { type: "advance_time", actorId: "player", hours: 4 }
    ]).state;

    expect(stocked.machines.machine_player_1.revenueStored).toBeGreaterThan(0);

    const collected = reduceGameState(stocked, { type: "collect_revenue", actorId: "player", machineId: "machine_player_1" }).state;
    expect(collected.machines.machine_player_1.revenueStored).toBe(0);
    expect(collected.factions.player.money).toBeGreaterThan(stocked.factions.player.money);
  });

  it("keeps NPC actions command-based", () => {
    const state = createInitialState();
    const result = reduceGameState(state, {
      type: "rival_action",
      actorId: "rival_redline",
      action: "undercut",
      targetMachineId: "machine_player_1"
    });

    expect(result.state.locations.laundromat.rivalPressure).toBeGreaterThan(state.locations.laundromat.rivalPressure);
    expect(result.state.npcControllers.rival_redline.lastActedHour).toBe(result.state.worldTimeHours);
  });
});
