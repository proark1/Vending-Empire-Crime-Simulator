import type { GameState, VendingMachine } from "./types";
import {
  activeLawInspections,
  activeConflictEvents,
  activeMachineAlarms,
  districtProgress,
  endgamePathScores,
  formatClock,
  installedMachines,
  machineStockUnits,
  missionProgress,
  totalOwnedStockUnits
} from "./selectors";

const BASELINE_START_HOUR = 8;
const ACTIVE_MINUTES_PER_GAME_HOUR = 0.625;

export type PlaytestMilestoneStatus = "complete" | "in_progress" | "blocked" | "not_started";

export interface PlaytestMilestoneReport {
  id: string;
  title: string;
  status: PlaytestMilestoneStatus;
  targetWindow: string;
  evidence: string;
  completedHour?: number;
  completedClock?: string;
  estimatedActiveMinutes?: number;
  timing?: "early" | "inside_target" | "late" | "unmeasured";
}

export interface PlaytestBalanceFlag {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface PlaytestReport {
  exportedAt: string;
  runClock: string;
  worldTimeHours: number;
  estimatedActiveMinutes: number;
  phase: string;
  summary: {
    cash: number;
    heat: number;
    installedMachines: number;
    stockedMachines: number;
    ownedStockUnits: number;
    activeAlarms: number;
    activeInspections: number;
    leadingEnding: string;
    leadingEndingScore: number;
  };
  milestones: PlaytestMilestoneReport[];
  flags: PlaytestBalanceFlag[];
}

function activeMinutesAt(hour: number): number {
  return Math.max(0, Math.round((hour - BASELINE_START_HOUR) * ACTIVE_MINUTES_PER_GAME_HOUR * 10) / 10);
}

function timingFor(minutes: number | undefined, min: number, max: number): PlaytestMilestoneReport["timing"] {
  if (minutes === undefined) {
    return "unmeasured";
  }

  if (minutes < min) {
    return "early";
  }

  if (minutes > max) {
    return "late";
  }

  return "inside_target";
}

function completedContractHour(state: GameState): number | undefined {
  return Object.values(state.contracts)
    .filter((contract) => contract.status === "completed" && typeof contract.completedHour === "number")
    .sort((a, b) => (a.completedHour ?? Number.POSITIVE_INFINITY) - (b.completedHour ?? Number.POSITIVE_INFINITY))[0]?.completedHour;
}

function firstResolvedInspectionHour(state: GameState): number | undefined {
  return Object.values(state.law?.activeInspections ?? {})
    .filter((inspection) => inspection.status === "resolved" && typeof inspection.resolvedHour === "number")
    .sort((a, b) => (a.resolvedHour ?? Number.POSITIVE_INFINITY) - (b.resolvedHour ?? Number.POSITIVE_INFINITY))[0]?.resolvedHour;
}

function firstOwnedMachineInDistrict(state: GameState, districtId: string): VendingMachine | undefined {
  return installedMachines(state, state.playerFactionId).find((machine) => state.locations[machine.locationId]?.districtId === districtId);
}

function firstEmployeeValueHour(state: GameState): number | undefined {
  return Object.values(state.employees)
    .filter((employee) => employee.assignedMachineIds.length > 0 || employee.xp > 0 || employee.lastWorkedHour > BASELINE_START_HOUR)
    .sort((a, b) => Math.min(a.lastWorkedHour || Number.POSITIVE_INFINITY, a.xp > 0 ? a.lastWorkedHour : Number.POSITIVE_INFINITY) - Math.min(b.lastWorkedHour || Number.POSITIVE_INFINITY, b.xp > 0 ? b.lastWorkedHour : Number.POSITIVE_INFINITY))[0]?.lastWorkedHour;
}

function milestone(
  id: string,
  title: string,
  status: PlaytestMilestoneStatus,
  targetWindow: string,
  evidence: string,
  completedHour: number | undefined,
  targetMin: number,
  targetMax: number
): PlaytestMilestoneReport {
  const minutes = typeof completedHour === "number" ? activeMinutesAt(completedHour) : undefined;
  return {
    id,
    title,
    status,
    targetWindow,
    evidence,
    completedHour,
    completedClock: typeof completedHour === "number" ? formatClock(completedHour) : undefined,
    estimatedActiveMinutes: minutes,
    timing: timingFor(minutes, targetMin, targetMax)
  };
}

function currentPhase(state: GameState): string {
  if (Object.values(state.empire?.endingExecutions ?? {}).some((ending) => ending.status === "executed")) {
    return "ending executed";
  }

  if (districtProgress(state, "industrial_yards").access === "unlocked") {
    return firstOwnedMachineInDistrict(state, "industrial_yards") ? "iron yard foothold" : "iron yard open";
  }

  if (state.mission.completed) {
    return "starter complete";
  }

  if (installedMachines(state, state.playerFactionId).length > 0) {
    return "starter route";
  }

  return "pre-route";
}

function playtestFlags(state: GameState, milestones: PlaytestMilestoneReport[]): PlaytestBalanceFlag[] {
  const player = state.factions[state.playerFactionId];
  const playerMachines = installedMachines(state, state.playerFactionId);
  const stockedMachines = playerMachines.filter((machine) => machineStockUnits(machine) > 0);
  const flags: PlaytestBalanceFlag[] = [];

  for (const milestoneReport of milestones) {
    if (milestoneReport.timing === "late") {
      flags.push({
        code: `late_${milestoneReport.id}`,
        severity: "warning",
        message: `${milestoneReport.title} is past the target window.`
      });
    }
  }

  if (player.money < 10 && totalOwnedStockUnits(state) === 0 && playerMachines.length < 2) {
    flags.push({
      code: "cash_stock_dead_end",
      severity: "error",
      message: "Player is nearly broke with no owned stock before the route has stabilized."
    });
  }

  if (playerMachines.length > 0 && stockedMachines.length === 0) {
    flags.push({
      code: "empty_route",
      severity: "warning",
      message: "Player owns installed machines but none have stock."
    });
  }

  if ((player.heat ?? 0) >= 22 && player.money < 50) {
    flags.push({
      code: "hot_low_cash",
      severity: "warning",
      message: "Heat is high while available cash is low."
    });
  }

  if (activeLawInspections(state).length > 0) {
    flags.push({
      code: "active_inspection",
      severity: "info",
      message: "A law inspection is active at export time."
    });
  }

  if (activeMachineAlarms(state).length > 0) {
    flags.push({
      code: "active_alarm",
      severity: "info",
      message: "A rival alarm is active at export time."
    });
  }

  const activeDangerCount = activeLawInspections(state).length + activeMachineAlarms(state).length + activeConflictEvents(state).length;
  if (activeDangerCount > 1) {
    flags.push({
      code: "stacked_danger",
      severity: "error",
      message: `${activeDangerCount} urgent danger beats are active at the same time.`
    });
  }

  if ((state.pacing?.toastEventsToday ?? 0) >= 18 && activeMinutesAt(state.worldTimeHours) <= 25) {
    flags.push({
      code: "opening_notification_density",
      severity: "warning",
      message: "The opening has produced a high number of global notifications."
    });
  }

  if ((state.pacing?.suppressedDangerToday ?? 0) > 0) {
    flags.push({
      code: "danger_pacing_deferred",
      severity: "info",
      message: `${state.pacing.suppressedDangerToday} ambient danger beat${state.pacing.suppressedDangerToday === 1 ? "" : "s"} deferred by pacing rules.`
    });
  }

  return flags;
}

export function buildPlaytestReport(state: GameState, exportedAt = new Date().toISOString()): PlaytestReport {
  const player = state.factions[state.playerFactionId];
  const playerMachines = installedMachines(state, state.playerFactionId);
  const stockedMachines = playerMachines.filter((machine) => machineStockUnits(machine) > 0);
  const starter = state.machines.machine_player_1;
  const starterRepaired = Boolean(starter && (starter.damage <= 0 || starter.placementStatus === "installed"));
  const contractHour = completedContractHour(state);
  const mission = missionProgress(state);
  const undercutHour = state.progression.starterMachinePlacedHour && state.progression.firstUndercutTriggered ? state.progression.starterMachinePlacedHour + 14 : undefined;
  const industrialAccess = districtProgress(state, "industrial_yards");
  const employeeHour = firstEmployeeValueHour(state);
  const inspectionHour = firstResolvedInspectionHour(state);
  const leadingEnding = endgamePathScores(state)[0];

  const milestones: PlaytestMilestoneReport[] = [
    milestone(
      "starter_repaired",
      "First repaired starter machine",
      starterRepaired ? "complete" : "not_started",
      "2-4 minutes",
      starterRepaired ? "Rusty Starter is repaired or already installed." : "Rusty Starter still needs garage repair.",
      starterRepaired ? state.progression.starterMachinePlacedHour ?? state.worldTimeHours : undefined,
      2,
      4
    ),
    milestone(
      "first_paid_contract",
      "First paid contract",
      contractHour ? "complete" : starter?.slots.length ? "in_progress" : "not_started",
      "5-8 minutes",
      contractHour ? "At least one service contract completed." : "No completed service contract yet.",
      contractHour,
      5,
      8
    ),
    milestone(
      "three_machine_control",
      "Three-machine starter control",
      state.mission.completed ? "complete" : mission.ownedCount > 0 ? "in_progress" : "not_started",
      "15-25 minutes",
      `${mission.profitableCount}/${mission.target} profitable starter machines.`,
      state.mission.completed ? state.worldTimeHours : undefined,
      15,
      25
    ),
    milestone(
      "rival_pressure_response",
      "First rival pressure response",
      state.progression.firstUndercutTriggered ? "complete" : playerMachines.length > 0 ? "in_progress" : "not_started",
      "12-22 minutes",
      state.progression.firstUndercutTriggered ? "First Redline undercut has surfaced." : "No first Redline undercut yet.",
      undercutHour,
      12,
      22
    ),
    milestone(
      "iron_yard_open",
      "Iron Yard open",
      industrialAccess.access === "unlocked" ? "complete" : industrialAccess.access === "scouted" ? "in_progress" : "not_started",
      "25-40 minutes",
      `Iron Yard access is ${industrialAccess.access}.`,
      industrialAccess.unlockedHour,
      25,
      40
    ),
    milestone(
      "first_employee_value",
      "First employee value",
      employeeHour ? "complete" : Object.keys(state.employees).length > 0 ? "in_progress" : "not_started",
      "30-45 minutes",
      employeeHour ? "Crew has assignment or route work history." : "No crew value recorded yet.",
      employeeHour,
      30,
      45
    ),
    milestone(
      "first_inspection_resolution",
      "First inspection resolution",
      inspectionHour ? "complete" : activeLawInspections(state).length > 0 ? "in_progress" : "not_started",
      "35-55 minutes",
      inspectionHour ? "At least one inspection resolved." : "No resolved inspection yet.",
      inspectionHour,
      35,
      55
    ),
    milestone(
      "first_ending_direction",
      "First empire/ending direction",
      leadingEnding && leadingEnding.score >= 35 ? "complete" : "in_progress",
      "60-90 minutes",
      leadingEnding ? `${leadingEnding.path.title} leads at ${leadingEnding.score}/100.` : "No ending direction available.",
      leadingEnding && leadingEnding.score >= 35 ? state.worldTimeHours : undefined,
      60,
      90
    )
  ];

  return {
    exportedAt,
    runClock: formatClock(state.worldTimeHours),
    worldTimeHours: state.worldTimeHours,
    estimatedActiveMinutes: activeMinutesAt(state.worldTimeHours),
    phase: currentPhase(state),
    summary: {
      cash: Math.round(player.money),
      heat: Math.round(player.heat),
      installedMachines: playerMachines.length,
      stockedMachines: stockedMachines.length,
      ownedStockUnits: totalOwnedStockUnits(state),
      activeAlarms: activeMachineAlarms(state).length,
      activeInspections: activeLawInspections(state).length,
      leadingEnding: leadingEnding?.path.title ?? "unknown",
      leadingEndingScore: leadingEnding?.score ?? 0
    },
    milestones,
    flags: playtestFlags(state, milestones)
  };
}

export function playtestReportFilename(state: GameState): string {
  const safeClock = formatClock(state.worldTimeHours).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `vendetta-playtest-${safeClock || "run"}.json`;
}
