import type {
  CommandResult,
  Employee,
  EmployeeRole,
  FactionId,
  GameCommand,
  GameEvent,
  GameEventTone,
  GameState,
  Location,
  MachineSlot,
  MachineAlarmKind,
  ProductId,
  ServiceContract,
  StreetActivity,
  StreetActivityKind,
  VendingMachine
} from "../core/types";
import {
  activeContracts,
  activeAlarmForMachine,
  cargoSpaceRemaining,
  contractRemainingQuantity,
  districtUnlockInfo,
  garageStorageSpaceRemaining,
  inventoryUnits,
  isDistrictUnlockedForPlacement,
  machineAtLocation,
  machineStockUnits,
  missionProgress,
  ownedMachines,
  placementCostForLocation,
  vehicleSpaceRemaining
} from "../core/selectors";
import { machineUpgrades } from "../content/machineUpgrades";
import { employeeRoles } from "../content/employees";
import { machineHasUpgrade, sabotageDamage } from "../core/machineStats";
import { runMachineSales } from "./economy";

const MACHINE_ALARM_RESPONSE_HOURS = 0.85;

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

function ensureStreetLifeState(state: GameState): void {
  state.streetLife ??= {
    activitySequence: 1,
    nextActivityHour: state.worldTimeHours + 0.18,
    recentActivities: []
  };
  state.streetLife.recentActivities ??= [];
}

function logStreetActivity(state: GameState, events: GameEvent[], activity: Omit<StreetActivity, "hour" | "id">): void {
  ensureStreetLifeState(state);
  const streetActivity: StreetActivity = {
    ...activity,
    id: `street_${state.streetLife.activitySequence++}`,
    hour: state.worldTimeHours
  };
  state.streetLife.recentActivities = [streetActivity, ...state.streetLife.recentActivities].slice(0, 10);
  log(state, events, activity.message, activity.tone);
}

