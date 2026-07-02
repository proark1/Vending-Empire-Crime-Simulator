import { AlertTriangle, BarChart3, Boxes, Building2, ClipboardList, Factory, FlaskConical, HandCoins, Landmark, Lock, Map, Navigation, Package, PackagePlus, Route, Search, ShieldAlert, SlidersHorizontal, Trophy, Truck, Unlock, UserPlus, Users, Wrench } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { ConflictEvent, GameCommand, GameState, RivalOperationApproach } from "../game/core/types";
import { employeeRoleList, employeeRoles } from "../game/content/employees";
import { getMachineUpgradeEffects } from "../game/core/machineStats";
import {
  activeContracts,
  activeConflictEvents,
  activeDistrictEvents,
  activeLawInspections,
  activeMajorRaids,
  activeLocationRights,
  activeVehicle,
  assignedEmployeesForMachine,
  baseFacilityUpgradeCost,
  baseSecurityScore,
  baseStorageCapacity,
  carriedCrateUnits,
  campaignMissionProgress,
  coldStorageProtection,
  contractProgressRatio,
  contractRemainingQuantity,
  contractTone,
  currentProductCost,
  dailyEmployeeWages,
  districtLocations,
  districtMachineCounts,
  districtUnlockInfo,
  employeeCapacity,
  empireAssetList,
  endgamePathScores,
  employeeList,
  fleetSummary,
  financeLedger,
  financeSummary,
  formatClock,
  garageStorageUnits,
  getMachineLocation,
  installedMachines,
  installableLocation,
  latestDayReport,
  locationRightsFor,
  locationRightsQuotesForLocation,
  machineAtLocation,
  machineProcurementQuotes,
  machineResaleValue,
  machineRoutePressure,
  machineStockUnits,
  ownedMachines,
  optimizedRoutePlan,
  placementCostForLocation,
  playerHeatTier,
  productLabSlots,
  regionalManagerCapacity,
  rivalTerritoryByDistrict,
  routeDangerScore,
  routeTasks,
  narrativeQuestProgress,
  storyArcProgress,
  supplierRelationshipList,
  vehicleInventoryUnits,
  vehicleSpaceRemaining
} from "../game/core/selectors";
import { estimateMachineSalesPerHour } from "../game/systems/economy";
import { machineModels } from "../game/content/machineModels";
import { gameDesignPillars, npcRoles } from "../game/content/story";
import { baseFacilityList } from "../game/content/baseFacilities";
import { supplierDeals } from "../game/content/suppliers";
import { vehicleUpgradeList } from "../game/content/vehicleUpgrades";
import { buildPlaytestReport, playtestReportFilename } from "../game/core/playtestTelemetry";
import { activeRunModifier, machineTraitDefinitions, machineTraitsFor } from "../game/content/replayability";
import { buildCurrentJob, heatForecast, machineLifeSummary, productTradeoffs, recoveryNotes, routeTaskDecision } from "./currentJob";

type DashboardTab = "actions" | "machines" | "fleet" | "base" | "empire" | "suppliers" | "catalog" | "finance" | "districts" | "rights" | "jobs" | "route" | "logistics" | "crew" | "law" | "heat" | "conflict" | "rival" | "story" | "debug" | "log";
type DashboardGroup = "now" | "assets" | "city" | "pressure" | "story";

interface DashboardTabItem {
  advanced?: boolean;
  group: DashboardGroup;
  icon: React.ReactNode;
  id: DashboardTab;
  label: string;
}

interface DashboardProps {
  state: GameState;
  onCommand: (command: GameCommand) => void;
  showDebug: boolean;
}

function MiniButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="mini-button" disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function DashboardTabButton({
  active,
  children,
  icon,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? "tab active" : "tab"} onClick={onClick} type="button">
      {icon}
      <span>{children}</span>
    </button>
  );
}

function roleIcon(role: string): React.ReactNode {
  if (role === "collector") {
    return <HandCoins size={16} aria-hidden="true" />;
  }

  if (role === "technician") {
    return <Wrench size={16} aria-hidden="true" />;
  }

  if (role === "guard") {
    return <ShieldAlert size={16} aria-hidden="true" />;
  }

  if (role === "scout") {
    return <Search size={16} aria-hidden="true" />;
  }

  if (role === "negotiator") {
    return <Landmark size={16} aria-hidden="true" />;
  }

  if (role === "runner") {
    return <Truck size={16} aria-hidden="true" />;
  }

  if (role === "regional_manager") {
    return <Building2 size={16} aria-hidden="true" />;
  }

  return <PackagePlus size={16} aria-hidden="true" />;
}

function encounterFallback(conflict: ConflictEvent) {
  return (
    conflict.encounter ?? {
      advantage: conflict.kind === "base_raid" ? 12 : 0,
      chaseProgress: conflict.kind === "street_chase" ? 22 : 0,
      enemyFocus: 50,
      enemyHealth: 60,
      playerHealth: 100,
      playerStamina: 100
    }
  );
}

function rivalOperationCost(approach: RivalOperationApproach): number {
  return approach === "negotiate" ? 24 : approach === "expose" ? 12 : 8;
}

function rivalOperationLabel(kind: string): string {
  return kind.replace("_", " ");
}

function rivalLikelyMove(state: GameState, rivalId: string): string {
  const organization = state.rivalOrganizations?.[rivalId];
  const activeOperation = organization?.operations
    .filter((operation) => !operation.resolvedHour)
    .sort((a, b) => b.progress + b.strength * 40 - (a.progress + a.strength * 40))[0];
  if (activeOperation) {
    const location = state.locations[activeOperation.locationId];
    return `${rivalOperationLabel(activeOperation.kind)} near ${location?.name ?? activeOperation.locationId}`;
  }

  const rival = state.factions[rivalId];
  if (!rival) {
    return "watch territory";
  }

  if ((rival.archetype ?? "").includes("corporate") || (rival.tactic ?? "").includes("undercut")) {
    return "undercut pricing and permits";
  }

  if ((rival.archetype ?? "").includes("street") || (rival.tactic ?? "").includes("sabotage")) {
    return "sabotage weak stops";
  }

  if (rival.money > 120) {
    return "expand into open corners";
  }

  return "probe pressure around your route";
}

function initialsForName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function relationshipBrief(relationship: string): string {
  if (relationship === "hostile") {
    return "Will act openly if a route looks weak.";
  }

  if (relationship === "truce") {
    return "Quiet for now, but still watching territory.";
  }

  if (relationship === "allied") {
    return "Can be turned into leverage against other factions.";
  }

  return "Testing the route through pressure and offers.";
}

export const Dashboard = memo(DashboardInner);

