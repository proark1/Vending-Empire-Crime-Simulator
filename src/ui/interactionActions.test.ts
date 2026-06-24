import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/content/initialState";
import { reduceGameState } from "../game/systems/reducer";
import { getPrimaryInteraction } from "./interactionActions";

describe("primary interactions", () => {
  it("recommends buying supplier stock", () => {
    const state = createInitialState();
    const action = getPrimaryInteraction(state, { type: "supplier", id: "supplier", label: "Backdoor Supplier" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toContain("Buy");
  });

  it("prioritizes stocking an owned machine when cargo is available", () => {
    const state = reduceGameState(createInitialState(), { type: "buy_product", actorId: "player", productId: "soda", quantity: 5 }).state;
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_player_1", label: "Rusty Starter" });

    expect(action?.kind).toBe("command");
    expect(action?.label).toBe("Stock Corner Soda");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("stock_machine");
    }
  });

  it("uses sabotage as the rival machine primary action", () => {
    const state = createInitialState();
    const action = getPrimaryInteraction(state, { type: "machine", id: "machine_rival_1", label: "Redline Basic" });

    expect(action?.kind).toBe("command");
    if (action?.kind === "command") {
      expect(action.command.type).toBe("sabotage_machine");
    }
  });
});
