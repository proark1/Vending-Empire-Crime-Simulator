import { describe, expect, it } from "vitest";
import { createInitialState } from "./initialState";
import { activeRunModifier, applyRunLegacy, chooseRunModifier, createReplayState } from "./replayability";

describe("replayability content", () => {
  it("chooses deterministic run modifiers from the run seed", () => {
    expect(chooseRunModifier(12).id).toBe(chooseRunModifier(12).id);
    expect(chooseRunModifier(1).id).not.toBe(chooseRunModifier(2).id);
  });

  it("starts new games with replay state and an opening run condition", () => {
    const state = createInitialState(2);

    expect(state.replay).toMatchObject(createReplayState(2));
    expect(activeRunModifier(state).id).toBe(state.replay.modifier.id);
    expect(state.eventLog[0]?.message).toContain(activeRunModifier(state).name);
  });

  it("carries unlocks and a rival grudge into a New Game Plus run", () => {
    const previous = createInitialState(1);
    previous.replay.strategyUnlocks = ["truce_broker", "contract_operator"];
    previous.replay.rivalMemory.rival_redline = {
      alarmConfronted: 0,
      disruption: 1,
      exposure: 1,
      expansion: 0,
      factionId: "rival_redline",
      negotiation: 0,
      sabotage: 3,
      undercut: 2
    };

    const next = createInitialState(2);
    const startingMoney = next.factions[next.playerFactionId].money;
    const carried = applyRunLegacy(next, previous);

    expect(carried).toBe(true);
    expect(next.replay.legacy).toMatchObject({ runCount: 1, rivalFactionId: "rival_redline", startingBonus: 50 });
    expect(next.factions[next.playerFactionId].money).toBe(startingMoney + 50);
    expect(next.replay.rivalMemory.rival_redline?.exposure).toBe(2);
  });

  it("does not mark a plain fresh restart as New Game Plus", () => {
    const previous = createInitialState(1);
    const next = createInitialState(2);

    expect(applyRunLegacy(next, previous)).toBe(false);
    expect(next.replay.legacy).toBeUndefined();
  });
});
