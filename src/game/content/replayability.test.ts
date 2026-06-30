import { describe, expect, it } from "vitest";
import { createInitialState } from "./initialState";
import { activeRunModifier, chooseRunModifier, createReplayState } from "./replayability";

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
});
