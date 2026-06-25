import type {
  BaseFacilityId,
  CommandResult,
  Employee,
  EmployeeRole,
  FactionId,
  FinanceLedgerCategory,
  GameCommand,
  GameEvent,
  GameEventTone,
  GameState,
  InsurancePlan,
  LawInspection,
  Location,
  MachineModelId,
  MachineSlot,
  MachineAlarmKind,
  PlacementMethod,
  ProductCustomizationMode,
  ProductId,
  ServiceContract,
  StreetActivity,
  StreetActivityKind,
  VendingMachine
} from "../core/types";
import {
  activeContracts,
  activeAlarmForMachine,
  activeMachineAlarms,
  activeLawInspections,
  baseFacilityLevel,
  baseFacilityUpgradeCost,
  baseSecurityScore,
  baseStorageCapacity,
  coldStorageProtection,
  cargoSpaceRemaining,
  contractRemainingQuantity,
  currentProductCost,
  districtProgress,
  districtUnlockInfo,
  employeeCapacity,
  garageStorageSpaceRemaining,
  inventoryUnits,
  installedMachines,
  isMachineInstalled,
  isDistrictUnlockedForPlacement,
  machineAtLocation,
  machineStockUnits,
  missionProgress,
  ownedMachines,
  placementQuoteForLocation,
  placementCostForLocation,
  productLabSlots,
  repairCostForMachine,
  regionalManagerCapacity,
  routeDangerScore,
  routeRiskReduction,
  storedPlayerMachines,
  vehicleSpaceRemaining
} from "../core/selectors";
import { machineUpgrades } from "../content/machineUpgrades";
import { machineModels } from "../content/machineModels";
import { baseFacilities } from "../content/baseFacilities";
import { employeeRoles } from "../content/employees";
import { machineHasUpgrade, sabotageDamage } from "../core/machineStats";
import { runMachineSales } from "./economy";

const MACHINE_ALARM_RESPONSE_HOURS = 0.85;
const INSPECTION_RESPONSE_HOURS = 1.1;
const STARTER_MACHINE_ID = "machine_player_1";
const STARTER_LOCATION_ID = "laundromat";

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

function ensureLawState(state: GameState): void {
  state.law ??= {
    inspectionSequence: 1,
    nextInspectionHour: state.worldTimeHours + 4,
    activeInspections: {},
    inspectionsToday: 0,
    finesToday: 0,
    confiscatedUnitsToday: 0,
    lastInspectionHour: 0
  };
  state.law.activeInspections ??= {};
  state.law.inspectionSequence ??= 1;
  state.law.nextInspectionHour ??= state.worldTimeHours + 4;
  state.law.inspectionsToday ??= 0;
  state.law.finesToday ??= 0;
  state.law.confiscatedUnitsToday ??= 0;
  state.law.lastInspectionHour ??= 0;
}

function ensureConflictState(state: GameState): void {
  state.conflict ??= {
    eventSequence: 1,
    nextConflictHour: state.worldTimeHours + 4.5,
    activeEvents: {},
    resolvedToday: 0,
    missedToday: 0
  };
  state.conflict.eventSequence ??= 1;
  state.conflict.nextConflictHour ??= state.worldTimeHours + 4.5;
  state.conflict.activeEvents ??= {};
  state.conflict.resolvedToday ??= 0;
  state.conflict.missedToday ??= 0;
}

function ensureBaseState(state: GameState): void {
  state.base ??= {
    facilities: Object.fromEntries(
      Object.values(baseFacilities).map((facility) => [
        facility.id,
        {
          id: facility.id,
          level: facility.id === "garage_storage" ? 1 : 0,
          upgradedHour: facility.id === "garage_storage" ? state.worldTimeHours : undefined
        }
      ])
    ) as GameState["base"]["facilities"],
    securityReadiness: 0.15
  };
  state.base.facilities ??= {} as GameState["base"]["facilities"];
  for (const facility of Object.values(baseFacilities)) {
    state.base.facilities[facility.id] ??= {
      id: facility.id,
      level: facility.id === "garage_storage" ? 1 : 0,
      upgradedHour: facility.id === "garage_storage" ? state.worldTimeHours : undefined
    };
  }
  state.base.securityReadiness ??= 0.15;
}

function ensureEconomyState(state: GameState): void {
  state.economy ??= {
    finance: {
      ledger: [],
      nextEntryNumber: 1,
      revenueToday: 0,
      expensesToday: 0,
      frontBusinessRevenueToday: 0,
      insurancePlan: "none"
    },
    supply: {
      nextVolatilityHour: state.worldTimeHours + 4,
      volatility: 0.08,
      priceMultipliers: {},
      supplierMood: "stable"
    },
    traffic: {
      nextTrafficHour: state.worldTimeHours + 2,
      congestionByLocation: {},
      fuelPrice: 2.2,
      checkpoints: {},
      vehicleMaintenanceDue: {},
    },
    spoilage: {
      nextSpoilageHour: state.worldTimeHours + 6,
      spoiledToday: 0
    },
    productCustomizations: {}
  };
  state.economy.finance ??= {
    ledger: [],
    nextEntryNumber: 1,
    revenueToday: 0,
    expensesToday: 0,
    frontBusinessRevenueToday: 0,
    insurancePlan: "none"
  };
  state.economy.finance.ledger ??= [];
  state.economy.finance.nextEntryNumber ??= 1;
  state.economy.finance.revenueToday ??= 0;
  state.economy.finance.expensesToday ??= 0;
  state.economy.finance.frontBusinessRevenueToday ??= 0;
  state.economy.finance.insurancePlan ??= "none";
  state.economy.supply ??= {
    nextVolatilityHour: state.worldTimeHours + 4,
    volatility: 0.08,
    priceMultipliers: {},
    supplierMood: "stable"
  };
  state.economy.supply.priceMultipliers ??= {};
  state.economy.supply.nextVolatilityHour ??= state.worldTimeHours + 4;
  state.economy.supply.volatility ??= 0.08;
  state.economy.supply.supplierMood ??= "stable";
  state.economy.traffic ??= {
    nextTrafficHour: state.worldTimeHours + 2,
    congestionByLocation: {},
    fuelPrice: 2.2,
    checkpoints: {},
    vehicleMaintenanceDue: {}
  };
  state.economy.traffic.congestionByLocation ??= {};
  state.economy.traffic.checkpoints ??= {};
  state.economy.traffic.vehicleMaintenanceDue ??= {};
  state.economy.traffic.nextTrafficHour ??= state.worldTimeHours + 2;
  state.economy.traffic.fuelPrice ??= 2.2;
  for (const vehicleId of Object.keys(state.vehicles ?? {})) {
    state.economy.traffic.vehicleMaintenanceDue[vehicleId] ??= 0;
  }
  state.economy.spoilage ??= {
    nextSpoilageHour: state.worldTimeHours + 6,
    spoiledToday: 0
  };
  state.economy.spoilage.nextSpoilageHour ??= state.worldTimeHours + 6;
  state.economy.spoilage.spoiledToday ??= 0;
  state.economy.productCustomizations ??= {};
}

const insurancePlans: Record<InsurancePlan, { dailyCost: number; coverage: number; label: string }> = {
  none: { dailyCost: 0, coverage: 0, label: "No insurance" },
  basic: { dailyCost: 9, coverage: 0.35, label: "Basic insurance" },
  premium: { dailyCost: 22, coverage: 0.68, label: "Premium insurance" }
};

const customizationModes: Record<ProductCustomizationMode, { cost: number; costDelta: number; demandBonus: number; heatDelta: number; label: string }> = {
  value_pack: {
    label: "Value pack",
    cost: 55,
    demandBonus: 0.1,
    costDelta: -0.35,
    heatDelta: 0.05
  },
  premium_wrap: {
    label: "Premium wrap",
    cost: 75,
    demandBonus: 0.18,
    costDelta: 0.4,
    heatDelta: 0
  },
  discreet_label: {
    label: "Discreet label",
    cost: 95,
    demandBonus: 0.04,
    costDelta: 0.25,
    heatDelta: -0.38
  }
};

function recordFinance(state: GameState, category: FinanceLedgerCategory, amount: number, description: string): void {
  ensureEconomyState(state);
  if (amount === 0) {
    return;
  }

  const entry = {
    id: `ledger_${state.economy.finance.nextEntryNumber++}`,
    hour: state.worldTimeHours,
    category,
    amount: Math.round(amount),
    description
  };
  state.economy.finance.ledger = [entry, ...state.economy.finance.ledger].slice(0, 80);
  if (entry.amount > 0) {
    state.economy.finance.revenueToday += entry.amount;
  } else {
    state.economy.finance.expensesToday += Math.abs(entry.amount);
  }
}

function chargePlayer(state: GameState, category: FinanceLedgerCategory, amount: number, description: string): void {
  const player = state.factions[state.playerFactionId];
  player.money -= amount;
  recordFinance(state, category, -amount, description);
}

