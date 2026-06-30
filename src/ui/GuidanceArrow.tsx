import { MapPin, Navigation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

export function distanceMeters(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 10) {
    return `${Math.max(0, meters).toFixed(1)} m`;
  }

  return `${Math.round(meters)} m`;
}

function shortestAngleDeltaDegrees(from: number, to: number): number {
  return normalizeDegrees(to - from);
}

export function smoothGuidanceRotationDegrees(current: number, target: number, factor: number): number {
  return current + shortestAngleDeltaDegrees(current, target) * Math.max(0, Math.min(1, factor));
}

const ARRIVED_METERS = 2.4;
const ROTATION_SMOOTHING = 0.22;
const DISTANCE_SMOOTHING = 0.18;

interface GuidanceArrowReadoutProps {
  label?: string;
  locationName: string;
  targetLocationId: LocationId;
  playerHeadingDegrees: number;
  playerPosition: Vec2;
  targetPosition: Vec2;
}

function GuidanceArrowReadout({ label, locationName, playerHeadingDegrees, playerPosition, targetLocationId, targetPosition }: GuidanceArrowReadoutProps) {
  const targetMeters = useMemo(() => distanceMeters(playerPosition, targetPosition), [playerPosition, targetPosition]);
  const targetRotation = useMemo(() => guidanceRotationDegrees(playerPosition, targetPosition, playerHeadingDegrees), [playerHeadingDegrees, playerPosition, targetPosition]);
  const previousTargetIdRef = useRef<LocationId | undefined>(targetLocationId);
  const [displayMeters, setDisplayMeters] = useState(targetMeters);
  const [displayRotation, setDisplayRotation] = useState(targetRotation);
  const arrived = targetMeters <= ARRIVED_METERS;

  useEffect(() => {
    const targetChanged = previousTargetIdRef.current !== targetLocationId;
    previousTargetIdRef.current = targetLocationId;

    if (targetChanged) {
      setDisplayMeters(targetMeters);
      setDisplayRotation(targetRotation);
    }

    let frame = 0;
    const tick = () => {
      setDisplayMeters((current) => current + (targetMeters - current) * DISTANCE_SMOOTHING);
      setDisplayRotation((current) => smoothGuidanceRotationDegrees(current, targetRotation, ROTATION_SMOOTHING));
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [targetLocationId, targetMeters, targetRotation]);

  return (
    <aside className={arrived ? "guidance-arrow arrived" : "guidance-arrow"} aria-label="Mission guidance">
      <div className="guidance-icon" style={{ transform: arrived ? "none" : `rotate(${displayRotation}deg)` }}>
        {arrived ? <MapPin size={23} aria-hidden="true" /> : <Navigation size={24} aria-hidden="true" />}
      </div>
      <div className="guidance-meta">
        <strong>{label ?? locationName}</strong>
        <span>{arrived ? "Arrived" : formatDistanceMeters(displayMeters)}</span>
      </div>
    </aside>
  );
}

export function GuidanceArrow({ label, state, targetLocationId, playerHeadingDegrees, playerPosition }: GuidanceArrowProps) {
  if (!targetLocationId) {
    return null;
  }

  const location = state.locations[targetLocationId];
  if (!location) {
    return null;
  }

  return (
    <GuidanceArrowReadout
      label={label}
      locationName={location.name}
      playerHeadingDegrees={playerHeadingDegrees}
      playerPosition={playerPosition}
      targetLocationId={targetLocationId}
      targetPosition={location.position}
    />
  );
}
