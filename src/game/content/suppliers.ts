import type { ProductId, SupplierDealKind } from "../core/types";

export type SupplierUnlockRequirement =
  | { kind: "always" }
  | { districtId: string; kind: "district_scouted" | "district_unlocked" }
  | { facilityId: string; kind: "base_facility"; level: number }
  | { kind: "street_reputation"; value: number }
  | { kind: "public_reputation"; value: number };

export interface SupplierDefinition {
  baseProducts: ProductId[];
  description: string;
  id: string;
  label: string;
  scamRisk: number;
  unlockRequirement: SupplierUnlockRequirement;
  uniqueProducts: ProductId[];
}

export interface SupplierDealDefinition {
  cost: number;
  heatDelta: number;
  kind: SupplierDealKind;
  label: string;
  loyaltyGain: number;
  trustGain: number;
  value: number;
}

export const supplierDefinitions: SupplierDefinition[] = [
  {
    id: "backdoor_wholesale",
    label: "Backdoor Wholesale",
    description: "Reliable starter stock and route basics. Better loyalty means cheaper staples.",
    baseProducts: ["soda", "chips", "water", "energy"],
    uniqueProducts: ["protein_bar", "coffee_can"],
    scamRisk: 0.04,
    unlockRequirement: { kind: "always" }
  },
  {
    id: "cold_chain_union",
    label: "Cold Chain Union",
    description: "Perishable drinks, meals, and bulk refrigeration paperwork for warehouse-scale routes.",
    baseProducts: ["water", "coffee_can", "instant_noodles"],
    uniqueProducts: ["hygiene_kit", "luxury_snack"],
    scamRisk: 0.08,
    unlockRequirement: { facilityId: "warehouse", kind: "base_facility", level: 1 }
  },
  {
    id: "medallion_imports",
    label: "Medallion Imports",
    description: "Cleaner downtown goods, office tower packaging, and higher-margin legitimate stock.",
    baseProducts: ["phone_charger", "umbrella", "hygiene_kit"],
    uniqueProducts: ["luxury_snack"],
    scamRisk: 0.06,
    unlockRequirement: { districtId: "downtown_loop", kind: "district_scouted" }
  },
  {
    id: "night_market_broker",
    label: "Night Market Broker",
    description: "Fiction-only grey products, scams, quiet manifests, and black-market unlock chains.",
    baseProducts: ["mystery_capsules", "mood_fizz", "glitch_gum"],
    uniqueProducts: ["night_syrup", "focus_cubes"],
    scamRisk: 0.18,
    unlockRequirement: { districtId: "neon_quarter", kind: "district_scouted" }
  }
];

export const supplierDeals: Record<SupplierDealKind, SupplierDealDefinition> = {
  bulk_discount: {
    kind: "bulk_discount",
    label: "Bulk discount",
    cost: 55,
    value: 0.035,
    loyaltyGain: 10,
    trustGain: 6,
    heatDelta: 0
  },
  exclusive_pipeline: {
    kind: "exclusive_pipeline",
    label: "Exclusive pipeline",
    cost: 90,
    value: 1,
    loyaltyGain: 15,
    trustGain: 8,
    heatDelta: 0.6
  },
  quiet_manifest: {
    kind: "quiet_manifest",
    label: "Quiet manifest",
    cost: 75,
    value: 0.08,
    loyaltyGain: 8,
    trustGain: 12,
    heatDelta: -0.9
  },
  rush_delivery: {
    kind: "rush_delivery",
    label: "Rush delivery",
    cost: 65,
    value: 10,
    loyaltyGain: 7,
    trustGain: 5,
    heatDelta: 0.2
  }
};
