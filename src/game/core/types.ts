export type FactionId = "player" | "rival_redline" | string;
export type ProductId =
  | "soda"
  | "chips"
  | "energy"
  | "water"
  | "protein_bar"
  | "coffee_can"
  | "instant_noodles"
  | "phone_charger"
  | "umbrella"
  | "hygiene_kit"
  | "luxury_snack"
  | "mystery_capsules"
  | "mood_fizz"
  | "glitch_gum"
  | "night_syrup"
  | "focus_cubes";
export type MachineUpgradeId = "reinforced_glass" | "smart_lock" | "security_camera" | "cashless_terminal" | "neon_sign" | "remote_monitor";
export type RunModifierId = "inspection_crackdown" | "supplier_shortage" | "redline_price_war" | "night_market_boom" | "student_rush";
export type MachineTraitId = "local_favorite" | "rival_tagged" | "reliable_earner" | "complaint_magnet" | "crew_protected" | "cult_shelf";
export type RivalMemoryKind = "undercut" | "sabotage" | "expand" | "negotiate" | "expose" | "disrupt" | "alarm_confronted";
export type VehicleUpgradeId = "cargo_rack" | "reinforced_locks" | "tuned_engine" | "cold_box";
export type MachineModelId =
  | "basic_snack"
  | "drink_machine"
  | "combo_machine"
  | "luxury_vendor"
  | "discreet_black_market"
  | "armored_unit"
  | "smart_vendor"
  | "hidden_wall_unit"
  | "mobile_vendor"
  | "fake_broken_front";
export type MachineId = string;
export type VehicleId = string;
export type EmployeeId = string;
export type ContractId = string;
export type LocationId = string;
export type DistrictId = string;
export type PlacementMethod = "legal_contract" | "bribe" | "illegal" | "hidden" | "rival_territory";
export type MachinePlacementStatus = "stored" | "installed";

export interface Vec2 {
  x: number;
  z: number;
}

export interface Bounds2 {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
}

export interface Inventory {
  [productId: string]: number;
}

export interface StockCrate {
  productId: ProductId;
  quantity: number;
  capacity: number;
  source: "supplier" | "garage" | "vehicle";
}

export interface Product {
  id: ProductId;
  name: string;
  category: "drink" | "snack" | "utility" | "meal" | "fictional-grey" | "fictional-contraband";
  cost: number;
  basePrice: number;
  size: number;
  demand: number;
  heat: number;
  legality: 0 | 1 | 2;
  customizable?: boolean;
  demandTags: string[];
  shelfLifeHours?: number;
  description: string;
}

export interface MachineModelDefinition {
  id: MachineModelId;
  name: string;
  description: string;
  baseCost: number;
  maxSlots: number;
  capacityBonus: number;
  durabilityBonus: number;
  securityBonus: number;
  visibilityBonus: number;
  heatMultiplier: number;
  tags: string[];
}

export interface MachineUpgradeEffects {
  damageResistance: number;
  sabotageResistance: number;
  securityBonus: number;
  visibilityBonus: number;
  salesMultiplier: number;
  heatMultiplier: number;
  remoteMonitoring: boolean;
}

export interface MachineUpgradeDefinition {
  id: MachineUpgradeId;
  name: string;
  description: string;
  cost: number;
  effects: Partial<MachineUpgradeEffects>;
}

export type BaseFacilityId =
  | "garage_storage"
  | "warehouse"
  | "office"
  | "cold_storage"
  | "employee_lockers"
  | "security_system"
  | "product_lab"
  | "planning_board"
  | "distribution_center";

export interface BaseFacilityEffects {
  storageCapacity?: number;
  coldStorageProtection?: number;
  employeeCapacity?: number;
  baseSecurity?: number;
  supplierDiscount?: number;
  routeRiskReduction?: number;
  productLabSlots?: number;
  managerSlots?: number;
  frontBusinessIncome?: number;
  planningIntel?: number;
}

