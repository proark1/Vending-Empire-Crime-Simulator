import type { GameState, Vec2 } from "../game/core/types";
import { machineAtLocation } from "../game/core/selectors";
import type { SceneTarget } from "../render/three/SceneTargets";

interface MinimapProps {
  state: GameState;
  playerPosition: Vec2;
  guidanceLocationId?: string;
  target: SceneTarget | null;
}

const mapBounds = {
  minX: -14,
  maxX: 12,
  minZ: -10,
  maxZ: 10
};

function toMapPoint(position: Vec2): { x: number; y: number } {
  const x = ((position.x - mapBounds.minX) / (mapBounds.maxX - mapBounds.minX)) * 100;
  const y = ((position.z - mapBounds.minZ) / (mapBounds.maxZ - mapBounds.minZ)) * 100;

  return {
    x: Math.max(4, Math.min(96, x)),
    y: Math.max(4, Math.min(96, y))
  };
}

export function Minimap({ state, playerPosition, guidanceLocationId, target }: MinimapProps) {
  const targetLocationId = target?.type === "placement" ? target.id : target?.type === "machine" ? state.machines[target.id]?.locationId : target?.id;
  const player = toMapPoint(playerPosition);

  return (
    <aside className="minimap" aria-label="District map">
      <svg viewBox="0 0 100 100" role="img" aria-label="Cinderblock Row map">
        <rect className="map-ground" x="2" y="2" width="96" height="96" rx="5" />
        <path className="map-road" d="M3 49 H97" />
        <path className="map-road" d="M53 4 V96" />
        {Object.values(state.locations).map((location) => {
          const point = toMapPoint(location.position);
          const machine = machineAtLocation(state, location.id);
          const isTarget = targetLocationId === location.id;
          const isGuidance = guidanceLocationId === location.id;
          const ownerClass = machine?.ownerFactionId === state.playerFactionId ? "player" : machine ? "rival" : location.kind;

          return (
            <g className={`map-location ${ownerClass} ${isTarget ? "target" : ""} ${isGuidance ? "guidance" : ""}`} key={location.id}>
              <circle cx={point.x} cy={point.y} r={isGuidance ? 5.2 : isTarget ? 4.4 : 3.1} />
            </g>
          );
        })}
        <circle className="map-player" cx={player.x} cy={player.y} r="3.6" />
      </svg>
    </aside>
  );
}
