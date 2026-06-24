import type { District, Faction, GameState, Location, VendingMachine } from "../core/types";
import { products } from "./products";

const starterDistrict: District = {
  id: "starter_suburb",
  name: "Cinderblock Row",
  heatTolerance: 35,
  rentMultiplier: 1,
  dominantTags: ["laundry", "commuter", "student"]
};

const locations: Record<string, Location> = {
  garage: {
    id: "garage",
    districtId: starterDistrict.id,
    name: "Storage Garage",
    kind: "garage",
    position: { x: -9, z: 7 },
    footTraffic: 0,
    safety: 0.8,
    policePresence: 0.1,
    rentCost: 0,
    placementCost: 0,
    rivalPressure: 0,
    demandTags: []
  },
  supplier: {
    id: "supplier",
    districtId: starterDistrict.id,
    name: "Backdoor Supplier",
    kind: "supplier",
    position: { x: 8, z: 7 },
    footTraffic: 0,
    safety: 0.65,
    policePresence: 0.12,
    rentCost: 0,
    placementCost: 0,
    rivalPressure: 0,
    demandTags: []
  },
  laundromat: {
    id: "laundromat",
    districtId: starterDistrict.id,
    name: "Foam & Fold Laundromat",
    kind: "laundromat",
    position: { x: -5, z: -5 },
    footTraffic: 1.15,
    safety: 0.8,
    policePresence: 0.12,
    rentCost: 12,
    placementCost: 0,
    rivalPressure: 0.1,
    demandTags: ["laundry", "student"]
  },
  gym: {
    id: "gym",
    districtId: starterDistrict.id,
    name: "Iron Habit Gym",
    kind: "gym",
    position: { x: 4, z: -6 },
    footTraffic: 1.25,
    safety: 0.72,
    policePresence: 0.18,
    rentCost: 18,
    placementCost: 95,
    rivalPressure: 0.18,
    demandTags: ["gym", "commuter"]
  },
  arcade: {
    id: "arcade",
    districtId: starterDistrict.id,
    name: "Pixel Palace Arcade",
    kind: "arcade",
    position: { x: 9, z: -1 },
    footTraffic: 1.4,
    safety: 0.52,
    policePresence: 0.16,
    rentCost: 22,
    placementCost: 145,
    rivalPressure: 0.24,
    demandTags: ["arcade", "student", "night"]
  },
  transit: {
    id: "transit",
    districtId: starterDistrict.id,
    name: "South Loop Bus Stop",
    kind: "transit",
    position: { x: -10, z: -1 },
    footTraffic: 1.55,
    safety: 0.58,
    policePresence: 0.32,
    rentCost: 28,
    placementCost: 125,
    rivalPressure: 0.35,
    demandTags: ["commuter"]
  },
  rival_corner: {
    id: "rival_corner",
    districtId: starterDistrict.id,
    name: "Redline Corner",
    kind: "corner",
    position: { x: 1, z: 3 },
    footTraffic: 1.05,
    safety: 0.46,
    policePresence: 0.14,
    rentCost: 0,
    placementCost: 0,
    rivalPressure: 0.65,
    demandTags: ["commuter", "night"]
  }
};

const factions: Record<string, Faction> = {
  player: {
    id: "player",
    name: "Vendetta Vending",
    type: "player",
    money: 120,
    heat: 0,
    publicReputation: 8,
    streetReputation: 0,
    color: "#2dd4bf"
  },
  rival_redline: {
    id: "rival_redline",
    name: "Redline Snacks",
    type: "npc",
    money: 180,
    heat: 4,
    publicReputation: 5,
    streetReputation: 5,
    color: "#ef4444"
  }
};

const playerMachine: VendingMachine = {
  id: "machine_player_1",
  name: "Rusty Starter",
  ownerFactionId: "player",
  locationId: "laundromat",
  slots: [],
  maxSlots: 3,
  revenueStored: 0,
  damage: 35,
  security: 0.2,
  visibility: 0.75,
  heat: 0,
  lastServicedHour: 8
};

const rivalMachine: VendingMachine = {
  id: "machine_rival_1",
  name: "Redline Basic",
  ownerFactionId: "rival_redline",
  locationId: "rival_corner",
  slots: [
    { productId: "soda", quantity: 12, capacity: 24, price: 4, salesAccumulator: 0 },
    { productId: "energy", quantity: 10, capacity: 18, price: 8, salesAccumulator: 0 }
  ],
  maxSlots: 3,
  revenueStored: 0,
  damage: 0,
  security: 0.25,
  visibility: 0.8,
  heat: 0,
  lastServicedHour: 8
};

export function createInitialState(): GameState {
  return {
    version: 1,
    worldTimeHours: 8,
    eventSequence: 1,
    nextMachineNumber: 2,
    playerFactionId: "player",
    player: {
      factionId: "player",
      cargo: {},
      cargoCapacity: 40
    },
    factions,
    products,
    districts: {
      [starterDistrict.id]: starterDistrict
    },
    locations,
    machines: {
      [playerMachine.id]: playerMachine,
      [rivalMachine.id]: rivalMachine
    },
    npcControllers: {
      rival_redline: {
        factionId: "rival_redline",
        aggression: 0.55,
        lastActedHour: 8,
        cooldownHours: 2.25
      }
    },
    eventLog: [
      {
        id: "intro_1",
        hour: 8,
        tone: "neutral",
        message: "Your first battered machine is sitting outside Foam & Fold. It needs stock and attention."
      }
    ],
    mission: {
      id: "starter_takeover",
      title: "Control three profitable machines in Cinderblock Row",
      completed: false
    }
  };
}
