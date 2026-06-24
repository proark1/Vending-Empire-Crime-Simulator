import type { GameCommand, GameState, ProductId } from "../game/core/types";
import { cargoSpaceRemaining, machineAtLocation } from "../game/core/selectors";
import type { SceneTarget } from "../render/three/SceneTargets";

export type PrimaryInteraction =
  | {
      kind: "command";
      label: string;
      command: GameCommand;
      disabled?: boolean;
    }
  | {
      kind: "save";
      label: string;
      disabled?: boolean;
    };

const productPriority: ProductId[] = ["soda", "chips", "energy", "mystery_capsules"];

function firstCargoProduct(state: GameState, machineId: string): { productId: ProductId; quantity: number } | undefined {
  const machine = state.machines[machineId];
  if (!machine) {
    return undefined;
  }

  for (const productId of productPriority) {
    const available = state.player.cargo[productId] ?? 0;
    if (available <= 0) {
      continue;
    }

    const existingSlot = machine.slots.find((slot) => slot.productId === productId);
    const freeSlot = machine.slots.length < machine.maxSlots;
    const capacityLeft = existingSlot ? existingSlot.capacity - existingSlot.quantity : freeSlot ? 24 : 0;

    if (capacityLeft > 0) {
      return { productId, quantity: Math.min(6, available, capacityLeft) };
    }
  }

  return undefined;
}

function recommendedSupplierBuy(state: GameState): { productId: ProductId; quantity: number } | undefined {
  const player = state.factions[state.playerFactionId];
  const remaining = cargoSpaceRemaining(state);
  const recommendations: Array<{ productId: ProductId; quantity: number }> = [
    { productId: "soda", quantity: 5 },
    { productId: "chips", quantity: 5 },
    { productId: "energy", quantity: 5 },
    { productId: "mystery_capsules", quantity: 3 }
  ];

  return recommendations.find(({ productId, quantity }) => {
    const product = state.products[productId];
    return player.money >= product.cost * quantity && remaining >= product.size * quantity;
  });
}

export function getPrimaryInteraction(state: GameState, target: SceneTarget | null): PrimaryInteraction | null {
  if (!target) {
    return null;
  }

  const actorId = state.playerFactionId;
  const player = state.factions[actorId];

  if (target.type === "base") {
    return { kind: "save", label: "Save game" };
  }

  if (target.type === "supplier") {
    const recommendation = recommendedSupplierBuy(state);
    if (!recommendation) {
      return { kind: "command", label: "Buy stock", disabled: true, command: { type: "buy_product", actorId, productId: "soda", quantity: 1 } };
    }

    const product = state.products[recommendation.productId];
    return {
      kind: "command",
      label: `Buy ${product.name}`,
      command: { type: "buy_product", actorId, productId: recommendation.productId, quantity: recommendation.quantity }
    };
  }

  if (target.type === "placement") {
    const location = state.locations[target.id];
    const occupied = Boolean(machineAtLocation(state, target.id));
    return {
      kind: "command",
      label: `Install machine`,
      disabled: occupied || player.money < location.placementCost,
      command: { type: "place_machine", actorId, locationId: location.id }
    };
  }

  const machine = state.machines[target.id];
  if (!machine) {
    return null;
  }

  const isPlayerMachine = machine.ownerFactionId === actorId;
  if (!isPlayerMachine) {
    return {
      kind: "command",
      label: "Jam rival display",
      command: { type: "sabotage_machine", actorId, machineId: machine.id }
    };
  }

  const cargoProduct = firstCargoProduct(state, machine.id);
  if (cargoProduct) {
    const product = state.products[cargoProduct.productId];
    return {
      kind: "command",
      label: `Stock ${product.name}`,
      command: {
        type: "stock_machine",
        actorId,
        machineId: machine.id,
        productId: cargoProduct.productId,
        quantity: cargoProduct.quantity
      }
    };
  }

  if (machine.revenueStored > 0) {
    return {
      kind: "command",
      label: "Collect cash",
      command: { type: "collect_revenue", actorId, machineId: machine.id }
    };
  }

  if (machine.damage > 0) {
    return {
      kind: "command",
      label: "Repair machine",
      command: { type: "repair_machine", actorId, machineId: machine.id },
      disabled: player.money < Math.ceil(10 + Math.min(35, machine.damage) * 0.45)
    };
  }

  return {
    kind: "command",
    label: "No action",
    disabled: true,
    command: { type: "collect_revenue", actorId, machineId: machine.id }
  };
}

export function executePrimaryInteraction(
  interaction: PrimaryInteraction | null,
  handlers: {
    onCommand: (command: GameCommand) => void;
    onSave: () => void;
  }
): boolean {
  if (!interaction || interaction.disabled) {
    return false;
  }

  if (interaction.kind === "save") {
    handlers.onSave();
    return true;
  }

  handlers.onCommand(interaction.command);
  return true;
}
