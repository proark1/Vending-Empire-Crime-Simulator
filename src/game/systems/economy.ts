import type { GameState, Location, Product, VendingMachine } from "../core/types";
import { effectiveMachineDamage, effectiveMachineVisibility, getMachineUpgradeEffects, priceDemandMultiplier } from "../core/machineStats";

function tagDemandMultiplier(product: Product, location: Location): number {
  const tagMatches = product.demandTags.filter((tag) => location.demandTags.includes(tag)).length;
  return 1 + tagMatches * 0.28;
}

function districtDemandMultiplier(state: GameState, product: Product, location: Location): number {
  const district = state.districts[location.districtId];
  if (!district) {
    return 1;
  }

  const dominantMatches = product.demandTags.filter((tag) => district.dominantTags.includes(tag)).length;
  const rentSignal = Math.max(0, district.rentMultiplier - 1) * 0.08;
  return 1 + dominantMatches * 0.12 + rentSignal;
}

function districtHeatMultiplier(state: GameState, location: Location): number {
  const district = state.districts[location.districtId];
  if (!district) {
    return 1;
  }

  return Math.max(0.72, Math.min(1.25, 1.2 - district.heatTolerance / 120));
}

function starterRouteMomentumMultiplier(state: GameState, machine: VendingMachine, location: Location): number {
  if (machine.ownerFactionId !== state.playerFactionId || location.districtId !== "starter_suburb") {
    return 1;
  }

  const playerInstalledMachines = Object.values(state.machines)
    .filter((candidate) => candidate.ownerFactionId === state.playerFactionId && (candidate.placementStatus ?? "installed") === "installed")
    .length;

  if (playerInstalledMachines <= 1 && state.progression.stockSoldToday < 14) {
    return 1.75;
  }

  if (playerInstalledMachines <= 2 && state.progression.stockSoldToday < 32) {
    return 1.25;
  }

  return 1;
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

function customizationDemandMultiplier(state: GameState, product: Product): number {
  const customization = state.economy?.productCustomizations?.[product.id];
  return Math.max(0.75, 1 + (customization?.demandBonus ?? 0));
}

function customizedProductHeat(state: GameState, product: Product): number {
  const customization = state.economy?.productCustomizations?.[product.id];
  return Math.max(0, product.heat + (customization?.heatDelta ?? 0));
}

export function runMachineSales(state: GameState, machine: VendingMachine, hours: number): number {
  if ((machine.placementStatus ?? "installed") !== "installed") {
    return 0;
  }

  const slotSalesRate = estimateMachineSalesPerHour(state, machine);
  let earned = 0;

  for (const slotRate of slotSalesRate) {
    const slot = machine.slots.find((candidate) => candidate.productId === slotRate.productId);
    if (!slot || slot.quantity <= 0) {
      continue;
    }

    slot.salesAccumulator += slotRate.unitsPerHour * hours;
    const soldUnits = Math.min(slot.quantity, Math.floor(slot.salesAccumulator));

    if (soldUnits > 0) {
      const product = state.products[slot.productId];
      slot.quantity -= soldUnits;
      slot.salesAccumulator -= soldUnits;
      earned += soldUnits * slot.price;
      machine.heat += customizedProductHeat(state, product) * soldUnits * 0.05 * slotRate.heatMultiplier;
    }
  }

  if (earned > 0) {
    machine.revenueStored += earned;
  }

  return earned;
}

export function estimateMachineSalesPerHour(state: GameState, machine: VendingMachine): Array<{ productId: string; unitsPerHour: number; heatMultiplier: number }> {
  const location = state.locations[machine.locationId];
  if (!location || machine.damage >= 100 || (machine.placementStatus ?? "installed") !== "installed") {
    return [];
  }

  const effects = getMachineUpgradeEffects(machine);
  const damageMultiplier = Math.max(0.18, 1 - effectiveMachineDamage(machine) / 115);
  const rivalMultiplier = machine.ownerFactionId === state.playerFactionId ? Math.max(0.45, 1 - location.rivalPressure * 0.28) : 1;
  const visibility = effectiveMachineVisibility(machine);

  return machine.slots.map((slot) => {
    if (slot.quantity <= 0) {
      return {
        productId: slot.productId,
        unitsPerHour: 0,
        heatMultiplier: effects.heatMultiplier
      };
    }

    const product = state.products[slot.productId];
    const demand =
      location.footTraffic *
      product.demand *
      tagDemandMultiplier(product, location) *
      districtDemandMultiplier(state, product, location) *
      timeOfDayMultiplier(state.worldTimeHours, product) *
      customizationDemandMultiplier(state, product) *
      visibility *
      damageMultiplier *
      rivalMultiplier *
      starterRouteMomentumMultiplier(state, machine, location) *
      priceDemandMultiplier(slot.price, product.basePrice) *
      (1 + effects.salesMultiplier);

    return {
      productId: slot.productId,
      unitsPerHour: demand * 1.55,
      heatMultiplier: effects.heatMultiplier * districtHeatMultiplier(state, location)
    };
  });
}
