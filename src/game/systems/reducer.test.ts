import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import { districtUnlockInfo, machineAtLocation, routeTasks, selectedRouteTask } from "../core/selectors";
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

  it("hires and assigns a restocker that moves garage stock onto the route", () => {
    const hired = reduceGameState(createInitialState(), { type: "hire_employee", actorId: "player", role: "restocker" }).state;
    const employee = Object.values(hired.employees)[0]!;
    hired.player.garageStorage.soda = 12;

    const assigned = reduceGameState(hired, {
      type: "assign_employee",
      actorId: "player",
      employeeId: employee.id,
      machineId: "machine_player_1",
      assigned: true
    }).state;
    const result = reduceGameState(assigned, { type: "advance_time", actorId: "player", hours: 2 });
    const machine = result.state.machines.machine_player_1;

    expect(result.state.employees[employee.id].assignedMachineIds).toContain("machine_player_1");
    expect(machine.slots.find((slot) => slot.productId === "soda")?.quantity).toBeGreaterThan(0);
    expect(result.state.player.garageStorage.soda).toBeLessThan(12);
    expect(result.events.some((event) => event.message.includes("restocked"))).toBe(true);
  });

  it("lets restockers use empty machine bays even when one slot is full", () => {
    const hired = reduceGameState(createInitialState(), { type: "hire_employee", actorId: "player", role: "restocker" }).state;
    const employee = Object.values(hired.employees)[0]!;
    hired.player.garageStorage.chips = 8;
    hired.machines.machine_player_1.slots = [{ productId: "soda", quantity: 24, capacity: 24, price: 4, salesAccumulator: 0 }];

    const assigned = reduceGameState(hired, {
      type: "assign_employee",
      actorId: "player",
      employeeId: employee.id,
      machineId: "machine_player_1",
      assigned: true
    }).state;
    const result = reduceGameState(assigned, { type: "advance_time", actorId: "player", hours: 2 });

    expect(result.state.machines.machine_player_1.slots.find((slot) => slot.productId === "chips")?.quantity).toBeGreaterThan(0);
  });

  it("lets an assigned collector pull cash from player machines", () => {
    const hired = reduceGameState(createInitialState(), { type: "hire_employee", actorId: "player", role: "collector" }).state;
    const employee = Object.values(hired.employees)[0]!;
    hired.machines.machine_player_1.revenueStored = 30;

    const assigned = reduceGameState(hired, {
      type: "assign_employee",
      actorId: "player",
      employeeId: employee.id,
      machineId: "machine_player_1",
      assigned: true
    }).state;
    const moneyBeforeCollection = assigned.factions.player.money;
    const result = reduceGameState(assigned, { type: "advance_time", actorId: "player", hours: 2 });

    expect(result.state.machines.machine_player_1.revenueStored).toBe(0);
    expect(result.state.factions.player.money).toBeGreaterThan(moneyBeforeCollection);
    expect(result.state.progression.revenueCollectedToday).toBe(30);
  });

  it("lets an assigned technician repair damaged machines for parts cost", () => {
    const hired = reduceGameState(createInitialState(), { type: "hire_employee", actorId: "player", role: "technician" }).state;
    const employee = Object.values(hired.employees)[0]!;
    hired.factions.player.money = 80;
    hired.machines.machine_player_1.damage = 70;

    const assigned = reduceGameState(hired, {
      type: "assign_employee",
      actorId: "player",
      employeeId: employee.id,
      machineId: "machine_player_1",
      assigned: true
    }).state;
    const result = reduceGameState(assigned, { type: "advance_time", actorId: "player", hours: 2 });

    expect(result.state.machines.machine_player_1.damage).toBeLessThan(70);
    expect(result.state.factions.player.money).toBeLessThan(80);
    expect(result.state.employees[employee.id].statusDetail).toContain("Repaired");
  });

  it("short-pays daily crew wages when cash is low", () => {
    const hired = reduceGameState(createInitialState(), { type: "hire_employee", actorId: "player", role: "restocker" }).state;
    const employee = Object.values(hired.employees)[0]!;
    hired.factions.player.money = 5;

    const result = reduceGameState(hired, { type: "advance_time", actorId: "player", hours: 16 });

    expect(result.state.factions.player.money).toBe(0);
    expect(result.state.employees[employee.id].loyalty).toBeLessThan(employee.loyalty);
    expect(result.state.employees[employee.id].statusDetail).toBe("Crew was short-paid.");
    expect(result.events.some((event) => event.message.includes("Crew wages were short"))).toBe(true);
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
    expect(state.progression.contractsCompletedTotal).toBe(1);
  });

  it("blocks player machine placement in locked districts", () => {
    const initial = createInitialState();
    initial.factions.player.money = 1000;

    const result = reduceCommands(initial, [
      visit("freight_depot"),
      { type: "place_machine", actorId: "player", locationId: "freight_depot" }
    ]);

    expect(machineAtLocation(result.state, "freight_depot")).toBeUndefined();
    expect(result.events.some((event) => event.message.includes("locked"))).toBe(true);
  });

  it("scouts and opens districts after requirements are met", () => {
    const initial = createInitialState();
    initial.factions.player.money = 400;
    initial.factions.player.streetReputation = 1;
    initial.progression.contractsCompletedTotal = 1;

    const result = reduceCommands(initial, [
      visit("gym"),
      { type: "place_machine", actorId: "player", locationId: "gym" },
      { type: "scout_district", actorId: "player", districtId: "industrial_yards" },
      { type: "unlock_district", actorId: "player", districtId: "industrial_yards" },
      visit("freight_depot"),
      { type: "place_machine", actorId: "player", locationId: "freight_depot" }
    ]);

    expect(districtUnlockInfo(result.state, "industrial_yards").progress.access).toBe("unlocked");
    expect(machineAtLocation(result.state, "freight_depot")?.ownerFactionId).toBe("player");
  });

  it("keeps rival expansion out of locked districts", () => {
    const initial = createInitialState();
    initial.factions.rival_redline.money = 1000;

    const result = reduceGameState(initial, {
      type: "rival_action",
      actorId: "rival_redline",
      action: "expand",
      locationId: "freight_depot"
    });

    expect(machineAtLocation(result.state, "freight_depot")).toBeUndefined();
  });

  it("supports debug setup for balance playtests", () => {
    const result = reduceCommands(createInitialState(), [
      { type: "debug_grant_cash", actorId: "player", amount: 250 },
      { type: "debug_complete_requirements", actorId: "player" },
      { type: "debug_set_district_access", actorId: "player", districtId: "industrial_yards", access: "unlocked" },
      { type: "debug_set_rival_pressure", actorId: "player", locationId: "laundromat", amount: 0.7 }
    ]);

    expect(result.state.factions.player.money).toBeGreaterThanOrEqual(500);
    expect(result.state.progression.contractsCompletedTotal).toBeGreaterThanOrEqual(1);
    expect(machineAtLocation(result.state, "gym")?.ownerFactionId).toBe("player");
    expect(result.state.districtProgress.industrial_yards.access).toBe("unlocked");
    expect(result.state.locations.laundromat.rivalPressure).toBe(0.7);
  });

  it("spawns visible street activity from debug controls", () => {
    const initial = createInitialState();
    initial.machines.machine_player_1.slots = [{ productId: "soda", quantity: 4, capacity: 24, price: 5, salesAccumulator: 0 }];

    const result = reduceGameState(initial, { type: "debug_spawn_activity", actorId: "player", activity: "customer_purchase" });

    expect(result.state.streetLife.recentActivities[0]).toMatchObject({
      kind: "customer_purchase",
      machineId: "machine_player_1"
    });
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

  it("runs street customer purchases through stock, revenue, and activity feedback", () => {
    const state = reduceCommands(createInitialState(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 6 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 6 },
      { type: "repair_machine", actorId: "player", machineId: "machine_player_1" }
    ]).state;
    state.streetLife.activitySequence = 1;
    state.streetLife.nextActivityHour = state.worldTimeHours + 0.01;

    const result = reduceGameState(state, { type: "advance_time", actorId: "player", hours: 0.2 });
    const machine = result.state.machines.machine_player_1;

    expect(machine.slots[0].quantity).toBe(5);
    expect(machine.revenueStored).toBeGreaterThan(0);
    expect(result.state.progression.stockSoldToday).toBe(1);
    expect(result.state.streetLife.recentActivities[0]).toMatchObject({
      kind: "customer_purchase",
      machineId: "machine_player_1",
      productId: "soda"
    });
  });

  it("turns bad machine conditions into customer complaints and local pressure", () => {
    const state = createInitialState();
    state.streetLife.activitySequence = 2;
    state.streetLife.nextActivityHour = state.worldTimeHours + 0.01;
    const initialPressure = state.locations.laundromat.rivalPressure;
    const initialReputation = state.factions.player.publicReputation;

    const result = reduceGameState(state, { type: "advance_time", actorId: "player", hours: 0.2 });

    expect(result.state.locations.laundromat.rivalPressure).toBeGreaterThan(initialPressure);
    expect(result.state.factions.player.publicReputation).toBeLessThan(initialReputation);
    expect(result.state.streetLife.recentActivities[0]).toMatchObject({
      kind: "customer_complaint",
      machineId: "machine_player_1"
    });
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

  it("turns NPC sabotage into an active machine alarm route task", () => {
    const state = createInitialState();
    const damageBefore = state.machines.machine_player_1.damage;

    const result = reduceGameState(state, {
      type: "rival_action",
      actorId: "rival_redline",
      action: "sabotage",
      targetMachineId: "machine_player_1"
    });
    const alarm = Object.values(result.state.machineAlarms)[0];
    const alarmTask = routeTasks(result.state).find((task) => task.type === "alarm");

    expect(result.state.machines.machine_player_1.damage).toBe(damageBefore);
    expect(alarm).toMatchObject({
      machineId: "machine_player_1",
      intruderFactionId: "rival_redline",
      resolved: false
    });
    expect(alarmTask).toMatchObject({
      machineId: "machine_player_1",
      alarmId: alarm.id,
      tone: "danger"
    });
    expect(result.events[0]?.message).toContain("ALARM");
  });

  it("requires the player to reach the alarmed machine before fighting the intruder", () => {
    const alarmed = reduceGameState(createInitialState(), {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const alarm = Object.values(alarmed.machineAlarms)[0]!;

    const blocked = reduceGameState(alarmed, { type: "confront_alarm", actorId: "player", alarmId: alarm.id });
    expect(blocked.state.machineAlarms[alarm.id].resolved).toBe(false);
    expect(blocked.events[0]?.message).toContain("Foam & Fold Laundromat");

    const confronted = reduceCommands(alarmed, [
      visit("laundromat"),
      { type: "confront_alarm", actorId: "player", alarmId: alarm.id }
    ]);

    expect(confronted.state.machineAlarms[alarm.id]).toMatchObject({
      resolved: true,
      outcome: "confronted"
    });
    expect(confronted.state.factions.player.streetReputation).toBe(1);
    expect(confronted.events.some((event) => event.message.includes("confronted"))).toBe(true);
  });

  it("applies sabotage damage when an alarm is missed", () => {
    const alarmed = reduceGameState(createInitialState(), {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const alarm = Object.values(alarmed.machineAlarms)[0]!;
    const damageBefore = alarmed.machines.machine_player_1.damage;

    const missed = reduceGameState(alarmed, { type: "advance_time", actorId: "player", hours: 1 });

    expect(missed.state.machineAlarms[alarm.id]).toMatchObject({
      resolved: true,
      outcome: "missed"
    });
    expect(missed.state.machines.machine_player_1.damage).toBeGreaterThan(damageBefore);
    expect(missed.events.some((event) => event.message.includes("Alarm missed"))).toBe(true);
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
    const baselineAlarmed = reduceGameState(createInitialState(), {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const baseline = reduceGameState(baselineAlarmed, { type: "advance_time", actorId: "player", hours: 1 }).state;
    const upgradedAlarmed = reduceCommands(createInitialState(), [
      visit("laundromat"),
      { type: "install_upgrade", actorId: "player", machineId: "machine_player_1", upgradeId: "reinforced_glass" },
      { type: "install_upgrade", actorId: "player", machineId: "machine_player_1", upgradeId: "smart_lock" },
      { type: "sabotage_machine", actorId: "rival_redline", machineId: "machine_player_1" }
    ]).state;
    const upgraded = reduceGameState(upgradedAlarmed, { type: "advance_time", actorId: "player", hours: 1 }).state;

    expect(upgraded.machines.machine_player_1.damage).toBeLessThan(baseline.machines.machine_player_1.damage);
  });
});