function creditPlayer(state: GameState, category: FinanceLedgerCategory, amount: number, description: string): void {
  const player = state.factions[state.playerFactionId];
  player.money += amount;
  recordFinance(state, category, amount, description);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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

function machineModelForPlacement(ownerFactionId: FactionId, placementMethod: PlacementMethod, location?: Location): MachineModelId {
  if (ownerFactionId !== statePlayerFallback && placementMethod === "rival_territory") {
    return location?.demandTags.includes("night") ? "discreet_black_market" : "combo_machine";
  }

  if (placementMethod === "hidden") {
    return "hidden_wall_unit";
  }

  if (placementMethod === "illegal" || placementMethod === "rival_territory") {
    return location?.rivalPressure && location.rivalPressure >= 0.45 ? "armored_unit" : "discreet_black_market";
  }

  if (location?.demandTags.includes("office")) {
    return "luxury_vendor";
  }

  if (location?.demandTags.includes("commuter")) {
    return "drink_machine";
  }

  return "combo_machine";
}

const statePlayerFallback = "player";

function createMachine(state: GameState, ownerFactionId: FactionId, locationId: string, placementMethod: PlacementMethod = "legal_contract"): VendingMachine {
  const id = `machine_${ownerFactionId}_${state.nextMachineNumber++}`;
  const location = state.locations[locationId];
  const machineModelId = machineModelForPlacement(ownerFactionId, placementMethod, location);
  const model = machineModels[machineModelId];
  const owner = state.factions[ownerFactionId];
  const ownerLabel = ownerFactionId === state.playerFactionId ? "Street Unit" : `${owner?.name.split(" ")[0] ?? "Rival"} Unit`;
  const machine: VendingMachine = {
    id,
    name: `${ownerLabel} ${state.nextMachineNumber - 1}`,
    ownerFactionId,
    machineModelId,
    locationId,
    placementStatus: "installed",
    placementMethod,
    slots: [],
    maxSlots: model.maxSlots,
    revenueStored: 0,
    damage: Math.max(0, ownerFactionId === state.playerFactionId ? 12 - model.durabilityBonus * 20 : 0),
    security: clamp01(0.2 + model.securityBonus),
    visibility: Math.max(0.2, Math.min(1.35, (location.kind === "transit" ? 0.95 : 0.8) + model.visibilityBonus)),
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
  technician: ["Patch", "Inez", "Cal"],
  guard: ["Brick", "Tess", "Dima"],
  scout: ["Lena", "Omar", "Scout"],
  negotiator: ["Mina", "Ro", "Sable"],
  runner: ["Kade", "Pax", "Rue"],
  regional_manager: ["Marin", "Case", "Vale"]
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
    level: 1,
    loyalty: definition.loyalty,
    name,
    reliability: definition.reliability,
    role,
    skill: definition.skill,
    speed: definition.speed,
    status: "idle",
    statusDetail: "Waiting for assignments.",
    wagePerDay: definition.wagePerDay,
    xp: 0
  };
}

function awardEmployeeXp(state: GameState, events: GameEvent[], employee: Employee, amount: number): void {
  if (employee.betrayed) {
    return;
  }

  employee.xp = (employee.xp ?? 0) + amount;
  employee.level ??= 1;
  const threshold = employee.level * 12;
  if (employee.xp < threshold || employee.level >= 5) {
    return;
  }

  employee.xp -= threshold;
  employee.level += 1;
  employee.skill = Math.min(0.96, employee.skill + 0.045);
  employee.reliability = Math.min(0.96, employee.reliability + 0.035);
  employee.speed = Math.min(1.45, employee.speed + 0.025);
  employee.loyalty = Math.min(1, employee.loyalty + 0.025);
  log(state, events, `${employee.name} reached level ${employee.level}.`, "good");
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
  if (alarm.kind === "undercut" && machine.id === STARTER_MACHINE_ID) {
    triggerStarterRetaliation(state, events, "Redline saw the laundromat route go unanswered");
  }
}

function resolveExpiredMachineAlarms(state: GameState, events: GameEvent[]): void {
  for (const alarm of Object.values(state.machineAlarms ?? {})) {
    if (!alarm.resolved && alarm.expiresHour <= state.worldTimeHours) {
      expireMachineAlarm(state, events, alarm.id);
    }
  }
}

function removeStockUnitsFromMachine(machine: VendingMachine, units: number): number {
  let remaining = Math.max(0, Math.round(units));
  let removed = 0;
  const sortedSlots = machine.slots.slice().sort((a, b) => b.quantity - a.quantity);

  for (const slot of sortedSlots) {
    if (remaining <= 0) {
      break;
    }

    const taken = Math.min(slot.quantity, remaining);
    slot.quantity -= taken;
    remaining -= taken;
    removed += taken;
  }

  machine.slots = machine.slots.filter((slot) => slot.quantity > 0);
  return removed;
}

function removeStockUnitsFromInventory(inventory: Record<string, number>, units: number): number {
  let remaining = Math.max(0, Math.round(units));
  let removed = 0;

  for (const [productId, quantity] of Object.entries(inventory).sort((a, b) => b[1] - a[1])) {
    if (remaining <= 0) {
      break;
    }

    const taken = Math.min(quantity, remaining);
    inventory[productId] = quantity - taken;
    if (inventory[productId] <= 0) {
      delete inventory[productId];
    }
    remaining -= taken;
    removed += taken;
  }

  return removed;
}

function finishInspection(
  state: GameState,
  events: GameEvent[],
  inspection: LawInspection,
  status: "resolved" | "missed",
  message: string,
  tone: GameEventTone = "warning"
): void {
  inspection.status = status;
  inspection.resolvedHour = state.worldTimeHours;
  state.law.lastInspectionHour = state.worldTimeHours;
  log(state, events, message, tone);
}

function missInspection(state: GameState, events: GameEvent[], inspection: LawInspection): void {
  if (inspection.status !== "active") {
    return;
  }

  const player = state.factions[state.playerFactionId];
  const machine = state.machines[inspection.machineId];
  const location = state.locations[inspection.locationId];
  const paid = Math.min(player.money, inspection.fine);
  player.money -= paid;
  recordFinance(state, "fines", -paid, "Missed inspection fine");
  player.heat += inspection.severity * 1.8;
  player.publicReputation = Math.max(0, player.publicReputation - 1);
  state.law.finesToday += inspection.fine;

  let confiscated = 0;
  if (machine) {
    confiscated = removeStockUnitsFromMachine(machine, inspection.confiscatedUnits);
    machine.heat = Math.max(0, machine.heat - inspection.severity * 0.25);
    machine.lastInspectedHour = state.worldTimeHours;
  }

  state.law.confiscatedUnitsToday += confiscated;
  if (location) {
    location.rivalPressure = Math.min(1, location.rivalPressure + 0.05);
  }

  finishInspection(
    state,
    events,
    inspection,
    "missed",
    `Inspection missed: $${inspection.fine} fine posted and ${confiscated} stock confiscated.`,
    "danger"
  );
}

function resolveExpiredInspections(state: GameState, events: GameEvent[]): void {
  ensureLawState(state);
  for (const inspection of activeLawInspections(state)) {
    if (inspection.deadlineHour <= state.worldTimeHours) {
      missInspection(state, events, inspection);
    }
  }
}

function activeConflictEvents(state: GameState) {
  ensureConflictState(state);
  return Object.values(state.conflict.activeEvents).filter((event) => event.status === "active");
}

function createConflictEvent(
  state: GameState,
  events: GameEvent[],
  kind: "route_ambush" | "base_raid" | "street_chase",
  locationId: string,
  threatFactionId: FactionId,
  intensity: number,
  message: string,
  targetMachineId?: string
): void {
  ensureConflictState(state);
  if (activeConflictEvents(state).some((event) => event.kind === kind && event.locationId === locationId)) {
    return;
  }

  const event = {
    id: `conflict_${state.conflict.eventSequence++}`,
    kind,
    locationId,
    threatFactionId,
    startedHour: state.worldTimeHours,
    expiresHour: state.worldTimeHours + (kind === "route_ambush" ? 0.65 : kind === "street_chase" ? 0.55 : 1.2),
    intensity,
    status: "active" as const,
    message,
    targetMachineId
  };
  state.conflict.activeEvents[event.id] = event;
  log(state, events, message, "danger");
}

function chooseThreatFaction(state: GameState): FactionId {
  const rivals = Object.values(state.factions)
    .filter((faction) => faction.type === "npc")
    .sort((a, b) => b.streetReputation + b.heat * 0.2 - (a.streetReputation + a.heat * 0.2));
  return rivals[0]?.id ?? "rival_redline";
}

function missConflictEvent(state: GameState, events: GameEvent[], eventId: string): void {
  const event = state.conflict.activeEvents[eventId];
  if (!event || event.status !== "active") {
    return;
  }

  const player = state.factions[state.playerFactionId];
  const location = state.locations[event.locationId];
  const threat = state.factions[event.threatFactionId];
  event.status = "missed";
  event.resolvedHour = state.worldTimeHours;
  state.conflict.missedToday += 1;
  player.heat += Math.max(1, event.intensity * 0.28);
  player.publicReputation = Math.max(0, player.publicReputation - 0.4);
  if (threat) {
    threat.streetReputation += 0.6;
  }
  if (location) {
    location.rivalPressure = Math.min(1, location.rivalPressure + 0.12);
  }

  if (event.kind === "base_raid") {
    const removed = removeStockUnitsFromInventory(state.player.garageStorage ?? {}, Math.ceil(event.intensity * 0.8));
    const cashLost = Math.min(player.money, Math.round(10 + event.intensity * 1.4));
    player.money -= cashLost;
    recordFinance(state, "sabotage", -cashLost, "Base raid losses");
    const insurance = insurancePlans[state.economy.finance.insurancePlan];
    const reimbursement = Math.round(cashLost * insurance.coverage);
    if (reimbursement > 0) {
      creditPlayer(state, "insurance", reimbursement, `${insurance.label} raid reimbursement`);
    }
    log(state, events, `Base defense missed: ${removed} garage stock and $${cashLost} were lost.`, "danger");
    return;
  }

  if (event.kind === "route_ambush") {
    const vehicle = Object.values(state.vehicles).find((candidate) => candidate.locationId === event.locationId);
    const removed = vehicle ? removeStockUnitsFromInventory(vehicle.inventory, Math.ceil(event.intensity * 0.45)) : 0;
    log(state, events, `Route ambush missed: ${removed} van stock was scattered and local pressure rose.`, "danger");
    return;
  }

  log(state, events, "Street chase missed: witnesses talked and heat climbed.", "danger");
}

function resolveExpiredConflictEvents(state: GameState, events: GameEvent[]): void {
  ensureConflictState(state);
  for (const event of activeConflictEvents(state)) {
    if (event.expiresHour <= state.worldTimeHours) {
      missConflictEvent(state, events, event.id);
    }
  }
}

function scheduleNextConflict(state: GameState): void {
  const player = state.factions[state.playerFactionId];
  const pressure = Object.values(state.locations).reduce((highest, location) => Math.max(highest, location.rivalPressure), 0);
  const compression = Math.min(2.4, player.heat * 0.06 + pressure * 0.8);
  state.conflict.nextConflictHour = state.worldTimeHours + Math.max(2.2, 6.2 - compression);
}

function maybeSpawnAmbientConflict(state: GameState, events: GameEvent[]): void {
  ensureConflictState(state);
  if (state.conflict.nextConflictHour > state.worldTimeHours || activeConflictEvents(state).length > 0) {
    return;
  }

  const player = state.factions[state.playerFactionId];
  const playerMachines = installedMachines(state, state.playerFactionId);
  const highPressureMachine = playerMachines
    .map((machine) => ({ machine, location: state.locations[machine.locationId] }))
    .filter(({ location }) => Boolean(location))
    .sort((a, b) => (b.location?.rivalPressure ?? 0) - (a.location?.rivalPressure ?? 0))[0];

  if (player.heat >= 12 && state.progression.starterMachinePlaced) {
    createConflictEvent(
      state,
      events,
      "base_raid",
      "garage",
      chooseThreatFaction(state),
      Math.ceil(14 + player.heat * 0.45),
      "BASE DEFENSE: a crew is probing the storage garage. Get back or trigger lockdown."
    );
    scheduleNextConflict(state);
    return;
  }

  if (highPressureMachine?.location && highPressureMachine.location.rivalPressure >= 0.62) {
    createConflictEvent(
      state,
      events,
      "street_chase",
      highPressureMachine.machine.locationId,
      chooseThreatFaction(state),
      Math.ceil(12 + highPressureMachine.location.rivalPressure * 18),
      `${state.factions[chooseThreatFaction(state)]?.name ?? "A rival"} crew is baiting a street chase near ${highPressureMachine.location.name}.`,
      highPressureMachine.machine.id
    );
    scheduleNextConflict(state);
    return;
  }

  scheduleNextConflict(state);
}

function employeeRouteAvoidanceScore(state: GameState, locationId: string): number {
  const location = state.locations[locationId];
  if (!location) {
    return 0;
  }

  return Object.values(state.employees).reduce((score, employee) => {
    if (employee.betrayed) {
      return score;
    }

    if (employee.role === "scout") {
      return score + 0.06 + employee.skill * 0.08;
    }

    if (employee.role === "runner" && employee.assignedMachineIds.some((machineId) => state.machines[machineId]?.locationId === locationId)) {
      return score + 0.05 + employee.speed * 0.04;
    }

    if (employee.role === "regional_manager") {
      const managesDistrict = employee.assignedMachineIds.length === 0
        ? installedMachines(state, state.playerFactionId).some((machine) => state.locations[machine.locationId]?.districtId === location.districtId)
        : employee.assignedMachineIds.some((machineId) => state.locations[state.machines[machineId]?.locationId ?? ""]?.districtId === location.districtId);
      return managesDistrict ? score + 0.08 + employee.skill * 0.06 : score;
    }

    return score;
  }, 0);
}

function maybeTriggerRouteAmbush(state: GameState, events: GameEvent[], vehicleId: string, locationId: string): void {
  const vehicle = state.vehicles[vehicleId];
  const location = state.locations[locationId];
  if (!vehicle || !location) {
    return;
  }

  const player = state.factions[state.playerFactionId];
  const danger = routeDangerScore(state, location, vehicle);
  const avoidance = employeeRouteAvoidanceScore(state, locationId) + routeRiskReduction(state);
  const risk = location.rivalPressure * 1.8 + (1 - location.safety) * 0.9 + player.heat * 0.03 + Math.max(0, 0.5 - vehicle.security) + danger.score - avoidance;
  if (risk < 2.25 || activeConflictEvents(state).some((event) => event.locationId === locationId)) {
    if (risk >= 1.55 && avoidance > 0.12) {
      log(state, events, `Route intel helped ${vehicle.name} avoid trouble near ${location.name}.`, "good");
    }
    return;
  }

  createConflictEvent(
    state,
    events,
    "route_ambush",
    locationId,
    chooseThreatFaction(state),
    Math.ceil(9 + risk * 5),
    `ROUTE AMBUSH: trouble is waiting near ${location.name}. Drive out or fight through it.`
  );
}

function shiftSupplierMarket(state: GameState, events: GameEvent[]): void {
  ensureEconomyState(state);
  if (state.economy.supply.nextVolatilityHour > state.worldTimeHours) {
    return;
  }

  const productIds = Object.keys(state.products) as ProductId[];
  const phase = Math.floor(state.worldTimeHours / 4) + state.economy.finance.nextEntryNumber;
  const moodIndex = phase % 4;
  state.economy.supply.supplierMood = moodIndex === 0 ? "discount" : moodIndex === 1 ? "stable" : moodIndex === 2 ? "scarce" : "blackout";
  state.economy.supply.volatility = 0.06 + (phase % 5) * 0.025;
  for (const [index, productId] of productIds.entries()) {
    const product = state.products[productId];
    const wave = ((phase + index * 2) % 7) - 3;
    const moodPressure = state.economy.supply.supplierMood === "discount" ? -0.08 : state.economy.supply.supplierMood === "scarce" ? 0.1 : state.economy.supply.supplierMood === "blackout" && product.legality > 0 ? 0.18 : 0;
    state.economy.supply.priceMultipliers[productId] = Math.max(0.72, Math.min(1.55, 1 + wave * state.economy.supply.volatility * 0.28 + moodPressure));
  }
  state.economy.supply.nextVolatilityHour = state.worldTimeHours + 4 + (phase % 3);
  log(state, events, `Supplier market shifted: ${state.economy.supply.supplierMood} pricing is active.`, state.economy.supply.supplierMood === "discount" ? "good" : "warning");
}

function updateTrafficAndCheckpoints(state: GameState, events: GameEvent[]): void {
  ensureEconomyState(state);
  if (state.economy.traffic.nextTrafficHour > state.worldTimeHours) {
    return;
  }

  for (const [checkpointId, checkpoint] of Object.entries(state.economy.traffic.checkpoints)) {
    if (checkpoint.expiresHour <= state.worldTimeHours) {
      delete state.economy.traffic.checkpoints[checkpointId];
    }
  }

  const phase = Math.floor(state.worldTimeHours / 2) + state.eventSequence;
  for (const [index, location] of Object.values(state.locations).entries()) {
    if (location.kind === "garage" || location.kind === "supplier") {
      state.economy.traffic.congestionByLocation[location.id] = 0.12;
      continue;
    }

    const pulse = ((phase + index * 3) % 9) / 10;
    state.economy.traffic.congestionByLocation[location.id] = Math.max(0.05, Math.min(0.9, pulse * location.footTraffic * 0.58));
  }

  state.economy.traffic.fuelPrice = Math.round((2 + (phase % 6) * 0.22 + (state.economy.supply.supplierMood === "scarce" ? 0.32 : 0)) * 10) / 10;
  const checkpointCandidate = Object.values(state.locations)
    .filter((location) => location.kind !== "garage" && location.kind !== "supplier" && location.policePresence >= 0.25)
    .sort((a, b) => b.policePresence + (state.economy.traffic.congestionByLocation[b.id] ?? 0) - (a.policePresence + (state.economy.traffic.congestionByLocation[a.id] ?? 0)))[phase % Math.max(1, Object.values(state.locations).length)];
  if (checkpointCandidate && phase % 3 === 0) {
    const checkpointId = `checkpoint_${phase}_${checkpointCandidate.id}`;
    state.economy.traffic.checkpoints[checkpointId] = {
      id: checkpointId,
      locationId: checkpointCandidate.id,
      severity: Math.max(1, Math.ceil(checkpointCandidate.policePresence * 5)),
      expiresHour: state.worldTimeHours + 2.5
    };
    log(state, events, `Police checkpoint reported near ${checkpointCandidate.name}.`, "warning");
  }

  state.economy.traffic.nextTrafficHour = state.worldTimeHours + 2;
}

function spoilInventory(
  state: GameState,
  inventory: Record<string, number>,
  hours: number,
  protection: number
): number {
  let spoiled = 0;
  for (const [productId, quantity] of Object.entries(inventory)) {
    const product = state.products[productId as ProductId];
    if (!product?.shelfLifeHours || quantity <= 0) {
      continue;
    }

    const risk = Math.max(0, (hours / product.shelfLifeHours) * (1 - protection));
    const removed = Math.min(quantity, Math.floor(quantity * risk));
    if (removed <= 0) {
      continue;
    }

    inventory[productId] = quantity - removed;
    if (inventory[productId] <= 0) {
      delete inventory[productId];
    }
    spoiled += removed;
  }
  return spoiled;
}

function applySpoilage(state: GameState, events: GameEvent[]): void {
  ensureEconomyState(state);
  let cycles = 0;
  while (state.economy.spoilage.nextSpoilageHour <= state.worldTimeHours && cycles < 6) {
    const hours = 6;
    const garageSpoiled = spoilInventory(state, state.player.garageStorage ?? {}, hours, coldStorageProtection(state));
    const vehicleSpoiled = Object.values(state.vehicles).reduce((sum, vehicle) => sum + spoilInventory(state, vehicle.inventory, hours, 0.1), 0);
    state.economy.spoilage.spoiledToday += garageSpoiled + vehicleSpoiled;
    state.economy.spoilage.nextSpoilageHour += hours;
    cycles += 1;
  }

  if (cycles > 0 && state.economy.spoilage.spoiledToday > 0) {
    log(state, events, `${state.economy.spoilage.spoiledToday} perishable stock spoiled today. Cold storage reduces future losses.`, "warning");
  }
}

function applyRouteCheckpoint(state: GameState, events: GameEvent[], vehicleId: string, locationId: string): void {
  ensureEconomyState(state);
  const vehicle = state.vehicles[vehicleId];
  const checkpoint = Object.values(state.economy.traffic.checkpoints).find((candidate) => candidate.locationId === locationId && candidate.expiresHour > state.worldTimeHours);
  if (!vehicle || !checkpoint) {
    return;
  }

  const illegalUnits = Object.entries(vehicle.inventory).reduce((sum, [productId, quantity]) => {
    const product = state.products[productId as ProductId];
    return sum + (product?.legality ?? 0) * quantity;
  }, 0);
  const player = state.factions[state.playerFactionId];
  if (illegalUnits <= 0) {
    player.publicReputation = Math.max(0, player.publicReputation - 0.05);
    log(state, events, `${vehicle.name} cleared a checkpoint near ${state.locations[locationId]?.name ?? "the stop"}.`, "neutral");
    return;
  }

  const fine = Math.round(8 + checkpoint.severity * 6 + illegalUnits * 0.8);
  const paid = Math.min(player.money, fine);
  player.money -= paid;
  recordFinance(state, "fines", -paid, "Police checkpoint fine");
  player.heat += checkpoint.severity + illegalUnits * 0.08;
  const confiscated = removeStockUnitsFromInventory(vehicle.inventory, Math.ceil(checkpoint.severity + illegalUnits * 0.1));
  state.law.finesToday += fine;
  state.law.confiscatedUnitsToday += confiscated;
  log(state, events, `Checkpoint hit ${vehicle.name}: $${fine} fine risk and ${confiscated} stock confiscated.`, "danger");
}

function applyDailyOperatingEconomy(state: GameState, events: GameEvent[]): void {
  ensureEconomyState(state);
  const player = state.factions[state.playerFactionId];
  const officeIncome = (baseFacilities.office.effectsPerLevel.frontBusinessIncome ?? 0) * baseFacilityLevel(state, "office");
  const legalMachineIncome = installedMachines(state, state.playerFactionId).filter((machine) => machine.placementMethod === "legal_contract").length * 2;
  const frontIncome = Math.round(officeIncome + legalMachineIncome);
  if (frontIncome > 0) {
    creditPlayer(state, "front_business", frontIncome, "Front-business daily receipts");
    state.economy.finance.frontBusinessRevenueToday += frontIncome;
    log(state, events, `Front-business receipts added $${frontIncome}.`, "good");
  }

  const rent = Math.ceil(6 + baseStorageCapacity(state) * 0.012 + garageStorageSpaceRemaining(state) * 0.002);
  const rentPaid = Math.min(player.money, rent);
  player.money -= rentPaid;
  recordFinance(state, "rent", -rentPaid, "Base storage rent");
  if (rentPaid < rent) {
    player.publicReputation = Math.max(0, player.publicReputation - 0.2);
    log(state, events, `Storage rent was short by $${rent - rentPaid}.`, "warning");
  }

  const insurance = insurancePlans[state.economy.finance.insurancePlan];
  if (insurance.dailyCost > 0) {
    const paid = Math.min(player.money, insurance.dailyCost);
    player.money -= paid;
    recordFinance(state, "insurance", -paid, `${insurance.label} premium`);
    if (paid < insurance.dailyCost) {
      state.economy.finance.insurancePlan = "none";
      log(state, events, "Insurance lapsed after a missed premium.", "warning");
    }
  }
}

function placementRiskScore(method: PlacementMethod): number {
  if (method === "legal_contract") {
    return 0.2;
  }

  if (method === "hidden") {
    return 0.45;
  }

  if (method === "bribe") {
    return 1.25;
  }

  if (method === "rival_territory") {
    return 1.75;
  }

  return 2.2;
}

function inspectionRiskScore(state: GameState, machine: VendingMachine): number {
  const location = state.locations[machine.locationId];
  if (!location || !isMachineInstalled(machine)) {
    return 0;
  }

  const stockRisk = machine.slots.reduce((sum, slot) => {
    const product = state.products[slot.productId];
    return sum + (product?.legality ?? 0) * 1.3 + (product?.heat ?? 0) * 0.22;
  }, 0);
  const heatRisk = machine.heat * 0.38 + (state.factions[machine.ownerFactionId]?.heat ?? 0) * 0.08;
  const policingRisk = location.policePresence * 5 + Math.max(0, 1 - location.safety) * 1.5;
  const visibilityRisk = Math.max(0.2, machine.visibility) * 0.55;

  return stockRisk + heatRisk + policingRisk + visibilityRisk + placementRiskScore(machine.placementMethod ?? "legal_contract");
}

function inspectionReason(machine: VendingMachine): string {
  if (machine.placementMethod === "illegal") {
    return "unpermitted placement";
  }

  if (machine.placementMethod === "bribe") {
    return "paperwork mismatch";
  }

  if (machine.placementMethod === "rival_territory") {
    return "territory complaint";
  }

  if (machine.placementMethod === "hidden") {
    return "concealed alcove check";
  }

  return "routine permit check";
}

function chooseInspectionTarget(state: GameState): VendingMachine | undefined {
  return installedMachines(state, state.playerFactionId)
    .filter((machine) => !activeLawInspections(state).some((inspection) => inspection.machineId === machine.id))
    .map((machine) => ({ machine, score: inspectionRiskScore(state, machine) }))
    .filter(({ score }) => score >= 2.5)
    .sort((a, b) => b.score - a.score)[0]?.machine;
}

function createInspection(state: GameState, events: GameEvent[], machine: VendingMachine): void {
  ensureLawState(state);
  const location = state.locations[machine.locationId];
  const severity = Math.max(1, Math.min(5, Math.ceil(inspectionRiskScore(state, machine) / 2.5)));
  const inspection: LawInspection = {
    id: `inspection_${state.law.inspectionSequence++}`,
    machineId: machine.id,
    locationId: machine.locationId,
    startedHour: state.worldTimeHours,
    deadlineHour: state.worldTimeHours + INSPECTION_RESPONSE_HOURS,
    severity,
    status: "active",
    fine: Math.round(14 + severity * 11 + location.policePresence * 18),
    confiscatedUnits: Math.min(machineStockUnits(machine), Math.max(1, Math.round(2 + severity * 1.5))),
    reason: inspectionReason(machine)
  };
  state.law.activeInspections[inspection.id] = inspection;
  state.law.inspectionsToday += 1;
  machine.lastInspectedHour = state.worldTimeHours;
  log(state, events, `Inspection notice at ${machine.name}: ${inspection.reason}. Answer before fines and confiscation.`, "warning");
}

function scheduleNextInspection(state: GameState): void {
  const playerHeat = state.factions[state.playerFactionId]?.heat ?? 0;
  const heatCompression = Math.min(2.2, playerHeat * 0.08);
  const sequenceOffset = (state.law.inspectionSequence % 4) * 0.35;
  state.law.nextInspectionHour = state.worldTimeHours + Math.max(1.6, 4.8 - heatCompression + sequenceOffset);
}

function applyLawInspections(state: GameState, events: GameEvent[]): void {
  ensureLawState(state);
  resolveExpiredInspections(state, events);

  if (state.law.nextInspectionHour > state.worldTimeHours) {
    return;
  }

  const target = chooseInspectionTarget(state);
  if (target) {
    createInspection(state, events, target);
  }

  scheduleNextInspection(state);
}

function starterMachine(state: GameState): VendingMachine | undefined {
  return state.machines[STARTER_MACHINE_ID];
}

function triggerStarterRetaliation(state: GameState, events: GameEvent[], reason: string): void {
  if (state.progression.firstRetaliationTriggered) {
    return;
  }

  const machine = starterMachine(state);
  if (!machine || !isMachineInstalled(machine)) {
    return;
  }

  state.progression.firstRetaliationTriggered = true;
  log(state, events, `Redline retaliation triggered: ${reason}.`, "danger");
  createMachineAlarm(state, events, machine, "rival_redline", "sabotage", 22);
}

function maybeTriggerStarterUndercut(state: GameState, events: GameEvent[], playerEarned = 0): void {
  if (state.progression.firstUndercutTriggered) {
    return;
  }

  const machine = starterMachine(state);
  if (!machine || !isMachineInstalled(machine) || machine.locationId !== STARTER_LOCATION_ID) {
    return;
  }

  const hasFirstCashSignal = machine.revenueStored >= 18 || state.progression.revenueCollectedToday >= 18 || playerEarned >= 18 || state.progression.contractsCompletedToday > 0;
  if (!hasFirstCashSignal) {
    return;
  }

  const rival = state.factions.rival_redline;
  const location = state.locations[machine.locationId];
  state.progression.firstUndercutTriggered = true;
  if (location) {
    location.rivalPressure = Math.min(1, location.rivalPressure + 0.28);
  }
  if (rival) {
    rival.money = Math.max(0, rival.money - 12);
  }
  log(state, events, "Redline undercut your laundromat route with cut-rate stickers and supplier rumors.", "warning");
  createMachineAlarm(state, events, machine, "rival_redline", "undercut", 12);
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
    return ["energy", "protein_bar", "water", "soda", "hygiene_kit"];
  }

  if (location.demandTags.includes("arcade")) {
    return ["chips", "glitch_gum", "mystery_capsules", "mood_fizz", "soda"];
  }

  if (location.demandTags.includes("commuter")) {
    return ["coffee_can", "water", "phone_charger", "umbrella", "energy"];
  }

  if (location.demandTags.includes("laundry")) {
    return ["soda", "chips", "hygiene_kit", "coffee_can", "water"];
  }

  if (location.demandTags.includes("student")) {
    return ["chips", "coffee_can", "instant_noodles", "focus_cubes", "soda"];
  }

  if (location.demandTags.includes("night")) {
    return ["mood_fizz", "night_syrup", "coffee_can", "luxury_snack", "energy"];
  }

  if (location.demandTags.includes("office")) {
    return ["coffee_can", "luxury_snack", "phone_charger", "focus_cubes", "water"];
  }

  if (location.demandTags.includes("utility")) {
    return ["hygiene_kit", "instant_noodles", "phone_charger", "water"];
  }

  return ["soda", "chips", "water", "coffee_can"];
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
    installedMachines(state, state.playerFactionId).filter((machine) => machine.damage < 92 && machine.slots.some((slot) => slot.quantity > 0))
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
  const machines = installedMachines(state, state.playerFactionId)
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

  const machine = installedMachines(state, rival.id)
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
  const contractNumber = state.progression.nextContractNumber;
  const id = `contract_${state.progression.nextContractNumber++}`;
  if (contractNumber === 1 && location.id === STARTER_LOCATION_ID && productId === "soda") {
    return {
      id,
      title: "Foam & Fold soda promise",
      locationId: location.id,
      productId,
      requiredQuantity: 6,
      deliveredQuantity: 0,
      issuedHour: state.worldTimeHours,
      deadlineHour,
      rewardMoney: 36,
      rewardPublicReputation: 2,
      rewardStreetReputation: 1,
      failureHeat: 3,
      failureRivalPressure: 0.12,
      status: "active"
    };
  }

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

  const candidates = installedMachines(state, state.playerFactionId)
    .map((machine) => state.locations[machine.locationId])
    .filter((location): location is Location => Boolean(location))
    .filter((location) => isDistrictUnlockedForPlacement(state, location.districtId))
    .sort((a, b) => b.footTraffic + b.rivalPressure - (a.footTraffic + a.rivalPressure));

  let issued = 0;
  for (const location of candidates) {
    const options = contractProductOptions(location);
    const productId = options[(state.progression.nextContractNumber + issued - 1) % options.length];
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
  creditPlayer(state, "contracts", contract.rewardMoney, `${contract.title} reward`);
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
    .filter((machine): machine is VendingMachine => Boolean(machine) && machine.ownerFactionId === state.playerFactionId && isMachineInstalled(machine));
}

function employeeWorkInterval(employee: Employee): number {
  if (employee.role === "guard") {
    return Math.max(0.35, 0.62 / Math.max(0.35, employee.speed));
  }

  if (employee.role === "regional_manager") {
    return Math.max(1.4, 2.4 / Math.max(0.35, employee.speed));
  }

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
  creditPlayer(state, "sales", amount, `${machine.name} cash collection`);
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

  chargePlayer(state, "maintenance", cost, `${machine.name} technician parts`);
  machine.damage = Math.max(0, machine.damage - repairAmount);
  machine.lastServicedHour = state.worldTimeHours;
  employee.status = "working";
  employee.statusDetail = `Repaired ${machine.name}.`;
  log(state, events, `${employee.name} repaired ${machine.name} for $${cost}.`, "good");
  return true;
}

function runGuard(state: GameState, events: GameEvent[], employee: Employee): boolean {
  const assignedIds = new Set(employee.assignedMachineIds);
  const alarm = Object.values(state.machineAlarms ?? {}).find((candidate) => !candidate.resolved && assignedIds.has(candidate.machineId));
  if (alarm) {
    const machine = state.machines[alarm.machineId];
    const intruder = state.factions[alarm.intruderFactionId];
    alarm.resolved = true;
    alarm.resolvedHour = state.worldTimeHours;
    alarm.outcome = "confronted";
    if (machine) {
      machine.damage = Math.min(100, machine.damage + sabotageDamage(3, machine));
      machine.lastServicedHour = state.worldTimeHours;
    }
    employee.status = "working";
    employee.statusDetail = `Drove off a crew at ${machine?.name ?? "a machine"}.`;
    employee.fear = Math.min(1, employee.fear + 0.02);
    employee.loyalty = Math.min(1, employee.loyalty + 0.01);
    log(state, events, `${employee.name} intercepted ${intruder?.name ?? "an intruder"} before the hit landed.`, "good");
    return true;
  }

  const machines = assignedPlayerMachines(state, employee)
    .map((machine) => ({ machine, location: state.locations[machine.locationId] }))
    .filter(({ location }) => Boolean(location) && location.rivalPressure > 0.08)
    .sort((a, b) => (b.location?.rivalPressure ?? 0) - (a.location?.rivalPressure ?? 0));
  const patrol = machines[0];
  if (!patrol?.location) {
    markEmployeeBlocked(employee, employee.assignedMachineIds.length === 0 ? "Assign machines to guard." : "Assigned stops are quiet.");
    return false;
  }

  patrol.location.rivalPressure = Math.max(0, patrol.location.rivalPressure - (0.06 + employee.skill * 0.08));
  employee.status = "working";
  employee.statusDetail = `Patrolled ${patrol.machine.name}.`;
  log(state, events, `${employee.name} patrolled ${patrol.location.name} and cooled local pressure.`, "good");
  return true;
}

function runScout(state: GameState, events: GameEvent[], employee: Employee): boolean {
  const player = state.factions[state.playerFactionId];
  const candidate = Object.values(state.districts)
    .filter((district) => districtProgress(state, district.id).access === "locked")
    .filter((district) => district.scoutCost > 0)
    .sort((a, b) => a.scoutCost - b.scoutCost)[0];

  if (!candidate) {
    markEmployeeBlocked(employee, "No locked districts left to map.");
    return false;
  }

  const cost = Math.max(4, Math.ceil(candidate.scoutCost * (0.65 - employee.skill * 0.18)));
  if (player.money < cost) {
    markEmployeeBlocked(employee, `Needs $${cost} for scouting ${candidate.name}.`);
    return false;
  }

  player.money -= cost;
  state.districtProgress[candidate.id] = {
    access: "scouted",
    districtId: candidate.id,
    scoutedHour: state.worldTimeHours
  };
  employee.status = "working";
  employee.statusDetail = `Mapped ${candidate.name}.`;
  log(state, events, `${employee.name} scouted ${candidate.name} for $${cost}.`, "good");
  return true;
}

function runNegotiator(state: GameState, events: GameEvent[], employee: Employee): boolean {
  const machines = assignedPlayerMachines(state, employee)
    .map((machine) => ({ machine, location: state.locations[machine.locationId] }))
    .filter(({ location }) => Boolean(location) && location.rivalPressure > 0.04)
    .sort((a, b) => (b.location?.rivalPressure ?? 0) - (a.location?.rivalPressure ?? 0));
  const target = machines[0];
  if (!target?.location) {
    markEmployeeBlocked(employee, employee.assignedMachineIds.length === 0 ? "Assign stops to negotiate." : "No assigned pressure to negotiate.");
    return false;
  }

  const player = state.factions[state.playerFactionId];
  target.location.rivalPressure = Math.max(0, target.location.rivalPressure - (0.05 + employee.skill * 0.06));
  player.publicReputation += 0.08;
  employee.status = "working";
  employee.statusDetail = `Smoothed over ${target.location.name}.`;
  log(state, events, `${employee.name} cooled landlord pressure around ${target.location.name}.`, "good");
  return true;
}

function runRegionalManager(state: GameState, events: GameEvent[], employee: Employee): boolean {
  const districtScores = Object.values(state.districts)
    .map((district) => {
      const machines = assignedPlayerMachines(state, employee).filter((machine) => state.locations[machine.locationId]?.districtId === district.id);
      const fallbackMachines = installedMachines(state, state.playerFactionId).filter((machine) => state.locations[machine.locationId]?.districtId === district.id);
      const managedMachines = machines.length > 0 ? machines : fallbackMachines;
      const pressure = managedMachines.reduce((sum, machine) => sum + (state.locations[machine.locationId]?.rivalPressure ?? 0), 0);
      return { district, machines: managedMachines, score: managedMachines.length * 2 + pressure * 4 };
    })
    .filter((candidate) => candidate.machines.length > 0)
    .sort((a, b) => b.score - a.score);
  const target = districtScores[0];
  if (!target) {
    markEmployeeBlocked(employee, "Needs an active district to manage.");
    return false;
  }

  const pressureDrop = 0.025 + employee.skill * 0.035;
  for (const machine of target.machines) {
    const location = state.locations[machine.locationId];
    if (location) {
      location.rivalPressure = Math.max(0, location.rivalPressure - pressureDrop);
    }
  }

  for (const crew of Object.values(state.employees)) {
    if (crew.id !== employee.id && !crew.betrayed && crew.assignedMachineIds.some((machineId) => target.machines.some((machine) => machine.id === machineId))) {
      crew.reliability = Math.min(0.97, crew.reliability + 0.008);
      crew.loyalty = Math.min(1, crew.loyalty + 0.006);
    }
  }

  employee.status = "working";
  employee.statusDetail = `Managed ${target.district.name}.`;
  log(state, events, `${employee.name} coordinated ${target.district.name} and tightened route discipline.`, "good");
  return true;
}

function runEmployeeWork(state: GameState, events: GameEvent[], employee: Employee): boolean {
  if (employee.betrayed) {
    markEmployeeBlocked(employee, "Removed from operations.");
    return false;
  }

  if (employee.role === "restocker") {
    return runRestocker(state, events, employee);
  }

  if (employee.role === "runner") {
    return runRestocker(state, events, employee);
  }

  if (employee.role === "collector") {
    return runCollector(state, events, employee);
  }

  if (employee.role === "technician") {
    return runTechnician(state, events, employee);
  }

  if (employee.role === "guard") {
    return runGuard(state, events, employee);
  }

  if (employee.role === "scout") {
    return runScout(state, events, employee);
  }

  if (employee.role === "regional_manager") {
    return runRegionalManager(state, events, employee);
  }

  return runNegotiator(state, events, employee);
}

function applyEmployeeAutomation(state: GameState, events: GameEvent[]): void {
  for (const employee of Object.values(state.employees)) {
    if (employee.betrayed) {
      continue;
    }

    const interval = employeeWorkInterval(employee);
    let workCount = 0;

    while (state.worldTimeHours - employee.lastWorkedHour >= interval && workCount < 3) {
      employee.lastWorkedHour += interval;
      const worked = runEmployeeWork(state, events, employee);
      if (worked) {
        awardEmployeeXp(state, events, employee, employee.role === "regional_manager" ? 4 : 3);
      }
      workCount += 1;
    }
  }
}

function maybeTriggerEmployeeBetrayal(state: GameState, events: GameEvent[], employee: Employee, reason: "short_pay" | "heat"): boolean {
  if (employee.betrayed || employee.role === "regional_manager" && employee.loyalty >= 0.35) {
    return false;
  }

  const player = state.factions[state.playerFactionId];
  const stress = (1 - employee.loyalty) * 0.46 + employee.fear * 0.22 + player.heat * 0.018 + (1 - employee.reliability) * 0.16;
  const threshold = reason === "short_pay" ? 0.62 : 0.84;
  if (employee.loyalty > 0.42 || stress < threshold) {
    return false;
  }

  employee.betrayed = true;
  employee.status = "blocked";
  employee.statusDetail = "Betrayed the route.";
  const assignedMachineIds = [...employee.assignedMachineIds];
  employee.assignedMachineIds = [];

  let cashLoss = 0;
  for (const machineId of assignedMachineIds) {
    const machine = state.machines[machineId];
    const location = machine ? state.locations[machine.locationId] : undefined;
    if (!machine || !location) {
      continue;
    }

    cashLoss += Math.min(machine.revenueStored, 8 + employee.level * 3);
    machine.revenueStored = Math.max(0, machine.revenueStored - (8 + employee.level * 3));
    location.rivalPressure = Math.min(1, location.rivalPressure + 0.16);
  }

  const stockLoss = removeStockUnitsFromInventory(state.player.garageStorage ?? {}, Math.max(1, Math.round(2 + employee.level * 1.5)));
  if (cashLoss > 0) {
    player.money = Math.max(0, player.money - Math.round(cashLoss));
    recordFinance(state, "sabotage", -Math.round(cashLoss), `${employee.name} betrayal cash loss`);
  }
  player.publicReputation = Math.max(0, player.publicReputation - 0.6);
  player.streetReputation = Math.max(0, player.streetReputation - 0.3);
  log(state, events, `${employee.name} betrayed the route${stockLoss > 0 ? ` and leaked ${stockLoss} stock` : ""}.`, "danger");
  return true;
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
  recordFinance(state, "wages", -paid, "Daily crew wages");

  if (paid < wageTotal) {
    for (const employee of employees) {
      employee.loyalty = Math.max(0, employee.loyalty - 0.08);
      employee.reliability = Math.max(0.25, employee.reliability - 0.04);
      employee.status = "blocked";
      employee.statusDetail = "Crew was short-paid.";
      maybeTriggerEmployeeBetrayal(state, events, employee, "short_pay");
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
  const machineRevenueStored = installedMachines(state, state.playerFactionId).reduce((sum, machine) => sum + machine.revenueStored, 0);
  const operatingRevenue = state.economy?.finance?.revenueToday ?? 0;
  const operatingExpenses = state.economy?.finance?.expensesToday ?? 0;
  const report = {
    id: `day_report_${day}`,
    day,
    startHour: (day - 1) * 24,
    endHour: day * 24,
    revenueCollected: state.progression.revenueCollectedToday,
    machineRevenueStored,
    contractRewards: state.progression.contractRewardsToday,
    contractPenalties: state.progression.contractPenaltiesToday,
    operatingRevenue,
    operatingExpenses,
    netCashflow: operatingRevenue - operatingExpenses,
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
  ensureLawState(state);
  state.law.inspectionsToday = 0;
  state.law.finesToday = 0;
  state.law.confiscatedUnitsToday = 0;
  ensureConflictState(state);
  state.conflict.resolvedToday = 0;
  state.conflict.missedToday = 0;
  ensureEconomyState(state);
  state.economy.finance.revenueToday = 0;
  state.economy.finance.expensesToday = 0;
  state.economy.finance.frontBusinessRevenueToday = 0;
  state.economy.spoilage.spoiledToday = 0;
}

function processDayBoundaries(state: GameState, events: GameEvent[], previousHour: number): void {
  const previousDay = Math.floor(previousHour / 24);
  const currentDay = Math.floor(state.worldTimeHours / 24);
  if (currentDay <= previousDay) {
    return;
  }

  for (let day = Math.max(1, state.progression.lastReportDay + 1); day <= currentDay; day += 1) {
    payEmployeeWages(state, events);
    applyDailyOperatingEconomy(state, events);
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
    creditPlayer(state, "contracts", 150, "Starter territory expansion bonus");
    log(state, events, "Cinderblock Row is starting to feel like your territory. Expansion bonus paid.", "good");
  }
}

function applyAdvanceTime(state: GameState, events: GameEvent[], hours: number): void {
  const previousHour = state.worldTimeHours;
  ensureStreetLifeState(state);
  ensureConflictState(state);
  ensureBaseState(state);
  ensureEconomyState(state);
  state.worldTimeHours += hours;
  shiftSupplierMarket(state, events);
  updateTrafficAndCheckpoints(state, events);
  applySpoilage(state, events);

  let playerEarned = 0;
  for (const machine of Object.values(state.machines)) {
    if (!isMachineInstalled(machine)) {
      continue;
    }

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

  maybeTriggerStarterUndercut(state, events, playerEarned);
  applyLawInspections(state, events);
  maybeSpawnAmbientConflict(state, events);

  applyEmployeeAutomation(state, events);
  for (const employee of Object.values(state.employees)) {
    maybeTriggerEmployeeBetrayal(state, events, employee, "heat");
  }
  resolveExpiredMachineAlarms(state, events);
  resolveExpiredConflictEvents(state, events);

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
  ensureLawState(state);
  ensureStreetLifeState(state);
  ensureConflictState(state);
  ensureBaseState(state);
  ensureEconomyState(state);
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
      const unitCost = currentProductCost(state, product.id);
      if (state.player.carriedCrate || inventoryUnits(state.player.cargo, state) > 0) {
        log(state, events, "Hands are full. Drop the current crate at the garage or load a machine first.", "warning");
        break;
      }

      const affordable = Math.floor(actor.money / unitCost);
      const capacityLimited = Math.floor(cargoSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, affordable, capacityLimited));

      if (quantity <= 0) {
        log(state, events, "No room or cash for that crate.", "warning");
        break;
      }

      chargePlayer(state, "stock", quantity * unitCost, `${quantity}x ${product.name} supplier crate`);
      state.player.carriedCrate = {
        productId: product.id,
        quantity,
        capacity: Math.floor(state.player.cargoCapacity / product.size),
        source: "supplier"
      };
      log(state, events, `Picked up a ${quantity}x ${product.name} crate for $${quantity * unitCost}.`, "good");
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

      const congestion = state.economy.traffic.congestionByLocation[location.id] ?? 0;
      const conditionMultiplier = Math.max(0.62, vehicle.condition ?? 1);
      const travelHours = travelHoursBetweenLocations(state, vehicle.locationId, location.id, vehicle.speed * conditionMultiplier) * (1 + congestion * 0.45);
      const fuelCost = Math.max(1, Math.ceil(travelHours * state.economy.traffic.fuelPrice * 4));
      if (actor.money < fuelCost) {
        log(state, events, `${vehicle.name} needs $${fuelCost} for fuel.`, "warning");
        break;
      }

      chargePlayer(state, "fuel", fuelCost, `${vehicle.name} fuel to ${location.name}`);
      state.economy.traffic.vehicleMaintenanceDue[vehicle.id] = (state.economy.traffic.vehicleMaintenanceDue[vehicle.id] ?? 0) + Math.max(1, Math.round(travelHours * 3));
      vehicle.condition = Math.max(0.35, (vehicle.condition ?? 1) - travelHours * 0.018);
      applyAdvanceTime(state, events, travelHours);
      vehicle.locationId = location.id;
      log(state, events, `${vehicle.name} moved to ${location.name}.`, "good");
      applyRouteCheckpoint(state, events, vehicle.id, location.id);
      maybeTriggerRouteAmbush(state, events, vehicle.id, location.id);
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

      chargePlayer(state, "base", district.scoutCost, `${district.name} scouting`);
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

      chargePlayer(state, "base", district.unlockCost, `${district.name} district opening`);
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

    case "upgrade_base_facility": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "garage", "upgrade the base")) {
        break;
      }

      const facility = baseFacilities[command.facilityId as BaseFacilityId];
      if (!facility) {
        break;
      }

      const level = baseFacilityLevel(state, facility.id);
      if (level >= facility.maxLevel) {
        log(state, events, `${facility.name} is already maxed.`, "neutral");
        break;
      }

      const cost = baseFacilityUpgradeCost(state, facility.id);
      if (actor.money < cost) {
        log(state, events, `${facility.name} upgrade needs $${cost}.`, "warning");
        break;
      }

      chargePlayer(state, "base", cost, `${facility.name} level ${level + 1}`);
      state.base.facilities[facility.id] = {
        id: facility.id,
        level: level + 1,
        upgradedHour: state.worldTimeHours
      };
      if (facility.id === "security_system") {
        state.base.securityReadiness = Math.min(1, state.base.securityReadiness + 0.06);
      }
      log(state, events, `${facility.name} upgraded to level ${level + 1}.`, "good");
      break;
    }

    case "set_insurance_plan": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const plan = insurancePlans[command.plan];
      if (!plan) {
        break;
      }

      state.economy.finance.insurancePlan = command.plan;
      log(state, events, `${plan.label} selected.`, command.plan === "none" ? "neutral" : "good");
      break;
    }

    case "service_vehicle": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "garage", "service the vehicle")) {
        break;
      }

      const vehicle = state.vehicles[command.vehicleId];
      if (!vehicle) {
        break;
      }

      if (vehicle.locationId !== "garage") {
        log(state, events, `${vehicle.name} needs to be at the garage for service.`, "warning");
        break;
      }

      const maintenanceDue = state.economy.traffic.vehicleMaintenanceDue[vehicle.id] ?? 0;
      const cost = Math.max(8, Math.ceil(maintenanceDue + (1 - (vehicle.condition ?? 1)) * 60));
      if (actor.money < cost) {
        log(state, events, `${vehicle.name} service needs $${cost}.`, "warning");
        break;
      }

      chargePlayer(state, "maintenance", cost, `${vehicle.name} service`);
      state.economy.traffic.vehicleMaintenanceDue[vehicle.id] = 0;
      vehicle.condition = 1;
      log(state, events, `${vehicle.name} serviced for $${cost}.`, "good");
      break;
    }

    case "customize_product": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "garage", "work in the product lab")) {
        break;
      }

      const product = state.products[command.productId];
      const mode = customizationModes[command.mode];
      if (!product || !mode) {
        break;
      }

      if (!product.customizable) {
        log(state, events, `${product.name} cannot be customized in the lab.`, "warning");
        break;
      }

      const labSlots = productLabSlots(state);
      const activeCustomizations = Object.keys(state.economy.productCustomizations).length;
      if (!state.economy.productCustomizations[product.id] && activeCustomizations >= labSlots) {
        log(state, events, `Product lab needs another bench before customizing more than ${labSlots} products.`, "warning");
        break;
      }

      if (actor.money < mode.cost) {
        log(state, events, `${mode.label} for ${product.name} needs $${mode.cost}.`, "warning");
        break;
      }

      chargePlayer(state, "upgrades", mode.cost, `${product.name} ${mode.label}`);
      state.economy.productCustomizations[product.id] = {
        productId: product.id,
        mode: command.mode,
        demandBonus: mode.demandBonus,
        costDelta: mode.costDelta,
        heatDelta: mode.heatDelta,
        createdHour: state.worldTimeHours
      };
      log(state, events, `${product.name} tuned as ${mode.label}.`, "good");
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

      const currentEmployees = Object.values(state.employees).filter((employee) => !employee.betrayed);
      if (currentEmployees.length >= employeeCapacity(state)) {
        log(state, events, `Employee lockers are full. Upgrade lockers before hiring more than ${employeeCapacity(state)} crew.`, "warning");
        break;
      }

      if (command.role === "regional_manager") {
        const managerCount = currentEmployees.filter((employee) => employee.role === "regional_manager").length;
        if (managerCount >= regionalManagerCapacity(state)) {
          log(state, events, "Regional managers need a distribution center upgrade.", "warning");
          break;
        }
      }

      if (actor.money < role.hireCost) {
        log(state, events, `${role.title} needs $${role.hireCost} to hire.`, "warning");
        break;
      }

      chargePlayer(state, "wages", role.hireCost, `${role.title} hiring fee`);
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
      if (!employee || !machine || machine.ownerFactionId !== actor.id || !isMachineInstalled(machine)) {
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

      if (!isMachineInstalled(machine)) {
        log(state, events, `${machine.name} needs to be placed before it can be stocked.`, "warning");
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
      maybeTriggerStarterUndercut(state, events);
      break;
    }

    case "collect_revenue": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id || !isMachineInstalled(machine) || machine.revenueStored <= 0) {
        break;
      }

      if (actor.id === state.playerFactionId && !requirePlayerAtMachine(state, events, machine, "collect cash", "collect")) {
        break;
      }

      const amount = Math.round(machine.revenueStored);
      if (actor.id === state.playerFactionId) {
        creditPlayer(state, "sales", amount, `${machine.name} cash collection`);
      } else {
        actor.money += amount;
      }
      machine.revenueStored = 0;
      machine.lastServicedHour = state.worldTimeHours;
      if (actor.id === state.playerFactionId) {
        state.progression.revenueCollectedToday += amount;
        maybeTriggerStarterUndercut(state, events, amount);
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
      const cost = repairCostForMachine(machine);
      if (actor.money < cost) {
        log(state, events, `Repairs need $${cost}.`, "warning");
        break;
      }

      if (actor.id === state.playerFactionId) {
        chargePlayer(state, "maintenance", cost, `${machine.name} repairs`);
      } else {
        actor.money -= cost;
      }
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

      const method = command.method ?? (actor.id === state.playerFactionId ? "legal_contract" : "rival_territory");
      const quote = placementQuoteForLocation(state, location, method);
      if (actor.money < quote.cost) {
        log(state, events, `${location.name} needs $${quote.cost} for ${quote.label.toLowerCase()} placement.`, "warning");
        break;
      }

      const storedMachine = command.machineId ? state.machines[command.machineId] : actor.id === state.playerFactionId ? storedPlayerMachines(state)[0] : undefined;
      if (storedMachine && (storedMachine.ownerFactionId !== actor.id || isMachineInstalled(storedMachine))) {
        log(state, events, `${storedMachine.name} is not available for placement.`, "warning");
        break;
      }

      if (storedMachine && storedMachine.damage > 0) {
        log(state, events, `Repair ${storedMachine.name} in the garage before placing it.`, "warning");
        break;
      }

      if (actor.id === state.playerFactionId) {
        chargePlayer(state, "upgrades", quote.cost, `${location.name} ${quote.label} placement`);
      } else {
        actor.money -= quote.cost;
      }
      actor.heat += quote.heatDelta;
      actor.publicReputation = Math.max(0, actor.publicReputation + quote.publicReputationDelta);
      actor.streetReputation = Math.max(0, actor.streetReputation + quote.streetReputationDelta);

      const machine = storedMachine ?? createMachine(state, actor.id, location.id, method);
      machine.locationId = location.id;
      machine.placementStatus = "installed";
      machine.placementMethod = method;
      machine.visibility = clamp01(machine.visibility + quote.visibilityDelta);
      machine.security = clamp01(machine.security + quote.securityDelta);
      machine.heat += Math.max(0, quote.heatDelta * 0.2);
      machine.lastServicedHour = state.worldTimeHours;
      location.rivalPressure = clamp01(location.rivalPressure + quote.rivalPressureDelta);

      if (machine.id === STARTER_MACHINE_ID && actor.id === state.playerFactionId) {
        state.progression.starterMachinePlaced = true;
      }

      log(state, events, `${machine.name} installed at ${location.name} via ${quote.label.toLowerCase()}.`, actor.id === state.playerFactionId ? "good" : "danger");
      if (actor.id === state.playerFactionId) {
        issueDailyContracts(state, events);
        if (method === "rival_territory") {
          triggerStarterRetaliation(state, events, "you planted a machine on contested turf");
        }
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

      if (actor.id === state.playerFactionId) {
        chargePlayer(state, "upgrades", upgrade.cost, `${machine.name} ${upgrade.name}`);
      } else {
        actor.money -= upgrade.cost;
      }
      machine.upgrades.push(upgrade.id);
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `${upgrade.name} installed on ${machine.name}.`, "good");
      break;
    }

    case "sabotage_machine": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId === actor.id || !isMachineInstalled(machine)) {
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
      if (actor.id === state.playerFactionId && actor.heat >= 5) {
        createConflictEvent(
          state,
          events,
          "street_chase",
          machine.locationId,
          machine.ownerFactionId,
          16,
          `${state.factions[machine.ownerFactionId]?.name ?? "A rival"} crew is chasing you from ${location.name}.`,
          machine.id
        );
      }
      if (actor.id === state.playerFactionId && state.progression.firstUndercutTriggered) {
        triggerStarterRetaliation(state, events, "you hit a Redline machine");
      }
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
      if (alarm.kind === "undercut") {
        triggerStarterRetaliation(state, events, "you pushed back on the undercut crew");
      }
      break;
    }

    case "resolve_conflict_event": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const conflict = state.conflict.activeEvents[command.eventId];
      if (!conflict || conflict.status !== "active") {
        break;
      }

      if (conflict.expiresHour <= state.worldTimeHours) {
        missConflictEvent(state, events, conflict.id);
        break;
      }

      if (command.resolution !== "remote_lockdown" && !requirePlayerAtLocation(state, events, conflict.locationId, "handle the conflict")) {
        break;
      }

      const location = state.locations[conflict.locationId];
      const threat = state.factions[conflict.threatFactionId];
      const vehicle = Object.values(state.vehicles).find((candidate) => candidate.locationId === conflict.locationId);

      if (command.resolution === "drive_escape") {
        if (!vehicle) {
          log(state, events, "No vehicle is close enough for an escape.", "warning");
          break;
        }

        const escapeScore = vehicle.escapeRating + vehicle.speed * 0.22 + vehicle.security * 0.2;
        const stockLoss = escapeScore >= 0.7 ? 0 : removeStockUnitsFromInventory(vehicle.inventory, Math.ceil(conflict.intensity * 0.18));
        actor.heat += escapeScore >= 0.7 ? 0.6 : 1.4;
        if (location) {
          location.rivalPressure = Math.max(0, location.rivalPressure - 0.08);
        }
        conflict.status = "resolved";
        conflict.resolution = command.resolution;
        conflict.resolvedHour = state.worldTimeHours;
        state.conflict.resolvedToday += 1;
        log(state, events, `${vehicle.name} punched out of the trouble zone${stockLoss > 0 ? `, losing ${stockLoss} stock` : ""}.`, escapeScore >= 0.7 ? "good" : "warning");
        break;
      }

      if (command.resolution === "remote_lockdown") {
        const lockdownCost = Math.ceil(8 + conflict.intensity * 0.35);
        if (actor.money < lockdownCost) {
          log(state, events, `Remote lockdown needs $${lockdownCost}.`, "warning");
          break;
        }

        chargePlayer(state, "base", lockdownCost, "Remote lockdown");
        actor.heat = Math.max(0, actor.heat - 0.4);
        if (location) {
          location.rivalPressure = Math.max(0, location.rivalPressure - 0.04);
        }
        conflict.status = "resolved";
        conflict.resolution = command.resolution;
        conflict.resolvedHour = state.worldTimeHours;
        state.conflict.resolvedToday += 1;
        log(state, events, `Remote lockdown held the line for $${lockdownCost}.`, "good");
        break;
      }

      actor.streetReputation += 1.2;
      actor.heat += 1.2;
      if (threat) {
        threat.heat += 1.5;
      }
      if (location) {
        location.rivalPressure = Math.max(0, location.rivalPressure - 0.12);
      }
      conflict.status = "resolved";
      conflict.resolution = command.resolution;
      conflict.resolvedHour = state.worldTimeHours;
      state.conflict.resolvedToday += 1;
      log(state, events, `You handled the conflict personally. ${threat?.name ?? "The crew"} backed off.`, "good");
      break;
    }

    case "resolve_inspection": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const inspection = state.law.activeInspections[command.inspectionId];
      const machine = inspection ? state.machines[inspection.machineId] : undefined;
      if (!inspection || !machine || inspection.status !== "active") {
        break;
      }

      if (inspection.deadlineHour <= state.worldTimeHours) {
        missInspection(state, events, inspection);
        break;
      }

      if (!requirePlayerAtMachine(state, events, machine, "answer the inspection")) {
        break;
      }

      const legalPlacement = machine.placementMethod === "legal_contract";
      const hiddenPlacement = machine.placementMethod === "hidden";
      if (command.resolution === "show_permit") {
        if (legalPlacement) {
          inspection.resolution = "show_permit";
          actor.heat = Math.max(0, actor.heat - 1);
          finishInspection(state, events, inspection, "resolved", `${machine.name} passed inspection on clean paperwork.`, "good");
          break;
        }

        const fine = hiddenPlacement ? Math.ceil(inspection.fine * 0.25) : inspection.fine;
        if (actor.money < fine) {
          log(state, events, `Permit answer needs $${fine} to settle the citation.`, "warning");
          break;
        }

        chargePlayer(state, "fines", fine, `${machine.name} inspection citation`);
        actor.heat += hiddenPlacement ? 0.5 : 2;
        state.law.finesToday += fine;
        inspection.resolution = "show_permit";
        const confiscated = hiddenPlacement ? 0 : removeStockUnitsFromMachine(machine, Math.ceil(inspection.confiscatedUnits * 0.5));
        state.law.confiscatedUnitsToday += confiscated;
        finishInspection(
          state,
          events,
          inspection,
          "resolved",
          hiddenPlacement
            ? `${machine.name} passed after a minor hidden-placement citation.`
            : `${machine.name} paperwork failed. $${fine} paid and ${confiscated} stock seized.`,
          hiddenPlacement ? "warning" : "danger"
        );
        break;
      }

      if (command.resolution === "pay_fine") {
        if (actor.money < inspection.fine) {
          log(state, events, `Fine payment needs $${inspection.fine}.`, "warning");
          break;
        }

        chargePlayer(state, "fines", inspection.fine, `${machine.name} inspection fine`);
        actor.heat = Math.max(0, actor.heat - 0.5);
        actor.publicReputation = Math.max(0, actor.publicReputation - 0.2);
        state.law.finesToday += inspection.fine;
        inspection.resolution = "pay_fine";
        const confiscated = removeStockUnitsFromMachine(machine, Math.ceil(inspection.confiscatedUnits * 0.35));
        state.law.confiscatedUnitsToday += confiscated;
        finishInspection(state, events, inspection, "resolved", `$${inspection.fine} fine paid for ${machine.name}; ${confiscated} stock surrendered.`, "warning");
        break;
      }

      const bribeCost = Math.ceil(inspection.fine * 0.55);
      if (actor.money < bribeCost) {
        log(state, events, `Inspection bribe needs $${bribeCost}.`, "warning");
        break;
      }

      chargePlayer(state, "fines", bribeCost, `${machine.name} inspection bribe`);
      actor.heat += 3;
      actor.streetReputation += 1;
      inspection.resolution = "bribe";
      finishInspection(state, events, inspection, "resolved", `Inspector took $${bribeCost} to walk away from ${machine.name}. Heat rises.`, "danger");
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
        if (target && target.ownerFactionId !== actor.id && isMachineInstalled(target)) {
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
        if (target && isMachineInstalled(target)) {
          const location = state.locations[target.locationId];
          location.rivalPressure = Math.min(1, location.rivalPressure + 0.22);
          actor.money = Math.max(0, actor.money - 12);
          if (target.id === STARTER_MACHINE_ID && target.ownerFactionId === state.playerFactionId) {
            state.progression.firstUndercutTriggered = true;
            createMachineAlarm(state, events, target, actor.id, "undercut", 12);
          }
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

          createMachine(state, actor.id, location.id, "rival_territory");
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
  return installedMachines(state, state.playerFactionId)
    .slice()
    .sort((a, b) => b.revenueStored + b.slots.length * 4 - (a.revenueStored + a.slots.length * 4))[0];
}
