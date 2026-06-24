import type { FactionId, GameState, Inventory, Location, LocationId, MachineId, VendingMachine } from "./types";

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
  return Math.max(0, state.player.cargoCapacity - inventoryUnits(state.player.cargo, state));
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
