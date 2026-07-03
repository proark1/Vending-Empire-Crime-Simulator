import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import {
  activeLawInspections,
  activeMachineAlarms,
  activeLocationRights,
  baseStorageCapacity,
  campaignMissionProgress,
  currentProductCost,
  districtUnlockInfo,
  endgamePathScores,
  empireAssetLevel,
  fleetSummary,
  locationRightsFor,
  machineAtLocation,
  machineProcurementQuotes,
  machineStockUnits,
  narrativeQuestProgress,
  nearestVehicleStop,
  productLabSlots,
  routeTasks,
  selectedRouteTask,
  supplierRelationshipList,
  storyArcProgress
} from "../core/selectors";
import type { GameCommand, LocationId } from "../core/types";
import { createDefaultAudioConfig, validateAudioConfig } from "../content/audioConfig";
import { reduceCommands, reduceGameState } from "./reducer";

function visit(locationId: LocationId): GameCommand {
  return { type: "set_player_location", actorId: "player", locationId };
}

function withInstalledStarter() {
  const state = createInitialState();
  state.machines.machine_player_1.locationId = "laundromat";
  state.machines.machine_player_1.placementStatus = "installed";
  state.machines.machine_player_1.placementMethod = "legal_contract";
  state.machines.machine_player_1.damage = 0;
  state.progression.starterMachinePlaced = true;
  return state;
}

function placeStarterWithContract() {
  return reduceCommands(createInitialState(), [
    visit("garage"),
    { type: "repair_machine", actorId: "player", machineId: "machine_player_1" },
    visit("laundromat"),
    { type: "place_machine", actorId: "player", locationId: "laundromat", machineId: "machine_player_1", method: "legal_contract" }
  ]).state;
}

