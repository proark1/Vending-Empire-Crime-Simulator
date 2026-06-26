import type {
  CustomerMarketState,
  DistrictProgress,
  EmpireAssetState,
  Faction,
  GameState,
  LocationRightsState,
  MachineFleetState,
  RivalOrganizationState,
  RouteVehicle,
  SupplierRelationshipState,
  VendingMachine
} from "../core/types";
import { createInitialBaseFacilities } from "./baseFacilities";
import { empireAssetList } from "./empire";
import { products } from "./products";
import { supplierDefinitions } from "./suppliers";
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
    archetype: "street_crew",
    tactic: "undercuts prices, tags machines, and tests weak routes",
    money: 180,
    heat: 4,
    publicReputation: 5,
    streetReputation: 5,
    color: "#ef4444"
  },
  rival_glassline: {
    id: "rival_glassline",
    name: "Glassline VendCo",
    type: "npc",
    archetype: "corporate",
    tactic: "buys contracts, pushes inspections, and pressures legal stops",
    money: 420,
    heat: 1,
    publicReputation: 9,
    streetReputation: 1,
    color: "#60a5fa"
  },
  rival_nightmarket: {
    id: "rival_nightmarket",
    name: "Night Market Supply",
    type: "npc",
    archetype: "black_market",
    tactic: "copies high-margin products and fights for after-hours demand",
    money: 260,
    heat: 8,
    publicReputation: 2,
    streetReputation: 8,
    color: "#c084fc"
  },
  rival_marlow: {
    id: "rival_marlow",
    name: "Marlow's Machines",
    type: "npc",
    archetype: "former_partner",
    tactic: "targets profitable machines and exploits old route knowledge",
    money: 300,
    heat: 5,
    publicReputation: 4,
    streetReputation: 7,
    color: "#f97316"
  }
};

const rivalOrganizations: Record<string, RivalOrganizationState> = {
  rival_redline: {
    factionId: "rival_redline",
    bossName: "Nico Varela",
    agenda: "Own the starter sidewalks through cheap stock, tags, and route pressure.",
    headquartersLocationId: "rival_corner",
    relationship: "hostile",
    storyStage: 0,
    leverage: 18,
    operations: [
      {
        id: "op_redline_foam_price",
        factionId: "rival_redline",
        kind: "price_war",
        districtId: "starter_suburb",
        locationId: "laundromat",
        startedHour: 8,
        progress: 28,
        strength: 0.58,
        exposed: false
      },
      {
        id: "op_redline_corner_sabotage",
        factionId: "rival_redline",
        kind: "sabotage_cell",
        districtId: "starter_suburb",
        locationId: "rival_corner",
        startedHour: 8,
        progress: 16,
        strength: 0.64,
        exposed: false
      }
    ]
  },
  rival_glassline: {
    factionId: "rival_glassline",
    bossName: "Maris Vale",
    agenda: "Win permits, lock down commuter contracts, and turn inspectors into a weapon.",
    headquartersLocationId: "civic_plaza",
    relationship: "tense",
    storyStage: 0,
    leverage: 32,
    operations: [
      {
        id: "op_glassline_civic_permits",
        factionId: "rival_glassline",
        kind: "permit_pressure",
        districtId: "downtown_loop",
        locationId: "civic_plaza",
        startedHour: 8,
        progress: 24,
        strength: 0.72,
        exposed: false
      },
      {
        id: "op_glassline_metro_expansion",
        factionId: "rival_glassline",
        kind: "expansion",
        districtId: "downtown_loop",
        locationId: "metro_concourse",
        startedHour: 8,
        progress: 12,
        strength: 0.52,
        exposed: false
      }
    ]
  },
  rival_nightmarket: {
    factionId: "rival_nightmarket",
    bossName: "Juno Kade",
    agenda: "Control after-hours demand with grey stock and supplier rumors.",
    headquartersLocationId: "night_bazaar",
    relationship: "tense",
    storyStage: 0,
    leverage: 26,
    operations: [
      {
        id: "op_nightmarket_bazaar_grey",
        factionId: "rival_nightmarket",
        kind: "grey_supply",
        districtId: "neon_quarter",
        locationId: "night_bazaar",
        startedHour: 8,
        progress: 22,
        strength: 0.76,
        exposed: false
      },
      {
        id: "op_nightmarket_cinema_price",
        factionId: "rival_nightmarket",
        kind: "price_war",
        districtId: "neon_quarter",
        locationId: "cinema_row",
        startedHour: 8,
        progress: 18,
        strength: 0.62,
        exposed: false
      }
    ]
  },
  rival_marlow: {
    factionId: "rival_marlow",
    bossName: "Elias Marlow",
    agenda: "Exploit old route knowledge, isolate profitable stops, and force a buyout.",
    headquartersLocationId: "motel_cut",
    relationship: "hostile",
    storyStage: 0,
    leverage: 34,
    operations: [
      {
        id: "op_marlow_motel_sabotage",
        factionId: "rival_marlow",
        kind: "sabotage_cell",
        districtId: "old_town",
        locationId: "motel_cut",
        startedHour: 8,
        progress: 20,
        strength: 0.7,
        exposed: false
      },
      {
        id: "op_marlow_courthouse_permits",
        factionId: "rival_marlow",
        kind: "permit_pressure",
        districtId: "old_town",
        locationId: "courthouse_steps",
        startedHour: 8,
        progress: 14,
        strength: 0.56,
        exposed: false
      }
    ]
  }
};

