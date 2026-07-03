const ONE_HOUR_MS = 60 * 60 * 1000;

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectValues(value) {
  return value && typeof value === "object" ? Object.values(value) : [];
}

function inventoryUnits(inventory) {
  return Object.values(inventory ?? {}).reduce((sum, value) => sum + Math.max(0, asNumber(value)), 0);
}

function machineStockUnits(machine) {
  return Array.isArray(machine?.slots)
    ? machine.slots.reduce((sum, slot) => sum + Math.max(0, asNumber(slot?.quantity)), 0)
    : 0;
}

function activeCollection(items, nowHours) {
  return objectValues(items).filter((item) => {
    const status = item?.status;
    const resolved = item?.resolved === true || status === "resolved" || status === "missed";
    const activeStatus = status === undefined || status === "active";
    return !resolved && activeStatus && asNumber(item?.expiresHour ?? item?.deadlineHour, nowHours + 1) > nowHours;
  });
}

function missionPhase(state, installedCount, activeAlarms, activeInspections) {
  if (activeInspections > 0) {
    return "inspection";
  }
  if (activeAlarms > 0) {
    return "rival pressure";
  }
  if (objectValues(state?.empire?.endingExecutions).some((ending) => ending?.status === "executed")) {
    return "ending reached";
  }
  if (state?.districtProgress?.industrial_yards?.access === "unlocked") {
    return "iron yard open";
  }
  if (state?.mission?.completed) {
    return "starter complete";
  }
  if (installedCount >= 1) {
    return "starter route";
  }
  return "pre-route";
}

function pushIssue(issues, severity, code, title, detail, profileName) {
  issues.push({ code, detail, profileName, severity, title });
}