export interface BaseFacilityDefinition {
  id: BaseFacilityId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  effectsPerLevel: BaseFacilityEffects;
}

export interface BaseFacilityState {
  id: BaseFacilityId;
  level: number;
  upgradedHour?: number;
}

export interface BaseState {
  facilities: Record<BaseFacilityId, BaseFacilityState>;
  securityReadiness: number;
}

export interface Faction {
  id: FactionId;
  name: string;
  type: "player" | "npc" | "remote-player";
  archetype?: "corporate" | "street_crew" | "black_market" | "former_partner";
  tactic?: string;
  money: number;
  heat: number;
  publicReputation: number;
  streetReputation: number;
  color: string;
}

export interface MachineSlot {
  productId: ProductId;
  quantity: number;
  capacity: number;
  price: number;
  salesAccumulator: number;
}

export interface VendingMachine {
  id: MachineId;
  name: string;
  ownerFactionId: FactionId;
  machineModelId: MachineModelId;
  locationId: LocationId;
  placementStatus: MachinePlacementStatus;
  placementMethod: PlacementMethod;
  slots: MachineSlot[];
  maxSlots: number;
  revenueStored: number;
  damage: number;
  security: number;
  visibility: number;
  heat: number;
  lastServicedHour: number;
  lastInspectedHour?: number;
  upgrades: MachineUpgradeId[];
}

export interface Location {
  id: LocationId;
  districtId: DistrictId;
  name: string;
  kind: "laundromat" | "gym" | "arcade" | "transit" | "corner" | "garage" | "supplier";
  position: Vec2;
  footTraffic: number;
  safety: number;
  policePresence: number;
  rentCost: number;
  placementCost: number;
  rivalPressure: number;
  demandTags: string[];
}

export interface District {
  bounds: Bounds2;
  customerArchetypes: string[];
  description: string;
  id: DistrictId;
  name: string;
  riskFlavor: string;
  heatTolerance: number;
  rentMultiplier: number;
  requiredContractsCompleted: number;
  requiredOwnedMachines: number;
  requiredStreetReputation: number;
  scoutCost: number;
  dominantTags: string[];
  unlockCost: number;
  visualTheme: string;
}

export type DistrictAccess = "locked" | "scouted" | "unlocked";
export type DistrictStatus = "locked" | "available" | "contested" | "controlled";

export interface DistrictProgress {
  access: DistrictAccess;
  districtId: DistrictId;
  scoutedHour?: number;
  unlockedHour?: number;
}

export interface PlayerState {
  factionId: FactionId;
  /**
   * Player-chosen empire identity, shown on the shareable run card and surfaced
   * in-fiction. Optional so pre-existing saves migrate cleanly (undefined =>
   * the game falls back to a default label).
   */
  empireName?: string;
  /**
   * Accumulated unpaid obligations (rent, wages, insurance, fines). Drives the
   * insolvency spiral: interest accrues, then creditors repossess machines and,
   * at rock bottom, the empire collapses. Optional for clean save migration.
   */
  arrears?: number;
  activeVehicleId: VehicleId;
  currentLocationId: LocationId | null;
  /**
   * Legacy free-form cargo bucket. New logistics uses carriedCrate and garageStorage,
   * but this remains for save migration and defensive compatibility.
   */
  cargo: Inventory;
  cargoCapacity: number;
  carriedCrate: StockCrate | null;
  garageStorage: Inventory;
  garageCapacity: number;
}

export interface RouteVehicle {
  id: VehicleId;
  name: string;
  locationId: LocationId;
  position?: Vec2;
  heading?: number;
  odometer?: number;
  inventory: Inventory;
  capacity: number;
  security: number;
  speed: number;
  escapeRating: number;
  condition: number;
  upgrades?: VehicleUpgradeId[];
}

export interface RoutePlanState {
  selectedTaskId: string | null;
}

export type ServiceContractStatus = "active" | "completed" | "failed";