const playerMachine: VendingMachine = {
  id: "machine_player_1",
  name: "Rusty Starter",
  ownerFactionId: "player",
  machineModelId: "basic_snack",
  locationId: "garage",
  placementStatus: "stored",
  placementMethod: "legal_contract",
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
  machineModelId: "combo_machine",
  locationId: "rival_corner",
  placementStatus: "installed",
  placementMethod: "rival_territory",
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
  position: { x: -5, z: 4.75 },
  heading: -Math.PI / 2,
  odometer: 0,
  inventory: {},
  capacity: 36,
  security: 0.15,
  speed: 1,
  escapeRating: 0.35,
  condition: 1,
  upgrades: []
};

const chaseVehicle: RouteVehicle = {
  id: "vehicle_courier_hatch",
  name: "Courier Hatch",
  locationId: "garage",
  position: { x: -5, z: 4.75 },
  heading: -Math.PI / 2,
  odometer: 0,
  inventory: {},
  capacity: 18,
  security: 0.08,
  speed: 1.35,
  escapeRating: 0.58,
  condition: 1,
  upgrades: []
};

function cloneContent<T>(value: T): T {
  return structuredClone(value) as T;
}

function createInitialDistrictProgress(): Record<string, DistrictProgress> {
  return Object.fromEntries(
    Object.keys(districts).map((districtId) => [
      districtId,
      {
        access: districtId === "starter_suburb" ? "unlocked" : "locked",
        districtId,
        ...(districtId === "starter_suburb" ? { scoutedHour: 8, unlockedHour: 8 } : {})
      }
    ])
  );
}

function createInitialEmpireAssets(): GameState["empire"]["assets"] {
  return Object.fromEntries(
    empireAssetList.map((asset) => [
      asset.id,
      {
        id: asset.id,
        level: 0
      } satisfies EmpireAssetState
    ])
  ) as GameState["empire"]["assets"];
}

function createInitialSuppliers(): Record<string, SupplierRelationshipState> {
  return Object.fromEntries(
    supplierDefinitions.map((supplier) => [
      supplier.id,
      {
        blackMarketTier: supplier.id === "night_market_broker" ? 1 : 0,
        dealCooldownUntil: 0,
        id: supplier.id,
        loyalty: supplier.id === "backdoor_wholesale" ? 12 : 0,
        negotiatedDiscount: 0,
        scamRisk: supplier.scamRisk,
        trust: supplier.id === "backdoor_wholesale" ? 18 : 0,
        unlocked: supplier.unlockRequirement.kind === "always",
        unlockedProductIds: supplier.baseProducts
      } satisfies SupplierRelationshipState
    ])
  );
}

function createInitialFleet(): MachineFleetState {
  return {
    modelExperience: {
      basic_snack: 1
    },
    procurementSequence: 1,
    totalPurchased: 1,
    unlockedModelIds: ["basic_snack", "drink_machine", "combo_machine"],
    vendorReputation: 8
  };
}

function createInitialCustomerMarket(): CustomerMarketState {
  return {
    complaintsByLocation: {},
    decisionSequence: 1,
    loyaltyByLocation: {},
    nextDecisionHour: 8.32,
    recentDecisions: []
  };
}

