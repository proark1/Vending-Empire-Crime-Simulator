import { AlertTriangle, BarChart3, Boxes, Building2, ClipboardList, Factory, FlaskConical, HandCoins, Landmark, Lock, Map, Navigation, Package, PackagePlus, Route, Search, ShieldAlert, SlidersHorizontal, Trophy, Truck, Unlock, UserPlus, Users, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ConflictEvent, GameCommand, GameState, RivalOperationApproach } from "../game/core/types";
import { employeeRoleList, employeeRoles } from "../game/content/employees";
import { getMachineUpgradeEffects } from "../game/core/machineStats";
import {
  activeContracts,
  activeConflictEvents,
  activeLawInspections,
  activeVehicle,
  assignedEmployeesForMachine,
  baseFacilityUpgradeCost,
  baseSecurityScore,
  baseStorageCapacity,
  carriedCrateUnits,
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
  endgamePathScores,
  employeeList,
  financeLedger,
  financeSummary,
  formatClock,
  garageStorageUnits,
  getMachineLocation,
  installedMachines,
  installableLocation,
  latestDayReport,
  machineAtLocation,
  machineRoutePressure,
  machineStockUnits,
  ownedMachines,
  placementCostForLocation,
  productLabSlots,
  regionalManagerCapacity,
  rivalTerritoryByDistrict,
  routeDangerScore,
  routeTasks,
  selectedRouteTask,
  storyArcProgress,
  vehicleInventoryUnits,
  vehicleSpaceRemaining
} from "../game/core/selectors";
import { estimateMachineSalesPerHour } from "../game/systems/economy";
import { machineModels } from "../game/content/machineModels";
import { gameDesignPillars, npcRoles } from "../game/content/story";
import { baseFacilityList } from "../game/content/baseFacilities";
import { graphicsQualityLabels, graphicsQualityModes, type GraphicsQuality } from "../render/three/graphicsQuality";

type DashboardTab = "machines" | "base" | "catalog" | "finance" | "districts" | "jobs" | "route" | "logistics" | "crew" | "law" | "heat" | "conflict" | "rival" | "story" | "debug" | "log";

