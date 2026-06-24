import type { MachineUpgradeDefinition, MachineUpgradeId } from "../core/types";

export const machineUpgrades: Record<MachineUpgradeId, MachineUpgradeDefinition> = {
  reinforced_glass: {
    id: "reinforced_glass",
    name: "Reinforced Glass",
    description: "Tougher display panel that reduces damage from hits and vandalism.",
    cost: 55,
    effects: {
      damageResistance: 0.22,
      securityBonus: 0.08
    }
  },
  smart_lock: {
    id: "smart_lock",
    name: "Smart Lock",
    description: "Harder cash box access and a cleaner restock workflow.",
    cost: 70,
    effects: {
      sabotageResistance: 0.16,
      securityBonus: 0.18
    }
  },
  security_camera: {
    id: "security_camera",
    name: "Security Camera",
    description: "Visible deterrent that makes rivals less eager to hit the machine.",
    cost: 95,
    effects: {
      sabotageResistance: 0.22,
      securityBonus: 0.2,
      heatMultiplier: 0.9
    }
  },
  cashless_terminal: {
    id: "cashless_terminal",
    name: "Cashless Terminal",
    description: "Faster customer flow and better conversion during busy hours.",
    cost: 110,
    effects: {
      salesMultiplier: 0.12,
      securityBonus: 0.05
    }
  },
  neon_sign: {
    id: "neon_sign",
    name: "Neon Sign",
    description: "More visibility, more impulse buys, and slightly more attention.",
    cost: 80,
    effects: {
      visibilityBonus: 0.12,
      salesMultiplier: 0.08,
      heatMultiplier: 1.05
    }
  },
  remote_monitor: {
    id: "remote_monitor",
    name: "Remote Monitor",
    description: "Live stock and cash awareness from the operations dashboard.",
    cost: 130,
    effects: {
      salesMultiplier: 0.04,
      remoteMonitoring: true
    }
  }
};

export const machineUpgradeList = Object.values(machineUpgrades);
