import { useEffect, useState } from "react";
import { Camera, ChevronDown, ChevronUp, CreditCard, HandCoins, Lightbulb, Lock, Minus, PackagePlus, Plus, RadioTower, RotateCcw, Save, Shield, ShieldAlert, ShoppingCart, Sparkles, Truck, Wrench, Zap } from "lucide-react";
import type { ConflictEvent, GameCommand, GameState, MachineUpgradeId } from "../game/core/types";
import { machineUpgradeList } from "../game/content/machineUpgrades";
import { machineModels } from "../game/content/machineModels";
import { effectiveMachineSecurity, effectiveMachineVisibility, getMachineUpgradeEffects, machineHasUpgrade, priceDemandMultiplier } from "../game/core/machineStats";
import {
  activeAlarmForMachine,
  activeContractsAtLocation,
  activeConflictEvents,
  activeVehicle,
  baseFacilityUpgradeCost,
  baseStorageCapacity,
  cargoSpaceRemaining,
  carriedCrateUnits,
  contractNeedByProduct,
  contractProgressRatio,
  contractRemainingQuantity,
  contractTone,
  currentProductCost,
  districtUnlockInfo,
  garageStorageSpaceRemaining,
  garageStorageUnits,
  isDistrictUnlockedForPlacement,
  machineAtLocation,
  machineRoutePressure,
  machineStockUnits,
  placementQuotesForLocation,
  repairCostForMachine,
  storedPlayerMachines,
  vehicleInventoryUnits,
  vehicleSpaceRemaining
} from "../game/core/selectors";
import { estimateMachineSalesPerHour } from "../game/systems/economy";
import { baseFacilityList } from "../game/content/baseFacilities";
import type { SceneTarget } from "../render/three/SceneTargets";
import { getPrimaryInteraction, type PrimaryInteraction } from "./interactionActions";

interface InteractionPanelProps {
  state: GameState;
  target: SceneTarget | null;
  onCommand: (command: GameCommand) => void;
  onSave: () => void;
  onReload: () => void;
  onRestart: () => void;
}

function ActionButton({
  children,
  disabled,
  onClick,
  icon
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button className="action-button" disabled={disabled} onClick={onClick} type="button">
      {icon}
      <span>{children}</span>
    </button>
  );
}

function DetailsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button aria-expanded={open} className="details-toggle" onClick={onToggle} type="button">
      {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      <span>{open ? "Hide details" : "Details"}</span>
    </button>
  );
}

function PrimaryHint({ interaction }: { interaction: PrimaryInteraction }) {
  return (
    <div className={`primary-hint ${interaction.disabled ? "disabled" : ""}`}>
      <kbd>E</kbd>
      <span>{interaction.label}</span>
      {interaction.disabled && interaction.disabledReason && <em>{interaction.disabledReason}</em>}
    </div>
  );
}

