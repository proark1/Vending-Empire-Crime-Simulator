import type {
  FactionId,
  GameEventTone,
  GameState,
  MachineHistoryEvent,
  MachineId,
  MachineTraitId,
  MachineTraitState,
  Product,
  RivalMemoryKind,
  RivalMemoryState,
  RunModifierId,
  VendingMachine
} from "../core/types";

export interface RunModifierDefinition {
  id: RunModifierId;
  name: string;
  description: string;
  openingLine: string;
  effects: {
    contractRewardMultiplier?: number;
    greyDemandMultiplier?: number;
    inspectionRiskMultiplier?: number;
    redlineUndercutHoursDelta?: number;
    studentDemandMultiplier?: number;
    supplierCostMultiplier?: number;
  };
}

export interface MachineTraitDefinition {
  id: MachineTraitId;
  name: string;
  description: string;
  effects: {
    demandMultiplier?: number;
    greyDemandMultiplier?: number;
    inspectionRiskMultiplier?: number;
    rivalPressureMultiplier?: number;
    sabotageDamageMultiplier?: number;
  };
}

export const runModifierDefinitions: Record<RunModifierId, RunModifierDefinition> = {
  inspection_crackdown: {
    id: "inspection_crackdown",
    name: "Inspection Crackdown",
    description: "Inspectors move faster, but clean paperwork pays better.",
    openingLine: "City inspectors are looking for easy wins this week. Legal contracts carry more value; messy stock carries more risk.",
    effects: {
      contractRewardMultiplier: 1.12,
      inspectionRiskMultiplier: 1.28
    }
  },
  supplier_shortage: {
    id: "supplier_shortage",
    name: "Supplier Shortage",
    description: "Stock costs more, while service contracts pay harder.",
    openingLine: "Backdoor Wholesale is short on easy pallets. Every crate hurts, every fulfilled promise matters.",
    effects: {
      contractRewardMultiplier: 1.18,
      supplierCostMultiplier: 1.16
    }
  },
  redline_price_war: {
    id: "redline_price_war",
    name: "Redline Price War",
    description: "Redline pressures the starter route sooner.",
    openingLine: "Redline is burning cash on stickers and rumors. The first route will be contested earlier.",
    effects: {
      redlineUndercutHoursDelta: -4
    }
  },
  night_market_boom: {
    id: "night_market_boom",
    name: "Night Market Boom",
    description: "Fictional grey goods sell faster and draw sharper heat.",
    openingLine: "Neon demand is loud before the sun goes down. Grey shelves can print money if you can carry the heat.",
    effects: {
      greyDemandMultiplier: 1.22,
      inspectionRiskMultiplier: 1.08
    }
  },
  student_rush: {
    id: "student_rush",
    name: "Student Rush",
    description: "Student-tagged products sell harder across starter and campus routes.",
    openingLine: "A student rush is spilling across cheap routes. Snacks, drinks, and study-night shelves move faster.",
    effects: {
      studentDemandMultiplier: 1.18
    }
  }
};

export const machineTraitDefinitions: Record<MachineTraitId, MachineTraitDefinition> = {
  local_favorite: {
    id: "local_favorite",
    name: "Local Favorite",
    description: "Regulars trust this stop, lifting demand.",
    effects: {
      demandMultiplier: 1.12
    }
  },
  rival_tagged: {
    id: "rival_tagged",
    name: "Rival Tagged",
    description: "This machine has visible beef attached to it.",
    effects: {
      rivalPressureMultiplier: 1.12,
      inspectionRiskMultiplier: 1.05
    }
  },
  reliable_earner: {
    id: "reliable_earner",
    name: "Reliable Earner",
    description: "A proven cash stop with steadier sales.",
    effects: {
      demandMultiplier: 1.08
    }
  },
  complaint_magnet: {
    id: "complaint_magnet",
    name: "Complaint Magnet",
    description: "Customers and inspectors keep noticing this machine.",
    effects: {
      demandMultiplier: 0.96,
      inspectionRiskMultiplier: 1.18
    }
  },
  crew_protected: {
    id: "crew_protected",
    name: "Crew Protected",
    description: "Assigned crew make sabotage less punishing.",
    effects: {
      sabotageDamageMultiplier: 0.72
    }
  },
  cult_shelf: {
    id: "cult_shelf",
    name: "Cult Shelf",
    description: "Grey-stock customers whisper about this shelf.",
    effects: {
      greyDemandMultiplier: 1.2,
      inspectionRiskMultiplier: 1.08
    }
  }
};

