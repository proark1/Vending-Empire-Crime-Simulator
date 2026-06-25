import type { GameState, Vec2 } from "../game/core/types";
import { activeVehicle, machineAtLocation } from "../game/core/selectors";
import { worldBounds, worldRoads } from "../game/content/world";
import type { SceneTarget } from "../render/three/SceneTargets";

interface MinimapProps {
  state: GameState;
  playerPosition: Vec2;
  guidanceLocationId?: string;
  target: SceneTarget | null;
}

const mapBounds = worldBounds;

function toMapPoint(position: Vec2): { x: number; y: number } {
  const x = ((position.x - mapBounds.minX) / (mapBounds.maxX - mapBounds.minX)) * 100;
  const y = ((position.z - mapBounds.minZ) / (mapBounds.maxZ - mapBounds.minZ)) * 100;

  return {
    x: Math.max(4, Math.min(96, x)),
    y: Math.max(4, Math.min(96, y))
  };
}

function toMapRect(rect: { depth: number; width: number; x: number; z: number }): { height: number; width: number; x: number; y: number } {
  const topLeft = toMapPoint({ x: rect.x - rect.width / 2, z: rect.z - rect.depth / 2 });
  const bottomRight = toMapPoint({ x: rect.x + rect.width / 2, z: rect.z + rect.depth / 2 });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y)
  };
}

export function Minimap({ state, playerPosition, guidanceLocationId, target }: MinimapProps) {
  const targetLocationId = target?.type === "placement" ? target.id : target?.type === "machine" ? state.machines[target.id]?.locationId : target?.id;
  const player = toMapPoint(playerPosition);
  const vehicle = activeVehicle(state);
  const vehicleLocation = vehicle ? state.locations[vehicle.locationId] : undefined;
  const vehiclePoint = vehicleLocation ? toMapPoint(vehicleLocation.position) : undefined;

  return (
    <aside className="minimap" aria-label="District map">
      <svg viewBox="0 0 100 100" role="img" aria-label="District map">
        <rect className="map-ground" x="2" y="2" width="96" height="96" rx="5" />
        {worldRoads.map((road) => {
          const rect = toMapRect(road);
          return <rect className="map-road-area" key={road.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="1.2" />;
        })}
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
        {vehiclePoint && (
          <g className="map-vehicle">
            <rect x={vehiclePoint.x - 3.6} y={vehiclePoint.y - 2.8} width="7.2" height="5.6" rx="1.2" />
          </g>
        )}
        <circle className="map-player" cx={player.x} cy={player.y} r="3.6" />
      </svg>
    </aside>
  );
}