export interface ServiceContract {
  id: ContractId;
  title: string;
  locationId: LocationId;
  productId: ProductId;
  requiredQuantity: number;
  deliveredQuantity: number;
  issuedHour: number;
  deadlineHour: number;
  rewardMoney: number;
  rewardPublicReputation: number;
  rewardStreetReputation: number;
  failureHeat: number;
  failureRivalPressure: number;
  status: ServiceContractStatus;
  completedHour?: number;
  failedHour?: number;
}

export interface DayReport {
  id: string;
  day: number;
  startHour: number;
  endHour: number;
  revenueCollected: number;
  machineRevenueStored: number;
  contractRewards: number;
  contractPenalties: number;
  operatingRevenue: number;
  operatingExpenses: number;
  netCashflow: number;
  contractsCompleted: number;
  contractsFailed: number;
  stockSold: number;
  rivalActions: number;
  summary: string;
}

export type DistrictEventKind = "festival" | "weather" | "shortage" | "trend" | "police_surge";

export interface DistrictEvent {
  congestionDelta: number;
  demandMultiplier: number;
  demandTags: string[];
  description: string;
  districtId: DistrictId;
  expiresHour: number;
  heatDelta: number;
  id: string;
  kind: DistrictEventKind;
  productId?: ProductId;
  startedHour: number;
  title: string;
  tone: GameEventTone;
}

export interface ProgressionState {
  contractsCompletedTotal: number;
  nextContractNumber: number;
  lastReportDay: number;
  revenueCollectedToday: number;
  contractRewardsToday: number;
  contractPenaltiesToday: number;
  stockSoldToday: number;
  contractsCompletedToday: number;
  contractsFailedToday: number;
  rivalActionsToday: number;
  productDesignsCompleted: number;
  starterMachinePlaced: boolean;
  starterMachinePlacedHour?: number;
  firstUndercutTriggered: boolean;
  firstRetaliationTriggered: boolean;
}

export interface PacingState {
  nextDangerHour: number;
  firstDangerHour?: number;
  lastDangerHour?: number;
  pendingStarterRetaliation?: {
    earliestHour: number;
    reason: string;
  };
  dangerBeatsToday: number;
  suppressedDangerToday: number;
  ambientEventsToday: number;
  quietWindowsToday: number;
  toastEventsToday: number;
}

export interface RunModifierState {
  id: RunModifierId;
  startedHour: number;
}

export interface MachineTraitState {
  id: MachineTraitId;
  acquiredHour: number;
  source: string;
}

export interface MachineHistoryEvent {
  hour: number;
  message: string;
  tone: GameEventTone;
  type: "placed" | "stocked" | "collected" | "contract" | "alarm" | "trait" | "crew" | "rival";
}

export interface RivalMemoryState {
  alarmConfronted: number;
  disruption: number;
  exposure: number;
  expansion: number;
  factionId: FactionId;
  lastInteractionHour?: number;
  negotiation: number;
  sabotage: number;
  undercut: number;
}

export interface RunLegacyState {
  // Strategy unlocks carried from the previous run (New Game Plus perks).
  unlocks: string[];
  // The previous run's loudest rivalry, whose grudge persists into this run.
  rivalFactionId?: FactionId;
  // How many completed runs precede this one (1 = second run, etc.).
  runCount: number;
  // Starting cash bonus granted from the legacy, for display/recap.
  startingBonus: number;
}

export interface ReplayState {
  runSeed: number;
  modifier: RunModifierState;
  machineHistory: Record<MachineId, MachineHistoryEvent[]>;
  machineTraits: Record<MachineId, MachineTraitState[]>;
  rivalMemory: Record<FactionId, RivalMemoryState>;
  strategyUnlocks: string[];
  // Present only on New Game Plus runs seeded from a prior run's legacy.
  legacy?: RunLegacyState;
}

