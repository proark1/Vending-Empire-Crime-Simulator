import type { VehicleUpgradeId } from "../core/types";

export interface VehicleUpgradeDefinition {
  capacityBonus?: number;
  conditionWearMultiplier?: number;
  cost: number;
  description: string;
  escapeBonus?: number;
  id: VehicleUpgradeId;
  label: string;
  securityBonus?: number;
  speedBonus?: number;
}

export const vehicleUpgrades: Record<VehicleUpgradeId, VehicleUpgradeDefinition> = {
  cargo_rack: {
    capacityBonus: 14,
    cost: 42,
    description: "Bolted shelving and crate straps increase route stock capacity.",
    id: "cargo_rack",
    label: "Cargo rack"
  },
  reinforced_locks: {
    cost: 36,
    description: "Better door locks and a cage over the rear windows reduce checkpoint and ambush risk.",
    id: "reinforced_locks",
    label: "Reinforced locks",
    securityBonus: 0.18
  },
  tuned_engine: {
    cost: 48,
    description: "Fresh belts, plugs, and tuning make dispatches faster and chases easier to shake.",
    escapeBonus: 0.12,
    id: "tuned_engine",
    label: "Tuned engine",
    speedBonus: 0.16
  },
  cold_box: {
    conditionWearMultiplier: 0.82,
    cost: 54,
    description: "A cooled cargo box protects perishables and slows vehicle wear on long loops.",
    id: "cold_box",
    label: "Cold box"
  }
};

export const vehicleUpgradeList = Object.values(vehicleUpgrades);
