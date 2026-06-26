import { Flame, HandCoins, Package, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { GameState } from "../game/core/types";
import { activeLawInspections, carriedCrateUnits, formatClock, missionProgress, playerHeatTier } from "../game/core/selectors";
import type { SceneFeedbackEvent } from "../render/three/SceneTargets";

interface HudProps {
  feedbackEvent?: SceneFeedbackEvent | null;
  nextActionLabel?: string;
  state: GameState;
}

export function Hud({ feedbackEvent, nextActionLabel, state }: HudProps) {
  const player = state.factions[state.playerFactionId];
  const cargoUnits = carriedCrateUnits(state);
  const crate = state.player.carriedCrate;
  const loadRatio = crate ? cargoUnits / Math.max(1, state.player.cargoCapacity) : 0;
  const loadLabel = loadRatio >= 0.75 ? "heavy" : loadRatio >= 0.45 ? "loaded" : "";
  const progress = missionProgress(state);
  const inspections = activeLawInspections(state);
  const heatTier = playerHeatTier(state);
  const [pulse, setPulse] = useState<SceneFeedbackEvent["kind"] | null>(null);

  useEffect(() => {
    if (!feedbackEvent) {
      return;
    }

    setPulse(feedbackEvent.kind);
    const timeout = window.setTimeout(() => setPulse(null), 620);
    return () => window.clearTimeout(timeout);
  }, [feedbackEvent]);

  return (
    <header className="hud">
      <div className="brand-block">
        <span className="brand-title">Vendetta Vending</span>
        <span className="brand-subtitle">{formatClock(state.worldTimeHours)}</span>
        {nextActionLabel && <span className="next-action">Next: {nextActionLabel}</span>}
      </div>
      <div className="stat-strip">
        <div className={`stat-pill ${pulse === "cash" ? "pulse-cash" : ""}`}>
          <HandCoins size={17} aria-hidden="true" />
          <span>${Math.round(player.money)}</span>
          {pulse === "cash" && feedbackEvent?.amount ? <small>+${Math.round(feedbackEvent.amount)}</small> : null}
        </div>
        <div className={`stat-pill ${pulse === "sabotage" || pulse === "fight" || pulse === "melee" ? "pulse-danger" : ""}`}>
          <Flame size={17} aria-hidden="true" />
          <span>{inspections.length > 0 ? `${inspections.length} inspection` : `${heatTier.label} · ${Math.round(player.heat)}`}</span>
        </div>
        <div className={`stat-pill ${pulse === "stock" || pulse === "pickup" || pulse === "store" ? "pulse-stock" : ""}`}>
          <Package size={17} aria-hidden="true" />
          <span>
            {crate ? `${state.products[crate.productId].name} ${crate.quantity}` : `${cargoUnits}/${state.player.cargoCapacity}`}
          </span>
          {loadLabel ? <small>{loadLabel}</small> : null}
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