export type FinanceLedgerCategory =
  | "sales"
  | "contracts"
  | "stock"
  | "wages"
  | "fuel"
  | "maintenance"
  | "rent"
  | "insurance"
  | "fines"
  | "upgrades"
  | "fleet"
  | "rights"
  | "front_business"
  | "sabotage"
  | "base"
  | "empire";

export interface FinanceLedgerEntry {
  id: string;
  hour: number;
  category: FinanceLedgerCategory;
  amount: number;
  description: string;
}

export type InsurancePlan = "none" | "basic" | "premium";

export interface FinanceState {
  ledger: FinanceLedgerEntry[];
  nextEntryNumber: number;
  revenueToday: number;
  expensesToday: number;
  frontBusinessRevenueToday: number;
  insurancePlan: InsurancePlan;
}

export interface SupplyMarketState {
  nextVolatilityHour: number;
  volatility: number;
  priceMultipliers: Partial<Record<ProductId, number>>;
  supplierMood: "stable" | "discount" | "scarce" | "blackout";
  suppliers: Record<string, SupplierRelationshipState>;
  activeDeals: Record<string, SupplierDealState>;
}

export type SupplierDealKind = "bulk_discount" | "exclusive_pipeline" | "quiet_manifest" | "rush_delivery";

export interface SupplierRelationshipState {
  blackMarketTier: number;
  dealCooldownUntil: number;
  id: string;
  loyalty: number;
  negotiatedDiscount: number;
  scamRisk: number;
  trust: number;
  unlocked: boolean;
  unlockedProductIds: ProductId[];
}

export interface SupplierDealState {
  expiresHour: number;
  id: string;
  kind: SupplierDealKind;
  supplierId: string;
  value: number;
}

export interface PoliceCheckpoint {
  id: string;
  locationId: LocationId;
  severity: number;
  expiresHour: number;
}

export interface TrafficState {
  nextTrafficHour: number;
  congestionByLocation: Record<LocationId, number>;
  fuelPrice: number;
  checkpoints: Record<string, PoliceCheckpoint>;
  vehicleMaintenanceDue: Record<VehicleId, number>;
}

export type ProductCustomizationMode = "value_pack" | "premium_wrap" | "discreet_label";
export type ProductPackageStyle = "budget_sleeve" | "premium_wrap" | "stealth_label";
export type ProductBrandTone = "value" | "premium" | "discreet";

export interface ProductCustomization {
  brandName: string;
  brandRecognition: number;
  brandTone: ProductBrandTone;
  colorway: string;
  designScore: number;
  productId: ProductId;
  mode: ProductCustomizationMode;
  demandBonus: number;
  costDelta: number;
  heatDelta: number;
  packageAppeal: number;
  packageStyle: ProductPackageStyle;
  riskMasking: number;
  tagline: string;
  createdHour: number;
}

export interface SpoilageState {
  nextSpoilageHour: number;
  spoiledToday: number;
}

export interface MachineFleetState {
  modelExperience: Partial<Record<MachineModelId, number>>;
  procurementSequence: number;
  totalPurchased: number;
  unlockedModelIds: MachineModelId[];
  vendorReputation: number;
}

export type CustomerDecisionOutcome = "purchase" | "walkaway" | "complaint" | "tipoff";

export interface CustomerDecision {
  archetypeId: string;
  hour: number;
  id: string;
  locationId: LocationId;
  machineId?: MachineId;
  outcome: CustomerDecisionOutcome;
  productId?: ProductId;
  reason: string;
  satisfaction: number;
  spend?: number;
}

export interface CustomerMarketState {
  complaintsByLocation: Record<LocationId, number>;
  decisionSequence: number;
  loyaltyByLocation: Record<LocationId, number>;
  nextDecisionHour: number;
  recentDecisions: CustomerDecision[];
}

export type LocationPermitStatus = "none" | "pending" | "active" | "challenged" | "revoked";
export type LocationRightsTier = "none" | "handshake" | "standard_permit" | "exclusive" | "corporate_shell";
export type LocationRightsApproach = "landlord_meeting" | "permit_filing" | "exclusive_contract" | "corporate_shell";

