import { AlertTriangle, Boxes, ClipboardList, Map, Package, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { GameState } from "../game/core/types";
import { getMachineUpgradeEffects } from "../game/core/machineStats";
import { formatClock, getMachineLocation, inventoryUnits, ownedMachines } from "../game/core/selectors";
import { estimateMachineSalesPerHour } from "../game/systems/economy";

type DashboardTab = "machines" | "cargo" | "rival" | "log";

interface DashboardProps {
  state: GameState;
}

export function Dashboard({ state }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("machines");
  const playerMachines = useMemo(() => ownedMachines(state, state.playerFactionId), [state]);
  const rival = state.factions.rival_redline;

  return (
    <aside className="dashboard">
      <div className="tab-row" role="tablist" aria-label="Operations dashboard">
        <button className={tab === "machines" ? "tab active" : "tab"} onClick={() => setTab("machines")} type="button">
          <Map size={16} aria-hidden="true" />
          Machines
        </button>
        <button className={tab === "cargo" ? "tab active" : "tab"} onClick={() => setTab("cargo")} type="button">
          <Boxes size={16} aria-hidden="true" />
          Cargo
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
            const stock = machine.slots.reduce((sum, slot) => sum + slot.quantity, 0);
            const effects = getMachineUpgradeEffects(machine);
            const hourlySales = estimateMachineSalesPerHour(state, machine).reduce((sum, slot) => sum + slot.unitsPerHour, 0);
            return (
              <article className="machine-card" key={machine.id}>
                <div>
                  <h3>{machine.name}</h3>
                  <p>{location?.name ?? "Unknown location"}</p>
                  {effects.remoteMonitoring && <p className="remote-chip">Remote monitor online</p>}
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

      {tab === "cargo" && (
        <div className="panel-list">
          <div className="cargo-summary">
            <Package size={18} aria-hidden="true" />
            <span>
              {inventoryUnits(state.player.cargo, state)}/{state.player.cargoCapacity} capacity used
            </span>
          </div>
          {Object.values(state.products).map((product) => (
            <article className="inventory-row" key={product.id}>
              <div>
                <h3>{product.name}</h3>
                <p>{product.description}</p>
              </div>
              <strong>{state.player.cargo[product.id] ?? 0}</strong>
            </article>
          ))}
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
