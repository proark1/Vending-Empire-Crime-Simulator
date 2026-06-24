import { Flame, HandCoins, Package, Trophy } from "lucide-react";
import type { GameState } from "../game/core/types";
import { formatClock, inventoryUnits, missionProgress } from "../game/core/selectors";

interface HudProps {
  state: GameState;
}

export function Hud({ state }: HudProps) {
  const player = state.factions[state.playerFactionId];
  const cargoUnits = inventoryUnits(state.player.cargo, state);
  const progress = missionProgress(state);

  return (
    <header className="hud">
      <div className="brand-block">
        <span className="brand-title">Vendetta Vending</span>
        <span className="brand-subtitle">{formatClock(state.worldTimeHours)}</span>
      </div>
      <div className="stat-strip">
        <div className="stat-pill">
          <HandCoins size={17} aria-hidden="true" />
          <span>${Math.round(player.money)}</span>
        </div>
        <div className="stat-pill">
          <Flame size={17} aria-hidden="true" />
          <span>{Math.round(player.heat)} heat</span>
        </div>
        <div className="stat-pill">
          <Package size={17} aria-hidden="true" />
          <span>
            {cargoUnits}/{state.player.cargoCapacity}
          </span>
        </div>
        <div className="stat-pill mission-pill">
          <Trophy size={17} aria-hidden="true" />
          <span>
            {state.mission.completed ? "District claimed" : `${progress.profitableCount}/${progress.target} machines`}
          </span>
        </div>
      </div>
    </header>
  );
}
