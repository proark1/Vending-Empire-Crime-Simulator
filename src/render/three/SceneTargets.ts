import type { LocationId, MachineId } from "../../game/core/types";

export type SceneTarget =
  | { type: "base"; id: "garage"; label: string }
  | { type: "supplier"; id: "supplier"; label: string }
  | { type: "machine"; id: MachineId; label: string }
  | { type: "placement"; id: LocationId; label: string };
