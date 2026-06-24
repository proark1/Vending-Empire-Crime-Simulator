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
  }
};

export const employeeRoleList = Object.values(employeeRoles);

