import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/content/initialState";
import type { GameCommand, LocationId } from "../game/core/types";
import { reduceCommands } from "../game/systems/reducer";
import { getPrimaryInteraction } from "./interactionActions";

function visit(locationId: LocationId): GameCommand {
  return { type: "set_player_location", actorId: "player", locationId };
}

describe("primary interactions", () => {
  it("recommends buying supplier stock", () => {
    const state = createInitialState();
    const action = getPrimaryInteraction(state, { type: "supplier", id: "supplier", label: "Backdoor Supplier" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toContain("Buy");
  });

  it("prioritizes stocking an owned machine when cargo is available", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }
    ]).state;
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_player_1", label: "Rusty Starter" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Stock Corner Soda");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("stock_machine");
    }
  });

  it("stores carried crates at the garage as the base primary action", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }
    ]).state;
    const action = getPrimaryInteraction(state, { type: "base", id: "garage", label: "Storage Garage" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Store crate");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("deposit_crate");
    }
  });

  it("loads stored garage crates when hands are free", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" }
    ]).state;
    const action = getPrimaryInteraction(state, { type: "base", id: "garage", label: "Storage Garage" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Carry Corner Soda");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("load_crate");
    }
  });

  it("uses nearby van stock as a machine primary action when hands are free", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" },
      { type: "load_vehicle", actorId: "player", vehicleId: "vehicle_starter_van", productId: "soda", quantity: 10 },
      { type: "dispatch_vehicle", actorId: "player", vehicleId: "vehicle_starter_van", locationId: "laundromat" }
    ]).state;
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_player_1", label: "Rusty Starter" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Carry Corner Soda from van");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("take_vehicle_crate");
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
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 6 }
    ]).state;
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_player_1", label: "Rusty Starter" });

    expect(action?.kind).toBe("command");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("repair_machine");
    }
  });
});
