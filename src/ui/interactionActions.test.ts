import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/content/initialState";
import { reduceCommands, reduceGameState } from "../game/systems/reducer";
import { getPrimaryInteraction } from "./interactionActions";

describe("primary interactions", () => {
  it("recommends buying supplier stock", () => {
    const state = createInitialState();
    const action = getPrimaryInteraction(state, { type: "supplier", id: "supplier", label: "Backdoor Supplier" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toContain("Buy");
  });

  it("prioritizes stocking an owned machine when cargo is available", () => {
    const state = reduceGameState(createInitialState(), { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }).state;
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_player_1", label: "Rusty Starter" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Stock Corner Soda");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("stock_machine");
    }
  });

  it("stores carried crates at the garage as the base primary action", () => {
    const state = reduceGameState(createInitialState(), { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }).state;
    const action = getPrimaryInteraction(state, { type: "base", id: "garage", label: "Storage Garage" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Store crate");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("deposit_crate");
    }
  });

  it("loads stored garage crates when hands are free", () => {
    const state = reduceCommands(createInitialState(), [
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      { type: "deposit_crate", actorId: "player" }
    ]).state;
    const action = getPrimaryInteraction(state, { type: "base", id: "garage", label: "Storage Garage" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Carry Corner Soda");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("load_crate");
    }
  });

  it("uses sabotage as the rival machine primary action", () => {
    const state = createInitialState();
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_rival_1", label: "Redline Basic" });

    expect(action?.kind).toBe("command");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("sabotage_machine");
    }
  });

  it("repairs a stocked damaged machine before adding leftover cargo", () => {
    const state = reduceCommands(createInitialState(), [
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 6 }
    ]).state;
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_player_1", label: "Rusty Starter" });

    expect(action?.kind).toBe("command");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("repair_machine");
    }
  });
});
