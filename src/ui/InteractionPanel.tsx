import { Camera, CreditCard, HandCoins, Lightbulb, Lock, Minus, PackagePlus, Plus, RadioTower, RotateCcw, Save, Shield, ShoppingCart, Sparkles, Wrench, Zap } from "lucide-react";
import type { GameCommand, GameState, MachineUpgradeId, ProductId } from "../game/core/types";
import { machineUpgradeList } from "../game/content/machineUpgrades";
import { effectiveMachineSecurity, effectiveMachineVisibility, getMachineUpgradeEffects, machineHasUpgrade, priceDemandMultiplier } from "../game/core/machineStats";
import { cargoSpaceRemaining, machineAtLocation } from "../game/core/selectors";
import { estimateMachineSalesPerHour } from "../game/systems/economy";
import type { SceneTarget } from "../render/three/SceneTargets";
import { getPrimaryInteraction } from "./interactionActions";

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

export function InteractionPanel({ state, target, onCommand, onSave, onReload, onRestart }: InteractionPanelProps) {
  const player = state.factions[state.playerFactionId];
  const primaryInteraction = getPrimaryInteraction(state, target);

  if (!target) {
    return (
      <section className="interaction-panel muted">
        <h2>Street View</h2>
        <p>Nearby machines, suppliers, and placement pads will surface here.</p>
      </section>
    );
  }

  if (target.type === "base") {
    return (
      <section className="interaction-panel">
        <h2>{target.label}</h2>
        {primaryInteraction && (
          <div className="primary-hint">
            <kbd>E</kbd>
            <span>{primaryInteraction.label}</span>
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
    return (
      <section className="interaction-panel">
        <h2>{target.label}</h2>
        {primaryInteraction && (
          <div className="primary-hint">
            <kbd>E</kbd>
            <span>{primaryInteraction.label}</span>
          </div>
        )}
        <div className="action-grid">
          {Object.values(state.products).map((product) => {
            const quantity = product.id === "mystery_capsules" ? 3 : 5;
            const cost = product.cost * quantity;
            const disabled = player.money < cost || cargoSpaceRemaining(state) < product.size * quantity;
            return (
              <ActionButton
                disabled={disabled}
                icon={<ShoppingCart size={17} aria-hidden="true" />}
                key={product.id}
                onClick={() => onCommand({ type: "buy_product", actorId: state.playerFactionId, productId: product.id, quantity })}
              >
                {product.name} ${cost}
              </ActionButton>
            );
          })}
        </div>
      </section>
    );
  }

  if (target.type === "placement") {
    const location = state.locations[target.id];
    const occupied = Boolean(machineAtLocation(state, target.id));
    return (
      <section className="interaction-panel">
        <h2>{location.name}</h2>
        {primaryInteraction && (
          <div className="primary-hint">
            <kbd>E</kbd>
            <span>{primaryInteraction.label}</span>
          </div>
        )}
        <p>
          Traffic {location.footTraffic.toFixed(1)} · Risk {Math.round((1 - location.safety + location.policePresence) * 50)}
        </p>
        <div className="action-grid">
          <ActionButton
            disabled={occupied || player.money < location.placementCost}
            icon={<PackagePlus size={17} aria-hidden="true" />}
            onClick={() => onCommand({ type: "place_machine", actorId: state.playerFactionId, locationId: location.id })}
          >
            Install ${location.placementCost}
          </ActionButton>
        </div>
      </section>
    );
  }

  const machine = state.machines[target.id];
  if (!machine) {
    return null;
  }

  const owner = state.factions[machine.ownerFactionId];
  const isPlayerMachine = machine.ownerFactionId === state.playerFactionId;
  const effects = getMachineUpgradeEffects(machine);
  const security = effectiveMachineSecurity(machine);
  const visibility = effectiveMachineVisibility(machine);
  const slotRates = estimateMachineSalesPerHour(state, machine);
  const installedUpgrades = machine.upgrades ?? [];

  return (
    <section className="interaction-panel">
      <div className="panel-heading">
        <div>
          <h2>{machine.name}</h2>
          <p>{owner.name}</p>
        </div>
        <span className={isPlayerMachine ? "owner-chip player" : "owner-chip rival"}>{isPlayerMachine ? "Owned" : "Rival"}</span>
      </div>

      {primaryInteraction && (
        <div className="primary-hint">
          <kbd>E</kbd>
          <span>{primaryInteraction.label}</span>
        </div>
      )}

      <div className="machine-readout">
        <span>${Math.round(machine.revenueStored)}</span>
        <span>{Math.round(machine.damage)}% damage</span>
        <span>{machine.slots.reduce((sum, slot) => sum + slot.quantity, 0)} stock</span>
        <span>{formatPercent(security)} security</span>
        <span>{formatPercent(visibility)} visibility</span>
        <span>{installedUpgrades.length}/{machineUpgradeList.length} upgrades</span>
      </div>

      {isPlayerMachine ? (
        <>
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
            {Object.entries(state.player.cargo).map(([productId, quantity]) => {
              const product = state.products[productId as ProductId];
              if (!product || quantity <= 0) {
                return null;
              }
              return (
                <ActionButton
                  icon={<PackagePlus size={17} aria-hidden="true" />}
                  key={product.id}
                  onClick={() =>
                    onCommand({
                      type: "stock_machine",
                      actorId: state.playerFactionId,
                      machineId: machine.id,
                      productId: product.id,
                      quantity: Math.min(6, quantity)
                    })
                  }
                >
                  {product.name} x{Math.min(6, quantity)}
                </ActionButton>
              );
            })}
          </div>

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
