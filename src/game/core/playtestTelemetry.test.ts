import { describe, expect, it } from "vitest";
import { createInitialState } from "../content/initialState";
import { buildPlaytestReport, playtestReportFilename } from "./playtestTelemetry";

describe("playtest telemetry", () => {
  it("exports a stable vertical-slice snapshot", () => {
    const state = createInitialState();
    const report = buildPlaytestReport(state, "2026-06-29T00:00:00.000Z");

    expect(report).toMatchObject({
      exportedAt: "2026-06-29T00:00:00.000Z",
      phase: "pre-route",
      summary: {
        cash: 120,
        heat: 0,
        installedMachines: 0,
        leadingEnding: expect.any(String)
      }
    });
    expect(report.milestones.map((milestone) => milestone.id)).toEqual([
      "starter_repaired",
      "first_paid_contract",
      "three_machine_control",
      "rival_pressure_response",
      "iron_yard_open",
      "first_employee_value",
      "first_inspection_resolution",
      "first_ending_direction"
    ]);
  });

  it("uses a filesystem-safe export filename", () => {
    expect(playtestReportFilename(createInitialState())).toMatch(/^vendetta-playtest-day-1-08-00\.json$/);
  });
});
