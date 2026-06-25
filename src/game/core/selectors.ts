import type {
  DayReport,
  DistrictId,
  DistrictProgress,
  DistrictStatus,
  Employee,
  FactionId,
  GameState,
  Inventory,
  Location,
  LocationId,
  MachineAlarm,
  MachineId,
  ProductId,
  RouteVehicle,
  ServiceContract,
  VendingMachine
} from "./types";

export type RouteTaskType = "supplier" | "garage" | "stock" | "collect" | "repair" | "pressure" | "contract" | "alarm";

export interface RouteTask {
  id: string;
  type: RouteTaskType;
  title: string;
  detail: string;
  locationId: LocationId;
  machineId?: MachineId;
  contractId?: string;
  productId?: ProductId;
  alarmId?: string;
  priority: number;
  tone: "good" | "warning" | "danger";
}

export function inventoryUnits(inventory: Inventory, state: GameState): number {
  return Object.entries(inventory).reduce((total, [productId, quantity]) => {
    const product = state.products[productId as keyof typeof state.products];
    return total + (product ? product.size * quantity : 0);
  }, 0);
}

export function ownedMachines(state: GameState, factionId: FactionId): VendingMachine[] {
  return Object.values(state.machines).filter((machine) => machine.ownerFactionId === factionId);
}

export function employeeList(state: GameState): Employee[] {
  return Object.values(state.employees).sort((a, b) => a.employeeNumber - b.employeeNumber);
}

export function assignedEmployeesForMachine(state: GameState, machineId: MachineId): Employee[] {
  return employeeList(state).filter((employee) => employee.assignedMachineIds.includes(machineId));
}

export function dailyEmployeeWages(state: GameState): number {
  return employeeList(state).reduce((sum, employee) => sum + employee.wagePerDay, 0);
}

export function machineAtLocation(state: GameState, locationId: LocationId): VendingMachine | undefined {
  return Object.values(state.machines).find((machine) => machine.locationId === locationId);
}

export function installableLocation(location: Location): boolean {
  return location.kind !== "garage" && location.kind !== "supplier";
}

export function districtProgress(state: GameState, districtId: DistrictId): DistrictProgress {
  const existing = state.districtProgress?.[districtId];
  if (existing) {
    return existing;
  }

  return {
    access: districtId === "starter_suburb" ? "unlocked" : "locked",
    districtId,
    ...(districtId === "starter_suburb" ? { scoutedHour: 8, unlockedHour: 8 } : {})
  };
}

export function districtLocations(state: GameState, districtId: DistrictId): Location[] {
  return Object.values(state.locations).filter((location) => location.districtId === districtId);
}

export function isDistrictUnlockedForPlacement(state: GameState, districtId: DistrictId): boolean {
  return districtProgress(state, districtId).access === "unlocked";
}

export function placementCostForLocation(state: GameState, location: Location): number {
  const district = state.districts[location.districtId];
  return Math.round(location.placementCost * (district?.rentMultiplier ?? 1));
}

export function districtMachineCounts(
  state: GameState,
  districtId: DistrictId
): { playerCount: number; rivalCount: number; total: number; openSites: number; totalSites: number } {
  const locations = districtLocations(state, districtId).filter(installableLocation);
  const machines = locations.map((location) => machineAtLocation(state, location.id)).filter((machine): machine is VendingMachine => Boolean(machine));
  return {
    playerCount: machines.filter((machine) => machine.ownerFactionId === state.playerFactionId).length,
    rivalCount: machines.filter((machine) => machine.ownerFactionId !== state.playerFactionId).length,
    total: machines.length,
    openSites: locations.filter((location) => !machineAtLocation(state, location.id)).length,
    totalSites: locations.length
  };
}

export function districtStatus(state: GameState, districtId: DistrictId): DistrictStatus {
  if (!isDistrictUnlockedForPlacement(state, districtId)) {
    return "locked";
  }

  const locations = districtLocations(state, districtId).filter(installableLocation);
  const counts = districtMachineCounts(state, districtId);
  const averagePressure = locations.reduce((sum, location) => sum + location.rivalPressure, 0) / Math.max(1, locations.length);
  const controlThreshold = Math.max(1, Math.ceil(locations.length * 0.67));

  if (counts.playerCount >= controlThreshold && counts.rivalCount === 0 && averagePressure < 0.35) {
    return "controlled";
  }

  if (counts.rivalCount > 0 || averagePressure >= 0.45) {
    return "contested";
  }

  return "available";
}

