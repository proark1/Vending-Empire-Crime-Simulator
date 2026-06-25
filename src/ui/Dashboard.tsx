import { AlertTriangle, Boxes, Building2, ClipboardList, HandCoins, Lock, Map, Navigation, Package, PackagePlus, Route, Search, ShieldAlert, Truck, Unlock, UserPlus, Users, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import type { GameCommand, GameState } from "../game/core/types";
import { employeeRoleList, employeeRoles } from "../game/content/employees";
import { getMachineUpgradeEffects } from "../game/core/machineStats";
import {
  activeContracts,
  activeVehicle,
  assignedEmployeesForMachine,
  carriedCrateUnits,
  contractProgressRatio,
  contractRemainingQuantity,
  contractTone,
  dailyEmployeeWages,
  districtLocations,
  districtMachineCounts,
  districtUnlockInfo,
  employeeList,
  formatClock,
  garageStorageUnits,
  getMachineLocation,
  installableLocation,
  latestDayReport,
  machineAtLocation,
  machineRoutePressure,
  machineStockUnits,
  ownedMachines,
  placementCostForLocation,
  routeTasks,
  selectedRouteTask,
  vehicleInventoryUnits,
  vehicleSpaceRemaining
} from "../game/core/selectors";
import { estimateMachineSalesPerHour } from "../game/systems/economy";

type DashboardTab = "machines" | "districts" | "jobs" | "route" | "logistics" | "crew" | "rival" | "log";

interface DashboardProps {
  state: GameState;
  onCommand: (command: GameCommand) => void;
}

function MiniButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="mini-button" disabled={disabled} onClick={onClick} type="button">
      {children}
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

  return <PackagePlus size={16} aria-hidden="true" />;
}

export function Dashboard({ state, onCommand }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("machines");
  const playerMachines = useMemo(() => ownedMachines(state, state.playerFactionId), [state]);
  const rival = state.factions.rival_redline;
  const vehicle = activeVehicle(state);
  const employees = useMemo(() => employeeList(state), [state]);
  const districtSummaries = useMemo(
    () =>
      Object.values(state.districts)
        .map((district) => {
          const locations = districtLocations(state, district.id).filter(installableLocation);
          const openSites = locations.filter((location) => !machineAtLocation(state, location.id));
          const pressure = locations.reduce((sum, location) => sum + location.rivalPressure, 0) / Math.max(1, locations.length);
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
    [state]
  );
  const tasks = useMemo(() => routeTasks(state), [state]);
  const selectedTask = selectedRouteTask(state);
  const contracts = useMemo(() => activeContracts(state), [state]);
  const dayReport = latestDayReport(state);

  return (
    <aside className="dashboard">
      <div className="tab-row" role="tablist" aria-label="Operations dashboard">
        <button className={tab === "machines" ? "tab active" : "tab"} onClick={() => setTab("machines")} type="button">
          <Map size={16} aria-hidden="true" />
          Machines
        </button>
        <button className={tab === "districts" ? "tab active" : "tab"} onClick={() => setTab("districts")} type="button">
          <Building2 size={16} aria-hidden="true" />
          Districts
        </button>
        <button className={tab === "jobs" ? "tab active" : "tab"} onClick={() => setTab("jobs")} type="button">
          <ClipboardList size={16} aria-hidden="true" />
          Jobs
        </button>
        <button className={tab === "route" ? "tab active" : "tab"} onClick={() => setTab("route")} type="button">
          <Route size={16} aria-hidden="true" />
          Route
        </button>
        <button className={tab === "logistics" ? "tab active" : "tab"} onClick={() => setTab("logistics")} type="button">
          <Boxes size={16} aria-hidden="true" />
          Logistics
        </button>
        <button className={tab === "crew" ? "tab active" : "tab"} onClick={() => setTab("crew")} type="button">
          <Users size={16} aria-hidden="true" />
          Crew
        </button>
        <button className={tab === "rival" ? "tab active" : "tab"} onClick={() => setTab("rival")} type="button">
          <ShieldAlert size={16} aria-hidden="true" />
          Rival
        </button>
        <button className={tab === "log" ? "tab active" : "tab"} onClick={() => setTab("log")} type="button">
          <ClipboardList size={16} aria-hidden="true" />
          Log
        </button>
      </div>

      {tab === "machines" && (
        <div className="panel-list">
          {playerMachines.map((machine) => {
            const location = getMachineLocation(state, machine.id);
            const stock = machineStockUnits(machine);
            const effects = getMachineUpgradeEffects(machine);
            const hourlySales = estimateMachineSalesPerHour(state, machine).reduce((sum, slot) => sum + slot.unitsPerHour, 0);
            const pressure = machineRoutePressure(state, machine);
            const assignedCrew = assignedEmployeesForMachine(state, machine.id);
            return (
              <article className="machine-card" key={machine.id}>
                <div>
                  <h3>{machine.name}</h3>
                  <p>{location?.name ?? "Unknown location"}</p>
                  {effects.remoteMonitoring && <p className="remote-chip">Remote monitor online</p>}
                  {assignedCrew.length > 0 && <p className="remote-chip">Crew: {assignedCrew.map((employee) => employee.name).join(", ")}</p>}
                  {pressure.reasons.length > 0 && <p className={`route-chip ${pressure.tone}`}>{pressure.reasons.join(" · ")}</p>}
                </div>
                <div className="machine-metrics">
                  <span>${Math.round(machine.revenueStored)}</span>
                  <span>{stock} stock</span>
                  <span>{hourlySales.toFixed(1)}/hr</span>
                  <span>{Math.round(machine.damage)}% damage</span>
                  <span>{(machine.upgrades ?? []).length} upgrades</span>
                </div>
              </article>
            );
          })}
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
                    Parked at {state.locations[vehicle.locationId]?.name ?? "unknown stop"} · {vehicleInventoryUnits(state, vehicle)}/{vehicle.capacity} trunk
                  </p>
                </div>
              </div>
              <div className="vehicle-meter">
                <span style={{ width: `${Math.min(100, (vehicleInventoryUnits(state, vehicle) / vehicle.capacity) * 100)}%` }} />
              </div>
              <p className="vehicle-note">{vehicleSpaceRemaining(state, vehicle)} trunk space open</p>
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
              {carriedCrateUnits(state)}/{state.player.cargoCapacity} carried · {garageStorageUnits(state)}/{state.player.garageCapacity} stored
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
              {employees.length} crew · ${dailyEmployeeWages(state)}/day wages
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
                      {role.title} · ${employee.wagePerDay}/day · {employee.statusDetail}
                    </p>
                    <p>
                      Reliability {Math.round(employee.reliability * 100)} · Skill {Math.round(employee.skill * 100)} · Loyalty {Math.round(employee.loyalty * 100)}
                    </p>
                  </div>
                  <div className="route-actions">
                    {playerMachines.map((machine) => {
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

      {tab === "rival" && (
        <div className="rival-panel">
          <div className="rival-header">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <h3>{rival.name}</h3>
              <p>NPC faction controller active</p>
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
