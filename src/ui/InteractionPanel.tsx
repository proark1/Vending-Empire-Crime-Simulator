import { useEffect, useState } from "react";
import { Camera, ChevronDown, ChevronUp, CreditCard, HandCoins, Lightbulb, Lock, Minus, PackagePlus, Plus, RadioTower, RotateCcw, Save, Shield, ShieldAlert, ShoppingCart, Sparkles, Truck, Wrench, Zap } from "lucide-react";
import type { ConflictEvent, GameCommand, GameState, MachineUpgradeId } from "../game/core/types";
import { machineUpgradeList } from "../game/content/machineUpgrades";
import { machineModels } from "../game/content/machineModels";
import { crimeContacts, neighborhoodHotspots } from "../game/content/world";
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
  locationRightsFor,
  locationRightsQuotesForLocation,
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
      <div className="primary-hint-copy">
        <strong>{interaction.label}</strong>
        {interaction.holdVerb && !interaction.disabled && <span>{interaction.holdVerb}</span>}
        {interaction.disabled && interaction.disabledReason && <em>{interaction.disabledReason}</em>}
        {(interaction.payoff || interaction.risk) && (
          <small>
            {interaction.payoff}
            {interaction.payoff && interaction.risk ? " / " : ""}
            {interaction.risk}
          </small>
        )}
      </div>
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

function MeterRow({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "danger" | "good" | "neutral" | "warning" }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`encounter-meter ${tone}`}>
      <span>{label}</span>
      <strong>{Math.round(clamped)}</strong>
      <i aria-hidden="true">
        <b style={{ width: `${clamped}%` }} />
      </i>
    </div>
  );
}

function findRivalOperation(state: GameState, operationId: string) {
  for (const organization of Object.values(state.rivalOrganizations ?? {})) {
    const operation = organization.operations.find((candidate) => candidate.id === operationId);
    if (operation) {
      return { operation, organization };
    }
  }
  return null;
}

function rivalOperationCost(approach: "disrupt" | "expose" | "negotiate"): number {
  return approach === "negotiate" ? 24 : approach === "expose" ? 12 : 8;
}

