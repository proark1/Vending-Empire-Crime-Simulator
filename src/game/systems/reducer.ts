import type {
  BaseFacilityId,
  CampaignMissionState,
  CommandResult,
  DistrictEvent,
  DistrictEventKind,
  ConflictEncounterState,
  ConflictEvent,
  Employee,
  EmployeeRoutePhase,
  EmployeeRole,
  EmpireAssetId,
  EmpireRaid,
  EmpireRaidResolution,
  Faction,
  FactionId,
  FinanceLedgerCategory,
  GameCommand,
  GameEvent,
  GameEventTone,
  GameState,
  InsurancePlan,
  LawInspection,
  Location,
  LocationRightsApproach,
  MachineModelId,
  MachineSlot,
  MachineAlarmKind,
  PlacementMethod,
  ProductCustomizationMode,
  ProductId,
  RivalOperation,
  RivalOperationApproach,
  RouteVehicle,
  ServiceContract,
  StreetActivity,
  StreetActivityKind,
  SupplierDealKind,
  SupplierRelationshipState,
  VendingMachine
} from "../core/types";
import {
  activeContracts,
  activeAlarmForMachine,
  activeMachineAlarms,
  activeLawInspections,
  activeMajorRaids,
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
  empireAssetEffects,
  empireAssetLevel,
  empireAssetUpgradeCost,
  endgamePathScores,
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
  defaultLocationRights,
  locationRightsFor,
  locationRightsNegotiationCost,
  machineProcurementCost,
  machineProcurementQuotes,
  machineResaleValue,
  supplierAvailable,
  storedPlayerMachines,
  vehicleSpaceRemaining
} from "../core/selectors";
import { machineUpgrades } from "../content/machineUpgrades";
import { machineModels } from "../content/machineModels";
import { baseFacilities } from "../content/baseFacilities";
import { employeeRoles } from "../content/employees";
import { empireAssetList, empireAssets } from "../content/empire";
import { narrativeQuestDefinitions, type NarrativeQuestDefinition, type NarrativeQuestStepDefinition } from "../content/quests";
import { crimeContacts } from "../content/world";
import { supplierDeals, supplierDefinitions, type SupplierDefinition } from "../content/suppliers";
import { storyMissionArcs, type StoryMissionArc, type StoryMissionObjective } from "../content/story";
import { vehicleUpgrades } from "../content/vehicleUpgrades";
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
  for (const event of Object.values(state.conflict.activeEvents)) {
    if (event.status === "active") {
      event.encounter ??= createConflictEncounter(event.kind, event.intensity);
    }
  }
}

function createConflictEncounter(kind: ConflictEvent["kind"], intensity: number): ConflictEncounterState {
  return {
    advantage: kind === "base_raid" ? 12 : kind === "route_ambush" ? 4 : 0,
    chaseProgress: kind === "street_chase" ? 22 : kind === "route_ambush" ? 12 : 0,
    enemyFocus: Math.min(100, 42 + intensity * 0.9),
    enemyHealth: Math.min(100, 44 + intensity * 1.6),
    playerHealth: 100,
    playerStamina: 100
  };
}

function ensureConflictEncounter(event: ConflictEvent): ConflictEncounterState {
  event.encounter ??= createConflictEncounter(event.kind, event.intensity);
  return event.encounter;
}

function ensureRivalOrganizationState(state: GameState): void {
  state.rivalOrganizations ??= {};
  for (const faction of Object.values(state.factions)) {
    if (faction.type !== "npc") {
      continue;
    }

    state.rivalOrganizations[faction.id] ??= {
      factionId: faction.id,
      bossName: `${faction.name} boss`,
      agenda: faction.tactic ?? "Competes for vending territory.",
      headquartersLocationId: ownedMachines(state, faction.id)[0]?.locationId ?? "rival_corner",
      relationship: "tense",
      storyStage: 0,
      leverage: Math.round(faction.streetReputation + faction.money * 0.04),
      operations: []
    };
    state.rivalOrganizations[faction.id].operations ??= [];
    state.rivalOrganizations[faction.id].relationship ??= "tense";
    state.rivalOrganizations[faction.id].leverage ??= 0;
    state.rivalOrganizations[faction.id].storyStage ??= 0;
  }
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
      supplierMood: "stable",
      suppliers: {},
      activeDeals: {}
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
    fleet: {
      modelExperience: { basic_snack: 1 },
      procurementSequence: 1,
      totalPurchased: 1,
      unlockedModelIds: ["basic_snack", "drink_machine", "combo_machine"],
      vendorReputation: 8
    },
    customers: {
      complaintsByLocation: {},
      decisionSequence: 1,
      loyaltyByLocation: {},
      nextDecisionHour: state.worldTimeHours + 0.32,
      recentDecisions: []
    },
    districtEvents: {
      activeEvents: {},
      eventSequence: 1,
      nextEventHour: state.worldTimeHours + 2.5
    },
    locationRights: {},
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
    supplierMood: "stable",
    suppliers: {},
    activeDeals: {}
  };
  state.economy.supply.priceMultipliers ??= {};
  state.economy.supply.nextVolatilityHour ??= state.worldTimeHours + 4;
  state.economy.supply.volatility ??= 0.08;
  state.economy.supply.supplierMood ??= "stable";
  state.economy.supply.suppliers ??= {};
  state.economy.supply.activeDeals ??= {};
  for (const supplier of supplierDefinitions) {
    state.economy.supply.suppliers[supplier.id] ??= createSupplierRelationship(supplier);
    const relationship = state.economy.supply.suppliers[supplier.id];
    relationship.unlockedProductIds ??= supplier.baseProducts;
    relationship.dealCooldownUntil ??= 0;
    relationship.negotiatedDiscount ??= 0;
    relationship.scamRisk ??= supplier.scamRisk;
    relationship.blackMarketTier ??= supplier.id === "night_market_broker" ? 1 : 0;
  }
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
  state.economy.fleet ??= {
    modelExperience: { basic_snack: 1 },
    procurementSequence: 1,
    totalPurchased: ownedMachines(state, state.playerFactionId).length,
    unlockedModelIds: ["basic_snack", "drink_machine", "combo_machine"],
    vendorReputation: 8
  };
  state.economy.fleet.modelExperience ??= {};
  state.economy.fleet.procurementSequence ??= 1;
  state.economy.fleet.totalPurchased ??= ownedMachines(state, state.playerFactionId).length;
  state.economy.fleet.unlockedModelIds ??= ["basic_snack", "drink_machine", "combo_machine"];
  state.economy.fleet.vendorReputation ??= 8;
  for (const machine of ownedMachines(state, state.playerFactionId)) {
    state.economy.fleet.modelExperience[machine.machineModelId] ??= machine.machineModelId === "basic_snack" ? 1 : 0;
  }
  state.economy.customers ??= {
    complaintsByLocation: {},
    decisionSequence: 1,
    loyaltyByLocation: {},
    nextDecisionHour: state.worldTimeHours + 0.32,
    recentDecisions: []
  };
  state.economy.customers.complaintsByLocation ??= {};
  state.economy.customers.decisionSequence ??= 1;
  state.economy.customers.loyaltyByLocation ??= {};
  state.economy.customers.nextDecisionHour ??= state.worldTimeHours + 0.32;
  state.economy.customers.recentDecisions = Array.isArray(state.economy.customers.recentDecisions) ? state.economy.customers.recentDecisions : [];
  state.economy.districtEvents ??= {
    activeEvents: {},
    eventSequence: 1,
    nextEventHour: state.worldTimeHours + 2.5
  };
  state.economy.districtEvents.activeEvents ??= {};
  state.economy.districtEvents.eventSequence ??= 1;
  state.economy.districtEvents.nextEventHour ??= state.worldTimeHours + 2.5;
  state.economy.locationRights ??= {};
  for (const location of Object.values(state.locations ?? {})) {
    const normalized = {
      ...defaultLocationRights(location),
      ...(state.economy.locationRights[location.id] ?? {}),
      locationId: location.id
    };
    if (state.economy.locationRights[location.id]) {
      Object.assign(state.economy.locationRights[location.id], normalized);
    } else {
      state.economy.locationRights[location.id] = normalized;
    }
  }
  state.economy.productCustomizations ??= {};
  for (const vehicle of Object.values(state.vehicles ?? {})) {
    vehicle.upgrades = Array.isArray(vehicle.upgrades) ? vehicle.upgrades : [];
  }
}

function createSupplierRelationship(supplier: SupplierDefinition): SupplierRelationshipState {
  return {
    blackMarketTier: supplier.id === "night_market_broker" ? 1 : 0,
    dealCooldownUntil: 0,
    id: supplier.id,
    loyalty: supplier.id === "backdoor_wholesale" ? 12 : 0,
    negotiatedDiscount: 0,
    scamRisk: supplier.scamRisk,
    trust: supplier.id === "backdoor_wholesale" ? 18 : 0,
    unlocked: supplier.unlockRequirement.kind === "always",
    unlockedProductIds: supplier.baseProducts
  };
}

function ensureEmpireState(state: GameState): void {
  state.empire ??= {
    activeRaids: {},
    assets: {} as GameState["empire"]["assets"],
    endingExecutions: {},
    legitimacy: 0,
    nextRaidHour: state.worldTimeHours + 32,
    politicalPressure: 0,
    raidSequence: 1,
    shellCover: 0
  };
  state.empire.activeRaids ??= {};
  state.empire.assets ??= {} as GameState["empire"]["assets"];
  for (const asset of empireAssetList) {
    state.empire.assets[asset.id] ??= { id: asset.id, level: 0 };
  }
  state.empire.endingExecutions ??= {};
  state.empire.legitimacy ??= 0;
  state.empire.nextRaidHour ??= state.worldTimeHours + 32;
  state.empire.politicalPressure ??= 0;
  state.empire.raidSequence ??= 1;
  state.empire.shellCover ??= 0;
}

function ensureCampaignMissionState(state: GameState): void {
  state.mission ??= {
    id: "starter_takeover",
    title: "Launch Foam & Fold and survive Redline retaliation",
    completed: false,
    campaign: {},
    quests: {}
  };
  state.mission.campaign ??= {};
  state.mission.quests ??= {};
  state.progression.productDesignsCompleted ??= Object.keys(state.economy?.productCustomizations ?? {}).length;

  for (const arc of storyMissionArcs) {
    const firstStep = arc.missionChain[0];
    if (!firstStep) {
      continue;
    }

    const current = state.mission.campaign[arc.id];
    state.mission.campaign[arc.id] = {
      arcId: arc.id,
      activeStepId: current?.activeStepId ?? firstStep.id,
      completed: current?.completed ?? false,
      completedHour: current?.completedHour,
      completedStepIds: Array.isArray(current?.completedStepIds) ? current.completedStepIds : [],
      unlockedHour: current?.unlockedHour ?? (arc.id === "starter_takeover" ? 0 : state.worldTimeHours)
    };
  }

  for (const quest of narrativeQuestDefinitions) {
    state.mission.quests[quest.id] ??= {
      activeStepId: quest.steps[0]?.id ?? "",
      choiceHistory: [],
      completedStepIds: [],
      dialogueLog: [],
      id: quest.id,
      status: "available"
    };
    state.mission.quests[quest.id].choiceHistory ??= [];
    state.mission.quests[quest.id].completedStepIds ??= [];
    state.mission.quests[quest.id].dialogueLog ??= [];
  }
}

const insurancePlans: Record<InsurancePlan, { dailyCost: number; coverage: number; label: string }> = {
  none: { dailyCost: 0, coverage: 0, label: "No insurance" },
  basic: { dailyCost: 9, coverage: 0.35, label: "Basic insurance" },
  premium: { dailyCost: 22, coverage: 0.68, label: "Premium insurance" }
};

