import type { GameState, Location, Product, VendingMachine } from "../core/types";

function tagDemandMultiplier(product: Product, location: Location): number {
  const tagMatches = product.demandTags.filter((tag) => location.demandTags.includes(tag)).length;
  return 1 + tagMatches * 0.28;
}

function timeOfDayMultiplier(worldTimeHours: number, product: Product): number {
  const hour = worldTimeHours % 24;
  const isNight = hour >= 18 || hour < 5;
  const isMorningRush = hour >= 7 && hour <= 10;

  if (product.demandTags.includes("night") && isNight) {
    return 1.3;
  }

  if (product.demandTags.includes("commuter") && isMorningRush) {
    return 1.2;
  }

  return hour >= 11 && hour <= 16 ? 1.08 : 0.92;
}

export function runMachineSales(state: GameState, machine: VendingMachine, hours: number): number {
  const location = state.locations[machine.locationId];
  if (!location || machine.damage >= 100) {
    return 0;
  }

  let earned = 0;
  const damageMultiplier = Math.max(0.18, 1 - machine.damage / 115);
  const rivalMultiplier = machine.ownerFactionId === state.playerFactionId ? Math.max(0.45, 1 - location.rivalPressure * 0.28) : 1;

  for (const slot of machine.slots) {
    if (slot.quantity <= 0) {
      continue;
    }

    const product = state.products[slot.productId];
    const demand =
      location.footTraffic *
      product.demand *
      tagDemandMultiplier(product, location) *
      timeOfDayMultiplier(state.worldTimeHours, product) *
      machine.visibility *
      damageMultiplier *
      rivalMultiplier;

    const expectedUnits = demand * hours * 1.55;
    slot.salesAccumulator += expectedUnits;
    const soldUnits = Math.min(slot.quantity, Math.floor(slot.salesAccumulator));

    if (soldUnits > 0) {
      slot.quantity -= soldUnits;
      slot.salesAccumulator -= soldUnits;
      earned += soldUnits * slot.price;
      machine.heat += product.heat * soldUnits * 0.05;
    }
  }

  if (earned > 0) {
    machine.revenueStored += earned;
  }

  return earned;
}
