import type { CommandResult, FactionId, GameCommand, GameEvent, GameEventTone, GameState, Location, MachineSlot, ProductId, ServiceContract, VendingMachine } from "../core/types";
import {
  activeContracts,
  cargoSpaceRemaining,
  contractRemainingQuantity,
  garageStorageSpaceRemaining,
  inventoryUnits,
  machineAtLocation,
  machineStockUnits,
  missionProgress,
  ownedMachines,
  vehicleSpaceRemaining
} from "../core/selectors";
import { machineUpgrades } from "../content/machineUpgrades";
import { machineHasUpgrade, sabotageDamage } from "../core/machineStats";
import { runMachineSales } from "./economy";

function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

function log(state: GameState, events: GameEvent[], message: string, tone: GameEventTone = "neutral"): void {
  const event: GameEvent = {
    id: `event_${state.eventSequence++}`,
    hour: state.worldTimeHours,
    tone,
    message
  };
  events.push(event);
  state.eventLog = [event, ...state.eventLog].slice(0, 12);
}

function getFactionOrThrow(state: GameState, factionId: FactionId) {
  const faction = state.factions[factionId];
  if (!faction) {
    throw new Error(`Unknown faction: ${factionId}`);
  }
  return faction;
}

function addInventory(inventory: Record<string, number>, productId: ProductId, quantity: number): void {
  inventory[productId] = (inventory[productId] ?? 0) + quantity;
}

function removeInventory(inventory: Record<string, number>, productId: ProductId, quantity: number): void {
  inventory[productId] = Math.max(0, (inventory[productId] ?? 0) - quantity);
  if (inventory[productId] === 0) {
    delete inventory[productId];
  }
}

function removeCarriedProduct(state: GameState, productId: ProductId, quantity: number): void {
  const crate = state.player.carriedCrate;
  if (crate?.productId === productId) {
    crate.quantity = Math.max(0, crate.quantity - quantity);
    if (crate.quantity === 0) {
      state.player.carriedCrate = null;
    }
    return;
  }

  removeInventory(state.player.cargo, productId, quantity);
}

function getOrCreateSlot(machine: VendingMachine, productId: ProductId, basePrice: number): MachineSlot | undefined {
  const existing = machine.slots.find((slot) => slot.productId === productId);
  if (existing) {
    return existing;
  }

  if (machine.slots.length >= machine.maxSlots) {
    return undefined;
  }

  const slot: MachineSlot = {
    productId,
    quantity: 0,
    capacity: 24,
    price: basePrice,
    salesAccumulator: 0
  };
  machine.slots.push(slot);
  return slot;
}

function createMachine(state: GameState, ownerFactionId: FactionId, locationId: string): VendingMachine {
  const id = `machine_${ownerFactionId}_${state.nextMachineNumber++}`;
  const location = state.locations[locationId];
  const machine: VendingMachine = {
    id,
    name: ownerFactionId === state.playerFactionId ? `Street Unit ${state.nextMachineNumber - 1}` : `Redline Unit ${state.nextMachineNumber - 1}`,
    ownerFactionId,
    locationId,
    slots: [],
    maxSlots: 3,
    revenueStored: 0,
    damage: ownerFactionId === state.playerFactionId ? 12 : 0,
    security: 0.2,
    visibility: location.kind === "transit" ? 0.95 : 0.8,
    heat: 0,
    lastServicedHour: state.worldTimeHours,
    upgrades: []
  };
  state.machines[id] = machine;
  return machine;
}

function clampSlotPrice(price: number): number {
  return Math.max(1, Math.min(99, Math.round(price)));
}

function travelHoursBetweenLocations(state: GameState, fromLocationId: string, toLocationId: string, speed: number): number {
  const from = state.locations[fromLocationId];
  const to = state.locations[toLocationId];
  if (!from || !to) {
    return 0;
  }

  return Math.max(0.08, Math.hypot(from.position.x - to.position.x, from.position.z - to.position.z) * 0.018 / Math.max(0.4, speed));
}

function contractProductOptions(location: Location): ProductId[] {
  if (location.demandTags.includes("gym")) {
    return ["energy", "soda", "chips"];
  }

  if (location.demandTags.includes("arcade")) {
    return ["chips", "mystery_capsules", "soda"];
  }

  if (location.demandTags.includes("commuter")) {
    return ["energy", "soda", "chips"];
  }

  if (location.demandTags.includes("student")) {
    return ["soda", "chips", "energy"];
  }

  return ["soda", "chips", "energy"];
}

