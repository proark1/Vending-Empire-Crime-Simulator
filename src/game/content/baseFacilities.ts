import type { BaseFacilityDefinition, BaseFacilityId, BaseFacilityState } from "../core/types";

export const baseFacilities: Record<BaseFacilityId, BaseFacilityDefinition> = {
  garage_storage: {
    id: "garage_storage",
    name: "Garage Storage",
    description: "Shelving, dollies, and labeled bays for route stock.",
    maxLevel: 4,
    baseCost: 80,
    costGrowth: 1.65,
    effectsPerLevel: {
      storageCapacity: 90
    }
  },
  warehouse: {
    id: "warehouse",
    name: "Warehouse",
    description: "Bulk overflow storage and loading lanes for larger routes.",
    maxLevel: 3,
    baseCost: 180,
    costGrowth: 1.9,
    effectsPerLevel: {
      storageCapacity: 160,
      routeRiskReduction: 0.03
    }
  },
  office: {
    id: "office",
    name: "Office",
    description: "Cleaner books, landlord calls, and front-business paperwork.",
    maxLevel: 3,
    baseCost: 150,
    costGrowth: 1.8,
    effectsPerLevel: {
      frontBusinessIncome: 20,
      planningIntel: 0.04
    }
  },
  cold_storage: {
    id: "cold_storage",
    name: "Cold Storage",
    description: "Fridges and insulated racks that slow spoilage for drinks, meals, and fresh stock.",
    maxLevel: 3,
    baseCost: 145,
    costGrowth: 1.75,
    effectsPerLevel: {
      coldStorageProtection: 0.22,
      storageCapacity: 40
    }
  },
  employee_lockers: {
    id: "employee_lockers",
    name: "Employee Lockers",
    description: "Crew space, lockers, and dispatch boards for a larger staff.",
    maxLevel: 3,
    baseCost: 120,
    costGrowth: 1.7,
    effectsPerLevel: {
      employeeCapacity: 2
    }
  },
  security_system: {
    id: "security_system",
    name: "Security Systems",
    description: "Cameras, shutters, and alarms that make raids and betrayal costlier for rivals.",
    maxLevel: 4,
    baseCost: 170,
    costGrowth: 1.75,
    effectsPerLevel: {
      baseSecurity: 0.14,
      routeRiskReduction: 0.02
    }
  },
  product_lab: {
    id: "product_lab",
    name: "Product Lab",
    description: "A back-room bench for custom packaging, private labels, and discreet variants.",
    maxLevel: 3,
    baseCost: 165,
    costGrowth: 1.85,
    effectsPerLevel: {
      productLabSlots: 2,
      supplierDiscount: 0.025
    }
  },
  planning_board: {
    id: "planning_board",
    name: "Planning Board",
    description: "Pinned maps, route notes, and lookout schedules that reveal risk before the van leaves.",
    maxLevel: 3,
    baseCost: 110,
    costGrowth: 1.6,
    effectsPerLevel: {
      planningIntel: 0.08,
      routeRiskReduction: 0.045
    }
  },
  distribution_center: {
    id: "distribution_center",
    name: "Distribution Center",
    description: "A larger loading hub that supports regional managers and safer multi-district routing.",
    maxLevel: 3,
    baseCost: 260,
    costGrowth: 2,
    effectsPerLevel: {
      managerSlots: 1,
      routeRiskReduction: 0.06,
      storageCapacity: 120
    }
  }
};

export const baseFacilityList = Object.values(baseFacilities);

export function createInitialBaseFacilities(): Record<BaseFacilityId, BaseFacilityState> {
  return Object.fromEntries(
    baseFacilityList.map((facility) => [
      facility.id,
      {
        id: facility.id,
        level: facility.id === "garage_storage" ? 1 : 0,
        upgradedHour: facility.id === "garage_storage" ? 8 : undefined
      }
    ])
  ) as Record<BaseFacilityId, BaseFacilityState>;
}

