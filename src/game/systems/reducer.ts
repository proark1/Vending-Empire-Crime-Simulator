import type { CommandResult, FactionId, GameCommand, GameEvent, GameEventTone, GameState, MachineSlot, ProductId, VendingMachine } from "../core/types";
import { cargoSpaceRemaining, garageStorageSpaceRemaining, inventoryUnits, machineAtLocation, missionProgress, ownedMachines } from "../core/selectors";
import { machineUpgrades } from "../content/machineUpgrades";
import { machineHasUpgrade, sabotageDamage } from "../core/machineStats";
import { runMachineSales } from "./economy";

function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

function log(state: GameState, events: GameEvent[], message: string, tone: GameEventTone = "neutral"): void {
  const event: GameEvent = {
    id: `event_${state.eventSequence++}`,
    hour: state.worldTimeHours,
    tone,
    message
  };
  events.push(event);
  state.eventLog = [event, ...state.eventLog].slice(0, 12);
}

function getFactionOrThrow(state: GameState, factionId: FactionId) {
  const faction = state.factions[factionId];
  if (!faction) {
    throw new Error(`Unknown faction: ${factionId}`);
  }
  return faction;
}

function addInventory(inventory: Record<string, number>, productId: ProductId, quantity: number): void {
  inventory[productId] = (inventory[productId] ?? 0) + quantity;
}

function removeInventory(inventory: Record<string, number>, productId: ProductId, quantity: number): void {
  inventory[productId] = Math.max(0, (inventory[productId] ?? 0) - quantity);
  if (inventory[productId] === 0) {
    delete inventory[productId];
  }
}

function removeCarriedProduct(state: GameState, productId: ProductId, quantity: number): void {
  const crate = state.player.carriedCrate;
  if (crate?.productId === productId) {
    crate.quantity = Math.max(0, crate.quantity - quantity);
    if (crate.quantity === 0) {
      state.player.carriedCrate = null;
    }
    return;
  }

  removeInventory(state.player.cargo, productId, quantity);
}

function getOrCreateSlot(machine: VendingMachine, productId: ProductId, basePrice: number): MachineSlot | undefined {
  const existing = machine.slots.find((slot) => slot.productId === productId);
  if (existing) {
    return existing;
  }

  if (machine.slots.length >= machine.maxSlots) {
    return undefined;
  }

  const slot: MachineSlot = {
    productId,
    quantity: 0,
    capacity: 24,
    price: basePrice,
    salesAccumulator: 0
  };
  machine.slots.push(slot);
  return slot;
}

function createMachine(state: GameState, ownerFactionId: FactionId, locationId: string): VendingMachine {
  const id = `machine_${ownerFactionId}_${state.nextMachineNumber++}`;
  const location = state.locations[locationId];
  const machine: VendingMachine = {
    id,
    name: ownerFactionId === state.playerFactionId ? `Street Unit ${state.nextMachineNumber - 1}` : `Redline Unit ${state.nextMachineNumber - 1}`,
    ownerFactionId,
    locationId,
    slots: [],
    maxSlots: 3,
    revenueStored: 0,
    damage: ownerFactionId === state.playerFactionId ? 12 : 0,
    security: 0.2,
    visibility: location.kind === "transit" ? 0.95 : 0.8,
    heat: 0,
    lastServicedHour: state.worldTimeHours,
    upgrades: []
  };
  state.machines[id] = machine;
  return machine;
}

function clampSlotPrice(price: number): number {
  return Math.max(1, Math.min(99, Math.round(price)));
}

function maybeCompleteMission(state: GameState, events: GameEvent[]): void {
  if (state.mission.completed) {
    return;
  }

  const progress = missionProgress(state);
  if (progress.ownedCount >= progress.target && progress.profitableCount >= progress.target) {
    state.mission.completed = true;
    state.factions[state.playerFactionId].money += 150;
    log(state, events, "Cinderblock Row is starting to feel like your territory. Expansion bonus paid.", "good");
  }
}

function applyAdvanceTime(state: GameState, events: GameEvent[], hours: number): void {
  state.worldTimeHours += hours;

  let playerEarned = 0;
  for (const machine of Object.values(state.machines)) {
    const earned = runMachineSales(state, machine, hours);
    if (machine.ownerFactionId === state.playerFactionId) {
      playerEarned += earned;
    } else {
      state.factions[machine.ownerFactionId].money += earned * 0.75;
    }
  }

  for (const location of Object.values(state.locations)) {
    location.rivalPressure = Math.max(0, location.rivalPressure - hours * 0.018);
  }

  const player = state.factions[state.playerFactionId];
  player.heat = Math.max(0, player.heat - hours * 0.12);

  if (playerEarned >= 18) {
    log(state, events, `Machines generated $${Math.round(playerEarned)} in stored revenue.`, "good");
  }
}