export function analyzeLiveOpsSaveRows(rows, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const staleSaveHours = options.staleSaveHours ?? 24;
  const players = [];
  const issues = [];
  const phaseCounts = {};
  let recentSaves = 0;
  let staleSaves = 0;
  let totalRevision = 0;
  let profilesWithSaves = 0;
  let activeAlarmPlayers = 0;
  let activeInspectionPlayers = 0;
  let endingPlayers = 0;
  let totalInstalledMachines = 0;

  for (const row of rows) {
    const profileName = String(row.name ?? row.profile_name ?? row.profileId ?? "Unknown player");
    const profileId = String(row.profile_id ?? row.profileId ?? profileName);
    const updatedAt = row.updated_at ?? row.updatedAt ?? null;
    const revision = asNumber(row.revision, 0);
    const updatedDate = updatedAt ? new Date(updatedAt) : null;
    const saveAgeHours = updatedDate && Number.isFinite(updatedDate.getTime()) ? Math.max(0, (now.getTime() - updatedDate.getTime()) / ONE_HOUR_MS) : null;

    if (!row.state) {
      const player = {
        activeAlarms: 0,
        activeInspections: 0,
        cash: 0,
        day: 1,
        flags: ["no save"],
        heat: 0,
        installedMachines: 0,
        missionPhase: "no save",
        profileId,
        profileName,
        revision,
        saveAgeHours,
        stockUnits: 0,
        unlockedDistricts: 0,
        updatedAt
      };
      players.push(player);
      phaseCounts[player.missionPhase] = (phaseCounts[player.missionPhase] ?? 0) + 1;
      pushIssue(issues, "warning", "no_save", "Player has no save", "Registered profile has not created a run yet.", profileName);
      continue;
    }

    const state = row.state;
    if (typeof state !== "object") {
      const player = {
        activeAlarms: 0,
        activeInspections: 0,
        cash: 0,
        day: 1,
        flags: ["bad save"],
        heat: 0,
        installedMachines: 0,
        missionPhase: "bad save",
        profileId,
        profileName,
        revision,
        saveAgeHours,
        stockUnits: 0,
        unlockedDistricts: 0,
        updatedAt
      };
      players.push(player);
      phaseCounts[player.missionPhase] = (phaseCounts[player.missionPhase] ?? 0) + 1;
      pushIssue(issues, "error", "bad_save", "Unreadable save state", "Save state is not an object.", profileName);
      continue;
    }

    profilesWithSaves += 1;
    totalRevision += revision;
    if (saveAgeHours !== null && saveAgeHours <= 1) {
      recentSaves += 1;
    }
    if (saveAgeHours !== null && saveAgeHours >= staleSaveHours) {
      staleSaves += 1;
    }

    const playerFactionId = state.playerFactionId ?? "player";
    const faction = state.factions?.[playerFactionId] ?? {};
    const empireName = typeof state.player?.empireName === "string" ? state.player.empireName.trim().slice(0, 28) : "";
    const cash = asNumber(faction.money);
    const heat = asNumber(faction.heat);
    const worldTimeHours = asNumber(state.worldTimeHours, 8);
    const machines = objectValues(state.machines);
    const playerMachines = machines.filter((machine) => machine?.ownerFactionId === playerFactionId && (machine?.placementStatus ?? "installed") === "installed");
    const installedMachines = playerMachines.length;
    const stockedMachines = playerMachines.filter((machine) => machineStockUnits(machine) > 0).length;
    const machineStock = playerMachines.reduce((sum, machine) => sum + machineStockUnits(machine), 0);
    const garageStock = inventoryUnits(state.player?.garageStorage);
    const cargoStock = inventoryUnits(state.player?.cargo);
    const carriedStock = asNumber(state.player?.carriedCrate?.quantity);
    const stockUnits = machineStock + garageStock + cargoStock + carriedStock;
    const activeAlarms = activeCollection(state.machineAlarms, worldTimeHours).length;
    const activeInspections = activeCollection(state.law?.activeInspections, worldTimeHours).length;
    const unlockedDistricts = objectValues(state.districtProgress).filter((progress) => progress?.access === "unlocked").length;
    const endings = objectValues(state.empire?.endingExecutions).filter((ending) => ending?.status === "executed").length;
    const phase = missionPhase(state, installedMachines, activeAlarms, activeInspections);
    const flags = [];

    if (saveAgeHours !== null && saveAgeHours >= staleSaveHours) {
      flags.push("stale save");
      pushIssue(issues, "warning", "stale_save", "Stale save", `Last save is ${Math.round(saveAgeHours)}h old.`, profileName);
    }
    if (worldTimeHours >= 10 && installedMachines === 0) {
      flags.push("no machines");
      pushIssue(issues, "error", "no_machine_after_start", "No machine after route start", `World time is ${worldTimeHours.toFixed(1)}h with no installed player machines.`, profileName);
    }
    if (installedMachines > 0 && stockedMachines === 0) {
      flags.push("machines empty");
      pushIssue(issues, "warning", "empty_machines", "Machines have no stock", "Player owns machines but none have stocked slots.", profileName);
    }
    if (cash < 8 && stockUnits <= 0 && installedMachines < 2) {
      flags.push("broke");
      pushIssue(issues, "error", "broke_no_stock", "Broke with no stock", `Cash $${Math.round(cash)} and no owned stock.`, profileName);
    }
    if (activeAlarms > 0) {
      flags.push("alarm");
      activeAlarmPlayers += 1;
      pushIssue(issues, "warning", "active_alarm", "Active machine alarm", `${activeAlarms} unresolved alarm${activeAlarms === 1 ? "" : "s"}.`, profileName);
    }
    if (activeInspections > 0) {
      flags.push("inspection");
      activeInspectionPlayers += 1;
      pushIssue(issues, "warning", "active_inspection", "Active law inspection", `${activeInspections} inspection${activeInspections === 1 ? "" : "s"} awaiting response.`, profileName);
    }
    if (heat >= 45 && cash < 50) {
      flags.push("hot and broke");
      pushIssue(issues, "error", "high_heat_low_cash", "High heat with low cash", `Heat ${Math.round(heat)} and cash $${Math.round(cash)}.`, profileName);
    }
    if (endings > 0) {
      endingPlayers += 1;
    }

    totalInstalledMachines += installedMachines;
    phaseCounts[phase] = (phaseCounts[phase] ?? 0) + 1;
    players.push({
      activeAlarms,
      activeInspections,
      cash: Math.round(cash),
      day: Math.max(1, Math.floor(worldTimeHours / 24) + 1),
      empireName,
      flags,
      heat: Math.round(heat),
      installedMachines,
      missionPhase: phase,
      profileId,
      profileName,
      revision,
      saveAgeHours,
      stockUnits,
      unlockedDistricts,
      updatedAt
    });
  }

  const severityOrder = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
  players.sort((a, b) => (b.saveAgeHours ?? Number.POSITIVE_INFINITY) - (a.saveAgeHours ?? Number.POSITIVE_INFINITY));

  return {
    issues: issues.slice(0, 80),
    phaseCounts,
    players,
    summary: {
      activeAlarmPlayers,
      activeInspectionPlayers,
      averageRevision: profilesWithSaves > 0 ? Number((totalRevision / profilesWithSaves).toFixed(1)) : 0,
      endingPlayers,
      playerCount: rows.length,
      profilesWithSaves,
      recentSaves,
      staleSaves,
      totalInstalledMachines
    }
  };
}
