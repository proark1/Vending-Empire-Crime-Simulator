import type { EmpireAssetId } from "../core/types";

export interface EmpireAssetEffects {
  frontBusinessIncome?: number;
  legitimacy?: number;
  politicalPressureReduction?: number;
  regionalManagerSlots?: number;
  routeRiskReduction?: number;
  shellCover?: number;
  storageCapacity?: number;
}

export interface EmpireAssetDefinition {
  baseCost: number;
  costGrowth: number;
  description: string;
  effectsPerLevel: EmpireAssetEffects;
  id: EmpireAssetId;
  maxLevel: number;
  name: string;
}

export const empireAssets: Record<EmpireAssetId, EmpireAssetDefinition> = {
  warehouse_network: {
    id: "warehouse_network",
    name: "Warehouse Network",
    description: "Regional overflow depots, loading lanes, and cold route staging for long-term scale.",
    maxLevel: 4,
    baseCost: 420,
    costGrowth: 1.85,
    effectsPerLevel: {
      storageCapacity: 260,
      routeRiskReduction: 0.045
    }
  },
  regional_office: {
    id: "regional_office",
    name: "Regional Office",
    description: "Dispatch supervisors, territory books, and manager desks for multi-district automation.",
    maxLevel: 3,
    baseCost: 520,
    costGrowth: 1.9,
    effectsPerLevel: {
      regionalManagerSlots: 1,
      routeRiskReduction: 0.04,
      legitimacy: 4
    }
  },
  front_business: {
    id: "front_business",
    name: "Front Businesses",
    description: "Legit storefront contracts that generate daily cover income and cleaner paper trails.",
    maxLevel: 4,
    baseCost: 480,
    costGrowth: 1.8,
    effectsPerLevel: {
      frontBusinessIncome: 38,
      legitimacy: 5
    }
  },
  shell_company: {
    id: "shell_company",
    name: "Shell Companies",
    description: "Layered paperwork that absorbs heat from risky placements and slows inspection escalation.",
    maxLevel: 3,
    baseCost: 620,
    costGrowth: 2,
    effectsPerLevel: {
      shellCover: 0.13,
      politicalPressureReduction: 0.05
    }
  },
  political_contacts: {
    id: "political_contacts",
    name: "Political Pressure Desk",
    description: "Lobbying favors, permit calls, and soft power that can blunt major raids.",
    maxLevel: 3,
    baseCost: 760,
    costGrowth: 2.1,
    effectsPerLevel: {
      politicalPressureReduction: 0.12,
      legitimacy: 3
    }
  }
};

export const empireAssetList = Object.values(empireAssets);
