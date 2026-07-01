import type { GameState } from "../core/types";
import { createInitialState } from "../content/initialState";
import { createReplayState } from "../content/replayability";

const SAVE_KEY = "vendetta-vending.save.v1";

function isInstalledMachine(machine: { placementStatus?: string }): boolean {
  return (machine.placementStatus ?? "installed") === "installed";
}

const migratedEmployeeTraits = [
  {
    label: "Steady hands",
    description: "Handles crates and repairs cleanly."
  },
  {
    label: "Local face",
    description: "Knows which landlord or clerk needs a calm word."
  },
  {
    label: "Night nerve",
    description: "Keeps moving when alarms and route trouble spike."
  },
  {
    label: "Fast ledger",
    description: "Turns cash stops and inventory counts around quickly."
  }
];

function migratedEmployeeTrait(employeeNumber: number | undefined): { label: string; description: string } {
  return migratedEmployeeTraits[Math.max(0, ((employeeNumber ?? 1) - 1) % migratedEmployeeTraits.length)];
}

function ensureStarterBankroll(state: GameState, baseline: GameState): GameState {
  const player = state.factions[state.playerFactionId];
  const starter = state.machines.machine_player_1;
  if (!player || !starter) {
    return state;
  }

  const playerHasInstalledMachine = Object.values(state.machines).some((machine) => machine.ownerFactionId === state.playerFactionId && isInstalledMachine(machine));
  const routeHasNotStarted = !playerHasInstalledMachine && !state.progression.starterMachinePlaced;
  const starterStoredAndBroken = !isInstalledMachine(starter) && starter.damage > 0;
  const starterCash = baseline.factions[baseline.playerFactionId].money;

  if (routeHasNotStarted && starterStoredAndBroken && player.money < starterCash) {
    player.money = starterCash;
    if (!state.eventLog.some((event) => event.id === "tutorial_starter_float")) {
      state.eventLog = [
        {
          id: "tutorial_starter_float",
          hour: state.worldTimeHours,
          tone: "good" as const,
          message: `Starter tutorial float restored: $${starterCash} is available for the repair and first stock run.`
        },
        ...state.eventLog
      ].slice(0, 80);
    }
  }

  return state;
}

