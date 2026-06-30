import type { GameCommand, GameState, ProductId } from "../game/core/types";
import { crimeContacts, neighborhoodHotspots } from "../game/content/world";
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

export type PrimaryInteractionTone = "neutral" | "good" | "warning" | "danger";

interface PrimaryInteractionWork {
  durationMs?: number;
  holdVerb?: string;
  payoff?: string;
  risk?: string;
  tone?: PrimaryInteractionTone;
}

export type PrimaryInteraction =
  | ({
      kind: "command";
      label: string;
      command: GameCommand;
      disabled?: boolean;
      disabledReason?: string;
    } & PrimaryInteractionWork)
  | ({
      kind: "save";
      label: string;
      disabled?: boolean;
      disabledReason?: string;
    } & PrimaryInteractionWork);

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

  for (const { productId, quantity } of recommendations) {
    const product = state.products[productId];
    const unitCost = currentProductCost(state, productId);
    const affordable = unitCost > 0 ? Math.floor(player.money / unitCost) : 0;
    const capacityLimited = Math.floor(remaining / product.size);
    const recommendedQuantity = Math.min(quantity, affordable, capacityLimited);
    if (recommendedQuantity > 0) {
      return { productId, quantity: recommendedQuantity };
    }
  }

  return undefined;
}

function shortageLabel(required: number, available: number): string {
  return `Need $${Math.max(0, Math.ceil(required - available))}`;
}

function supplierDisabledReason(state: GameState): string {
  if (state.player.carriedCrate || inventoryUnits(state.player.cargo, state) > 0) {
    return "Hands full";
  }

  if (cargoSpaceRemaining(state) <= 0) {
    return "No cargo room";
  }

  const cheapest = Math.min(...productPriority.map((productId) => currentProductCost(state, productId)).filter((cost) => cost > 0));
  const player = state.factions[state.playerFactionId];
  return player.money < cheapest ? shortageLabel(cheapest, player.money) : "No stock fits";
}

