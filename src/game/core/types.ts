export type FactionId = "player" | "rival_redline" | string;
export type ProductId = "soda" | "chips" | "energy" | "mystery_capsules";
export type MachineUpgradeId = "reinforced_glass" | "smart_lock" | "security_camera" | "cashless_terminal" | "neon_sign" | "remote_monitor";
export type MachineId = string;
export type LocationId = string;
export type DistrictId = string;

export interface Vec2 {
  x: number;
  z: number;
}

export interface Inventory {
  [productId: string]: number;
}

export interface StockCrate {
  productId: ProductId;
  quantity: number;
  capacity: number;
  source: "supplier" | "garage";
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
  slots: MachineSlot[];
  maxSlots: number;
  revenueStored: number;
  damage: number;
  security: number;
  visibility: number;
  heat: number;
  lastServicedHour: number;
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
  id: DistrictId;
  name: string;
  heatTolerance: number;
  rentMultiplier: number;
  dominantTags: string[];
}

export interface PlayerState {
  factionId: FactionId;
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

export interface NpcController {
  factionId: FactionId;
  aggression: number;
  lastActedHour: number;
  cooldownHours: number;
}

export type GameEventTone = "neutral" | "good" | "warning" | "danger";

export interface GameEvent {
  id: string;
  hour: number;
  tone: GameEventTone;
  message: string;
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
  playerFactionId: FactionId;
  player: PlayerState;
  factions: Record<FactionId, Faction>;
  products: Record<ProductId, Product>;
  districts: Record<DistrictId, District>;
  locations: Record<LocationId, Location>;
  machines: Record<MachineId, VendingMachine>;
  npcControllers: Record<FactionId, NpcController>;
  eventLog: GameEvent[];
  mission: MissionState;
}

export type GameCommand =
  | { type: "advance_time"; actorId: FactionId; hours: number }
  | { type: "buy_product"; actorId: FactionId; productId: ProductId; quantity: number }
  | { type: "deposit_crate"; actorId: FactionId }
  | { type: "load_crate"; actorId: FactionId; productId: ProductId; quantity: number }
  | { type: "stock_machine"; actorId: FactionId; machineId: MachineId; productId: ProductId; quantity: number }
  | { type: "collect_revenue"; actorId: FactionId; machineId: MachineId }
  | { type: "repair_machine"; actorId: FactionId; machineId: MachineId }
  | { type: "place_machine"; actorId: FactionId; locationId: LocationId }
  | { type: "set_slot_price"; actorId: FactionId; machineId: MachineId; productId: ProductId; price: number }
  | { type: "install_upgrade"; actorId: FactionId; machineId: MachineId; upgradeId: MachineUpgradeId }
  | { type: "sabotage_machine"; actorId: FactionId; machineId: MachineId }
  | { type: "rival_action"; actorId: FactionId; action: "undercut" | "sabotage" | "expand"; targetMachineId?: MachineId; locationId?: LocationId };

export interface CommandResult {
  state: GameState;
  events: GameEvent[];
}
