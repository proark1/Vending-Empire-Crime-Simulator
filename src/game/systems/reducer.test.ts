import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import { routeTasks, selectedRouteTask } from "../core/selectors";
import type { GameCommand, LocationId } from "../core/types";
import { reduceCommands, reduceGameState } from "./reducer";

function visit(locationId: LocationId): GameCommand {
  return { type: "set_player_location", actorId: "player", locationId };
}

describe("game reducer", () => {
  it("buys product as a carried crate", () => {
    const result = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }
    ]);

    expect(result.state.player.carriedCrate).toMatchObject({ productId: "soda", quantity: 5, source: "supplier" });
    expect(result.state.player.cargo.soda).toBeUndefined();
    expect(result.state.factions.player.money).toBe(110);
    expect(result.events[0]?.message).toContain("Picked up");
  });

  it("stocks an owned machine from the carried crate", () => {
    const state = createInitialState();
    const result = reduceCommands(state, [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "chips", quantity: 5 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "chips", quantity: 5 }
    ]);

    const machine = result.state.machines.machine_player_1;
    expect(result.state.player.carriedCrate).toBeNull();
    expect(machine.slots[0].quantity).toBe(5);
  });

  it("moves stock from supplier crate into garage storage and back out", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" },
      { type: "load_crate", actorId: "player", productId: "soda", quantity: 6 }
    ]).state;

    expect(state.player.garageStorage.soda).toBe(4);
    expect(state.player.carriedCrate).toMatchObject({ productId: "soda", quantity: 6, source: "garage" });
  });

  it("loads garage stock into the starter vehicle", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" },
      { type: "load_vehicle", actorId: "player", vehicleId: "vehicle_starter_van", productId: "soda", quantity: 8 }
    ]).state;

    expect(state.player.garageStorage.soda).toBe(2);
    expect(state.vehicles.vehicle_starter_van.inventory.soda).toBe(8);
  });

  it("dispatches the vehicle and lets the player take a crate from the trunk", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" },
      { type: "load_vehicle", actorId: "player", vehicleId: "vehicle_starter_van", productId: "soda", quantity: 10 },
      { type: "dispatch_vehicle", actorId: "player", vehicleId: "vehicle_starter_van", locationId: "laundromat" },
      visit("laundromat"),
      { type: "take_vehicle_crate", actorId: "player", vehicleId: "vehicle_starter_van", productId: "soda", quantity: 6 }
    ]).state;

    expect(state.vehicles.vehicle_starter_van.locationId).toBe("laundromat");
    expect(state.vehicles.vehicle_starter_van.inventory.soda).toBe(4);
    expect(state.player.carriedCrate).toMatchObject({ productId: "soda", quantity: 6, source: "vehicle" });
    expect(state.worldTimeHours).toBeGreaterThan(8);
  });

  it("blocks physical commands when the player is away from the required stop", () => {
    const blockedBuy = reduceGameState(createInitialState(), { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 });
    expect(blockedBuy.state.player.carriedCrate).toBeNull();
    expect(blockedBuy.events[0]?.message).toContain("Backdoor Supplier");

    const loaded = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 6 },
      visit("garage"),
      { type: "deposit_crate", actorId: "player" },
      { type: "load_vehicle", actorId: "player", vehicleId: "vehicle_starter_van", productId: "soda", quantity: 6 },
      { type: "dispatch_vehicle", actorId: "player", vehicleId: "vehicle_starter_van", locationId: "laundromat" },
      visit("garage")
    ]).state;
    const blockedTrunk = reduceGameState(loaded, { type: "take_vehicle_crate", actorId: "player", vehicleId: "vehicle_starter_van", productId: "soda", quantity: 4 });

    expect(blockedTrunk.state.player.carriedCrate).toBeNull();
    expect(blockedTrunk.state.vehicles.vehicle_starter_van.inventory.soda).toBe(6);
    expect(blockedTrunk.events[0]?.message).toContain("Foam & Fold Laundromat");
  });

  it("selects a derived route task for guidance", () => {
    const initial = createInitialState();
    const stockTask = routeTasks(initial).find((task) => task.id === "machine:machine_player_1:stock");
    expect(stockTask).toBeDefined();

    const state = reduceGameState(initial, { type: "select_route_task", actorId: "player", taskId: stockTask!.id }).state;
    expect(selectedRouteTask(state)?.id).toBe(stockTask!.id);
  });

  it("surfaces active service contracts as route tasks", () => {
    const state = createInitialState();
    const task = routeTasks(state).find((candidate) => candidate.id === "contract:contract_1");

    expect(task).toMatchObject({
      type: "contract",
      locationId: "laundromat",
      title: "Deliver 6x Corner Soda",
      productId: "soda"
    });
  });

  it("completes a matching service contract when stocking a machine", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 6 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 6 }
    ]).state;

    expect(state.contracts.contract_1.status).toBe("completed");
    expect(state.contracts.contract_1.deliveredQuantity).toBe(6);
    expect(state.factions.player.money).toBe(144);
    expect(state.progression.contractRewardsToday).toBe(36);
    expect(state.progression.contractsCompletedToday).toBe(1);
  });

  it("fails expired service contracts and files a day report", () => {
    const state = reduceGameState(createInitialState(), { type: "advance_time", actorId: "player", hours: 17 }).state;

    expect(state.contracts.contract_1.status).toBe("failed");
    expect(state.dayReports[0]).toMatchObject({
      day: 1,
      contractsFailed: 1
    });
    expect(state.factions.player.heat).toBeGreaterThan(0);
  });

  it("stores revenue over time and lets the player collect it", () => {
    const stocked = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 10 },
      visit("laundromat"),
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

  it("updates product slot prices on owned machines", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 5 },
      { type: "set_slot_price", actorId: "player", machineId: "machine_player_1", productId: "soda", price: 7 }
    ]).state;

    expect(state.machines.machine_player_1.slots[0].price).toBe(7);
  });

  it("installs upgrades on owned machines", () => {
    const result = reduceCommands(createInitialState(), [
      visit("laundromat"),
      {
        type: "install_upgrade",
        actorId: "player",
        machineId: "machine_player_1",
        upgradeId: "reinforced_glass"
      }
    ]);

    expect(result.state.machines.machine_player_1.upgrades).toContain("reinforced_glass");
    expect(result.state.factions.player.money).toBe(65);
  });

  it("reduces sabotage damage with machine protection", () => {
    const baseline = reduceGameState(createInitialState(), {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const upgraded = reduceCommands(createInitialState(), [
      visit("laundromat"),
      { type: "install_upgrade", actorId: "player", machineId: "machine_player_1", upgradeId: "reinforced_glass" },
      { type: "install_upgrade", actorId: "player", machineId: "machine_player_1", upgradeId: "smart_lock" },
      { type: "sabotage_machine", actorId: "rival_redline", machineId: "machine_player_1" }
    ]).state;

    expect(upgraded.machines.machine_player_1.damage).toBeLessThan(baseline.machines.machine_player_1.damage);
  });
});