export interface LocationRightsState {
  corporatePressure: number;
  exclusiveContractHolderId?: FactionId;
  exclusiveUntilHour?: number;
  landlordDisposition: number;
  lastNegotiatedHour?: number;
  legalPressure: number;
  locationId: LocationId;
  permitExpiresHour?: number;
  permitId?: string;
  permitStatus: LocationPermitStatus;
  rightsTier: LocationRightsTier;
}

export interface EconomyState {
  finance: FinanceState;
  supply: SupplyMarketState;
  traffic: TrafficState;
  spoilage: SpoilageState;
  fleet: MachineFleetState;
  customers: CustomerMarketState;
  districtEvents: {
    activeEvents: Record<string, DistrictEvent>;
    eventSequence: number;
    nextEventHour: number;
  };
  locationRights: Record<LocationId, LocationRightsState>;
  productCustomizations: Partial<Record<ProductId, ProductCustomization>>;
}

export interface NpcController {
  factionId: FactionId;
  aggression: number;
  lastActedHour: number;
  cooldownHours: number;
  /** World hour of this rival's last successful sabotage; gates sabotage frequency. */
  lastSabotagedHour?: number;
  /** Minimum world hours between sabotage attempts so machine attacks stay rare. */
  sabotageCooldownHours?: number;
}

export type MachineAlarmKind = "sabotage" | "undercut" | "tamper";
export type MachineAlarmOutcome = "confronted" | "missed";

export interface MachineAlarm {
  id: string;
  kind: MachineAlarmKind;
  machineId: MachineId;
  locationId: LocationId;
  intruderFactionId: FactionId;
  startedHour: number;
  expiresHour: number;
  intensity: number;
  resolved: boolean;
  resolvedHour?: number;
  outcome?: MachineAlarmOutcome;
}

export type LawInspectionStatus = "active" | "resolved" | "missed";
export type LawInspectionResolution = "show_permit" | "pay_fine" | "bribe";

export interface LawInspection {
  id: string;
  machineId: MachineId;
  locationId: LocationId;
  startedHour: number;
  deadlineHour: number;
  severity: number;
  status: LawInspectionStatus;
  fine: number;
  confiscatedUnits: number;
  reason: string;
  resolvedHour?: number;
  resolution?: LawInspectionResolution;
}

export interface LawState {
  inspectionSequence: number;
  nextInspectionHour: number;
  activeInspections: Record<string, LawInspection>;
  inspectionsToday: number;
  finesToday: number;
  confiscatedUnitsToday: number;
  lastInspectionHour: number;
}

export type ConflictEventKind = "route_ambush" | "base_raid" | "street_chase";
export type ConflictEventStatus = "active" | "resolved" | "missed";
export type ConflictResolution = "melee" | "drive_escape" | "remote_lockdown";
export type PlayerConflictAction = "strike" | "dodge" | "tool" | "push_escape";

export interface ConflictEncounterState {
  advantage: number;
  chaseProgress: number;
  enemyFocus: number;
  enemyHealth: number;
  playerHealth: number;
  playerStamina: number;
}

export interface ConflictEvent {
  id: string;
  kind: ConflictEventKind;
  locationId: LocationId;
  threatFactionId: FactionId;
  startedHour: number;
  expiresHour: number;
  intensity: number;
  status: ConflictEventStatus;
  message: string;
  encounter?: ConflictEncounterState;
  targetMachineId?: MachineId;
  resolvedHour?: number;
  resolution?: ConflictResolution;
}

export interface ConflictState {
  eventSequence: number;
  nextConflictHour: number;
  activeEvents: Record<string, ConflictEvent>;
  resolvedToday: number;
  missedToday: number;
}

export type CrimeContactAction = "buy_tip" | "arrange_bribe" | "source_contraband";
export type RivalOperationKind = "price_war" | "permit_pressure" | "sabotage_cell" | "grey_supply" | "expansion";
export type RivalRelationship = "hostile" | "tense" | "truce" | "pressured";
export type RivalOperationApproach = "negotiate" | "expose" | "disrupt";