function DashboardInner({ state, onCommand, showDebug }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("actions");
  const [navGroup, setNavGroup] = useState<DashboardGroup>("now");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playtestExportStatus, setPlaytestExportStatus] = useState("");
  const needsAssetsData = navGroup === "assets" || ["machines", "fleet", "base", "logistics", "catalog", "crew"].includes(tab);
  const needsCityData = navGroup === "city" || ["districts", "rights", "suppliers", "finance", "empire"].includes(tab);
  const needsPressureData = navGroup === "pressure" || ["law", "heat", "conflict", "rival"].includes(tab);
  const needsStoryData = navGroup === "story" || ["story", "debug"].includes(tab);
  const playerMachines = useMemo(() => ownedMachines(state, state.playerFactionId), [state]);
  const installedPlayerMachines = useMemo(() => installedMachines(state, state.playerFactionId), [state]);
  const rivals = useMemo(() => Object.values(state.factions).filter((faction) => faction.type === "npc"), [state.factions]);
  const vehicle = useMemo(() => activeVehicle(state), [state]);
  const employees = useMemo(() => employeeList(state), [state]);
  const unlockedDistrictCount = useMemo(() => Object.values(state.districtProgress).filter((progress) => progress.access !== "locked").length, [state.districtProgress]);
  const districtSummaries = useMemo(
    () => {
      if (!needsCityData && !needsPressureData) {
        return [];
      }

      return Object.values(state.districts)
        .map((district) => {
          const locations = districtLocations(state, district.id).filter(installableLocation);
          const openSites = locations.filter((location) => !machineAtLocation(state, location.id));
          const pressure = locations.reduce((sum, location) => sum + location.rivalPressure, 0) / Math.max(1, locations.length);
          const routeDanger = locations.reduce((sum, location) => sum + routeDangerScore(state, location, vehicle).score, 0) / Math.max(1, locations.length);
          const traffic = locations.reduce((sum, location) => sum + location.footTraffic, 0);
          const nextCost = openSites.reduce((lowest, location) => Math.min(lowest, placementCostForLocation(state, location)), Number.POSITIVE_INFINITY);
          const counts = districtMachineCounts(state, district.id);
          const unlockInfo = districtUnlockInfo(state, district.id);
          return {
            district,
            canScout: unlockInfo.canScout,
            canUnlock: unlockInfo.canUnlock,
            openSites: counts.openSites,
            pressure,
            routeDanger,
            progress: unlockInfo.progress,
            status: unlockInfo.status,
            traffic,
            nextCost: Number.isFinite(nextCost) ? nextCost : 0,
            playerCount: counts.playerCount,
            rivalCount: counts.rivalCount,
            totalSites: counts.totalSites,
            unmetRequirements: unlockInfo.unmetRequirements
          };
        })
        .sort((a, b) => a.district.name.localeCompare(b.district.name));
    },
    [needsCityData, needsPressureData, state, vehicle]
  );
  const tasks = useMemo(() => routeTasks(state), [state]);
  const routePlan = useMemo(() => optimizedRoutePlan(state), [state]);
  const selectedTask = useMemo(() => tasks.find((task) => task.id === state.routePlan.selectedTaskId), [state.routePlan.selectedTaskId, tasks]);
  const nextTask = selectedTask ?? tasks[0];
  const contracts = useMemo(() => activeContracts(state), [state]);
  const inspections = useMemo(() => activeLawInspections(state), [state]);
  const conflicts = useMemo(() => activeConflictEvents(state), [state]);
  const districtEvents = useMemo(() => activeDistrictEvents(state), [state]);
  const rivalOrganizations = useMemo(() => Object.values(state.rivalOrganizations ?? {}), [state.rivalOrganizations]);
  const empireAssets = useMemo(() => (tab === "empire" ? empireAssetList(state) : []), [state, tab]);
  const majorRaids = useMemo(() => (tab === "empire" ? activeMajorRaids(state) : []), [state, tab]);
  const suppliers = useMemo(() => (tab === "suppliers" ? supplierRelationshipList(state) : []), [state, tab]);
  const fleet = useMemo(
    () => needsAssetsData ? fleetSummary(state) : { averageCondition: 1, installedCount: installedPlayerMachines.length, modelVariety: 0, storedCount: 0, totalFleetValue: 0, vendorReputation: state.economy?.fleet?.vendorReputation ?? 0 },
    [installedPlayerMachines.length, needsAssetsData, state]
  );
  const procurementQuotes = useMemo(() => (tab === "fleet" || tab === "machines" ? machineProcurementQuotes(state) : []), [state, tab]);
  const storedMachines = useMemo(() => playerMachines.filter((machine) => (machine.placementStatus ?? "installed") !== "installed"), [playerMachines]);
  const installableLocations = useMemo(() => Object.values(state.locations).filter(installableLocation), [state.locations]);
  const activeRights = useMemo(() => (tab === "rights" ? activeLocationRights(state) : []), [state, tab]);
  const quests = useMemo(() => (needsStoryData || tab === "rival" ? narrativeQuestProgress(state) : []), [needsStoryData, state, tab]);
  const finance = useMemo(() => (tab === "finance" ? financeSummary(state) : { expensesToday: 0, netToday: 0, revenueToday: 0 }), [state, tab]);
  const heatTier = useMemo(() => playerHeatTier(state), [state]);
  const ledger = useMemo(() => (tab === "finance" ? financeLedger(state).slice(0, 16) : []), [state, tab]);
  const territory = useMemo(() => (tab === "rival" ? rivalTerritoryByDistrict(state) : []), [state, tab]);
  const dayReport = useMemo(() => latestDayReport(state), [state]);
  const storyProgress = useMemo(() => (needsStoryData ? storyArcProgress(state) : []), [needsStoryData, state]);
  const campaignProgress = useMemo(() => (needsStoryData ? campaignMissionProgress(state) : []), [needsStoryData, state]);
  const endingScores = useMemo(() => (needsStoryData || tab === "empire" || tab === "actions" ? endgamePathScores(state) : []), [needsStoryData, state, tab]);
  const playtestReport = useMemo(() => (tab === "story" ? buildPlaytestReport(state) : null), [state, tab]);
  const runModifier = useMemo(() => activeRunModifier(state), [state]);
  const strategyUnlocks = state.replay?.strategyUnlocks ?? [];
  const actionTasks = useMemo(() => tasks.slice(0, 5), [tasks]);
  const currentJob = useMemo(() => {
    const dashboardPosition = state.locations[state.player.currentLocationId ?? "garage"]?.position ?? state.locations.garage?.position ?? { x: 0, z: 0 };
    return buildCurrentJob(state, dashboardPosition);
  }, [state]);
  const heatReadout = useMemo(() => heatForecast(state), [state]);
  const recovery = useMemo(() => recoveryNotes(state), [state]);
  const stockTradeoffs = useMemo(() => productTradeoffs(state), [state]);
  const runTraitCount = useMemo(() => Object.values(state.replay?.machineTraits ?? {}).reduce((sum, traits) => sum + traits.length, 0), [state.replay?.machineTraits]);
  const loudestRivalMemory = useMemo(() => {
    return Object.values(state.replay?.rivalMemory ?? {})
      .map((memory) => ({
        memory,
        total: memory.undercut + memory.sabotage + memory.expansion + memory.negotiation + memory.exposure + memory.disruption + memory.alarmConfronted
      }))
      .sort((a, b) => b.total - a.total)[0];
  }, [state.replay?.rivalMemory]);
  const dashboardGroups = useMemo<Array<{ id: DashboardGroup; label: string; signal: string }>>(
    () => [
      { id: "now", label: "Now", signal: tasks.length > 0 ? `${Math.min(9, tasks.length)} jobs` : "clear" },
      { id: "assets", label: "Assets", signal: `${installedPlayerMachines.length} machines` },
      { id: "city", label: "City", signal: `${unlockedDistrictCount} districts` },
      { id: "pressure", label: "Pressure", signal: heatReadout.label },
      { id: "story", label: "Story", signal: endingScores[0]?.path.title ?? "open" }
    ],
    [endingScores, heatReadout.label, installedPlayerMachines.length, tasks.length, unlockedDistrictCount]
  );
  const visibleTabs = useMemo<DashboardTabItem[]>(
    () => {
      const tabItems: DashboardTabItem[] = [
        { id: "actions", group: "now", label: "Plan", icon: <Navigation size={16} aria-hidden="true" /> },
        { id: "route", group: "now", label: "Route", icon: <Route size={16} aria-hidden="true" /> },
        { id: "jobs", group: "now", label: "Jobs", icon: <ClipboardList size={16} aria-hidden="true" /> },
        { id: "log", group: "now", label: "Log", icon: <ClipboardList size={16} aria-hidden="true" /> },
        { id: "machines", group: "assets", label: "Machines", icon: <Map size={16} aria-hidden="true" /> },
        { id: "fleet", group: "assets", label: "Fleet", icon: <Boxes size={16} aria-hidden="true" /> },
        { id: "base", group: "assets", label: "Base", icon: <Factory size={16} aria-hidden="true" /> },
        { id: "logistics", group: "assets", label: "Stock", advanced: true, icon: <Package size={16} aria-hidden="true" /> },
        { id: "catalog", group: "assets", label: "Market", advanced: true, icon: <FlaskConical size={16} aria-hidden="true" /> },
        { id: "suppliers", group: "city", label: "Suppliers", advanced: true, icon: <Truck size={16} aria-hidden="true" /> },
        { id: "districts", group: "city", label: "Districts", icon: <Building2 size={16} aria-hidden="true" /> },
        { id: "rights", group: "city", label: "Rights", advanced: true, icon: <Landmark size={16} aria-hidden="true" /> },
        { id: "finance", group: "city", label: "Finance", advanced: true, icon: <Landmark size={16} aria-hidden="true" /> },
        { id: "empire", group: "city", label: "Empire", advanced: true, icon: <Building2 size={16} aria-hidden="true" /> },
        { id: "law", group: "pressure", label: "Law", advanced: true, icon: <ShieldAlert size={16} aria-hidden="true" /> },
        { id: "heat", group: "pressure", label: "Heat", advanced: true, icon: <AlertTriangle size={16} aria-hidden="true" /> },
        { id: "conflict", group: "pressure", label: "Conflict", advanced: true, icon: <ShieldAlert size={16} aria-hidden="true" /> },
        { id: "rival", group: "pressure", label: "Rivals", advanced: true, icon: <Map size={16} aria-hidden="true" /> },
        { id: "crew", group: "story", label: "Crew", advanced: true, icon: <Users size={16} aria-hidden="true" /> },
        { id: "story", group: "story", label: "Story", advanced: true, icon: <Trophy size={16} aria-hidden="true" /> },
        ...(showDebug ? [{ id: "debug", group: "story", label: "Debug", advanced: true, icon: <Wrench size={16} aria-hidden="true" /> } as DashboardTabItem] : [])
      ];
      return tabItems.filter((item) => item.group === navGroup && (!item.advanced || showAdvanced || item.id === "story"));
    },
    [navGroup, showAdvanced, showDebug]
  );

  useEffect(() => {
    if (tab === "debug" && !showDebug) {
      setTab("actions");
      setNavGroup("now");
      return;
    }

    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0]?.id ?? "actions");
    }
  }, [showDebug, tab, visibleTabs]);

  const handleExportPlaytestReport = () => {
    const report = buildPlaytestReport(state);
    const payload = JSON.stringify(report, null, 2);
    const downloadReport = () => {
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = playtestReportFilename(state);
      link.click();
      URL.revokeObjectURL(url);
      setPlaytestExportStatus("Downloaded JSON");
    };
    setPlaytestExportStatus("");

    if (!navigator.clipboard) {
      downloadReport();
      return;
    }

    void navigator.clipboard
      .writeText(payload)
      .then(() => {
        setPlaytestExportStatus("Copied JSON");
      })
      .catch(downloadReport);
  };

  return (
    <aside className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-mode-row">
          <div className="dashboard-title">
            <strong>Operations</strong>
            <span>{showAdvanced ? "Full systems" : "Essentials"}</span>
          </div>
          <button aria-pressed={showAdvanced} className={showAdvanced ? "mini-button active" : "mini-button"} onClick={() => setShowAdvanced((current) => !current)} type="button">
            <SlidersHorizontal size={13} aria-hidden="true" />
            Advanced
          </button>
        </div>
        <div className={`dashboard-next ${currentJob.tone}`} aria-label="Current operations job">
          <span>Current job</span>
          <strong>{currentJob.title}</strong>
          <small>{currentJob.targetLabel}</small>
        </div>
        <div className="dashboard-groups" role="tablist" aria-label="Operations groups">
          {dashboardGroups.map((group) => (
            <button
              aria-pressed={navGroup === group.id}
              className={navGroup === group.id ? "dashboard-group active" : "dashboard-group"}
              key={group.id}
              onClick={() => setNavGroup(group.id)}
              type="button"
            >
              <span>{group.label}</span>
              <small>{group.signal}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="tab-row" role="tablist" aria-label="Operations dashboard">
        {visibleTabs.map((item) => (
          <DashboardTabButton active={tab === item.id} icon={item.icon} key={item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </DashboardTabButton>
        ))}
      </div>

      {tab === "actions" && (
        <div className="panel-list action-plan-list">
          <article className="action-plan-hero">
            <div className="vehicle-heading">
              <Navigation size={18} aria-hidden="true" />
              <div>
                <h3>{currentJob.title}</h3>
                <p>{currentJob.targetLabel} · {currentJob.detail}</p>
              </div>
            </div>
            <div className="action-stakes">
              <span className="good">{currentJob.payoff}</span>
              <span className={currentJob.tone}>{currentJob.risk}</span>
            </div>
            <div className="action-plan-stats">
              <span>
                <strong>${Math.round(state.factions[state.playerFactionId].money)}</strong>
                cash
              </span>
              <span className={heatReadout.tone}>
                <strong>{heatReadout.label}</strong>
                heat
              </span>
              <span>
                <strong>{installedPlayerMachines.length}</strong>
                machines
              </span>
              <span className={routePlan?.tone ?? "good"}>
                <strong>{routePlan ? `${routePlan.stops.length} stops` : "free"}</strong>
                loop
              </span>
            </div>
            {nextTask && (
              <div className="row-actions">
                <MiniButton onClick={() => onCommand({ type: "select_route_task", actorId: state.playerFactionId, taskId: nextTask.id })}>
                  <Navigation size={13} aria-hidden="true" />
                  Guide
                </MiniButton>
                {vehicle && (
                  <MiniButton
                    disabled={vehicle.locationId === nextTask.locationId}
                    onClick={() => onCommand({ type: "dispatch_vehicle", actorId: state.playerFactionId, vehicleId: vehicle.id, locationId: nextTask.locationId })}
                  >
                    <Truck size={13} aria-hidden="true" />
                    {vehicle.locationId === nextTask.locationId ? "Van here" : "Send van"}
                  </MiniButton>
                )}
              </div>
            )}
          </article>

          {recovery.length > 0 && (
            <div className="recovery-strip" aria-label="Recovery options">
              {recovery.slice(0, 3).map((note) => (
                <article className={`recovery-note ${note.tone}`} key={note.title}>
                  <strong>{note.title}</strong>
                  <span>{note.detail}</span>
                  <em>{note.action}</em>
                </article>
              ))}
            </div>
          )}

          {stockTradeoffs.length > 0 && (
            <article className="vehicle-card product-choice-card">
              <div className="vehicle-heading">
                <FlaskConical size={18} aria-hidden="true" />
                <div>
                  <h3>Starter stock choices</h3>
                  <p>Pick the route's personality early: safe volume, fast demand, or risky margin.</p>
                </div>
              </div>
              <div className="product-choice-grid">
                {stockTradeoffs.map((tradeoff) => (
                  <div className={`product-choice ${tradeoff.tone}`} key={tradeoff.product.id}>
                    <strong>{tradeoff.label}</strong>
                    <span>{tradeoff.product.name} · ${Math.round(tradeoff.cost)}</span>
                    <p>{tradeoff.payoff}</p>
                    <em>{tradeoff.risk}</em>
                  </div>
                ))}
              </div>
            </article>
          )}

          <div className="panel-section-title">Next best actions</div>
          {actionTasks.length === 0 ? (
            <article className="inventory-row good">
              <div>
                <h3>Route breathing room</h3>
                <p>Use the quiet to tune prices, scout districts, hire crew, or bank cash for the next placement.</p>
              </div>
              <strong>clear</strong>
            </article>
          ) : (
            actionTasks.map((task, index) => {
              const location = state.locations[task.locationId];
              const decision = routeTaskDecision(state, task);
              const isSelected = state.routePlan.selectedTaskId === task.id;
              const vehicleAtStop = vehicle?.locationId === task.locationId;
              return (
                <article className={`route-task action-plan-card ${task.tone} ${isSelected ? "selected" : ""}`} key={`action_${task.id}`}>
                  <div>
                    <span className="action-rank">{index + 1}</span>
                    <h3>{task.title}</h3>
                    <p>{location?.name ?? "Unknown stop"} · {task.detail}</p>
                    <div className="action-stakes">
                      <span className="good">{decision.payoff}</span>
                      <span className={task.tone === "danger" ? "danger" : "warning"}>{decision.risk}</span>
                      <span>{decision.cost}</span>
                    </div>
                  </div>
                  <div className="route-actions">
                    <MiniButton onClick={() => onCommand({ type: "select_route_task", actorId: state.playerFactionId, taskId: isSelected ? null : task.id })}>
                      <Navigation size={13} aria-hidden="true" />
                      {isSelected ? "Clear" : "Guide"}
                    </MiniButton>
                    {vehicle && (
                      <MiniButton
                        disabled={vehicleAtStop}
                        onClick={() => onCommand({ type: "dispatch_vehicle", actorId: state.playerFactionId, vehicleId: vehicle.id, locationId: task.locationId })}
                      >
                        <Truck size={13} aria-hidden="true" />
                        {vehicleAtStop ? "Here" : "Drive"}
                      </MiniButton>
                    )}
                  </div>
                </article>
              );
            })
          )}

          {routePlan && routePlan.stops.length > 0 && (
            <article className={`vehicle-card route-plan-summary ${routePlan.tone}`}>
              <div className="vehicle-heading">
                <Route size={18} aria-hidden="true" />
                <div>
                  <h3>Current loop</h3>
                  <p>
                    {routePlan.stops.length} stops · {routePlan.estimatedHours.toFixed(1)}h · {Math.round(routePlan.totalRisk * 100)} risk
                  </p>
                </div>
              </div>
              <div className="route-strip" aria-label="Route stop order">
                {routePlan.stops.map((stop) => (
                  <span className={stop.task.tone} key={`plan_strip_${stop.task.id}`}>
                    {stop.order}
                  </span>
                ))}
              </div>
              <div className="route-load-card">
                <strong>Load before you go</strong>
                {routePlan.loadRecommendations.length > 0 ? (
                  <div className="route-load-list">
                    {routePlan.loadRecommendations.map((recommendation) => (
                      <span key={`action_load_${recommendation.productId}`}>
                        {recommendation.quantity}x {state.products[recommendation.productId]?.name ?? recommendation.productId} · {recommendation.source}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>No extra cargo needed for this loop.</p>
                )}
              </div>
            </article>
          )}

          <article className="vehicle-card run-recap-card">
            <div className="vehicle-heading">
              <Trophy size={18} aria-hidden="true" />
              <div>
                <h3>{runModifier.name}</h3>
                <p>{runModifier.openingLine}</p>
              </div>
            </div>
            <div className="report-grid">
              <span>Traits</span>
              <strong>{runTraitCount}</strong>
              <span>Unlocks</span>
              <strong>{strategyUnlocks.length}</strong>
              <span>Rival memory</span>
              <strong>{loudestRivalMemory ? state.factions[loudestRivalMemory.memory.factionId]?.name ?? loudestRivalMemory.memory.factionId : "none"}</strong>
              <span>Ending lean</span>
              <strong>{endingScores[0]?.path.title ?? "open"}</strong>
            </div>
          </article>
        </div>
      )}

      {tab === "machines" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Trophy size={18} aria-hidden="true" />
            <span>
              {runModifier.name} · {runModifier.description}
              {strategyUnlocks.length > 0 ? ` · ${strategyUnlocks.slice(-3).join(" · ")}` : ""}
            </span>
          </article>
          {playerMachines.map((machine) => {
            const location = getMachineLocation(state, machine.id);
            const stock = machineStockUnits(machine);
            const effects = getMachineUpgradeEffects(machine);
            const model = machineModels[machine.machineModelId] ?? machineModels.basic_snack;
            const hourlySales = estimateMachineSalesPerHour(state, machine).reduce((sum, slot) => sum + slot.unitsPerHour, 0);
            const installed = (machine.placementStatus ?? "installed") === "installed";
            const pressure = installed ? machineRoutePressure(state, machine) : undefined;
            const assignedCrew = assignedEmployeesForMachine(state, machine.id);
            const customerLoyalty = location ? state.economy.customers.loyaltyByLocation[location.id] ?? 0 : 0;
            const complaints = location ? state.economy.customers.complaintsByLocation[location.id] ?? 0 : 0;
            const traits = machineTraitsFor(state, machine.id);
            const history = state.replay?.machineHistory?.[machine.id] ?? [];
            return (
              <article className="machine-card" key={machine.id}>
                <div>
                  <h3>{machine.name}</h3>
                  <p>
                    {location?.name ?? "Unknown location"} · {model.name} · {installed ? machine.placementMethod.replace("_", " ") : "Stored"}
                  </p>
                  {effects.remoteMonitoring && <p className="remote-chip">Remote monitor online</p>}
                  {assignedCrew.length > 0 && <p className="remote-chip">Crew: {assignedCrew.map((employee) => employee.name).join(", ")}</p>}
                  {pressure && pressure.reasons.length > 0 && <p className={`route-chip ${pressure.tone}`}>{pressure.reasons.join(" · ")}</p>}
                  {installed && <p className="remote-chip">Customers: {Math.round(customerLoyalty)} loyalty · {complaints.toFixed(1)} complaints</p>}
                  <p className="machine-life-note">{machineLifeSummary(state, machine)}</p>
                  {traits.length > 0 && (
                    <p className="remote-chip">
                      Traits: {traits.map((trait) => machineTraitDefinitions[trait.id]?.name ?? trait.id).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="machine-metrics">
                  <span>${Math.round(machine.revenueStored)}</span>
                  <span>{stock} stock</span>
                  <span>{hourlySales.toFixed(1)}/hr</span>
                  <span>{Math.round(machine.damage)}% damage</span>
                  <span>{(machine.upgrades ?? []).length} upgrades</span>
                  <span>{Math.round(effects.securityBonus * 100)} security bonus</span>
                </div>
                {machine.slots.length > 0 && (
                  <div className="report-grid">
                    {machine.slots.map((slot) => {
                      const product = state.products[slot.productId];
                      const rate = estimateMachineSalesPerHour(state, machine).find((candidate) => candidate.productId === slot.productId)?.unitsPerHour ?? 0;
                      return (
                        <span key={slot.productId}>
                          {product.name}: {slot.quantity}/{slot.capacity} · ${slot.price} · {rate.toFixed(1)}/hr
                        </span>
                      );
                    })}
                  </div>
                )}
                {history.length > 0 && (
                  <div className="storage-list">
                    {history.slice(0, 3).map((entry, index) => (
                      <article className={`event-row ${entry.tone}`} key={`${machine.id}_history_${entry.hour}_${index}`}>
                        <time>{formatClock(entry.hour)}</time>
                        <span>{entry.message}</span>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tab === "fleet" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Boxes size={18} aria-hidden="true" />
            <span>
              {fleet.installedCount} installed · {fleet.storedCount} stored · ${fleet.totalFleetValue} fleet value · {Math.round(fleet.averageCondition * 100)}% readiness · vendor rep {Math.round(fleet.vendorReputation)}
            </span>
          </article>

          {vehicle && (
            <article className="vehicle-card hero">
              <div className="vehicle-heading">
                <Truck size={18} aria-hidden="true" />
                <div>
                  <h3>{vehicle.name}</h3>
                  <p>
                    Parked at {state.locations[vehicle.locationId]?.name ?? "unknown stop"} · {vehicleInventoryUnits(state, vehicle)}/{vehicle.capacity} cargo · {Math.round((vehicle.condition ?? 1) * 100)}% condition
                  </p>
                </div>
              </div>
              <div className="vehicle-meter">
                <span style={{ width: `${Math.min(100, (vehicleInventoryUnits(state, vehicle) / vehicle.capacity) * 100)}%` }} />
              </div>
              <div className="fleet-readiness-grid">
                <span>
                  <strong>{vehicleSpaceRemaining(state, vehicle)}</strong>
                  open cargo
                </span>
                <span>
                  <strong>{Math.round(vehicle.security * 100)}</strong>
                  security
                </span>
                <span>
                  <strong>{Math.round(vehicle.escapeRating * 100)}</strong>
                  escape
                </span>
                <span>
                  <strong>{Math.round(state.economy.traffic.vehicleMaintenanceDue[vehicle.id] ?? 0)}</strong>
                  maintenance
                </span>
              </div>
            </article>
          )}

          <div className="panel-section-title">Machine procurement</div>
          {procurementQuotes.map((quote) => (
            <article className={`route-task ${quote.unlocked ? "good" : "warning"}`} key={quote.model.id}>
              <div>
                <h3>{quote.model.name}</h3>
                <p>{quote.model.description}</p>
                <p>
                  {quote.model.maxSlots} slots · capacity {quote.model.capacityBonus >= 0 ? "+" : ""}{quote.model.capacityBonus} · security {Math.round(quote.model.securityBonus * 100)} · visibility {Math.round(quote.model.visibilityBonus * 100)}
                </p>
                <p>
                  {quote.unlocked ? "available" : "locked"} · {quote.reason} · {quote.storedCount} stored
                </p>
              </div>
              <div className="route-actions">
                <strong>${quote.cost}</strong>
                <MiniButton
                  disabled={!quote.unlocked || state.factions[state.playerFactionId].money < quote.cost}
                  onClick={() => onCommand({ type: "buy_machine_model", actorId: state.playerFactionId, modelId: quote.model.id, quantity: 1 })}
                >
                  <PackagePlus size={13} aria-hidden="true" />
                  Buy
                </MiniButton>
              </div>
            </article>
          ))}

          {vehicle && (
            <article className="vehicle-card">
              <div className="vehicle-heading">
                <Truck size={18} aria-hidden="true" />
                <div>
                  <h3>{vehicle.name} upgrades</h3>
                  <p>
                    {vehicle.capacity} cargo · {Math.round(vehicle.security * 100)} security · {vehicle.speed.toFixed(2)} speed · {Math.round(vehicle.escapeRating * 100)} escape
                  </p>
                </div>
              </div>
              <div className="storage-list">
                {vehicleUpgradeList.map((upgrade) => {
                  const installed = vehicle.upgrades?.includes(upgrade.id) ?? false;
                  return (
                    <article className={`inventory-row ${installed ? "contract-needed" : ""}`} key={upgrade.id}>
                      <div>
                        <h3>{upgrade.label}</h3>
                        <p>{upgrade.description}</p>
                      </div>
                      <div className="route-actions">
                        <strong>{installed ? "Installed" : `$${upgrade.cost}`}</strong>
                        <MiniButton
                          disabled={installed || vehicle.locationId !== "garage" || state.factions[state.playerFactionId].money < upgrade.cost}
                          onClick={() => onCommand({ type: "install_vehicle_upgrade", actorId: state.playerFactionId, vehicleId: vehicle.id, upgradeId: upgrade.id })}
                        >
                          <Wrench size={13} aria-hidden="true" />
                          Install
                        </MiniButton>
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
          )}

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Package size={18} aria-hidden="true" />
              <div>
                <h3>Stored inventory</h3>
                <p>Stored machines are the placement pool. Repair them in the garage before installing.</p>
              </div>
            </div>
            <div className="storage-list">
              {storedMachines.length === 0 ? (
                <article className="inventory-row">
                  <div>
                    <h3>No stored machines</h3>
                    <p>Buy a model above before claiming another stop.</p>
                  </div>
                  <strong>0</strong>
                </article>
              ) : (
                storedMachines.map((machine) => {
                  const model = machineModels[machine.machineModelId] ?? machineModels.basic_snack;
                  const resale = machineResaleValue(state, machine);
                  return (
                    <article className="inventory-row" key={machine.id}>
                      <div>
                        <h3>{machine.name}</h3>
                        <p>
                          {model.name} · {Math.round(machine.damage)}% damage · {machine.maxSlots} slots · resale ${resale}
                        </p>
                      </div>
                      <div className="route-actions">
                        <MiniButton disabled={machine.damage > 0} onClick={() => onCommand({ type: "sell_stored_machine", actorId: state.playerFactionId, machineId: machine.id })}>
                          Sell ${resale}
                        </MiniButton>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </article>
        </div>
      )}

      {tab === "base" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Factory size={18} aria-hidden="true" />
            <span>
              {garageStorageUnits(state)}/{baseStorageCapacity(state)} storage · {employees.length}/{employeeCapacity(state)} crew · {Math.round(baseSecurityScore(state) * 100)} security
            </span>
          </article>
          <article className="vehicle-card">
            <div className="report-grid">
              <span>Cold storage</span>
              <strong>{Math.round(coldStorageProtection(state) * 100)}%</strong>
              <span>Product lab</span>
              <strong>{Object.keys(state.economy.productCustomizations).length}/{productLabSlots(state)}</strong>
              <span>Managers</span>
              <strong>{employees.filter((employee) => employee.role === "regional_manager").length}/{regionalManagerCapacity(state)}</strong>
              <span>Insurance</span>
              <strong>{state.economy.finance.insurancePlan}</strong>
            </div>
          </article>
          {baseFacilityList.map((facility) => {
            const current = state.base.facilities[facility.id];
            const cost = baseFacilityUpgradeCost(state, facility.id);
            const atMax = current.level >= facility.maxLevel;
            return (
              <article className={`route-task ${atMax ? "good" : "warning"}`} key={facility.id}>
                <div>
                  <h3>{facility.name}</h3>
                  <p>{facility.description}</p>
                  <p>Level {current.level}/{facility.maxLevel}</p>
                </div>
                <div className="route-actions">
                  <MiniButton disabled={atMax || state.factions[state.playerFactionId].money < cost} onClick={() => onCommand({ type: "upgrade_base_facility", actorId: state.playerFactionId, facilityId: facility.id })}>
                    <Wrench size={13} aria-hidden="true" />
                    {atMax ? "Max" : `Upgrade $${cost}`}
                  </MiniButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "empire" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Building2 size={18} aria-hidden="true" />
            <span>
              pressure {Math.round(state.empire.politicalPressure)} · shell cover {Math.round(state.empire.shellCover * 100)}% · legitimacy {Math.round(state.empire.legitimacy)}
            </span>
          </article>

          {majorRaids.length > 0 && majorRaids.map((raid) => (
            <article className="route-task danger" key={raid.id}>
              <div>
                <h3>Major raid severity {raid.severity}</h3>
                <p>{raid.message}</p>
                <p>Deadline {formatClock(raid.deadlineHour)}</p>
              </div>
              <div className="route-actions">
                <MiniButton onClick={() => onCommand({ type: "resolve_major_raid", actorId: state.playerFactionId, raidId: raid.id, resolution: "legal_team" })}>Legal</MiniButton>
                <MiniButton onClick={() => onCommand({ type: "resolve_major_raid", actorId: state.playerFactionId, raidId: raid.id, resolution: "security_response" })}>Security</MiniButton>
                <MiniButton onClick={() => onCommand({ type: "resolve_major_raid", actorId: state.playerFactionId, raidId: raid.id, resolution: "political_favor" })}>Favor</MiniButton>
              </div>
            </article>
          ))}

          {empireAssets.map((asset) => {
            const atMax = asset.level >= asset.maxLevel;
            return (
              <article className={`route-task ${atMax ? "good" : "warning"}`} key={asset.id}>
                <div>
                  <h3>{asset.name}</h3>
                  <p>{asset.description}</p>
                  <p>Level {asset.level}/{asset.maxLevel}</p>
                </div>
                <div className="route-actions">
                  <MiniButton disabled={atMax || state.factions[state.playerFactionId].money < asset.nextCost} onClick={() => onCommand({ type: "upgrade_empire_asset", actorId: state.playerFactionId, assetId: asset.id })}>
                    <Wrench size={13} aria-hidden="true" />
                    {atMax ? "Max" : `Upgrade $${asset.nextCost}`}
                  </MiniButton>
                </div>
              </article>
            );
          })}

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Trophy size={18} aria-hidden="true" />
              <div>
                <h3>Ending execution</h3>
                <p>Endings lock only when their score reaches execution strength and no major raid is active.</p>
              </div>
            </div>
            <div className="storage-list">
              {endingScores.map((ending) => (
                <article className={`inventory-row ${ending.tone === "good" ? "contract-needed" : ""}`} key={ending.path.id}>
                  <div>
                    <h3>{ending.path.title}</h3>
                    <p>{ending.signals.join(" · ")}</p>
                    <p>{state.empire.endingExecutions[ending.path.id]?.status === "executed" ? state.empire.endingExecutions[ending.path.id]?.summary : ending.path.condition}</p>
                  </div>
                  <div className="route-actions">
                    <strong>{ending.score}/100</strong>
                    <MiniButton disabled={ending.score < 65 || majorRaids.length > 0 || state.empire.endingExecutions[ending.path.id]?.status === "executed"} onClick={() => onCommand({ type: "execute_ending", actorId: state.playerFactionId, pathId: ending.path.id })}>
                      Execute
                    </MiniButton>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Truck size={18} aria-hidden="true" />
            <span>
              {suppliers.filter((supplier) => supplier.unlocked).length}/{suppliers.length} suppliers · market {state.economy.supply.supplierMood}
            </span>
          </article>
          {suppliers.map((supplier) => (
            <article className={`route-task ${supplier.unlocked ? "good" : supplier.available ? "warning" : "danger"}`} key={supplier.id}>
              <div>
                <h3>{supplier.label}</h3>
                <p>{supplier.description}</p>
                <p>
                  {supplier.unlocked ? "unlocked" : supplier.available ? "available" : "locked"} · loyalty {Math.round(supplier.loyalty)} · trust {Math.round(supplier.trust)} · discount {Math.round(supplier.negotiatedDiscount * 100)}% · products {supplier.productCount}
                </p>
              </div>
              <div className="route-actions">
                {Object.values(supplierDeals).map((deal) => (
                  <MiniButton
                    disabled={!supplier.available || supplier.dealCooldownUntil > state.worldTimeHours || state.factions[state.playerFactionId].money < deal.cost}
                    key={deal.kind}
                    onClick={() => onCommand({ type: "negotiate_supplier_deal", actorId: state.playerFactionId, supplierId: supplier.id, dealKind: deal.kind })}
                  >
                    {deal.label} ${deal.cost}
                  </MiniButton>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "catalog" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <FlaskConical size={18} aria-hidden="true" />
            <span>
              {Object.values(state.products).length} products · market {state.economy.supply.supplierMood} · fuel ${state.economy.traffic.fuelPrice.toFixed(1)}
            </span>
          </article>
          {Object.values(state.products).map((product) => {
            const customization = state.economy.productCustomizations[product.id];
            return (
              <article className={`inventory-row ${product.legality > 0 ? "contract-needed" : ""}`} key={product.id}>
                <div>
                  <h3>{product.name}</h3>
                  <p>
                    {product.category} · supplier ${currentProductCost(state, product.id)} · price ${product.basePrice} · demand {Math.round(product.demand * 100)} · heat {product.heat}
                  </p>
                  <p>
                    {product.demandTags.join(" · ")}
                  </p>
                  {customization && (
                    <p>
                      {customization.brandName} · {customization.packageStyle.replace("_", " ")} · {customization.colorway} · design {customization.designScore}/100 · masking {Math.round(customization.riskMasking * 100)}
                    </p>
                  )}
                  {customization && (
                    <p>
                      "{customization.tagline}"
                    </p>
                  )}
                  {!customization && product.customizable && (
                    <p>
                      Lab-ready: choose package, brand tone, and shelf signal.
                    </p>
                  )}
                </div>
                <div className="route-actions">
                  <MiniButton disabled={!product.customizable || productLabSlots(state) <= 0} onClick={() => onCommand({ type: "customize_product", actorId: state.playerFactionId, productId: product.id, mode: "value_pack" })}>Value</MiniButton>
                  <MiniButton disabled={!product.customizable || productLabSlots(state) <= 0} onClick={() => onCommand({ type: "customize_product", actorId: state.playerFactionId, productId: product.id, mode: "premium_wrap" })}>Premium</MiniButton>
                  <MiniButton disabled={!product.customizable || productLabSlots(state) <= 0} onClick={() => onCommand({ type: "customize_product", actorId: state.playerFactionId, productId: product.id, mode: "discreet_label" })}>Discreet</MiniButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "finance" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <BarChart3 size={18} aria-hidden="true" />
            <span>
              ${Math.round(finance.revenueToday)} revenue · ${Math.round(finance.expensesToday)} expenses · ${Math.round(finance.netToday)} net
            </span>
          </article>
          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Landmark size={18} aria-hidden="true" />
              <div>
                <h3>Operating controls</h3>
                <p>Front income, rent, wages, fuel, fines, maintenance, and insurance post here.</p>
              </div>
            </div>
            <div className="row-actions">
              <MiniButton onClick={() => onCommand({ type: "set_insurance_plan", actorId: state.playerFactionId, plan: "none" })}>No policy</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "set_insurance_plan", actorId: state.playerFactionId, plan: "basic" })}>Basic</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "set_insurance_plan", actorId: state.playerFactionId, plan: "premium" })}>Premium</MiniButton>
            </div>
          </article>
          {ledger.length === 0 ? (
            <article className="inventory-row">
              <div>
                <h3>No ledger entries</h3>
                <p>Buy stock, collect revenue, pay fuel, or close a contract to populate the ledger.</p>
              </div>
              <strong>0</strong>
            </article>
          ) : (
            ledger.map((entry) => (
              <article className={`event-row ${entry.amount >= 0 ? "good" : "warning"}`} key={entry.id}>
                <time>{formatClock(entry.hour)}</time>
                <span>{entry.category.replace("_", " ")} · {entry.description}</span>
                <strong>{entry.amount >= 0 ? "+" : ""}${entry.amount}</strong>
              </article>
            ))
          )}
        </div>
      )}

      {tab === "districts" && (
        <div className="panel-list">
          {districtEvents.length > 0 && (
            <article className="vehicle-card">
              <div className="vehicle-heading">
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  <h3>District events</h3>
                  <p>Festivals, weather, shortages, trends, and patrol surges are changing demand and route risk.</p>
                </div>
              </div>
              <div className="storage-list">
                {districtEvents.map((event) => (
                  <article className={`inventory-row ${event.tone}`} key={event.id}>
                    <div>
                      <h3>{event.title}</h3>
                      <p>
                        {state.districts[event.districtId]?.name ?? event.districtId} · {event.kind.replace("_", " ")} · ends {formatClock(event.expiresHour)}
                      </p>
                      <p>{event.description}</p>
                    </div>
                    <strong>{Math.round(event.demandMultiplier * 100)}%</strong>
                  </article>
                ))}
              </div>
            </article>
          )}
          {districtSummaries.map((summary) => {
            const pressureTone = summary.status === "contested" ? "danger" : summary.progress.access !== "unlocked" || summary.pressure >= 0.28 ? "warning" : "good";
            const accessLabel = summary.progress.access === "unlocked" ? summary.status : summary.progress.access;
            return (
              <article className={`route-task ${pressureTone}`} key={summary.district.id}>
                <div>
                  <h3>{summary.district.name}</h3>
                  <p>{summary.district.description}</p>
                  <p>
                    {summary.district.customerArchetypes.join(" · ")} · {summary.district.riskFlavor}
                  </p>
                  <p>
                    {accessLabel} · {summary.playerCount} yours · {summary.rivalCount} rival · {summary.openSites}/{summary.totalSites} open pads
                  </p>
                  {summary.unmetRequirements.length > 0 && <p>Needs {summary.unmetRequirements.join(" · ")}</p>}
                </div>
                <div className="route-actions">
                  {summary.progress.access === "locked" && (
                    <MiniButton disabled={!summary.canScout} onClick={() => onCommand({ type: "scout_district", actorId: state.playerFactionId, districtId: summary.district.id })}>
                      <Search size={13} aria-hidden="true" />
                      Scout ${summary.district.scoutCost}
                    </MiniButton>
                  )}
                  {summary.progress.access === "scouted" && (
                    <MiniButton disabled={!summary.canUnlock} onClick={() => onCommand({ type: "unlock_district", actorId: state.playerFactionId, districtId: summary.district.id })}>
                      <Unlock size={13} aria-hidden="true" />
                      Open ${summary.district.unlockCost}
                    </MiniButton>
                  )}
                  {summary.progress.access === "unlocked" && (
                    <strong>
                      {summary.nextCost > 0 ? `$${summary.nextCost}` : "Full"} · {summary.traffic.toFixed(1)} traffic · {Math.round(summary.pressure * 100)} pressure
                      · {Math.round(summary.routeDanger * 100)} danger
                    </strong>
                  )}
                  {summary.progress.access !== "unlocked" && (
                    <strong>
                      <Lock size={13} aria-hidden="true" />
                      {summary.traffic.toFixed(1)} traffic
                    </strong>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "rights" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Landmark size={18} aria-hidden="true" />
            <span>
              {activeRights.length} pressured stops · {state.economy.customers.recentDecisions.length} recent customer decisions · next customer pulse {formatClock(state.economy.customers.nextDecisionHour)}
            </span>
          </article>

          {installableLocations
            .filter((location) => districtUnlockInfo(state, location.districtId).progress.access !== "locked")
            .sort((a, b) => {
              const aRights = locationRightsFor(state, a.id);
              const bRights = locationRightsFor(state, b.id);
              return bRights.legalPressure + bRights.corporatePressure - (aRights.legalPressure + aRights.corporatePressure);
            })
            .map((location) => {
              const rights = locationRightsFor(state, location.id);
              const district = state.districts[location.districtId];
              const loyalty = state.economy.customers.loyaltyByLocation[location.id] ?? 0;
              const complaints = state.economy.customers.complaintsByLocation[location.id] ?? 0;
              const quotes = locationRightsQuotesForLocation(state, location);
              const tone = rights.legalPressure >= 55 || rights.corporatePressure >= 55 || complaints >= 4 ? "danger" : rights.permitStatus === "active" || rights.rightsTier === "exclusive" ? "good" : "warning";
              return (
                <article className={`route-task ${tone}`} key={location.id}>
                  <div>
                    <h3>{location.name}</h3>
                    <p>
                      {district?.name ?? location.districtId} · {rights.rightsTier.replace("_", " ")} · permit {rights.permitStatus}
                    </p>
                    <p>
                      landlord {Math.round(rights.landlordDisposition)} · legal pressure {Math.round(rights.legalPressure)} · corporate pressure {Math.round(rights.corporatePressure)}
                    </p>
                    <p>
                      customers {Math.round(loyalty)} loyalty · {complaints.toFixed(1)} complaints
                      {rights.exclusiveUntilHour && rights.exclusiveUntilHour > state.worldTimeHours ? ` · exclusive until ${formatClock(rights.exclusiveUntilHour)}` : ""}
                      {rights.permitExpiresHour && rights.permitStatus === "active" ? ` · permit until ${formatClock(rights.permitExpiresHour)}` : ""}
                    </p>
                  </div>
                  <div className="route-actions">
                    {quotes.map((quote) => (
                      <MiniButton
                        disabled={!quote.canNegotiate}
                        key={quote.approach}
                        onClick={() => onCommand({ type: "negotiate_location_rights", actorId: state.playerFactionId, locationId: location.id, approach: quote.approach })}
                      >
                        {quote.label} ${quote.cost}
                      </MiniButton>
                    ))}
                  </div>
                </article>
              );
            })}

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Users size={18} aria-hidden="true" />
              <div>
                <h3>Customer decisions</h3>
                <p>Purchases, walkaways, complaints, and tipoffs feed demand and inspection pressure.</p>
              </div>
            </div>
            <div className="storage-list">
              {state.economy.customers.recentDecisions.length === 0 ? (
                <article className="inventory-row">
                  <div>
                    <h3>No customer decisions yet</h3>
                    <p>Advance time around stocked machines to build market memory.</p>
                  </div>
                </article>
              ) : (
                state.economy.customers.recentDecisions.slice(0, 8).map((decision) => {
                  const location = state.locations[decision.locationId];
                  const product = decision.productId ? state.products[decision.productId] : undefined;
                  return (
                    <article className={`inventory-row ${decision.outcome === "purchase" ? "contract-needed" : ""}`} key={decision.id}>
                      <div>
                        <h3>{decision.archetypeId} {decision.outcome}</h3>
                        <p>
                          {location?.name ?? decision.locationId} · {product?.name ?? "no product"} · satisfaction {Math.round(decision.satisfaction)}
                        </p>
                        <p>{decision.reason}</p>
                      </div>
                      <strong>{decision.spend ? `$${decision.spend}` : formatClock(decision.hour)}</strong>
                    </article>
                  );
                })
              )}
            </div>
          </article>
        </div>
      )}

      {tab === "jobs" && (
        <div className="panel-list">
          {dayReport && (
            <article className={`day-report ${dayReport.contractsFailed > 0 ? "warning" : "good"}`}>
              <div>
                <h3>Day {dayReport.day} report</h3>
                <p>{dayReport.summary}</p>
              </div>
              <div className="report-grid">
                <span>Collected</span>
                <strong>${Math.round(dayReport.revenueCollected)}</strong>
                <span>Stored</span>
                <strong>${Math.round(dayReport.machineRevenueStored)}</strong>
                <span>Contracts</span>
                <strong>
                  {dayReport.contractsCompleted}/{dayReport.contractsFailed}
                </strong>
                <span>Rival moves</span>
                <strong>{dayReport.rivalActions}</strong>
              </div>
            </article>
          )}

          {contracts.length === 0 ? (
            <article className="inventory-row">
              <div>
                <h3>No active contracts</h3>
                <p>New service promises post as your route expands.</p>
              </div>
              <strong>0</strong>
            </article>
          ) : (
            contracts.map((contract) => {
              const product = state.products[contract.productId];
              const location = state.locations[contract.locationId];
              const tone = contractTone(state, contract);
              const routeTaskId = `contract:${contract.id}`;
              const isSelected = state.routePlan.selectedTaskId === routeTaskId;
              const vehicleAtStop = vehicle?.locationId === contract.locationId;
              return (
                <article className={`contract-card ${tone}`} key={contract.id}>
                  <div className="contract-heading">
                    <div>
                      <h3>{contract.title}</h3>
                      <p>
                        {location?.name ?? "Unknown stop"} · {contractRemainingQuantity(contract)} {product.name} due by {formatClock(contract.deadlineHour)}
                      </p>
                    </div>
                    <strong>${contract.rewardMoney}</strong>
                  </div>
                  <div className="contract-meter" aria-hidden="true">
                    <span style={{ width: `${contractProgressRatio(contract) * 100}%` }} />
                  </div>
                  <div className="contract-footer">
                    <span>
                      {contract.deliveredQuantity}/{contract.requiredQuantity} delivered
                    </span>
                    <div className="route-actions">
                      <MiniButton onClick={() => onCommand({ type: "select_route_task", actorId: state.playerFactionId, taskId: isSelected ? null : routeTaskId })}>
                        <Navigation size={13} aria-hidden="true" />
                        {isSelected ? "Clear" : "Guide"}
                      </MiniButton>
                      {vehicle && (
                        <MiniButton
                          disabled={vehicleAtStop}
                          onClick={() => onCommand({ type: "dispatch_vehicle", actorId: state.playerFactionId, vehicleId: vehicle.id, locationId: contract.locationId })}
                        >
                          <Truck size={13} aria-hidden="true" />
                          {vehicleAtStop ? "Here" : "Drive"}
                        </MiniButton>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {tab === "route" && (
        <div className="panel-list">
          {vehicle && (
            <article className="vehicle-card">
              <div className="vehicle-heading">
                <Truck size={18} aria-hidden="true" />
                <div>
                  <h3>{vehicle.name}</h3>
                  <p>
                    Parked at {state.locations[vehicle.locationId]?.name ?? "unknown stop"} · {vehicleInventoryUnits(state, vehicle)}/{vehicle.capacity} trunk · {Math.round((vehicle.condition ?? 1) * 100)}% condition
                  </p>
                </div>
              </div>
              <div className="vehicle-meter">
                <span style={{ width: `${Math.min(100, (vehicleInventoryUnits(state, vehicle) / vehicle.capacity) * 100)}%` }} />
              </div>
              <p className="vehicle-note">
                {vehicleSpaceRemaining(state, vehicle)} trunk space open · ${state.economy.traffic.fuelPrice.toFixed(1)} fuel · {Math.round(state.economy.traffic.vehicleMaintenanceDue[vehicle.id] ?? 0)} maintenance due
              </p>
              <div className="row-actions">
                <MiniButton disabled={vehicle.locationId !== "garage"} onClick={() => onCommand({ type: "service_vehicle", actorId: state.playerFactionId, vehicleId: vehicle.id })}>
                  <Wrench size={13} aria-hidden="true" />
                  Service
                </MiniButton>
              </div>
            </article>
          )}

          {routePlan && routePlan.stops.length > 0 && (
            <article className={`vehicle-card ${routePlan.tone}`}>
              <div className="vehicle-heading">
                <Route size={18} aria-hidden="true" />
                <div>
                  <h3>Optimized loop</h3>
                  <p>
                    {routePlan.stops.length} stops · {routePlan.estimatedHours.toFixed(1)}h estimate · {Math.round(routePlan.totalRisk * 100)} route risk
                  </p>
                </div>
              </div>
              <div className="route-strip" aria-label="Route stop order">
                {routePlan.stops.map((stop) => (
                  <span className={stop.task.tone} key={`strip_${stop.task.id}`}>
                    {stop.order}
                  </span>
                ))}
              </div>
              <div className="route-load-card">
                <strong>Load before departure</strong>
                {routePlan.loadRecommendations.length > 0 ? (
                  <div className="route-load-list">
                    {routePlan.loadRecommendations.map((recommendation) => (
                      <span key={recommendation.productId}>
                        {recommendation.quantity}x {state.products[recommendation.productId]?.name ?? recommendation.productId} · {recommendation.source}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>No extra cargo needed for this loop.</p>
                )}
              </div>
              <div className="storage-list">
                {routePlan.stops.map((stop) => {
                  const location = state.locations[stop.locationId];
                  const decision = routeTaskDecision(state, stop.task);
                  return (
                    <article className={`inventory-row ${stop.task.tone === "danger" ? "danger" : ""}`} key={`plan_${stop.task.id}`}>
                      <div>
                        <h3>
                          {stop.order}. {stop.task.title}
                        </h3>
                        <p>
                          {location?.name ?? stop.locationId} · ETA {Math.max(1, Math.round(stop.etaHours * 60))}m · risk {Math.round(stop.riskScore * 100)}
                        </p>
                        <p>{decision.cost} · {decision.payoff}</p>
                      </div>
                      <strong>{stop.task.type}</strong>
                    </article>
                  );
                })}
              </div>
            </article>
          )}

          {selectedTask && (
            <article className={`route-task selected ${selectedTask.tone}`}>
              <div>
                <h3>{selectedTask.title}</h3>
                <p>{selectedTask.detail}</p>
                <p>{routeTaskDecision(state, selectedTask).when} · {routeTaskDecision(state, selectedTask).cost}</p>
              </div>
              <strong>Guiding</strong>
            </article>
          )}

          {tasks.length === 0 ? (
            <article className="inventory-row">
              <div>
                <h3>Route clear</h3>
                <p>No urgent stops need planning right now.</p>
              </div>
              <strong>0</strong>
            </article>
          ) : (
            tasks.map((task) => {
              const location = state.locations[task.locationId];
              const isSelected = state.routePlan.selectedTaskId === task.id;
              const vehicleAtStop = vehicle?.locationId === task.locationId;
              const decision = routeTaskDecision(state, task);
              return (
                <article className={`route-task ${task.tone} ${isSelected ? "selected" : ""}`} key={task.id}>
                  <div>
                    <h3>{task.title}</h3>
                    <p>
                      {location?.name ?? "Unknown stop"} · {task.detail}
                    </p>
                    <div className="action-stakes">
                      <span className="good">{decision.payoff}</span>
                      <span className={task.tone === "danger" ? "danger" : "warning"}>{decision.risk}</span>
                      <span>{decision.cost}</span>
                    </div>
                  </div>
                  <div className="route-actions">
                    <MiniButton onClick={() => onCommand({ type: "select_route_task", actorId: state.playerFactionId, taskId: isSelected ? null : task.id })}>
                      <Navigation size={13} aria-hidden="true" />
                      {isSelected ? "Clear" : "Guide"}
                    </MiniButton>
                    {vehicle && (
                      <MiniButton
                        disabled={vehicleAtStop}
                        onClick={() => onCommand({ type: "dispatch_vehicle", actorId: state.playerFactionId, vehicleId: vehicle.id, locationId: task.locationId })}
                      >
                        <Truck size={13} aria-hidden="true" />
                        {vehicleAtStop ? "Here" : "Drive"}
                      </MiniButton>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {tab === "logistics" && (
        <div className="panel-list">
          <div className="cargo-summary">
            <Package size={18} aria-hidden="true" />
            <span>
              {carriedCrateUnits(state)}/{state.player.cargoCapacity} carried · {garageStorageUnits(state)}/{baseStorageCapacity(state)} stored
            </span>
          </div>
          {routePlan && routePlan.loadRecommendations.length > 0 && (
            <article className="vehicle-card">
              <div className="vehicle-heading">
                <Boxes size={18} aria-hidden="true" />
                <div>
                  <h3>Recommended load</h3>
                  <p>Based on optimized stops, contracts, and low-stock machines.</p>
                </div>
              </div>
              <div className="route-load-list">
                {routePlan.loadRecommendations.map((recommendation) => (
                  <span key={`logistics_${recommendation.productId}`}>
                    {recommendation.quantity}x {state.products[recommendation.productId]?.name ?? recommendation.productId} · {recommendation.source}
                  </span>
                ))}
              </div>
            </article>
          )}
          {state.player.carriedCrate ? (
            <article className="inventory-row">
              <div>
                <h3>In hand</h3>
                <p>
                  {state.products[state.player.carriedCrate.productId].name} crate · {state.player.carriedCrate.source}
                </p>
              </div>
              <strong>{state.player.carriedCrate.quantity}</strong>
            </article>
          ) : (
            <article className="inventory-row">
              <div>
                <h3>In hand</h3>
                <p>No crate carried</p>
              </div>
              <strong>0</strong>
            </article>
          )}
          {Object.values(state.products).map((product) => (
            <article className="inventory-row" key={product.id}>
              <div>
                <h3>{product.name}</h3>
                <p>Garage storage · {product.description}</p>
              </div>
              <strong>{state.player.garageStorage[product.id] ?? 0}</strong>
            </article>
          ))}
        </div>
      )}

      {tab === "crew" && (
        <div className="panel-list">
          <div className="cargo-summary">
            <Users size={18} aria-hidden="true" />
            <span>
              {employees.filter((employee) => !employee.betrayed).length}/{employeeCapacity(state)} crew · ${dailyEmployeeWages(state)}/day wages
            </span>
          </div>

          <div className="action-grid">
            {employeeRoleList.map((role) => (
              <button
                className="action-button"
                disabled={state.factions[state.playerFactionId].money < role.hireCost}
                key={role.role}
                onClick={() => onCommand({ type: "hire_employee", actorId: state.playerFactionId, role: role.role })}
                type="button"
              >
                <UserPlus size={17} aria-hidden="true" />
                <span>
                  Hire {role.title} ${role.hireCost}
                </span>
              </button>
            ))}
          </div>

          {employees.length === 0 ? (
            <article className="inventory-row">
              <div>
                <h3>No crew hired</h3>
                <p>Hire a restocker, collector, or technician to automate assigned machines.</p>
              </div>
              <strong>0</strong>
            </article>
          ) : (
            employees.map((employee) => {
              const role = employeeRoles[employee.role];
              const routeLocationId = employee.routeTargetLocationId ?? employee.lastLocationId;
              const routeLocation = routeLocationId ? state.locations[routeLocationId] : undefined;
              return (
                <article className={`route-task ${employee.status === "blocked" ? "warning" : "good"}`} key={employee.id}>
                  <div>
                    <h3>
                      {roleIcon(employee.role)}
                      {employee.name}
                    </h3>
                    <p>
                      {role.title} · Level {employee.level ?? 1} · ${employee.wagePerDay}/day · {employee.betrayed ? "Betrayed" : employee.statusDetail}
                    </p>
                    <p>
                      Reliability {Math.round(employee.reliability * 100)} · Skill {Math.round(employee.skill * 100)} · Loyalty {Math.round(employee.loyalty * 100)} · XP {Math.round(employee.xp ?? 0)}
                    </p>
                    <p className="employee-trait">
                      {employee.trait ?? "Steady hands"} · {employee.traitDescription ?? "Handles route work with a steady rhythm."}
                    </p>
                    <p>
                      Route agent: {(employee.routePhase ?? "idle").replace("_", " ")} · {routeLocation ? `${routeLocation.name}, ${state.districts[routeLocation.districtId]?.name ?? routeLocation.districtId}` : "no visible stop"}
                    </p>
                  </div>
                  <div className="route-actions">
                    {installedPlayerMachines.map((machine) => {
                      const assigned = employee.assignedMachineIds.includes(machine.id);
                      return (
                        <MiniButton
                          key={machine.id}
                          onClick={() =>
                            onCommand({
                              type: "assign_employee",
                              actorId: state.playerFactionId,
                              employeeId: employee.id,
                              machineId: machine.id,
                              assigned: !assigned
                            })
                          }
                        >
                          {assigned ? "Unassign" : "Assign"} {machine.name}
                        </MiniButton>
                      );
                    })}
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {tab === "law" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>
              {heatTier.label} · {Math.round(state.factions[state.playerFactionId].heat)} heat · {state.law.inspectionsToday} inspections today · ${Math.round(state.law.finesToday)} fines
            </span>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <h3>Law pressure</h3>
                <p>
                  {heatReadout.detail} · {state.law.confiscatedUnitsToday} stock confiscated today
                </p>
                <p className={`heat-tier-note ${heatReadout.tone}`}>
                  {heatReadout.action}
                </p>
              </div>
            </div>
            <div className="report-grid">
              <span>Heat tier</span>
              <strong>{heatTier.label}</strong>
              <span>Legal</span>
              <strong>low heat</strong>
              <span>Bribe</span>
              <strong>medium heat</strong>
              <span>Illegal</span>
              <strong>high seizure</strong>
              <span>Hidden</span>
              <strong>low sales</strong>
            </div>
          </article>

          {inspections.length === 0 ? (
            <article className="inventory-row">
              <div>
                <h3>No active inspections</h3>
                <p>{heatReadout.detail} Placement method, grey stock, heat, and police presence decide the next check.</p>
              </div>
              <strong>0</strong>
            </article>
          ) : (
            inspections.map((inspection) => {
              const machine = state.machines[inspection.machineId];
              const location = state.locations[inspection.locationId];
              return (
                <article className="route-task danger" key={inspection.id}>
                  <div>
                    <h3>{machine?.name ?? "Machine"} inspection</h3>
                    <p>
                      {location?.name ?? "Unknown stop"} · {inspection.reason} · due {formatClock(inspection.deadlineHour)}
                    </p>
                    <p>
                      ${inspection.fine} fine risk · {inspection.confiscatedUnits} stock at risk
                    </p>
                  </div>
                  <div className="route-actions">
                    <MiniButton onClick={() => onCommand({ type: "resolve_inspection", actorId: state.playerFactionId, inspectionId: inspection.id, resolution: "show_permit" })}>
                      Show permit
                    </MiniButton>
                    <MiniButton onClick={() => onCommand({ type: "resolve_inspection", actorId: state.playerFactionId, inspectionId: inspection.id, resolution: "pay_fine" })}>
                      Pay fine
                    </MiniButton>
                    <MiniButton onClick={() => onCommand({ type: "resolve_inspection", actorId: state.playerFactionId, inspectionId: inspection.id, resolution: "bribe" })}>
                      Bribe
                    </MiniButton>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {tab === "heat" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              {heatTier.label} · {Math.round(state.factions[state.playerFactionId].heat)} heat · {Math.round(state.factions[state.playerFactionId].publicReputation)} public rep · {Math.round(state.factions[state.playerFactionId].streetReputation)} street rep
            </span>
          </article>
          <article className="vehicle-card">
            <div className="vehicle-heading">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <h3>{heatTier.label}</h3>
                <p>{heatTier.description}</p>
                <p className={`heat-tier-note ${heatReadout.tone}`}>{heatReadout.detail} {heatReadout.action}</p>
              </div>
            </div>
            <div className="report-grid">
              <span>Next inspection</span>
              <strong>{formatClock(state.law.nextInspectionHour)}</strong>
              <span>Checkpoints</span>
              <strong>{Object.keys(state.economy.traffic.checkpoints).length}</strong>
              <span>Confiscated</span>
              <strong>{state.law.confiscatedUnitsToday}</strong>
              <span>Spoiled</span>
              <strong>{state.economy.spoilage.spoiledToday}</strong>
            </div>
          </article>
          {districtEvents.slice(0, 3).map((event) => (
            <article className={`route-task ${event.tone}`} key={`heat_${event.id}`}>
              <div>
                <h3>{event.title}</h3>
                <p>
                  {state.districts[event.districtId]?.name ?? event.districtId} · heat shift {event.heatDelta >= 0 ? "+" : ""}{event.heatDelta.toFixed(2)} · congestion +{Math.round(event.congestionDelta * 100)}
                </p>
                <p>{event.description}</p>
              </div>
              <strong>{formatClock(event.expiresHour)}</strong>
            </article>
          ))}
          {districtSummaries.map((summary) => (
            <article className={`route-task ${summary.pressure >= 0.5 || summary.routeDanger >= 0.85 ? "danger" : summary.pressure >= 0.25 || summary.routeDanger >= 0.45 ? "warning" : "good"}`} key={summary.district.id}>
              <div>
                <h3>{summary.district.name}</h3>
                <p>
                  Pressure {Math.round(summary.pressure * 100)} · route danger {Math.round(summary.routeDanger * 100)} · heat tolerance {summary.district.heatTolerance}
                </p>
                <p>{summary.district.riskFlavor}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "conflict" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              {conflicts.length} active · {state.conflict.resolvedToday} resolved today · {state.conflict.missedToday} missed
            </span>
          </article>

          {conflicts.length === 0 ? (
            <article className="inventory-row">
              <div>
                <h3>No active conflicts</h3>
                <p>High heat, risky routes, base raids, and sabotage can trigger active defense moments.</p>
              </div>
              <strong>0</strong>
            </article>
          ) : (
            conflicts.map((conflict) => {
              const location = state.locations[conflict.locationId];
              const threat = state.factions[conflict.threatFactionId];
              const encounter = encounterFallback(conflict);
              const vehicleAtStop = vehicle?.locationId === conflict.locationId;
              return (
                <article className="route-task danger" key={conflict.id}>
                  <div>
                    <h3>
                      {conflict.kind === "base_raid" ? "Base defense" : conflict.kind === "route_ambush" ? "Route ambush" : "Street chase"}
                    </h3>
                    <p>
                      {location?.name ?? "Unknown stop"} · {threat?.name ?? "Rival crew"} · due {formatClock(conflict.expiresHour)}
                    </p>
                    <p>{conflict.message}</p>
                    <div className="route-actions">
                      <strong>HP {Math.round(encounter.playerHealth)}</strong>
                      <strong>Stam {Math.round(encounter.playerStamina)}</strong>
                      <strong>Enemy {Math.round(encounter.enemyHealth)}</strong>
                      <strong>Escape {Math.round(encounter.chaseProgress)}%</strong>
                    </div>
                  </div>
                  <div className="route-actions">
                    <MiniButton onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "strike" })}>
                      Strike
                    </MiniButton>
                    <MiniButton onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "dodge" })}>
                      Dodge
                    </MiniButton>
                    <MiniButton onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "tool" })}>
                      Tool
                    </MiniButton>
                    <MiniButton onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "push_escape" })}>
                      Push
                    </MiniButton>
                    <MiniButton
                      disabled={!vehicleAtStop}
                      onClick={() => onCommand({ type: "resolve_conflict_event", actorId: state.playerFactionId, eventId: conflict.id, resolution: "drive_escape" })}
                    >
                      <Truck size={13} aria-hidden="true" />
                      Escape
                    </MiniButton>
                    <MiniButton onClick={() => onCommand({ type: "resolve_conflict_event", actorId: state.playerFactionId, eventId: conflict.id, resolution: "remote_lockdown" })}>
                      Lockdown
                    </MiniButton>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {tab === "rival" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Map size={18} aria-hidden="true" />
            <span>Territory overlay by district, pressure, and machine control</span>
          </article>
          {territory.map((row) => {
            const controller = state.factions[row.controllingFactionId];
            return (
              <article className={`route-task ${row.controllingFactionId === state.playerFactionId ? "good" : "danger"}`} key={row.districtId}>
                <div>
                  <h3>{row.districtName}</h3>
                  <p>
                    Controlled by {controller?.name ?? "unknown"} · {row.playerMachines} yours · {row.rivalMachines} rival · {Math.round(row.averagePressure * 100)} pressure
                  </p>
                </div>
                <strong>{controller?.archetype?.replace("_", " ") ?? "territory"}</strong>
              </article>
            );
          })}
          {rivalOrganizations.map((organization) => {
            const rival = state.factions[organization.factionId];
            const activeOperations = organization.operations.filter((operation) => !operation.resolvedHour);
            const memory = state.replay?.rivalMemory?.[organization.factionId];
            const memoryTotal = memory ? memory.undercut + memory.sabotage + memory.expansion + memory.negotiation + memory.exposure + memory.disruption + memory.alarmConfronted : 0;
            return (
              <article className="rival-panel" key={organization.factionId}>
                <div className="rival-header">
                  <span className={`rival-portrait ${organization.relationship}`}>{initialsForName(organization.bossName)}</span>
                  <div>
                    <h3>{organization.bossName}</h3>
                    <p>
                      {rival?.name ?? organization.factionId} · {organization.relationship} · leverage {Math.round(organization.leverage)}
                    </p>
                  </div>
                </div>
                <p>{organization.agenda}</p>
                <p className="rival-brief">{relationshipBrief(organization.relationship)}</p>
                <p className="rival-intel">Likely next move: {rivalLikelyMove(state, organization.factionId)}</p>
                {memory && memoryTotal > 0 && (
                  <p className="rival-intel">
                    History: {memory.undercut} undercuts · {memory.sabotage} sabotage · {memory.expansion} expands · {memory.negotiation + memory.exposure + memory.disruption} counters · {memory.alarmConfronted} alarms answered
                  </p>
                )}
                <div className="storage-list">
                  {activeOperations.length === 0 ? (
                    <article className="inventory-row">
                      <div>
                        <h3>No active operations</h3>
                        <p>{rival?.name ?? "This rival"} has no visible strategic cells right now.</p>
                      </div>
                    </article>
                  ) : (
                    activeOperations.map((operation) => {
                      const location = state.locations[operation.locationId];
                      const approaches: RivalOperationApproach[] = ["negotiate", "expose", "disrupt"];
                      return (
                        <article className={`route-task ${operation.exposed ? "warning" : "danger"}`} key={operation.id}>
                          <div>
                            <h3>{rivalOperationLabel(operation.kind)}</h3>
                            <p>
                              {location?.name ?? operation.locationId} · {Math.round(operation.progress)}% progress · strength {Math.round(operation.strength * 100)}%
                            </p>
                            <p>{operation.exposed ? "Exposed cell" : "Hidden cell"} · started {formatClock(operation.startedHour)}</p>
                          </div>
                          <div className="route-actions">
                            {approaches.map((approach) => {
                              const cost = rivalOperationCost(approach);
                              return (
                                <MiniButton
                                  disabled={state.factions[state.playerFactionId].money < cost}
                                  key={approach}
                                  onClick={() => onCommand({ type: "pressure_rival_operation", actorId: state.playerFactionId, operationId: operation.id, approach })}
                                >
                                  {approach} ${cost}
                                </MiniButton>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </article>
            );
          })}
          {rivals.map((rival) => (
            <article className="rival-panel" key={rival.id}>
              <div className="rival-header">
                <span className="rival-portrait faction">{initialsForName(rival.name)}</span>
                <div>
                  <h3>{rival.name}</h3>
                  <p>
                    {rival.archetype?.replace("_", " ") ?? "rival"} · {rival.tactic ?? "competes for territory"}
                  </p>
                </div>
              </div>
              <p className="rival-intel">Likely next move: {rivalLikelyMove(state, rival.id)}</p>
              <div className="rival-grid">
                <span>Money</span>
                <strong>${Math.round(rival.money)}</strong>
                <span>Heat</span>
                <strong>{Math.round(rival.heat)}</strong>
                <span>Street rep</span>
                <strong>{Math.round(rival.streetReputation)}</strong>
                <span>Machines</span>
                <strong>{ownedMachines(state, rival.id).length}</strong>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "story" && playtestReport && (
        <div className="panel-list">
          <article className="cargo-summary">
            <ClipboardList size={18} aria-hidden="true" />
            <span>
              {runModifier.name} · {campaignProgress.filter((progress) => progress.mission.completed).length}/{campaignProgress.length} chains · {storyProgress.length} arcs · leading ending {endingScores[0]?.path.title ?? "unknown"}
            </span>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Trophy size={18} aria-hidden="true" />
              <div>
                <h3>Run identity</h3>
                <p>{runModifier.openingLine}</p>
              </div>
            </div>
            <div className="report-grid">
              <span>Seed</span>
              <strong>{Math.abs(Math.trunc(state.replay?.runSeed ?? 1))}</strong>
              <span>Traits</span>
              <strong>{Object.values(state.replay?.machineTraits ?? {}).reduce((sum, traits) => sum + traits.length, 0)}</strong>
              <span>Rival history</span>
              <strong>{Object.keys(state.replay?.rivalMemory ?? {}).length}</strong>
              <span>Unlocks</span>
              <strong>{strategyUnlocks.length}</strong>
            </div>
            {strategyUnlocks.length > 0 && (
              <p className="rival-intel">Recent unlocks: {strategyUnlocks.slice(-5).join(" · ")}</p>
            )}
          </article>

          <article className="vehicle-card pacing-card">
            <div className="vehicle-heading">
              <Route size={18} aria-hidden="true" />
              <div>
                <h3>Milestone pacing</h3>
                <p>
                  {playtestReport.phase} · {playtestReport.estimatedActiveMinutes} active min · {playtestReport.flags.length} flags
                </p>
              </div>
            </div>
            <div className="row-actions">
              <MiniButton onClick={handleExportPlaytestReport}>
                Export playtest JSON
              </MiniButton>
              {playtestExportStatus && <span className="save-status">{playtestExportStatus}</span>}
            </div>
            <div className="storage-list">
              {playtestReport.milestones.map((target) => (
                <article className={`inventory-row ${target.status === "complete" ? "contract-needed" : target.timing === "late" ? "danger" : ""}`} key={target.id}>
                  <div>
                    <h3>{target.title}</h3>
                    <p>{target.evidence}</p>
                    <p>
                      {target.status} · {target.completedClock ?? "not timed"} · {target.timing ?? "unmeasured"}
                    </p>
                  </div>
                  <strong>{target.targetWindow}</strong>
                </article>
              ))}
              {playtestReport.flags.map((flag) => (
                <article className={`inventory-row ${flag.severity === "error" ? "danger" : flag.severity === "warning" ? "contract-needed" : ""}`} key={flag.code}>
                  <div>
                    <h3>{flag.code.replaceAll("_", " ")}</h3>
                    <p>{flag.message}</p>
                  </div>
                  <strong>{flag.severity}</strong>
                </article>
              ))}
              {playtestReport.uxSignals.map((signal) => (
                <article className={`inventory-row ${signal.severity === "error" ? "danger" : signal.severity === "warning" ? "contract-needed" : ""}`} key={signal.code}>
                  <div>
                    <h3>{signal.label}</h3>
                    <p>{signal.note}</p>
                  </div>
                  <strong>{signal.value}</strong>
                </article>
              ))}
            </div>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Users size={18} aria-hidden="true" />
              <div>
                <h3>Rival boss board</h3>
                <p>Faction quest openings, operation pressure, and relationship state.</p>
              </div>
            </div>
            <div className="storage-list">
              {rivalOrganizations.map((organization) => {
                const rival = state.factions[organization.factionId];
                const quest = quests.find((candidate) => candidate.definition.factionId === organization.factionId);
                const operation = organization.operations.find((candidate) => !candidate.resolvedHour);
                const memory = state.replay?.rivalMemory?.[organization.factionId];
                return (
                  <article className={`inventory-row ${organization.relationship === "hostile" ? "danger" : organization.relationship === "truce" ? "good" : "warning"}`} key={`boss_${organization.factionId}`}>
                    <div>
                      <h3>{organization.bossName}</h3>
                      <p>
                        {rival?.name ?? organization.factionId} · {organization.relationship} · leverage {Math.round(organization.leverage)}
                      </p>
                      <p>{quest?.definition.openingLine ?? organization.agenda}</p>
                      <p>{relationshipBrief(organization.relationship)}</p>
                      {operation && <p>Current scene pressure: {rivalOperationLabel(operation.kind)} at {state.locations[operation.locationId]?.name ?? operation.locationId}</p>}
                      {memory && <p>Run memory: {memory.undercut} undercuts · {memory.sabotage} sabotage · {memory.negotiation + memory.exposure + memory.disruption} counters</p>}
                    </div>
                    <strong>{quest?.state.status ?? "dossier"}</strong>
                  </article>
                );
              })}
            </div>
          </article>

          {quests.map((quest) => (
            <article className={`route-task ${quest.tone}`} key={`quest_${quest.definition.id}`}>
              <div>
                <h3>{quest.definition.title}</h3>
                <p>
                  {quest.definition.giverName} · {quest.definition.type} · {quest.state.status}
                </p>
                <p>
                  {quest.state.status === "completed"
                    ? "Questline complete"
                    : quest.activeStep
                      ? `${quest.activeStep.title}: ${quest.activeStep.description}`
                      : quest.definition.description}
                </p>
                {quest.state.dialogueLog.length > 0 && (
                  <p>
                    Last: {quest.state.dialogueLog[quest.state.dialogueLog.length - 1]?.speaker}: {quest.state.dialogueLog[quest.state.dialogueLog.length - 1]?.text}
                  </p>
                )}
              </div>
              <div className="route-actions">
                {quest.state.status !== "active" && quest.state.status !== "completed" && (
                  <MiniButton onClick={() => onCommand({ type: "start_quest", actorId: state.playerFactionId, questId: quest.definition.id })}>
                    Start
                  </MiniButton>
                )}
                {quest.state.status === "active" && quest.state.choiceHistory.length === 0 && quest.definition.choices.map((choice) => (
                  <MiniButton key={choice.id} onClick={() => onCommand({ type: "choose_quest_dialogue", actorId: state.playerFactionId, questId: quest.definition.id, choiceId: choice.id })}>
                    {choice.label}
                  </MiniButton>
                ))}
                <strong>{Math.round(quest.progressRatio * 100)}%</strong>
              </div>
            </article>
          ))}

          {campaignProgress.map((progress) => (
            <article className={`route-task ${progress.tone}`} key={`campaign_${progress.arc.id}`}>
              <div>
                <h3>{progress.arc.title}</h3>
                <p>
                  {progress.mission.completed
                    ? progress.arc.payoff
                    : progress.activeObjective
                      ? `${progress.activeObjective.title} · ${progress.activeObjective.description}`
                      : "No active objective"}
                </p>
                <p>
                  {progress.completedObjectives.length > 0
                    ? `Completed: ${progress.completedObjectives.map((objective) => objective.title).join(" · ")}`
                    : `Chain: ${progress.arc.missionChain.map((objective) => objective.title).join(" · ")}`}
                </p>
              </div>
              <strong>{Math.round(progress.progressRatio * 100)}%</strong>
            </article>
          ))}

          {gameDesignPillars.map((pillar) => (
            <article className="inventory-row" key={pillar.id}>
              <div>
                <h3>{pillar.title}</h3>
                <p>{pillar.promise}</p>
              </div>
              <strong>{pillar.designChecks.length} beats</strong>
            </article>
          ))}

          {storyProgress.map((progress) => (
            <article className={`route-task ${progress.tone}`} key={progress.arc.id}>
              <div>
                <h3>{progress.arc.title}</h3>
                <p>
                  {state.districts[progress.arc.districtId]?.name ?? progress.arc.districtId} · {progress.stage} · {progress.arc.reward}
                </p>
                {progress.stage === "complete" && <p>{progress.arc.payoff}</p>}
                <p>{progress.signals.length > 0 ? progress.signals.join(" · ") : progress.arc.beats.join(" · ")}</p>
              </div>
              <strong>{Math.round(progress.progressRatio * 100)}%</strong>
            </article>
          ))}

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Trophy size={18} aria-hidden="true" />
              <div>
                <h3>Endgame paths</h3>
                <p>Scores track the direction of the current save, not a final lock-in.</p>
              </div>
            </div>
            <div className="storage-list">
              {endingScores.map((ending) => (
                <article className={`inventory-row ${ending.tone === "good" ? "contract-needed" : ""}`} key={ending.path.id}>
                  <div>
                    <h3>{ending.path.title}</h3>
                    <p>{ending.path.condition}</p>
                    <p>{ending.signals.join(" · ")}</p>
                  </div>
                  <strong>{ending.score}/100</strong>
                </article>
              ))}
            </div>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Users size={18} aria-hidden="true" />
              <div>
                <h3>Street contacts</h3>
                <p>People who can deliver missions, calls, warnings, and visible street behavior.</p>
              </div>
            </div>
            <div className="storage-list">
              {npcRoles.map((role) => (
                <article className="inventory-row" key={role.id}>
                  <div>
                    <h3>{role.title}</h3>
                    <p>{role.function}</p>
                  </div>
                  <strong>contact</strong>
                </article>
              ))}
            </div>
          </article>
        </div>
      )}

      {tab === "debug" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <Wrench size={18} aria-hidden="true" />
            <span>Playtest tools for balance, unlocks, pressure, and street feedback</span>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <HandCoins size={18} aria-hidden="true" />
              <div>
                <h3>Economy</h3>
                <p>${Math.round(state.factions[state.playerFactionId].money)} cash · {state.progression.contractsCompletedTotal} contracts complete</p>
              </div>
            </div>
            <div className="row-actions">
              <MiniButton onClick={() => onCommand({ type: "debug_grant_cash", actorId: state.playerFactionId, amount: 250 })}>+$250</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "debug_complete_requirements", actorId: state.playerFactionId })}>Ready Iron Yard</MiniButton>
            </div>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Building2 size={18} aria-hidden="true" />
              <div>
                <h3>District states</h3>
                <p>Fast-forward scout/open checks without grinding.</p>
              </div>
            </div>
            <div className="row-actions">
              <MiniButton onClick={() => onCommand({ type: "debug_set_district_access", actorId: state.playerFactionId, districtId: "industrial_yards", access: "locked" })}>Lock Iron Yard</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "debug_set_district_access", actorId: state.playerFactionId, districtId: "industrial_yards", access: "scouted" })}>Scout Iron Yard</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "debug_set_district_access", actorId: state.playerFactionId, districtId: "industrial_yards", access: "unlocked" })}>Open Iron Yard</MiniButton>
            </div>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <h3>Rival pressure</h3>
                <p>Foam & Fold pressure {Math.round((state.locations.laundromat?.rivalPressure ?? 0) * 100)}%</p>
              </div>
            </div>
            <div className="row-actions">
              <MiniButton onClick={() => onCommand({ type: "debug_set_rival_pressure", actorId: state.playerFactionId, locationId: "laundromat", amount: 0.7 })}>Pressure 70%</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "debug_set_rival_pressure", actorId: state.playerFactionId, locationId: "laundromat", amount: 0.05 })}>Calm block</MiniButton>
            </div>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <Users size={18} aria-hidden="true" />
              <div>
                <h3>Street activity</h3>
                <p>Spawn visible customer, complaint, scout, or worker moments.</p>
              </div>
            </div>
            <div className="row-actions">
              <MiniButton onClick={() => onCommand({ type: "debug_spawn_activity", actorId: state.playerFactionId, activity: "customer_purchase" })}>Sale</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "debug_spawn_activity", actorId: state.playerFactionId, activity: "customer_complaint" })}>Complaint</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "debug_spawn_activity", actorId: state.playerFactionId, activity: "rival_scout" })}>Rival scout</MiniButton>
              <MiniButton onClick={() => onCommand({ type: "debug_spawn_activity", actorId: state.playerFactionId, activity: "worker_supply" })}>Worker restock</MiniButton>
            </div>
          </article>
        </div>
      )}

      {tab === "log" && (
        <div className="event-list">
          {state.eventLog.map((event) => (
            <article className={`event-row ${event.tone}`} key={event.id}>
              <time>{formatClock(event.hour)}</time>
              <span>{event.message}</span>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