export function reduceGameState(currentState: GameState, command: GameCommand): CommandResult {
  const state = cloneState(currentState);
  const events: GameEvent[] = [];
  const actor = getFactionOrThrow(state, command.actorId);

  switch (command.type) {
    case "advance_time": {
      applyAdvanceTime(state, events, command.hours);
      break;
    }

    case "buy_product": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const product = state.products[command.productId];
      if (state.player.carriedCrate || inventoryUnits(state.player.cargo, state) > 0) {
        log(state, events, "Hands are full. Drop the current crate at the garage or load a machine first.", "warning");
        break;
      }

      const affordable = Math.floor(actor.money / product.cost);
      const capacityLimited = Math.floor(cargoSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, affordable, capacityLimited));

      if (quantity <= 0) {
        log(state, events, "No room or cash for that crate.", "warning");
        break;
      }

      actor.money -= quantity * product.cost;
      state.player.carriedCrate = {
        productId: product.id,
        quantity,
        capacity: Math.floor(state.player.cargoCapacity / product.size),
        source: "supplier"
      };
      log(state, events, `Picked up a ${quantity}x ${product.name} crate for $${quantity * product.cost}.`, "good");
      break;
    }

    case "deposit_crate": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const crate = state.player.carriedCrate;
      if (!crate) {
        log(state, events, "No crate in hand to store.", "warning");
        break;
      }

      const product = state.products[crate.productId];
      const spaceLimited = Math.floor(garageStorageSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(crate.quantity, spaceLimited));
      if (quantity <= 0) {
        log(state, events, "Garage storage is full.", "warning");
        break;
      }

      state.player.garageStorage ??= {};
      addInventory(state.player.garageStorage, crate.productId, quantity);
      crate.quantity -= quantity;
      if (crate.quantity <= 0) {
        state.player.carriedCrate = null;
      }
      log(state, events, `Stored ${quantity}x ${product.name} at the garage.`, "good");
      break;
    }

    case "load_crate": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      if (state.player.carriedCrate) {
        log(state, events, "Already carrying a crate.", "warning");
        break;
      }

      const product = state.products[command.productId];
      const available = state.player.garageStorage?.[product.id] ?? 0;
      const capacityLimited = Math.floor(cargoSpaceRemaining(state) / product.size);
      const quantity = Math.max(0, Math.min(command.quantity, available, capacityLimited));

      if (quantity <= 0) {
        log(state, events, `No ${product.name} crates ready in the garage.`, "warning");
        break;
      }

      removeInventory(state.player.garageStorage, product.id, quantity);
      state.player.carriedCrate = {
        productId: product.id,
        quantity,
        capacity: Math.floor(state.player.cargoCapacity / product.size),
        source: "garage"
      };
      log(state, events, `Loaded ${quantity}x ${product.name} from garage storage.`, "good");
      break;
    }

    case "stock_machine": {
      if (actor.id !== state.playerFactionId) {
        break;
      }

      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id) {
        break;
      }

      const product = state.products[command.productId];
      const available = state.player.carriedCrate?.productId === product.id ? state.player.carriedCrate.quantity : state.player.cargo[product.id] ?? 0;
      const slot = getOrCreateSlot(machine, product.id, product.basePrice);

      if (!slot) {
        log(state, events, `${machine.name} has no free product slot.`, "warning");
        break;
      }

      const quantity = Math.max(0, Math.min(command.quantity, available, slot.capacity - slot.quantity));
      if (quantity <= 0) {
        log(state, events, `No ${product.name} available to stock.`, "warning");
        break;
      }

      slot.quantity += quantity;
      removeCarriedProduct(state, product.id, quantity);
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `Loaded ${quantity}x ${product.name} into ${machine.name}.`, "good");
      break;
    }

    case "collect_revenue": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id || machine.revenueStored <= 0) {
        break;
      }

      const amount = Math.round(machine.revenueStored);
      actor.money += amount;
      machine.revenueStored = 0;
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `Collected $${amount} from ${machine.name}.`, "good");
      break;
    }

    case "repair_machine": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id || machine.damage <= 0) {
        break;
      }

      const repairAmount = Math.min(35, machine.damage);
      const cost = Math.ceil(10 + repairAmount * 0.45);
      if (actor.money < cost) {
        log(state, events, `Repairs need $${cost}.`, "warning");
        break;
      }

      actor.money -= cost;
      machine.damage = Math.max(0, machine.damage - repairAmount);
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `Repaired ${machine.name} for $${cost}.`, "good");
      break;
    }

    case "place_machine": {
      const location = state.locations[command.locationId];
      if (!location || location.kind === "garage" || location.kind === "supplier") {
        break;
      }

      if (machineAtLocation(state, location.id)) {
        log(state, events, `${location.name} already has a machine.`, "warning");
        break;
      }

      if (actor.money < location.placementCost) {
        log(state, events, `${location.name} needs $${location.placementCost} to install a machine.`, "warning");
        break;
      }

      actor.money -= location.placementCost;
      const machine = createMachine(state, actor.id, location.id);
      log(state, events, `${machine.name} installed at ${location.name}.`, actor.id === state.playerFactionId ? "good" : "danger");
      break;
    }

    case "set_slot_price": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id) {
        break;
      }

      const product = state.products[command.productId];
      const slot = machine.slots.find((candidate) => candidate.productId === command.productId);
      if (!product || !slot) {
        break;
      }

      const nextPrice = clampSlotPrice(command.price);
      if (slot.price === nextPrice) {
        break;
      }

      slot.price = nextPrice;
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `${product.name} now sells for $${nextPrice} at ${machine.name}.`, "neutral");
      break;
    }

    case "install_upgrade": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId !== actor.id) {
        break;
      }

      const upgrade = machineUpgrades[command.upgradeId];
      if (!upgrade) {
        break;
      }

      machine.upgrades ??= [];
      if (machineHasUpgrade(machine, upgrade.id)) {
        log(state, events, `${machine.name} already has ${upgrade.name}.`, "warning");
        break;
      }

      if (actor.money < upgrade.cost) {
        log(state, events, `${upgrade.name} needs $${upgrade.cost}.`, "warning");
        break;
      }

      actor.money -= upgrade.cost;
      machine.upgrades.push(upgrade.id);
      machine.lastServicedHour = state.worldTimeHours;
      log(state, events, `${upgrade.name} installed on ${machine.name}.`, "good");
      break;
    }

    case "sabotage_machine": {
      const machine = state.machines[command.machineId];
      if (!machine || machine.ownerFactionId === actor.id) {
        break;
      }

      const damage = sabotageDamage(28, machine);
      machine.damage = Math.min(100, machine.damage + damage);
      actor.heat += 8;
      actor.streetReputation += 2;
      const location = state.locations[machine.locationId];
      location.rivalPressure = Math.max(0, location.rivalPressure - 0.15);
      log(state, events, `${machine.name}'s display is jammed. Heat rises.`, "danger");
      break;
    }

    case "rival_action": {
      const controller = state.npcControllers[actor.id];
      if (controller) {
        controller.lastActedHour = state.worldTimeHours;
      }

      if (command.action === "sabotage" && command.targetMachineId) {
        const target = state.machines[command.targetMachineId];
        if (target && target.ownerFactionId !== actor.id) {
          const baseDamage = 18 + Math.round((controller?.aggression ?? 0) * 8);
          target.damage = Math.min(100, target.damage + sabotageDamage(baseDamage, target));
          state.locations[target.locationId].rivalPressure = Math.min(1, state.locations[target.locationId].rivalPressure + 0.15);
          log(state, events, `${actor.name} roughed up ${target.name}.`, "danger");
        }
      }

      if (command.action === "undercut" && command.targetMachineId) {
        const target = state.machines[command.targetMachineId];
        if (target) {
          const location = state.locations[target.locationId];
          location.rivalPressure = Math.min(1, location.rivalPressure + 0.22);
          actor.money = Math.max(0, actor.money - 12);
          log(state, events, `${actor.name} is undercutting prices near ${location.name}.`, "warning");
        }
      }

      if (command.action === "expand" && command.locationId) {
        const location = state.locations[command.locationId];
        if (location && !machineAtLocation(state, location.id)) {
          createMachine(state, actor.id, location.id);
          actor.money = Math.max(0, actor.money - Math.round(location.placementCost * 0.65));
          log(state, events, `${actor.name} dropped a new machine at ${location.name}.`, "danger");
        }
      }
      break;
    }
  }

  maybeCompleteMission(state, events);

  return { state, events };
}

export function reduceCommands(state: GameState, commands: GameCommand[]): CommandResult {
  let nextState = state;
  const allEvents: GameEvent[] = [];

  for (const command of commands) {
    const result = reduceGameState(nextState, command);
    nextState = result.state;
    allEvents.push(...result.events);
  }

  return { state: nextState, events: allEvents };
}

export function mostProfitablePlayerMachine(state: GameState): VendingMachine | undefined {
  return ownedMachines(state, state.playerFactionId)
    .slice()
    .sort((a, b) => b.revenueStored + b.slots.length * 4 - (a.revenueStored + a.slots.length * 4))[0];
}
