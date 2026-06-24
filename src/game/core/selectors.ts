import type { FactionId, GameState, Inventory, Location, LocationId, MachineId, RouteVehicle, VendingMachine } from "./types";

export type RouteTaskType = "supplier" | "garage" | "stock" | "collect" | "repair" | "pressure";

export interface RouteTask {
  id: string;
  type: RouteTaskType;
  title: string;
  detail: string;
  locationId: LocationId;
  machineId?: MachineId;
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

export function machineAtLocation(state: GameState, locationId: LocationId): VendingMachine | undefined {
  return Object.values(state.machines).find((machine) => machine.locationId === locationId);
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
  return carriedCrateUnits(state) + garageStorageUnits(state);
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
  const capacity = machine.slots.reduce((sum, slot) => sum + slot.capacity, 0) || machine.maxSlots * 24;
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

  if (!vehicle) {
    return tasks;
  }

  const garageUnits = garageStorageUnits(state);
  const vehicleUnits = vehicleInventoryUnits(state, vehicle);
  const vehicleFree = vehicleSpaceRemaining(state, vehicle);
  if (garageUnits > 0 && vehicleFree > 0) {
    tasks.push({
      id: "garage:load_vehicle",
      type: "garage",
      title: "Load the van",
      detail: `${garageUnits} stock in garage · ${vehicleFree} trunk space open`,
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
      detail: "Buy crates for garage storage before the route runs dry.",
      locationId: "supplier",
      priority: garageUnits + vehicleUnits === 0 ? 8 : 3,
      tone: garageUnits + vehicleUnits === 0 ? "warning" : "good"
    });
  }

  for (const machine of ownedMachines(state, state.playerFactionId)) {
    const location = state.locations[machine.locationId];
    const pressure = machineRoutePressure(state, machine);
    const stock = machineStockUnits(machine);
    const capacity = machine.slots.reduce((sum, slot) => sum + slot.capacity, 0) || machine.maxSlots * 24;

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