function contractTitle(location: Location, productName: string): string {
  if (location.kind === "gym") {
    return `${location.name} training rush`;
  }

  if (location.kind === "arcade") {
    return `${location.name} late shift`;
  }

  if (location.kind === "transit") {
    return `${location.name} commuter stock`;
  }

  return `${location.name} ${productName} promise`;
}

function createServiceContract(state: GameState, location: Location, productId: ProductId, requiredQuantity: number, deadlineHour: number): ServiceContract {
  const product = state.products[productId];
  const id = `contract_${state.progression.nextContractNumber++}`;
  return {
    id,
    title: contractTitle(location, product.name),
    locationId: location.id,
    productId,
    requiredQuantity,
    deliveredQuantity: 0,
    issuedHour: state.worldTimeHours,
    deadlineHour,
    rewardMoney: Math.round(requiredQuantity * product.basePrice + 14 + location.footTraffic * 10),
    rewardPublicReputation: 1 + (location.safety >= 0.7 ? 1 : 0),
    rewardStreetReputation: location.rivalPressure >= 0.25 ? 2 : 1,
    failureHeat: location.policePresence >= 0.25 ? 4 : 2,
    failureRivalPressure: 0.08 + location.rivalPressure * 0.08,
    status: "active"
  };
}

function issueDailyContracts(state: GameState, events: GameEvent[]): void {
  const active = activeContracts(state);
  const openSlots = Math.max(0, 3 - active.length);
  if (openSlots === 0) {
    return;
  }

  const activeKeys = new Set(active.map((contract) => `${contract.locationId}:${contract.productId}`));
  const dayStart = Math.floor(state.worldTimeHours / 24) * 24;
  let deadlineHour = dayStart + 22;
  if (deadlineHour <= state.worldTimeHours + 4) {
    deadlineHour += 24;
  }

  const candidates = ownedMachines(state, state.playerFactionId)
    .map((machine) => state.locations[machine.locationId])
    .filter((location): location is Location => Boolean(location))
    .sort((a, b) => b.footTraffic + b.rivalPressure - (a.footTraffic + a.rivalPressure));

  let issued = 0;
  for (const location of candidates) {
    const options = contractProductOptions(location);
    const productId = options[(state.progression.nextContractNumber + issued) % options.length];
    const key = `${location.id}:${productId}`;
    if (activeKeys.has(key)) {
      continue;
    }

    const requiredQuantity = Math.max(6, Math.round(5 + location.footTraffic * 3 + issued * 2));
    const contract = createServiceContract(state, location, productId, requiredQuantity, deadlineHour);
    state.contracts[contract.id] = contract;
    activeKeys.add(key);
    issued += 1;
    log(state, events, `${contract.title} posted: deliver ${contract.requiredQuantity}x ${state.products[contract.productId].name}.`, "neutral");

    if (issued >= openSlots) {
      break;
    }
  }
}

function completeContract(state: GameState, events: GameEvent[], contract: ServiceContract): void {
  if (contract.status !== "active" || contract.deliveredQuantity < contract.requiredQuantity) {
    return;
  }

  const player = state.factions[state.playerFactionId];
  contract.status = "completed";
  contract.completedHour = state.worldTimeHours;
  player.money += contract.rewardMoney;
  player.publicReputation += contract.rewardPublicReputation;
  player.streetReputation += contract.rewardStreetReputation;
  state.progression.contractRewardsToday += contract.rewardMoney;
  state.progression.contractsCompletedToday += 1;

  const location = state.locations[contract.locationId];
  if (location) {
    location.rivalPressure = Math.max(0, location.rivalPressure - 0.08);
  }

  log(state, events, `${contract.title} completed. $${contract.rewardMoney} bonus paid.`, "good");
}

function applyContractDelivery(state: GameState, events: GameEvent[], machine: VendingMachine, productId: ProductId, quantity: number): void {
  let remainingDelivery = quantity;
  for (const contract of activeContracts(state)
    .filter((candidate) => candidate.locationId === machine.locationId && candidate.productId === productId)
    .sort((a, b) => a.deadlineHour - b.deadlineHour)) {
    if (remainingDelivery <= 0) {
      return;
    }

    const applied = Math.min(remainingDelivery, contractRemainingQuantity(contract));
    if (applied <= 0) {
      continue;
    }

    contract.deliveredQuantity += applied;
    remainingDelivery -= applied;
    completeContract(state, events, contract);
  }
}