export function migrateGameState(parsed: GameState): GameState {
  const baseline = createInitialState();
  if (parsed.version !== baseline.version) {
    return baseline;
  }

  const parsedPlayer = (parsed.player ?? baseline.player) as Partial<GameState["player"]>;
  const parsedPlayerRecord = parsedPlayer as Record<string, unknown>;
  const isLegacyLogistics = !("garageStorage" in parsedPlayerRecord) && !("carriedCrate" in parsedPlayerRecord);
  const garageStorage = isLegacyLogistics
    ? {
        ...baseline.player.garageStorage,
        ...(parsedPlayer.cargo ?? {})
      }
    : {
        ...baseline.player.garageStorage,
        ...(parsedPlayer.garageStorage ?? {})
      };
  const districts = Object.fromEntries(
      Object.entries({
        ...baseline.districts,
        ...(parsed.districts ?? {})
      }).map(([districtId, district]) => [
        districtId,
        {
          ...district,
          ...(baseline.districts[districtId] ?? {}),
          customerArchetypes: baseline.districts[districtId]?.customerArchetypes ?? district.customerArchetypes ?? [],
          riskFlavor: baseline.districts[districtId]?.riskFlavor ?? district.riskFlavor ?? ""
        }
      ])
  );
  const districtProgress = Object.fromEntries(
    Object.keys(districts).map((districtId) => [
      districtId,
      {
        ...(baseline.districtProgress[districtId] ?? {
          access: districtId === "starter_suburb" ? "unlocked" : "locked",
          districtId
        }),
        ...(parsed.districtProgress?.[districtId] ?? {}),
        districtId
      }
    ])
  );
  const locations = Object.fromEntries(
    Object.entries({
      ...baseline.locations,
      ...(parsed.locations ?? {})
    }).map(([locationId, location]) => [
      locationId,
      {
        ...location,
        ...(baseline.locations[locationId] ?? {}),
        rivalPressure: location.rivalPressure ?? baseline.locations[locationId]?.rivalPressure ?? 0
      }
    ])
  );
  const rivalOrganizations = Object.fromEntries(
    Object.entries({
      ...baseline.rivalOrganizations,
      ...(parsed.rivalOrganizations ?? {})
    }).map(([factionId, organization]) => {
      const baselineOrganization = baseline.rivalOrganizations[factionId];
      const parsedOperations = Array.isArray(organization.operations) ? organization.operations : baselineOrganization?.operations ?? [];
      return [
        factionId,
        {
          ...baselineOrganization,
          ...organization,
          factionId,
          operations: parsedOperations.map((operation, index) => {
            const fallback = baselineOrganization?.operations[index];
            return {
              ...fallback,
              ...operation,
              factionId: operation.factionId ?? factionId,
              exposed: operation.exposed ?? false,
              progress: operation.progress ?? fallback?.progress ?? 0,
              strength: operation.strength ?? fallback?.strength ?? 0.5,
              startedHour: operation.startedHour ?? fallback?.startedHour ?? baseline.worldTimeHours
            };
          })
        }
      ];
    })
  ) as GameState["rivalOrganizations"];

  const migrated: GameState = {
    ...baseline,
    ...parsed,
    nextEmployeeNumber: parsed.nextEmployeeNumber ?? baseline.nextEmployeeNumber,
    player: {
      ...baseline.player,
      ...parsedPlayer,
      activeVehicleId: parsedPlayer.activeVehicleId ?? baseline.player.activeVehicleId,
      currentLocationId: parsedPlayer.currentLocationId ?? baseline.player.currentLocationId,
      cargo: isLegacyLogistics ? {} : parsedPlayer.cargo ?? {},
      cargoCapacity: isLegacyLogistics ? baseline.player.cargoCapacity : parsedPlayer.cargoCapacity ?? baseline.player.cargoCapacity,
      carriedCrate: parsedPlayer.carriedCrate ?? null,
      garageStorage,
      garageCapacity: parsedPlayer.garageCapacity ?? baseline.player.garageCapacity
    },
    products: {
      ...baseline.products,
      ...parsed.products
    },
    districts,
    districtProgress,
    locations,
    factions: {
      ...baseline.factions,
      ...parsed.factions
    },
    npcControllers: {
      ...baseline.npcControllers,
      ...parsed.npcControllers
    },
    machineAlarms: parsed.machineAlarms ?? baseline.machineAlarms,
    law: {
      ...baseline.law,
      ...(parsed.law ?? {}),
      activeInspections: parsed.law?.activeInspections ?? baseline.law.activeInspections
    },
    mission: {
      ...baseline.mission,
      ...(parsed.mission ?? {}),
      campaign: parsed.mission?.campaign ?? baseline.mission.campaign,
      quests: parsed.mission?.quests ?? baseline.mission.quests
    },
    streetLife: {
      ...baseline.streetLife,
      ...(parsed.streetLife ?? {}),
      recentActivities: Array.isArray(parsed.streetLife?.recentActivities) ? parsed.streetLife.recentActivities : baseline.streetLife.recentActivities
    },
    machines: Object.fromEntries(
      Object.entries(parsed.machines ?? baseline.machines).map(([machineId, machine]) => [
        machineId,
        {
          ...machine,
          machineModelId: machine.machineModelId ?? baseline.machines[machineId]?.machineModelId ?? "basic_snack",
          placementStatus: machine.placementStatus ?? "installed",
          placementMethod: machine.placementMethod ?? "legal_contract",
          upgrades: Array.isArray(machine.upgrades) ? machine.upgrades : []
        }
      ])
    ),
    vehicles: Object.fromEntries(
      Object.entries({
        ...baseline.vehicles,
        ...(parsed.vehicles ?? {})
      }).map(([vehicleId, vehicle]) => [
        vehicleId,
        {
          ...vehicle,
          inventory: vehicle.inventory ?? {},
          escapeRating: vehicle.escapeRating ?? baseline.vehicles[vehicleId]?.escapeRating ?? 0.35,
          condition: vehicle.condition ?? baseline.vehicles[vehicleId]?.condition ?? 1,
          position: vehicle.position ?? baseline.vehicles[vehicleId]?.position,
          heading: vehicle.heading ?? baseline.vehicles[vehicleId]?.heading,
          odometer: vehicle.odometer ?? baseline.vehicles[vehicleId]?.odometer ?? 0,
          upgrades: Array.isArray(vehicle.upgrades) ? vehicle.upgrades : []
        }
      ])
    ),
    employees: Object.fromEntries(
      Object.entries(parsed.employees ?? baseline.employees).map(([employeeId, employee]) => [
        employeeId,
        {
          ...employee,
          betrayed: employee.betrayed ?? false,
          level: employee.level ?? 1,
          xp: employee.xp ?? 0,
          routePhase: employee.routePhase ?? "idle",
          trait: employee.trait ?? migratedEmployeeTrait(employee.employeeNumber).label,
          traitDescription: employee.traitDescription ?? migratedEmployeeTrait(employee.employeeNumber).description
        }
      ])
    ),
    base: {
      ...baseline.base,
      ...(parsed.base ?? {}),
      facilities: Object.fromEntries(
        Object.entries(baseline.base.facilities).map(([facilityId, facility]) => [
          facilityId,
          {
            ...facility,
            ...(parsed.base?.facilities?.[facilityId as keyof typeof baseline.base.facilities] ?? {}),
            id: facilityId
          }
        ])
      ) as GameState["base"]["facilities"]
    },
    economy: {
      ...baseline.economy,
      ...(parsed.economy ?? {}),
      finance: {
        ...baseline.economy.finance,
        ...(parsed.economy?.finance ?? {}),
        ledger: Array.isArray(parsed.economy?.finance?.ledger) ? parsed.economy.finance.ledger : baseline.economy.finance.ledger
      },
      supply: {
        ...baseline.economy.supply,
        ...(parsed.economy?.supply ?? {}),
        priceMultipliers: parsed.economy?.supply?.priceMultipliers ?? baseline.economy.supply.priceMultipliers,
        suppliers: {
          ...baseline.economy.supply.suppliers,
          ...(parsed.economy?.supply?.suppliers ?? {})
        },
        activeDeals: parsed.economy?.supply?.activeDeals ?? baseline.economy.supply.activeDeals
      },
      traffic: {
        ...baseline.economy.traffic,
        ...(parsed.economy?.traffic ?? {}),
        congestionByLocation: parsed.economy?.traffic?.congestionByLocation ?? baseline.economy.traffic.congestionByLocation,
        checkpoints: parsed.economy?.traffic?.checkpoints ?? baseline.economy.traffic.checkpoints,
        vehicleMaintenanceDue: {
          ...baseline.economy.traffic.vehicleMaintenanceDue,
          ...(parsed.economy?.traffic?.vehicleMaintenanceDue ?? {})
        }
      },
      spoilage: {
        ...baseline.economy.spoilage,
        ...(parsed.economy?.spoilage ?? {})
      },
      fleet: {
        ...baseline.economy.fleet,
        ...(parsed.economy?.fleet ?? {}),
        modelExperience: {
          ...baseline.economy.fleet.modelExperience,
          ...(parsed.economy?.fleet?.modelExperience ?? {})
        },
        unlockedModelIds: Array.isArray(parsed.economy?.fleet?.unlockedModelIds)
          ? parsed.economy.fleet.unlockedModelIds
          : baseline.economy.fleet.unlockedModelIds
      },
      customers: {
        ...baseline.economy.customers,
        ...(parsed.economy?.customers ?? {}),
        complaintsByLocation: parsed.economy?.customers?.complaintsByLocation ?? baseline.economy.customers.complaintsByLocation,
        loyaltyByLocation: parsed.economy?.customers?.loyaltyByLocation ?? baseline.economy.customers.loyaltyByLocation,
        recentDecisions: Array.isArray(parsed.economy?.customers?.recentDecisions) ? parsed.economy.customers.recentDecisions : baseline.economy.customers.recentDecisions
      },
      districtEvents: {
        ...baseline.economy.districtEvents,
        ...(parsed.economy?.districtEvents ?? {}),
        activeEvents: parsed.economy?.districtEvents?.activeEvents ?? baseline.economy.districtEvents.activeEvents
      },
      locationRights: Object.fromEntries(
        Object.keys(locations).map((locationId) => [
          locationId,
          {
            ...(baseline.economy.locationRights[locationId] ?? {
              corporatePressure: 0,
              landlordDisposition: 45,
              legalPressure: 0,
              locationId,
              permitStatus: "none" as const,
              rightsTier: "none" as const
            }),
            ...(parsed.economy?.locationRights?.[locationId] ?? {}),
            locationId
          }
        ])
      ),
      productCustomizations: parsed.economy?.productCustomizations ?? baseline.economy.productCustomizations
    },
    routePlan: {
      ...baseline.routePlan,
      ...(parsed.routePlan ?? {})
    },
    replay: {
      ...createReplayState(parsed.replay?.runSeed ?? baseline.replay.runSeed),
      ...(parsed.replay ?? {}),
      machineHistory: parsed.replay?.machineHistory ?? {},
      machineTraits: parsed.replay?.machineTraits ?? {},
      rivalMemory: parsed.replay?.rivalMemory ?? {},
      strategyUnlocks: Array.isArray(parsed.replay?.strategyUnlocks) ? parsed.replay.strategyUnlocks : []
    },
    contracts: {
      ...baseline.contracts,
      ...(parsed.contracts ?? {})
    },
    conflict: {
      ...baseline.conflict,
      ...(parsed.conflict ?? {}),
      activeEvents: Object.fromEntries(
        Object.entries(parsed.conflict?.activeEvents ?? baseline.conflict.activeEvents).map(([eventId, event]) => [
          eventId,
          {
            ...event,
            encounter: event.encounter
              ? {
                  advantage: event.encounter.advantage ?? 0,
                  chaseProgress: event.encounter.chaseProgress ?? 0,
                  enemyFocus: event.encounter.enemyFocus ?? 50,
                  enemyHealth: event.encounter.enemyHealth ?? 50,
                  playerHealth: event.encounter.playerHealth ?? 100,
                  playerStamina: event.encounter.playerStamina ?? 100
                }
              : event.encounter
          }
        ])
      )
    },
    rivalOrganizations,
    empire: {
      ...baseline.empire,
      ...(parsed.empire ?? {}),
      activeRaids: parsed.empire?.activeRaids ?? baseline.empire.activeRaids,
      assets: {
        ...baseline.empire.assets,
        ...(parsed.empire?.assets ?? {})
      },
      endingExecutions: parsed.empire?.endingExecutions ?? baseline.empire.endingExecutions
    },
    dayReports: (parsed.dayReports ?? baseline.dayReports).map((report) => ({
      ...report,
      operatingRevenue: report.operatingRevenue ?? 0,
      operatingExpenses: report.operatingExpenses ?? 0,
      netCashflow: report.netCashflow ?? 0
    })),
    progression: {
      ...baseline.progression,
      ...(parsed.progression ?? {}),
      contractsCompletedTotal: parsed.progression?.contractsCompletedTotal ?? parsed.progression?.contractsCompletedToday ?? baseline.progression.contractsCompletedTotal,
      productDesignsCompleted: parsed.progression?.productDesignsCompleted ?? Object.keys(parsed.economy?.productCustomizations ?? {}).length,
      starterMachinePlaced: parsed.progression?.starterMachinePlaced ?? baseline.progression.starterMachinePlaced,
      starterMachinePlacedHour: parsed.progression?.starterMachinePlacedHour ?? baseline.progression.starterMachinePlacedHour,
      firstUndercutTriggered: parsed.progression?.firstUndercutTriggered ?? baseline.progression.firstUndercutTriggered,
      firstRetaliationTriggered: parsed.progression?.firstRetaliationTriggered ?? baseline.progression.firstRetaliationTriggered
    },
    pacing: {
      ...baseline.pacing,
      ...(parsed.pacing ?? {})
    }
  };

  return ensureStarterBankroll(migrated, baseline);
}

export function loadGame(): GameState {
  const raw = window.localStorage.getItem(SAVE_KEY);
  if (!raw) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(raw) as GameState;
    return migrateGameState(parsed);
  } catch {
    return createInitialState();
  }
}

export function saveGame(state: GameState): number {
  const payload = JSON.stringify(state);
  window.localStorage.setItem(SAVE_KEY, payload);
  return payload.length;
}

export function clearSave(): void {
  window.localStorage.removeItem(SAVE_KEY);
}
