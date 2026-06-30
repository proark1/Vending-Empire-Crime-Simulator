import type {
  BaseFacilityEffects,
  BaseFacilityId,
  CampaignMissionState,
  DayReport,
  ConflictEvent,
  DistrictEvent,
  DistrictId,
  DistrictProgress,
  DistrictStatus,
  Employee,
  EmpireAssetId,
  EmpireAssetState,
  EmpireRaid,
  FactionId,
  GameState,
  Inventory,
  LawInspection,
  Location,
  LocationId,
  LocationRightsApproach,
  LocationRightsState,
  MachineAlarm,
  MachineId,
  MachineModelDefinition,
  MachineModelId,
  PlacementMethod,
  PlacementQuote,
  ProductId,
  RouteVehicle,
  ServiceContract,
  SupplierRelationshipState,
  VendingMachine
} from "./types";
import { baseFacilities } from "../content/baseFacilities";
import { empireAssets, type EmpireAssetEffects } from "../content/empire";
import { machineModelList, machineModels } from "../content/machineModels";
import { narrativeQuestDefinitions, type NarrativeQuestDefinition } from "../content/quests";
import { activeRunModifier } from "../content/replayability";
import { supplierDefinitions } from "../content/suppliers";
import { endgamePaths, storyMissionArcs, type EndgamePath, type StoryMissionArc, type StoryMissionObjective } from "../content/story";

export type RouteTaskType = "supplier" | "garage" | "placement" | "stock" | "collect" | "repair" | "pressure" | "contract" | "alarm" | "inspection" | "conflict";

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
  conflictId?: string;
  inspectionId?: string;
  priority: number;
  tone: "good" | "warning" | "danger";
}

export interface RoutePlanStop {
  distance: number;
  etaHours: number;
  locationId: LocationId;
  order: number;
  riskScore: number;
  task: RouteTask;
  travelHours: number;
}

export interface RouteLoadRecommendation {
  available: number;
  productId: ProductId;
  quantity: number;
  reason: string;
  source: "garage" | "supplier";
}

export interface OptimizedRoutePlan {
  estimatedHours: number;
  loadRecommendations: RouteLoadRecommendation[];
  startLocationId: LocationId;
  stops: RoutePlanStop[];
  tone: "good" | "warning" | "danger";
  totalDistance: number;
  totalRisk: number;
}

export type StoryArcStage = "locked" | "available" | "active" | "complete";

export interface StoryArcProgress {
  arc: StoryMissionArc;
  progressRatio: number;
  signals: string[];
  stage: StoryArcStage;
  tone: "good" | "warning" | "danger";
}

export interface CampaignMissionProgress {
  activeObjective?: StoryMissionObjective;
  arc: StoryMissionArc;
  completedObjectives: StoryMissionObjective[];
  mission: CampaignMissionState;
  pendingObjectives: StoryMissionObjective[];
  progressRatio: number;
  tone: "good" | "warning" | "danger";
}

export interface EndgamePathScore {
  path: EndgamePath;
  score: number;
  signals: string[];
  tone: "good" | "warning" | "danger";
}

export interface NarrativeQuestProgress {
  activeStep?: NarrativeQuestDefinition["steps"][number];
  definition: NarrativeQuestDefinition;
  progressRatio: number;
  state: GameState["mission"]["quests"][string];
  tone: "good" | "warning" | "danger";
}

export type HeatTierId = "quiet" | "noticed" | "watched" | "hot" | "raid_weather";

export interface HeatTier {
  action: string;
  description: string;
  id: HeatTierId;
  label: string;
  tone: "good" | "warning" | "danger";
}

export function heatTierFor(heat: number): HeatTier {
  if (heat >= 35) {
    return {
      action: "Run legal placements, cool routes, and keep bribe cash ready.",
      description: "Raids, checkpoints, and rival tips can stack quickly.",
      id: "raid_weather",
      label: "Raid weather",
      tone: "danger"
    };
  }

  if (heat >= 22) {
    return {
      action: "Repair permits, avoid grey stock, and answer inspections fast.",
      description: "Inspectors are watching repeat stops and suspicious stock.",
      id: "hot",
      label: "Hot route",
      tone: "danger"
    };
  }

  if (heat >= 12) {
    return {
      action: "Use legal installs and bribes sparingly.",
      description: "Law pressure is active enough to interrupt profitable runs.",
      id: "watched",
      label: "Watched",
      tone: "warning"
    };
  }

  if (heat >= 5) {
    return {
      action: "Keep records clean before expanding.",
      description: "The business is visible but not yet a priority.",
      id: "noticed",
      label: "Noticed",
      tone: "warning"
    };
  }

  return {
    action: "Expand while the route is quiet.",
    description: "Customers and landlords see a normal vending route.",
    id: "quiet",
    label: "Quiet",
    tone: "good"
  };
}

export function playerHeatTier(state: GameState): HeatTier {
  return heatTierFor(state.factions[state.playerFactionId]?.heat ?? 0);
}

export interface MachineProcurementQuote {
  cost: number;
  installedCount: number;
  model: MachineModelDefinition;
  reason: string;
  storedCount: number;
  unlocked: boolean;
  valueScore: number;
}

export interface FleetSummary {
  averageCondition: number;
  installedCount: number;
  modelVariety: number;
  storedCount: number;
  totalFleetValue: number;
  vendorReputation: number;
}