export interface RivalOperation {
  districtId: DistrictId;
  exposed: boolean;
  factionId: FactionId;
  id: string;
  kind: RivalOperationKind;
  locationId: LocationId;
  progress: number;
  resolvedHour?: number;
  startedHour: number;
  strength: number;
}

export interface RivalOrganizationState {
  agenda: string;
  bossName: string;
  factionId: FactionId;
  headquartersLocationId: LocationId;
  leverage: number;
  operations: RivalOperation[];
  relationship: RivalRelationship;
  storyStage: number;
  truceUntilHour?: number;
}

export interface PlacementQuote {
  method: PlacementMethod;
  label: string;
  cost: number;
  heatDelta: number;
  visibilityDelta: number;
  securityDelta: number;
  publicReputationDelta: number;
  streetReputationDelta: number;
  rivalPressureDelta: number;
  inspectionRiskLabel: "low" | "medium" | "high" | "extreme";
  description: string;
}

export type EmployeeRole = "restocker" | "collector" | "technician" | "guard" | "scout" | "negotiator" | "runner" | "regional_manager";
export type EmployeeStatus = "idle" | "working" | "blocked";
export type EmployeeRoutePhase = "idle" | "restock" | "collect" | "repair" | "patrol" | "scout" | "negotiate" | "manage";

export interface Employee {
  assignedMachineIds: MachineId[];
  betrayed?: boolean;
  criminalTolerance: number;
  employeeNumber: number;
  fear: number;
  id: EmployeeId;
  lastWorkedHour: number;
  lastLocationId?: LocationId;
  level: number;
  loyalty: number;
  name: string;
  reliability: number;
  role: EmployeeRole;
  routePhase?: EmployeeRoutePhase;
  routeTargetLocationId?: LocationId;
  skill: number;
  speed: number;
  status: EmployeeStatus;
  statusDetail: string;
  trait?: string;
  traitDescription?: string;
  wagePerDay: number;
  xp: number;
}

export type GameEventTone = "neutral" | "good" | "warning" | "danger";

export interface GameEvent {
  id: string;
  hour: number;
  tone: GameEventTone;
  message: string;
  /**
   * Optional specific audio cue trigger (e.g. "event.festival") for events whose
   * designed sound isn't captured by the four generic tones. When absent, the UI
   * falls back to playing the tone-based cue.
   */
  audioCue?: string;
}

export type StreetActivityKind =
  | "customer_purchase"
  | "machine_sale"
  | "customer_complaint"
  | "customer_walkaway"
  | "customer_tipoff"
  | "rival_scout"
  | "worker_supply"
  | "employee_route"
  | "chase"
  | "base_watch";
export type StreetActivityActor = "customer" | "rival" | "worker" | "employee" | "scout" | "guard" | "driver";

export interface StreetActivity {
  id: string;
  hour: number;
  kind: StreetActivityKind;
  actor: StreetActivityActor;
  locationId: LocationId;
  machineId?: MachineId;
  productId?: ProductId;
  amount?: number;
  message: string;
  tone: GameEventTone;
}

export interface StreetLifeState {
  activitySequence: number;
  nextActivityHour: number;
  recentActivities: StreetActivity[];
}

export interface MissionState {
  id: string;
  title: string;
  completed: boolean;
  campaign: Record<string, CampaignMissionState>;
  quests: Record<string, NarrativeQuestState>;
}

export interface CampaignMissionState {
  arcId: string;
  activeStepId: string;
  completed: boolean;
  completedHour?: number;
  completedStepIds: string[];
  unlockedHour: number;
}

export type EmpireAssetId = "warehouse_network" | "regional_office" | "front_business" | "shell_company" | "political_contacts";
export type EmpireRaidStatus = "active" | "resolved" | "missed";
export type EmpireRaidResolution = "legal_team" | "security_response" | "political_favor";
export type EndingExecutionStatus = "locked" | "available" | "executed";

