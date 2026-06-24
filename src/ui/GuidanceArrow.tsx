import { Navigation } from "lucide-react";
import type { GameState, Vec2 } from "../game/core/types";
import type { MissionStep } from "../game/core/mission";

interface GuidanceArrowProps {
  state: GameState;
  playerPosition: Vec2;
  step: MissionStep;
}

function bearingDegrees(from: Vec2, to: Vec2): number {
  return (Math.atan2(to.x - from.x, from.z - to.z) * 180) / Math.PI;
}

function distance(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function GuidanceArrow({ state, playerPosition, step }: GuidanceArrowProps) {
  if (!step.targetLocationId) {
    return null;
  }

  const location = state.locations[step.targetLocationId];
  if (!location) {
    return null;
  }

  const meters = Math.max(0, Math.round(distance(playerPosition, location.position) * 6));
  const rotation = bearingDegrees(playerPosition, location.position);

  return (
    <aside className="guidance-arrow" aria-label="Mission guidance">
      <div className="guidance-icon" style={{ transform: `rotate(${rotation}deg)` }}>
        <Navigation size={24} aria-hidden="true" />
      </div>
      <div>
        <strong>{location.name}</strong>
        <span>{meters}m</span>
      </div>
    </aside>
  );
}