export interface LocationRightsQuote {
  approach: LocationRightsApproach;
  canNegotiate: boolean;
  cost: number;
  description: string;
  disabledReason?: string;
  label: string;
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

export function isMachineInstalled(machine: VendingMachine): boolean {
  return (machine.placementStatus ?? "installed") === "installed";
}

export function installedMachines(state: GameState, factionId?: FactionId): VendingMachine[] {
  return Object.values(state.machines).filter((machine) => isMachineInstalled(machine) && (!factionId || machine.ownerFactionId === factionId));
}

export function storedPlayerMachines(state: GameState): VendingMachine[] {
  return ownedMachines(state, state.playerFactionId).filter((machine) => !isMachineInstalled(machine));
}

export function defaultLocationRights(location: Location): LocationRightsState {
  return {
    corporatePressure: Math.max(0, Math.round((location.rentCost * 0.12 + location.policePresence * 24) * 10) / 10),
    landlordDisposition: Math.max(18, Math.min(82, Math.round(42 + location.safety * 30 - location.rivalPressure * 20 - location.policePresence * 10))),
    legalPressure: Math.max(0, Math.round((location.policePresence * 44 + (1 - location.safety) * 10) * 10) / 10),
    locationId: location.id,
    permitStatus: "none",
    rightsTier: "none"
  };
}

export function locationRightsFor(state: GameState, locationId: LocationId): LocationRightsState {
  const location = state.locations[locationId];
  const current = state.economy?.locationRights?.[locationId];
  if (!location) {
    return {
      corporatePressure: 0,
      landlordDisposition: 0,
      legalPressure: 0,
      locationId,
      permitStatus: "none",
      rightsTier: "none"
    };
  }

  return {
    ...defaultLocationRights(location),
    ...(current ?? {}),
    locationId
  };
}

export function activeLocationRights(state: GameState): LocationRightsState[] {
  return Object.values(state.locations)
    .map((location) => locationRightsFor(state, location.id))
    .filter(
      (rights) =>
        rights.rightsTier !== "none" ||
        rights.permitStatus !== "none" ||
        Boolean(rights.exclusiveUntilHour && rights.exclusiveUntilHour > state.worldTimeHours) ||
        rights.legalPressure >= 35 ||
        rights.corporatePressure >= 25
    )
    .sort((a, b) => b.legalPressure + b.corporatePressure - (a.legalPressure + a.corporatePressure));
}

export function machineResaleValue(state: GameState, machine: VendingMachine): number {
  const model = machineModels[machine.machineModelId] ?? machineModels.basic_snack;
  const condition = Math.max(0.25, 1 - machine.damage / 120);
  const reputationLift = Math.min(0.12, (state.economy?.fleet?.vendorReputation ?? 0) * 0.002);
  return Math.max(8, Math.round(model.baseCost * condition * (0.46 + reputationLift)));
}

export function fleetSummary(state: GameState): FleetSummary {
  const machines = ownedMachines(state, state.playerFactionId);
  const installed = machines.filter(isMachineInstalled);
  const stored = machines.filter((machine) => !isMachineInstalled(machine));
  const totalFleetValue = machines.reduce((sum, machine) => sum + machineResaleValue(state, machine), 0);
  const averageCondition =
    machines.length === 0 ? 1 : machines.reduce((sum, machine) => sum + Math.max(0, 1 - machine.damage / 100), 0) / Math.max(1, machines.length);
  return {
    averageCondition,
    installedCount: installed.length,
    modelVariety: new Set(machines.map((machine) => machine.machineModelId)).size,
    storedCount: stored.length,
    totalFleetValue,
    vendorReputation: state.economy?.fleet?.vendorReputation ?? 0
  };
}

function modelUnlockRequirement(state: GameState, model: MachineModelDefinition): { unlocked: boolean; reason: string } {
  const fleet = state.economy?.fleet;
  if (fleet?.unlockedModelIds?.includes(model.id)) {
    return { unlocked: true, reason: "Available from current fleet supplier." };
  }

  const installedCount = installedMachines(state, state.playerFactionId).length;
  const streetRep = state.factions[state.playerFactionId]?.streetReputation ?? 0;
  const publicRep = state.factions[state.playerFactionId]?.publicReputation ?? 0;
  const warehouseLevel = empireAssetLevel(state, "warehouse_network");
  const shellLevel = empireAssetLevel(state, "shell_company");
  const vendorReputation = fleet?.vendorReputation ?? 0;

  if (model.id === "luxury_vendor") {
    return publicRep >= 10 || installedCount >= 3
      ? { unlocked: true, reason: "Unlocked by public reputation or a three-machine route." }
      : { unlocked: false, reason: "Needs public rep 10 or three installed machines." };
  }

  if (model.id === "armored_unit") {
    return streetRep >= 2 || installedCount >= 4
      ? { unlocked: true, reason: "Unlocked by street reputation or a larger route footprint." }
      : { unlocked: false, reason: "Needs street rep 2 or four installed machines." };
  }

  if (model.id === "smart_vendor") {
    return baseFacilityLevel(state, "office") > 0 || vendorReputation >= 18
      ? { unlocked: true, reason: "Unlocked by office systems or fleet vendor reputation." }
      : { unlocked: false, reason: "Needs Office level 1 or vendor rep 18." };
  }

  if (model.id === "hidden_wall_unit") {
    return warehouseLevel > 0 || streetRep >= 4
      ? { unlocked: true, reason: "Unlocked by warehouse crews or street reputation." }
      : { unlocked: false, reason: "Needs Warehouse Network level 1 or street rep 4." };
  }

  if (model.id === "discreet_black_market") {
    const hasPipeline = Object.values(state.economy?.supply?.suppliers ?? {}).some((supplier) => supplier.blackMarketTier > 1 || supplier.unlockedProductIds.some((productId) => state.products[productId]?.legality > 0));
    return hasPipeline || streetRep >= 5
      ? { unlocked: true, reason: "Unlocked by grey-stock supplier pipelines." }
      : { unlocked: false, reason: "Needs a grey-stock pipeline or street rep 5." };
  }

  if (model.id === "mobile_vendor") {
    return installedCount >= 2 || vendorReputation >= 12
      ? { unlocked: true, reason: "Unlocked by route scale or vendor reputation." }
      : { unlocked: false, reason: "Needs two installed machines or vendor rep 12." };
  }

  if (model.id === "fake_broken_front") {
    return shellLevel > 0 || state.empire?.shellCover >= 0.12
      ? { unlocked: true, reason: "Unlocked by shell-company cover." }
      : { unlocked: false, reason: "Needs Shell Company level 1 or shell cover." };
  }

  return { unlocked: true, reason: "Available from starter fleet supplier." };
}

export function machineProcurementCost(state: GameState, modelId: MachineModelId): number {
  const model = machineModels[modelId] ?? machineModels.basic_snack;
  const fleet = state.economy?.fleet;
  const experience = fleet?.modelExperience?.[modelId] ?? 0;
  const storedSameModel = storedPlayerMachines(state).filter((machine) => machine.machineModelId === modelId).length;
  const installedCount = installedMachines(state, state.playerFactionId).length;
  const vendorDiscount = Math.min(0.16, (fleet?.vendorReputation ?? 0) * 0.0035);
  const experienceDiscount = Math.min(0.1, experience * 0.015);
  const scarcityMarkup = storedSameModel * 0.06 + Math.max(0, installedCount - 4) * 0.025;
  return Math.max(18, Math.round(model.baseCost * (1 - vendorDiscount - experienceDiscount + scarcityMarkup)));
}

export function machineProcurementQuotes(state: GameState): MachineProcurementQuote[] {
  const installedCount = installedMachines(state, state.playerFactionId).length;
  return machineModelList.map((model) => {
    const storedCount = storedPlayerMachines(state).filter((machine) => machine.machineModelId === model.id).length;
    const unlock = modelUnlockRequirement(state, model);
    const cost = machineProcurementCost(state, model.id);
    const valueScore = Math.round((model.maxSlots * 12 + model.capacityBonus * 2 + model.securityBonus * 120 + model.visibilityBonus * 80 - model.heatMultiplier * 8) * 10) / 10;
    return {
      cost,
      installedCount,
      model,
      reason: unlock.reason,
      storedCount,
      unlocked: unlock.unlocked,
      valueScore
    };
  });
}

export function locationRightsNegotiationCost(state: GameState, location: Location, approach: LocationRightsApproach): number {
  const district = state.districts[location.districtId];
  const rights = locationRightsFor(state, location.id);
  const districtMultiplier = district?.rentMultiplier ?? 1;
  const pressureMarkup = 1 + Math.max(0, rights.legalPressure + rights.corporatePressure - 40) * 0.006;
  const dispositionDiscount = Math.max(0.82, 1 - Math.max(0, rights.landlordDisposition - 50) * 0.004);
  const base = Math.max(8, location.rentCost + location.placementCost * 0.32);

  if (approach === "landlord_meeting") {
    return Math.round((base * 0.52 + 8) * districtMultiplier * dispositionDiscount);
  }

  if (approach === "permit_filing") {
    return Math.round((base * 0.86 + location.policePresence * 30 + 14) * districtMultiplier * pressureMarkup);
  }

  if (approach === "exclusive_contract") {
    return Math.round((base * 1.55 + location.footTraffic * 22 + rights.corporatePressure * 0.8) * districtMultiplier * pressureMarkup);
  }

  return Math.round((base * 1.25 + 32 + rights.legalPressure * 0.7) * districtMultiplier);
}

export function locationRightsQuotesForLocation(state: GameState, location: Location): LocationRightsQuote[] {
  const player = state.factions[state.playerFactionId];
  const rights = locationRightsFor(state, location.id);
  const districtUnlocked = isDistrictUnlockedForPlacement(state, location.districtId);
  const activeExclusive = Boolean(rights.exclusiveUntilHour && rights.exclusiveUntilHour > state.worldTimeHours && rights.exclusiveContractHolderId === state.playerFactionId);
  const approaches: Array<{
    approach: LocationRightsApproach;
    label: string;
    description: string;
    tone: "good" | "warning" | "danger";
  }> = [
    {
      approach: "landlord_meeting",
      label: "Landlord meeting",
      description: "Raise disposition, reduce rent friction, and cool local corporate complaints.",
      tone: "good"
    },
    {
      approach: "permit_filing",
      label: "File permit",
      description: "Create active paperwork that lowers inspection heat for legal placements.",
      tone: "good"
    },
    {
      approach: "exclusive_contract",
      label: "Exclusive contract",
      description: "Lock the stop against rival expansion and make legal installs cheaper while it lasts.",
      tone: "warning"
    },
    {
      approach: "corporate_shell",
      label: "Shell paperwork",
      description: "Use corporate cover to absorb legal pressure, at the cost of political attention.",
      tone: "danger"
    }
  ];

  return approaches.map((definition) => {
    const cost = locationRightsNegotiationCost(state, location, definition.approach);
    let disabledReason: string | undefined;
    if (!districtUnlocked) {
      disabledReason = "District locked.";
    } else if (player.money < cost) {
      disabledReason = `Needs $${cost}.`;
    } else if (definition.approach === "permit_filing" && rights.permitStatus === "active" && (rights.permitExpiresHour ?? 0) > state.worldTimeHours + 6) {
      disabledReason = "Permit already active.";
    } else if (definition.approach === "exclusive_contract" && activeExclusive) {
      disabledReason = "Exclusive already active.";
    } else if (definition.approach === "corporate_shell" && empireAssetLevel(state, "shell_company") <= 0 && (state.empire?.shellCover ?? 0) < 0.08) {
      disabledReason = "Needs shell-company cover.";
    }

    return {
      ...definition,
      canNegotiate: !disabledReason,
      cost,
      disabledReason
    };
  });
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

export function baseFacilityLevel(state: GameState, facilityId: BaseFacilityId): number {
  return Math.max(0, state.base?.facilities?.[facilityId]?.level ?? (facilityId === "garage_storage" ? 1 : 0));
}

export function baseFacilityUpgradeCost(state: GameState, facilityId: BaseFacilityId): number {
  const definition = baseFacilities[facilityId];
  const level = baseFacilityLevel(state, facilityId);
  if (!definition || level >= definition.maxLevel) {
    return 0;
  }

  return Math.round(definition.baseCost * Math.pow(definition.costGrowth, level));
}

export function baseFacilityEffects(state: GameState): BaseFacilityEffects {
  return Object.values(baseFacilities).reduce<BaseFacilityEffects>((effects, facility) => {
    const level = baseFacilityLevel(state, facility.id);
    for (const [key, value] of Object.entries(facility.effectsPerLevel) as Array<[keyof BaseFacilityEffects, number | undefined]>) {
      if (!value) {
        continue;
      }
      effects[key] = (effects[key] ?? 0) + value * level;
    }
    return effects;
  }, {});
}

export function empireAssetLevel(state: GameState, assetId: EmpireAssetId): number {
  return Math.max(0, state.empire?.assets?.[assetId]?.level ?? 0);
}

export function empireAssetUpgradeCost(state: GameState, assetId: EmpireAssetId): number {
  const definition = empireAssets[assetId];
  const level = empireAssetLevel(state, assetId);
  if (!definition || level >= definition.maxLevel) {
    return 0;
  }

  return Math.round(definition.baseCost * Math.pow(definition.costGrowth, level));
}

export function empireAssetList(state: GameState): Array<EmpireAssetState & { name: string; description: string; maxLevel: number; nextCost: number }> {
  return Object.values(empireAssets).map((definition) => {
    const current = state.empire?.assets?.[definition.id] ?? { id: definition.id, level: 0 };
    return {
      ...current,
      description: definition.description,
      maxLevel: definition.maxLevel,
      name: definition.name,
      nextCost: empireAssetUpgradeCost(state, definition.id)
    };
  });
}

export function empireAssetEffects(state: GameState): EmpireAssetEffects {
  return Object.values(empireAssets).reduce<EmpireAssetEffects>((effects, asset) => {
    const level = empireAssetLevel(state, asset.id);
    for (const [key, value] of Object.entries(asset.effectsPerLevel) as Array<[keyof EmpireAssetEffects, number | undefined]>) {
      if (!value) {
        continue;
      }
      effects[key] = (effects[key] ?? 0) + value * level;
    }
    return effects;
  }, {});
}

export function baseStorageCapacity(state: GameState): number {
  return state.player.garageCapacity + (baseFacilityEffects(state).storageCapacity ?? 0) + (empireAssetEffects(state).storageCapacity ?? 0);
}

export function employeeCapacity(state: GameState): number {
  return 3 + (baseFacilityEffects(state).employeeCapacity ?? 0);
}

export function productLabSlots(state: GameState): number {
  return baseFacilityEffects(state).productLabSlots ?? 0;
}

export function regionalManagerCapacity(state: GameState): number {
  return (baseFacilityEffects(state).managerSlots ?? 0) + (empireAssetEffects(state).regionalManagerSlots ?? 0);
}

export function baseSecurityScore(state: GameState): number {
  return Math.min(0.9, (state.base?.securityReadiness ?? 0.1) + (baseFacilityEffects(state).baseSecurity ?? 0));
}

export function coldStorageProtection(state: GameState): number {
  return Math.min(0.82, baseFacilityEffects(state).coldStorageProtection ?? 0);
}

export function supplierDiscount(state: GameState): number {
  const relationshipDiscount = Object.values(state.economy?.supply?.suppliers ?? {}).reduce((highest, supplier) => {
    if (!supplier.unlocked) {
      return highest;
    }
    return Math.max(highest, supplier.negotiatedDiscount + Math.min(0.08, supplier.loyalty * 0.001));
  }, 0);
  return Math.min(0.34, (baseFacilityEffects(state).supplierDiscount ?? 0) + relationshipDiscount);
}

export function routeRiskReduction(state: GameState): number {
  return Math.min(
    0.62,
    (baseFacilityEffects(state).routeRiskReduction ?? 0) +
      (baseFacilityEffects(state).planningIntel ?? 0) * 0.35 +
      (empireAssetEffects(state).routeRiskReduction ?? 0)
  );
}

export function currentProductCost(state: GameState, productId: ProductId): number {
  const product = state.products[productId];
  if (!product) {
    return 0;
  }

  const marketMultiplier = state.economy?.supply?.priceMultipliers?.[productId] ?? 1;
  const customizationCost = state.economy?.productCustomizations?.[productId]?.costDelta ?? 0;
  const runCostMultiplier = activeRunModifier(state).effects.supplierCostMultiplier ?? 1;
  return Math.max(1, Math.round((product.cost + customizationCost) * marketMultiplier * runCostMultiplier * (1 - supplierDiscount(state))));
}

export function supplierRelationshipList(state: GameState): Array<SupplierRelationshipState & { label: string; description: string; available: boolean; productCount: number }> {
  return supplierDefinitions.map((definition) => {
    const relationship = state.economy?.supply?.suppliers?.[definition.id] ?? {
      blackMarketTier: definition.id === "night_market_broker" ? 1 : 0,
      dealCooldownUntil: 0,
      id: definition.id,
      loyalty: 0,
      negotiatedDiscount: 0,
      scamRisk: definition.scamRisk,
      trust: 0,
      unlocked: definition.unlockRequirement.kind === "always",
      unlockedProductIds: definition.baseProducts
    };
    return {
      ...relationship,
      available: supplierAvailable(state, definition.id),
      description: definition.description,
      label: definition.label,
      productCount: relationship.unlockedProductIds.length
    };
  });
}

export function supplierAvailable(state: GameState, supplierId: string): boolean {
  const definition = supplierDefinitions.find((supplier) => supplier.id === supplierId);
  if (!definition) {
    return false;
  }

  const requirement = definition.unlockRequirement;
  if (requirement.kind === "always") {
    return true;
  }

  if (requirement.kind === "district_scouted") {
    return districtProgress(state, requirement.districtId).access !== "locked";
  }

  if (requirement.kind === "district_unlocked") {
    return districtProgress(state, requirement.districtId).access === "unlocked";
  }

  if (requirement.kind === "base_facility") {
    return baseFacilityLevel(state, requirement.facilityId as BaseFacilityId) >= requirement.level;
  }

  const player = state.factions[state.playerFactionId];
  if (requirement.kind === "street_reputation") {
    return player.streetReputation >= requirement.value;
  }

  if (requirement.kind === "public_reputation") {
    return player.publicReputation >= requirement.value;
  }

  return false;
}

export function activeMajorRaids(state: GameState): EmpireRaid[] {
  return Object.values(state.empire?.activeRaids ?? {}).filter((raid) => raid.status === "active");
}

export function narrativeQuestProgress(state: GameState): NarrativeQuestProgress[] {
  return narrativeQuestDefinitions.map((definition) => {
    const fallbackState = {
      activeStepId: definition.steps[0]?.id ?? "",
      choiceHistory: [],
      completedStepIds: [],
      dialogueLog: [],
      id: definition.id,
      status: "available" as const
    };
    const questState = state.mission?.quests?.[definition.id] ?? fallbackState;
    const completed = new Set(questState.completedStepIds);
    const activeStep = definition.steps.find((step) => step.id === questState.activeStepId) ?? definition.steps.find((step) => !completed.has(step.id));
    const progressRatio = definition.steps.length === 0 ? 1 : completed.size / definition.steps.length;

    return {
      activeStep,
      definition,
      progressRatio: questState.status === "completed" ? 1 : progressRatio,
      state: questState,
      tone: questState.status === "completed" ? "good" : questState.status === "active" ? "warning" : "danger"
    };
  });
}

export function financeLedger(state: GameState) {
  return [...(state.economy?.finance?.ledger ?? [])].sort((a, b) => b.hour - a.hour || b.id.localeCompare(a.id));
}

export function financeSummary(state: GameState): { revenueToday: number; expensesToday: number; netToday: number } {
  const revenueToday = state.economy?.finance?.revenueToday ?? 0;
  const expensesToday = state.economy?.finance?.expensesToday ?? 0;
  return {
    revenueToday,
    expensesToday,
    netToday: revenueToday - expensesToday
  };
}

export function machineAtLocation(state: GameState, locationId: LocationId): VendingMachine | undefined {
  return Object.values(state.machines).find((machine) => isMachineInstalled(machine) && machine.locationId === locationId);
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
  const rights = state.economy?.locationRights?.[location.id];
  const permitDiscount = rights?.permitStatus === "active" ? 0.9 : rights?.permitStatus === "challenged" ? 1.12 : 1;
  const exclusivityDiscount = rights?.exclusiveUntilHour && rights.exclusiveUntilHour > state.worldTimeHours ? 0.82 : 1;
  const landlordDiscount = rights ? Math.max(0.84, 1 - Math.max(0, rights.landlordDisposition - 50) * 0.004) : 1;
  const pressureMarkup = rights ? 1 + Math.max(0, rights.legalPressure + rights.corporatePressure - 55) * 0.004 : 1;
  return Math.round(location.placementCost * (district?.rentMultiplier ?? 1) * permitDiscount * exclusivityDiscount * landlordDiscount * pressureMarkup);
}

const placementLabels: Record<PlacementMethod, string> = {
  legal_contract: "Legal contract",
  bribe: "Bribe",
  illegal: "Illegal drop",
  hidden: "Hidden alcove",
  rival_territory: "Rival territory"
};

export function placementQuoteForLocation(state: GameState, location: Location, method: PlacementMethod): PlacementQuote {
  const baseCost = placementCostForLocation(state, location);
  const rivalPressure = location.rivalPressure;
  const policePressure = location.policePresence;
  const rights = locationRightsFor(state, location.id);
  const permitShield = rights.permitStatus === "active" ? 1 : rights.permitStatus === "challenged" ? -0.5 : 0;
  const exclusiveShield = rights.exclusiveUntilHour && rights.exclusiveUntilHour > state.worldTimeHours ? 1 : 0;
  const legalPressure = Math.max(0, rights.legalPressure + rights.corporatePressure * 0.45 - rights.landlordDisposition * 0.18);

  if (method === "bribe") {
    return {
      method,
      label: placementLabels[method],
      cost: Math.max(12, Math.round(baseCost * 0.52 + policePressure * 34 + legalPressure * 0.28)),
      heatDelta: Math.max(3, 5 + legalPressure * 0.025 - permitShield),
      visibilityDelta: 0,
      securityDelta: -0.01,
      publicReputationDelta: -0.6,
      streetReputationDelta: 1.2,
      rivalPressureDelta: 0.05,
      inspectionRiskLabel: "medium",
      description: "Cheaper paperwork, but every inspection has leverage over you."
    };
  }

  if (method === "illegal") {
    return {
      method,
      label: placementLabels[method],
      cost: Math.max(0, Math.round(baseCost * 0.12)),
      heatDelta: 10 + Math.max(0, legalPressure * 0.04),
      visibilityDelta: 0.12,
      securityDelta: -0.06,
      publicReputationDelta: -1.4,
      streetReputationDelta: 2.4,
      rivalPressureDelta: 0.1,
      inspectionRiskLabel: "extreme",
      description: "Fast and cheap with strong sales, heavy fines, and confiscation risk."
    };
  }

  if (method === "hidden") {
    return {
      method,
      label: placementLabels[method],
      cost: Math.max(10, Math.round(baseCost * 0.68 + 12 + Math.max(0, rights.corporatePressure - 20) * 0.4)),
      heatDelta: Math.max(0.4, 1 + Math.max(0, legalPressure - 30) * 0.015),
      visibilityDelta: -0.28,
      securityDelta: 0.08,
      publicReputationDelta: -0.1,
      streetReputationDelta: 0,
      rivalPressureDelta: -0.02,
      inspectionRiskLabel: "low",
      description: "Low profile and safer from inspections, but fewer customers notice it."
    };
  }

  if (method === "rival_territory") {
    return {
      method,
      label: placementLabels[method],
      cost: Math.max(15, Math.round(baseCost * 0.4 + rivalPressure * 42)),
      heatDelta: 7.5 + Math.max(0, legalPressure * 0.025),
      visibilityDelta: 0.02,
      securityDelta: -0.06,
      publicReputationDelta: -0.8,
      streetReputationDelta: 3.4,
      rivalPressureDelta: 0.2,
      inspectionRiskLabel: rivalPressure >= 0.45 ? "extreme" : "high",
      description: "A direct challenge to Redline. Good street rep, fast retaliation."
    };
  }

  return {
    method,
    label: placementLabels[method],
    cost: Math.round(baseCost * (rights.permitStatus === "active" ? 0.86 : 1.04) + Math.max(0, legalPressure - 35) * 0.35),
    heatDelta: Math.max(0, legalPressure * 0.01 - permitShield - exclusiveShield * 0.4),
    visibilityDelta: 0.04,
    securityDelta: 0.04,
    publicReputationDelta: 0.8 + permitShield * 0.2 + exclusiveShield * 0.2,
    streetReputationDelta: 0,
    rivalPressureDelta: exclusiveShield ? -0.1 : -0.04,
    inspectionRiskLabel: rights.permitStatus === "active" ? "low" : legalPressure >= 50 ? "medium" : "low",
    description: rights.permitStatus === "active" ? "Permitted placement backed by filed paperwork and cleaner inspections." : "Permitted placement with the cleanest inspections and lowest heat."
  };
}

export function placementQuotesForLocation(state: GameState, location: Location): PlacementQuote[] {
  return (["legal_contract", "bribe", "illegal", "hidden", "rival_territory"] as PlacementMethod[]).map((method) => placementQuoteForLocation(state, location, method));
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
  const ownedCount = installedMachines(state, state.playerFactionId).length;
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
  return Math.max(0, baseStorageCapacity(state) - garageStorageUnits(state));
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

export function activePoliceCheckpointAt(state: GameState, locationId: LocationId): boolean {
  return Object.values(state.economy?.traffic?.checkpoints ?? {}).some((checkpoint) => checkpoint.locationId === locationId && checkpoint.expiresHour > state.worldTimeHours);
}

export function routeDangerScore(state: GameState, location: Location, vehicle = activeVehicle(state)): { score: number; reasons: string[]; tone: "good" | "warning" | "danger" } {
  const player = state.factions[state.playerFactionId];
  const congestion = state.economy?.traffic?.congestionByLocation?.[location.id] ?? 0;
  const checkpoint = activePoliceCheckpointAt(state, location.id) ? 0.55 : 0;
  const conditionRisk = vehicle ? Math.max(0, 1 - (vehicle.condition ?? 1)) * 0.45 : 0.25;
  const score = Math.max(
    0,
    location.rivalPressure * 0.45 +
      (1 - location.safety) * 0.18 +
      location.policePresence * 0.22 +
      player.heat * 0.012 +
      congestion * 0.18 +
      checkpoint +
      conditionRisk -
      routeRiskReduction(state)
  );
  const reasons = [
    location.rivalPressure >= 0.4 ? "rival pressure" : "",
    location.policePresence >= 0.35 || checkpoint > 0 ? "police" : "",
    congestion >= 0.45 ? "traffic" : "",
    conditionRisk >= 0.18 ? "vehicle wear" : ""
  ].filter(Boolean);
  return {
    score,
    reasons,
    tone: score >= 0.85 ? "danger" : score >= 0.45 ? "warning" : "good"
  };
}

export function rivalTerritoryByDistrict(state: GameState): Array<{
  districtId: DistrictId;
  districtName: string;
  playerMachines: number;
  rivalMachines: number;
  averagePressure: number;
  controllingFactionId: FactionId;
}> {
  return Object.values(state.districts).map((district) => {
    const locations = districtLocations(state, district.id).filter(installableLocation);
    const machines = locations.map((location) => machineAtLocation(state, location.id)).filter((machine): machine is VendingMachine => Boolean(machine));
    const playerMachines = machines.filter((machine) => machine.ownerFactionId === state.playerFactionId).length;
    const rivalMachinesByFaction = new Map<FactionId, number>();
    for (const machine of machines.filter((candidate) => candidate.ownerFactionId !== state.playerFactionId)) {
      rivalMachinesByFaction.set(machine.ownerFactionId, (rivalMachinesByFaction.get(machine.ownerFactionId) ?? 0) + 1);
    }
    const strongestRival = [...rivalMachinesByFaction.entries()].sort((a, b) => b[1] - a[1])[0];
    const averagePressure = locations.reduce((sum, location) => sum + location.rivalPressure, 0) / Math.max(1, locations.length);
    const controllingFactionId = playerMachines >= Math.max(1, (strongestRival?.[1] ?? 0) + 1) && averagePressure < 0.45 ? state.playerFactionId : strongestRival?.[0] ?? state.playerFactionId;
    return {
      districtId: district.id,
      districtName: district.name,
      playerMachines,
      rivalMachines: machines.length - playerMachines,
      averagePressure,
      controllingFactionId
    };
  });
}

function playerMachinesInDistrict(state: GameState, districtId: DistrictId): VendingMachine[] {
  return installedMachines(state, state.playerFactionId).filter((machine) => state.locations[machine.locationId]?.districtId === districtId);
}

function riskyPlayerMachines(state: GameState): VendingMachine[] {
  return installedMachines(state, state.playerFactionId).filter(
    (machine) =>
      machine.placementMethod !== "legal_contract" ||
      machine.slots.some((slot) => {
        const product = state.products[slot.productId];
        return Boolean(product && product.legality > 0 && slot.quantity > 0);
      })
  );
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function storyArcProgress(state: GameState): StoryArcProgress[] {
  const territory = rivalTerritoryByDistrict(state);
  const player = state.factions[state.playerFactionId];
  const completedContracts = state.progression.contractsCompletedTotal ?? state.progression.contractsCompletedToday ?? 0;
  const guardsOrRunners = employeeList(state).filter((employee) => !employee.betrayed && (employee.role === "guard" || employee.role === "runner")).length;

  return storyMissionArcs.map((arc) => {
    const progress = districtProgress(state, arc.districtId);
    const machines = playerMachinesInDistrict(state, arc.districtId);
    const districtTerritory = territory.find((row) => row.districtId === arc.districtId);
    const controlled = districtTerritory?.controllingFactionId === state.playerFactionId && (districtTerritory?.playerMachines ?? 0) > 0;
    const signals: string[] = [];
    let stage: StoryArcStage = "locked";
    let progressRatio = 0;

    if (arc.id === "starter_takeover") {
      const mission = missionProgress(state);
      progressRatio = state.mission.completed ? 1 : Math.min(0.95, mission.profitableCount / Math.max(1, mission.target));
      stage = state.mission.completed ? "complete" : "active";
      signals.push(`${mission.profitableCount}/${mission.target} profitable starter machines`);
      if (state.progression.firstUndercutTriggered) {
        signals.push("Redline undercut surfaced");
      }
      return {
        arc,
        progressRatio,
        signals,
        stage,
        tone: stage === "complete" ? "good" : activeMachineAlarms(state).length > 0 ? "danger" : "warning"
      };
    }

    if (progress.access === "locked") {
      signals.push("District still locked");
      return { arc, progressRatio, signals, stage, tone: "warning" };
    }

    stage = progress.access === "scouted" ? "available" : machines.length > 0 ? "active" : "available";
    progressRatio = progress.access === "scouted" ? 0.25 : 0.4;
    signals.push(`${progress.access} district`);

    if (machines.length > 0) {
      signals.push(`${machines.length} owned machines`);
      progressRatio += Math.min(0.32, machines.length * 0.12);
    }

    if (completedContracts > 0) {
      signals.push(`${completedContracts} contracts completed`);
      progressRatio += Math.min(0.14, completedContracts * 0.025);
    }

    if (guardsOrRunners > 0 && arc.id === "yard_leverage") {
      signals.push("route muscle hired");
      progressRatio += 0.12;
    }

    if (player.publicReputation >= 12 && arc.id === "downtown_contracts") {
      signals.push("clean public reputation");
      progressRatio += 0.12;
    }

    if (riskyPlayerMachines(state).length > 0 && arc.id === "neon_afterhours") {
      signals.push("grey-market route active");
      progressRatio += 0.12;
    }

    if (controlled) {
      signals.push("district control signal");
      progressRatio += 0.18;
    }

    if (progressRatio >= 0.92) {
      stage = "complete";
      progressRatio = 1;
    }

    return {
      arc,
      progressRatio: Math.min(1, progressRatio),
      signals,
      stage,
      tone: stage === "complete" ? "good" : activeConflictEvents(state).length > 0 ? "danger" : "warning"
    };
  });
}

export function campaignMissionProgress(state: GameState): CampaignMissionProgress[] {
  return storyMissionArcs.map((arc) => {
    const firstStep = arc.missionChain[0];
    const stored = state.mission?.campaign?.[arc.id];
    const mission: CampaignMissionState = {
      arcId: arc.id,
      activeStepId: stored?.activeStepId ?? firstStep?.id ?? "",
      completed: stored?.completed ?? false,
      completedHour: stored?.completedHour,
      completedStepIds: Array.isArray(stored?.completedStepIds) ? stored.completedStepIds : [],
      unlockedHour: stored?.unlockedHour ?? 0
    };
    const completedStepIds = new Set(mission.completedStepIds);
    const completedObjectives = arc.missionChain.filter((objective) => completedStepIds.has(objective.id));
    const pendingObjectives = arc.missionChain.filter((objective) => !completedStepIds.has(objective.id));
    const activeObjective = mission.completed ? undefined : arc.missionChain.find((objective) => objective.id === mission.activeStepId) ?? pendingObjectives[0];
    const progressRatio = arc.missionChain.length === 0 ? 1 : completedObjectives.length / arc.missionChain.length;

    return {
      activeObjective,
      arc,
      completedObjectives,
      mission,
      pendingObjectives,
      progressRatio: mission.completed ? 1 : progressRatio,
      tone: mission.completed ? "good" : completedObjectives.length > 0 ? "warning" : "danger"
    };
  });
}

export function endgamePathScores(state: GameState): EndgamePathScore[] {
  const player = state.factions[state.playerFactionId];
  const playerMachines = installedMachines(state, state.playerFactionId);
  const legalMachines = playerMachines.filter((machine) => machine.placementMethod === "legal_contract");
  const hiddenMachines = playerMachines.filter((machine) => machine.placementMethod === "hidden");
  const riskyMachines = riskyPlayerMachines(state);
  const controlledDistricts = rivalTerritoryByDistrict(state).filter((row) => row.controllingFactionId === state.playerFactionId && row.playerMachines > 0);
  const strongestRival = Object.values(state.factions)
    .filter((faction) => faction.type === "npc")
    .sort((a, b) => b.streetReputation - a.streetReputation)[0];
  const totalDailyFailures = state.progression.contractsFailedToday + state.conflict.missedToday + activeLawInspections(state).length;
  const legalRatio = playerMachines.length > 0 ? legalMachines.length / playerMachines.length : 0;
  const riskyRatio = playerMachines.length > 0 ? riskyMachines.length / playerMachines.length : 0;
  const stability = Math.max(0, 30 - player.heat * 1.6 - totalDailyFailures * 8);

  return endgamePaths
    .map((path) => {
      const signals: string[] = [];
      let score = 0;

      if (path.id === "legit_empire") {
        score = legalRatio * 38 + player.publicReputation * 3.2 + stability + baseFacilityLevel(state, "office") * 7;
        signals.push(`${legalMachines.length}/${Math.max(1, playerMachines.length)} legal machines`, `${Math.round(player.publicReputation)} public rep`, `${Math.round(player.heat)} heat`);
      } else if (path.id === "syndicate") {
        score = riskyRatio * 34 + player.streetReputation * 4.2 + controlledDistricts.length * 11 + hiddenMachines.length * 4;
        signals.push(`${riskyMachines.length} risky machines`, `${Math.round(player.streetReputation)} street rep`, `${controlledDistricts.length} controlled districts`);
      } else if (path.id === "collapse") {
        const lowCashPressure = player.money < 25 ? 20 : player.money < 75 ? 10 : 0;
        score = player.heat * 3.4 + totalDailyFailures * 16 + lowCashPressure + state.conflict.missedToday * 8;
        signals.push(`${Math.round(player.heat)} heat`, `${totalDailyFailures} active failures`, `$${Math.round(player.money)} cash`);
      } else if (path.id === "kingmaker") {
        const rivalGap = strongestRival ? strongestRival.streetReputation - player.streetReputation * 0.3 : 0;
        score = controlledDistricts.length * 8 + Math.max(0, rivalGap) * 4 + player.publicReputation * 1.2 + player.streetReputation * 1.2;
        signals.push(strongestRival ? `${strongestRival.name} influence` : "no clear faction partner", `${controlledDistricts.length} leverage districts`);
      } else {
        score = Math.min(42, player.money * 0.08) + stability + legalRatio * 16 + playerMachines.length * 4;
        signals.push(`$${Math.round(player.money)} cash`, `${playerMachines.length} active machines`, `${Math.round(stability)} stability`);
      }

      const tone: EndgamePathScore["tone"] = score >= 65 ? "good" : score >= 35 ? "warning" : "danger";

      return {
        path,
        score: clampScore(score),
        signals,
        tone
      };
    })
    .sort((a, b) => b.score - a.score);
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
    .filter((alarm) => !alarm.resolved && alarm.expiresHour > state.worldTimeHours && Boolean(state.machines[alarm.machineId]) && isMachineInstalled(state.machines[alarm.machineId]))
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
  const playerMachines = installedMachines(state, state.playerFactionId);
  return {
    ownedCount: playerMachines.length,
    profitableCount: playerMachines.filter((machine) => machine.revenueStored >= 20 || machine.slots.some((slot) => slot.quantity > 0)).length,
    target: 3
  };
}

export function activeLawInspections(state: GameState): LawInspection[] {
  return Object.values(state.law?.activeInspections ?? {})
    .filter((inspection) => inspection.status === "active" && Boolean(state.machines[inspection.machineId]))
    .sort((a, b) => a.deadlineHour - b.deadlineHour);
}

export function activeConflictEvents(state: GameState): ConflictEvent[] {
  return Object.values(state.conflict?.activeEvents ?? {})
    .filter((event) => event.status === "active")
    .sort((a, b) => a.expiresHour - b.expiresHour);
}

export function activeDistrictEvents(state: GameState): DistrictEvent[] {
  return Object.values(state.economy?.districtEvents?.activeEvents ?? {})
    .filter((event) => event.expiresHour > state.worldTimeHours && Boolean(state.districts[event.districtId]))
    .sort((a, b) => a.expiresHour - b.expiresHour);
}

export function activeDistrictEventsForLocation(state: GameState, locationId: LocationId): DistrictEvent[] {
  const location = state.locations[locationId];
  if (!location) {
    return [];
  }

  return activeDistrictEvents(state).filter((event) => event.districtId === location.districtId);
}

export function activeInspectionForMachine(state: GameState, machineId: MachineId): LawInspection | undefined {
  return activeLawInspections(state).find((inspection) => inspection.machineId === machineId);
}

export function repairCostForMachine(machine: VendingMachine): number {
  return Math.ceil(10 + Math.min(35, machine.damage) * 0.45);
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

  for (const conflict of activeConflictEvents(state)) {
    const location = state.locations[conflict.locationId];
    const minutesLeft = Math.max(1, Math.ceil((conflict.expiresHour - state.worldTimeHours) * 60));
    tasks.push({
      id: `conflict:${conflict.id}`,
      type: "conflict",
      title:
        conflict.kind === "base_raid"
          ? "Defend the garage"
          : conflict.kind === "route_ambush"
            ? "Route ambush"
            : "Street chase",
      detail: `${location?.name ?? "Unknown stop"} · intensity ${conflict.intensity} · ${minutesLeft}m to respond`,
      locationId: conflict.locationId,
      machineId: conflict.targetMachineId,
      conflictId: conflict.id,
      priority: 32,
      tone: "danger"
    });
  }

  for (const inspection of activeLawInspections(state)) {
    const machine = state.machines[inspection.machineId];
    const minutesLeft = Math.max(1, Math.ceil((inspection.deadlineHour - state.worldTimeHours) * 60));
    tasks.push({
      id: `inspection:${inspection.id}`,
      type: "inspection",
      title: `Inspection at ${machine?.name ?? "machine"}`,
      detail: `$${inspection.fine} fine risk · ${inspection.confiscatedUnits} stock at risk · ${minutesLeft}m to answer`,
      locationId: inspection.locationId,
      machineId: inspection.machineId,
      inspectionId: inspection.id,
      priority: 28,
      tone: "danger"
    });
  }

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

  const maintenanceDue = state.economy?.traffic?.vehicleMaintenanceDue?.[vehicle.id] ?? 0;
  if (maintenanceDue >= 10 || (vehicle.condition ?? 1) <= 0.72) {
    tasks.push({
      id: `vehicle:${vehicle.id}:service`,
      type: "garage",
      title: `Service ${vehicle.name}`,
      detail: `${Math.round((vehicle.condition ?? 1) * 100)}% condition · $${Math.max(8, Math.ceil(maintenanceDue + (1 - (vehicle.condition ?? 1)) * 60))} maintenance due`,
      locationId: "garage",
      priority: (vehicle.condition ?? 1) <= 0.55 ? 13 : 7,
      tone: (vehicle.condition ?? 1) <= 0.55 ? "danger" : "warning"
    });
  }

  for (const machine of storedPlayerMachines(state)) {
    if (machine.damage > 0) {
      tasks.push({
        id: `stored:${machine.id}:repair`,
        type: "repair",
        title: `Repair ${machine.name}`,
        detail: `${Math.round(machine.damage)}% damage in garage before placement`,
        locationId: "garage",
        machineId: machine.id,
        priority: 18,
        tone: machine.damage >= 60 ? "danger" : "warning"
      });
    } else {
      tasks.push({
        id: `stored:${machine.id}:place`,
        type: "placement",
        title: `Place ${machine.name}`,
        detail: "Foam & Fold is ready for the starter machine.",
        locationId: "laundromat",
        machineId: machine.id,
        priority: 17,
        tone: "good"
      });
    }
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
    const danger = location ? routeDangerScore(state, location, vehicle) : undefined;
    tasks.push({
      id: `contract:${contract.id}`,
      type: "contract",
      title: `Deliver ${remaining}x ${product?.name ?? "stock"}`,
      detail: `${contract.title} · due by ${formatClock(contract.deadlineHour)} · ${Math.max(0, Math.ceil(hoursLeft))}h left${danger && danger.reasons.length > 0 ? ` · ${danger.reasons.join(", ")}` : ""}`,
      locationId: contract.locationId,
      machineId: machineAtLocation(state, contract.locationId)?.id,
      contractId: contract.id,
      productId: contract.productId,
      priority: tone === "danger" ? 12 : tone === "warning" ? 9 : 5,
      tone
    });
  }

  for (const machine of installedMachines(state, state.playerFactionId)) {
    const location = state.locations[machine.locationId];
    const pressure = machineRoutePressure(state, machine);
    const danger = location ? routeDangerScore(state, location, vehicle) : undefined;
    const stock = machineStockUnits(machine);
    const capacity = machine.slots.reduce((sum, slot) => sum + slot.capacity, 0) + Math.max(0, machine.maxSlots - machine.slots.length) * 24;

    if (stock === 0 || stock / capacity <= 0.25) {
      tasks.push({
        id: `machine:${machine.id}:stock`,
        type: "stock",
        title: `Restock ${machine.name}`,
        detail: `${stock}/${capacity} stock at ${location?.name ?? "unknown location"}${danger && danger.reasons.length > 0 ? ` · ${danger.reasons.join(", ")}` : ""}`,
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

function locationDistance(state: GameState, fromLocationId: LocationId, toLocationId: LocationId): number {
  const from = state.locations[fromLocationId];
  const to = state.locations[toLocationId];
  if (!from || !to) {
    return 0;
  }

  return Math.hypot(to.position.x - from.position.x, to.position.z - from.position.z);
}

function addLoadRecommendation(
  recommendations: Map<ProductId, RouteLoadRecommendation>,
  state: GameState,
  productId: ProductId,
  quantity: number,
  reason: string
): void {
  if (quantity <= 0) {
    return;
  }

  const available = state.player.garageStorage?.[productId] ?? 0;
  const source: RouteLoadRecommendation["source"] = available > 0 ? "garage" : "supplier";
  const existing = recommendations.get(productId);
  recommendations.set(productId, {
    available,
    productId,
    quantity: Math.max(existing?.quantity ?? 0, Math.ceil(quantity)),
    reason: existing ? `${existing.reason} · ${reason}` : reason,
    source
  });
}

function buildRouteLoadRecommendations(state: GameState, stops: RoutePlanStop[]): RouteLoadRecommendation[] {
  const recommendations = new Map<ProductId, RouteLoadRecommendation>();

  for (const stop of stops) {
    if (stop.task.productId) {
      addLoadRecommendation(recommendations, state, stop.task.productId, 8, stop.task.title);
      continue;
    }

    if (stop.task.contractId) {
      const contract = state.contracts[stop.task.contractId];
      if (contract) {
        addLoadRecommendation(recommendations, state, contract.productId, contractRemainingQuantity(contract), contract.title);
      }
      continue;
    }

    if (stop.task.type === "stock" && stop.task.machineId) {
      const machine = state.machines[stop.task.machineId];
      if (!machine) {
        continue;
      }

      const lowestSlot = machine.slots
        .slice()
        .sort((a, b) => a.quantity / Math.max(1, a.capacity) - b.quantity / Math.max(1, b.capacity))[0];
      if (lowestSlot) {
        addLoadRecommendation(recommendations, state, lowestSlot.productId, Math.min(18, lowestSlot.capacity - lowestSlot.quantity), machine.name);
      } else {
        addLoadRecommendation(recommendations, state, "soda", 10, `${machine.name} starter stock`);
        addLoadRecommendation(recommendations, state, "chips", 8, `${machine.name} starter stock`);
      }
    }
  }

  const vehicle = activeVehicle(state);
  let remainingSpace = vehicleSpaceRemaining(state, vehicle);
  return Array.from(recommendations.values())
    .sort((a, b) => {
      const sourceScore = a.source === "garage" ? 1 : 0;
      const otherSourceScore = b.source === "garage" ? 1 : 0;
      return otherSourceScore - sourceScore || b.quantity - a.quantity;
    })
    .map((recommendation) => {
      const product = state.products[recommendation.productId];
      const size = product?.size ?? 1;
      const capacityLimited = Math.max(0, Math.floor(remainingSpace / size));
      const quantity = Math.min(recommendation.quantity, capacityLimited);
      remainingSpace -= quantity * size;
      return { ...recommendation, quantity };
    })
    .filter((recommendation) => recommendation.quantity > 0);
}

export function optimizedRoutePlan(state: GameState, maxStops = 6): OptimizedRoutePlan | undefined {
  const vehicle = activeVehicle(state);
  const startLocationId = vehicle?.locationId ?? state.player.currentLocationId ?? "garage";
  if (!state.locations[startLocationId]) {
    return undefined;
  }

  const pool = routeTasks(state)
    .filter((task) => Boolean(state.locations[task.locationId]))
    .slice(0, 12);
  const stops: RoutePlanStop[] = [];
  let currentLocationId = startLocationId;
  let elapsedHours = 0;
  let totalDistance = 0;
  let totalRisk = 0;

  while (pool.length > 0 && stops.length < maxStops) {
    const nextIndex = pool
      .map((task, index) => {
        const distance = locationDistance(state, currentLocationId, task.locationId);
        const location = state.locations[task.locationId];
        const risk = location ? routeDangerScore(state, location, vehicle).score : 0;
        const selectedBoost = state.routePlan.selectedTaskId === task.id ? 12 : 0;
        const score = task.priority * 5 + selectedBoost - distance * 0.12 - risk * 1.8;
        return { index, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.index;

    if (nextIndex === undefined) {
      break;
    }

    const [task] = pool.splice(nextIndex, 1);
    const distance = locationDistance(state, currentLocationId, task.locationId);
    const location = state.locations[task.locationId];
    const risk = location ? routeDangerScore(state, location, vehicle).score : 0;
    const speed = Math.max(0.45, vehicle?.speed ?? 0.8);
    const travelHours = distance / (14 * speed);
    elapsedHours += travelHours + (task.type === "stock" || task.type === "repair" ? 0.18 : task.type === "collect" ? 0.08 : 0.12);
    totalDistance += distance;
    totalRisk += risk;
    stops.push({
      distance,
      etaHours: elapsedHours,
      locationId: task.locationId,
      order: stops.length + 1,
      riskScore: risk,
      task,
      travelHours
    });
    currentLocationId = task.locationId;
  }

  const tone: OptimizedRoutePlan["tone"] = totalRisk >= 2.2 || stops.some((stop) => stop.task.tone === "danger") ? "danger" : totalRisk >= 1 || stops.some((stop) => stop.task.tone === "warning") ? "warning" : "good";
  return {
    estimatedHours: elapsedHours,
    loadRecommendations: buildRouteLoadRecommendations(state, stops),
    startLocationId,
    stops,
    tone,
    totalDistance,
    totalRisk
  };
}