const upgradeIcons: Record<MachineUpgradeId, React.ReactNode> = {
  reinforced_glass: <Shield size={16} aria-hidden="true" />,
  smart_lock: <Lock size={16} aria-hidden="true" />,
  security_camera: <Camera size={16} aria-hidden="true" />,
  cashless_terminal: <CreditCard size={16} aria-hidden="true" />,
  neon_sign: <Lightbulb size={16} aria-hidden="true" />,
  remote_monitor: <RadioTower size={16} aria-hidden="true" />
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatUpgradeEffect(upgradeId: MachineUpgradeId): string {
  const upgrade = machineUpgradeList.find((candidate) => candidate.id === upgradeId);
  if (!upgrade) {
    return "";
  }

  const effects = upgrade.effects;
  const parts = [
    effects.salesMultiplier ? `+${formatPercent(effects.salesMultiplier)} sales` : "",
    effects.visibilityBonus ? `+${formatPercent(effects.visibilityBonus)} visibility` : "",
    effects.securityBonus ? `+${formatPercent(effects.securityBonus)} security` : "",
    effects.damageResistance ? `+${formatPercent(effects.damageResistance)} durability` : "",
    effects.sabotageResistance ? `+${formatPercent(effects.sabotageResistance)} protection` : "",
    effects.remoteMonitoring ? "remote readout" : ""
  ].filter(Boolean);

  return parts.join(" · ");
}

function ConflictActions({ conflict, onCommand, state }: { conflict: ConflictEvent; onCommand: (command: GameCommand) => void; state: GameState }) {
  const vehicle = activeVehicle(state);
  const vehicleAtStop = vehicle?.locationId === conflict.locationId;
  return (
    <div className="machine-section machine-alarm">
      <div className="section-title">
        <ShieldAlert size={16} aria-hidden="true" />
        <span>{conflict.kind === "base_raid" ? "Base defense" : conflict.kind === "route_ambush" ? "Route ambush" : "Street chase"}</span>
        <em>{Math.max(1, Math.ceil((conflict.expiresHour - state.worldTimeHours) * 60))}m</em>
      </div>
      <p>{conflict.message}</p>
      <div className="action-grid">
        <ActionButton icon={<Zap size={17} aria-hidden="true" />} onClick={() => onCommand({ type: "resolve_conflict_event", actorId: state.playerFactionId, eventId: conflict.id, resolution: "melee" })}>
          Melee
        </ActionButton>
        <ActionButton
          disabled={!vehicleAtStop}
          icon={<Truck size={17} aria-hidden="true" />}
          onClick={() => onCommand({ type: "resolve_conflict_event", actorId: state.playerFactionId, eventId: conflict.id, resolution: "drive_escape" })}
        >
          Escape
        </ActionButton>
        <ActionButton
          icon={<Shield size={17} aria-hidden="true" />}
          onClick={() => onCommand({ type: "resolve_conflict_event", actorId: state.playerFactionId, eventId: conflict.id, resolution: "remote_lockdown" })}
        >
          Lockdown
        </ActionButton>
      </div>
    </div>
  );
}

export function InteractionPanel({ state, target, onCommand, onSave, onReload, onRestart }: InteractionPanelProps) {
  const player = state.factions[state.playerFactionId];
  const primaryInteraction = getPrimaryInteraction(state, target);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const targetKey = target ? `${target.type}:${target.id}` : "none";
  const panelClassName = `interaction-panel ${detailsOpen ? "details-open" : "details-closed"}`;
  const detailsToggle = <DetailsToggle open={detailsOpen} onToggle={() => setDetailsOpen((current) => !current)} />;

  useEffect(() => {
    setDetailsOpen(false);
  }, [targetKey]);

  if (!target) {
    return (
      <section className="interaction-panel muted">
        <h2>Street View</h2>
        <p>Nearby machines, suppliers, and placement pads will surface here.</p>
      </section>
    );
  }

  const targetLocationId =
    target.type === "base" || target.type === "supplier" || target.type === "placement"
      ? target.id
      : state.machines[target.id]?.locationId;
  const conflictAtTarget = targetLocationId ? activeConflictEvents(state).find((conflict) => conflict.locationId === targetLocationId) : undefined;

  if (target.type === "base") {
    const crate = state.player.carriedCrate;
    const storageUsed = garageStorageUnits(state);
    const storageRemaining = garageStorageSpaceRemaining(state);
    const vehicle = activeVehicle(state);
    const contractNeeds = contractNeedByProduct(state);
    const storedMachines = storedPlayerMachines(state);

    return (
      <section className={panelClassName}>
        <h2>{target.label}</h2>
        {primaryInteraction && <PrimaryHint interaction={primaryInteraction} />}
        {detailsToggle}
        {conflictAtTarget && <ConflictActions conflict={conflictAtTarget} onCommand={onCommand} state={state} />}
        {storedMachines.length > 0 && (
          <div className="machine-section">
            <div className="section-title">
              <Wrench size={16} aria-hidden="true" />
              <span>Garage machines</span>
              <em>{storedMachines.length}</em>
            </div>
            <div className="storage-list">
              {storedMachines.map((machine) => {
                const cost = repairCostForMachine(machine);
                return (
                  <article className="inventory-row" key={machine.id}>
                    <div>
                      <h3>{machine.name}</h3>
                      <p>
                        Stored for placement · {Math.round(machine.damage)}% damage · {machine.damage > 0 ? `$${cost} repair` : "ready for Foam & Fold"}
                      </p>
                    </div>
                    <ActionButton
                      disabled={machine.damage <= 0 || player.money < cost}
                      icon={<Wrench size={17} aria-hidden="true" />}
                      onClick={() => onCommand({ type: "repair_machine", actorId: state.playerFactionId, machineId: machine.id })}
                    >
                      Repair
                    </ActionButton>
                  </article>
                );
              })}
            </div>
          </div>
        )}
        <div className="machine-section">
            <div className="section-title">
              <PackagePlus size={16} aria-hidden="true" />
              <span>Route loadout</span>
              <em>
              {storageUsed}/{baseStorageCapacity(state)}
            </em>
            </div>
          {crate ? (
            <article className="slot-row">
              <div>
                <h3>{state.products[crate.productId].name} crate</h3>
                <p>
                  {crate.quantity}/{crate.capacity} carried · {crate.source === "supplier" ? "fresh from supplier" : "from garage storage"}
                </p>
              </div>
              <ActionButton icon={<PackagePlus size={17} aria-hidden="true" />} onClick={() => onCommand({ type: "deposit_crate", actorId: state.playerFactionId })}>
                Store
              </ActionButton>
            </article>
          ) : (
            <p className="empty-note">Hands free. Load one garage crate before running a route.</p>
          )}
          <div className="storage-list">
            {Object.values(state.products).map((product) => {
              const quantity = state.player.garageStorage[product.id] ?? 0;
              const crateQuantity = Math.min(quantity, Math.floor(state.player.cargoCapacity / product.size));
              const contractNeed = contractNeeds[product.id] ?? 0;
              return (
                <article className={`inventory-row ${contractNeed > 0 ? "contract-needed" : ""}`} key={product.id}>
                  <div>
                    <h3>{product.name}</h3>
                    <p>
                      {quantity} stored · {storageRemaining} free capacity{contractNeed > 0 ? ` · Contract need ${contractNeed}` : ""}
                    </p>
                  </div>
                  <ActionButton
                    disabled={Boolean(crate) || crateQuantity <= 0}
                    icon={<PackagePlus size={17} aria-hidden="true" />}
                    onClick={() => onCommand({ type: "load_crate", actorId: state.playerFactionId, productId: product.id, quantity: crateQuantity })}
                  >
                    Carry {crateQuantity || 0}
                  </ActionButton>
                </article>
              );
            })}
          </div>
        </div>
        <div className="machine-section">
          <div className="section-title">
            <Wrench size={16} aria-hidden="true" />
            <span>Base upgrades</span>
          </div>
          <div className="storage-list">
            {baseFacilityList.map((facility) => {
              const current = state.base.facilities[facility.id];
              const cost = baseFacilityUpgradeCost(state, facility.id);
              const atMax = current.level >= facility.maxLevel;
              return (
                <article className="inventory-row" key={facility.id}>
                  <div>
                    <h3>{facility.name}</h3>
                    <p>
                      Level {current.level}/{facility.maxLevel} · {facility.description}
                    </p>
                  </div>
                  <ActionButton
                    disabled={atMax || player.money < cost}
                    icon={<Wrench size={17} aria-hidden="true" />}
                    onClick={() => onCommand({ type: "upgrade_base_facility", actorId: state.playerFactionId, facilityId: facility.id })}
                  >
                    {atMax ? "Max" : `$${cost}`}
                  </ActionButton>
                </article>
              );
            })}
          </div>
        </div>
        {vehicle && (
          <div className="machine-section">
            <div className="section-title">
              <Truck size={16} aria-hidden="true" />
              <span>{vehicle.name}</span>
              <em>
                {vehicleInventoryUnits(state, vehicle)}/{vehicle.capacity}
              </em>
            </div>
            <p className="empty-note">
              Parked at {state.locations[vehicle.locationId]?.name ?? "unknown stop"} · {vehicleSpaceRemaining(state, vehicle)} trunk space open · {Math.round((vehicle.condition ?? 1) * 100)}% condition
            </p>
            <div className="action-grid">
              <ActionButton
                disabled={vehicle.locationId !== "garage"}
                icon={<Wrench size={17} aria-hidden="true" />}
                onClick={() => onCommand({ type: "service_vehicle", actorId: state.playerFactionId, vehicleId: vehicle.id })}
              >
                Service
              </ActionButton>
            </div>
            <div className="storage-list">
              {Object.values(state.products).map((product) => {
                const stored = state.player.garageStorage[product.id] ?? 0;
                const inVehicle = vehicle.inventory[product.id] ?? 0;
                const loadQuantity = Math.min(stored, Math.floor(vehicleSpaceRemaining(state, vehicle) / product.size), 12);
                const contractNeed = contractNeeds[product.id] ?? 0;
                return (
                  <article className={`inventory-row ${contractNeed > 0 ? "contract-needed" : ""}`} key={product.id}>
                    <div>
                      <h3>{product.name}</h3>
                      <p>
                        Garage {stored} · Van {inVehicle}{contractNeed > 0 ? ` · Contract need ${contractNeed}` : ""}
                      </p>
                    </div>
                    <div className="row-actions">
                      <ActionButton
                        disabled={vehicle.locationId !== "garage" || loadQuantity <= 0}
                        icon={<PackagePlus size={17} aria-hidden="true" />}
                        onClick={() =>
                          onCommand({
                            type: "load_vehicle",
                            actorId: state.playerFactionId,
                            vehicleId: vehicle.id,
                            productId: product.id,
                            quantity: loadQuantity
                          })
                        }
                      >
                        Load {loadQuantity || 0}
                      </ActionButton>
                      <ActionButton
                        disabled={vehicle.locationId !== "garage" || inVehicle <= 0}
                        icon={<PackagePlus size={17} aria-hidden="true" />}
                        onClick={() =>
                          onCommand({
                            type: "unload_vehicle",
                            actorId: state.playerFactionId,
                            vehicleId: vehicle.id,
                            productId: product.id,
                            quantity: inVehicle
                          })
                        }
                      >
                        Unload
                      </ActionButton>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
        <div className="action-grid">
          <ActionButton icon={<Save size={17} aria-hidden="true" />} onClick={onSave}>
            Save
          </ActionButton>
          <ActionButton icon={<RotateCcw size={17} aria-hidden="true" />} onClick={onReload}>
            Load
          </ActionButton>
          <ActionButton icon={<RotateCcw size={17} aria-hidden="true" />} onClick={onRestart}>
            Restart
          </ActionButton>
        </div>
      </section>
    );
  }

  if (target.type === "supplier") {
    const carrying = Boolean(state.player.carriedCrate) || carriedCrateUnits(state) > 0;

    return (
      <section className={panelClassName}>
        <h2>{target.label}</h2>
        {primaryInteraction && <PrimaryHint interaction={primaryInteraction} />}
        {detailsToggle}
        <div className="action-grid">
          {Object.values(state.products).map((product) => {
            const quantity = product.legality > 0 ? 3 : product.size > 1 ? Math.min(6, Math.floor(state.player.cargoCapacity / product.size)) : Math.min(10, Math.floor(state.player.cargoCapacity / product.size));
            const cost = currentProductCost(state, product.id) * quantity;
            const disabled = carrying || player.money < cost || cargoSpaceRemaining(state) < product.size * quantity;
            return (
              <ActionButton
                disabled={disabled}
                icon={<ShoppingCart size={17} aria-hidden="true" />}
                key={product.id}
                onClick={() => onCommand({ type: "buy_product", actorId: state.playerFactionId, productId: product.id, quantity })}
              >
                {product.name} crate ${cost}
              </ActionButton>
            );
          })}
        </div>
        {carrying && <p className="empty-note">Hands full. Store your current crate at the garage before buying more stock.</p>}
      </section>
    );
  }

  if (target.type === "placement") {
    const location = state.locations[target.id];
    const occupied = Boolean(machineAtLocation(state, target.id));
    const unlocked = isDistrictUnlockedForPlacement(state, location.districtId);
    const district = state.districts[location.districtId];
    const unlockInfo = districtUnlockInfo(state, location.districtId);
    const unmetRequirements = unlockInfo.unmetRequirements.join(" · ");
    const placementQuotes = placementQuotesForLocation(state, location);
    const storedMachine = storedPlayerMachines(state)[0];
    const storedBlocked = Boolean(storedMachine && storedMachine.damage > 0);
    return (
      <section className={panelClassName}>
        <h2>{location.name}</h2>
        {primaryInteraction && <PrimaryHint interaction={primaryInteraction} />}
        {detailsToggle}
        {conflictAtTarget && <ConflictActions conflict={conflictAtTarget} onCommand={onCommand} state={state} />}
        <p>
          Traffic {location.footTraffic.toFixed(1)} · Risk {Math.round((1 - location.safety + location.policePresence) * 50)}
        </p>
        <p>
          {district?.name ?? "Unknown district"} · {unlockInfo.progress.access}
        </p>
        <div className="action-grid">
          {unlockInfo.progress.access === "locked" && (
            <ActionButton
              disabled={!unlockInfo.canScout}
              icon={<Lock size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "scout_district", actorId: state.playerFactionId, districtId: location.districtId })}
            >
              Scout ${district?.scoutCost ?? 0}
            </ActionButton>
          )}
          {unlockInfo.progress.access === "scouted" && !unlocked && (
            <ActionButton
              disabled={!unlockInfo.canUnlock}
              icon={<Lock size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "unlock_district", actorId: state.playerFactionId, districtId: location.districtId })}
            >
              Open ${district?.unlockCost ?? 0}
            </ActionButton>
          )}
          {unlocked && (
            placementQuotes.map((quote) => (
              <ActionButton
                disabled={occupied || player.money < quote.cost || storedBlocked}
                icon={<PackagePlus size={17} aria-hidden="true" />}
                key={quote.method}
                onClick={() =>
                  onCommand({
                    type: "place_machine",
                    actorId: state.playerFactionId,
                    locationId: location.id,
                    method: quote.method,
                    machineId: storedMachine?.id
                  })
                }
              >
                {quote.label} ${quote.cost}
              </ActionButton>
            ))
          )}
        </div>
        {unlocked && (
          <div className="placement-method-list">
            {placementQuotes.map((quote) => (
              <article className={`placement-method ${quote.inspectionRiskLabel}`} key={quote.method}>
                <div>
                  <h3>{quote.label}</h3>
                  <p>{quote.description}</p>
                </div>
                <strong>
                  {quote.heatDelta > 0 ? `+${quote.heatDelta} heat` : "clean"} · {quote.inspectionRiskLabel} risk
                </strong>
              </article>
            ))}
          </div>
        )}
        {storedBlocked && <p className="empty-note">Repair {storedMachine?.name} at the garage before placing it.</p>}
        {!unlocked && <p className="empty-note">{unmetRequirements ? `Needs ${unmetRequirements}.` : "Scout and open this area before installing machines."}</p>}
      </section>
    );
  }

  const machine = state.machines[target.id];
  if (!machine) {
    return null;
  }

  const owner = state.factions[machine.ownerFactionId];
  const model = machineModels[machine.machineModelId] ?? machineModels.basic_snack;
  const isPlayerMachine = machine.ownerFactionId === state.playerFactionId;
  const effects = getMachineUpgradeEffects(machine);
  const security = effectiveMachineSecurity(machine);
  const visibility = effectiveMachineVisibility(machine);
  const slotRates = estimateMachineSalesPerHour(state, machine);
  const installedUpgrades = machine.upgrades ?? [];
  const stock = machineStockUnits(machine);
  const pressure = machineRoutePressure(state, machine);
  const carriedCrate = state.player.carriedCrate;
  const carriedProduct = carriedCrate ? state.products[carriedCrate.productId] : null;
  const vehicle = activeVehicle(state);
  const vehicleAtMachine = vehicle?.locationId === machine.locationId;
  const stopContracts = activeContractsAtLocation(state, machine.locationId);
  const activeAlarm = isPlayerMachine ? activeAlarmForMachine(state, machine.id) : undefined;
  const alarmIntruder = activeAlarm ? state.factions[activeAlarm.intruderFactionId] : undefined;
  const alarmMinutesLeft = activeAlarm ? Math.max(1, Math.ceil((activeAlarm.expiresHour - state.worldTimeHours) * 60)) : 0;

  return (
    <section className={panelClassName}>
      <div className="panel-heading">
        <div>
          <h2>{machine.name}</h2>
          <p>{owner.name} · {model.name}</p>
        </div>
        <span className={isPlayerMachine ? "owner-chip player" : "owner-chip rival"}>{isPlayerMachine ? "Owned" : "Rival"}</span>
      </div>

      {primaryInteraction && <PrimaryHint interaction={primaryInteraction} />}
      {detailsToggle}
      {conflictAtTarget && <ConflictActions conflict={conflictAtTarget} onCommand={onCommand} state={state} />}

      <div className="machine-readout">
        <span>${Math.round(machine.revenueStored)}</span>
        <span>{Math.round(machine.damage)}% damage</span>
        <span>{stock} stock</span>
        <span>{formatPercent(security)} security</span>
        <span>{formatPercent(visibility)} visibility</span>
        <span className={`route-tone ${pressure.tone}`}>{pressure.reasons[0] ?? "stable"}</span>
        <span>{installedUpgrades.length}/{machineUpgradeList.length} upgrades</span>
      </div>

      {isPlayerMachine ? (
        <>
          {activeAlarm && (
            <div className="machine-section machine-alarm">
              <div className="section-title">
                <ShieldAlert size={16} aria-hidden="true" />
                <span>Machine alarm</span>
                <em>{alarmMinutesLeft}m</em>
              </div>
              <p>{alarmIntruder?.name ?? "An intruder"} is at this machine.</p>
              <div className="action-grid">
                <ActionButton icon={<Zap size={17} aria-hidden="true" />} onClick={() => onCommand({ type: "confront_alarm", actorId: state.playerFactionId, alarmId: activeAlarm.id })}>
                  Fight Intruder
                </ActionButton>
              </div>
            </div>
          )}

          {stopContracts.length > 0 && (
            <div className="machine-section">
              <div className="section-title">
                <PackagePlus size={16} aria-hidden="true" />
                <span>Contracts at this stop</span>
                <em>{stopContracts.length}</em>
              </div>
              <div className="contract-mini-list">
                {stopContracts.map((contract) => {
                  const product = state.products[contract.productId];
                  const tone = contractTone(state, contract);
                  return (
                    <article className={`contract-mini-card ${tone}`} key={contract.id}>
                      <div>
                        <h3>{product.name}</h3>
                        <p>
                          {contractRemainingQuantity(contract)} due · {contract.deliveredQuantity}/{contract.requiredQuantity} delivered
                        </p>
                      </div>
                      <div className="contract-meter" aria-hidden="true">
                        <span style={{ width: `${contractProgressRatio(contract) * 100}%` }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <div className="action-grid">
            <ActionButton
              disabled={machine.revenueStored <= 0}
              icon={<HandCoins size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "collect_revenue", actorId: state.playerFactionId, machineId: machine.id })}
            >
              Collect
            </ActionButton>
            <ActionButton
              disabled={machine.damage <= 0}
              icon={<Wrench size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "repair_machine", actorId: state.playerFactionId, machineId: machine.id })}
            >
              Repair
            </ActionButton>
            {carriedCrate && carriedProduct ? (
              <ActionButton
                icon={<PackagePlus size={17} aria-hidden="true" />}
                onClick={() =>
                  onCommand({
                    type: "stock_machine",
                    actorId: state.playerFactionId,
                    machineId: machine.id,
                    productId: carriedProduct.id,
                    quantity: Math.min(6, carriedCrate.quantity)
                  })
                }
              >
                {carriedProduct.name} x{Math.min(6, carriedCrate.quantity)}
              </ActionButton>
            ) : (
              <span className="action-note">No crate carried</span>
            )}
          </div>

          {!carriedCrate && vehicle && (
            <div className="machine-section">
              <div className="section-title">
                <Truck size={16} aria-hidden="true" />
                <span>{vehicle.name}</span>
                <em>{vehicleAtMachine ? "At stop" : "Away"}</em>
              </div>
              {vehicleAtMachine ? (
                <div className="action-grid">
                  {Object.values(state.products).map((product) => {
                    const available = vehicle.inventory[product.id] ?? 0;
                    const quantity = Math.min(available, Math.floor(state.player.cargoCapacity / product.size));
                    return (
                      <ActionButton
                        disabled={quantity <= 0}
                        icon={<PackagePlus size={17} aria-hidden="true" />}
                        key={product.id}
                        onClick={() =>
                          onCommand({
                            type: "take_vehicle_crate",
                            actorId: state.playerFactionId,
                            vehicleId: vehicle.id,
                            productId: product.id,
                            quantity
                          })
                        }
                      >
                        Carry {product.name} {quantity || 0}
                      </ActionButton>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-note">Van parked at {state.locations[vehicle.locationId]?.name ?? "another stop"}.</p>
              )}
            </div>
          )}

          {pressure.reasons.length > 0 && (
            <div className={`route-pressure ${pressure.tone}`}>
              <strong>Route pressure</strong>
              <span>{pressure.reasons.join(" · ")}</span>
            </div>
          )}

          <div className="machine-section">
            <div className="section-title">
              <Sparkles size={16} aria-hidden="true" />
              <span>Product slots</span>
            </div>
            {machine.slots.length === 0 ? (
              <p className="empty-note">No product slots loaded.</p>
            ) : (
              <div className="slot-list">
                {machine.slots.map((slot) => {
                  const product = state.products[slot.productId];
                  const rate = slotRates.find((candidate) => candidate.productId === slot.productId)?.unitsPerHour ?? 0;
                  const demand = priceDemandMultiplier(slot.price, product.basePrice);
                  return (
                    <article className="slot-row" key={slot.productId}>
                      <div>
                        <h3>{product.name}</h3>
                        <p>
                          {slot.quantity}/{slot.capacity} stocked · {rate.toFixed(1)}/hr · {formatPercent(demand)} price demand
                        </p>
                      </div>
                      <div className="price-stepper" aria-label={`${product.name} price`}>
                        <button
                          aria-label={`Lower ${product.name} price`}
                          disabled={slot.price <= 1}
                          onClick={() =>
                            onCommand({
                              type: "set_slot_price",
                              actorId: state.playerFactionId,
                              machineId: machine.id,
                              productId: slot.productId,
                              price: slot.price - 1
                            })
                          }
                          type="button"
                        >
                          <Minus size={14} aria-hidden="true" />
                        </button>
                        <strong>${slot.price}</strong>
                        <button
                          aria-label={`Raise ${product.name} price`}
                          disabled={slot.price >= 99}
                          onClick={() =>
                            onCommand({
                              type: "set_slot_price",
                              actorId: state.playerFactionId,
                              machineId: machine.id,
                              productId: slot.productId,
                              price: slot.price + 1
                            })
                          }
                          type="button"
                        >
                          <Plus size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="machine-section">
            <div className="section-title">
              <Shield size={16} aria-hidden="true" />
              <span>Upgrades</span>
              {effects.remoteMonitoring && <em>Remote live</em>}
            </div>
            <div className="upgrade-list">
              {machineUpgradeList.map((upgrade) => {
                const installed = machineHasUpgrade(machine, upgrade.id);
                const disabled = installed || player.money < upgrade.cost;
                return (
                  <button
                    className={installed ? "upgrade-row installed" : "upgrade-row"}
                    disabled={disabled}
                    key={upgrade.id}
                    onClick={() =>
                      onCommand({
                        type: "install_upgrade",
                        actorId: state.playerFactionId,
                        machineId: machine.id,
                        upgradeId: upgrade.id
                      })
                    }
                    type="button"
                  >
                    <span className="upgrade-icon">{upgradeIcons[upgrade.id]}</span>
                    <span>
                      <strong>{upgrade.name}</strong>
                      <small>{formatUpgradeEffect(upgrade.id)}</small>
                    </span>
                    <em>{installed ? "Installed" : `$${upgrade.cost}`}</em>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          {installedUpgrades.length > 0 && (
            <div className="machine-section">
              <div className="section-title">
                <Shield size={16} aria-hidden="true" />
                <span>Visible protection</span>
              </div>
              <div className="installed-upgrades">
                {installedUpgrades.map((upgradeId) => (
                  <span key={upgradeId}>{machineUpgradeList.find((upgrade) => upgrade.id === upgradeId)?.name ?? upgradeId}</span>
                ))}
              </div>
            </div>
          )}
          <div className="action-grid">
            <ActionButton
              icon={<Zap size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "sabotage_machine", actorId: state.playerFactionId, machineId: machine.id })}
            >
              Jam Display
            </ActionButton>
          </div>
        </>
      )}
    </section>
  );
}
