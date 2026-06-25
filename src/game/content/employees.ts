import type { EmployeeRole } from "../core/types";

export interface EmployeeRoleDefinition {
  criminalTolerance: number;
  description: string;
  fear: number;
  hireCost: number;
  loyalty: number;
  reliability: number;
  role: EmployeeRole;
  skill: number;
  speed: number;
  title: string;
  wagePerDay: number;
}

export const employeeRoles: Record<EmployeeRole, EmployeeRoleDefinition> = {
  restocker: {
    role: "restocker",
    title: "Restocker",
    description: "Runs assigned machines from garage stock and tops off low slots.",
    hireCost: 85,
    wagePerDay: 18,
    speed: 0.92,
    reliability: 0.82,
    loyalty: 0.72,
    fear: 0.32,
    skill: 0.58,
    criminalTolerance: 0.35
  },
  collector: {
    role: "collector",
    title: "Collector",
    description: "Visits assigned machines and pulls cash before it becomes a target.",
    hireCost: 95,
    wagePerDay: 16,
    speed: 1,
    reliability: 0.78,
    loyalty: 0.68,
    fear: 0.38,
    skill: 0.54,
    criminalTolerance: 0.45
  },
  technician: {
    role: "technician",
    title: "Technician",
    description: "Repairs assigned machines and keeps route pressure down.",
    hireCost: 115,
    wagePerDay: 22,
    speed: 0.78,
    reliability: 0.86,
    loyalty: 0.74,
    fear: 0.28,
    skill: 0.72,
    criminalTolerance: 0.28
  },
  guard: {
    role: "guard",
    title: "Guard",
    description: "Patrols assigned machines, lowers rival pressure, and can interrupt active hits.",
    hireCost: 135,
    wagePerDay: 28,
    speed: 0.82,
    reliability: 0.76,
    loyalty: 0.7,
    fear: 0.24,
    skill: 0.66,
    criminalTolerance: 0.58
  },
  scout: {
    role: "scout",
    title: "Scout",
    description: "Maps locked districts and spots new pads before rivals claim them.",
    hireCost: 125,
    wagePerDay: 20,
    speed: 1.08,
    reliability: 0.74,
    loyalty: 0.66,
    fear: 0.34,
    skill: 0.62,
    criminalTolerance: 0.42
  },
  negotiator: {
    role: "negotiator",
    title: "Negotiator",
    description: "Calms landlords, reduces local pressure, and keeps contracts cleaner.",
    hireCost: 150,
    wagePerDay: 26,
    speed: 0.7,
    reliability: 0.8,
    loyalty: 0.72,
    fear: 0.3,
    skill: 0.7,
    criminalTolerance: 0.36
  },
  runner: {
    role: "runner",
    title: "Runner",
    description: "Handles risky stock movement faster than a normal restocker.",
    hireCost: 145,
    wagePerDay: 24,
    speed: 1.18,
    reliability: 0.7,
    loyalty: 0.64,
    fear: 0.42,
    skill: 0.6,
    criminalTolerance: 0.72
  },
  regional_manager: {
    role: "regional_manager",
    title: "Regional Manager",
    description: "Coordinates a district, improves crew consistency, and steers routes away from danger.",
    hireCost: 260,
    wagePerDay: 42,
    speed: 0.66,
    reliability: 0.88,
    loyalty: 0.78,
    fear: 0.22,
    skill: 0.76,
    criminalTolerance: 0.4
  }
};

export const employeeRoleList = Object.values(employeeRoles);
