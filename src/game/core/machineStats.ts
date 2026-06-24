import { machineUpgrades } from "../content/machineUpgrades";
import type { MachineUpgradeEffects, MachineUpgradeId, VendingMachine } from "./types";

const baseEffects: MachineUpgradeEffects = {
  damageResistance: 0,
  sabotageResistance: 0,
  securityBonus: 0,
  visibilityBonus: 0,
  salesMultiplier: 0,
  heatMultiplier: 1,
  remoteMonitoring: false
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function machineHasUpgrade(machine: VendingMachine, upgradeId: MachineUpgradeId): boolean {
  return (machine.upgrades ?? []).includes(upgradeId);
}

export function getMachineUpgradeEffects(machine: VendingMachine): MachineUpgradeEffects {
  return (machine.upgrades ?? []).reduce<MachineUpgradeEffects>(
    (effects, upgradeId) => {
      const upgrade = machineUpgrades[upgradeId];
      if (!upgrade) {
        return effects;
      }

      return {
        damageResistance: effects.damageResistance + (upgrade.effects.damageResistance ?? 0),
        sabotageResistance: effects.sabotageResistance + (upgrade.effects.sabotageResistance ?? 0),
        securityBonus: effects.securityBonus + (upgrade.effects.securityBonus ?? 0),
        visibilityBonus: effects.visibilityBonus + (upgrade.effects.visibilityBonus ?? 0),
        salesMultiplier: effects.salesMultiplier + (upgrade.effects.salesMultiplier ?? 0),
        heatMultiplier: effects.heatMultiplier * (upgrade.effects.heatMultiplier ?? 1),
        remoteMonitoring: effects.remoteMonitoring || Boolean(upgrade.effects.remoteMonitoring)
      };
    },
    { ...baseEffects }
  );
}

export function effectiveMachineSecurity(machine: VendingMachine): number {
  return clamp01(machine.security + getMachineUpgradeEffects(machine).securityBonus);
}

export function effectiveMachineVisibility(machine: VendingMachine): number {
  return Math.max(0.25, Math.min(1.35, machine.visibility + getMachineUpgradeEffects(machine).visibilityBonus));
}

export function effectiveMachineDamage(machine: VendingMachine): number {
  const effects = getMachineUpgradeEffects(machine);
  return Math.max(0, machine.damage * (1 - Math.min(0.65, effects.damageResistance)));
}

export function sabotageDamage(baseDamage: number, machine: VendingMachine): number {
  const effects = getMachineUpgradeEffects(machine);
  const resistance = Math.min(0.72, effects.damageResistance + effects.sabotageResistance + effectiveMachineSecurity(machine) * 0.18);
  return Math.max(3, Math.round(baseDamage * (1 - resistance)));
}

export function priceDemandMultiplier(price: number, basePrice: number): number {
  const ratio = price / Math.max(1, basePrice);

  if (ratio <= 1) {
    return Math.min(1.16, 1 + (1 - ratio) * 0.22);
  }

  return Math.max(0.35, 1 - (ratio - 1) * 0.48);
}