export interface EmpireAssetState {
  id: EmpireAssetId;
  lastUpgradedHour?: number;
  level: number;
}

export interface EmpireRaid {
  deadlineHour: number;
  id: string;
  message: string;
  resolvedHour?: number;
  resolution?: EmpireRaidResolution;
  severity: number;
  startedHour: number;
  status: EmpireRaidStatus;
  targetAssetId?: EmpireAssetId;
}

export interface EndingExecutionState {
  executedHour?: number;
  pathId: string;
  status: EndingExecutionStatus;
  summary?: string;
}

export interface EmpireState {
  activeRaids: Record<string, EmpireRaid>;
  assets: Record<EmpireAssetId, EmpireAssetState>;
  endingExecutions: Record<string, EndingExecutionState>;
  legitimacy: number;
  nextRaidHour: number;
  politicalPressure: number;
  raidSequence: number;
  shellCover: number;
}

export type NarrativeQuestStatus = "available" | "active" | "completed" | "failed";

export interface NarrativeQuestState {
  activeStepId: string;
  choiceHistory: string[];
  completedHour?: number;
  completedStepIds: string[];
  dialogueLog: Array<{
    choiceId?: string;
    hour: number;
    speaker: string;
    text: string;
  }>;
  id: string;
  startedHour?: number;
  status: NarrativeQuestStatus;
}

export interface GameState {
  version: number;
  worldTimeHours: number;
  eventSequence: number;
  nextMachineNumber: number;
  nextEmployeeNumber: number;
  playerFactionId: FactionId;
  player: PlayerState;
  factions: Record<FactionId, Faction>;
  products: Record<ProductId, Product>;
  districts: Record<DistrictId, District>;
  districtProgress: Record<DistrictId, DistrictProgress>;
  locations: Record<LocationId, Location>;
  machines: Record<MachineId, VendingMachine>;
  vehicles: Record<VehicleId, RouteVehicle>;
  employees: Record<EmployeeId, Employee>;
  contracts: Record<ContractId, ServiceContract>;
  base: BaseState;
  economy: EconomyState;
  npcControllers: Record<FactionId, NpcController>;
  machineAlarms: Record<string, MachineAlarm>;
  law: LawState;
  conflict: ConflictState;
  rivalOrganizations: Record<FactionId, RivalOrganizationState>;
  empire: EmpireState;
  eventLog: GameEvent[];
  streetLife: StreetLifeState;
  mission: MissionState;
  routePlan: RoutePlanState;
  dayReports: DayReport[];
  progression: ProgressionState;
  pacing: PacingState;
  replay: ReplayState;
}