function failExpiredContracts(state: GameState, events: GameEvent[]): void {
  const player = state.factions[state.playerFactionId];
  for (const contract of activeContracts(state)) {
    if (state.worldTimeHours < contract.deadlineHour || contract.deliveredQuantity >= contract.requiredQuantity) {
      continue;
    }

    contract.status = "failed";
    contract.failedHour = contract.deadlineHour;
    player.heat += contract.failureHeat;
    player.publicReputation = Math.max(0, player.publicReputation - 1);
    state.progression.contractPenaltiesToday += contract.failureHeat;
    state.progression.contractsFailedToday += 1;

    const location = state.locations[contract.locationId];
    if (location) {
      location.rivalPressure = Math.min(1, location.rivalPressure + contract.failureRivalPressure);
    }

    log(state, events, `${contract.title} missed. Heat and local pressure increased.`, "danger");
  }
}

function createDayReport(state: GameState, day: number): void {
  const machineRevenueStored = ownedMachines(state, state.playerFactionId).reduce((sum, machine) => sum + machine.revenueStored, 0);
  const report = {
    id: `day_report_${day}`,
    day,
    startHour: (day - 1) * 24,
    endHour: day * 24,
    revenueCollected: state.progression.revenueCollectedToday,
    machineRevenueStored,
    contractRewards: state.progression.contractRewardsToday,
    contractPenalties: state.progression.contractPenaltiesToday,
    contractsCompleted: state.progression.contractsCompletedToday,
    contractsFailed: state.progression.contractsFailedToday,
    stockSold: state.progression.stockSoldToday,
    rivalActions: state.progression.rivalActionsToday,
    summary:
      state.progression.contractsFailedToday > 0
        ? "Contracts slipped and rivals gained leverage."
        : state.progression.contractsCompletedToday > 0
          ? "Route promises paid out and the district noticed."
          : "Machines stayed active, but no contract bonuses landed."
  };

  state.dayReports = [report, ...state.dayReports].slice(0, 5);
}

function resetDailyProgression(state: GameState, day: number): void {
  state.progression.lastReportDay = day;
  state.progression.revenueCollectedToday = 0;
  state.progression.contractRewardsToday = 0;
  state.progression.contractPenaltiesToday = 0;
  state.progression.stockSoldToday = 0;
  state.progression.contractsCompletedToday = 0;
  state.progression.contractsFailedToday = 0;
  state.progression.rivalActionsToday = 0;
}

function processDayBoundaries(state: GameState, events: GameEvent[], previousHour: number): void {
  const previousDay = Math.floor(previousHour / 24);
  const currentDay = Math.floor(state.worldTimeHours / 24);
  if (currentDay <= previousDay) {
    return;
  }

  for (let day = Math.max(1, state.progression.lastReportDay + 1); day <= currentDay; day += 1) {
    createDayReport(state, day);
    log(state, events, `Day ${day} report filed: ${state.dayReports[0].summary}`, state.dayReports[0].contractsFailed > 0 ? "warning" : "good");
    resetDailyProgression(state, day);
    issueDailyContracts(state, events);
  }
}

function maybeCompleteMission(state: GameState, events: GameEvent[]): void {
  if (state.mission.completed) {
    return;
  }

  const progress = missionProgress(state);
  if (progress.ownedCount >= progress.target && progress.profitableCount >= progress.target) {
    state.mission.completed = true;
    state.factions[state.playerFactionId].money += 150;
    log(state, events, "Cinderblock Row is starting to feel like your territory. Expansion bonus paid.", "good");
  }
}

function applyAdvanceTime(state: GameState, events: GameEvent[], hours: number): void {
  const previousHour = state.worldTimeHours;
  state.worldTimeHours += hours;

  let playerEarned = 0;
  for (const machine of Object.values(state.machines)) {
    const previousStock = machineStockUnits(machine);
    const earned = runMachineSales(state, machine, hours);
    const stockSold = Math.max(0, previousStock - machineStockUnits(machine));
    if (machine.ownerFactionId === state.playerFactionId) {
      playerEarned += earned;
      state.progression.stockSoldToday += stockSold;
    } else {
      state.factions[machine.ownerFactionId].money += earned * 0.75;
    }
  }

  for (const location of Object.values(state.locations)) {
    location.rivalPressure = Math.max(0, location.rivalPressure - hours * 0.018);
  }

  const player = state.factions[state.playerFactionId];
  player.heat = Math.max(0, player.heat - hours * 0.12);

  if (playerEarned >= 18) {
    log(state, events, `Machines generated $${Math.round(playerEarned)} in stored revenue.`, "good");
  }

  failExpiredContracts(state, events);
  processDayBoundaries(state, events, previousHour);
}

