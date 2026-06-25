import type { MachineModelDefinition, MachineModelId } from "../core/types";

export const machineModels: Record<MachineModelId, MachineModelDefinition> = {
  basic_snack: {
    id: "basic_snack",
    name: "Basic Snack Machine",
    description: "Cheap starter cabinet with forgiving repairs and limited slots.",
    baseCost: 75,
    maxSlots: 3,
    capacityBonus: 0,
    durabilityBonus: 0,
    securityBonus: 0,
    visibilityBonus: 0,
    heatMultiplier: 1,
    tags: ["starter", "snack"]
  },
  drink_machine: {
    id: "drink_machine",
    name: "Drink Machine",
    description: "Better cooling and visual punch for drinks and commuter stops.",
    baseCost: 120,
    maxSlots: 3,
    capacityBonus: 6,
    durabilityBonus: 0.04,
    securityBonus: 0.03,
    visibilityBonus: 0.08,
    heatMultiplier: 1,
    tags: ["drink", "commuter"]
  },
  combo_machine: {
    id: "combo_machine",
    name: "Combo Machine",
    description: "Flexible legal workhorse with enough bays for mixed routes.",
    baseCost: 165,
    maxSlots: 4,
    capacityBonus: 4,
    durabilityBonus: 0.06,
    securityBonus: 0.04,
    visibilityBonus: 0.04,
    heatMultiplier: 1,
    tags: ["mixed", "legal"]
  },
  luxury_vendor: {
    id: "luxury_vendor",
    name: "Luxury Vendor",
    description: "Polished glass and lighting for offices, gyms, and expensive snacks.",
    baseCost: 260,
    maxSlots: 4,
    capacityBonus: 2,
    durabilityBonus: 0.02,
    securityBonus: 0.08,
    visibilityBonus: 0.16,
    heatMultiplier: 0.95,
    tags: ["office", "premium"]
  },
  discreet_black_market: {
    id: "discreet_black_market",
    name: "Discreet Black-Market Machine",
    description: "Muted front panel and coded slots for fictional grey goods.",
    baseCost: 310,
    maxSlots: 4,
    capacityBonus: 0,
    durabilityBonus: 0.04,
    securityBonus: 0.12,
    visibilityBonus: -0.1,
    heatMultiplier: 0.82,
    tags: ["hidden", "grey"]
  },
  armored_unit: {
    id: "armored_unit",
    name: "Armored Unit",
    description: "Heavy cabinet for dangerous stops and repeated rival hits.",
    baseCost: 360,
    maxSlots: 3,
    capacityBonus: 4,
    durabilityBonus: 0.18,
    securityBonus: 0.18,
    visibilityBonus: -0.02,
    heatMultiplier: 1.05,
    tags: ["defense", "turf"]
  },
  smart_vendor: {
    id: "smart_vendor",
    name: "Smart Vendor",
    description: "Remote telemetry, cashless defaults, and better route awareness.",
    baseCost: 420,
    maxSlots: 5,
    capacityBonus: 2,
    durabilityBonus: 0.06,
    securityBonus: 0.14,
    visibilityBonus: 0.08,
    heatMultiplier: 0.92,
    tags: ["automation", "remote"]
  },
  hidden_wall_unit: {
    id: "hidden_wall_unit",
    name: "Hidden Wall Unit",
    description: "Low-visibility installation for quiet, risky placement strategies.",
    baseCost: 285,
    maxSlots: 3,
    capacityBonus: -2,
    durabilityBonus: 0.08,
    securityBonus: 0.1,
    visibilityBonus: -0.22,
    heatMultiplier: 0.72,
    tags: ["hidden", "low-profile"]
  },
  mobile_vendor: {
    id: "mobile_vendor",
    name: "Mobile Vending Unit",
    description: "Small mobile rig for events and route experiments.",
    baseCost: 230,
    maxSlots: 3,
    capacityBonus: -4,
    durabilityBonus: -0.02,
    securityBonus: 0.02,
    visibilityBonus: 0.12,
    heatMultiplier: 1.1,
    tags: ["mobile", "event"]
  },
  fake_broken_front: {
    id: "fake_broken_front",
    name: "Fake Broken Front",
    description: "Looks useless until the right customer knows the panel code.",
    baseCost: 340,
    maxSlots: 3,
    capacityBonus: -2,
    durabilityBonus: 0.12,
    securityBonus: 0.16,
    visibilityBonus: -0.32,
    heatMultiplier: 0.68,
    tags: ["secret", "contraband"]
  }
};

export const machineModelList = Object.values(machineModels);