export function chooseRunModifier(seed: number): RunModifierDefinition {
  const modifiers = Object.values(runModifierDefinitions);
  const index = Math.abs(Math.trunc(seed)) % modifiers.length;
  return modifiers[index] ?? runModifierDefinitions.supplier_shortage;
}

export function createReplayState(seed = 1): GameState["replay"] {
  const modifier = chooseRunModifier(seed);
  return {
    runSeed: seed,
    modifier: {
      id: modifier.id,
      startedHour: 8
    },
    machineHistory: {},
    machineTraits: {},
    rivalMemory: {},
    strategyUnlocks: []
  };
}

export function activeRunModifier(state: GameState): RunModifierDefinition {
  return runModifierDefinitions[state.replay?.modifier?.id] ?? chooseRunModifier(state.replay?.runSeed ?? 1);
}

export function machineTraitsFor(state: GameState, machineId: MachineId): MachineTraitState[] {
  return state.replay?.machineTraits?.[machineId] ?? [];
}

export function machineTraitMultiplier(state: GameState, machine: VendingMachine, product?: Product): number {
  const traits = machineTraitsFor(state, machine.id);
  const modifier = activeRunModifier(state);
  const productIsGrey = product?.category === "fictional-grey" || product?.category === "fictional-contraband";
  const productIsStudent = product?.demandTags.includes("student") ?? false;

  return traits.reduce((multiplier, trait) => {
    const effects = machineTraitDefinitions[trait.id]?.effects;
    const demand = effects?.demandMultiplier ?? 1;
    const grey = productIsGrey ? effects?.greyDemandMultiplier ?? 1 : 1;
    return multiplier * demand * grey;
  }, 1) * (productIsGrey ? modifier.effects.greyDemandMultiplier ?? 1 : 1) * (productIsStudent ? modifier.effects.studentDemandMultiplier ?? 1 : 1);
}

export function machineInspectionRiskMultiplier(state: GameState, machine: VendingMachine): number {
  const modifier = activeRunModifier(state);
  return machineTraitsFor(state, machine.id).reduce((multiplier, trait) => {
    return multiplier * (machineTraitDefinitions[trait.id]?.effects.inspectionRiskMultiplier ?? 1);
  }, modifier.effects.inspectionRiskMultiplier ?? 1);
}

export function machineSabotageDamageMultiplier(state: GameState, machine: VendingMachine): number {
  return machineTraitsFor(state, machine.id).reduce((multiplier, trait) => {
    return multiplier * (machineTraitDefinitions[trait.id]?.effects.sabotageDamageMultiplier ?? 1);
  }, 1);
}

export function addMachineHistory(state: GameState, machineId: MachineId, type: MachineHistoryEvent["type"], message: string, tone: GameEventTone = "neutral"): void {
  state.replay ??= createReplayState();
  const history = state.replay.machineHistory[machineId] ?? [];
  state.replay.machineHistory[machineId] = [
    {
      hour: state.worldTimeHours,
      message,
      tone,
      type
    },
    ...history
  ].slice(0, 8);
}

export function addMachineTrait(state: GameState, machine: VendingMachine, traitId: MachineTraitId, source: string): boolean {
  state.replay ??= createReplayState();
  const traits = state.replay.machineTraits[machine.id] ?? [];
  if (traits.some((trait) => trait.id === traitId)) {
    return false;
  }

  state.replay.machineTraits[machine.id] = [
    ...traits,
    {
      id: traitId,
      acquiredHour: state.worldTimeHours,
      source
    }
  ];
  addMachineHistory(state, machine.id, "trait", `${machineTraitDefinitions[traitId].name}: ${source}`, "good");
  return true;
}

export function recordRivalMemory(state: GameState, factionId: FactionId, kind: RivalMemoryKind): RivalMemoryState {
  state.replay ??= createReplayState();
  const current = state.replay.rivalMemory[factionId] ?? {
    alarmConfronted: 0,
    disruption: 0,
    exposure: 0,
    expansion: 0,
    factionId,
    negotiation: 0,
    sabotage: 0,
    undercut: 0
  };
  const key = kind === "alarm_confronted" ? "alarmConfronted" : kind === "negotiate" ? "negotiation" : kind === "expose" ? "exposure" : kind === "disrupt" ? "disruption" : kind;
  const currentValue = current[key as keyof RivalMemoryState];
  const currentCount = typeof currentValue === "number" ? currentValue : 0;
  state.replay.rivalMemory[factionId] = {
    ...current,
    [key]: currentCount + 1,
    lastInteractionHour: state.worldTimeHours
  };
  return state.replay.rivalMemory[factionId];
}