function createInitialLocationRights(): Record<string, LocationRightsState> {
  return Object.fromEntries(
    Object.values(locations).map((location) => [
      location.id,
      {
        corporatePressure: Math.max(0, Math.round((location.rentCost * 0.12 + location.policePresence * 24) * 10) / 10),
        landlordDisposition: Math.max(18, Math.min(82, Math.round(42 + location.safety * 30 - location.rivalPressure * 20 - location.policePresence * 10))),
        legalPressure: Math.max(0, Math.round((location.policePresence * 44 + (1 - location.safety) * 10) * 10) / 10),
        locationId: location.id,
        permitStatus: "none",
        rightsTier: "none"
      } satisfies LocationRightsState
    ])
  );
}

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
    factions: cloneContent(factions),
    products: cloneContent(products),
    districts: cloneContent(districts),
    districtProgress: createInitialDistrictProgress(),
    locations: cloneContent(locations),
    machines: {
      [playerMachine.id]: cloneContent(playerMachine),
      [rivalMachine.id]: cloneContent(rivalMachine)
    },
    vehicles: {
      [starterVehicle.id]: cloneContent(starterVehicle),
      [chaseVehicle.id]: cloneContent(chaseVehicle)
    },
    employees: {},
    contracts: {},
    base: {
      facilities: createInitialBaseFacilities(),
      securityReadiness: 0.15
    },
    economy: {
      finance: {
        ledger: [],
        nextEntryNumber: 1,
        revenueToday: 0,
        expensesToday: 0,
        frontBusinessRevenueToday: 0,
        insurancePlan: "none"
      },
      supply: {
        nextVolatilityHour: 12,
        volatility: 0.08,
        priceMultipliers: {},
        supplierMood: "stable",
        suppliers: createInitialSuppliers(),
        activeDeals: {}
      },
      traffic: {
        nextTrafficHour: 10,
        congestionByLocation: {},
        fuelPrice: 2.2,
        checkpoints: {},
        vehicleMaintenanceDue: {
          [starterVehicle.id]: 0,
          [chaseVehicle.id]: 0
        }
      },
      spoilage: {
        nextSpoilageHour: 14,
        spoiledToday: 0
      },
      fleet: createInitialFleet(),
      customers: createInitialCustomerMarket(),
      districtEvents: {
        activeEvents: {},
        eventSequence: 1,
        nextEventHour: 10.5
      },
      locationRights: createInitialLocationRights(),
      productCustomizations: {}
    },
    npcControllers: {
      rival_redline: {
        factionId: "rival_redline",
        aggression: 0.55,
        lastActedHour: 8,
        cooldownHours: 2.25
      },
      rival_glassline: {
        factionId: "rival_glassline",
        aggression: 0.28,
        lastActedHour: 8,
        cooldownHours: 7.5
      },
      rival_nightmarket: {
        factionId: "rival_nightmarket",
        aggression: 0.68,
        lastActedHour: 8,
        cooldownHours: 6.25
      },
      rival_marlow: {
        factionId: "rival_marlow",
        aggression: 0.76,
        lastActedHour: 8,
        cooldownHours: 8.25
      }
    },
    machineAlarms: {},
    law: {
      inspectionSequence: 1,
      nextInspectionHour: 14.25,
      activeInspections: {},
      inspectionsToday: 0,
      finesToday: 0,
      confiscatedUnitsToday: 0,
      lastInspectionHour: 0
    },
    conflict: {
      eventSequence: 1,
      nextConflictHour: 12.5,
      activeEvents: {},
      resolvedToday: 0,
      missedToday: 0
    },
    rivalOrganizations: cloneContent(rivalOrganizations),
    empire: {
      activeRaids: {},
      assets: createInitialEmpireAssets(),
      endingExecutions: {},
      legitimacy: 0,
      nextRaidHour: 40,
      politicalPressure: 0,
      raidSequence: 1,
      shellCover: 0
    },
    eventLog: [
      {
        id: "intro_1",
        hour: 8,
        tone: "neutral",
        message: "Starter cash is ready. Repair Rusty Starter in the garage, place it at Foam & Fold, then run supplier stock."
      }
    ],
    streetLife: {
      activitySequence: 1,
      nextActivityHour: 8.18,
      recentActivities: []
    },
    mission: {
      id: "starter_takeover",
      title: "Launch Foam & Fold and survive Redline retaliation",
      completed: false,
      campaign: {},
      quests: {}
    },
    routePlan: {
      selectedTaskId: null
    },
    dayReports: [],
    progression: {
      contractsCompletedTotal: 0,
      nextContractNumber: 1,
      lastReportDay: 0,
      revenueCollectedToday: 0,
      contractRewardsToday: 0,
      contractPenaltiesToday: 0,
      stockSoldToday: 0,
      contractsCompletedToday: 0,
      contractsFailedToday: 0,
      rivalActionsToday: 0,
      productDesignsCompleted: 0,
      starterMachinePlaced: false,
      firstUndercutTriggered: false,
      firstRetaliationTriggered: false
    }
  };
}