interface DashboardProps {
  graphicsQuality: GraphicsQuality;
  state: GameState;
  onCommand: (command: GameCommand) => void;
  onGraphicsQualityChange: (quality: GraphicsQuality) => void;
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

export function Dashboard({ graphicsQuality, state, onCommand, onGraphicsQualityChange, showDebug }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("machines");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const playerMachines = useMemo(() => ownedMachines(state, state.playerFactionId), [state]);
  const installedPlayerMachines = useMemo(() => installedMachines(state, state.playerFactionId), [state]);
  const rivals = useMemo(() => Object.values(state.factions).filter((faction) => faction.type === "npc"), [state.factions]);
  const vehicle = activeVehicle(state);
  const employees = useMemo(() => employeeList(state), [state]);
  const districtSummaries = useMemo(
    () =>
      Object.values(state.districts)
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
        .sort((a, b) => a.district.name.localeCompare(b.district.name)),
    [state, vehicle]
  );
  const tasks = useMemo(() => routeTasks(state), [state]);
  const selectedTask = selectedRouteTask(state);
  const contracts = useMemo(() => activeContracts(state), [state]);
  const inspections = useMemo(() => activeLawInspections(state), [state]);
  const conflicts = useMemo(() => activeConflictEvents(state), [state]);
  const rivalOrganizations = useMemo(() => Object.values(state.rivalOrganizations ?? {}), [state.rivalOrganizations]);
  const finance = financeSummary(state);
  const ledger = financeLedger(state).slice(0, 16);
  const territory = rivalTerritoryByDistrict(state);
  const dayReport = latestDayReport(state);
  const storyProgress = useMemo(() => storyArcProgress(state), [state]);
  const endingScores = useMemo(() => endgamePathScores(state), [state]);
  const advancedTabs = useMemo<DashboardTab[]>(() => ["catalog", "finance", "logistics", "heat", "conflict", "rival", "story", ...(showDebug ? (["debug"] as DashboardTab[]) : [])], [showDebug]);
  const visibleTabs = useMemo<Array<{ icon: React.ReactNode; id: DashboardTab; label: string }>>(
    () => [
      { id: "machines", label: "Machines", icon: <Map size={16} aria-hidden="true" /> },
      { id: "jobs", label: "Jobs", icon: <ClipboardList size={16} aria-hidden="true" /> },
      { id: "route", label: "Route", icon: <Route size={16} aria-hidden="true" /> },
      { id: "base", label: "Base", icon: <Factory size={16} aria-hidden="true" /> },
      { id: "districts", label: "Districts", icon: <Building2 size={16} aria-hidden="true" /> },
      { id: "crew", label: "Crew", icon: <Users size={16} aria-hidden="true" /> },
      { id: "law", label: "Law", icon: <ShieldAlert size={16} aria-hidden="true" /> },
      { id: "log", label: "Log", icon: <ClipboardList size={16} aria-hidden="true" /> },
      ...(showAdvanced
        ? [
            { id: "catalog" as DashboardTab, label: "Market", icon: <FlaskConical size={16} aria-hidden="true" /> },
            { id: "finance" as DashboardTab, label: "Finance", icon: <Landmark size={16} aria-hidden="true" /> },
            { id: "logistics" as DashboardTab, label: "Stock", icon: <Package size={16} aria-hidden="true" /> },
            { id: "heat" as DashboardTab, label: "Heat", icon: <AlertTriangle size={16} aria-hidden="true" /> },
            { id: "conflict" as DashboardTab, label: "Conflict", icon: <ShieldAlert size={16} aria-hidden="true" /> },
            { id: "rival" as DashboardTab, label: "Rivals", icon: <Map size={16} aria-hidden="true" /> },
            { id: "story" as DashboardTab, label: "Story", icon: <Trophy size={16} aria-hidden="true" /> },
            ...(showDebug ? [{ id: "debug" as DashboardTab, label: "Debug", icon: <Wrench size={16} aria-hidden="true" /> }] : [])
          ]
        : [])
    ],
    [showAdvanced, showDebug]
  );

  useEffect(() => {
    if (!showAdvanced && advancedTabs.includes(tab)) {
      setTab("machines");
      return;
    }

    if (tab === "debug" && !showDebug) {
      setTab("machines");
    }
  }, [advancedTabs, showAdvanced, showDebug, tab]);

  return (
    <aside className="dashboard">
      <div className="dashboard-header">
        <div className="graphics-quality-control" aria-label="Graphics quality">
          <span>
            <SlidersHorizontal size={15} aria-hidden="true" />
            Graphics
          </span>
          <div className="graphics-quality-options" role="group" aria-label="Graphics quality">
            {graphicsQualityModes.map((quality) => (
              <button
                aria-pressed={graphicsQuality === quality}
                className={graphicsQuality === quality ? "quality-button active" : "quality-button"}
                key={quality}
                onClick={() => onGraphicsQualityChange(quality)}
                type="button"
              >
                {graphicsQualityLabels[quality]}
              </button>
            ))}
          </div>
        </div>
        <div className="dashboard-mode-row">
          <button aria-pressed={showAdvanced} className={showAdvanced ? "mini-button active" : "mini-button"} onClick={() => setShowAdvanced((current) => !current)} type="button">
            <SlidersHorizontal size={13} aria-hidden="true" />
            Advanced
          </button>
        </div>
      </div>
      <div className="tab-row" role="tablist" aria-label="Operations dashboard">
        {visibleTabs.map((item) => (
          <DashboardTabButton active={tab === item.id} icon={item.icon} key={item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </DashboardTabButton>
        ))}
      </div>

      {tab === "machines" && (
        <div className="panel-list">
          {playerMachines.map((machine) => {
            const location = getMachineLocation(state, machine.id);
            const stock = machineStockUnits(machine);
            const effects = getMachineUpgradeEffects(machine);
            const model = machineModels[machine.machineModelId] ?? machineModels.basic_snack;
            const hourlySales = estimateMachineSalesPerHour(state, machine).reduce((sum, slot) => sum + slot.unitsPerHour, 0);
            const installed = (machine.placementStatus ?? "installed") === "installed";
            const pressure = installed ? machineRoutePressure(state, machine) : undefined;
            const assignedCrew = assignedEmployeesForMachine(state, machine.id);
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
              </article>
            );
          })}
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
                    {product.demandTags.join(" · ")}{customization ? ` · ${customization.mode.replace("_", " ")}` : ""}
                  </p>
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

          {selectedTask && (
            <article className={`route-task selected ${selectedTask.tone}`}>
              <div>
                <h3>{selectedTask.title}</h3>
                <p>{selectedTask.detail}</p>
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
              return (
                <article className={`route-task ${task.tone} ${isSelected ? "selected" : ""}`} key={task.id}>
                  <div>
                    <h3>{task.title}</h3>
                    <p>
                      {location?.name ?? "Unknown stop"} · {task.detail}
                    </p>
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
              {Math.round(state.factions[state.playerFactionId].heat)} heat · {state.law.inspectionsToday} inspections today · ${Math.round(state.law.finesToday)} fines
            </span>
          </article>

          <article className="vehicle-card">
            <div className="vehicle-heading">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <h3>Law pressure</h3>
                <p>
                  Next inspection window {formatClock(state.law.nextInspectionHour)} · {state.law.confiscatedUnitsToday} stock confiscated today
                </p>
              </div>
            </div>
            <div className="report-grid">
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
                <p>Placement method, grey stock, heat, and police presence decide the next check.</p>
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
              {Math.round(state.factions[state.playerFactionId].heat)} heat · {Math.round(state.factions[state.playerFactionId].publicReputation)} public rep · {Math.round(state.factions[state.playerFactionId].streetReputation)} street rep
            </span>
          </article>
          <article className="vehicle-card">
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
            return (
              <article className="rival-panel" key={organization.factionId}>
                <div className="rival-header">
                  <Users size={20} aria-hidden="true" />
                  <div>
                    <h3>{organization.bossName}</h3>
                    <p>
                      {rival?.name ?? organization.factionId} · {organization.relationship} · leverage {Math.round(organization.leverage)}
                    </p>
                  </div>
                </div>
                <p>{organization.agenda}</p>
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
                <AlertTriangle size={20} aria-hidden="true" />
                <div>
                  <h3>{rival.name}</h3>
                  <p>
                    {rival.archetype?.replace("_", " ") ?? "rival"} · {rival.tactic ?? "competes for territory"}
                  </p>
                </div>
              </div>
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

      {tab === "story" && (
        <div className="panel-list">
          <article className="cargo-summary">
            <ClipboardList size={18} aria-hidden="true" />
            <span>
              {gameDesignPillars.length} pillars · {storyProgress.length} arcs · leading ending {endingScores[0]?.path.title ?? "unknown"}
            </span>
          </article>

          {gameDesignPillars.map((pillar) => (
            <article className="inventory-row" key={pillar.id}>
              <div>
                <h3>{pillar.title}</h3>
                <p>{pillar.promise}</p>
              </div>
              <strong>{pillar.designChecks.length} checks</strong>
            </article>
          ))}

          {storyProgress.map((progress) => (
            <article className={`route-task ${progress.tone}`} key={progress.arc.id}>
              <div>
                <h3>{progress.arc.title}</h3>
                <p>
                  {state.districts[progress.arc.districtId]?.name ?? progress.arc.districtId} · {progress.stage} · {progress.arc.reward}
                </p>
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
                <h3>NPC role backlog</h3>
                <p>Authored roles for mission and systemic expansion.</p>
              </div>
            </div>
            <div className="storage-list">
              {npcRoles.map((role) => (
                <article className="inventory-row" key={role.id}>
                  <div>
                    <h3>{role.title}</h3>
                    <p>{role.function}</p>
                  </div>
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
