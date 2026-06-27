import { useMemo } from "react";
import type { GameState, Vec2 } from "../game/core/types";
import { activeVehicle, districtProgress, machineAtLocation } from "../game/core/selectors";
import { crimeContacts, worldBounds, type WorldMapLayout } from "../game/content/world";
import { locationPositionOverrides } from "../game/world/locationGeometry";
import type { SceneTarget } from "../render/three/SceneTargets";

interface MinimapProps {
  state: GameState;
  mapLayout: WorldMapLayout;
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

function toDistrictRect(bounds: { maxX: number; maxZ: number; minX: number; minZ: number }): { height: number; width: number; x: number; y: number } {
  const topLeft = toMapPoint({ x: bounds.minX, z: bounds.minZ });
  const bottomRight = toMapPoint({ x: bounds.maxX, z: bounds.maxZ });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y)
  };
}

export function Minimap({ state, mapLayout, playerPosition, guidanceLocationId, target }: MinimapProps) {
  const locationOverrides = useMemo(() => locationPositionOverrides(mapLayout), [mapLayout]);
  const targetOperation = target?.type === "rival_operation"
    ? Object.values(state.rivalOrganizations ?? {})
        .flatMap((organization) => organization.operations)
        .find((operation) => operation.id === target.id && !operation.resolvedHour)
    : undefined;
  const targetLocationId =
    target?.type === "placement"
      ? target.id
      : target?.type === "machine"
        ? state.machines[target.id]?.locationId
        : target?.type === "base" || target?.type === "supplier"
          ? target.id
          : targetOperation?.locationId;
  const targetContactId = target?.type === "crime_contact" ? target.id : undefined;
  const player = toMapPoint(playerPosition);
  const vehicle = activeVehicle(state);
  const vehicleLocation = vehicle ? state.locations[vehicle.locationId] : undefined;
  const vehiclePoint = vehicle?.position ? toMapPoint(vehicle.position) : vehicleLocation ? toMapPoint(vehicleLocation.position) : undefined;
  const activeOperations = Object.values(state.rivalOrganizations ?? {}).flatMap((organization) => organization.operations.filter((operation) => !operation.resolvedHour));

  return (
    <aside className="minimap" aria-label="District map">
      <svg viewBox="0 0 100 100" role="img" aria-label="District map">
        <rect className="map-ground" x="2" y="2" width="96" height="96" rx="5" />
        {Object.values(state.districts).map((district) => {
          const rect = toDistrictRect(district.bounds);
          const progress = districtProgress(state, district.id);
          const isRecent = district.id !== "starter_suburb" && state.worldTimeHours - (progress.unlockedHour ?? progress.scoutedHour ?? -100) <= 2;
          return <rect className={`map-district ${progress.access} ${isRecent ? "recent" : ""}`} key={district.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="2" />;
        })}
        {mapLayout.parks.map((park) => {
          const rect = toDistrictRect(park.bounds);
          return <rect className="map-park" key={park.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="1.6" />;
        })}
        {mapLayout.roads.map((road) => {
          const rect = toMapRect(road);
          return <rect className="map-road-area" key={road.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="1.2" />;
        })}
        {Object.values(state.locations).map((location) => {
          const point = toMapPoint(locationOverrides[location.id] ?? location.position);
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
        {crimeContacts.map((contact) => {
          const point = toMapPoint({ x: contact.x, z: contact.z });
          const access = districtProgress(state, contact.districtId).access;
          return (
            <g className={`map-contact ${access} ${targetContactId === contact.id ? "target" : ""}`} key={contact.id}>
              <rect x={point.x - 2.2} y={point.y - 2.2} width="4.4" height="4.4" rx="1" />
            </g>
          );
        })}
        {activeOperations.map((operation) => {
          const location = state.locations[operation.locationId];
          if (!location) {
            return null;
          }
          const point = toMapPoint(locationOverrides[operation.locationId] ?? location.position);
          return (
            <g className={`map-operation ${target?.type === "rival_operation" && target.id === operation.id ? "target" : ""}`} key={operation.id}>
              <path d={`M ${point.x} ${point.y - 3.2} L ${point.x + 3.2} ${point.y + 3.2} L ${point.x - 3.2} ${point.y + 3.2} Z`} />
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
