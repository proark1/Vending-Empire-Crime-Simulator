import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../content/initialState";
import { migrateGameState, saveGame } from "./storage";

describe("save migration", () => {
  it("restores starter cash for a broke pre-route save", () => {
    const state = createInitialState();
    state.factions.player.money = 0;

    const migrated = migrateGameState(state);

    expect(migrated.factions.player.money).toBe(120);
    expect(migrated.eventLog[0]).toMatchObject({
      id: "tutorial_starter_float",
      tone: "good"
    });
  });

  it("does not refill cash after the starter route has begun", () => {
    const state = createInitialState();
    state.factions.player.money = 0;
    state.machines.machine_player_1.damage = 0;
    state.machines.machine_player_1.locationId = "laundromat";
    state.machines.machine_player_1.placementStatus = "installed";
    state.progression.starterMachinePlaced = true;

    const migrated = migrateGameState(state);

    expect(migrated.factions.player.money).toBe(0);
  });

  it("adds replay state to legacy saves", () => {
    const legacy = createInitialState() as Partial<ReturnType<typeof createInitialState>>;
    delete legacy.replay;

    const migrated = migrateGameState(legacy as ReturnType<typeof createInitialState>);

    expect(migrated.replay.modifier.id).toBeDefined();
    expect(migrated.replay.machineHistory).toEqual({});
    expect(migrated.replay.strategyUnlocks).toEqual([]);
  });

  it("adds pacing state to legacy saves", () => {
    const legacy = createInitialState() as Partial<ReturnType<typeof createInitialState>>;
    delete legacy.pacing;

    const migrated = migrateGameState(legacy as ReturnType<typeof createInitialState>);

    expect(migrated.pacing).toMatchObject({
      dangerBeatsToday: 0,
      suppressedDangerToday: 0,
      ambientEventsToday: 0,
      quietWindowsToday: 0,
      toastEventsToday: 0
    });
  });

  it("migrates an older-version save instead of discarding the player's progress", () => {
    const state = createInitialState();
    state.factions.player.money = 4242;
    state.machines.machine_player_1.damage = 0;
    state.machines.machine_player_1.placementStatus = "installed";
    state.progression.starterMachinePlaced = true;
    (state as { version: number }).version = state.version - 1;

    const migrated = migrateGameState(state);

    expect(migrated.version).toBe(createInitialState().version);
    expect(migrated.factions.player.money).toBe(4242);
  });

  it("returns a playable baseline instead of throwing on a garbage payload", () => {
    const migrated = migrateGameState(null as unknown as ReturnType<typeof createInitialState>);
    expect(migrated.version).toBe(createInitialState().version);
  });
});

describe("saveGame storage safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports failure instead of throwing when localStorage is full", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        removeItem: () => {},
        setItem: () => {
          throw new Error("QuotaExceededError");
        }
      }
    });

    const result = saveGame(createInitialState());
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("persists and reports bytes when storage works", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value)
      }
    });

    const result = saveGame(createInitialState());
    expect(result.ok).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
  });
});