function ConflictActions({ conflict, onCommand, state }: { conflict: ConflictEvent; onCommand: (command: GameCommand) => void; state: GameState }) {
  const vehicle = activeVehicle(state);
  const vehicleAtStop = vehicle?.locationId === conflict.locationId;
  const encounter = encounterFallback(conflict);
  return (
    <div className="machine-section machine-alarm">
      <div className="section-title">
        <ShieldAlert size={16} aria-hidden="true" />
        <span>{conflict.kind === "base_raid" ? "Base defense" : conflict.kind === "route_ambush" ? "Route ambush" : "Street chase"}</span>
        <em>{Math.max(1, Math.ceil((conflict.expiresHour - state.worldTimeHours) * 60))}m</em>
      </div>
      <p>{conflict.message}</p>
      <div className="encounter-grid">
        <MeterRow label="Health" value={encounter.playerHealth} tone={encounter.playerHealth <= 30 ? "danger" : "good"} />
        <MeterRow label="Stamina" value={encounter.playerStamina} tone={encounter.playerStamina <= 25 ? "warning" : "neutral"} />
        <MeterRow label="Enemy" value={encounter.enemyHealth} tone="danger" />
        <MeterRow label="Escape" value={encounter.chaseProgress} tone={encounter.chaseProgress >= 70 ? "good" : "neutral"} />
      </div>
      <div className="action-grid">
        <ActionButton icon={<Zap size={17} aria-hidden="true" />} onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "strike" })}>
          Strike
        </ActionButton>
        <ActionButton icon={<Sparkles size={17} aria-hidden="true" />} onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "dodge" })}>
          Dodge
        </ActionButton>
        <ActionButton icon={<Wrench size={17} aria-hidden="true" />} onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "tool" })}>
          Tool
        </ActionButton>
        <ActionButton icon={<Truck size={17} aria-hidden="true" />} onClick={() => onCommand({ type: "player_conflict_action", actorId: state.playerFactionId, eventId: conflict.id, action: "push_escape" })}>
          Push
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
      <section className="interaction-panel muted idle">
        <h2>Street View</h2>
        <p>Aim at a machine, garage, supplier, vehicle, or placement pad.</p>
      </section>
    );
  }

  const targetLocationId =
    target.type === "base" || target.type === "supplier" || target.type === "placement"
      ? target.id
      : target.type === "rival_operation"
        ? findRivalOperation(state, target.id)?.operation.locationId ?? null
      : target.type === "vehicle" || target.type === "neighborhood" || target.type === "crime_contact"
        ? null
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
    const storedMachines = storedPlayerMachines(state);
    const readyStoredMachines = storedMachines.filter((machine) => machine.damage <= 0);
    const rights = locationRightsFor(state, location.id);
    const rightsQuotes = locationRightsQuotesForLocation(state, location);
    const storedBlocked = storedMachines.length > 0 && readyStoredMachines.length === 0;
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
        <div className="machine-readout">
          <span>{rights.rightsTier.replace("_", " ")}</span>
          <span>permit {rights.permitStatus}</span>
          <span>landlord {Math.round(rights.landlordDisposition)}</span>
          <span>legal {Math.round(rights.legalPressure)}</span>
        </div>
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
          {unlocked && rightsQuotes.map((quote) => (
            <ActionButton
              disabled={!quote.canNegotiate}
              icon={<HandCoins size={17} aria-hidden="true" />}
              key={quote.approach}
              onClick={() => onCommand({ type: "negotiate_location_rights", actorId: state.playerFactionId, locationId: location.id, approach: quote.approach })}
            >
              {quote.label} ${quote.cost}
            </ActionButton>
          ))}
          {unlocked && readyStoredMachines.length === 0 && (
            <ActionButton disabled icon={<PackagePlus size={17} aria-hidden="true" />} onClick={() => undefined}>
              Buy a machine in Fleet
            </ActionButton>
          )}
          {unlocked && readyStoredMachines.slice(0, 3).flatMap((machine) =>
            placementQuotes.map((quote) => (
              <ActionButton
                disabled={occupied || player.money < quote.cost}
                icon={<PackagePlus size={17} aria-hidden="true" />}
                key={`${machine.id}_${quote.method}`}
                onClick={() =>
                  onCommand({
                    type: "place_machine",
                    actorId: state.playerFactionId,
                    locationId: location.id,
                    method: quote.method,
                    machineId: machine.id
                  })
                }
              >
                {machine.name}: {quote.label} ${quote.cost}
              </ActionButton>
            ))
          )}
        </div>
        {unlocked && (
          <div className="placement-method-list">
            <article className={`placement-method ${rights.legalPressure >= 55 ? "high" : rights.permitStatus === "active" ? "low" : "medium"}`}>
              <div>
                <h3>Location rights</h3>
                <p>
                  Landlord disposition, permits, exclusivity, and corporate pressure change placement costs, inspections, and rival expansion.
                </p>
              </div>
              <strong>
                {rights.permitStatus} · {Math.round(rights.corporatePressure)} corporate
              </strong>
            </article>
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
        {storedBlocked && <p className="empty-note">Repair stored machines at the garage before placing them.</p>}
        {unlocked && storedMachines.length === 0 && <p className="empty-note">Buy machine inventory from the Fleet tab before claiming this stop.</p>}
        {!unlocked && <p className="empty-note">{unmetRequirements ? `Needs ${unmetRequirements}.` : "Scout and open this area before installing machines."}</p>}
      </section>
    );
  }

  if (target.type === "neighborhood") {
    const hotspot = neighborhoodHotspots.find((candidate) => candidate.id === target.id);
    const district = hotspot ? state.districts[hotspot.districtId] : undefined;
    const unlockInfo = district ? districtUnlockInfo(state, district.id) : undefined;

    if (!hotspot || !district || !unlockInfo) {
      return null;
    }

    return (
      <section className={panelClassName}>
        <h2>{hotspot.label}</h2>
        {primaryInteraction && <PrimaryHint interaction={primaryInteraction} />}
        {detailsToggle}
        <div className="machine-readout">
          <span>{district.name}</span>
          <span>{unlockInfo.progress.access}</span>
          <span>{hotspot.kind.replace("_", " ")}</span>
          <span>{hotspot.demandTags.join(" / ")}</span>
        </div>
        <div className="machine-section neighborhood-dossier">
          <p>{hotspot.description}</p>
          <strong>{hotspot.riskNote}</strong>
        </div>
        {unlockInfo.progress.access === "locked" && (
          <div className="action-grid">
            <ActionButton
              disabled={!unlockInfo.canScout}
              icon={<Lightbulb size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "scout_district", actorId: state.playerFactionId, districtId: district.id })}
            >
              Scout ${district.scoutCost}
            </ActionButton>
          </div>
        )}
        {unlockInfo.progress.access === "scouted" && (
          <div className="action-grid">
            <ActionButton
              disabled={!unlockInfo.canUnlock}
              icon={<PackagePlus size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "unlock_district", actorId: state.playerFactionId, districtId: district.id })}
            >
              Open ${district.unlockCost}
            </ActionButton>
          </div>
        )}
        {unlockInfo.unmetRequirements.length > 0 && <p className="empty-note">Needs {unlockInfo.unmetRequirements.join(" · ")}.</p>}
      </section>
    );
  }

  if (target.type === "crime_contact") {
    const contact = crimeContacts.find((candidate) => candidate.id === target.id);
    const district = contact ? state.districts[contact.districtId] : undefined;
    const unlockInfo = district ? districtUnlockInfo(state, district.id) : undefined;
    if (!contact || !district || !unlockInfo) {
      return null;
    }

    const product = contact.productId ? state.products[contact.productId] : undefined;
    const handsFull = Boolean(state.player.carriedCrate) || carriedCrateUnits(state) > 0;
    const sourceBlocked = contact.action === "source_contraband" && handsFull;
    const costBlocked = player.money < contact.cost;
    const accessBlocked = unlockInfo.progress.access === "locked";
    const label = contact.action === "buy_tip" ? "Buy tip" : contact.action === "arrange_bribe" ? "Arrange bribe" : `Take ${product?.name ?? "grey stock"}`;

    return (
      <section className={panelClassName}>
        <h2>{contact.label}</h2>
        {primaryInteraction && <PrimaryHint interaction={primaryInteraction} />}
        {detailsToggle}
        <div className="machine-readout">
          <span>{district.name}</span>
          <span>{contact.kind.replace("_", " ")}</span>
          <span>${contact.cost}</span>
          <span>+{contact.heatRisk.toFixed(1)} heat risk</span>
        </div>
        <div className="machine-section crime-dossier">
          <p>{contact.description}</p>
        </div>
        <div className="action-grid">
          <ActionButton
            disabled={accessBlocked || sourceBlocked || costBlocked}
            icon={contact.action === "source_contraband" ? <PackagePlus size={17} aria-hidden="true" /> : <HandCoins size={17} aria-hidden="true" />}
            onClick={() => onCommand({ type: "work_crime_contact", actorId: state.playerFactionId, contactId: contact.id, action: contact.action })}
          >
            {label} ${contact.cost}
          </ActionButton>
        </div>
        {accessBlocked && <p className="empty-note">Scout {district.name} before working this contact.</p>}
        {sourceBlocked && <p className="empty-note">Hands full. Store or load the current crate first.</p>}
      </section>
    );
  }

  if (target.type === "rival_operation") {
    const found = findRivalOperation(state, target.id);
    if (!found) {
      return null;
    }

    const { operation, organization } = found;
    const rival = state.factions[operation.factionId];
    const location = state.locations[operation.locationId];
    const approaches = [
      { id: "negotiate" as const, label: "Negotiate", icon: <Shield size={17} aria-hidden="true" /> },
      { id: "expose" as const, label: "Expose", icon: <Lightbulb size={17} aria-hidden="true" /> },
      { id: "disrupt" as const, label: "Disrupt", icon: <Zap size={17} aria-hidden="true" /> }
    ];

    return (
      <section className={panelClassName}>
        <h2>{rival?.name ?? "Rival"} operation</h2>
        {primaryInteraction && <PrimaryHint interaction={primaryInteraction} />}
        {detailsToggle}
        <div className="machine-readout">
          <span>{location?.name ?? "Unknown stop"}</span>
          <span>{operation.kind.replace("_", " ")}</span>
          <span>{Math.round(operation.progress)}% progress</span>
          <span>{operation.exposed ? "exposed" : "hidden"}</span>
        </div>
        <div className="machine-section operation-dossier">
          <p>
            {organization.bossName} · {organization.relationship} · leverage {Math.round(organization.leverage)}
          </p>
          <div className="operation-meter" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, operation.progress))}%` }} />
          </div>
          <strong>{organization.agenda}</strong>
        </div>
        <div className="action-grid">
          {approaches.map((approach) => {
            const cost = rivalOperationCost(approach.id);
            return (
              <ActionButton
                disabled={player.money < cost || Boolean(operation.resolvedHour)}
                icon={approach.icon}
                key={approach.id}
                onClick={() => onCommand({ type: "pressure_rival_operation", actorId: state.playerFactionId, operationId: operation.id, approach: approach.id })}
              >
                {approach.label} ${cost}
              </ActionButton>
            );
          })}
        </div>
      </section>
    );
  }

  if (target.type === "vehicle") {
    const vehicle = state.vehicles[target.id];
    const location = vehicle ? state.locations[vehicle.locationId] : undefined;
    if (!vehicle) {
      return null;
    }

    return (
      <section className={panelClassName}>
        <h2>{vehicle.name}</h2>
        {detailsToggle}
        <div className="machine-readout">
          <span>{location?.name ?? "Street parked"}</span>
          <span>{vehicleInventoryUnits(state, vehicle)}/{vehicle.capacity} cargo</span>
          <span>{vehicleSpaceRemaining(state, vehicle)} open</span>
          <span>{Math.round((vehicle.condition ?? 1) * 100)}% condition</span>
          <span>{Math.round(vehicle.odometer ?? 0)}m driven</span>
        </div>
        <div className="machine-section vehicle-dossier">
          <p>Manual driving is active from the street view when you are beside the van. Park near a stop to use its cargo on that machine route.</p>
        </div>
        {location?.id === "garage" && (
          <div className="action-grid">
            <ActionButton
              icon={<Wrench size={17} aria-hidden="true" />}
              onClick={() => onCommand({ type: "service_vehicle", actorId: state.playerFactionId, vehicleId: vehicle.id })}
            >
              Service
            </ActionButton>
          </div>
        )}
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
