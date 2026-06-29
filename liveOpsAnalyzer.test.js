import { describe, expect, it } from "vitest";
import { analyzeLiveOpsSaveRows } from "./liveOpsAnalyzer.js";

function baseState(patch = {}) {
  return {
    playerFactionId: "player",
    worldTimeHours: 12,
    factions: {
      player: { heat: 8, money: 120 }
    },
    player: {
      cargo: {},
      garageStorage: {}
    },
    machines: {
      machine_player_1: {
        id: "machine_player_1",
        ownerFactionId: "player",
        placementStatus: "installed",
        slots: [{ productId: "soda", quantity: 4 }]
      }
    },
    mission: { completed: false },
    districtProgress: {
      starter_suburb: { access: "unlocked" }
    },
    machineAlarms: {},
    law: { activeInspections: {} },
    empire: { endingExecutions: {} },
    ...patch
  };
}

describe("live ops analyzer", () => {
  it("summarizes healthy saved players", () => {
    const result = analyzeLiveOpsSaveRows([
      {
        name: "Player One",
        profile_id: "p1",
        revision: 3,
        state: baseState(),
        updated_at: "2026-06-29T19:30:00.000Z"
      }
    ], { now: "2026-06-29T20:00:00.000Z" });

    expect(result.summary).toMatchObject({
      playerCount: 1,
      profilesWithSaves: 1,
      recentSaves: 1,
      totalInstalledMachines: 1
    });
    expect(result.players[0]).toMatchObject({
      flags: [],
      missionPhase: "starter route",
      profileName: "Player One"
    });
    expect(result.issues).toHaveLength(0);
  });

  it("flags stuck and risky saves without throwing", () => {
    const result = analyzeLiveOpsSaveRows([
      {
        name: "Blocked",
        profile_id: "p2",
        revision: 1,
        state: baseState({
          worldTimeHours: 14,
          factions: { player: { heat: 52, money: 3 } },
          machines: {},
          player: { cargo: {}, garageStorage: {} }
        }),
        updated_at: "2026-06-28T00:00:00.000Z"
      },
      {
        name: "No Save",
        profile_id: "p3",
        revision: null,
        state: null,
        updated_at: null
      },
      {
        name: "Bad Save",
        profile_id: "p4",
        revision: 2,
        state: "not-json",
        updated_at: "2026-06-29T19:00:00.000Z"
      }
    ], { now: "2026-06-29T20:00:00.000Z" });

    expect(result.summary).toMatchObject({
      playerCount: 3,
      profilesWithSaves: 1,
      staleSaves: 1
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "bad_save",
      "broke_no_stock",
      "high_heat_low_cash",
      "no_machine_after_start",
      "no_save",
      "stale_save"
    ]));
  });

  it("flags active alarms and inspections", () => {
    const result = analyzeLiveOpsSaveRows([
      {
        name: "Under Pressure",
        profile_id: "p5",
        revision: 8,
        state: baseState({
          law: {
            activeInspections: {
              inspection_1: { deadlineHour: 13, status: "active" }
            }
          },
          machineAlarms: {
            alarm_1: { expiresHour: 13, resolved: false }
          }
        }),
        updated_at: "2026-06-29T19:55:00.000Z"
      }
    ], { now: "2026-06-29T20:00:00.000Z" });

    expect(result.summary).toMatchObject({
      activeAlarmPlayers: 1,
      activeInspectionPlayers: 1
    });
    expect(result.players[0].flags).toEqual(expect.arrayContaining(["alarm", "inspection"]));
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["active_alarm", "active_inspection"]));
  });
});
