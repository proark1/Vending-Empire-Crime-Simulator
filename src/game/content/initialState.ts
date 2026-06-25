import type { Faction, GameState, RouteVehicle, ServiceContract, VendingMachine } from "../core/types";
import { products } from "./products";
import { districts, locations } from "./world";

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
  lastServicedHour: 8,
  upgrades: []
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
  lastServicedHour: 8,
  upgrades: ["smart_lock"]
};

const starterVehicle: RouteVehicle = {
  id: "vehicle_starter_van",
  name: "Primer Van",
  locationId: "garage",
  inventory: {},
  capacity: 36,
  security: 0.15,
  speed: 1
};

const starterContract: ServiceContract = {
  id: "contract_1",
  title: "Foam & Fold soda promise",
  locationId: "laundromat",
  productId: "soda",
  requiredQuantity: 6,
  deliveredQuantity: 0,
  issuedHour: 8,
  deadlineHour: 24,
  rewardMoney: 36,
  rewardPublicReputation: 2,
  rewardStreetReputation: 1,
  failureHeat: 3,
  failureRivalPressure: 0.12,
  status: "active"
};

export function createInitialState(): GameState {
  return {
    version: 1,
    worldTimeHours: 8,
    eventSequence: 1,
    nextMachineNumber: 2,
    nextEmployeeNumber: 1,
    playerFactionId: "player",
    player: {
      factionId: "player",
      activeVehicleId: starterVehicle.id,
      currentLocationId: null,
      cargo: {},
      cargoCapacity: 12,
      carriedCrate: null,
      garageStorage: {},
      garageCapacity: 180
    },
    factions,
    products,
    districts,
    locations,
    machines: {
      [playerMachine.id]: playerMachine,
      [rivalMachine.id]: rivalMachine
    },
    vehicles: {
      [starterVehicle.id]: starterVehicle
    },
    employees: {},
    contracts: {
      [starterContract.id]: starterContract
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
    streetLife: {
      activitySequence: 1,
      nextActivityHour: 8.18,
      recentActivities: []
    },
    mission: {
      id: "starter_takeover",
      title: "Control three profitable machines in Cinderblock Row",
      completed: false
    },
    routePlan: {
      selectedTaskId: null
    },
    dayReports: [],
    progression: {
      nextContractNumber: 2,
      lastReportDay: 0,
      revenueCollectedToday: 0,
      contractRewardsToday: 0,
      contractPenaltiesToday: 0,
      stockSoldToday: 0,
      contractsCompletedToday: 0,
      contractsFailedToday: 0,
      rivalActionsToday: 0
    }
  };
}