export function addStrategyUnlock(state: GameState, unlock: string): boolean {
  state.replay ??= createReplayState();
  if (state.replay.strategyUnlocks.includes(unlock)) {
    return false;
  }

  state.replay.strategyUnlocks = [...state.replay.strategyUnlocks, unlock].slice(-16);
  return true;
}

export function replayEndingSummary(state: GameState, baseSummary: string): string {
  const modifier = activeRunModifier(state);
  const installed = Object.values(state.machines).filter((machine) => machine.ownerFactionId === state.playerFactionId && (machine.placementStatus ?? "installed") === "installed");
  const legalCount = installed.filter((machine) => machine.placementMethod === "legal_contract").length;
  const riskyCount = installed.filter((machine) => machine.placementMethod !== "legal_contract").length;
  const traitCount = Object.values(state.replay?.machineTraits ?? {}).reduce((sum, traits) => sum + traits.length, 0);
  const strongestMemory = Object.values(state.replay?.rivalMemory ?? {})
    .sort((a, b) => {
      const aTotal = a.undercut + a.sabotage + a.expansion + a.negotiation + a.exposure + a.disruption + a.alarmConfronted;
      const bTotal = b.undercut + b.sabotage + b.expansion + b.negotiation + b.exposure + b.disruption + b.alarmConfronted;
      return bTotal - aTotal;
    })[0];
  const rivalName = strongestMemory ? state.factions[strongestMemory.factionId]?.name ?? strongestMemory.factionId : "the rivals";
  const unlockNote = state.replay?.strategyUnlocks?.length ? `Key unlocks: ${state.replay.strategyUnlocks.slice(-3).join(", ")}.` : "No special unlocks defined the run.";

  return `${baseSummary} This run started under ${modifier.name}. You ended with ${installed.length} machines (${legalCount} legal, ${riskyCount} risky), ${traitCount} machine traits, and your loudest rivalry was with ${rivalName}. ${unlockNote}`;
}

function loudestRivalFactionId(state: GameState): FactionId | undefined {
  const strongest = Object.values(state.replay?.rivalMemory ?? {})
    .map((memory) => ({
      factionId: memory.factionId,
      total: memory.undercut + memory.sabotage + memory.expansion + memory.negotiation + memory.exposure + memory.disruption + memory.alarmConfronted
    }))
    .sort((a, b) => b.total - a.total)[0];
  return strongest && strongest.total > 0 ? strongest.factionId : undefined;
}

/**
 * New Game Plus: seed a fresh run from the previous run's legacy. Returns true when
 * anything carried over (so a first-ever restart with no history stays a plain run).
 * - Strategy unlocks carry forward as a small, capped starting-cash leg-up.
 * - The previous run's loudest rival keeps its grudge (a persistent memory the AI
 *   reads as vengeance, so they come after the player sooner this run).
 */
export function applyRunLegacy(nextState: GameState, previousState: GameState): boolean {
  const unlocks = previousState.replay?.strategyUnlocks ?? [];
  const rivalFactionId = loudestRivalFactionId(previousState);
  if (unlocks.length === 0 && !rivalFactionId) {
    return false;
  }

  const priorRunCount = previousState.replay?.legacy?.runCount ?? 0;
  // NG+ compounds instead of being flat: the unlock-based leg-up is joined by a
  // veteran bonus that grows with each completed run, so repeat runs feel
  // cumulative rather than a fixed $150 head start.
  const unlockBonus = Math.min(150, unlocks.length * 25);
  const veteranBonus = Math.min(200, priorRunCount * 40);
  const startingBonus = unlockBonus + veteranBonus;

  nextState.replay.legacy = {
    unlocks: unlocks.slice(-8),
    rivalFactionId,
    runCount: priorRunCount + 1,
    startingBonus
  };

  const player = nextState.factions[nextState.playerFactionId];
  if (player) {
    if (startingBonus > 0) {
      player.money += startingBonus;
    }
    // Your reputation precedes you a little more each cycle.
    player.streetReputation += Math.min(6, priorRunCount * 1.5);
  }

  // Grudge escalates with run count: the loudest rival remembers more each cycle,
  // coming after the player sooner (and, at higher exposure, harder) on later
  // runs. Base 2 (pushback), climbing to 5 so veteran runs get real heat.
  if (rivalFactionId && nextState.factions[rivalFactionId]) {
    nextState.replay.rivalMemory[rivalFactionId] = {
      alarmConfronted: 0,
      disruption: 0,
      exposure: Math.min(5, 2 + priorRunCount),
      expansion: 0,
      factionId: rivalFactionId,
      negotiation: 0,
      sabotage: 0,
      undercut: 0,
      lastInteractionHour: nextState.worldTimeHours
    };
  }

  return true;
}
