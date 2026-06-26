import type { GameEventTone, LocationId, MachineId, ProductId, VehicleId } from "../../game/core/types";

export type SceneTarget =
  | { type: "base"; id: "garage"; label: string }
  | { type: "supplier"; id: "supplier"; label: string }
  | { type: "machine"; id: MachineId; label: string }
  | { type: "placement"; id: LocationId; label: string }
  | { type: "vehicle"; id: VehicleId; label: string }
  | { type: "neighborhood"; id: string; label: string }
  | { type: "crime_contact"; id: string; label: string }
  | { type: "rival_operation"; id: string; label: string };

export type SceneFeedbackKind =
  | "pickup"
  | "store"
  | "stock"
  | "install"
  | "cash"
  | "repair"
  | "upgrade"
  | "sabotage"
  | "fight"
  | "vehicle"
  | "scout"
  | "district"
  | "melee"
  | "escape"
  | "lockdown";

export interface SceneFeedbackEvent {
  amount?: number;
  id: string;
  kind: SceneFeedbackKind;
  locationId?: LocationId;
  machineId?: MachineId;
  productId?: ProductId;
  tone?: GameEventTone;
}
