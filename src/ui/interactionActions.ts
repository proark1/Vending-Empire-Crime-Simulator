import type { GameCommand, GameState, ProductId } from "../game/core/types";
import {
  activeAlarmForMachine,
  activeConflictEvents,
  activeVehicle,
  cargoSpaceRemaining,
  currentProductCost,
  districtUnlockInfo,
  firstGarageStorageProduct,
  firstVehicleProduct,
  inventoryUnits,
  isDistrictUnlockedForPlacement,
  machineAtLocation,
  placementQuoteForLocation,
  repairCostForMachine,
  storedPlayerMachines
} from "../game/core/selectors";
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

const productPriority: ProductId[] = [
  "soda",
  "chips",
  "energy",
  "water",
  "coffee_can",
  "protein_bar",
  "instant_noodles",
  "phone_charger",
  "umbrella",
  "hygiene_kit",
  "luxury_snack",
  "mystery_capsules",
  "mood_fizz",
  "glitch_gum",
  "night_syrup",
  "focus_cubes"
];

function firstCarriedProduct(state: GameState, machineId: string): { productId: ProductId; quantity: number } | undefined {
  const machine = state.machines[machineId];
  if (!machine) {
    return undefined;
  }

  for (const productId of productPriority) {
    const crate = state.player.carriedCrate;
    const available = crate?.productId === productId ? crate.quantity : state.player.cargo[productId] ?? 0;
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
  if (state.player.carriedCrate || inventoryUnits(state.player.cargo, state) > 0) {
    return undefined;
  }

  const player = state.factions[state.playerFactionId];
  const remaining = cargoSpaceRemaining(state);
  const recommendations: Array<{ productId: ProductId; quantity: number }> = [
    { productId: "soda", quantity: 10 },
    { productId: "chips", quantity: 5 },
    { productId: "water", quantity: 10 },
    { productId: "energy", quantity: 5 },
    { productId: "coffee_can", quantity: 5 },
    { productId: "protein_bar", quantity: 5 },
    { productId: "mystery_capsules", quantity: 3 },
    { productId: "mood_fizz", quantity: 3 }
  ];

  return recommendations.find(({ productId, quantity }) => {
    const product = state.products[productId];
    return player.money >= currentProductCost(state, productId) * quantity && remaining >= product.size * quantity;
  });
}

export function getPrimaryInteraction(state: GameState, target: SceneTarget | null): PrimaryInteraction | null {
  if (!target) {
    return null;
  }

  const actorId = state.playerFactionId;
  const player = state.factions[actorId];
  const targetLocationId =
    target.type === "base" || target.type === "supplier" || target.type === "placement"
      ? target.id
      : state.machines[target.id]?.locationId;
  const conflictAtTarget = targetLocationId ? activeConflictEvents(state).find((event) => event.locationId === targetLocationId) : undefined;

  if (conflictAtTarget) {
    return {
      kind: "command",
      label: conflictAtTarget.kind === "base_raid" ? "Trigger lockdown" : conflictAtTarget.kind === "route_ambush" ? "Drive escape" : "Fight through",
      command: {
        type: "resolve_conflict_event",
        actorId,
        eventId: conflictAtTarget.id,
        resolution: conflictAtTarget.kind === "base_raid" ? "remote_lockdown" : conflictAtTarget.kind === "route_ambush" ? "drive_escape" : "melee"
      }
    };
  }

  if (target.type === "base") {
    if (state.player.carriedCrate) {
      return { kind: "command", label: "Store crate", command: { type: "deposit_crate", actorId } };
    }

    const storedMachine = storedPlayerMachines(state).find((machine) => machine.damage > 0);
    if (storedMachine) {
      return {
        kind: "command",
        label: `Repair ${storedMachine.name}`,
        disabled: player.money < repairCostForMachine(storedMachine),
        command: { type: "repair_machine", actorId, machineId: storedMachine.id }
      };
    }

    const stored = firstGarageStorageProduct(state);
    if (stored) {
      const product = state.products[stored.productId];
      return {
        kind: "command",
        label: `Carry ${product.name}`,
        command: {
          type: "load_crate",
          actorId,
          productId: product.id,
          quantity: Math.min(stored.quantity, Math.floor(state.player.cargoCapacity / product.size))
        }
      };
    }

    return { kind: "save", label: "Save game" };
  }

  if (target.type === "supplier") {
    const recommendation = recommendedSupplierBuy(state);
    if (!recommendation) {
      return { kind: "command", label: state.player.carriedCrate ? "Hands full" : "Buy stock", disabled: true, command: { type: "buy_product", actorId, productId: "soda", quantity: 1 } };
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
    const district = state.districts[location.districtId];
    const districtInfo = districtUnlockInfo(state, location.districtId);
    const unlocked = isDistrictUnlockedForPlacement(state, location.districtId);
    const placementQuote = placementQuoteForLocation(state, location, "legal_contract");
    const storedMachine = storedPlayerMachines(state)[0];
    if (!unlocked) {
      if (districtInfo.progress.access === "locked") {
        return {
          kind: "command",
          label: district ? `Scout ${district.name}` : "Scout district",
          disabled: !districtInfo.canScout,
          command: { type: "scout_district", actorId, districtId: location.districtId }
        };
      }

      return {
        kind: "command",
        label: districtInfo.canUnlock && district ? `Open ${district.name}` : "Requirements unmet",
        disabled: !districtInfo.canUnlock,
        command: { type: "unlock_district", actorId, districtId: location.districtId }
      };
    }

    return {
      kind: "command",
      label: storedMachine ? `Install ${storedMachine.name}` : "Legal install",
      disabled: occupied || player.money < placementQuote.cost || Boolean(storedMachine && storedMachine.damage > 0),
      command: { type: "place_machine", actorId, locationId: location.id, method: "legal_contract", machineId: storedMachine?.id }
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

  const activeAlarm = activeAlarmForMachine(state, machine.id);
  if (activeAlarm) {
    return {
      kind: "command",
      label: "Fight intruder",
      command: { type: "confront_alarm", actorId, alarmId: activeAlarm.id }
    };
  }

  const hasStock = machine.slots.some((slot) => slot.quantity > 0);
  if (machine.damage > 0 && hasStock) {
    return {
      kind: "command",
      label: "Repair machine",
      command: { type: "repair_machine", actorId, machineId: machine.id },
      disabled: player.money < Math.ceil(10 + Math.min(35, machine.damage) * 0.45)
    };
  }

  const carriedProduct = firstCarriedProduct(state, machine.id);
  if (carriedProduct) {
    const product = state.products[carriedProduct.productId];
    return {
      kind: "command",
      label: `Stock ${product.name}`,
      command: {
        type: "stock_machine",
        actorId,
        machineId: machine.id,
        productId: carriedProduct.productId,
        quantity: carriedProduct.quantity
      }
    };
  }

  const vehicle = activeVehicle(state);
  const vehicleProduct = vehicle?.locationId === machine.locationId ? firstVehicleProduct(state, vehicle) : undefined;
  if (vehicleProduct) {
    const product = state.products[vehicleProduct.productId];
    return {
      kind: "command",
      label: `Carry ${product.name} from van`,
      command: {
        type: "take_vehicle_crate",
        actorId,
        vehicleId: vehicle!.id,
        productId: product.id,
        quantity: Math.min(vehicleProduct.quantity, Math.floor(state.player.cargoCapacity / product.size))
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