export function reduceGameState(currentState: GameState, command: GameCommand): CommandResult {
  const state = cloneState(currentState);
  const events: GameEvent[] = [];
  const actor = getFactionOrThrow(state, command.actorId);

  switch (command.type) {
    case "advance_time": {
      applyAdvanceTime(state, events, command.hours);
      break;
    }

    case "buy_product": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const product = state.products[command.productId];
      if (state.player.carriedCrate || inventoryUnits(state.player.cargo, state) > 0) {
        log(state, events, "Hands are full. Drop the current crate at the garage or load a machine first.", "warning");
        break;
      }

      const affordable = Math.floor(actor.money / product.cost);
      const capacityLimited = Math.floor(cargoSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, affordable, capacityLimited));

      if (quantity <= 0) {
        log(state, events, "No room or cash for that crate.", "warning");
        break;
      }

      actor.money -= quantity * product.cost;
      state.player.carriedCrate = {
        productId: product.id,
        quantity,
        capacity: Math.floor(state.player.cargoCapacity / product.size),
        source: "supplier"
      };
      log(state, events, `Picked up a ${quantity}x ${product.name} crate for $${quantity * product.cost}.`, "good");
      break;
    }

    case "deposit_crate": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const crate = state.player.carriedCrate;
      if (!crate) {
        log(state, events, "No crate in hand to store.", "warning");
        break;
      }

      const product = state.products[crate.productId];
      const spaceLimited = Math.floor(garageStorageSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(crate.quantity, spaceLimited));
      if (quantity <= 0) {
        log(state, events, "Garage storage is full.", "warning");
        break;
      }

      state.player.garageStorage ??= {};
      addInventory(state.player.garageStorage, crate.productId, quantity);
      crate.quantity -= quantity;
      if (crate.quantity <= 0) {
        state.player.carriedCrate = null;
      }
      log(state, events, `Stored ${quantity}x ${product.name} at the garage.`, "good");
      break;
    }

    case "load_crate": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (state.player.carriedCrate) {
        log(state, events, "Already carrying a crate.", "warning");
        break;
      }

      const product = state.products[command.productId];
      const available = state.player.garageStorage?.[product.id] ?? 0;
      const capacityLimited = Math.floor(cargoSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, available, capacityLimited));

      if (quantity <= 0) {
        log(state, events, `No ${product.name} crates ready in the garage.`, "warning");
        break;
      }

      removeInventory(state.player.garageStorage, product.id, quantity);
      state.player.carriedCrate = {
        productId: product.id,
        quantity,
        capacity: Math.floor(state.player.cargoCapacity / product.size),
        source: "garage"
      };
      log(state, events, `Loaded ${quantity}x ${product.name} from garage storage.`, "good");
      break;
    }

    case "load_vehicle": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const vehicle = state.vehicles[command.vehicleId];
      const product = state.products[command.productId];
      if (!vehicle || !product) {
        break;
      }

      if (vehicle.locationId !== "garage") {
        log(state, events, `${vehicle.name} needs to be at the garage to load stock.`, "warning");
        break;
      }

      const available = state.player.garageStorage?.[product.id] ?? 0;
      const capacityLimited = Math.floor(vehicleSpaceRemaining(state, vehicle) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, available, capacityLimited));
      if (quantity <= 0) {
        log(state, events, `No room or ${product.name} stock for ${vehicle.name}.`, "warning");
        break;
      }

      removeInventory(state.player.garageStorage, product.id, quantity);
      addInventory(vehicle.inventory, product.id, quantity);
      log(state, events, `Loaded ${quantity}x ${product.name} into ${vehicle.name}.`, "good");
      break;
    }

    case "unload_vehicle": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const vehicle = state.vehicles[command.vehicleId];
      const product = state.products[command.productId];
      if (!vehicle || !product) {
        break;
      }

      if (vehicle.locationId !== "garage") {
        log(state, events, `${vehicle.name} needs to be at the garage to unload stock.`, "warning");
        break;
      }

      const available = vehicle.inventory[product.id] ?? 0;
      const capacityLimited = Math.floor(garageStorageSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, available, capacityLimited));
      if (quantity <= 0) {
        log(state, events, `No ${product.name} stock to unload or garage storage is full.`, "warning");
        break;
      }

      removeInventory(vehicle.inventory, product.id, quantity);
      addInventory(state.player.garageStorage, product.id, quantity);
      log(state, events, `Unloaded ${quantity}x ${product.name} from ${vehicle.name}.`, "good");
      break;
    }

    case "take_vehicle_crate": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (state.player.carriedCrate) {
        log(state, events, "Hands are full. Load the current crate first.", "warning");
        break;
      }

      const vehicle = state.vehicles[command.vehicleId];
      const product = state.products[command.productId];
      if (!vehicle || !product) {
        break;
      }

      const available = vehicle.inventory[product.id] ?? 0;
      const capacityLimited = Math.floor(cargoSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, available, capacityLimited));
      if (quantity <= 0) {
        log(state, events, `${vehicle.name} has no ${product.name} crate ready.`, "warning");
        break;
      }

      removeInventory(vehicle.inventory, product.id, quantity);
      state.player.carriedCrate = {
        productId: product.id,
        quantity,
        capacity: Math.floor(state.player.cargoCapacity / product.size),
        source: "vehicle"
      };
      log(state, events, `Pulled ${quantity}x ${product.name} from ${vehicle.name}.`, "good");
      break;
    }

    case "dispatch_vehicle": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const vehicle = state.vehicles[command.vehicleId];
      const location = state.locations[command.locationId];
      if (!vehicle || !location) {
        break;
      }

      if (vehicle.locationId === location.id) {
        log(state, events, `${vehicle.name} is already at ${location.name}.`, "neutral");
        break;
      }

      const travelHours = travelHoursBetweenLocations(state, vehicle.locationId, location.id, vehicle.speed);
      applyAdvanceTime(state, events, travelHours);
      vehicle.locationId = location.id;
      log(state, events, `${vehicle.name} moved to ${location.name}.`, "good");
      break;
    }

    case "select_route_task": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      state.routePlan.selectedTaskId = command.taskId;
      if (command.taskId) {
        log(state, events, "Route stop selected.", "neutral");
      }
      break;
    }

    case "stock_machine": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id) {
        break;
      }

      const product = state.products[command.productId];
      const available = state.player.carriedCrate?.productId === product.id ? state.player.carriedCrate.quantity : state.player.cargo[product.id] ?? 0;
      const slot = getOrCreateSlot(machine, product.id, product.basePrice);

      if (!slot) {
        log(state, events, `${machine.name} has no free product slot.`, "warning");
        break;
      }

      const quantity = Math.max(0, Math.min(command.quantity, available, slot.capacity - slot.quantity));
      if (quantity <= 0) {
        log(state, events, `No ${product.name} available to stock.`, "warning");
        break;
      }

      slot.quantity += quantity;
      removeCarriedProduct(state, product.id, quantity);
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `Loaded ${quantity}x ${product.name} into ${machine.name}.`, "good");
      applyContractDelivery(state, events, machine, product.id, quantity);
      break;
    }

    case "collect_revenue": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id || machine.revenueStored <= 0) {
        break;
      }

      const amount = Math.round(machine.revenueStored);
      actor.money += amount;
      machine.revenueStored = 0;
      machine.lastServicedHour = state.worldTimeHours;
      if (actor.id === state.playerFactionId) {
        state.progression.revenueCollectedToday += amount;
      }
      log(state, events, `Collected $${amount} from ${machine.name}.`, "good");
      break;
    }

    case "repair_machine": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id || machine.damage <= 0) {
        break;
      }

      const repairAmount = Math.min(35, machine.damage);
      const cost = Math.ceil(10 + repairAmount * 0.45);
      if (actor.money < cost) {
        log(state, events, `Repairs need $${cost}.`, "warning");
        break;
      }

      actor.money -= cost;
      machine.damage = Math.max(0, machine.damage - repairAmount);
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `Repaired ${machine.name} for $${cost}.`, "good");
      break;
    }

    case "place_machine": {
      const location = state.locations[command.locationId];
      if (!location || location.kind === "garage" || location.kind === "supplier") {
        break;
      }

      if (machineAtLocation(state, location.id)) {
        log(state, events, `${location.name} already has a machine.`, "warning");
        break;
      }

      if (actor.money < location.placementCost) {
        log(state, events, `${location.name} needs $${location.placementCost} to install a machine.`, "warning");
        break;
      }

      actor.money -= location.placementCost;
      const machine = createMachine(state, actor.id, location.id);
      log(state, events, `${machine.name} installed at ${location.name}.`, actor.id === state.playerFactionId ? "good" : "danger");
      if (actor.id === state.playerFactionId) {
        issueDailyContracts(state, events);
      }
      break;
    }

    case "set_slot_price": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id) {
        break;
      }

      const product = state.products[command.productId];
      const slot = machine.slots.find((candidate) => candidate.productId === command.productId);
      if (!product || !slot) {
        break;
      }

      const nextPrice = clampSlotPrice(command.price);
      if (slot.price === nextPrice) {
        break;
      }

      slot.price = nextPrice;
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `${product.name} now sells for $${nextPrice} at ${machine.name}.`, "neutral");
      break;
    }

    case "install_upgrade": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id) {
        break;
      }

      const upgrade = machineUpgrades[command.upgradeId];
      if (!upgrade) {
        break;
      }

      machine.upgrades ??= [];
      if (machineHasUpgrade(machine, upgrade.id)) {
        log(state, events, `${machine.name} already has ${upgrade.name}.`, "warning");
        break;
      }

      if (actor.money < upgrade.cost) {
        log(state, events, `${upgrade.name} needs $${upgrade.cost}.`, "warning");
        break;
      }

      actor.money -= upgrade.cost;
      machine.upgrades.push(upgrade.id);
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `${upgrade.name} installed on ${machine.name}.`, "good");
      break;
    }

    case "sabotage_machine": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId === actor.id) {
        break;
      }

      const damage = sabotageDamage(28, machine);
      machine.damage = Math.min(100, machine.damage + damage);
      actor.heat += 8;
      actor.streetReputation += 2;
      const location = state.locations[machine.locationId];
      location.rivalPressure = Math.max(0, location.rivalPressure - 0.15);
      log(state, events, `${machine.name}'s display is jammed. Heat rises.`, "danger");
      break;
    }

    case "rival_action": {
      const controller = state.npcControllers[actor.id];
      if (controller) {
        controller.lastActedHour = state.worldTimeHours;
      }
      if (actor.id !== state.playerFactionId) {
        state.progression.rivalActionsToday += 1;
      }

      if (command.action === "sabotage" && command.targetMachineId) {
        const target = state.machines[command.targetMachineId];
        if (target && target.ownerFactionId !== actor.id) {
          const baseDamage = 18 + Math.round((controller?.aggression ?? 0) * 8);
          target.damage = Math.min(100, target.damage + sabotageDamage(baseDamage, target));
          state.locations[target.locationId].rivalPressure = Math.min(1, state.locations[target.locationId].rivalPressure + 0.15);
          log(state, events, `${actor.name} roughed up ${target.name}.`, "danger");
        }
      }

      if (command.action === "undercut" && command.targetMachineId) {
        const target = state.machines[command.targetMachineId];
        if (target) {
          const location = state.locations[target.locationId];
          location.rivalPressure = Math.min(1, location.rivalPressure + 0.22);
          actor.money = Math.max(0, actor.money - 12);
          log(state, events, `${actor.name} is undercutting prices near ${location.name}.`, "warning");
        }
      }

      if (command.action === "expand" && command.locationId) {
        const location = state.locations[command.locationId];
        if (location && !machineAtLocation(state, location.id)) {
          createMachine(state, actor.id, location.id);
          actor.money = Math.max(0, actor.money - Math.round(location.placementCost * 0.65));
          log(state, events, `${actor.name} dropped a new machine at ${location.name}.`, "danger");
        }
      }
      break;
    }
  }

  maybeCompleteMission(state, events);

  return { state, events };
}

export function reduceCommands(state: GameState, commands: GameCommand[]): CommandResult {
  let nextState = state;
  const allEvents: GameEvent[] = [];

  for (const command of commands) {
    const result = reduceGameState(nextState, command);
    nextState = result.state;
    allEvents.push(...result.events);
  }

  return { state: nextState, events: allEvents };
}

export function mostProfitablePlayerMachine(state: GameState): VendingMachine | undefined {
  return ownedMachines(state, state.playerFactionId)
    .slice()
    .sort((a, b) => b.revenueStored + b.slots.length * 4 - (a.revenueStored + a.slots.length * 4))[0];
}