function scheduleNextStreetActivity(state: GameState): void {
  ensureStreetLifeState(state);
  const sequence = state.streetLife.activitySequence;
  state.streetLife.nextActivityHour += 0.42 + (sequence % 5) * 0.1;
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

function ensurePlayerMachineAt(state: GameState, locationId: string): VendingMachine | undefined {
  const existing = machineAtLocation(state, locationId);
  if (existing?.ownerFactionId === state.playerFactionId) {
    return existing;
  }

  if (existing) {
    return undefined;
  }

  return createMachine(state, state.playerFactionId, locationId);
}

const employeeNames: Record<EmployeeRole, string[]> = {
  restocker: ["Mara", "Niko", "Sol"],
  collector: ["Jules", "Vera", "Rafi"],
  technician: ["Patch", "Inez", "Cal"]
};

function createEmployee(state: GameState, role: EmployeeRole): Employee {
  const definition = employeeRoles[role];
  const employeeNumber = state.nextEmployeeNumber++;
  const names = employeeNames[role];
  const name = `${names[(employeeNumber - 1) % names.length]} ${definition.title}`;

  return {
    assignedMachineIds: [],
    criminalTolerance: definition.criminalTolerance,
    employeeNumber,
    fear: definition.fear,
    id: `employee_${employeeNumber}`,
    lastWorkedHour: state.worldTimeHours,
    loyalty: definition.loyalty,
    name,
    reliability: definition.reliability,
    role,
    skill: definition.skill,
    speed: definition.speed,
    status: "idle",
    statusDetail: "Waiting for assignments.",
    wagePerDay: definition.wagePerDay
  };
}

function clampSlotPrice(price: number): number {
  return Math.max(1, Math.min(99, Math.round(price)));
}

function requirePlayerAtLocation(state: GameState, events: GameEvent[], locationId: string, actionLabel = "work this stop"): boolean {
  if (state.player.currentLocationId === locationId) {
    return true;
  }

  const location = state.locations[locationId];
  log(state, events, `Get to ${location?.name ?? "that stop"} before you ${actionLabel}.`, "warning");
  return false;
}

function canUseMachineRemotely(machine: VendingMachine, action: "collect" | "price"): boolean {
  if (action === "collect") {
    return machineHasUpgrade(machine, "cashless_terminal");
  }

  return machineHasUpgrade(machine, "remote_monitor");
}

function requirePlayerAtMachine(
  state: GameState,
  events: GameEvent[],
  machine: VendingMachine,
  actionLabel: string,
  remoteAction?: "collect" | "price"
): boolean {
  if (state.player.currentLocationId === machine.locationId) {
    return true;
  }

  if (remoteAction && canUseMachineRemotely(machine, remoteAction)) {
    return true;
  }

  return requirePlayerAtLocation(state, events, machine.locationId, actionLabel);
}

function alarmActionLabel(kind: MachineAlarmKind): string {
  if (kind === "sabotage") {
    return "sabotaging";
  }

  if (kind === "undercut") {
    return "rigging price stickers around";
  }

  return "tampering with";
}

function createMachineAlarm(state: GameState, events: GameEvent[], machine: VendingMachine, intruderFactionId: FactionId, kind: MachineAlarmKind, intensity: number): void {
  state.machineAlarms ??= {};
  const existing = activeAlarmForMachine(state, machine.id);
  const location = state.locations[machine.locationId];
  const intruder = state.factions[intruderFactionId];
  const expiresHour = state.worldTimeHours + MACHINE_ALARM_RESPONSE_HOURS;

  if (existing) {
    existing.expiresHour = Math.max(existing.expiresHour, expiresHour);
    existing.intensity = Math.max(existing.intensity, intensity);
    log(state, events, `ALARM still active: ${intruder?.name ?? "Someone"} is at ${machine.name}.`, "danger");
    return;
  }

  const alarm = {
    id: `alarm_${state.eventSequence}`,
    kind,
    machineId: machine.id,
    locationId: machine.locationId,
    intruderFactionId,
    startedHour: state.worldTimeHours,
    expiresHour,
    intensity,
    resolved: false
  };
  state.machineAlarms[alarm.id] = alarm;
  log(
    state,
    events,
    `ALARM: ${intruder?.name ?? "Someone"} is ${alarmActionLabel(kind)} ${machine.name} at ${location?.name ?? "the stop"}. Get there and confront them.`,
    "danger"
  );
}

function expireMachineAlarm(state: GameState, events: GameEvent[], alarmId: string): void {
  const alarm = state.machineAlarms?.[alarmId];
  if (!alarm || alarm.resolved) {
    return;
  }

  const machine = state.machines[alarm.machineId];
  if (!machine) {
    alarm.resolved = true;
    alarm.resolvedHour = state.worldTimeHours;
    alarm.outcome = "missed";
    return;
  }

  const location = state.locations[alarm.locationId];
  const intruder = state.factions[alarm.intruderFactionId];
  const baseDamage = alarm.kind === "undercut" ? Math.max(6, Math.round(alarm.intensity * 0.45)) : alarm.intensity;
  machine.damage = Math.min(100, machine.damage + sabotageDamage(baseDamage, machine));

  if (location) {
    location.rivalPressure = Math.min(1, location.rivalPressure + (alarm.kind === "undercut" ? 0.22 : 0.15));
  }

  alarm.resolved = true;
  alarm.resolvedHour = state.worldTimeHours;
  alarm.outcome = "missed";
  log(state, events, `Alarm missed: ${intruder?.name ?? "The intruder"} finished the job on ${machine.name}.`, "danger");
}

function resolveExpiredMachineAlarms(state: GameState, events: GameEvent[]): void {
  for (const alarm of Object.values(state.machineAlarms ?? {})) {
    if (!alarm.resolved && alarm.expiresHour <= state.worldTimeHours) {
      expireMachineAlarm(state, events, alarm.id);
    }
  }
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

function sortMachinesByTraffic(state: GameState, machines: VendingMachine[]): VendingMachine[] {
  return machines.slice().sort((a, b) => {
    const aLocation = state.locations[a.locationId];
    const bLocation = state.locations[b.locationId];
    return (bLocation?.footTraffic ?? 0) + b.visibility - ((aLocation?.footTraffic ?? 0) + a.visibility);
  });
}

function customerPurchase(state: GameState, events: GameEvent[]): boolean {
  const machines = sortMachinesByTraffic(
    state,
    ownedMachines(state, state.playerFactionId).filter((machine) => machine.damage < 92 && machine.slots.some((slot) => slot.quantity > 0))
  );
  const machine = machines[(state.streetLife.activitySequence - 1) % Math.max(1, machines.length)];
  if (!machine) {
    return false;
  }

  const stockedSlots = machine.slots.filter((slot) => slot.quantity > 0);
  const slot = stockedSlots[(state.streetLife.activitySequence - 1) % stockedSlots.length];
  const product = state.products[slot.productId];
  const owner = state.factions[machine.ownerFactionId];
  const location = state.locations[machine.locationId];
  slot.quantity -= 1;
  slot.salesAccumulator = Math.max(0, slot.salesAccumulator - 1);
  machine.revenueStored += slot.price;
  machine.heat += product.heat * 0.04;
  owner.heat += product.heat * 0.012;
  state.progression.stockSoldToday += 1;

  logStreetActivity(state, events, {
    actor: "customer",
    amount: slot.price,
    kind: "customer_purchase",
    locationId: machine.locationId,
    machineId: machine.id,
    message: `Customer bought ${product.name} from ${machine.name} at ${location?.name ?? "the block"}.`,
    productId: product.id,
    tone: "good"
  });
  return true;
}

function customerComplaint(state: GameState, events: GameEvent[]): boolean {
  const machines = ownedMachines(state, state.playerFactionId)
    .map((machine) => {
      const stock = machineStockUnits(machine);
      const score = (stock === 0 ? 4 : 0) + (machine.damage >= 65 ? 3 : machine.damage >= 35 ? 1 : 0);
      return { machine, score, stock };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const candidate = machines[0];
  if (!candidate) {
    return false;
  }

  const player = state.factions[state.playerFactionId];
  const location = state.locations[candidate.machine.locationId];
  player.publicReputation = Math.max(0, player.publicReputation - 0.1);
  if (location) {
    location.rivalPressure = Math.min(1, location.rivalPressure + 0.025);
  }

  const reason = candidate.stock === 0 ? "empty racks" : "a busted display";
  logStreetActivity(state, events, {
    actor: "customer",
    kind: "customer_complaint",
    locationId: candidate.machine.locationId,
    machineId: candidate.machine.id,
    message: `Customer walked away from ${candidate.machine.name}: ${reason}.`,
    tone: "warning"
  });
  return true;
}

function rivalScout(state: GameState, events: GameEvent[]): boolean {
  const target = mostProfitablePlayerMachine(state);
  const rival = state.factions.rival_redline;
  if (!target || !rival) {
    return false;
  }

  const location = state.locations[target.locationId];
  const controller = state.npcControllers[rival.id];
  const pressure = 0.035 + (controller?.aggression ?? 0.45) * 0.025;
  if (location) {
    location.rivalPressure = Math.min(1, location.rivalPressure + pressure);
  }
  rival.heat += 0.08;

  logStreetActivity(state, events, {
    actor: "scout",
    kind: "rival_scout",
    locationId: target.locationId,
    machineId: target.id,
    message: `${rival.name} scout watched ${target.name} and marked the stop.`,
    tone: "warning"
  });
  return true;
}

function workerSupply(state: GameState, events: GameEvent[]): boolean {
  const rival = state.factions.rival_redline;
  if (!rival) {
    return false;
  }

  const machine = ownedMachines(state, rival.id)
    .filter((candidate) => candidate.slots.length > 0)
    .sort((a, b) => machineStockUnits(a) - machineStockUnits(b))[0];
  const slot = machine?.slots.slice().sort((a, b) => a.quantity / a.capacity - b.quantity / b.capacity)[0];
  if (!machine || !slot || slot.quantity >= slot.capacity) {
    return false;
  }

  const product = state.products[slot.productId];
  const delivered = Math.min(slot.capacity - slot.quantity, 3 + (state.streetLife.activitySequence % 3));
  slot.quantity += delivered;
  rival.money = Math.max(0, rival.money - Math.round(delivered * product.cost * 0.7));

  logStreetActivity(state, events, {
    actor: "worker",
    amount: delivered,
    kind: "worker_supply",
    locationId: machine.locationId,
    machineId: machine.id,
    message: `Redline runner stocked ${delivered}x ${product.name} into ${machine.name}.`,
    productId: product.id,
    tone: "neutral"
  });
  return true;
}

function spawnDebugStreetActivity(state: GameState, events: GameEvent[], activity: StreetActivityKind): boolean {
  if (activity === "customer_purchase") {
    return customerPurchase(state, events);
  }

  if (activity === "customer_complaint") {
    return customerComplaint(state, events);
  }

  if (activity === "rival_scout") {
    return rivalScout(state, events);
  }

  return workerSupply(state, events);
}

function applyStreetActivity(state: GameState, events: GameEvent[]): void {
  ensureStreetLifeState(state);
  const activityIndex = (state.streetLife.activitySequence - 1) % 4;
  const handlers = [customerPurchase, customerComplaint, rivalScout, workerSupply];
  const preferred = handlers[activityIndex];
  if (preferred(state, events)) {
    return;
  }

  for (const handler of handlers) {
    if (handler !== preferred && handler(state, events)) {
      return;
    }
  }
}

function createServiceContract(state: GameState, location: Location, productId: ProductId, requiredQuantity: number, deadlineHour: number): ServiceContract {
  const product = state.products[productId];
  const district = state.districts[location.districtId];
  const rentMultiplier = district?.rentMultiplier ?? 1;
  const heatMultiplier = district ? Math.max(0.75, 1.35 - district.heatTolerance / 80) : 1;
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
    rewardMoney: Math.round((requiredQuantity * product.basePrice + 14 + location.footTraffic * 10) * rentMultiplier),
    rewardPublicReputation: 1 + (location.safety >= 0.7 ? 1 : 0),
    rewardStreetReputation: location.rivalPressure >= 0.25 ? 2 : 1,
    failureHeat: Math.round((location.policePresence >= 0.25 ? 4 : 2) * heatMultiplier),
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
    .filter((location) => isDistrictUnlockedForPlacement(state, location.districtId))
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
  state.progression.contractsCompletedTotal = (state.progression.contractsCompletedTotal ?? 0) + 1;

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

function machineCapacity(machine: VendingMachine): number {
  const filledSlotCapacity = machine.slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const openSlotCapacity = Math.max(0, machine.maxSlots - machine.slots.length) * 24;
  return filledSlotCapacity + openSlotCapacity;
}

function assignedPlayerMachines(state: GameState, employee: Employee): VendingMachine[] {
  return employee.assignedMachineIds
    .map((machineId) => state.machines[machineId])
    .filter((machine): machine is VendingMachine => Boolean(machine) && machine.ownerFactionId === state.playerFactionId);
}

function employeeWorkInterval(employee: Employee): number {
  return Math.max(0.55, 1.35 / Math.max(0.35, employee.speed));
}

function markEmployeeBlocked(employee: Employee, detail: string): void {
  employee.status = "blocked";
  employee.statusDetail = detail;
}

function sortedStoredProductsForMachine(state: GameState, machine: VendingMachine): ProductId[] {
  const location = state.locations[machine.locationId];
  const stored = Object.entries(state.player.garageStorage ?? {})
    .filter(([, quantity]) => quantity > 0)
    .map(([productId]) => productId as ProductId);
  const existing = machine.slots.map((slot) => slot.productId).filter((productId) => stored.includes(productId));
  const fresh = stored
    .filter((productId) => !existing.includes(productId))
    .sort((a, b) => {
      const productA = state.products[a];
      const productB = state.products[b];
      const scoreA = productA.demand + (location ? productA.demandTags.filter((tag) => location.demandTags.includes(tag)).length * 0.35 : 0);
      const scoreB = productB.demand + (location ? productB.demandTags.filter((tag) => location.demandTags.includes(tag)).length * 0.35 : 0);
      return scoreB - scoreA;
    });
  return [...existing, ...fresh];
}

function runRestocker(state: GameState, events: GameEvent[], employee: Employee): boolean {
  const machines = assignedPlayerMachines(state, employee)
    .filter((machine) => machineStockUnits(machine) / machineCapacity(machine) <= 0.72)
    .sort((a, b) => machineStockUnits(a) / machineCapacity(a) - machineStockUnits(b) / machineCapacity(b));

  if (machines.length === 0) {
    markEmployeeBlocked(employee, employee.assignedMachineIds.length === 0 ? "Assign a machine route." : "Assigned machines have enough stock.");
    return false;
  }

  for (const machine of machines) {
    for (const productId of sortedStoredProductsForMachine(state, machine)) {
      const product = state.products[productId];
      const available = state.player.garageStorage?.[productId] ?? 0;
      if (!product || available <= 0) {
        continue;
      }

      const slot = getOrCreateSlot(machine, product.id, product.basePrice);
      if (!slot) {
        continue;
      }

      const quantity = Math.min(slot.capacity - slot.quantity, available, Math.max(3, Math.round(4 + employee.skill * 8)));
      if (quantity <= 0) {
        continue;
      }

      removeInventory(state.player.garageStorage, product.id, quantity);
      slot.quantity += quantity;
      machine.lastServicedHour = state.worldTimeHours;
      employee.status = "working";
      employee.statusDetail = `Restocked ${machine.name}.`;
      applyContractDelivery(state, events, machine, product.id, quantity);
      log(state, events, `${employee.name} restocked ${quantity}x ${product.name} into ${machine.name}.`, "good");
      return true;
    }
  }

  markEmployeeBlocked(employee, "Garage storage has no useful stock.");
  return false;
}

function runCollector(state: GameState, events: GameEvent[], employee: Employee): boolean {
  const machines = assignedPlayerMachines(state, employee)
    .filter((machine) => machine.revenueStored >= 18)
    .sort((a, b) => b.revenueStored - a.revenueStored);
  const machine = machines[0];
  if (!machine) {
    markEmployeeBlocked(employee, employee.assignedMachineIds.length === 0 ? "Assign machines to collect." : "No assigned cash boxes ready.");
    return false;
  }

  const amount = Math.round(machine.revenueStored);
  const player = state.factions[state.playerFactionId];
  player.money += amount;
  machine.revenueStored = 0;
  machine.lastServicedHour = state.worldTimeHours;
  state.progression.revenueCollectedToday += amount;
  employee.status = "working";
  employee.statusDetail = `Collected from ${machine.name}.`;
  log(state, events, `${employee.name} collected $${amount} from ${machine.name}.`, "good");
  return true;
}

function runTechnician(state: GameState, events: GameEvent[], employee: Employee): boolean {
  const machines = assignedPlayerMachines(state, employee)
    .filter((machine) => machine.damage > 0)
    .sort((a, b) => b.damage - a.damage);
  const machine = machines[0];
  if (!machine) {
    markEmployeeBlocked(employee, employee.assignedMachineIds.length === 0 ? "Assign machines to maintain." : "Assigned machines are stable.");
    return false;
  }

  const repairAmount = Math.min(machine.damage, Math.round(10 + employee.skill * 24));
  const cost = Math.ceil(4 + repairAmount * 0.28);
  const player = state.factions[state.playerFactionId];
  if (player.money < cost) {
    markEmployeeBlocked(employee, `Needs $${cost} for parts.`);
    return false;
  }

  player.money -= cost;
  machine.damage = Math.max(0, machine.damage - repairAmount);
  machine.lastServicedHour = state.worldTimeHours;
  employee.status = "working";
  employee.statusDetail = `Repaired ${machine.name}.`;
  log(state, events, `${employee.name} repaired ${machine.name} for $${cost}.`, "good");
  return true;
}

function runEmployeeWork(state: GameState, events: GameEvent[], employee: Employee): boolean {
  if (employee.role === "restocker") {
    return runRestocker(state, events, employee);
  }

  if (employee.role === "collector") {
    return runCollector(state, events, employee);
  }

  return runTechnician(state, events, employee);
}

function applyEmployeeAutomation(state: GameState, events: GameEvent[]): void {
  for (const employee of Object.values(state.employees)) {
    const interval = employeeWorkInterval(employee);
    let workCount = 0;

    while (state.worldTimeHours - employee.lastWorkedHour >= interval && workCount < 3) {
      employee.lastWorkedHour += interval;
      runEmployeeWork(state, events, employee);
      workCount += 1;
    }
  }
}

function payEmployeeWages(state: GameState, events: GameEvent[]): void {
  const employees = Object.values(state.employees);
  if (employees.length === 0) {
    return;
  }

  const wageTotal = employees.reduce((sum, employee) => sum + employee.wagePerDay, 0);
  const player = state.factions[state.playerFactionId];
  const paid = Math.min(player.money, wageTotal);
  player.money -= paid;

  if (paid < wageTotal) {
    for (const employee of employees) {
      employee.loyalty = Math.max(0, employee.loyalty - 0.08);
      employee.reliability = Math.max(0.25, employee.reliability - 0.04);
      employee.status = "blocked";
      employee.statusDetail = "Crew was short-paid.";
    }
    log(state, events, `Crew wages were short by $${wageTotal - paid}. Loyalty slipped.`, "warning");
    return;
  }

  log(state, events, `Paid $${wageTotal} in crew wages.`, "neutral");
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
    payEmployeeWages(state, events);
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
  ensureStreetLifeState(state);
  state.worldTimeHours += hours;
  resolveExpiredMachineAlarms(state, events);

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

  applyEmployeeAutomation(state, events);

  let streetActivities = 0;
  while (state.streetLife.nextActivityHour <= state.worldTimeHours && streetActivities < 8) {
    applyStreetActivity(state, events);
    scheduleNextStreetActivity(state);
    streetActivities += 1;
  }
  if (state.streetLife.nextActivityHour <= state.worldTimeHours) {
    state.streetLife.nextActivityHour = state.worldTimeHours + 0.3;
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

    case "set_player_location": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      state.player.currentLocationId = command.locationId && state.locations[command.locationId] ? command.locationId : null;
      break;
    }

    case "buy_product": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "supplier", "buy stock")) {
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

      if (!requirePlayerAtLocation(state, events, "garage", "store stock")) {
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

      if (!requirePlayerAtLocation(state, events, "garage", "load route crates")) {
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

      if (!requirePlayerAtLocation(state, events, "garage", "load the van")) {
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

      if (!requirePlayerAtLocation(state, events, "garage", "unload the van")) {
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

      if (!requirePlayerAtLocation(state, events, vehicle.locationId, "pull stock from the van")) {
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

    case "scout_district": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const district = state.districts[command.districtId];
      if (!district) {
        break;
      }

      const progress = districtUnlockInfo(state, district.id).progress;
      if (progress.access !== "locked") {
        log(state, events, `${district.name} is already mapped.`, "neutral");
        break;
      }

      if (actor.money < district.scoutCost) {
        log(state, events, `Scouting ${district.name} needs $${district.scoutCost}.`, "warning");
        break;
      }

      actor.money -= district.scoutCost;
      state.districtProgress[district.id] = {
        access: "scouted",
        districtId: district.id,
        scoutedHour: state.worldTimeHours
      };
      log(state, events, `${district.name} scouted. Requirements and machine pads are now visible.`, "good");
      log(state, events, `Map intel updated: ${district.name} is marked in amber until the setup fee is paid.`, "neutral");
      break;
    }

    case "unlock_district": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const district = state.districts[command.districtId];
      if (!district) {
        break;
      }

      const info = districtUnlockInfo(state, district.id);
      if (info.progress.access === "unlocked") {
        log(state, events, `${district.name} is already open for operations.`, "neutral");
        break;
      }

      if (info.progress.access !== "scouted") {
        log(state, events, `Scout ${district.name} before you move machines in.`, "warning");
        break;
      }

      if (info.unmetRequirements.length > 0) {
        log(state, events, `${district.name} still needs: ${info.unmetRequirements.join(", ")}.`, "warning");
        break;
      }

      if (actor.money < district.unlockCost) {
        log(state, events, `Opening ${district.name} needs $${district.unlockCost}.`, "warning");
        break;
      }

      actor.money -= district.unlockCost;
      state.districtProgress[district.id] = {
        access: "unlocked",
        districtId: district.id,
        scoutedHour: info.progress.scoutedHour ?? state.worldTimeHours,
        unlockedHour: state.worldTimeHours
      };
      log(state, events, `${district.name} unlocked. New placement pads are active.`, "good");
      log(state, events, `Crews spread the word: ${district.name} is open for vending territory.`, "good");
      break;
    }

    case "debug_grant_cash": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const amount = Math.max(0, Math.round(command.amount));
      actor.money += amount;
      log(state, events, `Debug cash injected: +$${amount}.`, "neutral");
      break;
    }

    case "debug_complete_requirements": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      actor.money = Math.max(actor.money, 500);
      actor.streetReputation = Math.max(actor.streetReputation, 1);
      state.progression.contractsCompletedTotal = Math.max(state.progression.contractsCompletedTotal ?? 0, 1);
      ensurePlayerMachineAt(state, "gym");
      log(state, events, "Debug setup complete: starter expansion requirements are satisfied.", "good");
      break;
    }

    case "debug_set_district_access": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const district = state.districts[command.districtId];
      if (!district) {
        break;
      }

      state.districtProgress[district.id] = {
        access: command.access,
        districtId: district.id,
        ...(command.access === "scouted" || command.access === "unlocked" ? { scoutedHour: state.worldTimeHours } : {}),
        ...(command.access === "unlocked" ? { unlockedHour: state.worldTimeHours } : {})
      };
      log(state, events, `Debug district state: ${district.name} is now ${command.access}.`, command.access === "unlocked" ? "good" : "neutral");
      break;
    }

    case "debug_set_rival_pressure": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const location = state.locations[command.locationId];
      if (!location) {
        break;
      }

      location.rivalPressure = Math.max(0, Math.min(1, command.amount));
      log(state, events, `Debug pressure set at ${location.name}: ${Math.round(location.rivalPressure * 100)}%.`, location.rivalPressure >= 0.5 ? "warning" : "neutral");
      break;
    }

    case "debug_spawn_activity": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!spawnDebugStreetActivity(state, events, command.activity)) {
        log(state, events, `Debug activity could not spawn: ${command.activity}.`, "warning");
      }
      break;
    }

    case "hire_employee": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const role = employeeRoles[command.role];
      if (!role) {
        break;
      }

      if (actor.money < role.hireCost) {
        log(state, events, `${role.title} needs $${role.hireCost} to hire.`, "warning");
        break;
      }

      actor.money -= role.hireCost;
      const employee = createEmployee(state, role.role);
      state.employees[employee.id] = employee;
      log(state, events, `${employee.name} joined the route crew.`, "good");
      break;
    }

    case "assign_employee": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const employee = state.employees[command.employeeId];
      const machine = state.machines[command.machineId];
      if (!employee || !machine || machine.ownerFactionId !== actor.id) {
        break;
      }

      const assignments = new Set(employee.assignedMachineIds);
      if (command.assigned) {
        assignments.add(machine.id);
        employee.status = "idle";
        employee.statusDetail = `Assigned to ${machine.name}.`;
        log(state, events, `${employee.name} assigned to ${machine.name}.`, "neutral");
      } else {
        assignments.delete(machine.id);
        employee.status = assignments.size > 0 ? "idle" : "blocked";
        employee.statusDetail = assignments.size > 0 ? "Route assignment updated." : "Assign a machine route.";
        log(state, events, `${employee.name} removed from ${machine.name}.`, "neutral");
      }

      employee.assignedMachineIds = [...assignments];
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

      if (!requirePlayerAtMachine(state, events, machine, "stock this machine")) {
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

      if (actor.id === state.playerFactionId && !requirePlayerAtMachine(state, events, machine, "collect cash", "collect")) {
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

      if (actor.id === state.playerFactionId && !requirePlayerAtMachine(state, events, machine, "repair this machine")) {
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

      if (actor.id === state.playerFactionId && !requirePlayerAtLocation(state, events, location.id, "install a machine")) {
        break;
      }

      if (machineAtLocation(state, location.id)) {
        log(state, events, `${location.name} already has a machine.`, "warning");
        break;
      }

      if (!isDistrictUnlockedForPlacement(state, location.districtId)) {
        const district = state.districts[location.districtId];
        log(state, events, `${district?.name ?? "This district"} is locked. Scout and open it before installing machines.`, "warning");
        break;
      }

      const placementCost = placementCostForLocation(state, location);
      if (actor.money < placementCost) {
        log(state, events, `${location.name} needs $${placementCost} to install a machine.`, "warning");
        break;
      }

      actor.money -= placementCost;
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

      if (actor.id === state.playerFactionId && !requirePlayerAtMachine(state, events, machine, "change prices", "price")) {
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

      if (actor.id === state.playerFactionId && !requirePlayerAtMachine(state, events, machine, "install upgrades")) {
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

      if (actor.id !== state.playerFactionId && machine.ownerFactionId === state.playerFactionId) {
        createMachineAlarm(state, events, machine, actor.id, "sabotage", 28);
        break;
      }

      if (actor.id === state.playerFactionId && !requirePlayerAtMachine(state, events, machine, "sabotage this machine")) {
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

    case "confront_alarm": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const alarm = state.machineAlarms?.[command.alarmId];
      const machine = alarm ? state.machines[alarm.machineId] : undefined;
      if (!alarm || !machine || alarm.resolved || machine.ownerFactionId !== state.playerFactionId) {
        break;
      }

      if (alarm.expiresHour <= state.worldTimeHours) {
        expireMachineAlarm(state, events, alarm.id);
        break;
      }

      if (!requirePlayerAtMachine(state, events, machine, "confront the intruder")) {
        break;
      }

      const intruder = state.factions[alarm.intruderFactionId];
      const location = state.locations[alarm.locationId];
      alarm.resolved = true;
      alarm.resolvedHour = state.worldTimeHours;
      alarm.outcome = "confronted";
      machine.damage = Math.min(100, machine.damage + sabotageDamage(4, machine));
      machine.lastServicedHour = state.worldTimeHours;
      actor.streetReputation += 1;
      actor.heat += 1;
      if (intruder) {
        intruder.heat += 2;
      }
      if (location) {
        location.rivalPressure = Math.max(0, location.rivalPressure - 0.06);
      }
      log(state, events, `You confronted ${intruder?.name ?? "the intruder"} at ${machine.name}. They ran before finishing the job.`, "good");
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
          if (target.ownerFactionId === state.playerFactionId) {
            createMachineAlarm(state, events, target, actor.id, "sabotage", baseDamage);
            break;
          }

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
        if (location && !machineAtLocation(state, location.id) && isDistrictUnlockedForPlacement(state, location.districtId)) {
          const cost = Math.round(placementCostForLocation(state, location) * 0.65);
          if (actor.money < cost) {
            break;
          }

          createMachine(state, actor.id, location.id);
          actor.money = Math.max(0, actor.money - cost);
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