export type GameCommand =
  | { type: "advance_time"; actorId: FactionId; hours: number }
  | { type: "set_player_location"; actorId: FactionId; locationId: LocationId | null }
  | { type: "buy_product"; actorId: FactionId; productId: ProductId; quantity: number }
  | { type: "deposit_crate"; actorId: FactionId }
  | { type: "load_crate"; actorId: FactionId; productId: ProductId; quantity: number }
  | { type: "load_vehicle"; actorId: FactionId; vehicleId: VehicleId; productId: ProductId; quantity: number }
  | { type: "unload_vehicle"; actorId: FactionId; vehicleId: VehicleId; productId: ProductId; quantity: number }
  | { type: "take_vehicle_crate"; actorId: FactionId; vehicleId: VehicleId; productId: ProductId; quantity: number }
  | { type: "dispatch_vehicle"; actorId: FactionId; vehicleId: VehicleId; locationId: LocationId }
  | { type: "drive_vehicle"; actorId: FactionId; vehicleId: VehicleId; position: Vec2; heading: number; distance: number }
  | { type: "select_route_task"; actorId: FactionId; taskId: string | null }
  | { type: "scout_district"; actorId: FactionId; districtId: DistrictId }
  | { type: "unlock_district"; actorId: FactionId; districtId: DistrictId }
  | { type: "upgrade_base_facility"; actorId: FactionId; facilityId: BaseFacilityId }
  | { type: "set_insurance_plan"; actorId: FactionId; plan: InsurancePlan }
  | { type: "service_vehicle"; actorId: FactionId; vehicleId: VehicleId }
  | { type: "install_vehicle_upgrade"; actorId: FactionId; vehicleId: VehicleId; upgradeId: VehicleUpgradeId }
  | { type: "buy_machine_model"; actorId: FactionId; modelId: MachineModelId; quantity: number }
  | { type: "sell_stored_machine"; actorId: FactionId; machineId: MachineId }
  | { type: "customize_product"; actorId: FactionId; productId: ProductId; mode: ProductCustomizationMode }
  | { type: "set_empire_name"; actorId: FactionId; name: string }
  | { type: "hire_employee"; actorId: FactionId; role: EmployeeRole }
  | { type: "assign_employee"; actorId: FactionId; employeeId: EmployeeId; machineId: MachineId; assigned: boolean }
  | { type: "stock_machine"; actorId: FactionId; machineId: MachineId; productId: ProductId; quantity: number }
  | { type: "collect_revenue"; actorId: FactionId; machineId: MachineId }
  | { type: "repair_machine"; actorId: FactionId; machineId: MachineId }
  | { type: "place_machine"; actorId: FactionId; locationId: LocationId; method?: PlacementMethod; machineId?: MachineId }
  | { type: "set_slot_price"; actorId: FactionId; machineId: MachineId; productId: ProductId; price: number }
  | { type: "install_upgrade"; actorId: FactionId; machineId: MachineId; upgradeId: MachineUpgradeId }
  | { type: "sabotage_machine"; actorId: FactionId; machineId: MachineId }
  | { type: "confront_alarm"; actorId: FactionId; alarmId: string }
  | { type: "resolve_conflict_event"; actorId: FactionId; eventId: string; resolution: ConflictResolution }
  | { type: "player_conflict_action"; actorId: FactionId; eventId: string; action: PlayerConflictAction }
  | { type: "resolve_inspection"; actorId: FactionId; inspectionId: string; resolution: LawInspectionResolution }
  | { type: "work_crime_contact"; actorId: FactionId; contactId: string; action: CrimeContactAction }
  | { type: "negotiate_location_rights"; actorId: FactionId; locationId: LocationId; approach: LocationRightsApproach }
  | { type: "pressure_rival_operation"; actorId: FactionId; operationId: string; approach: RivalOperationApproach }
  | { type: "upgrade_empire_asset"; actorId: FactionId; assetId: EmpireAssetId }
  | { type: "resolve_major_raid"; actorId: FactionId; raidId: string; resolution: EmpireRaidResolution }
  | { type: "execute_ending"; actorId: FactionId; pathId: string }
  | { type: "negotiate_supplier_deal"; actorId: FactionId; supplierId: string; dealKind: SupplierDealKind }
  | { type: "start_quest"; actorId: FactionId; questId: string }
  | { type: "choose_quest_dialogue"; actorId: FactionId; questId: string; choiceId: string }
  | { type: "debug_grant_cash"; actorId: FactionId; amount: number }
  | { type: "debug_complete_requirements"; actorId: FactionId }
  | { type: "debug_set_district_access"; actorId: FactionId; districtId: DistrictId; access: DistrictAccess }
  | { type: "debug_set_rival_pressure"; actorId: FactionId; locationId: LocationId; amount: number }
  | { type: "debug_spawn_activity"; actorId: FactionId; activity: StreetActivityKind }
  | { type: "rival_action"; actorId: FactionId; action: "undercut" | "sabotage" | "expand"; targetMachineId?: MachineId; locationId?: LocationId };

export interface CommandResult {
  state: GameState;
  events: GameEvent[];
}
