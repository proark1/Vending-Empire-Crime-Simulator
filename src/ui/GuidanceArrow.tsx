import { Navigation } from "lucide-react";
import type { GameState, LocationId, Vec2 } from "../game/core/types";

interface GuidanceArrowProps {
  label?: string;
  state: GameState;
  targetLocationId?: LocationId;
  playerHeadingDegrees: number;
  playerPosition: Vec2;
}

function bearingDegrees(from: Vec2, to: Vec2): number {
  return (Math.atan2(to.x - from.x, from.z - to.z) * 180) / Math.PI;
}

function normalizeDegrees(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

export function guidanceRotationDegrees(from: Vec2, to: Vec2, playerHeadingDegrees: number): number {
  return normalizeDegrees(bearingDegrees(from, to) - playerHeadingDegrees);
}

function distance(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

// Once the player is essentially on top of the target, the interaction panel and
// crosshair prompt already name it — so the arrow would only echo them. Hide it.
const ARRIVED_METERS = 8;

export function GuidanceArrow({ label, state, targetLocationId, playerHeadingDegrees, playerPosition }: GuidanceArrowProps) {
  if (!targetLocationId) {
    return null;
  }

  const location = state.locations[targetLocationId];
  if (!location) {
    return null;
  }

  const meters = Math.max(0, Math.round(distance(playerPosition, location.position) * 6));
  if (meters <= ARRIVED_METERS) {
    return null;
  }

  const rotation = guidanceRotationDegrees(playerPosition, location.position, playerHeadingDegrees);

  return (
    <aside className="guidance-arrow" aria-label="Mission guidance">
      <div className="guidance-icon" style={{ transform: `rotate(${rotation}deg)` }}>
        <Navigation size={24} aria-hidden="true" />
      </div>
      <div>
        <strong>{label ?? location.name}</strong>
        <span>{meters}m</span>
      </div>
    </aside>
  );
}