function rivalOperationLocationId(state: GameState, operationId: string): string | null {
  for (const organization of Object.values(state.rivalOrganizations ?? {})) {
    const operation = organization.operations.find((candidate) => candidate.id === operationId);
    if (operation && !operation.resolvedHour) {
      return operation.locationId;
    }
  }
  return null;
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
      : target.type === "rival_operation"
        ? rivalOperationLocationId(state, target.id)
      : target.type === "vehicle" || target.type === "neighborhood" || target.type === "crime_contact"
        ? null
      : state.machines[target.id]?.locationId;
  const conflictAtTarget = targetLocationId ? activeConflictEvents(state).find((event) => event.locationId === targetLocationId) : undefined;

  if (conflictAtTarget) {
    return {
      kind: "command",
      label: conflictAtTarget.kind === "street_chase" ? "Push escape" : "Strike back",
      durationMs: conflictAtTarget.kind === "street_chase" ? 900 : 850,
      holdVerb: conflictAtTarget.kind === "street_chase" ? "Pushing escape" : "Fighting through",
      payoff: conflictAtTarget.kind === "street_chase" ? "Build escape progress" : "Protect the route",
      risk: "Stamina and health can swing fast",
      tone: "danger",
      command: {
        type: "player_conflict_action",
        actorId,
        eventId: conflictAtTarget.id,
        action: conflictAtTarget.kind === "street_chase" ? "push_escape" : "strike"
      }
    };
  }

  if (target.type === "base") {
    if (state.player.carriedCrate) {
      return {
        kind: "command",
        label: "Store crate",
        durationMs: 700,
        holdVerb: "Storing crate",
        payoff: "Garage stock is ready for route loading",
        tone: "good",
        command: { type: "deposit_crate", actorId }
      };
    }

    const storedMachine = storedPlayerMachines(state).find((machine) => machine.damage > 0);
    if (storedMachine) {
      const repairCost = repairCostForMachine(storedMachine);
      return {
        kind: "command",
        label: `Repair ${storedMachine.name}`,
        durationMs: 1000,
        holdVerb: "Repairing",
        payoff: "Machine becomes ready to place",
        risk: `$${repairCost} repair cost`,
        tone: "good",
        disabled: player.money < repairCost,
        disabledReason: player.money < repairCost ? shortageLabel(repairCost, player.money) : undefined,
        command: { type: "repair_machine", actorId, machineId: storedMachine.id }
      };
    }

    const stored = firstGarageStorageProduct(state);
    if (stored) {
      const product = state.products[stored.productId];
      return {
        kind: "command",
        label: `Carry ${product.name}`,
        durationMs: 650,
        holdVerb: "Loading crate",
        payoff: "Stock is in hand for the next stop",
        tone: "good",
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
      return { kind: "command", label: "Buy stock", disabled: true, disabledReason: supplierDisabledReason(state), command: { type: "buy_product", actorId, productId: "soda", quantity: 1 } };
    }

    const product = state.products[recommendation.productId];
    const totalCost = currentProductCost(state, recommendation.productId) * recommendation.quantity;
    return {
      kind: "command",
      label: `Buy ${product.name}`,
      durationMs: 700,
      holdVerb: "Buying stock",
      payoff: `${recommendation.quantity} units for stocking routes`,
      risk: `$${Math.round(totalCost)} cash spent`,
      tone: "good",
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
    const storedMachines = storedPlayerMachines(state);
    const storedMachine = storedMachines.find((machine) => machine.damage <= 0);
    const placementDisabledReason = occupied
      ? "Spot occupied"
      : storedMachines.length === 0
        ? "No stored machine"
        : !storedMachine
          ? "Repair before placing"
          : player.money < placementQuote.cost
            ? shortageLabel(placementQuote.cost, player.money)
            : undefined;
    if (!unlocked) {
      if (districtInfo.progress.access === "locked") {
        return {
          kind: "command",
          label: district ? `Scout ${district.name}` : "Scout district",
          durationMs: 850,
          holdVerb: "Scouting",
          payoff: "Reveals pads, costs, and local trouble",
          risk: district ? `$${district.scoutCost} scouting cost` : undefined,
          tone: "neutral",
          disabled: !districtInfo.canScout,
          disabledReason: !districtInfo.canScout && district ? shortageLabel(district.scoutCost, player.money) : undefined,
          command: { type: "scout_district", actorId, districtId: location.districtId }
        };
      }

      return {
        kind: "command",
        label: districtInfo.canUnlock && district ? `Open ${district.name}` : "Requirements unmet",
        durationMs: 950,
        holdVerb: "Opening district",
        payoff: "New territory becomes placeable",
        risk: district ? `$${district.unlockCost} setup cost` : undefined,
        tone: "good",
        disabled: !districtInfo.canUnlock,
        disabledReason: !districtInfo.canUnlock && districtInfo.unmetRequirements.length > 0
          ? districtInfo.unmetRequirements.join(", ")
          : district && player.money < district.unlockCost
            ? shortageLabel(district.unlockCost, player.money)
            : undefined,
        command: { type: "unlock_district", actorId, districtId: location.districtId }
      };
    }

    return {
      kind: "command",
      label: storedMachine ? `Install ${storedMachine.name}` : "Legal install",
      durationMs: 1250,
      holdVerb: "Installing",
      payoff: "Adds a public cash stop",
      risk: `$${placementQuote.cost} placement cost; rivals notice claims`,
      tone: "good",
      disabled: Boolean(placementDisabledReason),
      disabledReason: placementDisabledReason,
      command: { type: "place_machine", actorId, locationId: location.id, method: "legal_contract", machineId: storedMachine?.id }
    };
  }

  if (target.type === "neighborhood") {
    const hotspot = neighborhoodHotspots.find((candidate) => candidate.id === target.id);
    const district = hotspot ? state.districts[hotspot.districtId] : undefined;
    const districtInfo = district ? districtUnlockInfo(state, district.id) : undefined;

    if (!district || !districtInfo || districtInfo.progress.access === "unlocked") {
      return null;
    }

    if (districtInfo.progress.access === "locked") {
      return {
        kind: "command",
        label: `Scout ${district.name}`,
        durationMs: 850,
        holdVerb: "Scouting",
        payoff: "Reveals pads, costs, and local trouble",
        risk: `$${district.scoutCost} scouting cost`,
        tone: "neutral",
        disabled: !districtInfo.canScout,
        disabledReason: !districtInfo.canScout ? shortageLabel(district.scoutCost, player.money) : undefined,
        command: { type: "scout_district", actorId, districtId: district.id }
      };
    }

    return {
      kind: "command",
      label: districtInfo.canUnlock ? `Open ${district.name}` : "Requirements unmet",
      durationMs: 950,
      holdVerb: "Opening district",
      payoff: "New territory becomes placeable",
      risk: `$${district.unlockCost} setup cost`,
      tone: "good",
      disabled: !districtInfo.canUnlock,
      disabledReason: !districtInfo.canUnlock && districtInfo.unmetRequirements.length > 0
        ? districtInfo.unmetRequirements.join(", ")
        : player.money < district.unlockCost
          ? shortageLabel(district.unlockCost, player.money)
          : undefined,
      command: { type: "unlock_district", actorId, districtId: district.id }
    };
  }

  if (target.type === "crime_contact") {
    const contact = crimeContacts.find((candidate) => candidate.id === target.id);
    if (!contact) {
      return null;
    }

    const district = state.districts[contact.districtId];
    const access = district ? districtUnlockInfo(state, district.id).progress.access : "locked";
    const handsFull = Boolean(state.player.carriedCrate) || inventoryUnits(state.player.cargo, state) > 0;
    const label =
      contact.action === "buy_tip"
        ? "Buy tip"
        : contact.action === "arrange_bribe"
          ? "Arrange bribe"
          : `Take ${contact.productId ? state.products[contact.productId].name : "grey stock"}`;
    const disabledReason =
      access === "locked"
        ? "District locked"
        : contact.action === "source_contraband" && handsFull
          ? "Hands full"
          : player.money < contact.cost
            ? shortageLabel(contact.cost, player.money)
            : undefined;

    return {
      kind: "command",
      label,
      durationMs: contact.action === "source_contraband" ? 1000 : 850,
      holdVerb: contact.action === "source_contraband" ? "Taking grey stock" : contact.action === "arrange_bribe" ? "Arranging bribe" : "Buying tip",
      payoff: contact.action === "source_contraband" ? "High-margin shelf stock" : contact.action === "arrange_bribe" ? "Buys breathing room with law pressure" : "Reveals a useful route angle",
      risk: `$${contact.cost} and +${contact.heatRisk.toFixed(1)} heat risk`,
      tone: contact.action === "source_contraband" ? "danger" : "good",
      disabled: Boolean(disabledReason),
      disabledReason,
      command: { type: "work_crime_contact", actorId, contactId: contact.id, action: contact.action }
    };
  }

  if (target.type === "rival_operation") {
    const operation = Object.values(state.rivalOrganizations ?? {})
      .flatMap((organization) => organization.operations)
      .find((candidate) => candidate.id === target.id && !candidate.resolvedHour);
    if (!operation) {
      return null;
    }

    const exposeCost = 12;
    return {
      kind: "command",
      label: "Expose operation",
      durationMs: 950,
      holdVerb: "Gathering evidence",
      payoff: "Slows the rival cell and builds leverage",
      risk: `$${exposeCost} and the boss remembers`,
      tone: "warning",
      disabled: player.money < exposeCost,
      disabledReason: player.money < exposeCost ? shortageLabel(exposeCost, player.money) : undefined,
      command: { type: "pressure_rival_operation", actorId, operationId: operation.id, approach: "expose" }
    };
  }

  if (target.type === "vehicle") {
    return null;
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
      durationMs: 1100,
      holdVerb: "Jamming display",
      payoff: "Hurts rival earning and raises street rep",
      risk: "Adds heat and can trigger retaliation",
      tone: "danger",
      command: { type: "sabotage_machine", actorId, machineId: machine.id }
    };
  }

  const activeAlarm = activeAlarmForMachine(state, machine.id);
  if (activeAlarm) {
    return {
      kind: "command",
      label: "Fight intruder",
      durationMs: 850,
      holdVerb: "Fighting intruder",
      payoff: "Stops damage and protects control",
      risk: "Street fight can go sideways",
      tone: "danger",
      command: { type: "confront_alarm", actorId, alarmId: activeAlarm.id }
    };
  }

  const hasStock = machine.slots.some((slot) => slot.quantity > 0);
  if (machine.damage > 0 && hasStock) {
    const repairCost = Math.ceil(10 + Math.min(35, machine.damage) * 0.45);
    return {
      kind: "command",
      label: "Repair machine",
      durationMs: 950,
      holdVerb: "Repairing",
      payoff: "Restores reliability and lowers route pressure",
      risk: `$${repairCost} repair cost`,
      tone: "good",
      command: { type: "repair_machine", actorId, machineId: machine.id },
      disabled: player.money < repairCost,
      disabledReason: player.money < repairCost ? shortageLabel(repairCost, player.money) : undefined
    };
  }

  const carriedProduct = firstCarriedProduct(state, machine.id);
  if (carriedProduct) {
    const product = state.products[carriedProduct.productId];
    return {
      kind: "command",
      label: `Stock ${product.name}`,
      durationMs: 750,
      holdVerb: "Stocking",
      payoff: "Turns foot traffic into sales",
      risk: `${carriedProduct.quantity} units committed here`,
      tone: "good",
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
      durationMs: 600,
      holdVerb: "Unloading van",
      payoff: "Moves van cargo into your hands",
      tone: "good",
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
      durationMs: 650,
      holdVerb: "Collecting cash",
      payoff: `$${Math.round(machine.revenueStored)} ready for upgrades and stock`,
      tone: "good",
      command: { type: "collect_revenue", actorId, machineId: machine.id }
    };
  }

  if (machine.damage > 0) {
    const repairCost = Math.ceil(10 + Math.min(35, machine.damage) * 0.45);
    return {
      kind: "command",
      label: "Repair machine",
      durationMs: 950,
      holdVerb: "Repairing",
      payoff: "Restores reliability and lowers route pressure",
      risk: `$${repairCost} repair cost`,
      tone: "good",
      command: { type: "repair_machine", actorId, machineId: machine.id },
      disabled: player.money < repairCost,
      disabledReason: player.money < repairCost ? shortageLabel(repairCost, player.money) : undefined
    };
  }

  return {
    kind: "command",
    label: "No action",
    disabled: true,
    disabledReason: "Carry stock first",
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