describe("vehicle auto-parking", () => {
  const drive = (state: ReturnType<typeof createInitialState>, position: { x: number; z: number }, heading: number, distance = 20) =>
    reduceGameState(state, {
      type: "drive_vehicle",
      actorId: "player",
      vehicleId: "vehicle_starter_van",
      position,
      heading,
      distance
    }).state;

  it("settles a driven van onto the nearest stop's tidy spot, not the raw drive-end coordinates", () => {
    const initial = createInitialState();
    const laundromat = initial.locations.laundromat;
    const streetSide = laundromat.position.z > 0 ? -1 : 1;
    // A scruffy stopping point right beside the laundromat, as if the van halted in the street.
    const messyPoint = { x: laundromat.position.x + 1.2, z: laundromat.position.z + 0.6 };
    expect(nearestVehicleStop(initial, messyPoint)?.id).toBe("laundromat");

    const van = drive(initial, messyPoint, 1).vehicles.vehicle_starter_van;

    expect(van.locationId).toBe("laundromat");
    expect(van.position).not.toEqual(messyPoint);
    expect(van.position?.x).toBeCloseTo(laundromat.position.x + 4);
    expect(van.position?.z).toBeCloseTo(laundromat.position.z + streetSide * 2.25);
    expect(van.heading).toBeCloseTo(Math.PI / 2);
  });

  it("leaves a van at its driven spot when it stops away from every stop", () => {
    const initial = createInitialState();
    // Far outside the populated world, so it is beyond every stop's docking radius.
    const openRoad = { x: 500, z: 500 };
    expect(nearestVehicleStop(initial, openRoad)).toBeUndefined();

    const van = drive(initial, openRoad, 0.5, 30).vehicles.vehicle_starter_van;

    expect(van.position).toEqual(openRoad);
  });
});

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
    const state = withInstalledStarter();
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

  it("turns grey stock into machine identity", () => {
    const state = withInstalledStarter();
    state.player.currentLocationId = "laundromat";
    state.player.cargo.mood_fizz = 4;

    const result = reduceGameState(state, { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "mood_fizz", quantity: 4 });

    expect(result.state.replay.machineTraits.machine_player_1?.some((trait) => trait.id === "cult_shelf")).toBe(true);
    expect(result.state.replay.machineHistory.machine_player_1?.[0]?.message).toContain("Cult Shelf");
    expect(result.state.replay.strategyUnlocks).toContain("Grey shelf identity");
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
    const stockTask = routeTasks(initial).find((task) => task.id === "stored:machine_player_1:repair");
    expect(stockTask).toBeDefined();

    const state = reduceGameState(initial, { type: "select_route_task", actorId: "player", taskId: stockTask!.id }).state;
    expect(selectedRouteTask(state)?.id).toBe(stockTask!.id);
  });

  it("hires and assigns a restocker that moves garage stock onto the route", () => {
    const hired = reduceGameState(withInstalledStarter(), { type: "hire_employee", actorId: "player", role: "restocker" }).state;
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
    const hired = reduceGameState(withInstalledStarter(), { type: "hire_employee", actorId: "player", role: "restocker" }).state;
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
    const hired = reduceGameState(withInstalledStarter(), { type: "hire_employee", actorId: "player", role: "collector" }).state;
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
    // Crew collection takes an 8% handling skim (round(30 * 0.08) = 2), so the
    // player nets 28 of the 30 stored — automation is a paid convenience, not a
    // strictly-better replacement for hand-collecting at full value.
    expect(result.state.progression.revenueCollectedToday).toBe(28);
  });

  it("lets an assigned technician repair damaged machines for parts cost", () => {
    const hired = reduceGameState(withInstalledStarter(), { type: "hire_employee", actorId: "player", role: "technician" }).state;
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
    const state = placeStarterWithContract();
    const task = routeTasks(state).find((candidate) => candidate.id === "contract:contract_1");

    expect(task).toMatchObject({
      type: "contract",
      locationId: "laundromat",
      title: "Deliver 6x Corner Soda",
      productId: "soda"
    });
  });

  it("completes a matching service contract when stocking a machine", () => {
    const state = reduceCommands(placeStarterWithContract(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 6 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 6 }
    ]).state;

    expect(state.contracts.contract_1.status).toBe("completed");
    expect(state.contracts.contract_1.deliveredQuantity).toBe(6);
    expect(state.factions.player.money).toBeGreaterThan(118);
    expect(state.progression.contractRewardsToday).toBe(state.contracts.contract_1.rewardMoney);
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

  it("starts with the starter stored, then repairs and places it at the laundromat", () => {
    const initial = createInitialState();
    expect(initial.machines.machine_player_1).toMatchObject({
      locationId: "garage",
      placementStatus: "stored"
    });
    expect(machineAtLocation(initial, "laundromat")).toBeUndefined();

    const result = reduceCommands(initial, [
      visit("garage"),
      { type: "repair_machine", actorId: "player", machineId: "machine_player_1" },
      visit("laundromat"),
      { type: "place_machine", actorId: "player", locationId: "laundromat", machineId: "machine_player_1", method: "legal_contract" }
    ]);

    expect(machineAtLocation(result.state, "laundromat")).toMatchObject({
      id: "machine_player_1",
      placementStatus: "installed",
      placementMethod: "legal_contract"
    });
    expect(result.state.progression.starterMachinePlaced).toBe(true);
    expect(result.state.contracts.contract_1).toMatchObject({ locationId: "laundromat", productId: "soda", status: "active" });
  });

  it("buys and resells stored machine inventory through the fleet economy", () => {
    const initial = createInitialState();
    initial.factions.player.money = 500;
    const comboQuote = machineProcurementQuotes(initial).find((quote) => quote.model.id === "combo_machine");
    expect(comboQuote?.unlocked).toBe(true);

    const bought = reduceCommands(initial, [
      visit("garage"),
      { type: "buy_machine_model", actorId: "player", modelId: "combo_machine", quantity: 1 }
    ]).state;
    const storedCombo = Object.values(bought.machines).find((machine) => machine.machineModelId === "combo_machine" && machine.placementStatus === "stored")!;
    expect(storedCombo).toBeDefined();
    expect(fleetSummary(bought).storedCount).toBeGreaterThanOrEqual(2);
    expect(bought.economy.fleet.vendorReputation).toBeGreaterThan(initial.economy.fleet.vendorReputation);

    const sold = reduceGameState(bought, { type: "sell_stored_machine", actorId: "player", machineId: storedCombo.id }).state;
    expect(sold.machines[storedCombo.id]).toBeUndefined();
    expect(fleetSummary(sold).storedCount).toBe(fleetSummary(bought).storedCount - 1);
  });

  it("requires stored inventory before placing a new player machine", () => {
    const initial = withInstalledStarter();
    initial.factions.player.money = 500;

    const result = reduceCommands(initial, [
      visit("gym"),
      { type: "place_machine", actorId: "player", locationId: "gym" }
    ]);

    expect(machineAtLocation(result.state, "gym")).toBeUndefined();
    expect(result.events.some((event) => event.message.includes("Buy a machine model"))).toBe(true);
  });

  it("negotiates permits and exclusives as location-rights gameplay", () => {
    const initial = withInstalledStarter();
    initial.factions.player.money = 1000;
    const beforeLegalPressure = locationRightsFor(initial, "gym").legalPressure;

    const permitted = reduceCommands(initial, [
      visit("gym"),
      { type: "negotiate_location_rights", actorId: "player", locationId: "gym", approach: "permit_filing" }
    ]).state;
    const permitRights = locationRightsFor(permitted, "gym");
    expect(permitRights.permitStatus).toBe("active");
    expect(permitRights.legalPressure).toBeLessThan(beforeLegalPressure);
    expect(activeLocationRights(permitted).some((rights) => rights.locationId === "gym")).toBe(true);

    const exclusive = reduceGameState(permitted, { type: "negotiate_location_rights", actorId: "player", locationId: "gym", approach: "exclusive_contract" }).state;
    const blockedRival = reduceGameState(exclusive, {
      type: "rival_action",
      actorId: "rival_redline",
      action: "expand",
      locationId: "gym"
    }).state;

    expect(locationRightsFor(blockedRival, "gym").exclusiveContractHolderId).toBe("player");
    expect(machineAtLocation(blockedRival, "gym")).toBeUndefined();
  });

  it("applies placement method tradeoffs when installing a new machine", () => {
    const initial = withInstalledStarter();
    initial.factions.player.money = 500;
    const result = reduceCommands(initial, [
      visit("garage"),
      { type: "buy_machine_model", actorId: "player", modelId: "combo_machine", quantity: 1 },
      visit("gym"),
      { type: "place_machine", actorId: "player", locationId: "gym", method: "illegal" }
    ]);
    const machine = machineAtLocation(result.state, "gym");

    expect(machine).toMatchObject({
      ownerFactionId: "player",
      placementMethod: "illegal",
      placementStatus: "installed"
    });
    expect(result.state.factions.player.heat).toBeGreaterThan(initial.factions.player.heat);
    expect(result.state.factions.player.publicReputation).toBeLessThan(initial.factions.player.publicReputation);
    expect(result.state.locations.gym.rivalPressure).toBeGreaterThan(initial.locations.gym.rivalPressure);
  });

  it("tracks risky placement as an endgame direction signal", () => {
    const initial = withInstalledStarter();
    initial.factions.player.money = 500;

    const result = reduceCommands(initial, [
      visit("garage"),
      { type: "buy_machine_model", actorId: "player", modelId: "combo_machine", quantity: 1 },
      visit("arcade"),
      { type: "place_machine", actorId: "player", locationId: "arcade", method: "illegal" }
    ]).state;
    const syndicate = endgamePathScores(result).find((score) => score.path.id === "syndicate");

    expect(syndicate?.signals.join(" ")).toContain("risky machines");
    expect(syndicate?.score).toBeGreaterThan(0);
  });

  it("derives story arc progress from district state and machine footholds", () => {
    const initial = createInitialState();
    initial.mission.completed = true;
    initial.districtProgress.industrial_yards = {
      access: "scouted",
      districtId: "industrial_yards",
      scoutedHour: 9
    };

    const available = storyArcProgress(initial).find((progress) => progress.arc.id === "yard_leverage");
    expect(available).toMatchObject({ stage: "available" });

    initial.districtProgress.industrial_yards.access = "unlocked";
    initial.machines.machine_player_2 = {
      ...initial.machines.machine_player_1,
      id: "machine_player_2",
      name: "Yard Starter",
      locationId: "freight_depot",
      placementStatus: "installed",
      placementMethod: "legal_contract"
    };

    const active = storyArcProgress(initial).find((progress) => progress.arc.id === "yard_leverage");
    expect(active).toMatchObject({ stage: "active" });
    expect(active?.progressRatio).toBeGreaterThan(available?.progressRatio ?? 0);
  });

  it("scouts and opens districts after requirements are met", () => {
    const initial = withInstalledStarter();
    initial.factions.player.money = 1000;
    initial.factions.player.streetReputation = 1;
    initial.progression.contractsCompletedTotal = 1;

    const result = reduceCommands(initial, [
      visit("garage"),
      { type: "buy_machine_model", actorId: "player", modelId: "combo_machine", quantity: 2 },
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

  it("covers the vertical slice with real commands and no debug shortcuts", () => {
    let state = createInitialState();
    state.factions.player.money = 2200;
    const commands: GameCommand[] = [];
    const run = (command: GameCommand) => {
      commands.push(command);
      state = reduceGameState(state, command).state;
      return state;
    };
    const readyStoredMachine = () => {
      const machine = Object.values(state.machines).find(
        (candidate) => candidate.ownerFactionId === "player" && candidate.placementStatus === "stored" && candidate.damage <= 0
      );
      expect(machine).toBeDefined();
      return machine!;
    };

    run(visit("garage"));
    run({ type: "repair_machine", actorId: "player", machineId: "machine_player_1" });
    run(visit("laundromat"));
    run({ type: "place_machine", actorId: "player", locationId: "laundromat", machineId: "machine_player_1", method: "legal_contract" });
    run(visit("supplier"));
    run({ type: "buy_product", actorId: "player", productId: "soda", quantity: 6 });
    run(visit("laundromat"));
    run({ type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 6 });

    run(visit("garage"));
    run({ type: "buy_machine_model", actorId: "player", modelId: "combo_machine", quantity: 2 });
    const gymMachine = readyStoredMachine();
    run(visit("gym"));
    run({ type: "place_machine", actorId: "player", locationId: "gym", machineId: gymMachine.id, method: "legal_contract" });
    run(visit("supplier"));
    run({ type: "buy_product", actorId: "player", productId: "chips", quantity: 10 });
    run(visit("gym"));
    run({ type: "stock_machine", actorId: "player", machineId: gymMachine.id, productId: "chips", quantity: 10 });

    const arcadeMachine = readyStoredMachine();
    run(visit("arcade"));
    run({ type: "place_machine", actorId: "player", locationId: "arcade", machineId: arcadeMachine.id, method: "legal_contract" });
    run(visit("supplier"));
    run({ type: "buy_product", actorId: "player", productId: "water", quantity: 10 });
    run(visit("arcade"));
    run({ type: "stock_machine", actorId: "player", machineId: arcadeMachine.id, productId: "water", quantity: 10 });

    expect(state.contracts.contract_1.status).toBe("completed");
    expect(state.mission.completed).toBe(true);
    expect(activeMachineAlarms(state).some((alarm) => alarm.kind === "undercut")).toBe(false);
    run({ type: "advance_time", actorId: "player", hours: 14 });
    const firstRivalAlarm = activeMachineAlarms(state).find((alarm) => alarm.kind === "undercut");
    expect(firstRivalAlarm).toBeDefined();
    run(visit(firstRivalAlarm!.locationId));
    run({ type: "confront_alarm", actorId: "player", alarmId: firstRivalAlarm!.id });
    expect(state.machineAlarms[firstRivalAlarm!.id]).toMatchObject({ resolved: true, outcome: "confronted" });

    run({ type: "scout_district", actorId: "player", districtId: "industrial_yards" });
    run({ type: "unlock_district", actorId: "player", districtId: "industrial_yards" });
    expect(districtUnlockInfo(state, "industrial_yards").progress.access).toBe("unlocked");

    run(visit("garage"));
    run({ type: "buy_machine_model", actorId: "player", modelId: "basic_snack", quantity: 1 });
    const yardMachine = readyStoredMachine();
    run(visit("freight_depot"));
    run({ type: "place_machine", actorId: "player", locationId: "freight_depot", machineId: yardMachine.id, method: "illegal" });
    run(visit("supplier"));
    run({ type: "buy_product", actorId: "player", productId: "energy", quantity: 8 });
    run(visit("freight_depot"));
    run({ type: "stock_machine", actorId: "player", machineId: yardMachine.id, productId: "energy", quantity: 8 });

    run(visit("garage"));
    run({ type: "hire_employee", actorId: "player", role: "guard" });
    const guard = Object.values(state.employees).find((employee) => employee.role === "guard");
    expect(guard).toBeDefined();
    run({ type: "assign_employee", actorId: "player", employeeId: guard!.id, machineId: yardMachine.id, assigned: true });

    run(visit("supplier"));
    run({ type: "negotiate_supplier_deal", actorId: "player", supplierId: "backdoor_wholesale", dealKind: "bulk_discount" });
    expect(Object.values(state.economy.supply.activeDeals).some((deal) => deal.supplierId === "backdoor_wholesale")).toBe(true);

    if (state.pacing.pendingStarterRetaliation) {
      run({ type: "advance_time", actorId: "player", hours: Math.max(0.1, state.pacing.pendingStarterRetaliation.earliestHour - state.worldTimeHours + 0.1) });
      const retaliation = activeMachineAlarms(state).find((alarm) => alarm.kind === "sabotage");
      if (retaliation) {
        run(visit(retaliation.locationId));
        run({ type: "confront_alarm", actorId: "player", alarmId: retaliation.id });
      }
    }

    state.factions.player.heat = Math.max(state.factions.player.heat, 16);
    state.law.nextInspectionHour = Math.max(state.worldTimeHours + 0.05, state.pacing.nextDangerHour + 0.05);
    run({ type: "advance_time", actorId: "player", hours: state.law.nextInspectionHour - state.worldTimeHours + 0.1 });
    const inspection = activeLawInspections(state)[0];
    expect(inspection).toBeDefined();
    run(visit(inspection!.locationId));
    run({ type: "resolve_inspection", actorId: "player", inspectionId: inspection!.id, resolution: "pay_fine" });

    const yardProgress = campaignMissionProgress(state).find((progress) => progress.arc.id === "yard_leverage");
    expect(yardProgress?.completedObjectives.map((objective) => objective.id)).toEqual(["yard_scout", "yard_open", "yard_muscle"]);
    expect(state.law.activeInspections[inspection!.id]).toMatchObject({ status: "resolved", resolution: "pay_fine" });
    expect(commands.some((command) => command.type.startsWith("debug_"))).toBe(false);
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
    const initial = withInstalledStarter();
    initial.machines.machine_player_1.slots = [{ productId: "soda", quantity: 4, capacity: 24, price: 5, salesAccumulator: 0 }];

    const result = reduceGameState(initial, { type: "debug_spawn_activity", actorId: "player", activity: "customer_purchase" });

    expect(result.state.streetLife.recentActivities[0]).toMatchObject({
      kind: "customer_purchase",
      machineId: "machine_player_1"
    });
  });

  it("keeps ambient street life quiet until the first route is stocked", () => {
    const result = reduceGameState(createInitialState(), { type: "advance_time", actorId: "player", hours: 1 });

    expect(result.state.streetLife.recentActivities).toEqual([]);
    expect(result.state.economy.customers.recentDecisions).toEqual([]);
  });

  it("fails expired service contracts and files a day report", () => {
    const state = reduceGameState(placeStarterWithContract(), { type: "advance_time", actorId: "player", hours: 17 }).state;

    expect(state.contracts.contract_1.status).toBe("failed");
    expect(state.dayReports[0]).toMatchObject({
      day: 1,
      contractsFailed: 1
    });
    expect(state.factions.player.heat).toBeGreaterThan(0);
  });

  it("creates inspections and applies fines with confiscation when missed", () => {
    const initial = withInstalledStarter();
    initial.factions.player.heat = 14;
    initial.law.nextInspectionHour = initial.worldTimeHours + 0.05;
    initial.machines.machine_player_1.placementMethod = "illegal";
    initial.machines.machine_player_1.slots = [{ productId: "mystery_capsules", quantity: 10, capacity: 24, price: 16, salesAccumulator: 0 }];

    const noticed = reduceGameState(initial, { type: "advance_time", actorId: "player", hours: 0.1 }).state;
    const inspection = Object.values(noticed.law.activeInspections)[0]!;
    expect(inspection).toMatchObject({
      machineId: "machine_player_1",
      status: "active"
    });

    const missed = reduceGameState(noticed, { type: "advance_time", actorId: "player", hours: 2 }).state;
    expect(missed.law.activeInspections[inspection.id]).toMatchObject({ status: "missed" });
    expect(missed.law.finesToday).toBeGreaterThan(0);
    expect(missed.law.confiscatedUnitsToday).toBeGreaterThan(0);
    expect(machineStockUnits(missed.machines.machine_player_1)).toBeLessThan(10);
  });

  it("lets legal placements clear inspections by showing a permit", () => {
    const initial = withInstalledStarter();
    initial.factions.player.heat = 20;
    initial.law.nextInspectionHour = initial.worldTimeHours + 0.05;
    initial.machines.machine_player_1.slots = [{ productId: "mystery_capsules", quantity: 5, capacity: 24, price: 16, salesAccumulator: 0 }];

    const noticed = reduceCommands(initial, [
      { type: "advance_time", actorId: "player", hours: 0.1 },
      visit("laundromat")
    ]).state;
    const inspection = Object.values(noticed.law.activeInspections)[0]!;
    const resolved = reduceGameState(noticed, { type: "resolve_inspection", actorId: "player", inspectionId: inspection.id, resolution: "show_permit" }).state;

    expect(resolved.law.activeInspections[inspection.id]).toMatchObject({
      status: "resolved",
      resolution: "show_permit"
    });
    expect(resolved.law.finesToday).toBe(0);
    expect(machineStockUnits(resolved.machines.machine_player_1)).toBe(5);
  });

  it("stores revenue over time and lets the player collect it", () => {
    const stocked = reduceCommands(withInstalledStarter(), [
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

  it("records strong collections as reusable route knowledge", () => {
    const state = withInstalledStarter();
    state.player.currentLocationId = "laundromat";
    state.machines.machine_player_1.revenueStored = 60;

    const result = reduceGameState(state, { type: "collect_revenue", actorId: "player", machineId: "machine_player_1" });

    expect(result.state.replay.machineTraits.machine_player_1?.some((trait) => trait.id === "reliable_earner")).toBe(true);
    expect(result.state.replay.strategyUnlocks).toContain("Cash route reader");
  });

  it("runs street customer purchases through stock, revenue, and activity feedback", () => {
    const state = reduceCommands(withInstalledStarter(), [
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
    expect(result.state.economy.customers.recentDecisions[0]).toMatchObject({
      outcome: "purchase",
      machineId: "machine_player_1",
      productId: "soda"
    });
    expect(result.state.economy.customers.loyaltyByLocation.laundromat).toBeGreaterThan(0);
  });

  it("turns bad machine conditions into customer complaints and local pressure", () => {
    const state = withInstalledStarter();
    state.machines.machine_player_1.damage = 50;
    state.machines.machine_player_1.slots = [{ productId: "soda", quantity: 1, capacity: 24, price: 5, salesAccumulator: 0 }];
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
    const state = withInstalledStarter();
    const result = reduceGameState(state, {
      type: "rival_action",
      actorId: "rival_redline",
      action: "undercut",
      targetMachineId: "machine_player_1"
    });

    expect(result.state.locations.laundromat.rivalPressure).toBeGreaterThan(state.locations.laundromat.rivalPressure);
    expect(result.state.npcControllers.rival_redline.lastActedHour).toBe(result.state.worldTimeHours);
    expect(result.state.replay.rivalMemory.rival_redline?.undercut).toBe(1);
    expect(result.state.replay.machineTraits.machine_player_1?.some((trait) => trait.id === "rival_tagged")).toBe(true);
  });

  it("gives corporate rivals legal-pressure undercuts instead of generic street pressure", () => {
    const state = withInstalledStarter();
    const result = reduceGameState(state, {
      type: "rival_action",
      actorId: "rival_glassline",
      action: "undercut",
      targetMachineId: "machine_player_1"
    });

    expect(result.state.locations.laundromat.rivalPressure).toBeGreaterThan(state.locations.laundromat.rivalPressure);
    expect(result.state.factions.player.publicReputation).toBeLessThan(state.factions.player.publicReputation);
    expect(result.events.some((event) => event.message.includes("pressuring permits"))).toBe(true);
  });

  it("turns NPC sabotage into an active machine alarm route task", () => {
    const state = withInstalledStarter();
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

  it("turns player sabotage into an active street chase conflict", () => {
    const result = reduceCommands(createInitialState(), [
      visit("rival_corner"),
      { type: "sabotage_machine", actorId: "player", machineId: "machine_rival_1" }
    ]);
    const conflict = Object.values(result.state.conflict.activeEvents)[0]!;
    const conflictTask = routeTasks(result.state).find((task) => task.type === "conflict");

    expect(conflict).toMatchObject({
      kind: "street_chase",
      locationId: "rival_corner",
      status: "active"
    });
    expect(conflictTask).toMatchObject({
      conflictId: conflict.id,
      tone: "danger"
    });

    const resolved = reduceGameState(result.state, {
      type: "resolve_conflict_event",
      actorId: "player",
      eventId: conflict.id,
      resolution: "melee"
    }).state;

    expect(resolved.conflict.activeEvents[conflict.id]).toMatchObject({
      status: "resolved",
      resolution: "melee"
    });
    expect(resolved.conflict.resolvedToday).toBe(1);
  });

  it("plays active conflicts through encounter actions", () => {
    const result = reduceCommands(createInitialState(), [
      visit("rival_corner"),
      { type: "sabotage_machine", actorId: "player", machineId: "machine_rival_1" }
    ]);
    const conflict = Object.values(result.state.conflict.activeEvents)[0]!;
    const before = conflict.encounter!;

    const afterStrike = reduceGameState(result.state, {
      type: "player_conflict_action",
      actorId: "player",
      eventId: conflict.id,
      action: "strike"
    }).state.conflict.activeEvents[conflict.id].encounter!;

    expect(afterStrike.enemyHealth).toBeLessThan(before.enemyHealth);
    expect(afterStrike.playerStamina).toBeLessThan(before.playerStamina);
  });

  it("lets crime contacts source grey-stock crates with heat risk", () => {
    const initial = createInitialState();
    initial.factions.player.money = 250;
    initial.districtProgress.neon_quarter = {
      access: "unlocked",
      districtId: "neon_quarter",
      scoutedHour: initial.worldTimeHours,
      unlockedHour: initial.worldTimeHours
    };

    const result = reduceGameState(initial, {
      type: "work_crime_contact",
      actorId: "player",
      contactId: "neon_grey_supplier",
      action: "source_contraband"
    });

    expect(result.state.player.carriedCrate).toMatchObject({ productId: "glitch_gum", source: "supplier" });
    expect(result.state.factions.player.heat).toBeGreaterThan(initial.factions.player.heat);
    expect(result.state.economy.finance.ledger.some((entry) => entry.category === "stock" && entry.amount < 0)).toBe(true);
  });

  it("lets tips expose rival operations", () => {
    const initial = createInitialState();
    const operation = initial.rivalOrganizations.rival_redline.operations[0]!;
    const beforeProgress = operation.progress;

    const result = reduceGameState(initial, {
      type: "work_crime_contact",
      actorId: "player",
      contactId: "laundry_lookout",
      action: "buy_tip"
    }).state;
    const updated = result.rivalOrganizations.rival_redline.operations.find((candidate) => candidate.id === operation.id)!;

    expect(updated.exposed).toBe(true);
    expect(updated.progress).toBeLessThan(beforeProgress);
  });

  it("lets the player pressure rival operations", () => {
    const initial = createInitialState();
    initial.factions.player.money = 300;
    const operation = initial.rivalOrganizations.rival_redline.operations[1]!;
    const beforeStrength = operation.strength;
    const beforeHeat = initial.factions.player.heat;

    const result = reduceGameState(initial, {
      type: "pressure_rival_operation",
      actorId: "player",
      operationId: operation.id,
      approach: "disrupt"
    }).state;
    const updated = result.rivalOrganizations.rival_redline.operations.find((candidate) => candidate.id === operation.id)!;

    expect(updated.strength).toBeLessThan(beforeStrength);
    expect(result.factions.player.heat).toBeGreaterThan(beforeHeat);
  });

  it("lets guards intercept assigned machine alarms", () => {
    const initial = withInstalledStarter();
    initial.factions.player.money = 300;
    const hired = reduceGameState(initial, { type: "hire_employee", actorId: "player", role: "guard" }).state;
    const guard = Object.values(hired.employees)[0]!;
    const assigned = reduceGameState(hired, {
      type: "assign_employee",
      actorId: "player",
      employeeId: guard.id,
      machineId: "machine_player_1",
      assigned: true
    }).state;
    const alarmed = reduceGameState(assigned, {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const alarm = Object.values(alarmed.machineAlarms)[0]!;

    const result = reduceGameState(alarmed, { type: "advance_time", actorId: "player", hours: 2 });

    expect(result.state.machineAlarms[alarm.id]).toMatchObject({
      resolved: true,
      outcome: "confronted"
    });
    expect(result.events.some((event) => event.message.includes("intercepted"))).toBe(true);
  });

  it("requires the player to reach the alarmed machine before fighting the intruder", () => {
    const alarmed = reduceGameState(withInstalledStarter(), {
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
    const alarmed = reduceGameState(withInstalledStarter(), {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const alarm = Object.values(alarmed.machineAlarms)[0]!;
    const damageBefore = alarmed.machines.machine_player_1.damage;

    const missed = reduceGameState(alarmed, { type: "advance_time", actorId: "player", hours: 2 });

    expect(missed.state.machineAlarms[alarm.id]).toMatchObject({
      resolved: true,
      outcome: "missed"
    });
    expect(missed.state.machines.machine_player_1.damage).toBeGreaterThan(damageBefore);
    expect(missed.events.some((event) => event.message.includes("Alarm missed"))).toBe(true);
  });

  it("updates product slot prices on owned machines", () => {
    const state = reduceCommands(withInstalledStarter(), [
      visit("supplier"),
      { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 },
      visit("laundromat"),
      { type: "stock_machine", actorId: "player", machineId: "machine_player_1", productId: "soda", quantity: 5 },
      { type: "set_slot_price", actorId: "player", machineId: "machine_player_1", productId: "soda", price: 7 }
    ]).state;

    expect(state.machines.machine_player_1.slots[0].price).toBe(7);
  });

  it("installs upgrades on owned machines", () => {
    const result = reduceCommands(withInstalledStarter(), [
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
    const baselineAlarmed = reduceGameState(withInstalledStarter(), {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const baseline = reduceGameState(baselineAlarmed, { type: "advance_time", actorId: "player", hours: 2 }).state;
    const upgradedAlarmed = reduceCommands(withInstalledStarter(), [
      visit("laundromat"),
      { type: "install_upgrade", actorId: "player", machineId: "machine_player_1", upgradeId: "reinforced_glass" },
      { type: "install_upgrade", actorId: "player", machineId: "machine_player_1", upgradeId: "smart_lock" },
      { type: "sabotage_machine", actorId: "rival_redline", machineId: "machine_player_1" }
    ]).state;
    const upgraded = reduceGameState(upgradedAlarmed, { type: "advance_time", actorId: "player", hours: 2 }).state;

    expect(upgraded.machines.machine_player_1.damage).toBeLessThan(baseline.machines.machine_player_1.damage);
  });

  it("gives the first machine alarm a longer response window", () => {
    const alarmed = reduceGameState(withInstalledStarter(), {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const alarm = Object.values(alarmed.machineAlarms)[0]!;

    expect(alarm.expiresHour - alarm.startedHour).toBeGreaterThanOrEqual(1.5);
  });

  it("defers ambient inspections while a post-danger quiet window is active", () => {
    const initial = withInstalledStarter();
    initial.player.currentLocationId = "laundromat";
    initial.machines.machine_player_1.placementMethod = "illegal";
    initial.machines.machine_player_1.slots = [{ productId: "mystery_capsules", quantity: 10, capacity: 24, price: 16, salesAccumulator: 0 }];
    const alarmed = reduceGameState(initial, {
      type: "sabotage_machine",
      actorId: "rival_redline",
      machineId: "machine_player_1"
    }).state;
    const alarm = Object.values(alarmed.machineAlarms)[0]!;
    const resolved = reduceGameState(alarmed, { type: "confront_alarm", actorId: "player", alarmId: alarm.id }).state;
    resolved.factions.player.heat = 24;
    resolved.law.nextInspectionHour = resolved.worldTimeHours;

    const advanced = reduceGameState(resolved, { type: "advance_time", actorId: "player", hours: 0.2 }).state;

    expect(activeLawInspections(advanced)).toEqual([]);
    expect(advanced.pacing.suppressedDangerToday).toBeGreaterThan(0);
    expect(advanced.law.nextInspectionHour).toBeGreaterThan(advanced.worldTimeHours);
  });

  it("delays Redline retaliation until after the undercut quiet window", () => {
    const initial = withInstalledStarter();
    initial.player.currentLocationId = "laundromat";
    initial.machines.machine_player_1.slots = [{ productId: "soda", quantity: 8, capacity: 24, price: 5, salesAccumulator: 0 }];
    const undercut = reduceGameState(initial, {
      type: "rival_action",
      actorId: "rival_redline",
      action: "undercut",
      targetMachineId: "machine_player_1"
    }).state;
    const alarm = activeMachineAlarms(undercut).find((candidate) => candidate.kind === "undercut")!;
    const confronted = reduceGameState(undercut, { type: "confront_alarm", actorId: "player", alarmId: alarm.id }).state;

    expect(activeMachineAlarms(confronted)).toEqual([]);
    expect(confronted.pacing.pendingStarterRetaliation).toBeDefined();

    const afterQuiet = reduceGameState(confronted, { type: "advance_time", actorId: "player", hours: 4.2 }).state;

    expect(activeMachineAlarms(afterQuiet).some((candidate) => candidate.kind === "sabotage")).toBe(true);
    expect(afterQuiet.progression.firstRetaliationTriggered).toBe(true);
  });

  it("upgrades base facilities and increases storage capacity", () => {
    const initial = createInitialState();
    initial.factions.player.money = 500;
    const beforeCapacity = baseStorageCapacity(initial);

    const result = reduceCommands(initial, [
      visit("garage"),
      { type: "upgrade_base_facility", actorId: "player", facilityId: "warehouse" }
    ]);

    expect(result.state.base.facilities.warehouse.level).toBe(1);
    expect(baseStorageCapacity(result.state)).toBeGreaterThan(beforeCapacity);
    expect(result.state.economy.finance.ledger.some((entry) => entry.category === "base")).toBe(true);
  });

  it("requires a product lab before customizing catalog products", () => {
    const initial = createInitialState();
    initial.factions.player.money = 600;
    const blocked = reduceCommands(initial, [
      visit("garage"),
      { type: "customize_product", actorId: "player", productId: "soda", mode: "premium_wrap" }
    ]);
    expect(blocked.state.economy.productCustomizations.soda).toBeUndefined();

    const customized = reduceCommands(blocked.state, [
      { type: "upgrade_base_facility", actorId: "player", facilityId: "product_lab" },
      { type: "customize_product", actorId: "player", productId: "soda", mode: "premium_wrap" }
    ]).state;

    expect(productLabSlots(customized)).toBeGreaterThan(0);
    expect(customized.economy.productCustomizations.soda).toMatchObject({
      brandName: "Vendetta Select",
      brandTone: "premium",
      mode: "premium_wrap",
      packageStyle: "premium_wrap"
    });
    expect(customized.progression.productDesignsCompleted).toBe(1);
    expect(currentProductCost(customized, "soda")).toBeGreaterThanOrEqual(1);
  });

  it("charges fuel and adds maintenance when dispatching a vehicle", () => {
    const initial = createInitialState();
    initial.factions.player.money = 200;
    const beforeMoney = initial.factions.player.money;

    const result = reduceGameState(initial, {
      type: "dispatch_vehicle",
      actorId: "player",
      vehicleId: "vehicle_starter_van",
      locationId: "laundromat"
    }).state;

    expect(result.factions.player.money).toBeLessThan(beforeMoney);
    expect(result.vehicles.vehicle_starter_van.condition).toBeLessThan(1);
    expect(result.economy.traffic.vehicleMaintenanceDue.vehicle_starter_van).toBeGreaterThan(0);
    expect(result.economy.finance.ledger.some((entry) => entry.category === "fuel")).toBe(true);
  });

  it("auto-parks the van onto a nearby stop's tidy spot when it stops driving", () => {
    const initial = createInitialState();
    const result = reduceGameState(initial, {
      type: "drive_vehicle",
      actorId: "player",
      vehicleId: "vehicle_starter_van",
      position: { x: -5.2, z: -5.4 },
      heading: Math.PI,
      distance: 12
    }).state;

    const vehicle = result.vehicles.vehicle_starter_van;
    expect(vehicle.locationId).toBe("laundromat");
    // Settled onto the laundromat's designated spot, not left at the raw drive-end coords.
    expect(vehicle.position).toEqual({ x: -1, z: -2.75 });
    expect(vehicle.heading).toBeCloseTo(Math.PI / 2);
    expect(vehicle.condition).toBeLessThan(1);
    expect(vehicle.odometer).toBeGreaterThanOrEqual(12);
    expect(result.economy.traffic.vehicleMaintenanceDue.vehicle_starter_van).toBeGreaterThan(0);
  });

  it("levels employees after repeated successful automation work", () => {
    const initial = withInstalledStarter();
    initial.factions.player.money = 400;
    initial.player.garageStorage.soda = 80;
    const hired = reduceGameState(initial, { type: "hire_employee", actorId: "player", role: "restocker" }).state;
    const employee = Object.values(hired.employees)[0]!;
    const assigned = reduceGameState(hired, {
      type: "assign_employee",
      actorId: "player",
      employeeId: employee.id,
      machineId: "machine_player_1",
      assigned: true
    }).state;

    const worked = reduceCommands(assigned, [
      { type: "advance_time", actorId: "player", hours: 3 },
      { type: "advance_time", actorId: "player", hours: 3 }
    ]).state;

    expect(worked.employees[employee.id].level).toBeGreaterThan(1);
    expect(worked.employees[employee.id]).toMatchObject({
      lastLocationId: "laundromat",
      routePhase: "restock",
      routeTargetLocationId: "laundromat"
    });
    expect(worked.streetLife.recentActivities.some((activity) => activity.kind === "employee_route" && activity.actor === "employee")).toBe(true);
    expect(worked.machines.machine_player_1.slots.find((slot) => slot.productId === "soda")?.quantity).toBeGreaterThan(0);
  });

  it("advances playable campaign chains from world actions", () => {
    const initial = withInstalledStarter();
    initial.mission.completed = true;
    initial.factions.player.money = 500;

    const result = reduceGameState(initial, {
      type: "scout_district",
      actorId: "player",
      districtId: "industrial_yards"
    }).state;
    const yard = campaignMissionProgress(result).find((progress) => progress.arc.id === "yard_leverage");

    expect(yard?.completedObjectives.map((objective) => objective.id)).toContain("yard_scout");
    expect(yard?.activeObjective?.id).toBe("yard_open");
    expect(result.mission.campaign.yard_leverage.completedStepIds).toContain("yard_scout");
  });

  it("upgrades long-term empire assets and expands operating capacity", () => {
    const initial = createInitialState();
    initial.factions.player.money = 1000;
    const beforeStorage = baseStorageCapacity(initial);

    const result = reduceGameState(initial, {
      type: "upgrade_empire_asset",
      actorId: "player",
      assetId: "warehouse_network"
    }).state;

    expect(empireAssetLevel(result, "warehouse_network")).toBe(1);
    expect(baseStorageCapacity(result)).toBeGreaterThan(beforeStorage);
    expect(result.economy.finance.ledger.some((entry) => entry.category === "empire")).toBe(true);
  });

  it("negotiates supplier deals that improve loyalty and product cost", () => {
    const initial = createInitialState();
    initial.factions.player.money = 500;
    const beforeCost = currentProductCost(initial, "soda");

    const result = reduceCommands(initial, [
      visit("supplier"),
      { type: "negotiate_supplier_deal", actorId: "player", supplierId: "backdoor_wholesale", dealKind: "bulk_discount" }
    ]).state;
    const supplier = supplierRelationshipList(result).find((relationship) => relationship.id === "backdoor_wholesale");

    expect(supplier?.loyalty).toBeGreaterThan(12);
    expect(supplier?.negotiatedDiscount).toBeGreaterThan(0);
    expect(currentProductCost(result, "soda")).toBeLessThanOrEqual(beforeCost);
    expect(Object.values(result.economy.supply.activeDeals).some((deal) => deal.supplierId === "backdoor_wholesale")).toBe(true);
  });

  it("starts NPC quest dialogue and advances a branching quest step", () => {
    const initial = createInitialState();
    initial.mission.completed = true;

    const result = reduceCommands(initial, [
      { type: "start_quest", actorId: "player", questId: "supplier_blackbook" },
      { type: "choose_quest_dialogue", actorId: "player", questId: "supplier_blackbook", choiceId: "supplier_clean_terms" }
    ]).state;
    const quest = narrativeQuestProgress(result).find((progress) => progress.definition.id === "supplier_blackbook");

    expect(quest?.state.status).toBe("active");
    expect(quest?.state.choiceHistory).toContain("supplier_clean_terms");
    expect(quest?.state.completedStepIds).toContain("supplier_pitch");
    expect(quest?.activeStep?.id).toBe("supplier_volume");
  });

  it("resolves major raids through empire responses", () => {
    const initial = createInitialState();
    initial.factions.player.money = 500;
    initial.empire.politicalPressure = 35;
    initial.empire.activeRaids.raid_test = {
      id: "raid_test",
      deadlineHour: initial.worldTimeHours + 4,
      message: "Test raid",
      severity: 4,
      startedHour: initial.worldTimeHours,
      status: "active",
      targetAssetId: "front_business"
    };

    const result = reduceGameState(initial, {
      type: "resolve_major_raid",
      actorId: "player",
      raidId: "raid_test",
      resolution: "legal_team"
    }).state;

    expect(result.empire.activeRaids.raid_test.status).toBe("resolved");
    expect(result.empire.politicalPressure).toBeLessThan(35);
    expect(result.economy.finance.ledger.some((entry) => entry.category === "fines")).toBe(true);
  });

  it("ships validated default procedural audio content", () => {
    const config = createDefaultAudioConfig();
    const issues = validateAudioConfig(config);

    expect(config.assets.length).toBeGreaterThan(0);
    expect(config.cues.length).toBeGreaterThan(0);
    expect(config.assets.some((asset) => asset.category === "music" && asset.url.startsWith("synth://music/"))).toBe(true);
    expect(config.cues.some((cue) => cue.category === "voice" && cue.assetId === "synth_voice_radio")).toBe(true);
    expect(config.cues.find((cue) => cue.trigger === "voice.rival_attack")?.lines?.length).toBeGreaterThan(1);
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