export function districtUnlockRequirements(state: GameState, districtId: DistrictId): string[] {
  const district = state.districts[districtId];
  if (!district) {
    return ["Unknown district"];
  }

  const requirements: string[] = [];
  const ownedCount = ownedMachines(state, state.playerFactionId).length;
  const completedTotal = state.progression.contractsCompletedTotal ?? state.progression.contractsCompletedToday ?? 0;
  const streetReputation = state.factions[state.playerFactionId]?.streetReputation ?? 0;

  if (ownedCount < district.requiredOwnedMachines) {
    requirements.push(`Own ${district.requiredOwnedMachines} machines`);
  }

  if (completedTotal < district.requiredContractsCompleted) {
    requirements.push(`Complete ${district.requiredContractsCompleted} contracts`);
  }

  if (streetReputation < district.requiredStreetReputation) {
    requirements.push(`Street rep ${district.requiredStreetReputation}`);
  }

  return requirements;
}

export interface DistrictUnlockInfo {
  canScout: boolean;
  canUnlock: boolean;
  progress: DistrictProgress;
  status: DistrictStatus;
  unmetRequirements: string[];
}

export function districtUnlockInfo(state: GameState, districtId: DistrictId): DistrictUnlockInfo {
  const district = state.districts[districtId];
  const progress = districtProgress(state, districtId);
  const unmetRequirements = districtUnlockRequirements(state, districtId);
  const player = state.factions[state.playerFactionId];

  return {
    canScout: Boolean(district && progress.access === "locked" && player.money >= district.scoutCost),
    canUnlock: Boolean(district && progress.access === "scouted" && unmetRequirements.length === 0 && player.money >= district.unlockCost),
    progress,
    status: districtStatus(state, districtId),
    unmetRequirements
  };
}

export function getMachineLocation(state: GameState, machineId: MachineId): Location | undefined {
  const machine = state.machines[machineId];
  return machine ? state.locations[machine.locationId] : undefined;
}

export function cargoSpaceRemaining(state: GameState): number {
  return Math.max(0, state.player.cargoCapacity - carriedCrateUnits(state));
}

export function carriedCrateUnits(state: GameState): number {
  const crate = state.player.carriedCrate;
  if (!crate) {
    return inventoryUnits(state.player.cargo, state);
  }

  const product = state.products[crate.productId];
  return product ? product.size * crate.quantity : 0;
}

export function garageStorageUnits(state: GameState): number {
  return inventoryUnits(state.player.garageStorage ?? {}, state);
}

export function garageStorageSpaceRemaining(state: GameState): number {
  return Math.max(0, state.player.garageCapacity - garageStorageUnits(state));
}

export function activeVehicle(state: GameState): RouteVehicle | undefined {
  return state.vehicles[state.player.activeVehicleId];
}

export function vehicleInventoryUnits(state: GameState, vehicle = activeVehicle(state)): number {
  return vehicle ? inventoryUnits(vehicle.inventory, state) : 0;
}

export function vehicleSpaceRemaining(state: GameState, vehicle = activeVehicle(state)): number {
  return vehicle ? Math.max(0, vehicle.capacity - vehicleInventoryUnits(state, vehicle)) : 0;
}

export function firstVehicleProduct(state: GameState, vehicle = activeVehicle(state)): { productId: keyof GameState["products"]; quantity: number } | undefined {
  if (!vehicle) {
    return undefined;
  }

  for (const [productId, quantity] of Object.entries(vehicle.inventory ?? {})) {
    if (quantity > 0 && productId in state.products) {
      return { productId: productId as keyof GameState["products"], quantity };
    }
  }

  return undefined;
}

export function totalOwnedStockUnits(state: GameState): number {
  return carriedCrateUnits(state) + garageStorageUnits(state) + Object.values(state.vehicles).reduce((sum, vehicle) => sum + vehicleInventoryUnits(state, vehicle), 0);
}

export function firstGarageStorageProduct(state: GameState): { productId: keyof GameState["products"]; quantity: number } | undefined {
  for (const [productId, quantity] of Object.entries(state.player.garageStorage ?? {})) {
    if (quantity > 0 && productId in state.products) {
      return { productId: productId as keyof GameState["products"], quantity };
    }
  }

  return undefined;
}