const customizationModes: Record<ProductCustomizationMode, {
  brandName: string;
  brandRecognition: number;
  brandTone: "value" | "premium" | "discreet";
  colorway: string;
  cost: number;
  costDelta: number;
  demandBonus: number;
  designScore: number;
  heatDelta: number;
  label: string;
  packageAppeal: number;
  packageStyle: "budget_sleeve" | "premium_wrap" | "stealth_label";
  riskMasking: number;
  tagline: string;
}> = {
  value_pack: {
    label: "Value pack",
    brandName: "Corner Value",
    brandRecognition: 0.18,
    brandTone: "value",
    colorway: "signal yellow / bottle green",
    cost: 55,
    demandBonus: 0.1,
    designScore: 54,
    costDelta: -0.35,
    heatDelta: 0.05,
    packageAppeal: 0.58,
    packageStyle: "budget_sleeve",
    riskMasking: 0.08,
    tagline: "More route for less."
  },
  premium_wrap: {
    label: "Premium wrap",
    brandName: "Vendetta Select",
    brandRecognition: 0.34,
    brandTone: "premium",
    colorway: "carbon black / mint foil",
    cost: 75,
    demandBonus: 0.18,
    designScore: 72,
    costDelta: 0.4,
    heatDelta: 0,
    packageAppeal: 0.76,
    packageStyle: "premium_wrap",
    riskMasking: 0.16,
    tagline: "Clean shelf, sharper margin."
  },
  discreet_label: {
    label: "Discreet label",
    brandName: "Plain Sight Goods",
    brandRecognition: 0.22,
    brandTone: "discreet",
    colorway: "matte white / slate code",
    cost: 95,
    demandBonus: 0.04,
    designScore: 66,
    costDelta: 0.25,
    heatDelta: -0.38,
    packageAppeal: 0.42,
    packageStyle: "stealth_label",
    riskMasking: 0.72,
    tagline: "Nothing to see, everything to sell."
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

function recordStreetActivity(state: GameState, activity: Omit<StreetActivity, "hour" | "id">): void {
  ensureStreetLifeState(state);
  const streetActivity: StreetActivity = {
    ...activity,
    id: `street_${state.streetLife.activitySequence++}`,
    hour: state.worldTimeHours
  };
  state.streetLife.recentActivities = [streetActivity, ...state.streetLife.recentActivities].slice(0, 10);
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

function createStoredMachine(state: GameState, ownerFactionId: FactionId, machineModelId: MachineModelId): VendingMachine {
  const id = `machine_${ownerFactionId}_${state.nextMachineNumber++}`;
  const model = machineModels[machineModelId] ?? machineModels.basic_snack;
  const fleetNumber = state.economy?.fleet?.procurementSequence ?? state.nextMachineNumber - 1;
  const baseName = model.name.replace(" Machine", "").replace(" Vending Unit", " Unit");
  const machine: VendingMachine = {
    id,
    name: `${baseName} ${fleetNumber}`,
    ownerFactionId,
    machineModelId: model.id,
    locationId: "garage",
    placementStatus: "stored",
    placementMethod: "legal_contract",
    slots: [],
    maxSlots: model.maxSlots,
    revenueStored: 0,
    damage: 0,
    security: clamp01(0.2 + model.securityBonus),
    visibility: Math.max(0.12, Math.min(1.35, 0.78 + model.visibilityBonus)),
    heat: 0,
    lastServicedHour: state.worldTimeHours,
    upgrades: []
  };
  state.machines[id] = machine;
  return machine;
}

function increaseFleetExperience(state: GameState, modelId: MachineModelId, amount: number): void {
  ensureEconomyState(state);
  state.economy.fleet.modelExperience[modelId] = (state.economy.fleet.modelExperience[modelId] ?? 0) + amount;
  state.economy.fleet.vendorReputation = Math.min(100, state.economy.fleet.vendorReputation + amount * 0.85);
  if (!state.economy.fleet.unlockedModelIds.includes(modelId)) {
    state.economy.fleet.unlockedModelIds.push(modelId);
  }
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

interface EmployeeTraitDefinition {
  id: string;
  label: string;
  description: string;
  serviceBonus?: number;
  pressureBonus?: number;
  nerveBonus?: number;
}

const employeeTraits: EmployeeTraitDefinition[] = [
  {
    id: "steady_hands",
    label: "Steady hands",
    description: "Handles crates and repairs cleanly.",
    serviceBonus: 2
  },
  {
    id: "local_face",
    label: "Local face",
    description: "Knows which landlord or clerk needs a calm word.",
    pressureBonus: 0.025
  },
  {
    id: "night_nerve",
    label: "Night nerve",
    description: "Keeps moving when alarms and route trouble spike.",
    nerveBonus: 0.03
  },
  {
    id: "fast_ledger",
    label: "Fast ledger",
    description: "Turns cash stops and inventory counts around quickly.",
    serviceBonus: 1,
    pressureBonus: 0.012
  }
];

function employeeTraitDefinition(employee: Employee): EmployeeTraitDefinition {
  return employeeTraits.find((trait) => trait.label === employee.trait || trait.id === employee.trait) ?? employeeTraits[0];
}

function employeeTraitFor(role: EmployeeRole, employeeNumber: number): EmployeeTraitDefinition {
  const roleOffset: Record<EmployeeRole, number> = {
    restocker: 0,
    collector: 3,
    technician: 0,
    guard: 2,
    scout: 2,
    negotiator: 1,
    runner: 3,
    regional_manager: 1
  };
  return employeeTraits[(employeeNumber + roleOffset[role] - 1) % employeeTraits.length];
}

function employeeServiceBonus(employee: Employee): number {
  return employeeTraitDefinition(employee).serviceBonus ?? 0;
}

function employeePressureBonus(employee: Employee): number {
  return employeeTraitDefinition(employee).pressureBonus ?? 0;
}

function employeeNerveBonus(employee: Employee): number {
  return employeeTraitDefinition(employee).nerveBonus ?? 0;
}

function createEmployee(state: GameState, role: EmployeeRole): Employee {
  const definition = employeeRoles[role];
  const employeeNumber = state.nextEmployeeNumber++;
  const names = employeeNames[role];
  const name = `${names[(employeeNumber - 1) % names.length]} ${definition.title}`;
  const trait = employeeTraitFor(role, employeeNumber);

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
    routePhase: "idle",
    routeTargetLocationId: "garage",
    skill: definition.skill,
    speed: definition.speed,
    status: "idle",
    statusDetail: "Waiting for assignments.",
    trait: trait.label,
    traitDescription: trait.description,
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
    encounter: createConflictEncounter(kind, intensity),
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

function rivalActionProfile(faction: Faction): {
  expansionCostMultiplier: number;
  expandPressure: number;
  sabotageBonus: number;
  sabotagePressure: number;
  undercutCost: number;
  undercutPressure: number;
  verb: string;
} {
  if (faction.archetype === "corporate") {
    return {
      expansionCostMultiplier: 0.82,
      expandPressure: 0.04,
      sabotageBonus: -4,
      sabotagePressure: 0.08,
      undercutCost: 18,
      undercutPressure: 0.28,
      verb: "filed complaints around"
    };
  }

  if (faction.archetype === "black_market") {
    return {
      expansionCostMultiplier: 0.56,
      expandPressure: 0.1,
      sabotageBonus: 2,
      sabotagePressure: 0.18,
      undercutCost: 10,
      undercutPressure: 0.26,
      verb: "copied the grey-stock draw near"
    };
  }

  if (faction.archetype === "former_partner") {
    return {
      expansionCostMultiplier: 0.62,
      expandPressure: 0.14,
      sabotageBonus: 6,
      sabotagePressure: 0.2,
      undercutCost: 12,
      undercutPressure: 0.24,
      verb: "used old route knowledge against"
    };
  }

  return {
    expansionCostMultiplier: 0.65,
    expandPressure: 0.12,
    sabotageBonus: 3,
    sabotagePressure: 0.16,
    undercutCost: 12,
    undercutPressure: 0.22,
    verb: "leaned on"
  };
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

function finishPlayerConflict(
  state: GameState,
  events: GameEvent[],
  conflict: ConflictEvent,
  resolution: "melee" | "drive_escape" | "remote_lockdown",
  message: string,
  tone: GameEventTone = "good"
): void {
  const player = state.factions[state.playerFactionId];
  const threat = state.factions[conflict.threatFactionId];
  const location = state.locations[conflict.locationId];
  conflict.status = "resolved";
  conflict.resolution = resolution;
  conflict.resolvedHour = state.worldTimeHours;
  state.conflict.resolvedToday += 1;

  if (resolution === "melee") {
    player.streetReputation += 1.3;
    player.heat += 1.1;
    if (threat) {
      threat.heat += 1.5;
      threat.streetReputation = Math.max(0, threat.streetReputation - 0.25);
    }
    if (location) {
      location.rivalPressure = Math.max(0, location.rivalPressure - 0.12);
    }
  }

  if (resolution === "drive_escape") {
    player.streetReputation += 0.4;
    player.heat += 0.75;
    if (location) {
      location.rivalPressure = Math.max(0, location.rivalPressure - 0.08);
    }
  }

  if (resolution === "remote_lockdown" && location) {
    location.rivalPressure = Math.max(0, location.rivalPressure - 0.04);
  }

  log(state, events, message, tone);
}

function advanceVehicleConflictEscape(state: GameState, events: GameEvent[], vehicle: RouteVehicle, distance: number): void {
  if (distance <= 0) {
    return;
  }

  for (const conflict of activeConflictEvents(state)) {
    if (conflict.locationId !== vehicle.locationId || (conflict.kind !== "street_chase" && conflict.kind !== "route_ambush")) {
      continue;
    }

    const encounter = ensureConflictEncounter(conflict);
    const condition = Math.max(0.35, vehicle.condition ?? 1);
    const escapePush = distance * (1.25 + vehicle.escapeRating * 2.35 + condition * 0.9);
    encounter.chaseProgress = Math.min(100, encounter.chaseProgress + escapePush);
    encounter.enemyFocus = Math.max(0, encounter.enemyFocus - distance * (0.22 + vehicle.escapeRating * 0.2));
    encounter.playerStamina = Math.max(0, encounter.playerStamina - distance * 0.08);

    if (encounter.chaseProgress >= 100 && conflict.status === "active") {
      finishPlayerConflict(state, events, conflict, "drive_escape", `${vehicle.name} broke clear of the trouble near ${state.locations[conflict.locationId]?.name ?? "the route"}.`, "good");
    }
  }
}

function vehicleWearMultiplier(vehicle: RouteVehicle): number {
  return (vehicle.upgrades ?? []).reduce((multiplier, upgradeId) => {
    const upgrade = vehicleUpgrades[upgradeId];
    return multiplier * (upgrade.conditionWearMultiplier ?? 1);
  }, 1);
}

function activeRivalOperations(state: GameState): RivalOperation[] {
  ensureRivalOrganizationState(state);
  return Object.values(state.rivalOrganizations).flatMap((organization) => organization.operations.filter((operation) => !operation.resolvedHour));
}

function findRivalOperation(state: GameState, operationId: string): { operation: RivalOperation; organization: GameState["rivalOrganizations"][FactionId] } | null {
  ensureRivalOrganizationState(state);
  for (const organization of Object.values(state.rivalOrganizations)) {
    const operation = organization.operations.find((candidate) => candidate.id === operationId);
    if (operation) {
      return { operation, organization };
    }
  }
  return null;
}

function operationKindLabel(kind: RivalOperation["kind"]): string {
  return kind.replace("_", " ");
}

function rivalOperationApproachCost(approach: RivalOperationApproach): number {
  return approach === "negotiate" ? 24 : approach === "expose" ? 12 : 8;
}

function locationRightsApproachLabel(approach: LocationRightsApproach): string {
  if (approach === "landlord_meeting") {
    return "landlord meeting";
  }

  if (approach === "permit_filing") {
    return "permit filing";
  }

  if (approach === "exclusive_contract") {
    return "exclusive contract";
  }

  return "shell paperwork";
}

function applyRivalOperationConsequence(state: GameState, events: GameEvent[], operation: RivalOperation): void {
  const rival = state.factions[operation.factionId];
  const location = state.locations[operation.locationId];
  const district = state.districts[operation.districtId];
  const player = state.factions[state.playerFactionId];
  const rivalName = rival?.name ?? "A rival";

  if (operation.kind === "price_war") {
    if (location) {
      location.rivalPressure = clamp01(location.rivalPressure + 0.08 + operation.strength * 0.1);
    }
    if (rival) {
      rival.money = Math.max(0, rival.money - Math.round(7 + operation.strength * 8));
    }
    log(state, events, `${rivalName} price-war operation tightened pressure near ${location?.name ?? district?.name ?? "the route"}.`, "warning");
  }

  if (operation.kind === "permit_pressure") {
    player.heat += 0.8 + operation.strength * 1.3;
    state.law.nextInspectionHour = Math.min(state.law.nextInspectionHour, state.worldTimeHours + Math.max(0.35, 1.1 - operation.strength * 0.45));
    log(state, events, `${rivalName} leaned on permit offices. Inspection heat is moving faster.`, "danger");
  }

  if (operation.kind === "sabotage_cell") {
    const districtMachine = installedMachines(state, state.playerFactionId)
      .filter((machine) => state.locations[machine.locationId]?.districtId === operation.districtId)
      .sort((a, b) => (state.locations[b.locationId]?.rivalPressure ?? 0) - (state.locations[a.locationId]?.rivalPressure ?? 0))[0];
    if (districtMachine) {
      createMachineAlarm(state, events, districtMachine, operation.factionId, "sabotage", Math.round(18 + operation.strength * 18));
    } else if (location) {
      createConflictEvent(state, events, "street_chase", location.id, operation.factionId, Math.round(12 + operation.strength * 16), `${rivalName} sabotage cell spilled into a chase near ${location.name}.`);
    }
  }

  if (operation.kind === "grey_supply") {
    if (rival) {
      rival.money += Math.round(12 + operation.strength * 18);
      rival.heat += 0.8;
    }
    if (location) {
      location.rivalPressure = clamp01(location.rivalPressure + 0.06 + operation.strength * 0.08);
    }
    log(state, events, `${rivalName} moved grey stock through ${location?.name ?? district?.name ?? "the district"}.`, "warning");
  }

  if (operation.kind === "expansion") {
    if (location && !machineAtLocation(state, location.id) && isDistrictUnlockedForPlacement(state, location.districtId) && rival && rival.money >= 20) {
      const rights = state.economy.locationRights[location.id] ??= locationRightsFor(state, location.id);
      if (rights.exclusiveContractHolderId === state.playerFactionId && (rights.exclusiveUntilHour ?? 0) > state.worldTimeHours) {
        rights.corporatePressure = Math.min(100, rights.corporatePressure + 7);
        rights.legalPressure = Math.min(100, rights.legalPressure + 4);
        log(state, events, `${rivalName} tested the exclusive at ${location.name}, but your contract held.`, "warning");
        operation.progress = Math.max(0, operation.progress - 18);
        return;
      }

      createMachine(state, operation.factionId, location.id, "rival_territory");
      rival.money = Math.max(0, rival.money - 20);
      location.rivalPressure = clamp01(location.rivalPressure + 0.12);
      log(state, events, `${rivalName} completed an expansion cell at ${location.name}.`, "danger");
    } else if (location) {
      location.rivalPressure = clamp01(location.rivalPressure + 0.1);
      log(state, events, `${rivalName} expansion scouts raised pressure near ${location.name}.`, "warning");
    }
  }

  operation.progress = 34;
  operation.strength = clamp01(operation.strength + 0.04);
}

function advanceRivalOperations(state: GameState, events: GameEvent[], hours: number): void {
  ensureRivalOrganizationState(state);
  for (const organization of Object.values(state.rivalOrganizations)) {
    const truceActive = Boolean(organization.truceUntilHour && organization.truceUntilHour > state.worldTimeHours);
    for (const operation of organization.operations) {
      if (operation.resolvedHour) {
        continue;
      }

      const access = districtProgress(state, operation.districtId).access;
      const accessMultiplier = access === "unlocked" ? 1 : access === "scouted" ? 0.64 : 0.35;
      const exposureDrag = operation.exposed ? 0.7 : 1;
      const truceDrag = truceActive ? 0.38 : 1;
      operation.progress = Math.min(130, operation.progress + hours * (3.8 + operation.strength * 5.4) * accessMultiplier * exposureDrag * truceDrag);
      if (operation.progress >= 100) {
        applyRivalOperationConsequence(state, events, operation);
        organization.leverage = Math.min(100, organization.leverage + 2);
      }
    }
  }
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

const districtEventProducts: ProductId[] = ["soda", "chips", "energy", "water", "coffee_can", "umbrella", "phone_charger", "mystery_capsules", "mood_fizz"];

function districtEventTemplate(kind: DistrictEventKind, state: GameState, districtId: string, phase: number): Omit<DistrictEvent, "districtId" | "expiresHour" | "id" | "startedHour"> {
  const district = state.districts[districtId];
  const districtName = district?.name ?? "District";
  const primaryTag = district?.dominantTags?.[phase % Math.max(1, district.dominantTags.length)] ?? "commuter";
  const productId = districtEventProducts[phase % districtEventProducts.length];

  if (kind === "festival") {
    return {
      congestionDelta: 0.28,
      demandMultiplier: 1.38,
      demandTags: [primaryTag, "night", "arcade"],
      description: "Crowds are moving in waves and empty machines get noticed fast.",
      heatDelta: 0.35,
      kind,
      title: `${districtName} street festival`,
      tone: "good"
    };
  }

  if (kind === "weather") {
    return {
      congestionDelta: 0.18,
      demandMultiplier: 1.12,
      demandTags: ["commuter", "office", "umbrella"],
      description: "Bad weather slows routes but boosts utility and hot drink demand.",
      heatDelta: -0.08,
      kind,
      productId: "umbrella",
      title: `${districtName} rain front`,
      tone: "warning"
    };
  }

  if (kind === "shortage") {
    return {
      congestionDelta: 0.1,
      demandMultiplier: 1.18,
      demandTags: state.products[productId]?.demandTags.slice(0, 2) ?? [primaryTag],
      description: `${state.products[productId]?.name ?? "Stock"} is scarce. Loaded routes can charge into the gap.`,
      heatDelta: 0.12,
      kind,
      productId,
      title: `${state.products[productId]?.name ?? "Stock"} shortage`,
      tone: "warning"
    };
  }

  if (kind === "police_surge") {
    return {
      congestionDelta: 0.22,
      demandMultiplier: 0.92,
      demandTags: ["commuter", primaryTag],
      description: "Patrols are thick. Legal placements stay safer, grey stock draws attention.",
      heatDelta: 0.85,
      kind,
      title: `${districtName} patrol surge`,
      tone: "danger"
    };
  }

  return {
    congestionDelta: 0.08,
    demandMultiplier: 1.26,
    demandTags: [primaryTag, "student", "night"],
    description: "Local chatter is pulling customers toward a narrower product mix.",
    heatDelta: 0.18,
    kind,
    productId,
    title: `${districtName} trend spike`,
    tone: "good"
  };
}

function updateDistrictEvents(state: GameState, events: GameEvent[]): void {
  ensureEconomyState(state);
  for (const [eventId, event] of Object.entries(state.economy.districtEvents.activeEvents)) {
    if (event.expiresHour <= state.worldTimeHours) {
      delete state.economy.districtEvents.activeEvents[eventId];
    }
  }

  if (state.economy.districtEvents.nextEventHour > state.worldTimeHours) {
    return;
  }

  const unlockedDistricts = Object.values(state.districts).filter((district) => districtProgress(state, district.id).access !== "locked");
  const districts = unlockedDistricts.length > 0 ? unlockedDistricts : Object.values(state.districts);
  if (districts.length === 0) {
    state.economy.districtEvents.nextEventHour = state.worldTimeHours + 4;
    return;
  }

  const phase = state.economy.districtEvents.eventSequence + Math.floor(state.worldTimeHours);
  const kinds: DistrictEventKind[] = ["festival", "weather", "shortage", "trend", "police_surge"];
  const district = districts[phase % districts.length];
  const kind = kinds[phase % kinds.length];
  const template = districtEventTemplate(kind, state, district.id, phase);
  const eventId = `district_event_${state.economy.districtEvents.eventSequence++}`;
  const duration = kind === "festival" ? 5.5 : kind === "police_surge" ? 3.5 : 4.25;
  const districtEvent: DistrictEvent = {
    ...template,
    districtId: district.id,
    expiresHour: state.worldTimeHours + duration,
    id: eventId,
    startedHour: state.worldTimeHours
  };
  state.economy.districtEvents.activeEvents[eventId] = districtEvent;
  state.economy.districtEvents.nextEventHour = state.worldTimeHours + 3.5 + (phase % 4) * 0.9;

  if (districtEvent.kind === "shortage" && districtEvent.productId) {
    state.economy.supply.priceMultipliers[districtEvent.productId] = Math.max(1.12, state.economy.supply.priceMultipliers[districtEvent.productId] ?? 1.18);
  }

  log(state, events, `${districtEvent.title}: ${districtEvent.description}`, districtEvent.tone);
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
    const eventCongestion = Object.values(state.economy.districtEvents.activeEvents)
      .filter((event) => event.districtId === location.districtId && event.expiresHour > state.worldTimeHours)
      .reduce((sum, event) => sum + event.congestionDelta, 0);
    state.economy.traffic.congestionByLocation[location.id] = Math.max(0.05, Math.min(0.95, pulse * location.footTraffic * 0.58 + eventCongestion));
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
    const vehicleSpoiled = Object.values(state.vehicles).reduce((sum, vehicle) => {
      const protection = vehicle.upgrades?.includes("cold_box") ? 0.42 : 0.1;
      return sum + spoilInventory(state, vehicle.inventory, hours, protection);
    }, 0);
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
  ensureEmpireState(state);
  const player = state.factions[state.playerFactionId];
  const empireEffects = empireAssetEffects(state);
  const officeIncome = (baseFacilities.office.effectsPerLevel.frontBusinessIncome ?? 0) * baseFacilityLevel(state, "office");
  const legalMachineIncome = installedMachines(state, state.playerFactionId).filter((machine) => machine.placementMethod === "legal_contract").length * 4;
  const shellCover = Math.max(state.empire.shellCover, empireEffects.shellCover ?? 0);
  const hiddenLaunderingCost = installedMachines(state, state.playerFactionId).filter((machine) => machine.placementMethod === "hidden" || machine.placementMethod === "bribe").length * Math.max(0.55, 2 - shellCover * 2.4);
  const empireFrontIncome = empireEffects.frontBusinessIncome ?? 0;
  const frontIncome = Math.max(0, Math.round(officeIncome + legalMachineIncome + empireFrontIncome - hiddenLaunderingCost));
  if (frontIncome > 0) {
    creditPlayer(state, "front_business", frontIncome, "Front-business daily receipts");
    state.economy.finance.frontBusinessRevenueToday += frontIncome;
    log(state, events, `Front-business receipts added $${frontIncome}.`, "good");
  }

  decayAndEscalatePoliticalPressure(state);

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
    return 0.12;
  }

  if (method === "hidden") {
    return 0.34;
  }

  if (method === "bribe") {
    return 1.45;
  }

  if (method === "rival_territory") {
    return 2;
  }

  return 2.55;
}

function inspectionRiskScore(state: GameState, machine: VendingMachine): number {
  const location = state.locations[machine.locationId];
  if (!location || !isMachineInstalled(machine)) {
    return 0;
  }

  const stockRisk = machine.slots.reduce((sum, slot) => {
    const product = state.products[slot.productId];
    const stockSignal = Math.max(0.45, Math.min(1.35, slot.quantity / 10));
    return sum + ((product?.legality ?? 0) * 1.25 + (product?.heat ?? 0) * 0.22) * stockSignal;
  }, 0);
  const heatRisk = machine.heat * 0.38 + (state.factions[machine.ownerFactionId]?.heat ?? 0) * 0.08;
  const policingRisk = location.policePresence * 5 + Math.max(0, 1 - location.safety) * 1.5;
  const visibilityRisk = Math.max(0.2, machine.visibility) * 0.55;
  const player = state.factions[state.playerFactionId];
  const paperworkShield = machine.placementMethod === "legal_contract" ? Math.min(0.8, player.publicReputation * 0.035) : 0;
  const rights = locationRightsFor(state, location.id);
  const permitShield = rights.permitStatus === "active" && machine.placementMethod === "legal_contract" ? 1.35 : rights.permitStatus === "challenged" ? -0.65 : 0;
  const exclusiveShield = rights.exclusiveUntilHour && rights.exclusiveUntilHour > state.worldTimeHours && rights.exclusiveContractHolderId === state.playerFactionId ? 0.45 : 0;
  const rightsPressure = rights.legalPressure * 0.028 + rights.corporatePressure * 0.018 - Math.max(0, rights.landlordDisposition - 55) * 0.01;
  const shellShield = Math.min(0.95, Math.max(state.empire?.shellCover ?? 0, empireAssetEffects(state).shellCover ?? 0));
  const securityShield =
    machine.security * 0.22 +
    (machineHasUpgrade(machine, "security_camera") ? 0.22 : 0) +
    (machineHasUpgrade(machine, "remote_monitor") ? 0.1 : 0);

  return Math.max(
    0,
    stockRisk +
      heatRisk +
      policingRisk +
      visibilityRisk +
      rightsPressure +
      placementRiskScore(machine.placementMethod ?? "legal_contract") -
      paperworkShield -
      permitShield -
      exclusiveShield -
      securityShield -
      shellShield
  );
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

function advanceLocationRights(state: GameState, events: GameEvent[], hours: number): void {
  ensureEconomyState(state);
  ensureEmpireState(state);

  for (const rights of Object.values(state.economy.locationRights)) {
    const location = state.locations[rights.locationId];
    if (!location || location.kind === "garage" || location.kind === "supplier") {
      continue;
    }

    if (rights.permitStatus === "active" && rights.permitExpiresHour && rights.permitExpiresHour <= state.worldTimeHours) {
      rights.permitStatus = "challenged";
      rights.permitExpiresHour = undefined;
      rights.legalPressure = Math.min(100, rights.legalPressure + 8);
      log(state, events, `${location.name} permit lapsed into a challenge. Renew paperwork or expect inspections.`, "warning");
    }

    if (rights.exclusiveContractHolderId && rights.exclusiveUntilHour && rights.exclusiveUntilHour <= state.worldTimeHours) {
      rights.exclusiveContractHolderId = undefined;
      rights.exclusiveUntilHour = undefined;
      rights.rightsTier = rights.permitStatus === "active" ? "standard_permit" : rights.rightsTier === "exclusive" ? "handshake" : rights.rightsTier;
      rights.corporatePressure = Math.min(100, rights.corporatePressure + 3);
      log(state, events, `${location.name} exclusive window expired.`, "neutral");
    }

    const permitRelief = rights.permitStatus === "active" ? 0.18 : rights.permitStatus === "challenged" ? -0.05 : 0;
    const landlordRelief = Math.max(0, rights.landlordDisposition - 50) * 0.004;
    const pressureGrowth = location.policePresence * 0.22 + location.rivalPressure * 0.18 + Math.max(0, rights.corporatePressure - 55) * 0.006;
    rights.legalPressure = Math.max(0, Math.min(100, rights.legalPressure + hours * (pressureGrowth - permitRelief - landlordRelief)));
    rights.corporatePressure = Math.max(
      0,
      Math.min(100, rights.corporatePressure + hours * (location.rivalPressure * 0.2 + location.footTraffic * 0.025 - Math.max(0, rights.landlordDisposition - 55) * 0.006))
    );
    rights.landlordDisposition = Math.max(0, Math.min(100, rights.landlordDisposition - hours * Math.max(0, location.rivalPressure - 0.35) * 0.12));

    if (rights.corporatePressure >= 78) {
      state.empire.politicalPressure = Math.min(100, state.empire.politicalPressure + hours * 0.08);
    }
  }
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

function nearestVehicleStop(state: GameState, position: { x: number; z: number }): Location | undefined {
  const ranked = Object.values(state.locations)
    .map((location) => ({
      location,
      distance: Math.hypot(location.position.x - position.x, location.position.z - position.z)
    }))
    .sort((a, b) => a.distance - b.distance);

  const nearest = ranked[0];
  return nearest && nearest.distance <= 6.25 ? nearest.location : undefined;
}

function parkedVehiclePose(location: Location): { heading: number; position: { x: number; z: number } } {
  const streetSide = location.position.z > 0 ? -1 : 1;
  return {
    position: {
      x: location.position.x + 4,
      z: location.position.z + streetSide * 2.25
    },
    heading: location.id === "garage" || location.position.z > 0 ? -Math.PI / 2 : Math.PI / 2
  };
}

function normalizeHeading(heading: number): number {
  if (!Number.isFinite(heading)) {
    return 0;
  }

  const fullTurn = Math.PI * 2;
  return ((heading % fullTurn) + fullTurn) % fullTurn;
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

function customerArchetypeForLocation(state: GameState, location: Location): string {
  const archetypes = state.districts[location.districtId]?.customerArchetypes ?? [];
  if (archetypes.length === 0) {
    return location.demandTags[0] ?? "regular";
  }

  return archetypes[(state.economy.customers.decisionSequence - 1) % archetypes.length];
}

function customerPreferredSlotScore(state: GameState, location: Location, slot: MachineSlot): number {
  const product = state.products[slot.productId];
  const tagMatches = product.demandTags.filter((tag) => location.demandTags.includes(tag)).length;
  const pricePressure = Math.max(0, slot.price / Math.max(1, product.basePrice) - 1) * 0.45;
  return product.demand + tagMatches * 0.32 + Math.min(0.2, slot.quantity / Math.max(1, slot.capacity) * 0.2) - pricePressure;
}

function recordCustomerDecision(
  state: GameState,
  decision: Omit<GameState["economy"]["customers"]["recentDecisions"][number], "hour" | "id">
): void {
  ensureEconomyState(state);
  const entry = {
    ...decision,
    id: `customer_${state.economy.customers.decisionSequence++}`,
    hour: state.worldTimeHours
  };
  state.economy.customers.recentDecisions = [entry, ...state.economy.customers.recentDecisions].slice(0, 18);
}

function runCustomerDecision(state: GameState, events: GameEvent[], preferredOutcome?: "purchase" | "complaint" | "walkaway" | "tipoff"): boolean {
  ensureEconomyState(state);
  const machines = sortMachinesByTraffic(
    state,
    installedMachines(state, state.playerFactionId).filter((machine) => machine.damage < 100)
  );
  const candidates = preferredOutcome === "complaint"
    ? machines
        .map((machine) => ({ machine, score: (machineStockUnits(machine) === 0 ? 5 : 0) + machine.damage / 18 + (state.economy.customers.complaintsByLocation[machine.locationId] ?? 0) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ machine }) => machine)
    : machines;
  const machine = candidates[(state.economy.customers.decisionSequence - 1) % Math.max(1, candidates.length)];
  if (!machine) {
    return false;
  }

  const location = state.locations[machine.locationId];
  if (!location) {
    return false;
  }

  const stockedSlots = machine.slots
    .filter((slot) => slot.quantity > 0)
    .sort((a, b) => customerPreferredSlotScore(state, location, b) - customerPreferredSlotScore(state, location, a));
  const slot = stockedSlots[0];
  const product = slot ? state.products[slot.productId] : undefined;
  const archetypeId = customerArchetypeForLocation(state, location);
  const loyalty = state.economy.customers.loyaltyByLocation[location.id] ?? 0;
  const complaints = state.economy.customers.complaintsByLocation[location.id] ?? 0;
  const priceRatio = slot && product ? slot.price / Math.max(1, product.basePrice) : 1.4;
  const tagMatches = product ? product.demandTags.filter((tag) => location.demandTags.includes(tag)).length : 0;
  const satisfaction = Math.max(
    0,
    Math.min(
      100,
      48 +
        (product?.demand ?? 0.2) * 22 +
        tagMatches * 9 +
        loyalty * 0.28 -
        complaints * 3.2 -
        machine.damage * 0.36 -
        Math.max(0, priceRatio - 1.2) * 28 -
        location.rivalPressure * 9 -
        machine.heat * 0.35
    )
  );
  const highRiskStock = Boolean(product && product.legality > 0 && (machine.heat >= 4 || location.policePresence >= 0.38));
  const forcedOutcome = preferredOutcome === "purchase" && !slot ? undefined : preferredOutcome;
  const outcome = forcedOutcome ?? (!slot ? (machine.damage >= 45 ? "complaint" : "walkaway") : highRiskStock && satisfaction < 58 ? "tipoff" : satisfaction >= 38 ? "purchase" : satisfaction <= 24 ? "complaint" : "walkaway");

  if (outcome === "purchase" && slot && product) {
    const owner = state.factions[machine.ownerFactionId];
    slot.quantity -= 1;
    slot.salesAccumulator = Math.max(0, slot.salesAccumulator - 1);
    machine.revenueStored += slot.price;
    machine.heat += product.heat * 0.04;
    owner.heat += product.heat * 0.012;
    state.progression.stockSoldToday += 1;
    state.economy.customers.loyaltyByLocation[location.id] = Math.min(100, loyalty + 0.8 + satisfaction * 0.018);
    state.economy.customers.complaintsByLocation[location.id] = Math.max(0, complaints - 0.35);
    recordCustomerDecision(state, {
      archetypeId,
      locationId: location.id,
      machineId: machine.id,
      outcome,
      productId: product.id,
      reason: tagMatches > 0 ? "matched local demand" : "visible stocked machine",
      satisfaction,
      spend: slot.price
    });
    logStreetActivity(state, events, {
      actor: "customer",
      amount: slot.price,
      kind: "customer_purchase",
      locationId: machine.locationId,
      machineId: machine.id,
      message: `${archetypeId} bought ${product.name} from ${machine.name} at ${location.name}.`,
      productId: product.id,
      tone: "good"
    });
    return true;
  }

  if (outcome === "tipoff") {
    const player = state.factions[state.playerFactionId];
    player.heat += 0.9;
    state.law.nextInspectionHour = Math.min(state.law.nextInspectionHour, state.worldTimeHours + 1.2);
    state.economy.customers.complaintsByLocation[location.id] = complaints + 0.8;
    recordCustomerDecision(state, {
      archetypeId,
      locationId: location.id,
      machineId: machine.id,
      outcome,
      productId: product?.id,
      reason: "risky stock drew attention",
      satisfaction,
      spend: 0
    });
    logStreetActivity(state, events, {
      actor: "customer",
      kind: "customer_tipoff",
      locationId: machine.locationId,
      machineId: machine.id,
      message: `${archetypeId} tipped off chatter around ${machine.name}; inspection timing tightened.`,
      productId: product?.id,
      tone: "danger"
    });
    return true;
  }

  if (outcome === "complaint") {
    const player = state.factions[state.playerFactionId];
    player.publicReputation = Math.max(0, player.publicReputation - 0.12);
    state.economy.customers.loyaltyByLocation[location.id] = Math.max(-25, loyalty - 2.2);
    state.economy.customers.complaintsByLocation[location.id] = complaints + 1;
    location.rivalPressure = Math.min(1, location.rivalPressure + 0.025);
    const reason = !slot ? "empty racks" : machine.damage >= 45 ? "a busted display" : priceRatio >= 1.35 ? "sticker shock" : "bad fit";
    recordCustomerDecision(state, {
      archetypeId,
      locationId: location.id,
      machineId: machine.id,
      outcome,
      productId: product?.id,
      reason,
      satisfaction,
      spend: 0
    });
    logStreetActivity(state, events, {
      actor: "customer",
      kind: "customer_complaint",
      locationId: machine.locationId,
      machineId: machine.id,
      message: `${archetypeId} complained about ${machine.name}: ${reason}.`,
      tone: "warning"
    });
    return true;
  }

  state.economy.customers.loyaltyByLocation[location.id] = Math.max(-25, loyalty - 0.7);
  recordCustomerDecision(state, {
    archetypeId,
    locationId: location.id,
    machineId: machine.id,
    outcome: "walkaway",
    productId: product?.id,
    reason: !slot ? "nothing in stock" : satisfaction < 38 ? "offer was not convincing" : "browsed without buying",
    satisfaction,
    spend: 0
  });
  logStreetActivity(state, events, {
    actor: "customer",
    kind: "customer_walkaway",
    locationId: machine.locationId,
    machineId: machine.id,
    message: `${archetypeId} walked away from ${machine.name}.`,
    productId: product?.id,
    tone: "neutral"
  });
  return true;
}

function customerPurchase(state: GameState, events: GameEvent[]): boolean {
  return runCustomerDecision(state, events, "purchase");
}

function customerComplaint(state: GameState, events: GameEvent[]): boolean {
  return runCustomerDecision(state, events, "complaint");
}

function customerWalkaway(state: GameState, events: GameEvent[]): boolean {
  return runCustomerDecision(state, events, "walkaway");
}

function customerTipoff(state: GameState, events: GameEvent[]): boolean {
  return runCustomerDecision(state, events, "tipoff");
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

  if (activity === "customer_walkaway") {
    return customerWalkaway(state, events);
  }

  if (activity === "customer_tipoff") {
    return customerTipoff(state, events);
  }

  if (activity === "rival_scout") {
    return rivalScout(state, events);
  }

  return workerSupply(state, events);
}

function applyStreetActivity(state: GameState, events: GameEvent[]): void {
  ensureStreetLifeState(state);
  const activityIndex = (state.streetLife.activitySequence - 1) % 5;
  const handlers = [customerPurchase, customerComplaint, customerWalkaway, rivalScout, workerSupply];
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
  employee.routePhase = "idle";
}

function markEmployeeRoute(
  state: GameState,
  employee: Employee,
  locationId: string | undefined,
  phase: EmployeeRoutePhase,
  message: string,
  machineId?: string
): void {
  const location = locationId ? state.locations[locationId] : undefined;
  employee.routePhase = phase;
  employee.lastLocationId = location?.id ?? employee.lastLocationId;
  employee.routeTargetLocationId = location?.id ?? employee.routeTargetLocationId;
  if (!location) {
    return;
  }

  recordStreetActivity(state, {
    actor: "employee",
    kind: "employee_route",
    locationId: location.id,
    machineId,
    message,
    tone: "neutral"
  });
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

      const quantity = Math.min(slot.capacity - slot.quantity, available, Math.max(3, Math.round(4 + employee.skill * 8 + employeeServiceBonus(employee))));
      if (quantity <= 0) {
        continue;
      }

      removeInventory(state.player.garageStorage, product.id, quantity);
      slot.quantity += quantity;
      machine.lastServicedHour = state.worldTimeHours;
      employee.status = "working";
      employee.statusDetail = `Restocked ${machine.name}.`;
      markEmployeeRoute(state, employee, machine.locationId, "restock", `${employee.name} is restocking ${machine.name}.`, machine.id);
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
  markEmployeeRoute(state, employee, machine.locationId, "collect", `${employee.name} is pulling cash from ${machine.name}.`, machine.id);
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

  const repairAmount = Math.min(machine.damage, Math.round(10 + employee.skill * 24 + employeeServiceBonus(employee) * 3));
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
  markEmployeeRoute(state, employee, machine.locationId, "repair", `${employee.name} is repairing ${machine.name}.`, machine.id);
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
    markEmployeeRoute(state, employee, machine?.locationId ?? alarm.locationId, "patrol", `${employee.name} is guarding ${machine?.name ?? "the route"}.`, machine?.id);
    employee.fear = Math.min(1, employee.fear + Math.max(0.004, 0.02 - employeeNerveBonus(employee)));
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

  patrol.location.rivalPressure = Math.max(0, patrol.location.rivalPressure - (0.06 + employee.skill * 0.08 + employeePressureBonus(employee)));
  employee.status = "working";
  employee.statusDetail = `Patrolled ${patrol.machine.name}.`;
  markEmployeeRoute(state, employee, patrol.machine.locationId, "patrol", `${employee.name} is patrolling ${patrol.machine.name}.`, patrol.machine.id);
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
  const scoutLocation = Object.values(state.locations).find((location) => location.districtId === candidate.id)?.id;
  markEmployeeRoute(state, employee, scoutLocation, "scout", `${employee.name} is mapping ${candidate.name}.`);
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
  target.location.rivalPressure = Math.max(0, target.location.rivalPressure - (0.05 + employee.skill * 0.06 + employeePressureBonus(employee)));
  player.publicReputation += 0.08;
  employee.status = "working";
  employee.statusDetail = `Smoothed over ${target.location.name}.`;
  markEmployeeRoute(state, employee, target.machine.locationId, "negotiate", `${employee.name} is negotiating around ${target.location.name}.`, target.machine.id);
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

  const pressureDrop = 0.025 + employee.skill * 0.035 + employeePressureBonus(employee);
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
  markEmployeeRoute(state, employee, target.machines[0]?.locationId, "manage", `${employee.name} is coordinating ${target.district.name}.`, target.machines[0]?.id);
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

function playerMachinesInStoryDistrict(state: GameState, arc: StoryMissionArc): VendingMachine[] {
  return installedMachines(state, state.playerFactionId).filter((machine) => state.locations[machine.locationId]?.districtId === arc.districtId);
}

function hasGreyStockSourced(state: GameState): boolean {
  const isGreyProduct = (productId: string): boolean => {
    const product = state.products[productId as ProductId];
    return product?.category === "fictional-grey" || product?.category === "fictional-contraband";
  };

  if (state.player.carriedCrate && isGreyProduct(state.player.carriedCrate.productId)) {
    return true;
  }

  const inventories = [
    state.player.garageStorage ?? {},
    ...Object.values(state.vehicles).map((vehicle) => vehicle.inventory),
    ...installedMachines(state, state.playerFactionId).map((machine) => Object.fromEntries(machine.slots.map((slot) => [slot.productId, slot.quantity])))
  ];

  return inventories.some((inventory) => Object.entries(inventory).some(([productId, quantity]) => quantity > 0 && isGreyProduct(productId)));
}

function campaignRequirementMet(state: GameState, arc: StoryMissionArc, objective: StoryMissionObjective): boolean {
  const progress = districtProgress(state, arc.districtId);
  const machines = playerMachinesInStoryDistrict(state, arc);

  if (objective.requirement === "starter_mission_complete") {
    return state.mission.completed;
  }

  if (objective.requirement === "district_scouted") {
    return progress.access === "scouted" || progress.access === "unlocked";
  }

  if (objective.requirement === "district_unlocked") {
    return progress.access === "unlocked";
  }

  if (objective.requirement === "district_machine") {
    return machines.length > 0;
  }

  if (objective.requirement === "hire_guard_or_runner") {
    const hasRouteCover = Object.values(state.employees).some((employee) => !employee.betrayed && (employee.role === "guard" || employee.role === "runner"));
    return machines.length > 0 && hasRouteCover;
  }

  if (objective.requirement === "legal_placement") {
    return machines.some((machine) => machine.placementMethod === "legal_contract");
  }

  if (objective.requirement === "inspection_resolved") {
    return Object.values(state.law?.activeInspections ?? {}).some((inspection) => inspection.status === "resolved" && Boolean(inspection.resolvedHour));
  }

  if (objective.requirement === "grey_stock_sourced") {
    return hasGreyStockSourced(state);
  }

  if (objective.requirement === "custom_product") {
    return (state.progression.productDesignsCompleted ?? 0) > 0 || Object.keys(state.economy?.productCustomizations ?? {}).length > 0;
  }

  if (objective.requirement === "rival_operation_disrupted") {
    return Object.values(state.rivalOrganizations ?? {}).some((organization) => organization.operations.some((operation) => Boolean(operation.resolvedHour)));
  }

  if (objective.requirement === "old_town_machine") {
    return machines.length > 0;
  }

  return false;
}

function advanceCampaignMissions(state: GameState, events: GameEvent[]): void {
  ensureCampaignMissionState(state);

  for (const arc of storyMissionArcs) {
    const mission = state.mission.campaign[arc.id];
    if (!mission || mission.completed || arc.missionChain.length === 0) {
      continue;
    }

    let advanced = true;
    while (advanced && !mission.completed) {
      advanced = false;
      const completedSteps = new Set(mission.completedStepIds);
      const step = arc.missionChain.find((candidate) => candidate.id === mission.activeStepId) ?? arc.missionChain.find((candidate) => !completedSteps.has(candidate.id));
      if (!step || !campaignRequirementMet(state, arc, step)) {
        break;
      }

      if (!completedSteps.has(step.id)) {
        mission.completedStepIds = [...mission.completedStepIds, step.id];
        if (step.rewardMoney > 0) {
          creditPlayer(state, "contracts", step.rewardMoney, `${step.title} mission objective`);
        }
        log(state, events, `${arc.title}: ${step.title} complete${step.rewardMoney > 0 ? ` (+$${step.rewardMoney})` : ""}.`, "good");
      }

      const nextStep = arc.missionChain.find((candidate) => !mission.completedStepIds.includes(candidate.id));
      if (nextStep) {
        mission.activeStepId = nextStep.id;
      } else {
        mission.completed = true;
        mission.completedHour = state.worldTimeHours;
        mission.activeStepId = step.id;
        log(state, events, `${arc.title} chain complete. ${arc.reward}.`, "good");
      }
      advanced = true;
    }
  }
}

function supplierForProduct(state: GameState, productId: ProductId): SupplierRelationshipState | undefined {
  ensureEconomyState(state);
  return supplierDefinitions
    .map((definition) => state.economy.supply.suppliers[definition.id])
    .filter((supplier): supplier is SupplierRelationshipState => Boolean(supplier?.unlocked && supplier.unlockedProductIds.includes(productId)))
    .sort((a, b) => b.loyalty + b.trust - (a.loyalty + a.trust))[0];
}

function activeSupplierDeal(state: GameState, supplierId: string): boolean {
  ensureEconomyState(state);
  return Object.values(state.economy.supply.activeDeals).some((deal) => deal.supplierId === supplierId && deal.expiresHour > state.worldTimeHours);
}

function questRequirementMet(state: GameState, quest: NarrativeQuestDefinition, step: NarrativeQuestStepDefinition): boolean {
  const questState = state.mission.quests[quest.id];
  const requirement = step.requirement;

  if (requirement.kind === "choice_made") {
    return questState.choiceHistory.length > 0;
  }

  if (requirement.kind === "supplier_loyalty") {
    return (state.economy.supply.suppliers[requirement.supplierId]?.loyalty ?? 0) >= requirement.value;
  }

  if (requirement.kind === "supplier_deal") {
    return activeSupplierDeal(state, requirement.supplierId);
  }

  if (requirement.kind === "empire_asset") {
    return empireAssetLevel(state, requirement.assetId as EmpireAssetId) >= requirement.level;
  }

  if (requirement.kind === "rival_operation_resolved") {
    return Object.values(state.rivalOrganizations ?? {}).some((organization) => organization.operations.some((operation) => Boolean(operation.resolvedHour)));
  }

  if (requirement.kind === "major_raid_resolved") {
    return Object.values(state.empire?.activeRaids ?? {}).some((raid) => raid.status === "resolved");
  }

  if (requirement.kind === "ending_executed") {
    return Object.values(state.empire?.endingExecutions ?? {}).some((ending) => ending.status === "executed");
  }

  if (requirement.kind === "all_campaign_chains_complete") {
    return storyMissionArcs.every((arc) => state.mission.campaign[arc.id]?.completed);
  }

  return false;
}

function advanceNarrativeQuests(state: GameState, events: GameEvent[]): void {
  ensureCampaignMissionState(state);

  for (const quest of narrativeQuestDefinitions) {
    const questState = state.mission.quests[quest.id];
    if (!questState || questState.status !== "active") {
      continue;
    }

    let advanced = true;
    while (advanced && questState.status === "active") {
      advanced = false;
      const completedSteps = new Set(questState.completedStepIds);
      const step = quest.steps.find((candidate) => candidate.id === questState.activeStepId) ?? quest.steps.find((candidate) => !completedSteps.has(candidate.id));
      if (!step || !questRequirementMet(state, quest, step)) {
        break;
      }

      if (!completedSteps.has(step.id)) {
        questState.completedStepIds.push(step.id);
        if (step.rewardMoney > 0) {
          creditPlayer(state, "contracts", step.rewardMoney, `${quest.title}: ${step.title}`);
        }
        log(state, events, `${quest.title}: ${step.title} complete${step.rewardMoney > 0 ? ` (+$${step.rewardMoney})` : ""}.`, "good");
      }

      const nextStep = quest.steps.find((candidate) => !questState.completedStepIds.includes(candidate.id));
      if (nextStep) {
        questState.activeStepId = nextStep.id;
      } else {
        questState.status = "completed";
        questState.completedHour = state.worldTimeHours;
        log(state, events, `${quest.title} complete.`, "good");
      }
      advanced = true;
    }
  }
}

function questAvailable(state: GameState, quest: NarrativeQuestDefinition): boolean {
  const requirement = quest.unlockRequirement;
  if (requirement.kind === "always") {
    return true;
  }

  if (requirement.kind === "starter_complete") {
    return state.mission.completed;
  }

  if (requirement.kind === "supplier_unlocked") {
    return Boolean(state.economy.supply.suppliers[requirement.supplierId]?.unlocked);
  }

  if (requirement.kind === "empire_asset") {
    return empireAssetLevel(state, requirement.assetId as EmpireAssetId) >= requirement.level;
  }

  return false;
}

function applyQuestChoiceEffect(state: GameState, quest: NarrativeQuestDefinition, choiceId: string): string | null {
  const choice = quest.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) {
    return null;
  }

  const player = state.factions[state.playerFactionId];
  if (choice.effect === "public_reputation") {
    player.publicReputation += 1.1;
  }
  if (choice.effect === "street_reputation") {
    player.streetReputation += 1.1;
    player.heat += 0.4;
  }
  if (choice.effect === "supplier_loyalty") {
    const supplier = state.economy.supply.suppliers.backdoor_wholesale;
    if (supplier) {
      supplier.loyalty = Math.min(100, supplier.loyalty + 10);
      supplier.trust = Math.min(100, supplier.trust + 5);
    }
  }
  if (choice.effect === "shell_cover") {
    state.empire.shellCover = Math.min(0.65, state.empire.shellCover + 0.05);
    state.empire.politicalPressure = Math.max(0, state.empire.politicalPressure - 1);
  }
  if (choice.effect === "rival_truce") {
    const redline = state.rivalOrganizations.rival_redline;
    if (redline) {
      redline.relationship = "truce";
      redline.truceUntilHour = state.worldTimeHours + 18;
    }
    player.publicReputation += 0.4;
  }

  return choice.response;
}

function decayAndEscalatePoliticalPressure(state: GameState): void {
  ensureEmpireState(state);
  const effects = empireAssetEffects(state);
  const player = state.factions[state.playerFactionId];
  const scalePressure = Math.max(0, installedMachines(state, state.playerFactionId).length - 5) * 0.18;
  const heatPressure = Math.max(0, player.heat - 10) * 0.08;
  const reduction = (effects.politicalPressureReduction ?? 0) * 4 + (effects.legitimacy ?? 0) * 0.015;
  state.empire.politicalPressure = Math.max(0, Math.min(100, state.empire.politicalPressure + scalePressure + heatPressure - reduction));
  state.empire.shellCover = Math.max(state.empire.shellCover, Math.min(0.65, effects.shellCover ?? 0));
  state.empire.legitimacy = Math.max(state.empire.legitimacy, effects.legitimacy ?? 0);
}

function createMajorRaid(state: GameState, events: GameEvent[]): void {
  ensureEmpireState(state);
  const target = Object.values(state.empire.assets)
    .filter((asset) => asset.level > 0)
    .sort((a, b) => b.level - a.level)[0];
  const severity = Math.max(2, Math.min(8, Math.ceil(state.empire.politicalPressure / 12 + state.factions[state.playerFactionId].heat / 8)));
  const raid: EmpireRaid = {
    id: `raid_${state.empire.raidSequence++}`,
    startedHour: state.worldTimeHours,
    deadlineHour: state.worldTimeHours + 5,
    severity,
    status: "active",
    targetAssetId: target?.id,
    message: `Major pressure raid forming${target ? ` around ${empireAssets[target.id].name}` : ""}.`
  };
  state.empire.activeRaids[raid.id] = raid;
  log(state, events, `MAJOR RAID: ${raid.message}`, "danger");
}

function resolveExpiredMajorRaids(state: GameState, events: GameEvent[]): void {
  ensureEmpireState(state);
  const player = state.factions[state.playerFactionId];
  for (const raid of activeMajorRaids(state)) {
    if (raid.deadlineHour > state.worldTimeHours) {
      continue;
    }

    raid.status = "missed";
    raid.resolvedHour = state.worldTimeHours;
    const cashLoss = Math.min(player.money, Math.round(45 + raid.severity * 18));
    player.money -= cashLoss;
    recordFinance(state, "fines", -cashLoss, "Missed major raid penalties");
    player.heat += raid.severity * 1.4;
    state.empire.politicalPressure = Math.min(100, state.empire.politicalPressure + raid.severity * 3);
    if (raid.targetAssetId) {
      const asset = state.empire.assets[raid.targetAssetId];
      asset.level = Math.max(0, asset.level - 1);
    }
    log(state, events, `Major raid missed: $${cashLoss} lost${raid.targetAssetId ? ` and ${empireAssets[raid.targetAssetId].name} lost a level` : ""}.`, "danger");
  }
}

function maybeSpawnMajorRaid(state: GameState, events: GameEvent[]): void {
  ensureEmpireState(state);
  if (state.empire.nextRaidHour > state.worldTimeHours || activeMajorRaids(state).length > 0) {
    return;
  }

  decayAndEscalatePoliticalPressure(state);
  const empireScale = Object.values(state.empire.assets).reduce((sum, asset) => sum + asset.level, 0);
  const pressureScore = state.empire.politicalPressure + state.factions[state.playerFactionId].heat + empireScale * 2.5;
  if (pressureScore >= 24 && empireScale > 0) {
    createMajorRaid(state, events);
  }
  state.empire.nextRaidHour = state.worldTimeHours + Math.max(16, 34 - Math.min(14, pressureScore * 0.25));
}

function applyAdvanceTime(state: GameState, events: GameEvent[], hours: number): void {
  const previousHour = state.worldTimeHours;
  ensureStreetLifeState(state);
  ensureConflictState(state);
  ensureRivalOrganizationState(state);
  ensureBaseState(state);
  ensureEconomyState(state);
  ensureEmpireState(state);
  state.worldTimeHours += hours;
  updateDistrictEvents(state, events);
  shiftSupplierMarket(state, events);
  updateTrafficAndCheckpoints(state, events);
  advanceLocationRights(state, events, hours);
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
  advanceRivalOperations(state, events, hours);
  maybeSpawnAmbientConflict(state, events);
  resolveExpiredMajorRaids(state, events);
  maybeSpawnMajorRaid(state, events);

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

  let customerDecisions = 0;
  while (state.economy.customers.nextDecisionHour <= state.worldTimeHours && customerDecisions < 5) {
    runCustomerDecision(state, events);
    state.economy.customers.nextDecisionHour += 0.72 + (state.economy.customers.decisionSequence % 4) * 0.16;
    customerDecisions += 1;
  }
  if (state.economy.customers.nextDecisionHour <= state.worldTimeHours) {
    state.economy.customers.nextDecisionHour = state.worldTimeHours + 0.5;
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
  ensureRivalOrganizationState(state);
  ensureBaseState(state);
  ensureEconomyState(state);
  ensureEmpireState(state);
  ensureCampaignMissionState(state);
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
      const supplier = supplierForProduct(state, product.id);
      if (!supplier) {
        log(state, events, `${product.name} needs a supplier relationship or unlock-gated pipeline first.`, "warning");
        break;
      }

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
      supplier.loyalty = Math.min(100, supplier.loyalty + Math.max(0.4, quantity * 0.12));
      supplier.trust = Math.min(100, supplier.trust + 0.18);
      log(state, events, `Picked up a ${quantity}x ${product.name} crate from ${supplierDefinitions.find((definition) => definition.id === supplier.id)?.label ?? "supplier"} for $${quantity * unitCost}.`, "good");
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
      vehicle.condition = Math.max(0.35, (vehicle.condition ?? 1) - travelHours * 0.018 * vehicleWearMultiplier(vehicle));
      applyAdvanceTime(state, events, travelHours);
      vehicle.locationId = location.id;
      const pose = parkedVehiclePose(location);
      vehicle.position = pose.position;
      vehicle.heading = pose.heading;
      log(state, events, `${vehicle.name} moved to ${location.name}.`, "good");
      applyRouteCheckpoint(state, events, vehicle.id, location.id);
      maybeTriggerRouteAmbush(state, events, vehicle.id, location.id);
      break;
    }

    case "drive_vehicle": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const vehicle = state.vehicles[command.vehicleId];
      if (!vehicle) {
        break;
      }

      const distance = Math.max(0, Math.min(80, Number.isFinite(command.distance) ? command.distance : 0));
      vehicle.position = {
        x: Number.isFinite(command.position.x) ? command.position.x : state.locations[vehicle.locationId]?.position.x ?? 0,
        z: Number.isFinite(command.position.z) ? command.position.z : state.locations[vehicle.locationId]?.position.z ?? 0
      };
      vehicle.heading = normalizeHeading(command.heading);
      vehicle.odometer = (vehicle.odometer ?? 0) + distance;
      vehicle.condition = Math.max(0.28, (vehicle.condition ?? 1) - distance * 0.00045 * vehicleWearMultiplier(vehicle));
      state.economy.traffic.vehicleMaintenanceDue[vehicle.id] = (state.economy.traffic.vehicleMaintenanceDue[vehicle.id] ?? 0) + distance * 0.035 * vehicleWearMultiplier(vehicle);

      const nearest = nearestVehicleStop(state, vehicle.position);
      if (nearest) {
        vehicle.locationId = nearest.id;
      }
      advanceVehicleConflictEscape(state, events, vehicle, distance);
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

    case "install_vehicle_upgrade": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "garage", "upgrade the vehicle")) {
        break;
      }

      const vehicle = state.vehicles[command.vehicleId];
      const upgrade = vehicleUpgrades[command.upgradeId];
      if (!vehicle || !upgrade) {
        break;
      }

      if (vehicle.locationId !== "garage") {
        log(state, events, `${vehicle.name} needs to be at the garage for upgrades.`, "warning");
        break;
      }

      vehicle.upgrades ??= [];
      if (vehicle.upgrades.includes(command.upgradeId)) {
        log(state, events, `${vehicle.name} already has ${upgrade.label}.`, "neutral");
        break;
      }

      if (actor.money < upgrade.cost) {
        log(state, events, `${upgrade.label} needs $${upgrade.cost}.`, "warning");
        break;
      }

      chargePlayer(state, "fleet", upgrade.cost, `${vehicle.name} ${upgrade.label}`);
      vehicle.upgrades.push(command.upgradeId);
      vehicle.capacity += upgrade.capacityBonus ?? 0;
      vehicle.security = Math.min(0.95, vehicle.security + (upgrade.securityBonus ?? 0));
      vehicle.speed = Math.min(1.9, vehicle.speed + (upgrade.speedBonus ?? 0));
      vehicle.escapeRating = Math.min(0.95, vehicle.escapeRating + (upgrade.escapeBonus ?? 0));
      vehicle.condition = Math.min(1, (vehicle.condition ?? 1) + 0.05);
      log(state, events, `${upgrade.label} installed on ${vehicle.name}: ${upgrade.description}`, "good");
      break;
    }

    case "buy_machine_model": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "garage", "receive machine inventory")) {
        break;
      }

      const model = machineModels[command.modelId];
      if (!model) {
        break;
      }

      const quote = machineProcurementQuotes(state).find((candidate) => candidate.model.id === model.id);
      if (!quote?.unlocked) {
        log(state, events, quote?.reason ?? `${model.name} is not available from the fleet supplier yet.`, "warning");
        break;
      }

      const requested = Math.max(1, Math.min(5, Math.round(command.quantity)));
      const unitCost = machineProcurementCost(state, model.id);
      const affordable = Math.floor(actor.money / unitCost);
      const quantity = Math.max(0, Math.min(requested, affordable));
      if (quantity <= 0) {
        log(state, events, `${model.name} delivery needs $${unitCost}.`, "warning");
        break;
      }

      chargePlayer(state, "fleet", unitCost * quantity, `${quantity}x ${model.name} fleet procurement`);
      const names: string[] = [];
      for (let index = 0; index < quantity; index += 1) {
        state.economy.fleet.procurementSequence += 1;
        const machine = createStoredMachine(state, actor.id, model.id);
        names.push(machine.name);
      }
      state.economy.fleet.totalPurchased += quantity;
      increaseFleetExperience(state, model.id, quantity);
      log(state, events, `${quantity}x ${model.name} delivered to the garage: ${names.join(", ")}.`, "good");
      break;
    }

    case "sell_stored_machine": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "garage", "sell fleet inventory")) {
        break;
      }

      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id || isMachineInstalled(machine)) {
        log(state, events, "Only stored player machines can be sold from the garage.", "warning");
        break;
      }

      const resale = machineResaleValue(state, machine);
      const model = machineModels[machine.machineModelId] ?? machineModels.basic_snack;
      delete state.machines[machine.id];
      creditPlayer(state, "fleet", resale, `${machine.name} resale`);
      state.economy.fleet.vendorReputation = Math.max(0, state.economy.fleet.vendorReputation - 0.6);
      log(state, events, `${machine.name} sold back through the fleet broker for $${resale}. ${model.name} parts returned to circulation.`, "good");
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
      const wasNewDesign = !state.economy.productCustomizations[product.id];
      state.economy.productCustomizations[product.id] = {
        brandName: mode.brandName,
        brandRecognition: mode.brandRecognition,
        brandTone: mode.brandTone,
        colorway: mode.colorway,
        designScore: mode.designScore,
        productId: product.id,
        mode: command.mode,
        demandBonus: mode.demandBonus,
        costDelta: mode.costDelta,
        heatDelta: mode.heatDelta,
        packageAppeal: mode.packageAppeal,
        packageStyle: mode.packageStyle,
        riskMasking: mode.riskMasking,
        tagline: mode.tagline,
        createdHour: state.worldTimeHours
      };
      if (wasNewDesign) {
        state.progression.productDesignsCompleted = (state.progression.productDesignsCompleted ?? 0) + 1;
      }
      log(state, events, `${product.name} launched as ${mode.brandName}: ${mode.tagline}`, "good");
      break;
    }

    case "upgrade_empire_asset": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const definition = empireAssets[command.assetId];
      const asset = state.empire.assets[command.assetId];
      if (!definition || !asset) {
        break;
      }

      if (asset.level >= definition.maxLevel) {
        log(state, events, `${definition.name} is already maxed.`, "neutral");
        break;
      }

      const cost = empireAssetUpgradeCost(state, command.assetId);
      if (actor.money < cost) {
        log(state, events, `${definition.name} needs $${cost}.`, "warning");
        break;
      }

      chargePlayer(state, "empire", cost, `${definition.name} level ${asset.level + 1}`);
      asset.level += 1;
      asset.lastUpgradedHour = state.worldTimeHours;
      const effects = empireAssetEffects(state);
      state.empire.shellCover = Math.max(state.empire.shellCover, effects.shellCover ?? 0);
      state.empire.legitimacy = Math.max(state.empire.legitimacy, effects.legitimacy ?? 0);
      state.empire.politicalPressure = Math.max(0, state.empire.politicalPressure - (effects.politicalPressureReduction ?? 0) * 10);
      log(state, events, `${definition.name} upgraded to level ${asset.level}.`, "good");
      break;
    }

    case "resolve_major_raid": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const raid = state.empire.activeRaids[command.raidId];
      if (!raid || raid.status !== "active") {
        break;
      }

      if (raid.deadlineHour <= state.worldTimeHours) {
        resolveExpiredMajorRaids(state, events);
        break;
      }

      const politicalLevel = empireAssetLevel(state, "political_contacts");
      const securityScore = baseSecurityScore(state) + empireAssetLevel(state, "warehouse_network") * 0.04;
      const cost = command.resolution === "legal_team"
        ? Math.ceil(24 + raid.severity * 12)
        : command.resolution === "security_response"
          ? Math.ceil(14 + raid.severity * 8)
          : Math.ceil(18 + raid.severity * 10 - politicalLevel * 6);

      if (command.resolution === "political_favor" && politicalLevel <= 0) {
        log(state, events, "Political favors need a Political Pressure Desk.", "warning");
        break;
      }

      if (actor.money < cost) {
        log(state, events, `Resolving the raid needs $${cost}.`, "warning");
        break;
      }

      chargePlayer(state, command.resolution === "security_response" ? "sabotage" : "fines", cost, `Major raid ${command.resolution.replace("_", " ")}`);
      raid.status = "resolved";
      raid.resolution = command.resolution;
      raid.resolvedHour = state.worldTimeHours;
      if (command.resolution === "legal_team") {
        actor.publicReputation += 0.8;
        state.empire.politicalPressure = Math.max(0, state.empire.politicalPressure - raid.severity * 1.8);
      } else if (command.resolution === "security_response") {
        actor.streetReputation += 0.7;
        actor.heat += Math.max(0.2, 1.2 - securityScore * 0.5);
        state.empire.politicalPressure = Math.max(0, state.empire.politicalPressure - raid.severity);
      } else {
        actor.publicReputation = Math.max(0, actor.publicReputation - 0.2);
        state.empire.politicalPressure = Math.max(0, state.empire.politicalPressure - raid.severity * 2.4);
      }
      log(state, events, `Major raid resolved with ${command.resolution.replace("_", " ")} for $${cost}.`, "good");
      break;
    }

    case "execute_ending": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const ending = endgamePathScores(state).find((candidate) => candidate.path.id === command.pathId);
      if (!ending) {
        break;
      }

      if (activeMajorRaids(state).length > 0) {
        log(state, events, "Resolve active major raids before locking an ending.", "warning");
        break;
      }

      if (ending.score < 65) {
        log(state, events, `${ending.path.title} needs a stronger score before execution.`, "warning");
        break;
      }

      state.empire.endingExecutions[ending.path.id] = {
        executedHour: state.worldTimeHours,
        pathId: ending.path.id,
        status: "executed",
        summary: ending.path.consequence
      };
      log(state, events, `ENDING EXECUTED: ${ending.path.title}. ${ending.path.consequence}`, "good");
      break;
    }

    case "negotiate_supplier_deal": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (!requirePlayerAtLocation(state, events, "supplier", "negotiate supplier terms")) {
        break;
      }

      const definition = supplierDefinitions.find((candidate) => candidate.id === command.supplierId);
      const deal = supplierDeals[command.dealKind];
      if (!definition || !deal) {
        break;
      }

      const relationship = state.economy.supply.suppliers[definition.id] ?? createSupplierRelationship(definition);
      state.economy.supply.suppliers[definition.id] = relationship;
      if (!relationship.unlocked && !supplierAvailable(state, definition.id)) {
        log(state, events, `${definition.label} is not available yet.`, "warning");
        break;
      }

      if (relationship.dealCooldownUntil > state.worldTimeHours) {
        log(state, events, `${definition.label} wants time before another deal.`, "warning");
        break;
      }

      if (actor.money < deal.cost) {
        log(state, events, `${deal.label} with ${definition.label} needs $${deal.cost}.`, "warning");
        break;
      }

      chargePlayer(state, "stock", deal.cost, `${definition.label} ${deal.label}`);
      const scamRoll = ((Math.floor(state.worldTimeHours * 10) + definition.id.length * 7 + deal.kind.length * 3 + state.eventSequence) % 100) / 100;
      if (relationship.trust < 28 && scamRoll < relationship.scamRisk) {
        relationship.trust = Math.max(0, relationship.trust - 8);
        relationship.loyalty = Math.max(0, relationship.loyalty - 5);
        actor.heat += 0.6;
        log(state, events, `${definition.label} deal went bad. Money is gone and the manifest was smoke.`, "danger");
        break;
      }

      relationship.unlocked = true;
      relationship.loyalty = Math.min(100, relationship.loyalty + deal.loyaltyGain);
      relationship.trust = Math.min(100, relationship.trust + deal.trustGain);
      relationship.dealCooldownUntil = state.worldTimeHours + 8;
      actor.heat = Math.max(0, actor.heat + deal.heatDelta);
      const activeDealId = `supplier_deal_${definition.id}_${deal.kind}`;
      state.economy.supply.activeDeals[activeDealId] = {
        id: activeDealId,
        supplierId: definition.id,
        kind: deal.kind,
        value: deal.value,
        expiresHour: state.worldTimeHours + 24
      };

      if (deal.kind === "bulk_discount") {
        relationship.negotiatedDiscount = Math.min(0.18, relationship.negotiatedDiscount + deal.value);
      }
      if (deal.kind === "exclusive_pipeline") {
        relationship.unlockedProductIds = [...new Set([...relationship.unlockedProductIds, ...definition.uniqueProducts])];
        relationship.blackMarketTier += definition.id === "night_market_broker" ? 1 : 0;
      }
      if (deal.kind === "quiet_manifest") {
        relationship.scamRisk = Math.max(0.02, relationship.scamRisk - deal.value);
      }
      if (deal.kind === "rush_delivery") {
        const productId = relationship.unlockedProductIds[0];
        if (productId) {
          addInventory(state.player.garageStorage, productId, Math.round(deal.value));
        }
      }

      log(state, events, `${definition.label} accepted ${deal.label}. Loyalty ${Math.round(relationship.loyalty)} / trust ${Math.round(relationship.trust)}.`, "good");
      break;
    }

    case "start_quest": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const quest = narrativeQuestDefinitions.find((candidate) => candidate.id === command.questId);
      const questState = quest ? state.mission.quests[quest.id] : undefined;
      if (!quest || !questState) {
        break;
      }

      if (questState.status === "completed") {
        log(state, events, `${quest.title} is already complete.`, "neutral");
        break;
      }

      if (!questAvailable(state, quest)) {
        log(state, events, `${quest.title} is not available yet.`, "warning");
        break;
      }

      questState.status = "active";
      questState.startedHour ??= state.worldTimeHours;
      questState.activeStepId ||= quest.steps[0]?.id ?? "";
      questState.dialogueLog.push({
        hour: state.worldTimeHours,
        speaker: quest.giverName,
        text: quest.openingLine
      });
      log(state, events, `${quest.giverName}: ${quest.openingLine}`, "neutral");
      break;
    }

    case "choose_quest_dialogue": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const quest = narrativeQuestDefinitions.find((candidate) => candidate.id === command.questId);
      const questState = quest ? state.mission.quests[quest.id] : undefined;
      if (!quest || !questState || questState.status !== "active") {
        break;
      }

      if (questState.choiceHistory.includes(command.choiceId)) {
        log(state, events, "That dialogue choice is already set.", "neutral");
        break;
      }

      const response = applyQuestChoiceEffect(state, quest, command.choiceId);
      const choice = quest.choices.find((candidate) => candidate.id === command.choiceId);
      if (!response || !choice) {
        break;
      }

      questState.choiceHistory.push(command.choiceId);
      questState.dialogueLog.push({
        choiceId: command.choiceId,
        hour: state.worldTimeHours,
        speaker: quest.giverName,
        text: response
      });
      log(state, events, `${quest.giverName}: ${response}`, "neutral");
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
        employee.routePhase = "idle";
        employee.routeTargetLocationId = machine.locationId;
        log(state, events, `${employee.name} assigned to ${machine.name}.`, "neutral");
      } else {
        assignments.delete(machine.id);
        employee.status = assignments.size > 0 ? "idle" : "blocked";
        employee.statusDetail = assignments.size > 0 ? "Route assignment updated." : "Assign a machine route.";
        employee.routePhase = employee.status === "blocked" ? "idle" : employee.routePhase ?? "idle";
        const nextAssignedId = [...assignments][0];
        employee.routeTargetLocationId = nextAssignedId ? state.machines[nextAssignedId]?.locationId : undefined;
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
      const rights = state.economy.locationRights[location.id] ??= locationRightsFor(state, location.id);
      const exclusiveActive = Boolean(rights.exclusiveUntilHour && rights.exclusiveUntilHour > state.worldTimeHours);
      if (exclusiveActive && rights.exclusiveContractHolderId && rights.exclusiveContractHolderId !== actor.id && method === "legal_contract") {
        log(state, events, `${location.name} is under an exclusive contract. Use another approach or break the pressure first.`, "warning");
        break;
      }

      const quote = placementQuoteForLocation(state, location, method);
      if (actor.money < quote.cost) {
        log(state, events, `${location.name} needs $${quote.cost} for ${quote.label.toLowerCase()} placement.`, "warning");
        break;
      }

      const storedMachine = command.machineId ? state.machines[command.machineId] : actor.id === state.playerFactionId ? storedPlayerMachines(state)[0] : undefined;
      if (actor.id === state.playerFactionId && !storedMachine) {
        log(state, events, "Buy a machine model into the garage fleet before placing a new stop.", "warning");
        break;
      }

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
      increaseFleetExperience(state, machine.machineModelId, 0.35);

      if (method === "legal_contract") {
        rights.rightsTier = rights.rightsTier === "none" ? "handshake" : rights.rightsTier;
        rights.landlordDisposition = Math.min(100, rights.landlordDisposition + 4);
        rights.legalPressure = Math.max(0, rights.legalPressure - (rights.permitStatus === "active" ? 10 : 3));
      } else if (method === "hidden") {
        rights.legalPressure = Math.max(0, rights.legalPressure + 2);
        rights.landlordDisposition = Math.max(0, rights.landlordDisposition - 2);
      } else if (method === "bribe") {
        rights.legalPressure = Math.min(100, rights.legalPressure + 6);
        rights.landlordDisposition = Math.max(0, rights.landlordDisposition - 4);
      } else {
        rights.legalPressure = Math.min(100, rights.legalPressure + 10);
        rights.corporatePressure = Math.min(100, rights.corporatePressure + 5);
        rights.landlordDisposition = Math.max(0, rights.landlordDisposition - 7);
      }

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

    case "player_conflict_action": {
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

      if (!requirePlayerAtLocation(state, events, conflict.locationId, "handle the conflict")) {
        break;
      }

      const encounter = ensureConflictEncounter(conflict);
      const threat = state.factions[conflict.threatFactionId];
      const location = state.locations[conflict.locationId];
      const securityBonus = baseSecurityScore(state);
      let actionText = "";

      if (command.action === "strike") {
        const tired = encounter.playerStamina < 10;
        const damage = tired ? 7 : 16 + encounter.advantage * 0.18;
        encounter.enemyHealth = Math.max(0, encounter.enemyHealth - damage);
        encounter.playerStamina = Math.max(0, encounter.playerStamina - (tired ? 7 : 14));
        encounter.advantage = Math.min(45, encounter.advantage + (tired ? 2 : 5));
        encounter.enemyFocus = Math.max(0, encounter.enemyFocus - 3);
        actionText = tired ? "You swung tired and barely shifted the crew." : "You pushed the crew back with a clean hit.";
      }

      if (command.action === "dodge") {
        encounter.playerStamina = Math.min(100, encounter.playerStamina + 22);
        encounter.enemyFocus = Math.max(0, encounter.enemyFocus - 14);
        encounter.advantage = Math.min(45, encounter.advantage + 8);
        encounter.chaseProgress = Math.min(100, encounter.chaseProgress + (conflict.kind === "street_chase" ? 8 : 3));
        actionText = "You slipped the pressure and recovered stamina.";
      }

      if (command.action === "tool") {
        const toolImpact = 8 + securityBonus * 8;
        encounter.enemyHealth = Math.max(0, encounter.enemyHealth - toolImpact);
        encounter.enemyFocus = Math.max(0, encounter.enemyFocus - (18 + securityBonus * 14));
        encounter.playerStamina = Math.max(0, encounter.playerStamina - 8);
        encounter.advantage = Math.min(45, encounter.advantage + 6 + securityBonus * 6);
        actionText = securityBonus > 0.25 ? "Security tools and route gear broke their rhythm." : "A quick tool play bought breathing room.";
      }

      if (command.action === "push_escape") {
        const vehicle = Object.values(state.vehicles).find((candidate) => candidate.locationId === conflict.locationId);
        const burst = 16 + encounter.advantage * 0.35 + encounter.playerStamina * 0.1 + (vehicle ? vehicle.escapeRating * 12 : 0);
        encounter.chaseProgress = Math.min(100, encounter.chaseProgress + burst);
        encounter.playerStamina = Math.max(0, encounter.playerStamina - 12);
        encounter.enemyFocus = Math.max(0, encounter.enemyFocus - 6);
        encounter.advantage = Math.min(45, encounter.advantage + 3);
        actionText = vehicle ? `You used ${vehicle.name} and the sidewalk gap to widen the escape.` : "You sprinted for separation.";
      }

      if (encounter.enemyHealth <= 0) {
        finishPlayerConflict(state, events, conflict, "melee", `${actionText} ${threat?.name ?? "The crew"} backed off near ${location?.name ?? "the stop"}.`, "good");
        break;
      }

      if (encounter.chaseProgress >= 100) {
        finishPlayerConflict(state, events, conflict, "drive_escape", `${actionText} You cleared the trouble zone near ${location?.name ?? "the stop"}.`, "good");
        break;
      }

      const guardMultiplier = command.action === "dodge" ? 0.45 : command.action === "tool" ? 0.7 : 1;
      const counterDamage = Math.max(1, Math.round((encounter.enemyFocus * 0.07 + conflict.intensity * 0.14 - encounter.advantage * 0.05) * guardMultiplier));
      encounter.playerHealth = Math.max(0, encounter.playerHealth - counterDamage);
      encounter.enemyFocus = Math.min(100, encounter.enemyFocus + (command.action === "strike" ? 4 : 2));

      if (encounter.playerHealth <= 0) {
        missConflictEvent(state, events, conflict.id);
        break;
      }

      log(
        state,
        events,
        `${actionText} Counter-pressure hit for ${counterDamage}. Health ${Math.round(encounter.playerHealth)} / stamina ${Math.round(encounter.playerStamina)} / escape ${Math.round(encounter.chaseProgress)}.`,
        counterDamage >= 8 ? "warning" : "neutral"
      );
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

    case "work_crime_contact": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const contact = crimeContacts.find((candidate) => candidate.id === command.contactId);
      if (!contact || contact.action !== command.action) {
        break;
      }

      const district = state.districts[contact.districtId];
      const access = districtProgress(state, contact.districtId).access;
      if (access === "locked") {
        log(state, events, `${district?.name ?? "This district"} is still locked. Scout the contact first.`, "warning");
        break;
      }

      if (actor.money < contact.cost) {
        log(state, events, `${contact.label} needs $${contact.cost}.`, "warning");
        break;
      }

      if (command.action === "source_contraband") {
        if (state.player.carriedCrate || inventoryUnits(state.player.cargo, state) > 0) {
          log(state, events, "Hands are full. Store the current crate before taking grey stock.", "warning");
          break;
        }

        const productId = contact.productId ?? "mystery_capsules";
        const product = state.products[productId];
        const quantity = Math.max(1, Math.min(8, Math.floor(state.player.cargoCapacity / product.size)));
        chargePlayer(state, "stock", contact.cost, `${contact.label} grey stock`);
        state.player.carriedCrate = {
          productId,
          quantity,
          capacity: Math.floor(state.player.cargoCapacity / product.size),
          source: "supplier"
        };
        actor.heat += contact.heatRisk;
        actor.streetReputation += 0.8;
        log(state, events, `${contact.label} handed off ${quantity}x ${product.name}. Heat risk rose.`, "danger");
        break;
      }

      chargePlayer(state, command.action === "arrange_bribe" ? "fines" : "base", contact.cost, contact.label);

      if (command.action === "buy_tip") {
        const operation = activeRivalOperations(state)
          .filter((candidate) => candidate.districtId === contact.districtId)
          .sort((a, b) => b.progress * b.strength - a.progress * a.strength)[0];
        actor.heat += contact.heatRisk * 0.35;
        actor.streetReputation += 0.25;
        if (operation) {
          operation.exposed = true;
          operation.progress = Math.max(0, operation.progress - 16);
          log(state, events, `${contact.label} exposed a ${operationKindLabel(operation.kind)} cell near ${state.locations[operation.locationId]?.name ?? district?.name ?? "the district"}.`, "good");
        } else {
          state.law.nextInspectionHour += 0.8;
          log(state, events, `${contact.label} found no active rival cell, but inspection timing is clearer.`, "neutral");
        }
        break;
      }

      const activeInspection = activeLawInspections(state).sort((a, b) => b.severity - a.severity)[0];
      actor.heat += contact.heatRisk;
      actor.streetReputation += 0.6;
      if (activeInspection) {
        activeInspection.resolution = "bribe";
        finishInspection(state, events, activeInspection, "resolved", `${contact.label} moved paperwork on inspection ${activeInspection.id}.`, "good");
      } else {
        state.law.nextInspectionHour += 1.5;
        log(state, events, `${contact.label} bought time with local paperwork. Next inspection pushed back.`, "warning");
      }
      break;
    }

    case "negotiate_location_rights": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const location = state.locations[command.locationId];
      if (!location || location.kind === "garage" || location.kind === "supplier") {
        break;
      }

      if (!requirePlayerAtLocation(state, events, location.id, "negotiate location rights")) {
        break;
      }

      if (!isDistrictUnlockedForPlacement(state, location.districtId)) {
        log(state, events, `${state.districts[location.districtId]?.name ?? "This district"} must be opened before rights talks.`, "warning");
        break;
      }

      if (command.approach === "corporate_shell" && empireAssetLevel(state, "shell_company") <= 0 && state.empire.shellCover < 0.08) {
        log(state, events, "Shell paperwork needs a shell company or existing shell cover.", "warning");
        break;
      }

      const occupyingMachine = machineAtLocation(state, location.id);
      if (command.approach === "exclusive_contract" && occupyingMachine && occupyingMachine.ownerFactionId !== actor.id) {
        log(state, events, `${location.name} already hosts ${state.factions[occupyingMachine.ownerFactionId]?.name ?? "a rival"} hardware. Clear the stop before exclusivity lands.`, "warning");
        break;
      }

      const rights = state.economy.locationRights[location.id] ??= locationRightsFor(state, location.id);
      const cost = locationRightsNegotiationCost(state, location, command.approach);
      if (actor.money < cost) {
        log(state, events, `${locationRightsApproachLabel(command.approach)} at ${location.name} needs $${cost}.`, "warning");
        break;
      }

      chargePlayer(state, "rights", cost, `${location.name} ${locationRightsApproachLabel(command.approach)}`);
      rights.lastNegotiatedHour = state.worldTimeHours;

      if (command.approach === "landlord_meeting") {
        rights.rightsTier = rights.rightsTier === "none" ? "handshake" : rights.rightsTier;
        rights.landlordDisposition = Math.min(100, rights.landlordDisposition + 18);
        rights.legalPressure = Math.max(0, rights.legalPressure - 5);
        rights.corporatePressure = Math.max(0, rights.corporatePressure - 7);
        location.rivalPressure = Math.max(0, location.rivalPressure - 0.04);
        actor.publicReputation += 0.25;
      }

      if (command.approach === "permit_filing") {
        rights.rightsTier = rights.rightsTier === "exclusive" || rights.rightsTier === "corporate_shell" ? rights.rightsTier : "standard_permit";
        rights.permitStatus = "active";
        rights.permitId = `permit_${location.id}_${Math.round(state.worldTimeHours * 10)}`;
        rights.permitExpiresHour = state.worldTimeHours + 72 + Math.max(0, rights.landlordDisposition - 50) * 0.2;
        rights.legalPressure = Math.max(0, rights.legalPressure - 22);
        rights.corporatePressure = Math.max(0, rights.corporatePressure - 4);
        actor.publicReputation += 0.45;
      }

      if (command.approach === "exclusive_contract") {
        rights.rightsTier = "exclusive";
        rights.exclusiveContractHolderId = actor.id;
        rights.exclusiveUntilHour = state.worldTimeHours + 48 + Math.max(0, rights.landlordDisposition - 40) * 0.25;
        rights.landlordDisposition = Math.min(100, rights.landlordDisposition + 10);
        rights.legalPressure = Math.max(0, rights.legalPressure - 8);
        rights.corporatePressure = Math.min(100, rights.corporatePressure + 3);
        location.rivalPressure = Math.max(0, location.rivalPressure - 0.12);
        actor.publicReputation += 0.55;
      }

      if (command.approach === "corporate_shell") {
        rights.rightsTier = "corporate_shell";
        rights.permitStatus = "active";
        rights.permitId = `shell_${location.id}_${Math.round(state.worldTimeHours * 10)}`;
        rights.permitExpiresHour = state.worldTimeHours + 96;
        rights.legalPressure = Math.max(0, rights.legalPressure - 28);
        rights.corporatePressure = Math.max(0, rights.corporatePressure - 14);
        rights.landlordDisposition = Math.min(100, rights.landlordDisposition + 4);
        state.empire.shellCover = Math.min(0.75, state.empire.shellCover + 0.03);
        state.empire.politicalPressure = Math.min(100, state.empire.politicalPressure + 1.6);
        actor.publicReputation = Math.max(0, actor.publicReputation - 0.15);
      }

      log(state, events, `${location.name} rights updated through ${locationRightsApproachLabel(command.approach)}.`, command.approach === "corporate_shell" ? "warning" : "good");
      break;
    }

    case "pressure_rival_operation": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const found = findRivalOperation(state, command.operationId);
      if (!found) {
        break;
      }

      const { operation, organization } = found;
      if (operation.resolvedHour) {
        log(state, events, "That rival operation is already neutralized.", "neutral");
        break;
      }

      const cost = rivalOperationApproachCost(command.approach);
      if (actor.money < cost) {
        log(state, events, `${command.approach.replace("_", " ")} needs $${cost}.`, "warning");
        break;
      }

      const rival = state.factions[operation.factionId];
      const location = state.locations[operation.locationId];
      chargePlayer(state, command.approach === "disrupt" ? "sabotage" : "base", cost, `${operationKindLabel(operation.kind)} ${command.approach}`);

      if (command.approach === "negotiate") {
        operation.progress = Math.max(0, operation.progress - 22);
        operation.strength = clamp01(operation.strength - 0.08);
        organization.relationship = "truce";
        organization.truceUntilHour = state.worldTimeHours + 4;
        organization.leverage = Math.min(100, organization.leverage + 7);
        actor.publicReputation += 0.2;
        log(state, events, `Negotiated a short truce with ${rival?.name ?? "the rival"} around ${location?.name ?? "the operation"}.`, "good");
      }

      if (command.approach === "expose") {
        operation.exposed = true;
        operation.progress = Math.max(0, operation.progress - 28);
        operation.strength = clamp01(operation.strength - 0.1);
        organization.relationship = "pressured";
        if (rival) {
          rival.heat += 3;
        }
        actor.publicReputation += 0.7;
        actor.heat += 0.4;
        log(state, events, `Exposed ${rival?.name ?? "a rival"} ${operationKindLabel(operation.kind)} operation near ${location?.name ?? "the district"}.`, "good");
      }

      if (command.approach === "disrupt") {
        operation.progress = Math.max(0, operation.progress - 36);
        operation.strength = clamp01(operation.strength - 0.22);
        organization.relationship = "hostile";
        actor.streetReputation += 1.2;
        actor.heat += 2.4;
        if (location) {
          location.rivalPressure = Math.max(0, location.rivalPressure - 0.08);
        }
        if (operation.strength > 0.42 && location) {
          createConflictEvent(state, events, "street_chase", location.id, operation.factionId, Math.round(10 + operation.strength * 18), `${rival?.name ?? "A rival"} crew reacted to your disruption near ${location.name}.`);
        }
        log(state, events, `Disrupted ${rival?.name ?? "a rival"} ${operationKindLabel(operation.kind)} operation. Heat rose.`, "danger");
      }

      if (operation.progress <= 0 || operation.strength <= 0.12) {
        operation.resolvedHour = state.worldTimeHours;
        organization.leverage = Math.max(0, organization.leverage - 6);
        log(state, events, `${rival?.name ?? "Rival"} operation neutralized at ${location?.name ?? "the district"}.`, "good");
      }
      break;
    }

    case "rival_action": {
      const controller = state.npcControllers[actor.id];
      const profile = rivalActionProfile(actor);
      if (controller) {
        controller.lastActedHour = state.worldTimeHours;
      }
      if (actor.id !== state.playerFactionId) {
        state.progression.rivalActionsToday += 1;
      }

      if (command.action === "sabotage" && command.targetMachineId) {
        const target = state.machines[command.targetMachineId];
        if (target && target.ownerFactionId !== actor.id && isMachineInstalled(target)) {
          const baseDamage = Math.max(8, 18 + Math.round((controller?.aggression ?? 0) * 8) + profile.sabotageBonus);
          if (target.ownerFactionId === state.playerFactionId) {
            createMachineAlarm(state, events, target, actor.id, "sabotage", baseDamage);
            break;
          }

          target.damage = Math.min(100, target.damage + sabotageDamage(baseDamage, target));
          state.locations[target.locationId].rivalPressure = Math.min(1, state.locations[target.locationId].rivalPressure + profile.sabotagePressure);
          log(state, events, `${actor.name} ${profile.verb} ${target.name}.`, "danger");
        }
      }

      if (command.action === "undercut" && command.targetMachineId) {
        const target = state.machines[command.targetMachineId];
        if (target && isMachineInstalled(target)) {
          const location = state.locations[target.locationId];
          location.rivalPressure = Math.min(1, location.rivalPressure + profile.undercutPressure);
          actor.money = Math.max(0, actor.money - profile.undercutCost);
          if (target.ownerFactionId === state.playerFactionId && actor.archetype === "corporate") {
            state.factions[state.playerFactionId].publicReputation = Math.max(0, state.factions[state.playerFactionId].publicReputation - 0.25);
          }
          if (target.ownerFactionId === state.playerFactionId && actor.archetype === "black_market") {
            target.heat += 0.8;
          }
          if (target.id === STARTER_MACHINE_ID && target.ownerFactionId === state.playerFactionId) {
            state.progression.firstUndercutTriggered = true;
            createMachineAlarm(state, events, target, actor.id, "undercut", 12);
          }
          log(state, events, `${actor.name} is ${actor.archetype === "corporate" ? "pressuring permits" : "undercutting prices"} near ${location.name}.`, "warning");
        }
      }

      if (command.action === "expand" && command.locationId) {
        const location = state.locations[command.locationId];
        if (location && !machineAtLocation(state, location.id) && isDistrictUnlockedForPlacement(state, location.districtId)) {
          const rights = state.economy.locationRights[location.id] ??= locationRightsFor(state, location.id);
          if (rights.exclusiveContractHolderId === state.playerFactionId && (rights.exclusiveUntilHour ?? 0) > state.worldTimeHours) {
            rights.corporatePressure = Math.min(100, rights.corporatePressure + 5);
            rights.legalPressure = Math.min(100, rights.legalPressure + 3);
            log(state, events, `${actor.name} could not expand into ${location.name}; your exclusive contract held.`, "warning");
            break;
          }

          const cost = Math.round(placementCostForLocation(state, location) * profile.expansionCostMultiplier);
          if (actor.money < cost) {
            break;
          }

          createMachine(state, actor.id, location.id, "rival_territory");
          actor.money = Math.max(0, actor.money - cost);
          location.rivalPressure = Math.min(1, location.rivalPressure + profile.expandPressure);
          log(state, events, `${actor.name} dropped a new machine at ${location.name}.`, "danger");
        }
      }
      break;
    }
  }

  maybeCompleteMission(state, events);
  advanceCampaignMissions(state, events);
  advanceNarrativeQuests(state, events);

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
