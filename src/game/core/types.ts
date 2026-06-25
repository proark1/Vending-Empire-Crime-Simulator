export type FactionId = "player" | "rival_redline" | string;
export type ProductId = "soda" | "chips" | "energy" | "mystery_capsules";
export type MachineUpgradeId = "reinforced_glass" | "smart_lock" | "security_camera" | "cashless_terminal" | "neon_sign" | "remote_monitor";
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
  category: "drink" | "snack" | "utility" | "fictional-grey";
  cost: number;
  basePrice: number;
  size: number;
  demand: number;
  heat: number;
  legality: 0 | 1 | 2;
  demandTags: string[];
  description: string;
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

export interface Faction {
  id: FactionId;
  name: string;
  type: "player" | "npc" | "remote-player";
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
  description: string;
  id: DistrictId;
  name: string;
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
  inventory: Inventory;
  capacity: number;
  security: number;
  speed: number;
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
  contractsCompleted: number;
  contractsFailed: number;
  stockSold: number;
  rivalActions: number;
  summary: string;
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
  starterMachinePlaced: boolean;
  firstUndercutTriggered: boolean;
  firstRetaliationTriggered: boolean;
}

export interface NpcController {
  factionId: FactionId;
  aggression: number;
  lastActedHour: number;
  cooldownHours: number;
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

export type EmployeeRole = "restocker" | "collector" | "technician";
export type EmployeeStatus = "idle" | "working" | "blocked";

export interface Employee {
  assignedMachineIds: MachineId[];
  criminalTolerance: number;
  employeeNumber: number;
  fear: number;
  id: EmployeeId;
  lastWorkedHour: number;
  loyalty: number;
  name: string;
  reliability: number;
  role: EmployeeRole;
  skill: number;
  speed: number;
  status: EmployeeStatus;
  statusDetail: string;
  wagePerDay: number;
}

export type GameEventTone = "neutral" | "good" | "warning" | "danger";

export interface GameEvent {
  id: string;
  hour: number;
  tone: GameEventTone;
  message: string;
}

export type StreetActivityKind = "customer_purchase" | "customer_complaint" | "rival_scout" | "worker_supply";
export type StreetActivityActor = "customer" | "rival" | "worker" | "scout";

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
  npcControllers: Record<FactionId, NpcController>;
  machineAlarms: Record<string, MachineAlarm>;
  law: LawState;
  eventLog: GameEvent[];
  streetLife: StreetLifeState;
  mission: MissionState;
  routePlan: RoutePlanState;
  dayReports: DayReport[];
  progression: ProgressionState;
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
  | { type: "select_route_task"; actorId: FactionId; taskId: string | null }
  | { type: "scout_district"; actorId: FactionId; districtId: DistrictId }
  | { type: "unlock_district"; actorId: FactionId; districtId: DistrictId }
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
  | { type: "resolve_inspection"; actorId: FactionId; inspectionId: string; resolution: LawInspectionResolution }
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