export function formatClock(worldTimeHours: number): string {
  const day = Math.floor(worldTimeHours / 24) + 1;
  const hourInDay = worldTimeHours % 24;
  const hour = Math.floor(hourInDay);
  const minute = Math.floor((hourInDay - hour) * 60);
  return `Day ${day} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function activeContracts(state: GameState): ServiceContract[] {
  return Object.values(state.contracts).filter((contract) => contract.status === "active");
}

export function activeMachineAlarms(state: GameState): MachineAlarm[] {
  return Object.values(state.machineAlarms ?? {})
    .filter((alarm) => !alarm.resolved && alarm.expiresHour > state.worldTimeHours && Boolean(state.machines[alarm.machineId]))
    .sort((a, b) => a.expiresHour - b.expiresHour);
}

export function activeAlarmForMachine(state: GameState, machineId: MachineId): MachineAlarm | undefined {
  return activeMachineAlarms(state).find((alarm) => alarm.machineId === machineId);
}

export function activeContractsAtLocation(state: GameState, locationId: LocationId): ServiceContract[] {
  return activeContracts(state)
    .filter((contract) => contract.locationId === locationId)
    .sort((a, b) => a.deadlineHour - b.deadlineHour);
}

export function contractNeedByProduct(state: GameState, locationId?: LocationId): Partial<Record<ProductId, number>> {
  const needs: Partial<Record<ProductId, number>> = {};
  for (const contract of activeContracts(state)) {
    if (locationId && contract.locationId !== locationId) {
      continue;
    }

    needs[contract.productId] = (needs[contract.productId] ?? 0) + contractRemainingQuantity(contract);
  }

  return needs;
}

export function latestDayReport(state: GameState): DayReport | undefined {
  return state.dayReports[0];
}

export function contractRemainingQuantity(contract: ServiceContract): number {
  return Math.max(0, contract.requiredQuantity - contract.deliveredQuantity);
}

export function contractProgressRatio(contract: ServiceContract): number {
  return Math.min(1, contract.deliveredQuantity / Math.max(1, contract.requiredQuantity));
}

export function contractHoursRemaining(state: GameState, contract: ServiceContract): number {
  return contract.deadlineHour - state.worldTimeHours;
}

export function contractTone(state: GameState, contract: ServiceContract): "good" | "warning" | "danger" {
  const remainingHours = contractHoursRemaining(state, contract);
  const progress = contractProgressRatio(contract);
  if (remainingHours <= 2 || (remainingHours <= 6 && progress < 0.5)) {
    return "danger";
  }

  if (remainingHours <= 8 || progress < 0.35) {
    return "warning";
  }

  return "good";
}

export function missionProgress(state: GameState): { ownedCount: number; profitableCount: number; target: number } {
  const playerMachines = ownedMachines(state, state.playerFactionId);
  return {
    ownedCount: playerMachines.length,
    profitableCount: playerMachines.filter((machine) => machine.revenueStored >= 20 || machine.slots.some((slot) => slot.quantity > 0)).length,
    target: 3
  };
}

export function machineStockUnits(machine: VendingMachine): number {
  return machine.slots.reduce((sum, slot) => sum + slot.quantity, 0);
}

export function machineRoutePressure(
  state: GameState,
  machine: VendingMachine
): { score: number; tone: "good" | "warning" | "danger"; reasons: string[] } {
  const location = state.locations[machine.locationId];
  const stock = machineStockUnits(machine);
  const capacity = machine.slots.reduce((sum, slot) => sum + slot.capacity, 0) + Math.max(0, machine.maxSlots - machine.slots.length) * 24;
  const reasons: string[] = [];
  let score = 0;

  if (stock === 0) {
    score += 4;
    reasons.push("empty");
  } else if (stock / capacity <= 0.25) {
    score += 2;
    reasons.push("low stock");
  }

  if (machine.damage >= 60) {
    score += 3;
    reasons.push("heavy damage");
  } else if (machine.damage > 0) {
    score += 1;
    reasons.push("repair");
  }

  if (machine.revenueStored >= 60) {
    score += 3;
    reasons.push("cash full");
  } else if (machine.revenueStored >= 25) {
    score += 1;
    reasons.push("collect cash");
  }

  if (location?.rivalPressure && location.rivalPressure >= 0.5) {
    score += 2;
    reasons.push("rival pressure");
  }

  const tone = score >= 5 ? "danger" : score >= 2 ? "warning" : "good";
  return { score, tone, reasons };
}

export function routeTasks(state: GameState): RouteTask[] {
  const tasks: RouteTask[] = [];
  const vehicle = activeVehicle(state);
  const player = state.factions[state.playerFactionId];

  for (const alarm of activeMachineAlarms(state)) {
    const machine = state.machines[alarm.machineId];
    const intruder = state.factions[alarm.intruderFactionId];
    const minutesLeft = Math.max(1, Math.ceil((alarm.expiresHour - state.worldTimeHours) * 60));
    tasks.push({
      id: `alarm:${alarm.id}`,
      type: "alarm",
      title: `Alarm at ${machine.name}`,
      detail: `${intruder?.name ?? "Intruder"} is at the machine · ${minutesLeft}m to interrupt`,
      locationId: alarm.locationId,
      machineId: alarm.machineId,
      alarmId: alarm.id,
      priority: 30,
      tone: "danger"
    });
  }

  if (!vehicle) {
    return tasks;
  }

  const garageUnits = garageStorageUnits(state);
  const vehicleUnits = vehicleInventoryUnits(state, vehicle);
  const vehicleFree = vehicleSpaceRemaining(state, vehicle);
  const contractNeeds = contractNeedByProduct(state);
  const contractNeedSummary = Object.entries(contractNeeds)
    .filter(([, quantity]) => (quantity ?? 0) > 0)
    .map(([productId, quantity]) => `${quantity} ${state.products[productId as ProductId]?.name ?? "stock"}`)
    .join(" · ");

  if (garageUnits > 0 && vehicleFree > 0) {
    tasks.push({
      id: "garage:load_vehicle",
      type: "garage",
      title: "Load the van",
      detail: contractNeedSummary ? `Contracts need ${contractNeedSummary} · ${vehicleFree} trunk space open` : `${garageUnits} stock in garage · ${vehicleFree} trunk space open`,
      locationId: "garage",
      priority: 7,
      tone: "good"
    });
  }

  if (garageStorageSpaceRemaining(state) > 0 && player.money >= 10) {
    tasks.push({
      id: "supplier:stock_run",
      type: "supplier",
      title: "Supplier stock run",
      detail: contractNeedSummary ? `Buy contract stock: ${contractNeedSummary}.` : "Buy crates for garage storage before the route runs dry.",
      locationId: "supplier",
      priority: garageUnits + vehicleUnits === 0 ? 8 : 3,
      tone: garageUnits + vehicleUnits === 0 ? "warning" : "good"
    });
  }

  for (const contract of activeContracts(state)) {
    const location = state.locations[contract.locationId];
    const remaining = contractRemainingQuantity(contract);
    const hoursLeft = contractHoursRemaining(state, contract);
    const product = state.products[contract.productId];
    const tone = contractTone(state, contract);
    tasks.push({
      id: `contract:${contract.id}`,
      type: "contract",
      title: `Deliver ${remaining}x ${product?.name ?? "stock"}`,
      detail: `${contract.title} · due by ${formatClock(contract.deadlineHour)} · ${Math.max(0, Math.ceil(hoursLeft))}h left`,
      locationId: contract.locationId,
      machineId: Object.values(state.machines).find((machine) => machine.ownerFactionId === state.playerFactionId && machine.locationId === contract.locationId)?.id,
      contractId: contract.id,
      productId: contract.productId,
      priority: tone === "danger" ? 12 : tone === "warning" ? 9 : 5,
      tone
    });
  }

  for (const machine of ownedMachines(state, state.playerFactionId)) {
    const location = state.locations[machine.locationId];
    const pressure = machineRoutePressure(state, machine);
    const stock = machineStockUnits(machine);
    const capacity = machine.slots.reduce((sum, slot) => sum + slot.capacity, 0) + Math.max(0, machine.maxSlots - machine.slots.length) * 24;

    if (stock === 0 || stock / capacity <= 0.25) {
      tasks.push({
        id: `machine:${machine.id}:stock`,
        type: "stock",
        title: `Restock ${machine.name}`,
        detail: `${stock}/${capacity} stock at ${location?.name ?? "unknown location"}`,
        locationId: machine.locationId,
        machineId: machine.id,
        priority: stock === 0 ? 10 : 6,
        tone: stock === 0 ? "danger" : "warning"
      });
    }

    if (machine.revenueStored >= 25) {
      tasks.push({
        id: `machine:${machine.id}:collect`,
        type: "collect",
        title: `Collect ${machine.name}`,
        detail: `$${Math.round(machine.revenueStored)} stored`,
        locationId: machine.locationId,
        machineId: machine.id,
        priority: machine.revenueStored >= 60 ? 8 : 4,
        tone: machine.revenueStored >= 60 ? "warning" : "good"
      });
    }

    if (machine.damage > 0) {
      tasks.push({
        id: `machine:${machine.id}:repair`,
        type: "repair",
        title: `Repair ${machine.name}`,
        detail: `${Math.round(machine.damage)}% damage`,
        locationId: machine.locationId,
        machineId: machine.id,
        priority: machine.damage >= 60 ? 9 : 5,
        tone: machine.damage >= 60 ? "danger" : "warning"
      });
    }

    if (pressure.reasons.includes("rival pressure")) {
      tasks.push({
        id: `machine:${machine.id}:pressure`,
        type: "pressure",
        title: `Check ${machine.name}`,
        detail: "Rival pressure is rising around this stop.",
        locationId: machine.locationId,
        machineId: machine.id,
        priority: 5,
        tone: "warning"
      });
    }
  }

  return tasks.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

export function selectedRouteTask(state: GameState): RouteTask | undefined {
  const selectedTaskId = state.routePlan.selectedTaskId;
  if (!selectedTaskId) {
    return undefined;
  }

  return routeTasks(state).find((task) => task.id === selectedTaskId);
}
