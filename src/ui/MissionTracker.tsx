import { CheckCircle2, ClipboardList } from "lucide-react";
import type { GameState } from "../game/core/types";
import { inventoryUnits, missionProgress, ownedMachines } from "../game/core/selectors";

function currentObjective(state: GameState): string {
  const firstMachine = state.machines.machine_player_1;
  const playerMachines = ownedMachines(state, state.playerFactionId);
  const cargoUnits = inventoryUnits(state.player.cargo, state);
  const starterStock = firstMachine.slots.reduce((sum, slot) => sum + slot.quantity, 0);

  if (state.mission.completed) {
    return "Cinderblock Row is yours. Push into riskier placements.";
  }

  if (cargoUnits === 0 && starterStock === 0) {
    return "Buy starter stock from Backdoor Supplier.";
  }

  if (cargoUnits > 0 && starterStock === 0) {
    return "Load your first machine at Foam & Fold.";
  }

  if (firstMachine.damage > 0) {
    return "Patch up Rusty Starter before rivals exploit it.";
  }

  if (firstMachine.revenueStored < 20 && playerMachines.length < 2) {
    return "Let the machine earn, then collect the cash.";
  }

  if (playerMachines.length < 2) {
    return "Install a second machine at an open placement.";
  }

  if (playerMachines.length < 3) {
    return "Claim one more location before Redline expands.";
  }

  return "Keep all three machines stocked and profitable.";
}

interface MissionTrackerProps {
  state: GameState;
}

export function MissionTracker({ state }: MissionTrackerProps) {
  const progress = missionProgress(state);
  const progressRatio = Math.min(1, progress.profitableCount / progress.target);

  return (
    <section className="mission-tracker" aria-label="Current mission">
      <div className="mission-title-row">
        {state.mission.completed ? <CheckCircle2 size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}
        <span>{state.mission.title}</span>
      </div>
      <p>{currentObjective(state)}</p>
      <div className="mission-progress" aria-hidden="true">
        <span style={{ width: `${progressRatio * 100}%` }} />
      </div>
    </section>
  );
}
