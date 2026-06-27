import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { DistrictAccess, DistrictEvent, Employee, GameState, GameEventTone, Location, MachineId, MachineUpgradeId, ProductId, RivalOperation, RouteVehicle, StockCrate, StreetActivity, Vec2, VehicleId, VendingMachine } from "../../game/core/types";
import { activeConflictEvents, activeDistrictEvents, activeMachineAlarms, activeVehicle, carriedCrateUnits, districtProgress, garageStorageUnits, machineAtLocation, machineRoutePressure, optimizedRoutePlan } from "../../game/core/selectors";
import { modelTransformFor, type ModelConfig, type ModelTransform } from "../../game/content/modelConfig";
import {
  crimeContacts,
  districtLabels,
  districtVisualProfiles,
  facingToRotationY,
  machinePlacementAnchors,
  neighborhoodHotspots,
  worldBounds,
  type CityBackdropBuilding,
  type PatrolZone,
  type PolicePatrolPath,
  type TrafficLoop,
  type WorldDecoration,
  type WorldInterior,
  type WorldMapLayout,
  type WorldPark,
  type WorldRoad
} from "../../game/content/world";
import { pathOnRoads, roadBounds } from "../../game/world/roadGraph";
import { WORLD_SCALE } from "../../game/world/scale";
import { sidewalkFootprintsForRoads } from "../../game/world/sidewalks";
import type { SceneFeedbackEvent, SceneTarget } from "./SceneTargets";
import { resolveGraphicsProfile, type GraphicsQuality } from "./graphicsQuality";
import { createAsphaltMaterial, createAtmosphere, createBuilding, createBush, createContactShadow, createEnvironmentMapTexture, createGrassMaterial, createNpcCharacter, createParkBench, createParkLamp, createParkPathMaterial, createPondMaterial, createRoadMaterial, createSidewalkMaterial, createSkyDome, createStreetProps, createTree } from "./proceduralArt";

interface ThreeSceneProps {
  feedbackEvent?: SceneFeedbackEvent | null;
  graphicsQuality: GraphicsQuality;
  guidanceLocationId?: string;
  mapLayout: WorldMapLayout;
  modelConfig: ModelConfig;
  state: GameState;
  onVehicleDrive?: (vehicleId: VehicleId, position: Vec2, heading: number, distance: number) => void;
  onPlayerPositionChange: (position: { x: number; z: number }) => void;
  onPlayerHeadingChange: (headingDegrees: number) => void;
  onTargetChange: (target: SceneTarget | null) => void;
}

interface Interactable {
  radius: number;
  target: SceneTarget;
  position: THREE.Vector3;
}

type CameraMode = "first" | "third";

interface CollisionBox {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
}

interface RectBounds {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
}

interface WorldChunkRuntime {
  built: boolean;
  group: THREE.Group;
  indexX: number;
  indexZ: number;
  key: string;
}

type WorldChunkBuildJob = (chunk: WorldChunkRuntime) => void;

interface WorldChunkBuildSpec {
  indexX: number;
  indexZ: number;
  jobs: WorldChunkBuildJob[];
  key: string;
}

interface FeedbackRuntime {
  baseScale: number;
  createdAt: number;
  duration: number;
  kind: SceneFeedbackEvent["kind"];
  startY: number;
}

interface NpcRuntimeLimb {
  lower?: THREE.Object3D;
  upper?: THREE.Object3D;
  wrist?: THREE.Object3D;
}

interface NpcRuntimeRig {
  body?: THREE.Object3D;
  carryMount?: THREE.Object3D;
  head?: THREE.Object3D;
  hips?: THREE.Object3D;
  leftArm?: NpcRuntimeLimb;
  leftLeg?: NpcRuntimeLimb;
  rightArm?: NpcRuntimeLimb;
  rightLeg?: NpcRuntimeLimb;
  shoulders?: THREE.Object3D;
}

const productCrateColors: Record<ProductId, string> = {
  soda: "#38bdf8",
  chips: "#f59e0b",
  energy: "#22c55e",
  water: "#93c5fd",
  protein_bar: "#a16207",
  coffee_can: "#7c2d12",
  instant_noodles: "#fbbf24",
  phone_charger: "#94a3b8",
  umbrella: "#0f766e",
  hygiene_kit: "#f8fafc",
  luxury_snack: "#f472b6",
  mystery_capsules: "#e879f9",
  mood_fizz: "#fb7185",
  glitch_gum: "#c084fc",
  night_syrup: "#4c1d95",
  focus_cubes: "#67e8f9"
};

const playerRadius = WORLD_SCALE.human.radius;
const playerGroundY = 0;
const playerJumpVelocity = 5.6;
const playerGravity = -15.8;
const worldWidth = worldBounds.maxX - worldBounds.minX;
const worldDepth = worldBounds.maxZ - worldBounds.minZ;
const worldCenterX = (worldBounds.minX + worldBounds.maxX) / 2;
const worldCenterZ = (worldBounds.minZ + worldBounds.maxZ) / 2;
const worldChunkSize = 24;

function applyModelTransform(object: THREE.Object3D, transform: ModelTransform): void {
  object.position.x += transform.offsetX;
  object.position.y += transform.offsetY;
  object.position.z += transform.offsetZ;
  object.rotation.x += transform.rotationX;
  object.rotation.y += transform.rotationY;
  object.rotation.z += transform.rotationZ;
  object.scale.set(
    object.scale.x * transform.scaleX,
    object.scale.y * transform.scaleY,
    object.scale.z * transform.scaleZ
  );

  const path = Array.isArray(object.userData.walkPath) ? object.userData.walkPath as THREE.Vector3[] : [];
  path.forEach((point) => {
    point.x += transform.offsetX;
    point.y += transform.offsetY;
    point.z += transform.offsetZ;
  });

  if (typeof object.userData.baseY === "number") {
    object.userData.baseY += transform.offsetY;
  }

  object.userData.modelRotationX = (typeof object.userData.modelRotationX === "number" ? object.userData.modelRotationX : 0) + transform.rotationX;
  object.userData.modelRotationY = (typeof object.userData.modelRotationY === "number" ? object.userData.modelRotationY : 0) + transform.rotationY;
  object.userData.modelRotationZ = (typeof object.userData.modelRotationZ === "number" ? object.userData.modelRotationZ : 0) + transform.rotationZ;
}

export function applyModelTransformById(object: THREE.Object3D, modelConfig: ModelConfig, modelId: string): void {
  applyModelTransform(object, modelTransformFor(modelConfig, modelId));
}

function applyAnimatedModelRotation(object: THREE.Object3D): void {
  if (typeof object.userData.modelRotationX === "number") {
    object.rotation.x = object.userData.modelRotationX;
  }
  if (typeof object.userData.modelRotationY === "number") {
    object.rotation.y += object.userData.modelRotationY;
  }
  if (typeof object.userData.modelRotationZ === "number") {
    object.rotation.z = object.userData.modelRotationZ;
  }
}

function unitModelId(variant: "customer" | "rival" | "scout" | "worker"): string {
  return `unit.${variant}`;
}

function trafficVehicleModelId(kind: TrafficLoop["kind"]): string {
  return `vehicle.${kind}`;
}

function roundedBox(width: number, height: number, depth: number, radius: number, quality: GraphicsQuality): RoundedBoxGeometry {
  return new RoundedBoxGeometry(width, height, depth, quality === "low" ? 1 : 3, radius);
}

function createVehicleDecalTexture(label: string, background: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const wash = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    wash.addColorStop(0, "rgba(255, 255, 255, 0.18)");
    wash.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
    wash.addColorStop(1, "rgba(2, 6, 23, 0.18)");
    context.fillStyle = wash;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = accent;
    context.fillRect(0, 0, canvas.width, 18);
    context.fillRect(0, canvas.height - 18, canvas.width, 18);
    context.fillStyle = "#020617";
    context.font = "900 54px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2, 440);
    context.strokeStyle = "rgba(2, 6, 23, 0.32)";
    context.lineWidth = 8;
    context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function chunkIndexForCoordinate(value: number, min: number): number {
  return Math.floor((value - min) / worldChunkSize);
}

function chunkKey(indexX: number, indexZ: number): string {
  return `${indexX}:${indexZ}`;
}

function parseChunkKey(key: string): { indexX: number; indexZ: number } {
  const [x, z] = key.split(":").map(Number);
  return { indexX: Number.isFinite(x) ? x : 0, indexZ: Number.isFinite(z) ? z : 0 };
}

function getOrCreateWorldChunk(chunks: Map<string, WorldChunkRuntime>, parent: THREE.Object3D, indexX: number, indexZ: number): WorldChunkRuntime {
  const key = chunkKey(indexX, indexZ);
  const existing = chunks.get(key);
  if (existing) {
    return existing;
  }

  const group = new THREE.Group();
  group.userData.worldChunk = true;
  group.name = `world-chunk-${key}`;
  parent.add(group);

  const chunk = { built: false, group, indexX, indexZ, key };
  chunks.set(key, chunk);
  return chunk;
}

function getOrCreateWorldChunkSpec(specs: Map<string, WorldChunkBuildSpec>, indexX: number, indexZ: number): WorldChunkBuildSpec {
  const key = chunkKey(indexX, indexZ);
  const existing = specs.get(key);
  if (existing) {
    return existing;
  }

  const spec = { indexX, indexZ, jobs: [], key };
  specs.set(key, spec);
  return spec;
}

function chunkBounds(indexX: number, indexZ: number): RectBounds {
  const minX = worldBounds.minX + indexX * worldChunkSize;
  const minZ = worldBounds.minZ + indexZ * worldChunkSize;
  return {
    minX,
    maxX: minX + worldChunkSize,
    minZ,
    maxZ: minZ + worldChunkSize
  };
}

function chunkRangeForBounds(bounds: RectBounds): { maxIndexX: number; maxIndexZ: number; minIndexX: number; minIndexZ: number } {
  return {
    minIndexX: chunkIndexForCoordinate(bounds.minX, worldBounds.minX),
    maxIndexX: chunkIndexForCoordinate(bounds.maxX, worldBounds.minX),
    minIndexZ: chunkIndexForCoordinate(bounds.minZ, worldBounds.minZ),
    maxIndexZ: chunkIndexForCoordinate(bounds.maxZ, worldBounds.minZ)
  };
}

function addObjectToWorldChunk(chunks: Map<string, WorldChunkRuntime>, parent: THREE.Object3D, object: THREE.Object3D, x: number, z: number): void {
  const indexX = chunkIndexForCoordinate(x, worldBounds.minX);
  const indexZ = chunkIndexForCoordinate(z, worldBounds.minZ);
  getOrCreateWorldChunk(chunks, parent, indexX, indexZ).group.add(object);
}

function addObjectBuildJobToWorldChunk(
  specs: Map<string, WorldChunkBuildSpec>,
  createObject: () => THREE.Object3D,
  x: number,
  z: number
): void {
  const indexX = chunkIndexForCoordinate(x, worldBounds.minX);
  const indexZ = chunkIndexForCoordinate(z, worldBounds.minZ);
  getOrCreateWorldChunkSpec(specs, indexX, indexZ).jobs.push((chunk) => {
    chunk.group.add(createObject());
  });
}

function addRectMeshesToWorldChunks(
  chunks: Map<string, WorldChunkRuntime>,
  parent: THREE.Object3D,
  bounds: RectBounds,
  y: number,
  height: number,
  material: THREE.Material,
  configure?: (mesh: THREE.Mesh) => void
): void {
  const range = chunkRangeForBounds(bounds);

  for (let indexX = range.minIndexX; indexX <= range.maxIndexX; indexX += 1) {
    for (let indexZ = range.minIndexZ; indexZ <= range.maxIndexZ; indexZ += 1) {
      const currentChunkBounds = chunkBounds(indexX, indexZ);
      const minX = Math.max(bounds.minX, currentChunkBounds.minX);
      const maxX = Math.min(bounds.maxX, currentChunkBounds.maxX);
      const minZ = Math.max(bounds.minZ, currentChunkBounds.minZ);
      const maxZ = Math.min(bounds.maxZ, currentChunkBounds.maxZ);
      const width = maxX - minX;
      const depth = maxZ - minZ;

      if (width <= 0.01 || depth <= 0.01) {
        continue;
      }

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
      configure?.(mesh);
      getOrCreateWorldChunk(chunks, parent, indexX, indexZ).group.add(mesh);
    }
  }
}

function addRectMeshBuildJobsToWorldChunks(
  specs: Map<string, WorldChunkBuildSpec>,
  bounds: RectBounds,
  y: number,
  height: number,
  material: THREE.Material,
  configure?: (mesh: THREE.Mesh) => void
): void {
  const range = chunkRangeForBounds(bounds);

  for (let indexX = range.minIndexX; indexX <= range.maxIndexX; indexX += 1) {
    for (let indexZ = range.minIndexZ; indexZ <= range.maxIndexZ; indexZ += 1) {
      const currentChunkBounds = chunkBounds(indexX, indexZ);
      const minX = Math.max(bounds.minX, currentChunkBounds.minX);
      const maxX = Math.min(bounds.maxX, currentChunkBounds.maxX);
      const minZ = Math.max(bounds.minZ, currentChunkBounds.minZ);
      const maxZ = Math.min(bounds.maxZ, currentChunkBounds.maxZ);
      const width = maxX - minX;
      const depth = maxZ - minZ;

      if (width <= 0.01 || depth <= 0.01) {
        continue;
      }

      getOrCreateWorldChunkSpec(specs, indexX, indexZ).jobs.push((chunk) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
        configure?.(mesh);
        chunk.group.add(mesh);
      });
    }
  }
}

function updateWorldChunkVisibility(chunks: Iterable<WorldChunkRuntime>, position: THREE.Vector3, radius: number): void {
  const currentIndexX = chunkIndexForCoordinate(position.x, worldBounds.minX);
  const currentIndexZ = chunkIndexForCoordinate(position.z, worldBounds.minZ);

  for (const chunk of chunks) {
    chunk.group.visible = Math.abs(chunk.indexX - currentIndexX) <= radius && Math.abs(chunk.indexZ - currentIndexZ) <= radius;
  }
}

function enqueueWorldChunksNear(
  specs: Map<string, WorldChunkBuildSpec>,
  chunks: Map<string, WorldChunkRuntime>,
  queue: string[],
  queued: Set<string>,
  position: THREE.Vector3,
  radius: number
): void {
  const currentIndexX = chunkIndexForCoordinate(position.x, worldBounds.minX);
  const currentIndexZ = chunkIndexForCoordinate(position.z, worldBounds.minZ);
  const candidates: Array<{ distance: number; key: string }> = [];

  for (let indexX = currentIndexX - radius; indexX <= currentIndexX + radius; indexX += 1) {
    for (let indexZ = currentIndexZ - radius; indexZ <= currentIndexZ + radius; indexZ += 1) {
      const key = chunkKey(indexX, indexZ);
      const runtime = chunks.get(key);
      if (!specs.has(key) || runtime?.built || queued.has(key)) {
        continue;
      }

      candidates.push({
        distance: Math.abs(indexX - currentIndexX) + Math.abs(indexZ - currentIndexZ),
        key
      });
    }
  }

  candidates
    .sort((a, b) => a.distance - b.distance)
    .forEach((candidate) => {
      queued.add(candidate.key);
      queue.push(candidate.key);
    });

  queue.sort((a, b) => {
    const first = parseChunkKey(a);
    const second = parseChunkKey(b);
    return Math.abs(first.indexX - currentIndexX) + Math.abs(first.indexZ - currentIndexZ)
      - (Math.abs(second.indexX - currentIndexX) + Math.abs(second.indexZ - currentIndexZ));
  });
}

function processWorldChunkBuildQueue(
  specs: Map<string, WorldChunkBuildSpec>,
  chunks: Map<string, WorldChunkRuntime>,
  parent: THREE.Object3D,
  queue: string[],
  queued: Set<string>,
  maxChunks: number,
  budgetMs: number
): number {
  const startedAt = performance.now();
  let built = 0;

  while (queue.length > 0 && built < maxChunks && performance.now() - startedAt <= budgetMs) {
    const key = queue.shift();
    if (!key) {
      break;
    }

    queued.delete(key);
    const spec = specs.get(key);
    if (!spec) {
      continue;
    }

    const chunk = getOrCreateWorldChunk(chunks, parent, spec.indexX, spec.indexZ);
    if (chunk.built) {
      continue;
    }

    chunk.group.visible = false;
    spec.jobs.forEach((job) => job(chunk));
    chunk.built = true;
    built += 1;
  }

  return built;
}

function machineFrontVector(rotationY: number): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(rotationY), 0, -Math.cos(rotationY));
}

function machineInteractionPoint(placement: { position: THREE.Vector3; rotationY: number }): THREE.Vector3 {
  return placement.position.clone().add(machineFrontVector(placement.rotationY).multiplyScalar(0.82));
}

function machineStockRatio(machine: VendingMachine): number {
  const capacity = machine.slots.reduce((sum, slot) => sum + slot.capacity, 0);
  if (capacity <= 0) {
    return 0;
  }

  const stock = machine.slots.reduce((sum, slot) => sum + slot.quantity, 0);
  return THREE.MathUtils.clamp(stock / capacity, 0, 1);
}

function stockedProductIds(machine: VendingMachine): ProductId[] {
  return machine.slots
    .filter((slot) => slot.quantity > 0)
    .map((slot) => slot.productId);
}

function fallbackMachinePlacement(location: Location): { position: THREE.Vector3; rotationY: number } {
  const position = new THREE.Vector3(location.position.x, 0, location.position.z);
  const directionToStreet = new THREE.Vector3(-location.position.x, 0, -location.position.z);

  if (directionToStreet.lengthSq() < 0.001) {
    return { position, rotationY: 0 };
  }

  directionToStreet.normalize();
  return {
    position,
    rotationY: Math.atan2(-directionToStreet.x, -directionToStreet.z)
  };
}

function machinePlacementForLocation(location: Location): { position: THREE.Vector3; rotationY: number } {
  const anchor = machinePlacementAnchors[location.id];
  if (!anchor) {
    return fallbackMachinePlacement(location);
  }

  return {
    position: new THREE.Vector3(anchor.x, 0, anchor.z),
    rotationY: anchor.rotationY
  };
}

function collisionBoxFromCenter(x: number, z: number, width: number, depth: number): CollisionBox {
  return {
    maxX: x + width / 2,
    maxZ: z + depth / 2,
    minX: x - width / 2,
    minZ: z - depth / 2
  };
}

function walkableInteriorLocationIdsForLayout(layout: WorldMapLayout): Set<string> {
  return new Set(layout.interiors.map((interior) => interior.locationId));
}

function buildingCollisionBoxesForLayout(layout: WorldMapLayout): CollisionBox[] {
  const walkableInteriorLocationIds = walkableInteriorLocationIdsForLayout(layout);
  return layout.buildings
    .filter((building) => !building.locationId || !walkableInteriorLocationIds.has(building.locationId))
    .map((building) =>
      collisionBoxFromRotatedCenter(
        building.x,
        building.z,
        building.width,
        building.depth,
        facingToRotationY(building.facing ?? "north")
      )
    );
}

function clampToWorld(position: THREE.Vector3): void {
  position.x = THREE.MathUtils.clamp(position.x, worldBounds.minX + playerRadius, worldBounds.maxX - playerRadius);
  position.z = THREE.MathUtils.clamp(position.z, worldBounds.minZ + playerRadius, worldBounds.maxZ - playerRadius);
}

function positionOverlapsBox(position: THREE.Vector3, box: CollisionBox, radius = playerRadius): boolean {
  return position.x > box.minX - radius
    && position.x < box.maxX + radius
    && position.z > box.minZ - radius
    && position.z < box.maxZ + radius;
}

function isPositionBlocked(position: THREE.Vector3, boxes: CollisionBox[]): boolean {
  return boxes.some((box) => positionOverlapsBox(position, box));
}

function machineCollisionBox(placement: { position: THREE.Vector3; rotationY: number }): CollisionBox {
  const halfWidth = 0.5;
  const halfDepth = 0.38;
  const cos = Math.abs(Math.cos(placement.rotationY));
  const sin = Math.abs(Math.sin(placement.rotationY));
  const halfX = cos * halfWidth + sin * halfDepth;
  const halfZ = sin * halfWidth + cos * halfDepth;
  return collisionBoxFromCenter(placement.position.x, placement.position.z, halfX * 2, halfZ * 2);
}

function collisionBoxFromRotatedCenter(x: number, z: number, localWidth: number, localDepth: number, rotationY: number): CollisionBox {
  const halfWidth = localWidth / 2;
  const halfDepth = localDepth / 2;
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  const halfX = cos * halfWidth + sin * halfDepth;
  const halfZ = sin * halfWidth + cos * halfDepth;
  return collisionBoxFromCenter(x, z, halfX * 2, halfZ * 2);
}

function activeVehiclePlacementForLocation(location: Location): { position: THREE.Vector3; rotationY: number } {
  const streetSide = location.position.z > 0 ? -1 : 1;
  return {
    position: new THREE.Vector3(location.position.x + 4, 0, location.position.z + streetSide * 2.25),
    rotationY: location.id === "garage" || location.position.z > 0 ? -Math.PI / 2 : Math.PI / 2
  };
}

function activeVehiclePlacementForVehicle(vehicle: RouteVehicle, location?: Location): { position: THREE.Vector3; rotationY: number } {
  if (vehicle.position) {
    return {
      position: new THREE.Vector3(vehicle.position.x, 0, vehicle.position.z),
      rotationY: typeof vehicle.heading === "number" ? vehicle.heading : location ? activeVehiclePlacementForLocation(location).rotationY : 0
    };
  }

  return location ? activeVehiclePlacementForLocation(location) : { position: new THREE.Vector3(), rotationY: 0 };
}

function vehicleCollisionBox(placement: { position: THREE.Vector3; rotationY: number }): CollisionBox {
  const clearance = WORLD_SCALE.vehicle.clearance;
  return collisionBoxFromRotatedCenter(
    placement.position.x,
    placement.position.z,
    WORLD_SCALE.vehicle.length + clearance,
    WORLD_SCALE.vehicle.width + clearance,
    placement.rotationY
  );
}

function collisionBoxesForState(currentState: GameState, layout: WorldMapLayout, options: { excludeVehicleId?: string } = {}): CollisionBox[] {
  const boxes = [...buildingCollisionBoxesForLayout(layout)];

  for (const location of Object.values(currentState.locations)) {
    if (machineAtLocation(currentState, location.id)) {
      boxes.push(machineCollisionBox(machinePlacementForLocation(location)));
    }
  }

  const vehicle = activeVehicle(currentState);
  const vehicleLocation = vehicle ? currentState.locations[vehicle.locationId] : undefined;
  if (vehicle && vehicle.id !== options.excludeVehicleId) {
    boxes.push(vehicleCollisionBox(activeVehiclePlacementForVehicle(vehicle, vehicleLocation)));
  }

  return boxes;
}

function movePlayerWithCollision(position: THREE.Vector3, movement: THREE.Vector3, boxes: CollisionBox[]): boolean {
  let moved = false;
  const nextX = position.clone();
  nextX.x += movement.x;
  clampToWorld(nextX);

  if (!isPositionBlocked(nextX, boxes)) {
    moved ||= Math.abs(nextX.x - position.x) > 0.0001;
    position.x = nextX.x;
  }

  const nextZ = position.clone();
  nextZ.z += movement.z;
  clampToWorld(nextZ);

  if (!isPositionBlocked(nextZ, boxes)) {
    moved ||= Math.abs(nextZ.z - position.z) > 0.0001;
    position.z = nextZ.z;
  }

  return moved;
}

function pathStateAt(path: THREE.Vector3[], distance: number): { direction: THREE.Vector3; position: THREE.Vector3 } | null {
  if (path.length < 2) {
    return null;
  }

  let totalLength = 0;
  for (let index = 0; index < path.length; index += 1) {
    totalLength += path[index].distanceTo(path[(index + 1) % path.length]);
  }

  if (totalLength <= 0.001) {
    return null;
  }

  let remaining = ((distance % totalLength) + totalLength) % totalLength;
  for (let index = 0; index < path.length; index += 1) {
    const start = path[index];
    const end = path[(index + 1) % path.length];
    const segmentLength = start.distanceTo(end);
    if (segmentLength <= 0.001) {
      continue;
    }

    if (remaining <= segmentLength || index === path.length - 1) {
      const t = THREE.MathUtils.clamp(remaining / segmentLength, 0, 1);
      const position = start.clone().lerp(end, t);
      const direction = end.clone().sub(start).normalize();
      return { direction, position };
    }

    remaining -= segmentLength;
  }

  return null;
}

function setLimbPose(limb: NpcRuntimeLimb | undefined, upperX: number, upperZ: number, lowerX: number): void {
  if (limb?.upper) {
    limb.upper.rotation.set(upperX, 0, upperZ);
  }

  if (limb?.lower) {
    limb.lower.rotation.set(lowerX, 0, 0);
  }
}

function updateNpcRig(object: THREE.Object3D, time: number, walkSpeed: number, isMoving: boolean): void {
  const rig = object.userData.rig as NpcRuntimeRig | undefined;
  if (!rig) {
    return;
  }

  const phase = typeof object.userData.phase === "number" ? object.userData.phase : 0;
  const action = typeof object.userData.action === "string" ? object.userData.action : "walk";
  const cycle = time * 0.0055 * Math.max(0.8, walkSpeed * 2.8) + phase;
  const stride = isMoving ? Math.sin(cycle) : 0;
  const footLift = isMoving ? Math.abs(Math.cos(cycle)) : 0;
  const legSwing = action === "pace" ? 0.3 : action === "carry" ? 0.34 : 0.46;
  const armSwing = action === "pace" ? 0.2 : 0.38;

  setLimbPose(rig.leftLeg, stride * legSwing, 0.04, Math.max(0, -stride) * 0.38 + footLift * 0.04);
  setLimbPose(rig.rightLeg, -stride * legSwing, -0.04, Math.max(0, stride) * 0.38 + footLift * 0.04);

  if (action === "carry") {
    setLimbPose(rig.leftArm, 0.9, 0.5, 0.62);
    setLimbPose(rig.rightArm, 0.9, -0.5, 0.62);
  } else if (action === "scan") {
    setLimbPose(rig.leftArm, -stride * armSwing, 0.2, 0.12 + Math.max(0, stride) * 0.18);
    setLimbPose(rig.rightArm, 1.0, -0.24, 0.52 + Math.sin(cycle * 1.7) * 0.04);
  } else if (action === "pace") {
    setLimbPose(rig.leftArm, 0.58 + Math.sin(cycle * 0.65) * 0.08, 0.18, 0.44);
    setLimbPose(rig.rightArm, stride * 0.18, -0.2, 0.08 + Math.max(0, -stride) * 0.12);
  } else {
    setLimbPose(rig.leftArm, -stride * armSwing, 0.2, 0.1 + Math.max(0, stride) * 0.18);
    setLimbPose(rig.rightArm, stride * armSwing, -0.2, 0.1 + Math.max(0, -stride) * 0.18);
  }

  if (rig.body) {
    rig.body.rotation.z = -stride * 0.018;
  }

  if (rig.hips) {
    rig.hips.rotation.z = stride * 0.024;
  }

  if (rig.shoulders) {
    rig.shoulders.rotation.z = -stride * 0.024;
  }

  if (rig.carryMount) {
    rig.carryMount.position.y = 0.82 + footLift * 0.006;
  }

  if (rig.head) {
    rig.head.rotation.x = action === "carry" ? -0.08 : Math.sin(cycle * 0.5) * 0.025;
    rig.head.rotation.y = action === "scan"
      ? Math.sin(cycle * 0.65) * 0.38
      : action === "pace"
        ? Math.sin(cycle * 0.45) * 0.22
        : -stride * 0.045;
    rig.head.rotation.z = action === "carry" ? 0 : stride * 0.025;
  }
}

function updateAnimatedStreetProp(object: THREE.Object3D, time: number): void {
  const baseY = typeof object.userData.baseY === "number" ? object.userData.baseY : 0;
  const phase = typeof object.userData.phase === "number" ? object.userData.phase : 0;
  const amount = typeof object.userData.floatAmount === "number" ? object.userData.floatAmount : 0.01;
  const floatSpeed = typeof object.userData.floatSpeed === "number" ? object.userData.floatSpeed : 1;
  const path = Array.isArray(object.userData.walkPath) ? object.userData.walkPath as THREE.Vector3[] : [];
  const walkSpeed = typeof object.userData.walkSpeed === "number" ? object.userData.walkSpeed : 0;
  let isMoving = false;

  if (path.length > 1 && walkSpeed > 0) {
    const pathOffset = typeof object.userData.pathOffset === "number" ? object.userData.pathOffset : 0;
    const state = pathStateAt(path, time * 0.001 * walkSpeed + pathOffset);
    if (state) {
      object.position.x = state.position.x;
      object.position.z = state.position.z;
      object.rotation.y = Math.atan2(state.direction.x, -state.direction.z) + Math.PI;
      applyAnimatedModelRotation(object);
      isMoving = true;
    }
  }

  const walkBob = isMoving ? Math.abs(Math.cos(time * 0.0055 * Math.max(0.8, walkSpeed * 2.8) + phase)) * 0.01 : 0;
  object.position.y = baseY + Math.sin(time * 0.003 * floatSpeed + phase) * amount + walkBob;
  updateNpcRig(object, time, walkSpeed || floatSpeed, isMoving);
}

function updateTrafficVehicle(object: THREE.Object3D, time: number): void {
  const path = Array.isArray(object.userData.walkPath) ? object.userData.walkPath as THREE.Vector3[] : [];
  const speed = typeof object.userData.walkSpeed === "number" ? object.userData.walkSpeed : 0;
  const pathOffset = typeof object.userData.pathOffset === "number" ? object.userData.pathOffset : 0;
  const state = pathStateAt(path, time * 0.001 * speed + pathOffset);
  if (!state) {
    return;
  }

  object.position.x = state.position.x;
  object.position.z = state.position.z;
  object.rotation.y = Math.atan2(-state.direction.x, -state.direction.z);
  applyAnimatedModelRotation(object);

  const emergencyLight = object.userData.emergencyLight as THREE.Object3D | undefined;
  if (emergencyLight) {
    emergencyLight.visible = Math.sin(time * 0.012) > 0;
  }
}

function createMachineSignTexture(color: string, damage: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (context) {
    const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    background.addColorStop(0, "#020617");
    background.addColorStop(0.55, "#0f172a");
    background.addColorStop(1, "#111827");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, 12);
    context.fillRect(0, canvas.height - 12, canvas.width, 12);
    context.fillStyle = "rgba(248, 250, 252, 0.08)";
    for (let x = 18; x < canvas.width; x += 36) {
      context.fillRect(x, 18, 2, canvas.height - 36);
    }
    context.strokeStyle = "rgba(248, 250, 252, 0.16)";
    context.lineWidth = 2;
    context.strokeRect(14, 20, canvas.width - 28, canvas.height - 40);
    context.fillStyle = damage > 70 ? "#fecdd3" : "#f8fafc";
    context.font = "900 48px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = color;
    context.shadowBlur = damage > 70 ? 0 : 16;
    context.fillText("VEND-X", canvas.width / 2, 52);
    context.shadowBlur = 0;
    context.fillStyle = "#cbd5e1";
    context.font = "800 17px Inter, system-ui, sans-serif";
    context.fillText(damage > 70 ? "SERVICE NEEDED" : "COLD STOCK", canvas.width / 2, 92);
    context.fillStyle = color;
    context.font = "900 14px Inter, system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText("24H", 26, 93);
    context.textAlign = "right";
    context.fillText("ROUTE", canvas.width - 26, 93);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMachineDisplayTexture(damage: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = damage > 75 ? "#3f1010" : "#042f2e";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = damage > 75 ? "#fb7185" : "#22d3ee";
    context.lineWidth = 8;
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.fillStyle = damage > 75 ? "#fecdd3" : "#ccfbf1";
    context.font = "900 28px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(damage > 75 ? "ERR" : "READY", canvas.width / 2, 46);
    context.font = "800 18px Inter, system-ui, sans-serif";
    context.fillText(damage > 75 ? "CALL" : "TAP", canvas.width / 2, 82);
    context.fillStyle = damage > 75 ? "#fb7185" : "#5eead4";
    for (let i = 0; i < 4; i += 1) {
      context.fillRect(42 + i * 28, 101, 16, 7);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLowMachineMesh(color: string, damage: number, installedUpgrades: MachineUpgradeId[] = [], stockRatio = 1, productIds: ProductId[] = []): THREE.Group {
  const group = new THREE.Group();
  const upgrades = new Set(installedUpgrades);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.55, metalness: 0.12 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.54), darkMaterial);
  base.position.y = 0.06;
  base.castShadow = true;
  group.add(base);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.52, 0.46), bodyMaterial);
  body.position.y = 0.88;
  body.castShadow = true;
  group.add(body);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.18, 0.035),
    new THREE.MeshStandardMaterial({ map: createMachineSignTexture(color, damage), emissive: color, emissiveIntensity: 0.12, roughness: 0.34 })
  );
  sign.position.set(0, 1.58, -0.245);
  group.add(sign);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.78, 0.03),
    new THREE.MeshBasicMaterial({ color: damage > 65 ? "#7f1d1d" : "#bae6fd", transparent: true, opacity: 0.58 })
  );
  glass.position.set(-0.09, 1.03, -0.255);
  group.add(glass);

  for (let row = 0; row < 3; row += 1) {
    const rowFilled = THREE.MathUtils.clamp(stockRatio * 3 - row, 0, 1);
    const fillWidth = Math.max(0.025, 0.34 * rowFilled);
    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(fillWidth, 0.05, 0.018),
      new THREE.MeshBasicMaterial({
        color: productCrateColors[productIds[row % Math.max(1, productIds.length)] ?? "soda"] ?? color,
        transparent: true,
        opacity: rowFilled > 0 ? 0.82 : 0.14
      })
    );
    fill.position.set(-0.09 - (0.34 - fillWidth) / 2, 0.78 + row * 0.21, -0.276);
    group.add(fill);
  }

  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.024),
    new THREE.MeshBasicMaterial({ map: createMachineDisplayTexture(damage) })
  );
  display.position.set(0.25, 1.22, -0.27);
  group.add(display);

  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.035), darkMaterial);
  slot.position.set(-0.08, 0.38, -0.267);
  group.add(slot);

  if (upgrades.size > 0) {
    const upgradeDot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: "#5eead4" }));
    upgradeDot.position.set(0.31, 1.45, -0.274);
    group.add(upgradeDot);
  }

  if (damage > 15) {
    const dent = new THREE.Mesh(new THREE.BoxGeometry(0.18 + damage / 360, 0.055, 0.035), new THREE.MeshBasicMaterial({ color: "#fbbf24" }));
    dent.position.set(0.15, 1.42, -0.278);
    dent.rotation.z = -0.32;
    group.add(dent);
  }

  return group;
}

export function createMachineMesh(color: string, damage: number, installedUpgrades: MachineUpgradeId[] = [], quality: GraphicsQuality = "medium", stockRatio = 1, productIds: ProductId[] = []): THREE.Group {
  if (quality === "low") {
    return createLowMachineMesh(color, damage, installedUpgrades, stockRatio, productIds);
  }

  const group = new THREE.Group();
  const upgrades = new Set(installedUpgrades);
  const trimMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.12 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.44, metalness: 0.08 });
  const bodyShadowMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.5, metalness: 0.16 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: damage > 65 ? "#7f1d1d" : "#dffbff",
    emissive: damage > 65 ? "#3f1010" : "#0891b2",
    emissiveIntensity: damage > 65 ? 0.18 : 0.42,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    transmission: 0.18
  });

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.88, 0.12, 0.58),
    new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.55, metalness: 0.14 })
  );
  base.position.y = 0.06;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 1.62, 0.5),
    trimMaterial
  );
  body.position.y = 0.92;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.58), bodyShadowMaterial);
  topCap.position.y = 1.77;
  topCap.castShadow = true;
  group.add(topCap);

  const kickPlate = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 0.055), new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.42, metalness: 0.26 }));
  kickPlate.position.set(0, 0.22, -0.285);
  group.add(kickPlate);

  const cornerMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.46, metalness: 0.22 });
  for (const x of [-0.42, 0.42]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.58, 12), cornerMaterial);
    post.position.set(x, 0.96, -0.265);
    post.castShadow = true;
    group.add(post);
  }

  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.56, 0.035), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.46, metalness: 0.18 }));
  backPanel.position.set(0, 0.92, 0.265);
  group.add(backPanel);

  const topSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.2, 0.04),
    new THREE.MeshStandardMaterial({ map: createMachineSignTexture(color, damage), emissive: color, emissiveIntensity: damage > 70 ? 0.05 : 0.28, roughness: 0.26 })
  );
  topSign.position.set(0, 1.65, -0.275);
  group.add(topSign);

  const neonBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.035, 0.04),
    new THREE.MeshBasicMaterial({ color })
  );
  neonBar.position.set(0, 1.53, -0.285);
  group.add(neonBar);

  const interiorGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.84, 0.018),
    new THREE.MeshBasicMaterial({ color: damage > 65 ? "#7f1d1d" : "#e0f2fe", transparent: true, opacity: damage > 65 ? 0.13 : 0.26 })
  );
  interiorGlow.position.set(-0.08, 1.1, -0.304);
  group.add(interiorGlow);

  const windowPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.86, 0.038),
    glassMaterial
  );
  windowPanel.position.set(-0.08, 1.1, -0.274);
  group.add(windowPanel);

  const windowFrameMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.38, metalness: 0.22 });
  for (const [x, y, w, h] of [
    [-0.08, 1.55, 0.54, 0.035],
    [-0.08, 0.65, 0.54, 0.035],
    [-0.36, 1.1, 0.035, 0.9],
    [0.2, 1.1, 0.035, 0.9]
  ]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), windowFrameMaterial);
    frame.position.set(x, y, -0.318);
    group.add(frame);
  }

  const glare = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.78, 0.012), new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.22 }));
  glare.position.set(-0.25, 1.12, -0.333);
  glare.rotation.z = -0.28;
  group.add(glare);

  const shelfMaterial = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.55 });
  const productColors = productIds.length > 0
    ? productIds.map((productId) => productCrateColors[productId] ?? color)
    : ["#ef4444", "#22c55e", "#f59e0b", "#38bdf8", "#e879f9", "#f8fafc"];
  const visibleProducts = Math.ceil(THREE.MathUtils.clamp(stockRatio, 0, 1) * 12);
  for (let row = 0; row < 3; row += 1) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.03), shelfMaterial);
    shelf.position.set(-0.08, 0.84 + row * 0.22, -0.3);
    group.add(shelf);

    for (let col = 0; col < 4; col += 1) {
      const productIndex = row * 4 + col;
      const filled = productIndex < visibleProducts;
      const productMaterial = new THREE.MeshStandardMaterial({
        color: filled ? productColors[(row * 2 + col) % productColors.length] : "#172033",
        roughness: 0.46,
        metalness: filled && col % 2 !== 0 ? 0.18 : 0.04,
        transparent: true,
        opacity: filled ? 1 : 0.22
      });
      const product = col % 2 === 0
        ? new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.115, 0.04), productMaterial)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 12), productMaterial);
      product.position.set(-0.245 + col * 0.11, 0.91 + row * 0.22, -0.312);
      if (col % 2 !== 0) {
        product.rotation.z = 0.02;
      }
      group.add(product);

      const productLabel = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.022, 0.006), new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: filled ? 0.72 : 0.08 }));
      productLabel.position.set(product.position.x, product.position.y + 0.012, -0.342);
      group.add(productLabel);

      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 16), new THREE.MeshBasicMaterial({ color: filled ? "#cbd5e1" : "#334155", transparent: true, opacity: filled ? 1 : 0.34 }));
      coil.position.set(product.position.x, product.position.y - 0.085, -0.326);
      coil.scale.y = 0.45;
      group.add(coil);
    }
  }

  const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.82, 0.035), darkMaterial);
  sidePanel.position.set(0.26, 1.1, -0.278);
  group.add(sidePanel);

  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.11, 0.023),
    new THREE.MeshBasicMaterial({ map: createMachineDisplayTexture(damage) })
  );
  display.position.set(0.26, 1.36, -0.304);
  group.add(display);

  const tapRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 8, 22), new THREE.MeshBasicMaterial({ color: damage > 75 ? "#fb7185" : "#5eead4" }));
  tapRing.position.set(0.26, 1.245, -0.317);
  tapRing.rotation.x = Math.PI / 2;
  group.add(tapRing);

  const billSlot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.022), new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.28, metalness: 0.42 }));
  billSlot.position.set(0.26, 1.02, -0.314);
  group.add(billSlot);

  const coinReturn = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.015, 16), new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.34, metalness: 0.55 }));
  coinReturn.position.set(0.32, 0.93, -0.314);
  coinReturn.rotation.x = Math.PI / 2;
  group.add(coinReturn);

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.024, 0.018), new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.32 }));
      key.position.set(0.215 + col * 0.045, 1.16 - row * 0.045, -0.306);
      group.add(key);
    }
  }

  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.11, 0.04),
    darkMaterial
  );
  slot.position.set(-0.08, 0.39, -0.294);
  group.add(slot);

  const pickupDoor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.018), new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.36, metalness: 0.32 }));
  pickupDoor.position.set(-0.08, 0.38, -0.325);
  group.add(pickupDoor);

  const dropLight = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: "#facc15" }));
  dropLight.position.set(-0.08, 0.46, -0.318);
  group.add(dropLight);

  const pickupLip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.12), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.34, metalness: 0.22 }));
  pickupLip.position.set(-0.08, 0.31, -0.34);
  group.add(pickupLip);

  for (const y of [0.62, 0.95, 1.28]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 10), new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.36, metalness: 0.55 }));
    hinge.position.set(0.405, y, -0.285);
    hinge.rotation.x = Math.PI / 2;
    group.add(hinge);
  }

  for (let i = 0; i < 5; i += 1) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.018), new THREE.MeshBasicMaterial({ color: "#020617" }));
    vent.position.set(-0.405, 0.72 + i * 0.11, -0.05);
    group.add(vent);
  }

  for (const x of [-0.28, 0.28]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.08, 12), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.54, metalness: 0.14 }));
    foot.position.set(x, 0.04, -0.17);
    foot.castShadow = true;
    group.add(foot);
  }

  const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.42, 0.03), new THREE.MeshBasicMaterial({ color }));
  sideStripe.position.set(-0.355, 0.98, -0.285);
  group.add(sideStripe);

  const brandPuck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.018, 22), new THREE.MeshBasicMaterial({ color }));
  brandPuck.position.set(-0.33, 1.67, -0.326);
  brandPuck.rotation.x = Math.PI / 2;
  group.add(brandPuck);

  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.36, 0.18, 0.18),
    new THREE.Vector3(0.48, 0.13, 0.24),
    new THREE.Vector3(0.56, 0.09, 0.32)
  ]);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 12, 0.012, 6),
    new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.58, metalness: 0.12 })
  );
  group.add(cable);

  if (upgrades.has("reinforced_glass")) {
    const railMaterial = new THREE.MeshStandardMaterial({ color: "#bae6fd", roughness: 0.22, metalness: 0.45 });
    const rails = [
      { x: -0.31, y: 1.1, width: 0.035, height: 0.9 },
      { x: 0.15, y: 1.1, width: 0.035, height: 0.9 },
      { x: -0.08, y: 1.55, width: 0.5, height: 0.035 },
      { x: -0.08, y: 0.65, width: 0.5, height: 0.035 }
    ];
    for (const rail of rails) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(rail.width, rail.height, 0.035), railMaterial);
      mesh.position.set(rail.x, rail.y, -0.326);
      group.add(mesh);
    }
  }

  if (upgrades.has("smart_lock")) {
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.12, 0.032), new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.26, metalness: 0.5 }));
    lock.position.set(0.27, 0.92, -0.323);
    group.add(lock);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 18, Math.PI), new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.28, metalness: 0.65 }));
    shackle.position.set(0.27, 1.0, -0.324);
    shackle.rotation.z = Math.PI;
    group.add(shackle);
  }

  if (upgrades.has("security_camera")) {
    const cameraMount = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.38, metalness: 0.2 }));
    cameraMount.position.set(0.29, 1.88, -0.12);
    group.add(cameraMount);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.08, 16), new THREE.MeshBasicMaterial({ color: "#38bdf8" }));
    lens.position.set(0.29, 1.88, -0.205);
    lens.rotation.x = Math.PI / 2;
    group.add(lens);
  }

  if (upgrades.has("cashless_terminal")) {
    const reader = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.03), new THREE.MeshBasicMaterial({ color: "#22c55e" }));
    reader.position.set(0.26, 0.78, -0.324);
    group.add(reader);
    const readerLine = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.018, 0.032), new THREE.MeshBasicMaterial({ color: "#052e16" }));
    readerLine.position.set(0.26, 0.81, -0.343);
    group.add(readerLine);
  }

  if (upgrades.has("neon_sign")) {
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.018, 8, 56), new THREE.MeshBasicMaterial({ color }));
    glow.position.set(0, 1.73, -0.314);
    glow.scale.y = 0.22;
    group.add(glow);
    const light = new THREE.PointLight(color, 0.7, 3);
    light.position.set(0, 1.55, -0.45);
    group.add(light);
  }

  if (upgrades.has("remote_monitor")) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.28, metalness: 0.5 }));
    mast.position.set(-0.28, 1.98, 0);
    group.add(mast);
    const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: "#60a5fa" }));
    antenna.position.set(-0.28, 2.16, 0);
    group.add(antenna);
  }

  if (quality === "high") {
    const servicePanel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.028), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.42, metalness: 0.24 }));
    servicePanel.position.set(0.43, 1.0, 0.02);
    servicePanel.rotation.y = Math.PI / 2;
    group.add(servicePanel);

    for (let i = 0; i < 6; i += 1) {
      const sideVent = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.018), new THREE.MeshBasicMaterial({ color: "#020617" }));
      sideVent.position.set(0.43, 0.62 + i * 0.1, -0.1);
      sideVent.rotation.y = Math.PI / 2;
      group.add(sideVent);
    }

    const qrPlate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.018), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
    qrPlate.position.set(0.26, 0.65, -0.326);
    group.add(qrPlate);
    for (const [x, y] of [[0.235, 0.675], [0.285, 0.675], [0.235, 0.625], [0.275, 0.635]] as Array<[number, number]>) {
      const qrMark = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.006), new THREE.MeshBasicMaterial({ color: "#020617" }));
      qrMark.position.set(x, y, -0.338);
      group.add(qrMark);
    }

    const roofUnit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.24), new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.5, metalness: 0.2 }));
    roofUnit.position.set(0.14, 1.9, 0.04);
    roofUnit.castShadow = true;
    group.add(roofUnit);
  }

  if (damage > 15) {
    const dent = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 + damage / 340, 0.05, 0.04),
      new THREE.MeshStandardMaterial({ color: "#fbbf24", emissive: "#92400e", emissiveIntensity: 0.25 })
    );
    dent.position.set(0.16, 1.47, -0.315);
    dent.rotation.z = -0.4;
    group.add(dent);

    const crackMaterial = new THREE.LineBasicMaterial({ color: "#020617", transparent: true, opacity: 0.75 });
    const points = [
      new THREE.Vector3(-0.18, 1.24, -0.326),
      new THREE.Vector3(-0.1, 1.16, -0.326),
      new THREE.Vector3(-0.15, 1.02, -0.326),
      new THREE.Vector3(-0.02, 0.92, -0.326)
    ];
    const crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), crackMaterial);
    group.add(crack);

    const cautionMaterial = new THREE.MeshBasicMaterial({ color: "#facc15" });
    for (let index = 0; index < 3; index += 1) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.026, 0.012), cautionMaterial);
      tape.position.set(-0.21 + index * 0.12, 0.58 + index * 0.07, -0.338);
      tape.rotation.z = index % 2 === 0 ? -0.22 : 0.18;
      group.add(tape);
    }
  }

  return group;
}

function createDistrictTintOverlay(currentState: GameState): THREE.Group {
  const group = new THREE.Group();

  for (const district of Object.values(currentState.districts)) {
    const profile = districtVisualProfiles[district.id] ?? districtVisualProfiles.starter_suburb;
    const width = district.bounds.maxX - district.bounds.minX;
    const depth = district.bounds.maxZ - district.bounds.minZ;
    const centerX = (district.bounds.minX + district.bounds.maxX) / 2;
    const centerZ = (district.bounds.minZ + district.bounds.maxZ) / 2;
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({
        color: profile.accentColor,
        transparent: true,
        opacity: 0.045,
        depthWrite: false
      })
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(centerX, 0.012, centerZ);
    group.add(fill);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: profile.accentColor,
      transparent: true,
      opacity: 0.24
    });
    const y = 0.13;
    const points = [
      new THREE.Vector3(district.bounds.minX, y, district.bounds.minZ),
      new THREE.Vector3(district.bounds.maxX, y, district.bounds.minZ),
      new THREE.Vector3(district.bounds.maxX, y, district.bounds.maxZ),
      new THREE.Vector3(district.bounds.minX, y, district.bounds.maxZ),
      new THREE.Vector3(district.bounds.minX, y, district.bounds.minZ)
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), edgeMaterial));
  }

  return group;
}

// A solid wall ringing the whole map at worldBounds. The player is already
// clamped to worldBounds (clampToWorld), so this is the visible boundary that
// caps the edge instead of leaving the player staring into the void.
function createPerimeterWalls(): THREE.Group {
  const group = new THREE.Group();
  const height = 8.5;
  const thickness = 1.8;
  const capHeight = 0.45;

  // Lit concrete body (a faint emissive keeps it from going pure-black at the
  // unlit map edge), a lighter coping, and an unlit neon trim along the inner top
  // so the boundary clearly reads as a built wall rather than the void.
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#27324c",
    roughness: 0.86,
    metalness: 0.18,
    emissive: "#0d1626",
    emissiveIntensity: 0.55
  });
  const capMaterial = new THREE.MeshStandardMaterial({
    color: "#3a4768",
    roughness: 0.5,
    metalness: 0.34,
    emissive: "#1e293b",
    emissiveIntensity: 0.4
  });
  const trimMaterial = new THREE.MeshBasicMaterial({ color: "#38bdf8" });

  // innerNormal points from the wall toward the city interior (along the wall's
  // perpendicular axis), so the neon trim sits on the inward-facing side.
  const addWall = (centerX: number, centerZ: number, length: number, horizontal: boolean, innerNormal: number) => {
    const wallWidth = horizontal ? length : thickness;
    const wallDepth = horizontal ? thickness : length;

    const body = new THREE.Mesh(new THREE.BoxGeometry(wallWidth, height, wallDepth), bodyMaterial);
    body.position.set(centerX, height / 2, centerZ);
    body.receiveShadow = true;
    group.add(body);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(wallWidth + 0.3, capHeight, wallDepth + 0.3), capMaterial);
    cap.position.set(centerX, height + capHeight / 2, centerZ);
    group.add(cap);

    const inset = thickness / 2 + 0.07;
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? length : 0.14, 0.2, horizontal ? 0.14 : length),
      trimMaterial
    );
    trim.position.set(
      horizontal ? centerX : centerX + innerNormal * inset,
      height - 0.85,
      horizontal ? centerZ + innerNormal * inset : centerZ
    );
    group.add(trim);
  };

  // Inner faces land exactly on worldBounds. North/South span the full width plus
  // both corners; East/West fill the remaining depth between them — no gaps.
  const t = thickness;
  addWall(worldCenterX, worldBounds.minZ - t / 2, worldWidth + 2 * t, true, 1); // north (interior is +z)
  addWall(worldCenterX, worldBounds.maxZ + t / 2, worldWidth + 2 * t, true, -1); // south (interior is -z)
  addWall(worldBounds.minX - t / 2, worldCenterZ, worldDepth, false, 1); // west (interior is +x)
  addWall(worldBounds.maxX + t / 2, worldCenterZ, worldDepth, false, -1); // east (interior is -x)

  return group;
}

function createMachinePlacementDressing(placement: { position: THREE.Vector3; rotationY: number }, color: string, occupied: boolean): THREE.Group {
  const group = new THREE.Group();
  const padMaterial = new THREE.MeshStandardMaterial({ color: occupied ? "#253142" : "#2d3748", roughness: 0.86, metalness: 0.03 });
  const trimMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: occupied ? 0.78 : 0.46 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.56, metalness: 0.14 });

  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.035, 1.18), padMaterial);
  pad.position.set(0, 0.03, -0.08);
  pad.receiveShadow = true;
  group.add(pad);

  for (const z of [-0.66, 0.48]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.012, 0.035), trimMaterial);
    stripe.position.set(0, 0.062, z);
    group.add(stripe);
  }

  const serviceArc = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.012, 6, 42, Math.PI),
    trimMaterial
  );
  serviceArc.position.set(0, 0.075, -0.62);
  serviceArc.rotation.x = Math.PI / 2;
  serviceArc.rotation.z = Math.PI;
  group.add(serviceArc);

  for (const x of [-0.66, 0.66]) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 12), darkMaterial);
    bollard.position.set(x, 0.25, -0.56);
    bollard.castShadow = true;
    group.add(bollard);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 6), trimMaterial);
    cap.position.set(x, 0.52, -0.56);
    group.add(cap);
  }

  if (!occupied) {
    const ghostPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.018, 0.5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 })
    );
    ghostPlate.position.set(0, 0.08, 0.01);
    group.add(ghostPlate);
  }

  group.position.copy(placement.position);
  group.rotation.y = placement.rotationY;
  return group;
}

export function createStockCrateMesh(productId: ProductId, quantity: number, compact = false, modelConfig?: ModelConfig): THREE.Group {
  const color = productCrateColors[productId] ?? "#94a3b8";
  const group = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(compact ? 0.34 : 0.58, compact ? 0.24 : 0.36, compact ? 0.28 : 0.42),
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04 })
  );
  crate.castShadow = true;
  crate.receiveShadow = true;
  group.add(crate);

  const strapMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.48, metalness: 0.08 });
  const strapA = new THREE.Mesh(new THREE.BoxGeometry(compact ? 0.36 : 0.62, compact ? 0.035 : 0.045, compact ? 0.29 : 0.44), strapMaterial);
  strapA.position.y = compact ? 0.02 : 0.03;
  group.add(strapA);

  const strapB = new THREE.Mesh(new THREE.BoxGeometry(compact ? 0.04 : 0.055, compact ? 0.25 : 0.37, compact ? 0.3 : 0.45), strapMaterial);
  group.add(strapB);

  const countBars = Math.max(1, Math.min(4, Math.ceil(quantity / 4)));
  for (let index = 0; index < countBars; index += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.018), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
    bar.position.set(-0.12 + index * 0.08, compact ? 0.135 : 0.205, compact ? -0.151 : -0.226);
    group.add(bar);
  }

  if (modelConfig) {
    applyModelTransformById(group, modelConfig, "stock.crate");
  }

  return group;
}

function createCrateStack(productIds: ProductId[], modelConfig?: ModelConfig): THREE.Group {
  const group = new THREE.Group();
  productIds.slice(0, 5).forEach((productId, index) => {
    const crate = createStockCrateMesh(productId, 6, false, modelConfig);
    crate.position.set((index % 3) * 0.46 - 0.46, 0.22 + Math.floor(index / 3) * 0.34, Math.floor(index / 3) * 0.18);
    crate.rotation.y = (index % 2 === 0 ? 0.08 : -0.1);
    group.add(crate);
  });
  return group;
}

function createStorageBay(productIds: ProductId[], modelConfig?: ModelConfig): THREE.Group {
  const group = new THREE.Group();
  const floorMaterial = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.82, metalness: 0.03 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.55, metalness: 0.18 });
  const accentMaterial = new THREE.MeshBasicMaterial({ color: "#38bdf8" });

  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 0.86), floorMaterial);
  platform.position.set(0, 0.04, 0);
  platform.receiveShadow = true;
  group.add(platform);

  const backRail = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.52, 0.08), railMaterial);
  backRail.position.set(0, 0.34, 0.43);
  backRail.castShadow = true;
  group.add(backRail);

  for (const x of [-0.65, 0.65]) {
    const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.74), railMaterial);
    sideRail.position.set(x, 0.28, 0.02);
    sideRail.castShadow = true;
    group.add(sideRail);
  }

  for (const x of [-0.33, 0.33]) {
    const floorStripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.76), accentMaterial);
    floorStripe.position.set(x, 0.092, -0.01);
    group.add(floorStripe);
  }

  const stack = createCrateStack(productIds, modelConfig);
  stack.position.set(0, 0.08, -0.08);
  stack.scale.setScalar(0.78);
  group.add(stack);

  return group;
}

function createRoutePressureRing(tone: "good" | "warning" | "danger"): THREE.Group {
  const color = tone === "danger" ? "#fb7185" : tone === "warning" ? "#fbbf24" : "#86efac";
  const group = new THREE.Group();
  group.userData.routePressure = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.018, 8, 44), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 }));
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 3), new THREE.MeshBasicMaterial({ color }));
  marker.position.y = 0.46;
  marker.rotation.y = Math.PI;
  group.add(marker);
  return group;
}

export function createVehicleMesh(quality: GraphicsQuality = "medium"): THREE.Group {
  const group = new THREE.Group();
  // Glossy automotive clearcoat: low clearcoatRoughness + envMapIntensity makes the
  // night-city environment map read as a wet, reflective paint job instead of flat plastic.
  const paintMaterial = new THREE.MeshPhysicalMaterial({ color: "#d9f99d", roughness: 0.3, metalness: 0.16, clearcoat: 0.75, clearcoatRoughness: 0.18, envMapIntensity: 1.3 });
  const panelMaterial = new THREE.MeshPhysicalMaterial({ color: "#bef264", roughness: 0.36, metalness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.22, envMapIntensity: 1.2 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.34, metalness: 0.45, envMapIntensity: 1.1 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.68, metalness: 0.08 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.2, metalness: 0.88, envMapIntensity: 1.5 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: "#93c5fd", roughness: 0.02, metalness: 0.02, transparent: true, opacity: 0.58, transmission: 0.12, envMapIntensity: 1.6 });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: "#fff3c4", transparent: true, opacity: 1 });
  const tailLightMaterial = new THREE.MeshBasicMaterial({ color: "#ff4d4d", transparent: true, opacity: 0.95 });
  const decalMaterial = new THREE.MeshBasicMaterial({ map: createVehicleDecalTexture("VEND-X", "#d9f99d", "#2dd4bf") });
  const markerMaterial = new THREE.MeshBasicMaterial({ color: "#fb923c", transparent: true, opacity: 0.86 });
  const plateMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc" });
  const { bodyHeight, length, width } = WORLD_SCALE.vehicle;
  const wheelRadius = 0.36;
  const baseY = wheelRadius + 0.2;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(length * 0.9, 0.18, width * 0.82), trimMaterial);
  chassis.position.y = baseY;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  const lowerValance = new THREE.Mesh(new THREE.BoxGeometry(length * 0.86, 0.16, width * 0.9), trimMaterial);
  lowerValance.position.set(-length * 0.01, baseY + 0.08, 0);
  lowerValance.castShadow = true;
  lowerValance.receiveShadow = true;
  group.add(lowerValance);

  const cargoBody = new THREE.Mesh(roundedBox(length * 0.48, bodyHeight * 1.08, width * 0.92, 0.08, quality), paintMaterial);
  cargoBody.position.set(length * 0.18, baseY + bodyHeight * 0.58, 0);
  cargoBody.castShadow = true;
  cargoBody.receiveShadow = true;
  group.add(cargoBody);

  const cargoRoofCap = new THREE.Mesh(roundedBox(length * 0.5, 0.12, width * 0.96, 0.05, quality), panelMaterial);
  cargoRoofCap.position.set(length * 0.18, baseY + bodyHeight * 1.16, 0);
  cargoRoofCap.castShadow = true;
  group.add(cargoRoofCap);

  const hood = new THREE.Mesh(roundedBox(length * 0.22, bodyHeight * 0.42, width * 0.78, 0.09, quality), paintMaterial);
  hood.position.set(-length * 0.34, baseY + bodyHeight * 0.42, 0);
  hood.castShadow = true;
  hood.receiveShadow = true;
  group.add(hood);

  const cab = new THREE.Mesh(roundedBox(length * 0.26, bodyHeight * 0.9, width * 0.82, 0.11, quality), panelMaterial);
  cab.position.set(-length * 0.17, baseY + bodyHeight * 0.82, 0);
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);

  const roof = new THREE.Mesh(roundedBox(length * 0.24, 0.12, width * 0.74, 0.04, quality), paintMaterial);
  roof.position.set(-length * 0.17, baseY + bodyHeight * 1.32, 0);
  roof.castShadow = true;
  group.add(roof);

  const frontBumper = new THREE.Mesh(roundedBox(0.16, 0.18, width * 0.82, 0.035, quality), trimMaterial);
  frontBumper.position.set(-length / 2 - 0.02, baseY + 0.18, 0);
  frontBumper.castShadow = true;
  group.add(frontBumper);

  const rearBumper = new THREE.Mesh(roundedBox(0.14, 0.18, width * 0.84, 0.035, quality), trimMaterial);
  rearBumper.position.set(length / 2 - 0.02, baseY + 0.18, 0);
  rearBumper.castShadow = true;
  group.add(rearBumper);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.5, width * 0.56), glassMaterial);
  windshield.position.set(-length * 0.31, baseY + bodyHeight * 0.96, 0);
  windshield.rotation.z = -0.18;

  const windshieldFrame = new THREE.Group();
  windshieldFrame.position.set(-length * 0.315, baseY + bodyHeight * 0.96, 0);
  windshieldFrame.rotation.z = -0.18;
  for (const y of [-0.27, 0.27]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.035, width * 0.64), trimMaterial);
    bar.position.y = y;
    windshieldFrame.add(bar);
  }
  for (const z of [-width * 0.31, width * 0.31]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.54, 0.034), trimMaterial);
    pillar.position.z = z;
    windshieldFrame.add(pillar);
  }
  group.add(windshieldFrame);
  group.add(windshield);

  const driver = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.62 }));
  driver.position.set(-length * 0.13, baseY + bodyHeight * 0.92, -width * 0.12);
  driver.castShadow = true;
  group.add(driver);

  for (const z of [-1, 1]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(length * 0.17, 0.36, 0.035), glassMaterial);
    sideWindow.position.set(-length * 0.14, baseY + bodyHeight * 0.99, z * (width / 2 + 0.022));

    const windowFrame = new THREE.Group();
    windowFrame.position.set(-length * 0.14, baseY + bodyHeight * 0.99, z * (width / 2 + 0.015));
    for (const y of [-0.205, 0.205]) {
      const frameBar = new THREE.Mesh(new THREE.BoxGeometry(length * 0.2, 0.026, 0.028), trimMaterial);
      frameBar.position.y = y;
      windowFrame.add(frameBar);
    }
    for (const x of [-length * 0.095, length * 0.095]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.41, 0.028), trimMaterial);
      pillar.position.x = x;
      windowFrame.add(pillar);
    }
    group.add(windowFrame);
    group.add(sideWindow);

    const cargoPanel = new THREE.Mesh(new THREE.BoxGeometry(length * 0.31, 0.52, 0.028), decalMaterial);
    cargoPanel.position.set(length * 0.2, baseY + bodyHeight * 0.58, z * (width / 2 + 0.024));
    group.add(cargoPanel);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(length * 0.74, 0.105, 0.035), new THREE.MeshBasicMaterial({ color: "#2dd4bf" }));
    stripe.position.set(0.04, baseY + bodyHeight * 0.45, z * (width / 2 + 0.032));
    group.add(stripe);

    const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.025, bodyHeight * 0.78, 0.02), trimMaterial);
    doorSeam.position.set(-length * 0.01, baseY + bodyHeight * 0.62, z * (width / 2 + 0.044));
    group.add(doorSeam);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.028), trimMaterial);
    handle.position.set(-length * 0.08, baseY + bodyHeight * 0.72, z * (width / 2 + 0.052));
    group.add(handle);

    const sideStep = new THREE.Mesh(new THREE.BoxGeometry(length * 0.34, 0.055, 0.08), trimMaterial);
    sideStep.position.set(-length * 0.1, baseY + 0.12, z * (width / 2 + 0.13));
    group.add(sideStep);

    for (const x of [-length * 0.39, length * 0.4]) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.018), markerMaterial);
      marker.position.set(x, baseY + bodyHeight * 0.48, z * (width / 2 + 0.052));
      group.add(marker);
    }
  }

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, width * 0.44), trimMaterial);
  grille.position.set(-length / 2 - 0.035, baseY + 0.3, 0);
  group.add(grille);

  for (let i = 0; i < 4; i += 1) {
    const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.018, width * 0.44), new THREE.MeshBasicMaterial({ color: "#94a3b8" }));
    grilleBar.position.set(-length / 2 - 0.058, baseY + 0.22 + i * 0.055, 0);
    group.add(grilleBar);
  }

  const rearDoor = new THREE.Mesh(new THREE.BoxGeometry(0.035, bodyHeight * 0.76, width * 0.68), panelMaterial);
  rearDoor.position.set(length * 0.43, baseY + bodyHeight * 0.58, 0);
  group.add(rearDoor);

  const rearDoorSplit = new THREE.Mesh(new THREE.BoxGeometry(0.04, bodyHeight * 0.72, 0.025), trimMaterial);
  rearDoorSplit.position.set(length * 0.455, baseY + bodyHeight * 0.58, 0);
  group.add(rearDoorSplit);
  for (const z of [-width * 0.32, width * 0.32]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 10), trimMaterial);
    hinge.position.set(length * 0.463, baseY + bodyHeight * 0.78, z);
    hinge.rotation.x = Math.PI / 2;
    group.add(hinge);
  }

  const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.28), plateMaterial);
  frontPlate.position.set(-length / 2 - 0.083, baseY + 0.17, 0);
  group.add(frontPlate);
  const rearPlate = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.28), plateMaterial);
  rearPlate.position.set(length / 2 + 0.04, baseY + 0.22, 0);
  group.add(rearPlate);

  if (quality !== "low") {
    const mirrorMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.4, metalness: 0.16 });
    for (const z of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.045), mirrorMaterial);
      mirror.position.set(-length * 0.32, baseY + bodyHeight * 0.94, z * (width / 2 + 0.12));
      group.add(mirror);
    }
  }

  if (quality === "high") {
    const roofRack = new THREE.Group();
    roofRack.position.set(length * 0.12, baseY + bodyHeight * 1.18, 0);
    for (const z of [-width * 0.28, width * 0.28]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length * 0.38, 0.04, 0.04), trimMaterial);
      rail.position.set(0, 0.35, z);
      roofRack.add(rail);
    }
    for (const x of [-length * 0.14, length * 0.14]) {
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, width * 0.62), trimMaterial);
      crossbar.position.set(x, 0.35, 0);
      roofRack.add(crossbar);
    }
    group.add(roofRack);

    const amberBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.08, 18), new THREE.MeshBasicMaterial({ color: "#f59e0b", transparent: true, opacity: 0.9 }));
    amberBeacon.position.set(-length * 0.16, baseY + bodyHeight * 1.45, 0);
    group.add(amberBeacon);

    const ladder = new THREE.Group();
    ladder.position.set(length * 0.45, baseY + bodyHeight * 0.8, -width * 0.48);
    ladder.rotation.x = Math.PI / 2;
    for (const x of [-0.08, 0.08]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.62, 0.025), trimMaterial);
      rail.position.x = x;
      ladder.add(rail);
    }
    for (let i = 0; i < 4; i += 1) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.025), trimMaterial);
      rung.position.y = -0.24 + i * 0.16;
      ladder.add(rung);
    }
    group.add(ladder);

    for (let i = 0; i < 4; i += 1) {
      const roofVent = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, width * 0.32), trimMaterial);
      roofVent.position.set(length * 0.08 + i * 0.12, baseY + bodyHeight * 1.25, 0);
      group.add(roofVent);
    }
  }

  for (const x of [-length * 0.32, length * 0.3]) {
    for (const z of [-width / 2 - 0.045, width / 2 + 0.045]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.2, quality === "low" ? 12 : 24), tireMaterial);
      wheel.position.set(x, wheelRadius, z);
      wheel.rotation.x = Math.PI / 2;
      wheel.castShadow = true;
      group.add(wheel);

      if (quality !== "low") {
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.46, wheelRadius * 0.46, 0.214, 16), hubMaterial);
        hub.position.copy(wheel.position);
        hub.rotation.x = Math.PI / 2;
        group.add(hub);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 0.48, 0.018, 8, 24), hubMaterial);
        rim.position.copy(wheel.position);
        group.add(rim);

        for (let spokeIndex = 0; spokeIndex < 5; spokeIndex += 1) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelRadius * 0.72, 0.024, 0.018), hubMaterial);
          spoke.position.copy(wheel.position);
          spoke.rotation.z = spokeIndex * Math.PI / 5;
          group.add(spoke);
        }

        const wheelArch = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 1.12, 0.032, 8, 22, Math.PI), trimMaterial);
        wheelArch.position.set(x, wheelRadius + 0.15, z);
        wheelArch.rotation.z = Math.PI;
        group.add(wheelArch);
      }
    }
  }

  for (const z of [-width * 0.25, width * 0.25]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.2), lightMaterial);
    light.position.set(-length / 2 - 0.055, baseY + 0.32, z);
    group.add(light);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.16), tailLightMaterial);
    tail.position.set(length * 0.45, baseY + 0.42, z);
    group.add(tail);
  }

  // Grounding blob shadow (van length runs along X, width along Z).
  group.add(createContactShadow(length * 1.5, width * 1.7, 0.5));

  return group;
}

function addMarker(color: string): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.06, 28),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18 })
  );
  marker.position.y = 0.035;
  marker.receiveShadow = true;
  return marker;
}

function createLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(15, 23, 42, 0.78)";
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.roundRect(12, 18, 488, 74, 14);
    context.fill();
    context.stroke();
    context.fillStyle = "#f8fafc";
    context.font = "700 34px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 256, 55, 446);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true
    })
  );
  sprite.scale.set(1.15, 0.29, 1);
  return sprite;
}

function addLabel(group: THREE.Object3D, text: string, color: string, position: THREE.Vector3, height: number): void {
  const label = createLabelSprite(text, color);
  label.position.set(position.x, height, position.z);
  group.add(label);
}

function colorForTone(tone: GameEventTone): string {
  if (tone === "good") {
    return "#22c55e";
  }

  if (tone === "warning") {
    return "#f59e0b";
  }

  if (tone === "danger") {
    return "#fb7185";
  }

  return "#38bdf8";
}

function activityLabel(activity: StreetActivity): string {
  if (activity.kind === "customer_purchase" || activity.kind === "machine_sale") {
    return activity.amount ? `SALE +$${Math.round(activity.amount)}` : "SALE";
  }

  if (activity.kind === "customer_complaint") {
    return "COMPLAINT";
  }

  if (activity.kind === "customer_walkaway") {
    return "WALKAWAY";
  }

  if (activity.kind === "customer_tipoff") {
    return "TIPOFF";
  }

  if (activity.kind === "rival_scout") {
    return "RIVAL";
  }

  return activity.amount ? `RESTOCK ${activity.amount}` : "RESTOCK";
}

function createActivityBubble(activity: StreetActivity): THREE.Sprite {
  const color = colorForTone(activity.tone);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(15, 23, 42, 0.88)";
    context.strokeStyle = color;
    context.lineWidth = 6;
    context.roundRect(38, 28, 436, 78, 18);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(246, 106);
    context.lineTo(266, 106);
    context.lineTo(256, 132);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "#f8fafc";
    context.font = "900 34px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(activityLabel(activity), 256, 68, 390);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }));
  sprite.scale.set(1.05, 0.33, 1);
  sprite.userData.activityBubble = true;
  return sprite;
}

function createActivityPulse(activity: StreetActivity): THREE.Group {
  const color = colorForTone(activity.tone);
  const group = new THREE.Group();
  group.userData.activityPulse = true;
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.018, 8, 36), material);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);

  if (activity.kind === "customer_purchase" || activity.kind === "machine_sale") {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 16), new THREE.MeshBasicMaterial({ color: "#facc15" }));
    coin.position.set(0.22, 0.72, -0.12);
    coin.rotation.x = Math.PI / 2;
    group.add(coin);
  }

  if (activity.kind === "worker_supply") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: "#92400e", roughness: 0.7 }));
    crate.position.set(-0.22, 0.62, -0.1);
    crate.castShadow = true;
    group.add(crate);
  }

  if (activity.kind === "rival_scout") {
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 3), new THREE.MeshBasicMaterial({ color }));
    marker.position.y = 0.68;
    marker.rotation.y = Math.PI;
    group.add(marker);
  }

  if (activity.kind === "customer_walkaway" || activity.kind === "customer_tipoff") {
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 16), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    marker.position.set(0, 0.72, -0.16);
    marker.rotation.x = Math.PI / 2;
    group.add(marker);
  }

  return group;
}

function activityActorVariant(activity: StreetActivity): "customer" | "rival" | "scout" | "worker" {
  if (activity.actor === "worker" || activity.actor === "employee") {
    return "worker";
  }

  if (activity.actor === "scout" || activity.kind === "rival_scout") {
    return "scout";
  }

  if (activity.actor === "rival") {
    return "rival";
  }

  return "customer";
}

function createActivityActor(
  activity: StreetActivity,
  placement: { position: THREE.Vector3; rotationY: number },
  servicePoint: THREE.Vector3,
  currentWorldTime: number,
  quality: GraphicsQuality,
  modelConfig: ModelConfig,
  laneIndex = 0
): THREE.Group {
  const variant = activityActorVariant(activity);
  const character = createNpcCharacter(variant, quality);
  const front = machineFrontVector(placement.rotationY).normalize();
  const side = new THREE.Vector3(-front.z, 0, front.x);
  const sideDirection = activity.id.charCodeAt(activity.id.length - 1) % 2 === 0 ? 1 : -1;
  const laneOffset = ((laneIndex % 3) - 1) * 0.38;
  const approach = servicePoint.clone().add(front.clone().multiplyScalar(1.95 + (laneIndex % 2) * 0.34));
  const start = approach.clone().add(side.clone().multiplyScalar((1.95 + laneIndex * 0.16) * sideDirection));
  const stopDistance = activity.kind === "rival_scout" ? 1.35 : 0.95;
  const stop = servicePoint
    .clone()
    .add(front.clone().multiplyScalar(stopDistance))
    .add(side.clone().multiplyScalar((0.52 + Math.abs(laneOffset)) * sideDirection));
  const exit = approach.clone().add(side.clone().multiplyScalar((-2.15 - laneIndex * 0.12) * sideDirection)).add(front.clone().multiplyScalar(0.7));

  character.position.copy(start);
  character.scale.setScalar(activity.kind === "customer_complaint" || activity.kind === "customer_tipoff" ? 1.02 : 0.96);
  character.userData.action = activity.kind === "worker_supply" ? "carry" : activity.kind === "rival_scout" || activity.kind === "customer_tipoff" ? "scan" : "walk";
  character.userData.baseY = 0;
  character.userData.dynamicNpc = true;
  character.userData.floatAmount = 0.006;
  character.userData.floatSpeed = 1.15;
  character.userData.pathOffset = Math.max(0, currentWorldTime - activity.hour) * 7 + activity.id.length * 0.37;
  character.userData.phase = activity.hour * 0.7 + activity.id.length;
  character.userData.walkPath = [start, stop, stop.clone().add(front.clone().multiplyScalar(0.2)), exit];
  character.userData.walkSpeed = activity.kind === "rival_scout" ? 0.26 : activity.kind === "worker_supply" ? 0.34 : 0.42;
  applyModelTransformById(character, modelConfig, unitModelId(variant));

  if (activity.kind === "customer_complaint" || activity.kind === "customer_tipoff") {
    const complaint = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({ color: "#fb7185" })
    );
    complaint.position.set(0.18, 1.55, -0.15);
    character.add(complaint);
  }

  return character;
}

function createAmbientMachineActor(machine: VendingMachine, location: Location, index: number, currentWorldTime: number, quality: GraphicsQuality, modelConfig: ModelConfig): THREE.Group {
  const variant = machine.ownerFactionId === "player" ? "customer" : "rival";
  const character = createNpcCharacter(variant, quality);
  const placement = machinePlacementForLocation(location);
  const servicePoint = machineInteractionPoint(placement);
  const front = machineFrontVector(placement.rotationY).normalize();
  const side = new THREE.Vector3(-front.z, 0, front.x);
  const sideDirection = index % 2 === 0 ? 1 : -1;
  const trafficOffset = Math.max(0.7, location.footTraffic) * 0.32;
  const customerPull = machine.ownerFactionId === "player" ? Math.min(0.28, machine.revenueStored * 0.004) : 0;
  const start = servicePoint.clone().add(front.clone().multiplyScalar(1.75 + trafficOffset)).add(side.clone().multiplyScalar((2.1 + index * 0.1) * sideDirection));
  const linger = servicePoint
    .clone()
    .add(front.clone().multiplyScalar(1.0 + trafficOffset * 0.18 - customerPull))
    .add(side.clone().multiplyScalar((0.72 + (index % 3) * 0.18) * sideDirection));
  const exit = servicePoint.clone().add(front.clone().multiplyScalar(2.05 + trafficOffset)).add(side.clone().multiplyScalar((-2.2 - index * 0.08) * sideDirection));

  character.position.copy(start);
  character.scale.setScalar(machine.ownerFactionId === "player" ? 0.92 : 0.98);
  character.userData.action = index % 3 === 0 ? "pace" : "walk";
  character.userData.baseY = 0;
  character.userData.dynamicNpc = true;
  character.userData.floatAmount = 0.005;
  character.userData.floatSpeed = machine.ownerFactionId === "player" ? 1.05 : 1.25;
  character.userData.pathOffset = currentWorldTime * 0.13 + index * 0.27 + machine.id.length * 0.05;
  character.userData.phase = index * 0.8 + machine.lastServicedHour * 0.13;
  character.userData.walkPath = [
    start,
    linger,
    linger.clone().add(front.clone().multiplyScalar(-0.08)).add(side.clone().multiplyScalar(0.18 * sideDirection)),
    linger.clone().add(side.clone().multiplyScalar(0.32 * sideDirection)),
    exit
  ];
  character.userData.walkSpeed = 0.13 + Math.min(0.15, location.footTraffic * 0.04);
  applyModelTransformById(character, modelConfig, unitModelId(variant));
  return character;
}

function employeeActorVariant(employee: Employee): "scout" | "worker" {
  return employee.role === "scout" || employee.role === "negotiator" || employee.role === "regional_manager" ? "scout" : "worker";
}

function employeeVisibleLocation(currentState: GameState, employee: Employee): Location | undefined {
  const routeLocationId = employee.routeTargetLocationId ?? employee.lastLocationId;
  if (routeLocationId && currentState.locations[routeLocationId]) {
    return currentState.locations[routeLocationId];
  }

  const assignedMachineId = employee.assignedMachineIds[0];
  const assignedMachine = assignedMachineId ? currentState.machines[assignedMachineId] : undefined;
  if (assignedMachine) {
    return currentState.locations[assignedMachine.locationId];
  }

  return currentState.locations.garage;
}

function createEmployeeRouteActor(
  employee: Employee,
  location: Location,
  currentWorldTime: number,
  quality: GraphicsQuality,
  modelConfig: ModelConfig,
  index: number
): THREE.Group {
  const variant = employeeActorVariant(employee);
  const character = createNpcCharacter(variant, quality);
  const center = new THREE.Vector3(location.position.x, 0, location.position.z);
  const phase = currentWorldTime * (0.22 + employee.speed * 0.08) + employee.employeeNumber * 0.83;
  const angle = phase + index * 0.9;
  const radius = 1 + (index % 3) * 0.28;
  const start = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  const stop = center.clone().add(new THREE.Vector3(Math.cos(angle + 0.9) * 0.72, 0, Math.sin(angle + 0.9) * 0.72));
  const exit = center.clone().add(new THREE.Vector3(Math.cos(angle + 1.7) * (radius + 0.35), 0, Math.sin(angle + 1.7) * (radius + 0.35)));

  character.position.copy(start);
  character.scale.setScalar(employee.role === "guard" ? 1.06 : employee.role === "runner" ? 0.92 : 0.98);
  character.userData.action = employee.routePhase === "idle" || employee.status === "blocked" ? "pace" : employee.routePhase === "restock" ? "carry" : "walk";
  character.userData.baseY = 0;
  character.userData.dynamicNpc = true;
  character.userData.floatAmount = 0.006;
  character.userData.floatSpeed = 1.05 + employee.speed * 0.35;
  character.userData.pathOffset = Math.max(0, currentWorldTime - employee.lastWorkedHour) * 5 + employee.employeeNumber;
  character.userData.phase = phase;
  character.userData.walkPath = [start, stop, exit];
  character.userData.walkSpeed = 0.24 + employee.speed * 0.18;
  applyModelTransformById(character, modelConfig, unitModelId(variant));

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 8),
    new THREE.MeshBasicMaterial({ color: employee.status === "blocked" ? "#f97316" : employee.role === "guard" ? "#38bdf8" : "#a3e635" })
  );
  marker.position.set(0, 1.58, -0.08);
  character.add(marker);
  return character;
}

function createAlarmIntruderActor(placement: { position: THREE.Vector3; rotationY: number }, currentWorldTime: number, startedHour: number, quality: GraphicsQuality, modelConfig: ModelConfig): THREE.Group {
  const character = createNpcCharacter("rival", quality);
  const servicePoint = machineInteractionPoint(placement);
  const front = machineFrontVector(placement.rotationY).normalize();
  const side = new THREE.Vector3(-front.z, 0, front.x);
  const left = servicePoint.clone().add(front.clone().multiplyScalar(0.38)).add(side.clone().multiplyScalar(0.42));
  const right = servicePoint.clone().add(front.clone().multiplyScalar(0.46)).add(side.clone().multiplyScalar(-0.38));

  character.position.copy(left);
  character.scale.setScalar(1.04);
  character.userData.action = "scan";
  character.userData.baseY = 0;
  character.userData.dynamicNpc = true;
  character.userData.floatAmount = 0.006;
  character.userData.floatSpeed = 1.4;
  character.userData.pathOffset = Math.max(0, currentWorldTime - startedHour) * 3.2;
  character.userData.phase = startedHour * 0.9;
  character.userData.walkPath = [left, servicePoint.clone().add(front.clone().multiplyScalar(0.3)), right, left.clone().add(front.clone().multiplyScalar(0.18))];
  character.userData.walkSpeed = 0.18;
  applyModelTransformById(character, modelConfig, "unit.rival");

  const warning = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), new THREE.MeshBasicMaterial({ color: "#fb7185" }));
  warning.position.set(0, 1.62, 0);
  character.add(warning);
  return character;
}

function renderedActivityLimit(quality: GraphicsQuality): number {
  if (quality === "low") {
    return 2;
  }

  return quality === "high" ? 5 : 4;
}

function activitySceneKey(activity: StreetActivity): string {
  return activity.machineId ?? activity.locationId;
}

function selectRenderedActivities(activities: StreetActivity[], currentWorldTime: number, quality: GraphicsQuality): StreetActivity[] {
  const maxActivities = renderedActivityLimit(quality);
  const usedSceneKeys = new Set<string>();
  const selected: StreetActivity[] = [];

  for (const activity of activities) {
    if (currentWorldTime - activity.hour > 0.9) {
      continue;
    }

    const key = activitySceneKey(activity);
    if (usedSceneKeys.has(key)) {
      continue;
    }

    usedSceneKeys.add(key);
    selected.push(activity);
    if (selected.length >= maxActivities) {
      break;
    }
  }

  return selected;
}

function sceneFeedbackText(event: SceneFeedbackEvent): string {
  if (event.kind === "pickup") {
    return event.amount ? `+${event.amount}` : "PICKUP";
  }

  if (event.kind === "store") {
    return "STORED";
  }

  if (event.kind === "stock") {
    return event.amount ? `STOCK +${event.amount}` : "STOCK";
  }

  if (event.kind === "install") {
    return "INSTALLED";
  }

  if (event.kind === "cash") {
    return event.amount ? `+$${event.amount}` : "CASH";
  }

  if (event.kind === "repair") {
    return "FIXED";
  }

  if (event.kind === "upgrade") {
    return "UPGRADE";
  }

  if (event.kind === "sabotage") {
    return "RIVAL HIT";
  }

  if (event.kind === "fight") {
    return "CLEARED";
  }

  if (event.kind === "melee") {
    return "PUSHED BACK";
  }

  if (event.kind === "escape") {
    return "ESCAPED";
  }

  if (event.kind === "lockdown") {
    return "LOCKDOWN";
  }

  if (event.kind === "scout") {
    return "SCOUTED";
  }

  if (event.kind === "district") {
    return "DISTRICT OPEN";
  }

  return "LOADED";
}

function sceneFeedbackPosition(event: SceneFeedbackEvent, currentState: GameState): THREE.Vector3 | null {
  if (event.machineId) {
    const machine = currentState.machines[event.machineId];
    const location = machine ? currentState.locations[machine.locationId] : undefined;
    if (!location) {
      return null;
    }

    return machineInteractionPoint(machinePlacementForLocation(location));
  }

  if (event.locationId) {
    const location = currentState.locations[event.locationId];
    if (!location) {
      return null;
    }

    if (location.kind === "garage") {
      return new THREE.Vector3(location.position.x - 1.02, 0.08, location.position.z + 0.34);
    }

    if (location.kind === "supplier") {
      return new THREE.Vector3(location.position.x - 0.76, 0.08, location.position.z - 0.2);
    }

    return new THREE.Vector3(location.position.x, 0.08, location.position.z);
  }

  return null;
}

function createCoinMesh(): THREE.Mesh {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.018, 18),
    new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.36, metalness: 0.45 })
  );
  coin.rotation.x = Math.PI / 2;
  coin.castShadow = true;
  return coin;
}

function createSpark(color: string): THREE.Mesh {
  const spark = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.22, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  spark.rotation.x = Math.PI / 2;
  return spark;
}

function createSceneFeedbackEffect(event: SceneFeedbackEvent, currentState: GameState, quality: GraphicsQuality): THREE.Group | null {
  const position = sceneFeedbackPosition(event, currentState);
  if (!position) {
    return null;
  }

  const color = colorForTone(event.tone ?? (event.kind === "sabotage" ? "danger" : "good"));
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData.feedbackRuntime = {
    baseScale: 1,
    createdAt: performance.now(),
    duration: event.kind === "district" ? 2400 : event.kind === "sabotage" ? 2100 : event.kind === "repair" ? 1700 : event.kind === "install" || event.kind === "scout" ? 1900 : 1450,
    kind: event.kind,
    startY: position.y
  } satisfies FeedbackRuntime;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.018, 8, 44),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  ring.userData.feedbackRing = true;
  group.add(ring);

  if (event.kind === "pickup" || event.kind === "store" || event.kind === "stock" || event.kind === "vehicle") {
    const crate = createStockCrateMesh(event.productId ?? "soda", event.amount ?? 6, true);
    crate.position.set(0, event.kind === "store" ? 0.56 : 0.72, 0);
    crate.scale.setScalar(event.kind === "stock" ? 0.72 : 0.9);
    crate.userData.feedbackCrate = true;
    group.add(crate);
  }

  if (event.kind === "install") {
    const ghost = createMachineMesh("#2dd4bf", 0, [], quality);
    ghost.position.y = 0.08;
    ghost.scale.setScalar(0.72);
    ghost.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          material.transparent = true;
          material.opacity = Math.min(material.opacity, 0.48);
          material.depthWrite = false;
        }
      }
    });
    group.add(ghost);
  }

  if (event.kind === "cash") {
    for (let index = 0; index < 6; index += 1) {
      const coin = createCoinMesh();
      const angle = (Math.PI * 2 * index) / 6;
      coin.position.set(Math.cos(angle) * 0.2, 0.5 + index * 0.035, Math.sin(angle) * 0.2);
      coin.userData.feedbackCoin = true;
      coin.userData.phase = angle;
      group.add(coin);
    }
  }

  if (event.kind === "repair") {
    const repairWash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.58, 1.55, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: "#86efac", transparent: true, opacity: 0.18, depthWrite: false })
    );
    repairWash.position.y = 0.92;
    group.add(repairWash);

    const wrenchMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.9 });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.035), wrenchMaterial);
    handle.position.set(-0.18, 1.05, 0);
    handle.rotation.z = -0.62;
    group.add(handle);

    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 20, Math.PI * 1.45), wrenchMaterial);
    jaw.position.set(0.02, 1.32, 0);
    jaw.rotation.z = 0.72;
    group.add(jaw);
  }

  if (event.kind === "sabotage") {
    const dangerCone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.38, 1.8, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: "#fb7185", transparent: true, opacity: 0.2, depthWrite: false })
    );
    dangerCone.position.y = 0.98;
    group.add(dangerCone);

    const slashMaterial = new THREE.MeshBasicMaterial({ color: "#fecdd3", transparent: true, opacity: 0.92 });
    for (let index = 0; index < 3; index += 1) {
      const angle = (Math.PI * 2 * index) / 3;
      const slash = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.96, 0.035), slashMaterial);
      slash.position.set(Math.cos(angle) * 0.36, 1.08, Math.sin(angle) * 0.36);
      slash.rotation.y = angle;
      slash.rotation.z = 0.48;
      group.add(slash);
    }
  }

  if (event.kind === "scout" || event.kind === "district") {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(event.kind === "district" ? 0.22 : 0.16, event.kind === "district" ? 0.62 : 0.42, 3.2, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: event.kind === "district" ? 0.24 : 0.17, depthWrite: false })
    );
    beam.position.y = 1.7;
    group.add(beam);
  }

  if (
    event.kind === "repair" ||
    event.kind === "upgrade" ||
    event.kind === "sabotage" ||
    event.kind === "fight" ||
    event.kind === "melee" ||
    event.kind === "escape" ||
    event.kind === "lockdown" ||
    event.kind === "district" ||
    event.kind === "scout"
  ) {
    const sparkColor =
      event.kind === "sabotage" || event.kind === "melee"
        ? "#fb7185"
        : event.kind === "fight" || event.kind === "escape"
          ? "#86efac"
          : event.kind === "upgrade" || event.kind === "district" || event.kind === "lockdown"
            ? "#38bdf8"
            : event.kind === "scout"
              ? "#f59e0b"
              : "#facc15";
    const sparkCount = event.kind === "district" || event.kind === "fight" || event.kind === "melee" || event.kind === "lockdown" ? 14 : 9;
    for (let index = 0; index < sparkCount; index += 1) {
      const spark = createSpark(sparkColor);
      const angle = (Math.PI * 2 * index) / sparkCount;
      spark.position.set(Math.cos(angle) * (event.kind === "district" ? 0.34 : 0.18), 0.74 + (index % 3) * 0.16, Math.sin(angle) * (event.kind === "district" ? 0.34 : 0.18));
      spark.rotation.z = angle;
      spark.userData.feedbackSpark = true;
      spark.userData.phase = angle;
      group.add(spark);
    }
  }

  const label = createLabelSprite(sceneFeedbackText(event), color);
  label.position.y = event.kind === "district" || event.kind === "install" ? 2.35 : event.kind === "scout" ? 1.85 : 1.35;
  label.scale.set(0.82, 0.22, 1);
  label.userData.feedbackLabel = true;
  group.add(label);

  return group;
}

// Anticipation-style overshoot: 0 -> ~1.15 -> 1. Used so feedback effects "pop"
// into existence instead of appearing at full size on frame one.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// 0 = full daylight, 1 = deep night, with smooth dawn/dusk ramps.
// Day 7-18, dusk 18-21, night 21-5, dawn 5-7.
function nightFactorForHour(hourInDay: number): number {
  const hour = ((hourInDay % 24) + 24) % 24;
  if (hour >= 7 && hour <= 18) {
    return 0;
  }
  if (hour > 18 && hour < 21) {
    return (hour - 18) / 3;
  }
  if (hour >= 21 || hour < 5) {
    return 1;
  }
  return 1 - (hour - 5) / 2;
}

function updateFeedbackEffects(group: THREE.Group, time: number): void {
  for (const child of [...group.children]) {
    const runtime = child.userData.feedbackRuntime as FeedbackRuntime | undefined;
    if (!runtime) {
      continue;
    }

    const progress = THREE.MathUtils.clamp((time - runtime.createdAt) / runtime.duration, 0, 1);
    const lift = Math.sin(progress * Math.PI) * 0.38 + progress * 0.42;
    child.position.y = runtime.startY + lift;
    child.rotation.y = progress * Math.PI * 1.2;
    // Snappy pop-in over the first ~12% of life, then a gentle breathe.
    const popIn = progress < 0.12 ? easeOutBack(progress / 0.12) : 1;
    const breathe = 1 + Math.sin(progress * Math.PI) * 0.12;
    child.scale.setScalar(runtime.baseScale * popIn * breathe);

    child.traverse((object) => {
      if (object.userData.feedbackRing) {
        // Ease-out expansion: fast at first, settling at the edge.
        const ringScale = 1 + easeOutQuad(progress) * 1.4;
        object.scale.set(ringScale, ringScale, ringScale);
      }

      if (object.userData.feedbackCoin) {
        // Cash coins arc upward and spin with accelerating energy.
        const baseY = (object.userData.baseY ??= object.position.y) as number;
        object.position.y = baseY + Math.sin(progress * Math.PI) * 0.4;
        object.rotation.y += 0.04 + progress * 0.12;
      } else if (object.userData.feedbackSpark) {
        const phase = typeof object.userData.phase === "number" ? object.userData.phase : 0;
        object.position.y += Math.sin(time * 0.012 + phase) * 0.003;
        object.rotation.y += 0.04;
      }

      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        const materials = object instanceof THREE.Sprite ? [object.material] : Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.transparent = true;
          // Envelope toward each material's authored base opacity: quick ease-in,
          // hold, then ease-out — instead of a single hard tail fade.
          const base = (material.userData.feedbackBaseOpacity ??= material.opacity) as number;
          const fadeIn = THREE.MathUtils.clamp(progress / 0.08, 0, 1);
          const fadeOut = THREE.MathUtils.clamp(1 - (progress - 0.65) / 0.35, 0, 1);
          material.opacity = base * fadeIn * fadeOut;
        }
      }
    });

    if (progress >= 1) {
      disposeObject(child);
      group.remove(child);
    }
  }
}

function createMissionBeacon(color: string): THREE.Group {
  const group = new THREE.Group();
  group.userData.beacon = true;

  const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const beamMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.025, 8, 48), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.018, 8, 36), ringMaterial);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.11;
  group.add(innerRing);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, 3.6, 24, 1, true), beamMaterial);
  beam.position.y = 1.85;
  group.add(beam);

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color }));
  arrow.position.y = 3.9;
  arrow.rotation.y = Math.PI / 4;
  group.add(arrow);

  return group;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        const mapped = material as THREE.Material & {
          alphaMap?: THREE.Texture | null;
          emissiveMap?: THREE.Texture | null;
          map?: THREE.Texture | null;
          normalMap?: THREE.Texture | null;
          roughnessMap?: THREE.Texture | null;
        };
        mapped.map?.dispose();
        mapped.alphaMap?.dispose();
        mapped.emissiveMap?.dispose();
        mapped.normalMap?.dispose();
        mapped.roughnessMap?.dispose();
        material.dispose();
      }
    }

    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

function clearGroup(group: THREE.Group): void {
  for (const child of group.children) {
    disposeObject(child);
  }
  group.clear();
}

function updateCarriedCrateMount(mount: THREE.Group, crate: StockCrate | null, placement: "firstPerson" | "avatar" = "firstPerson"): void {
  clearGroup(mount);
  if (!crate) {
    return;
  }

  const crateMesh = createStockCrateMesh(crate.productId, crate.quantity, true);
  if (placement === "avatar") {
    crateMesh.position.set(0, 0, -0.02);
    crateMesh.rotation.set(0.02, 0, 0.03);
    crateMesh.scale.setScalar(0.9);
  } else {
    crateMesh.position.set(0.42, -0.46, -0.78);
    crateMesh.rotation.set(-0.16, -0.32, 0.08);
    crateMesh.scale.setScalar(0.92);
  }
  mount.add(crateMesh);
}

function createPlayerAvatar(quality: GraphicsQuality): { avatar: THREE.Group; cargoMount: THREE.Group } {
  const avatar = createNpcCharacter("worker", quality);
  avatar.scale.setScalar(1.05);
  avatar.position.set(0, 0, 0.06);
  avatar.userData.action = "walk";
  avatar.userData.phase = 0.35;

  const rig = avatar.userData.rig as NpcRuntimeRig | undefined;
  if (rig?.carryMount instanceof THREE.Group) {
    clearGroup(rig.carryMount);
  }

  const playerBadge = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.05, 0.028),
    new THREE.MeshBasicMaterial({ color: "#2dd4bf" })
  );
  playerBadge.position.set(-0.08, 1.0, -0.225);
  avatar.add(playerBadge);

  const cargoMount = new THREE.Group();
  cargoMount.position.set(0, 0.82, -0.32);
  avatar.add(cargoMount);

  return { avatar, cargoMount };
}

function applyCameraMode(camera: THREE.PerspectiveCamera, playerAvatar: THREE.Group, firstPersonCargoMount: THREE.Group, mode: CameraMode, pitch: number): void {
  if (mode === "third") {
    camera.position.set(0, 2.22, 4.35);
    camera.rotation.x = THREE.MathUtils.clamp(-0.18 + pitch * 0.35, -0.65, 0.18);
    playerAvatar.visible = true;
    firstPersonCargoMount.visible = false;
    return;
  }

  camera.position.set(0, 1.65, 0);
  camera.rotation.x = pitch;
  playerAvatar.visible = false;
  firstPersonCargoMount.visible = true;
}

function createInteriorWasher(x: number, z: number, color = "#dbeafe"): THREE.Group {
  const washer = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.42), new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.44, metalness: 0.12 }));
  body.position.set(x, 0.39, z);
  body.castShadow = true;
  body.receiveShadow = true;
  washer.add(body);

  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, transparent: true, opacity: 0.74 }));
  door.position.set(x, 0.4, z - 0.225);
  door.rotation.x = Math.PI / 2;
  washer.add(door);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.025), new THREE.MeshBasicMaterial({ color: "#0f172a" }));
  panel.position.set(x, 0.7, z - 0.232);
  washer.add(panel);
  return washer;
}

function createInteriorCrateStack(color: string, x: number, z: number): THREE.Group {
  const stack = new THREE.Group();
  for (let index = 0; index < 4; index += 1) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.28, 0.36),
      new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.04 })
    );
    crate.position.set(x + (index % 2) * 0.48, 0.14 + Math.floor(index / 2) * 0.3, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    stack.add(crate);
  }
  return stack;
}

function addInteriorProps(group: THREE.Group, interior: WorldInterior, quality: GraphicsQuality): void {
  if (interior.style === "laundromat") {
    const washerZ = interior.openSide === "north" ? -interior.depth / 2 + 0.42 : interior.depth / 2 - 0.42;
    for (const x of [-1.65, -0.85, -0.05, 0.75, 1.55]) {
      group.add(createInteriorWasher(x, washerZ));
    }

    const foldingTable = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.58), new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.38, metalness: 0.08 }));
    foldingTable.position.set(0.9, 0.72, interior.openSide === "north" ? 0.28 : -0.28);
    foldingTable.castShadow = true;
    group.add(foldingTable);
    return;
  }

  if (interior.style === "supplier") {
    group.add(createInteriorCrateStack("#f59e0b", -1.4, 0.42));
    group.add(createInteriorCrateStack("#22c55e", 0.6, 0.42));
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.76, 0.38), new THREE.MeshStandardMaterial({ color: "#451a03", roughness: 0.58, metalness: 0.05 }));
    counter.position.set(0.1, 0.38, -0.75);
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);
    return;
  }

  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 0.42), new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.52, metalness: 0.18 }));
  bench.position.set(-0.75, 0.36, 0.42);
  bench.castShadow = true;
  bench.receiveShadow = true;
  group.add(bench);

  const toolChest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.82, 0.42), new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.46, metalness: 0.1 }));
  toolChest.position.set(1.65, 0.41, 0.35);
  toolChest.castShadow = true;
  group.add(toolChest);

  const shell = createMachineMesh("#64748b", 82, [], quality);
  shell.position.set(0.55, 0.02, -0.65);
  shell.rotation.y = 0.08;
  shell.scale.setScalar(0.62);
  group.add(shell);
}

function createInteriorCell(interior: WorldInterior, quality: GraphicsQuality): THREE.Group {
  const group = new THREE.Group();
  const profile = districtVisualProfiles[interior.districtId] ?? districtVisualProfiles.starter_suburb;
  const wallHeight = 2.2;
  const wallThickness = 0.14;
  const floorMaterial = new THREE.MeshStandardMaterial({ color: "#293241", roughness: 0.88, metalness: 0.03 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.74, metalness: 0.04 });
  const trimMaterial = new THREE.MeshBasicMaterial({ color: profile.accentColor });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(interior.width, 0.06, interior.depth), floorMaterial);
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  group.add(floor);

  const addWall = (side: "east" | "north" | "south" | "west") => {
    if (side === interior.openSide) {
      return;
    }

    const horizontal = side === "north" || side === "south";
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? interior.width : wallThickness, wallHeight, horizontal ? wallThickness : interior.depth),
      wallMaterial
    );
    wall.position.set(
      side === "east" ? interior.width / 2 : side === "west" ? -interior.width / 2 : 0,
      wallHeight / 2,
      side === "north" ? interior.depth / 2 : side === "south" ? -interior.depth / 2 : 0
    );
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  };

  addWall("north");
  addWall("south");
  addWall("east");
  addWall("west");

  const openHorizontal = interior.openSide === "north" || interior.openSide === "south";
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(openHorizontal ? interior.width : 0.16, 0.08, openHorizontal ? 0.18 : interior.depth),
    trimMaterial
  );
  threshold.position.set(
    interior.openSide === "east" ? interior.width / 2 : interior.openSide === "west" ? -interior.width / 2 : 0,
    0.08,
    interior.openSide === "north" ? interior.depth / 2 : interior.openSide === "south" ? -interior.depth / 2 : 0
  );
  group.add(threshold);

  const awning = threshold.clone();
  awning.position.y = 2.24;
  awning.scale.y = 1.4;
  group.add(awning);

  addInteriorProps(group, interior, quality);
  addLabel(group, interior.label, profile.accentColor, new THREE.Vector3(0, 0, 0), 2.72);
  group.position.set(interior.x, 0, interior.z);
  return group;
}

function buildParkIntoChunks(
  park: WorldPark,
  specs: Map<string, WorldChunkBuildSpec>,
  addStatic: (createObject: () => THREE.Object3D, x: number, z: number) => void,
  materials: { grass: THREE.Material; path: THREE.Material; pond: THREE.Material },
  quality: GraphicsQuality,
  enableLocalLights: boolean
): void {
  const { minX, maxX, minZ, maxZ } = park.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Manicured lawn — a thin grass slab just above the asphalt, split per chunk.
  addRectMeshBuildJobsToWorldChunks(specs, park.bounds, 0.05, 0.09, materials.grass, (mesh) => {
    mesh.receiveShadow = true;
  });

  // Gravel paths: a central cross plus an inset perimeter loop.
  const pathWidth = 2.1;
  const inset = 2.0;
  const xW = minX + inset;
  const xE = maxX - inset;
  const zS = minZ + inset;
  const zN = maxZ - inset;
  const half = pathWidth / 2;
  const addPath = (bounds: RectBounds) =>
    addRectMeshBuildJobsToWorldChunks(specs, bounds, 0.105, 0.03, materials.path, (mesh) => {
      mesh.receiveShadow = true;
    });
  addPath({ minX, maxX, minZ: cz - half, maxZ: cz + half });
  addPath({ minX: cx - half, maxX: cx + half, minZ, maxZ });
  addPath({ minX: xW - half, maxX: xE + half, minZ: zN - half, maxZ: zN + half });
  addPath({ minX: xW - half, maxX: xE + half, minZ: zS - half, maxZ: zS + half });
  addPath({ minX: xW - half, maxX: xW + half, minZ: zS - half, maxZ: zN + half });
  addPath({ minX: xE - half, maxX: xE + half, minZ: zS - half, maxZ: zN + half });

  // Pond with a stone rim.
  addStatic(() => {
    const group = new THREE.Group();
    const water = new THREE.Mesh(new THREE.CircleGeometry(park.pond.radius, quality === "low" ? 22 : 44), materials.pond);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.12;
    water.receiveShadow = true;
    group.add(water);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(park.pond.radius + 0.16, 0.22, 6, quality === "low" ? 20 : 40),
      new THREE.MeshStandardMaterial({ color: "#8a9099", roughness: 0.85, metalness: 0.05 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.13;
    group.add(rim);
    group.position.set(park.pond.x, 0, park.pond.z);
    return group;
  }, park.pond.x, park.pond.z);

  // Helpers for keeping plantings off the paths, pond and edges.
  const onPath = (x: number, z: number) =>
    Math.abs(x - cx) < half + 0.7 ||
    Math.abs(z - cz) < half + 0.7 ||
    ((Math.abs(z - zN) < half + 0.6 || Math.abs(z - zS) < half + 0.6) && x > xW - 1 && x < xE + 1) ||
    ((Math.abs(x - xW) < half + 0.6 || Math.abs(x - xE) < half + 0.6) && z > zS - 1 && z < zN + 1);
  const inPond = (x: number, z: number) => Math.hypot(x - park.pond.x, z - park.pond.z) < park.pond.radius + 1.3;
  const seedAt = (x: number, z: number) => Math.abs(Math.round(x * 73.1 + z * 191.7)) + 1;

  // Scattered trees on a jittered grid.
  const spacing = quality === "low" ? 6 : 4.6;
  for (let gx = minX + 1.6; gx <= maxX - 1.6; gx += spacing) {
    for (let gz = minZ + 1.6; gz <= maxZ - 1.6; gz += spacing) {
      const seed = seedAt(gx, gz);
      const rng = (n: number) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
      const x = gx + (rng(1) - 0.5) * spacing * 0.7;
      const z = gz + (rng(2) - 0.5) * spacing * 0.7;
      if (x < minX + 1 || x > maxX - 1 || z < minZ + 1 || z > maxZ - 1) {
        continue;
      }
      if (inPond(x, z) || onPath(x, z) || rng(3) > 0.78) {
        continue;
      }
      addStatic(() => {
        const object = rng(4) > 0.78 ? createBush(quality, seed) : createTree(quality, seed);
        object.position.set(x, 0, z);
        return object;
      }, x, z);
    }
  }

  // Border shrubs just inside the perimeter for a planted edge.
  const borderStep = quality === "low" ? 5.5 : 3.6;
  for (let x = minX + 2.4; x <= maxX - 2.4; x += borderStep) {
    for (const z of [minZ + 0.9, maxZ - 0.9]) {
      const seed = seedAt(x, z);
      addStatic(() => {
        const bush = createBush(quality, seed);
        bush.position.set(x, 0, z);
        return bush;
      }, x, z);
    }
  }
  for (let z = minZ + 2.4; z <= maxZ - 2.4; z += borderStep) {
    for (const x of [minX + 0.9, maxX - 0.9]) {
      const seed = seedAt(x, z);
      addStatic(() => {
        const bush = createBush(quality, seed);
        bush.position.set(x, 0, z);
        return bush;
      }, x, z);
    }
  }

  // Benches along the central promenade.
  for (const x of [minX + 6, maxX - 6]) {
    for (const dir of [-1, 1] as const) {
      const z = cz + dir * (half + 1.0);
      addStatic(() => {
        const bench = createParkBench();
        bench.position.set(x, 0, z);
        bench.rotation.y = dir > 0 ? 0 : Math.PI;
        return bench;
      }, x, z);
    }
  }

  // Lamps at the inner corners and the central crossing.
  const lampSpots: Array<[number, number]> = [
    [xW, zN],
    [xE, zN],
    [xW, zS],
    [xE, zS],
    [cx, cz]
  ];
  for (const [x, z] of lampSpots) {
    addStatic(() => {
      const lamp = createParkLamp(enableLocalLights);
      lamp.position.set(x, 0, z);
      return lamp;
    }, x, z);
  }
}

function createBackdropBuilding(definition: CityBackdropBuilding, quality: GraphicsQuality): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.84, metalness: 0.05 });
  const trimMaterial = new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.5 });
  const bandMaterial = new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.32 });
  const litMaterial = new THREE.MeshBasicMaterial({
    color: definition.lit > 0.68 ? "#f0abfc" : definition.lit > 0.46 ? "#93c5fd" : "#fde68a",
    transparent: true,
    opacity: 0.62
  });
  const darkWindowMaterial = new THREE.MeshBasicMaterial({ color: "#0f172a", transparent: true, opacity: 0.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(definition.width, definition.height, definition.depth), bodyMaterial);
  body.position.y = definition.height / 2;
  body.receiveShadow = false;
  body.castShadow = false;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(definition.width + 0.24, 0.12, definition.depth + 0.24), trimMaterial);
  roof.position.y = definition.height + 0.08;
  group.add(roof);

  for (let y = 1.15; y < definition.height - 0.55; y += quality === "high" ? 0.95 : 1.25) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(definition.width + 0.05, 0.028, 0.035), bandMaterial);
    band.position.set(0, y, -definition.depth / 2 - 0.018);
    group.add(band);
  }

  const rows = Math.max(1, Math.min(quality === "high" ? 9 : 6, Math.floor((definition.height - 1.1) / WORLD_SCALE.building.floorHeight)));
  const cols = Math.max(1, Math.min(quality === "high" ? 6 : 4, Math.floor((definition.width - 0.7) / (quality === "low" ? 1.65 : 1.35))));
  const windowWidth = quality === "low" ? 0.46 : 0.58;
  const windowHeight = quality === "low" ? 0.58 : 0.78;
  const frontZ = -definition.depth / 2 - 0.012;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = ((row * 5 + col * 3 + Math.round(definition.x + definition.z)) % 10) / 10 < definition.lit;
      const window = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, windowHeight, 0.018), lit ? litMaterial : darkWindowMaterial);
      window.position.set(
        cols === 1 ? 0 : -definition.width / 2 + 0.72 + col * ((definition.width - 1.44) / Math.max(1, cols - 1)),
        1.45 + row * WORLD_SCALE.building.floorHeight,
        frontZ
      );
      group.add(window);
    }
  }

  if (quality === "low") {
    group.position.set(definition.x, 0, definition.z);
    return group;
  }

  const sideRows = Math.max(1, Math.min(6, Math.floor((definition.height - 1.1) / WORLD_SCALE.building.floorHeight)));
  const sideCols = Math.max(1, Math.min(4, Math.floor(definition.depth / 1.35)));
  for (let row = 0; row < sideRows; row += 1) {
    for (let col = 0; col < sideCols; col += 1) {
      const z = -definition.depth / 2 + 0.45 + col * ((definition.depth - 0.9) / Math.max(1, sideCols - 1));
      const y = 1.45 + row * WORLD_SCALE.building.floorHeight;
      for (const side of [-1, 1] as const) {
        const lit = ((row * 2 + col * 5 + side + Math.round(definition.x)) % 10) / 10 < definition.lit * 0.8;
        const window = new THREE.Mesh(new THREE.BoxGeometry(windowWidth * 0.82, windowHeight * 0.86, 0.016), lit ? litMaterial : darkWindowMaterial);
        window.position.set(side * (definition.width / 2 + 0.012), y, z);
        window.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(window);
      }
    }
  }

  const lobbyGlow = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(definition.width * 0.62, 2.45), WORLD_SCALE.building.door.frameHeight, 0.024),
    new THREE.MeshBasicMaterial({ color: litMaterial.color, transparent: true, opacity: 0.28 + definition.lit * 0.18 })
  );
  lobbyGlow.position.set(0, WORLD_SCALE.building.door.frameHeight / 2 + 0.08, frontZ - 0.005);
  group.add(lobbyGlow);

  const lobbyDoor = new THREE.Mesh(new THREE.BoxGeometry(Math.min(definition.width * 0.22, WORLD_SCALE.building.door.width), WORLD_SCALE.building.door.height, 0.028), darkWindowMaterial);
  lobbyDoor.position.set(0, WORLD_SCALE.building.door.height / 2 + 0.08, frontZ - 0.018);
  group.add(lobbyDoor);

  if (definition.height > 10) {
    const crownHeight = Math.min(1.8, definition.height * 0.12);
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(definition.width * 0.62, crownHeight, definition.depth * 0.72),
      new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.78, metalness: 0.08 })
    );
    crown.position.y = definition.height + crownHeight / 2 + 0.08;
    group.add(crown);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.35, 8), trimMaterial);
    antenna.position.set(definition.width * 0.18, definition.height + crownHeight + 0.78, 0);
    group.add(antenna);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), litMaterial);
    beacon.position.set(antenna.position.x, antenna.position.y + 0.72, 0);
    group.add(beacon);
  }

  if (quality === "high" && definition.height > 7) {
    const crownGlow = new THREE.Mesh(
      new THREE.BoxGeometry(definition.width + 0.18, 0.06, 0.05),
      new THREE.MeshBasicMaterial({ color: litMaterial.color, transparent: true, opacity: 0.34 })
    );
    crownGlow.position.set(0, definition.height + 0.18, -definition.depth / 2 - 0.035);
    group.add(crownGlow);
  }

  group.position.set(definition.x, 0, definition.z);
  return group;
}

function createPatrolZone(zone: PatrolZone): THREE.Group {
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(zone.radius, 36),
    new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: 0.045, depthWrite: false })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.075;
  group.add(fill);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(zone.radius, 0.035, 6, 80),
    new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: 0.34, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.095;
  group.add(ring);

  const postMaterial = new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: 0.7 });
  for (const offset of [-zone.radius * 0.68, zone.radius * 0.68]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), postMaterial);
    post.position.set(offset, 0.45, 0);
    group.add(post);
  }

  group.position.set(zone.x, 0, zone.z);
  addLabel(group, zone.label, zone.color, new THREE.Vector3(0, 0, 0), 1.15);
  return group;
}

function createNeighborhoodHotspotMarker(color: string, kind: string, access: DistrictAccess): THREE.Group {
  const group = new THREE.Group();
  const locked = access === "locked";
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: locked ? 0.34 : 0.78,
    depthWrite: false
  });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: locked ? "#334155" : "#1f2937", roughness: 0.72, metalness: 0.08 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.026, 8, 64), material);
  ring.position.y = 0.11;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.9, 12), baseMaterial);
  post.position.y = 0.45;
  post.castShadow = true;
  group.add(post);

  const capGeometry =
    kind === "route_choke"
      ? new THREE.ConeGeometry(0.18, 0.34, 3)
      : kind === "market"
        ? new THREE.BoxGeometry(0.34, 0.22, 0.22)
        : kind === "supplier_shadow"
          ? new THREE.CylinderGeometry(0.16, 0.16, 0.18, 6)
          : new THREE.SphereGeometry(0.18, 14, 10);
  const cap = new THREE.Mesh(capGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: locked ? 0.52 : 1 }));
  cap.position.y = 1.03;
  cap.rotation.y = kind === "route_choke" ? Math.PI : 0;
  group.add(cap);

  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.5, 1.8, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: locked ? 0.04 : 0.09, depthWrite: false })
  );
  halo.position.y = 0.92;
  group.add(halo);

  group.userData.neighborhoodHotspot = true;
  return group;
}

function createCrimeContactMarker(color: string, kind: string, access: DistrictAccess): THREE.Group {
  const group = new THREE.Group();
  const locked = access === "locked";
  const opacity = locked ? 0.36 : 0.88;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.024, 8, 56),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);

  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.82, 12), new THREE.MeshStandardMaterial({ color: locked ? "#334155" : "#111827", roughness: 0.62 }));
  coat.position.y = 0.47;
  coat.castShadow = true;
  group.add(coat);

  const signGeometry = kind === "grey_supplier" ? new THREE.BoxGeometry(0.42, 0.18, 0.08) : kind === "lookout" ? new THREE.ConeGeometry(0.2, 0.3, 3) : new THREE.CylinderGeometry(0.18, 0.18, 0.1, 6);
  const sign = new THREE.Mesh(signGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
  sign.position.y = 1.02;
  sign.rotation.y = kind === "lookout" ? Math.PI : 0;
  group.add(sign);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.46, 1.55, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: locked ? 0.035 : 0.075, depthWrite: false })
  );
  beam.position.y = 0.84;
  group.add(beam);
  group.userData.crimeContact = true;
  return group;
}

function createRivalOperationMarker(color: string, progress: number, exposed: boolean): THREE.Group {
  const group = new THREE.Group();
  const tone = exposed ? "#fbbf24" : color;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.74, 0.03, 8, 64),
    new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: exposed ? 0.9 : 0.68, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.13;
  group.add(ring);

  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.84, 0.12), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.52, metalness: 0.12 }));
  mast.position.y = 0.5;
  mast.castShadow = true;
  group.add(mast);

  const bladeCount = Math.max(1, Math.min(4, Math.ceil(progress / 25)));
  for (let index = 0; index < bladeCount; index += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.045, 0.09), new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.88 }));
    blade.position.y = 1.02 + index * 0.09;
    blade.rotation.y = index * (Math.PI / 2);
    group.add(blade);
  }

  group.userData.rivalOperation = true;
  return group;
}

function districtEventColor(event: DistrictEvent): string {
  if (event.kind === "police_surge") {
    return "#60a5fa";
  }

  if (event.kind === "weather") {
    return "#93c5fd";
  }

  if (event.kind === "shortage") {
    return "#f59e0b";
  }

  if (event.kind === "trend") {
    return "#e879f9";
  }

  return "#a3e635";
}

function createDistrictEventMarker(event: DistrictEvent, location: Location, currentWorldTime: number, quality: GraphicsQuality, modelConfig: ModelConfig, index: number): THREE.Group {
  const group = new THREE.Group();
  const color = districtEventColor(event);
  const center = new THREE.Vector3(location.position.x, 0, location.position.z);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.55 + Math.min(0.8, event.congestionDelta * 1.8), 0.035, 8, 72),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(center.x, 0.14, center.z);
  group.add(ring);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.62, 2.15, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.075, depthWrite: false })
  );
  beacon.position.set(center.x, 1.12, center.z);
  group.add(beacon);
  addLabel(group, event.kind === "police_surge" ? "PATROLS" : event.kind.toUpperCase(), color, center, 2.92);

  const crowdCount = quality === "low" ? 1 : quality === "high" ? 4 : 3;
  for (let actorIndex = 0; actorIndex < crowdCount; actorIndex += 1) {
    const variant = event.kind === "police_surge" ? "scout" : event.kind === "shortage" ? "worker" : "customer";
    const actor = createNpcCharacter(variant, quality);
    const angle = currentWorldTime * 0.34 + index * 0.9 + actorIndex * ((Math.PI * 2) / crowdCount);
    const radius = 1.25 + actorIndex * 0.18;
    const start = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    const stop = center.clone().add(new THREE.Vector3(Math.cos(angle + 0.9) * (radius + 0.25), 0, Math.sin(angle + 0.9) * (radius + 0.25)));
    const exit = center.clone().add(new THREE.Vector3(Math.cos(angle + 1.8) * radius, 0, Math.sin(angle + 1.8) * radius));
    actor.position.copy(start);
    actor.scale.setScalar(event.kind === "police_surge" ? 0.98 : event.kind === "festival" ? 0.94 : 0.9);
    actor.userData.action = event.kind === "police_surge" ? "scan" : event.kind === "shortage" ? "carry" : "walk";
    actor.userData.baseY = 0;
    actor.userData.dynamicNpc = true;
    actor.userData.floatAmount = 0.006;
    actor.userData.floatSpeed = 1.15;
    actor.userData.pathOffset = Math.max(0, currentWorldTime - event.startedHour) * 2.5 + actorIndex * 0.31;
    actor.userData.phase = event.startedHour + actorIndex;
    actor.userData.walkPath = [start, stop, exit];
    actor.userData.walkSpeed = event.kind === "police_surge" ? 0.18 : 0.24 + event.congestionDelta * 0.18;
    applyModelTransformById(actor, modelConfig, unitModelId(variant));
    group.add(actor);
  }

  return group;
}

function createRivalCrewActor(operation: RivalOperation, color: string, origin: THREE.Vector3, currentWorldTime: number, quality: GraphicsQuality, modelConfig: ModelConfig, index: number): THREE.Group {
  const character = createNpcCharacter("rival", quality);
  const angle = currentWorldTime * 0.28 + operation.progress * 0.03 + index;
  const start = origin.clone().add(new THREE.Vector3(Math.cos(angle) * 0.95, 0, Math.sin(angle) * 0.95));
  const stop = origin.clone().add(new THREE.Vector3(Math.cos(angle + 1.15) * 0.72, 0, Math.sin(angle + 1.15) * 0.72));
  const exit = origin.clone().add(new THREE.Vector3(Math.cos(angle + 2.1) * 1.05, 0, Math.sin(angle + 2.1) * 1.05));
  character.position.copy(start);
  character.scale.setScalar(1.02);
  character.userData.action = operation.kind === "sabotage_cell" || operation.kind === "permit_pressure" ? "scan" : operation.kind === "grey_supply" ? "carry" : "pace";
  character.userData.baseY = 0;
  character.userData.dynamicNpc = true;
  character.userData.floatAmount = 0.006;
  character.userData.floatSpeed = 1.28;
  character.userData.pathOffset = Math.max(0, currentWorldTime - operation.startedHour) * 2.8 + operation.strength;
  character.userData.phase = operation.startedHour + operation.progress * 0.1;
  character.userData.walkPath = [start, stop, exit];
  character.userData.walkSpeed = 0.18 + operation.strength * 0.12;
  applyModelTransformById(character, modelConfig, "unit.rival");

  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.03), new THREE.MeshBasicMaterial({ color }));
  patch.position.set(0.08, 1.08, -0.23);
  character.add(patch);
  return character;
}

function createPolicePatrolOfficer(patrol: PolicePatrolPath, quality: GraphicsQuality, modelConfig: ModelConfig): THREE.Group {
  const officer = createNpcCharacter("scout", quality);
  const start = patrol.path[0];
  officer.position.set(start.x, 0, start.z);
  officer.scale.setScalar(0.96);
  officer.userData.action = "scan";
  officer.userData.baseY = 0;
  officer.userData.dynamicNpc = true;
  officer.userData.floatAmount = 0.005;
  officer.userData.floatSpeed = 1.0;
  officer.userData.pathOffset = patrol.phase;
  officer.userData.phase = patrol.phase * 0.4;
  officer.userData.walkPath = patrol.path.map((point) => new THREE.Vector3(point.x, 0, point.z));
  officer.userData.walkSpeed = patrol.speed;
  applyModelTransformById(officer, modelConfig, "unit.scout");

  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.028), new THREE.MeshBasicMaterial({ color: patrol.color }));
  badge.position.set(-0.08, 1.08, -0.235);
  officer.add(badge);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.055, 16), new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.48, metalness: 0.08 }));
  cap.position.set(0, 1.48, -0.005);
  officer.add(cap);

  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.04), new THREE.MeshBasicMaterial({ color: "#020617" }));
  radio.position.set(0.23, 1.02, -0.2);
  officer.add(radio);
  if (quality === "high") {
    const flashlight = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), new THREE.MeshBasicMaterial({ color: "#fde68a" }));
    flashlight.position.set(-0.22, 0.98, -0.21);
    flashlight.rotation.x = Math.PI / 2;
    officer.add(flashlight);
  }
  return officer;
}

function createPolicePatrolLayer(patrols: PolicePatrolPath[], maxPatrols: number, quality: GraphicsQuality, modelConfig: ModelConfig): { animated: THREE.Object3D[]; group: THREE.Group } {
  const group = new THREE.Group();
  const animated: THREE.Object3D[] = [];

  patrols.slice(0, maxPatrols).forEach((patrol) => {
    const officer = createPolicePatrolOfficer(patrol, quality, modelConfig);
    group.add(officer);
    animated.push(officer);
  });

  return { animated, group };
}

function createTrafficVehicleMesh(loop: TrafficLoop, enableShadows: boolean, quality: GraphicsQuality): THREE.Group {
  const group = new THREE.Group();
  const bodyColor = loop.kind === "police" ? "#f8fafc" : loop.color;
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.14, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.3 });
  const secondaryBodyMaterial = new THREE.MeshPhysicalMaterial({ color: bodyColor, roughness: 0.36, metalness: 0.12, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 1.2 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.36, metalness: 0.45, envMapIntensity: 1.1 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.72, metalness: 0.08 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.2, metalness: 0.88, envMapIntensity: 1.5 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: "#93c5fd", roughness: 0.03, metalness: 0.02, transparent: true, opacity: 0.55, transmission: 0.1, envMapIntensity: 1.6 });
  const markerMaterial = new THREE.MeshBasicMaterial({ color: "#fb923c", transparent: true, opacity: 0.86 });
  const deliveryDecalMaterial = new THREE.MeshBasicMaterial({ map: createVehicleDecalTexture("DROP", "#fef3c7", "#d97706") });
  const length = loop.kind === "delivery" ? WORLD_SCALE.vehicle.deliveryLength : loop.kind === "police" ? WORLD_SCALE.vehicle.policeLength : WORLD_SCALE.vehicle.length;
  const width = loop.kind === "delivery" ? WORLD_SCALE.vehicle.deliveryWidth : loop.kind === "police" ? WORLD_SCALE.vehicle.policeWidth : WORLD_SCALE.vehicle.width;
  const bodyHeight = loop.kind === "delivery" ? 1.05 : 0.72;
  const cabHeight = loop.kind === "delivery" ? 0.82 : 0.66;
  const wheelRadius = loop.kind === "delivery" ? 0.38 : 0.34;
  const baseY = wheelRadius + 0.14;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.16, length * 0.84), trimMaterial);
  chassis.position.y = baseY;
  chassis.castShadow = enableShadows;
  chassis.receiveShadow = enableShadows;
  group.add(chassis);

  const lowerValance = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.12, length * 0.86), trimMaterial);
  lowerValance.position.set(0, baseY + 0.06, 0.01);
  lowerValance.castShadow = enableShadows;
  lowerValance.receiveShadow = enableShadows;
  group.add(lowerValance);

  for (const z of [-length / 2 - 0.04, length / 2 + 0.04]) {
    const bumper = new THREE.Mesh(roundedBox(width * 0.86, 0.1, 0.09, 0.025, quality), trimMaterial);
    bumper.position.set(0, baseY + 0.18, z);
    bumper.castShadow = enableShadows;
    group.add(bumper);
  }

  const bodyDepth = loop.kind === "delivery" ? length * 0.56 : length * 0.58;
  const body = new THREE.Mesh(roundedBox(width * 0.92, bodyHeight * 0.74, bodyDepth, 0.08, quality), bodyMaterial);
  body.position.set(0, baseY + bodyHeight * 0.42, loop.kind === "delivery" ? length * 0.14 : 0.06);
  body.castShadow = enableShadows;
  body.receiveShadow = enableShadows;
  group.add(body);

  const hood = new THREE.Mesh(roundedBox(width * 0.8, bodyHeight * 0.34, length * 0.2, 0.08, quality), secondaryBodyMaterial);
  hood.position.set(0, baseY + bodyHeight * 0.42, -length * 0.34);
  hood.castShadow = enableShadows;
  hood.receiveShadow = enableShadows;
  group.add(hood);

  const rearDeck = new THREE.Mesh(roundedBox(width * 0.78, bodyHeight * 0.3, length * 0.2, 0.07, quality), secondaryBodyMaterial);
  rearDeck.position.set(0, baseY + bodyHeight * 0.42, length * 0.34);
  rearDeck.castShadow = enableShadows;
  rearDeck.receiveShadow = enableShadows;
  if (loop.kind !== "delivery") {
    group.add(rearDeck);
  }

  const cabWidth = loop.kind === "delivery" ? width * 0.72 : width * 0.74;
  const cabDepth = loop.kind === "delivery" ? length * 0.22 : length * 0.28;
  const cabZ = loop.kind === "delivery" ? -length * 0.22 : -length * 0.06;
  const cab = new THREE.Mesh(roundedBox(cabWidth, cabHeight, cabDepth, 0.09, quality), glassMaterial);
  cab.position.set(0, baseY + bodyHeight * 0.74 + cabHeight / 2 - 0.08, cabZ);
  group.add(cab);

  const driver = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.62 }));
  driver.position.set(width * 0.12, cab.position.y, cabZ - cabDepth * 0.06);
  driver.castShadow = enableShadows;
  group.add(driver);

  if (quality !== "low") {
    for (const side of [-1, 1]) {
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.035, cabHeight * 0.5, cabDepth * 0.58), glassMaterial);
      sideGlass.position.set(side * (cabWidth / 2 + 0.025), cab.position.y + 0.02, cabZ);
      group.add(sideGlass);

      const windowFrame = new THREE.Group();
      windowFrame.position.set(side * (cabWidth / 2 + 0.044), cab.position.y + 0.02, cabZ);
      for (const y of [-cabHeight * 0.27, cabHeight * 0.27]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.024, cabDepth * 0.65), trimMaterial);
        bar.position.y = y;
        windowFrame.add(bar);
      }
      for (const z of [-cabDepth * 0.32, cabDepth * 0.32]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.028, cabHeight * 0.54, 0.026), trimMaterial);
        pillar.position.z = z;
        windowFrame.add(pillar);
      }
      group.add(windowFrame);

      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.12), trimMaterial);
      mirror.position.set(side * (width / 2 + 0.13), cab.position.y + cabHeight * 0.08, cabZ - cabDepth * 0.36);
      group.add(mirror);

      const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.02, bodyHeight * 0.62, 0.026), trimMaterial);
      doorSeam.position.set(side * (width / 2 + 0.045), baseY + bodyHeight * 0.52, cabZ + cabDepth * 0.45);
      group.add(doorSeam);

      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.035, 0.15), trimMaterial);
      handle.position.set(side * (width / 2 + 0.06), baseY + bodyHeight * 0.58, cabZ + cabDepth * 0.2);
      group.add(handle);
    }
  }

  if (loop.kind === "police") {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.1, length * 0.72), new THREE.MeshBasicMaterial({ color: "#1d4ed8" }));
    stripe.position.set(0, baseY + bodyHeight * 0.55, 0);
    group.add(stripe);
    const lightbar = new THREE.Group();
    lightbar.position.set(0, cab.position.y + cabHeight / 2 + 0.07, -0.08);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), new THREE.MeshBasicMaterial({ color: "#ef4444" }));
    red.position.x = -0.16;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), new THREE.MeshBasicMaterial({ color: "#2563eb" }));
    blue.position.x = 0.16;
    lightbar.add(red, blue);
    group.add(lightbar);
    group.userData.emergencyLight = lightbar;

    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.64, 0.28, 0.045), trimMaterial);
    pushBar.position.set(0, baseY + 0.3, -length / 2 - 0.09);
    group.add(pushBar);
  }

  if (loop.kind === "delivery") {
    const cargoBox = new THREE.Mesh(roundedBox(width * 0.94, bodyHeight * 1.04, length * 0.5, 0.08, quality), bodyMaterial);
    cargoBox.position.set(0, baseY + bodyHeight * 0.62, length * 0.15);
    cargoBox.castShadow = enableShadows;
    cargoBox.receiveShadow = enableShadows;
    group.add(cargoBox);

    const cargoLine = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.1, length * 0.42), new THREE.MeshBasicMaterial({ color: "#451a03" }));
    cargoLine.position.set(0, baseY + bodyHeight * 0.72, length * 0.16);
    group.add(cargoLine);

    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.48, length * 0.26), deliveryDecalMaterial);
      decal.position.set(side * (width / 2 + 0.026), baseY + bodyHeight * 0.68, length * 0.14);
      group.add(decal);

      for (const z of [-length * 0.03, length * 0.22]) {
        const sideMarker = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.045, 0.08), markerMaterial);
        sideMarker.position.set(side * (width / 2 + 0.04), baseY + bodyHeight * 0.44, z);
        group.add(sideMarker);
      }
    }

    if (quality === "high") {
      const cargoDoor = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, 0.68, 0.035), new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.55, metalness: 0.08 }));
      cargoDoor.position.set(0, baseY + bodyHeight * 0.62, length / 2 + 0.02);
      group.add(cargoDoor);

      for (const x of [-width * 0.28, width * 0.28]) {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), trimMaterial);
        hinge.position.set(x, baseY + bodyHeight * 0.72, length / 2 + 0.045);
        hinge.rotation.z = Math.PI / 2;
        group.add(hinge);
      }
    }
  }

  for (const x of [-width / 2 - 0.05, width / 2 + 0.05]) {
    for (const z of [-length * 0.32, length * 0.34]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.17, quality === "low" ? 12 : 22), tireMaterial);
      wheel.position.set(x, wheelRadius, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = enableShadows;
      group.add(wheel);

      if (quality !== "low") {
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.44, wheelRadius * 0.44, 0.18, 14), hubMaterial);
        hub.position.copy(wheel.position);
        hub.rotation.z = Math.PI / 2;
        group.add(hub);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 0.48, 0.016, 8, 24), hubMaterial);
        rim.position.copy(wheel.position);
        rim.rotation.y = Math.PI / 2;
        group.add(rim);

        for (let spokeIndex = 0; spokeIndex < 5; spokeIndex += 1) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, wheelRadius * 0.68), hubMaterial);
          spoke.position.copy(wheel.position);
          spoke.rotation.x = spokeIndex * Math.PI / 5;
          group.add(spoke);
        }

        const arch = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 1.1, 0.028, 8, 20, Math.PI), trimMaterial);
        arch.position.set(x, wheelRadius + 0.14, z);
        arch.rotation.x = Math.PI / 2;
        group.add(arch);
      }
    }
  }

  const headlightMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.76 });
  for (const x of [-width * 0.24, width * 0.24]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.024), headlightMaterial);
    light.position.set(x, baseY + bodyHeight * 0.42, -length / 2 - 0.015);
    group.add(light);
  }

  if (quality === "high") {
    const tailLightMaterial = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.78 });
    for (const x of [-width * 0.26, width * 0.26]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.024), tailLightMaterial);
      tail.position.set(x, baseY + bodyHeight * 0.42, length / 2 + 0.015);
      group.add(tail);
    }
  }

  // Grounding blob shadow (traffic body length runs along Z, width along X).
  group.add(createContactShadow(width * 1.7, length * 1.5, 0.45));

  return group;
}

function createTrafficLayer(loops: TrafficLoop[], roads: WorldRoad[], maxLoops: number, enableShadows: boolean, quality: GraphicsQuality, modelConfig: ModelConfig): { animated: THREE.Object3D[]; group: THREE.Group } {
  const group = new THREE.Group();
  const animated: THREE.Object3D[] = [];

  loops.filter((loop) => pathOnRoads(loop.path, roads)).slice(0, maxLoops).forEach((loop) => {
    const vehicle = createTrafficVehicleMesh(loop, enableShadows, quality);
    const start = loop.path[0];
    vehicle.position.set(start.x, 0.02, start.z);
    vehicle.userData.trafficLoop = true;
    vehicle.userData.walkPath = loop.path.map((point) => new THREE.Vector3(point.x, 0.02, point.z));
    vehicle.userData.walkSpeed = loop.speed;
    vehicle.userData.pathOffset = loop.phase;
    applyModelTransformById(vehicle, modelConfig, trafficVehicleModelId(loop.kind));
    group.add(vehicle);
    animated.push(vehicle);
  });

  return { animated, group };
}

function addRoadMarkingsToChunks(chunks: Map<string, WorldChunkRuntime>, parent: THREE.Object3D, road: WorldRoad): void {
  const bounds = roadBounds(road);
  const profile = districtVisualProfiles[road.districtId] ?? districtVisualProfiles.starter_suburb;
  const laneMaterial = new THREE.MeshBasicMaterial({ color: profile.laneColor, transparent: true, opacity: 0.82 });
  const curbMaterial = new THREE.MeshBasicMaterial({ color: profile.curbColor, transparent: true, opacity: 0.72 });
  const horizontal = road.width >= road.depth;
  const dashLength = 2.1;
  const dashGap = 2.6;
  const y = 0.095;

  if (horizontal) {
    for (let x = bounds.minX + 1.2; x < bounds.maxX - 0.8; x += dashLength + dashGap) {
      const width = Math.min(dashLength, bounds.maxX - x - 0.8);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.065), laneMaterial);
      dash.position.set(x + width / 2, y, road.z);
      addObjectToWorldChunk(chunks, parent, dash, dash.position.x, dash.position.z);
    }

    for (const z of [bounds.minZ + 0.16, bounds.maxZ - 0.16]) {
      addRectMeshesToWorldChunks(chunks, parent, { minX: bounds.minX, maxX: bounds.maxX, minZ: z - 0.025, maxZ: z + 0.025 }, y + 0.002, 0.014, curbMaterial);
    }
    return;
  }

  for (let z = bounds.minZ + 1.2; z < bounds.maxZ - 0.8; z += dashLength + dashGap) {
    const depth = Math.min(dashLength, bounds.maxZ - z - 0.8);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.012, depth), laneMaterial);
    dash.position.set(road.x, y, z + depth / 2);
    addObjectToWorldChunk(chunks, parent, dash, dash.position.x, dash.position.z);
  }

  for (const x of [bounds.minX + 0.16, bounds.maxX - 0.16]) {
    addRectMeshesToWorldChunks(chunks, parent, { minX: x - 0.025, maxX: x + 0.025, minZ: bounds.minZ, maxZ: bounds.maxZ }, y + 0.002, 0.014, curbMaterial);
  }
}

function addRoadMarkingBuildJobsToChunks(specs: Map<string, WorldChunkBuildSpec>, road: WorldRoad): void {
  const bounds = roadBounds(road);
  const profile = districtVisualProfiles[road.districtId] ?? districtVisualProfiles.starter_suburb;
  const laneMaterial = new THREE.MeshBasicMaterial({ color: profile.laneColor, transparent: true, opacity: 0.82 });
  const curbMaterial = new THREE.MeshBasicMaterial({ color: profile.curbColor, transparent: true, opacity: 0.72 });
  const horizontal = road.width >= road.depth;
  const dashLength = 2.1;
  const dashGap = 2.6;
  const y = 0.095;

  if (horizontal) {
    for (let x = bounds.minX + 1.2; x < bounds.maxX - 0.8; x += dashLength + dashGap) {
      const width = Math.min(dashLength, bounds.maxX - x - 0.8);
      const dashX = x + width / 2;
      addObjectBuildJobToWorldChunk(specs, () => {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.065), laneMaterial);
        dash.position.set(dashX, y, road.z);
        return dash;
      }, dashX, road.z);
    }

    for (const z of [bounds.minZ + 0.16, bounds.maxZ - 0.16]) {
      addRectMeshBuildJobsToWorldChunks(specs, { minX: bounds.minX, maxX: bounds.maxX, minZ: z - 0.025, maxZ: z + 0.025 }, y + 0.002, 0.014, curbMaterial);
    }
    return;
  }

  for (let z = bounds.minZ + 1.2; z < bounds.maxZ - 0.8; z += dashLength + dashGap) {
    const depth = Math.min(dashLength, bounds.maxZ - z - 0.8);
    const dashZ = z + depth / 2;
    addObjectBuildJobToWorldChunk(specs, () => {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.012, depth), laneMaterial);
      dash.position.set(road.x, y, dashZ);
      return dash;
    }, road.x, dashZ);
  }

  for (const x of [bounds.minX + 0.16, bounds.maxX - 0.16]) {
    addRectMeshBuildJobsToWorldChunks(specs, { minX: x - 0.025, maxX: x + 0.025, minZ: bounds.minZ, maxZ: bounds.maxZ }, y + 0.002, 0.014, curbMaterial);
  }
}

function createWorldDecoration(decoration: WorldDecoration, enableLocalLights: boolean, quality: GraphicsQuality): THREE.Group {
  const group = new THREE.Group();
  const color = decoration.color ?? "#94a3b8";
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.55, metalness: 0.12 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.08 });

  if (decoration.kind === "streetlight") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6, quality === "low" ? 6 : 10), darkMaterial);
    pole.position.y = 1.3;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.045, 0.06), darkMaterial);
    arm.position.set(0.24, 2.48, 0);
    arm.castShadow = true;
    group.add(arm);

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, quality === "low" ? 8 : 16, quality === "low" ? 6 : 8), new THREE.MeshBasicMaterial({ color }));
    lamp.position.set(0.55, 2.42, 0);
    group.add(lamp);

    if (enableLocalLights) {
      const light = new THREE.PointLight(color, 0.45, 5.5);
      light.position.copy(lamp.position);
      group.add(light);
    }

    if (quality === "high") {
      const cableCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.18, 2.36, 0),
        new THREE.Vector3(0.12, 2.48, 0.02),
        new THREE.Vector3(0.55, 2.42, 0)
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 10, 0.006, 5), darkMaterial);
      group.add(cable);
    }
  } else if (decoration.kind === "planter") {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.38), new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.78, metalness: 0.02 }));
    planter.position.y = 0.16;
    planter.castShadow = true;
    planter.receiveShadow = true;
    group.add(planter);

    const leafOffsets = quality === "low" ? [-0.26, 0.26] : quality === "high" ? [-0.38, -0.18, 0, 0.18, 0.38] : [-0.32, 0, 0.32];
    for (const x of leafOffsets) {
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, quality === "low" ? 5 : 7), accentMaterial);
      leaves.position.set(x, 0.54, Math.sin(x * 7) * 0.05);
      leaves.rotation.z = x * 0.18;
      leaves.castShadow = true;
      group.add(leaves);
    }
  } else if (decoration.kind === "dumpster") {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.78, 0.64), accentMaterial);
    bin.position.y = 0.42;
    bin.castShadow = true;
    bin.receiveShadow = true;
    group.add(bin);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.7), darkMaterial);
    lid.position.set(0, 0.86, -0.03);
    lid.rotation.x = -0.08;
    group.add(lid);

    for (const x of [-0.42, 0.42]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, quality === "low" ? 8 : 12), darkMaterial);
      wheel.position.set(x, 0.08, 0.35);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    }
    if (quality === "high") {
      const sideStencil = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.018), new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.42 }));
      sideStencil.position.set(0, 0.52, -0.33);
      group.add(sideStencil);
    }
  } else if (decoration.kind === "billboard") {
    const posts = [-0.48, 0.48].map((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.3, 10), darkMaterial);
      post.position.set(x, 0.65, 0);
      post.castShadow = true;
      return post;
    });
    group.add(...posts);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.78, 0.08), accentMaterial);
    board.position.y = 1.44;
    board.castShadow = true;
    group.add(board);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.08, 0.09), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
    stripe.position.set(0, 1.52, -0.05);
    group.add(stripe);
    if (quality === "high") {
      for (const x of [-0.48, 0, 0.48]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: "#fde68a" }));
        bulb.position.set(x, 1.9, -0.07);
        group.add(bulb);
      }
    }
  } else if (decoration.kind === "bollard") {
    for (const x of quality === "low" ? [-0.32, 0.32] : [-0.36, 0, 0.36]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.58, quality === "low" ? 8 : 12), darkMaterial);
      bollard.position.set(x, 0.31, 0);
      bollard.castShadow = true;
      group.add(bollard);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, quality === "low" ? 8 : 10, 6), new THREE.MeshBasicMaterial({ color }));
      cap.position.set(x, 0.62, 0);
      group.add(cap);
    }
  } else {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 0.38), accentMaterial);
    base.position.y = 0.36;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.035), new THREE.MeshBasicMaterial({ color: "#0f172a" }));
    panel.position.set(0, 0.48, -0.21);
    group.add(panel);
  }

  group.position.set(decoration.x, 0, decoration.z);
  group.rotation.y = decoration.rotationY;
  group.scale.setScalar(decoration.scale);
  return group;
}

function createDebugBox(box: CollisionBox): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(box.maxX - box.minX, 1.8, box.maxZ - box.minZ),
    new THREE.MeshBasicMaterial({ color: "#fb7185", transparent: true, opacity: 0.18, wireframe: true, depthWrite: false })
  );
  mesh.position.set((box.minX + box.maxX) / 2, 0.9, (box.minZ + box.maxZ) / 2);
  return mesh;
}

function createDebugRing(position: THREE.Vector3, radius: number, color: string): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.015, 6, 42),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
  );
  ring.position.set(position.x, 0.12, position.z);
  ring.rotation.x = Math.PI / 2;
  return ring;
}

function createDebugPath(path: THREE.Vector3[], color: string): THREE.Line | null {
  if (path.length < 2) {
    return null;
  }

  const points = [...path, path[0]].map((point) => new THREE.Vector3(point.x, 0.18, point.z));
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82 })
  );
}

function populateDebugOverlay(group: THREE.Group, currentState: GameState, interactables: Interactable[], animatedProps: THREE.Object3D[], layout: WorldMapLayout): void {
  clearGroup(group);

  for (const box of collisionBoxesForState(currentState, layout)) {
    group.add(createDebugBox(box));
  }

  for (const interactable of interactables) {
    const color = interactable.target.type === "machine"
      ? "#38bdf8"
      : interactable.target.type === "placement"
        ? "#a3e635"
        : interactable.target.type === "supplier"
          ? "#f59e0b"
          : "#2dd4bf";
    group.add(createDebugRing(interactable.position, interactable.radius, color));
  }

  for (const object of animatedProps) {
    const path = Array.isArray(object.userData.walkPath) ? object.userData.walkPath as THREE.Vector3[] : [];
    const line = createDebugPath(path, "#f8fafc");
    if (line) {
      group.add(line);
    }
  }
}

function districtAccessColor(access: DistrictAccess): string {
  if (access === "unlocked") {
    return "#2dd4bf";
  }

  if (access === "scouted") {
    return "#f59e0b";
  }

  return "#64748b";
}

function addDistrictAccessOverlays(group: THREE.Group, currentState: GameState): void {
  for (const district of Object.values(currentState.districts)) {
    const access = districtProgress(currentState, district.id).access;
    const color = districtAccessColor(access);
    const y = 0.16;
    const points = [
      new THREE.Vector3(district.bounds.minX, y, district.bounds.minZ),
      new THREE.Vector3(district.bounds.maxX, y, district.bounds.minZ),
      new THREE.Vector3(district.bounds.maxX, y, district.bounds.maxZ),
      new THREE.Vector3(district.bounds.minX, y, district.bounds.maxZ),
      new THREE.Vector3(district.bounds.minX, y, district.bounds.minZ)
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: access === "unlocked" ? 0.28 : 0.74 })
    );
    group.add(line);

    if (access !== "unlocked") {
      addLabel(
        group,
        access === "scouted" ? "SCOUTED" : "LOCKED",
        color,
        new THREE.Vector3((district.bounds.minX + district.bounds.maxX) / 2, 0, (district.bounds.minZ + district.bounds.maxZ) / 2),
        1.15
      );
    }
  }
}

function populateDynamicObjects(group: THREE.Group, currentState: GameState, guidanceLocationId: string | undefined, quality: GraphicsQuality, modelConfig: ModelConfig): Interactable[] {
  clearGroup(group);
  const interactables: Interactable[] = [];
  addDistrictAccessOverlays(group, currentState);
  const activeAlarmByMachine = new Map(activeMachineAlarms(currentState).map((alarm) => [alarm.machineId, alarm]));
  const activeConflictByLocation = new Map(activeConflictEvents(currentState).map((conflict) => [conflict.locationId, conflict]));
  const routePlanByLocation = new Map((optimizedRoutePlan(currentState)?.stops ?? []).map((stop) => [stop.locationId, stop]));

  for (const hotspot of neighborhoodHotspots) {
    const progress = districtProgress(currentState, hotspot.districtId);
    const marker = createNeighborhoodHotspotMarker(hotspot.color, hotspot.kind, progress.access);
    marker.position.set(hotspot.x, 0.02, hotspot.z);
    group.add(marker);
    addLabel(group, hotspot.label, hotspot.color, new THREE.Vector3(hotspot.x, 0, hotspot.z), progress.access === "locked" ? 1.55 : 1.72);
    interactables.push({
      radius: Math.max(1.25, Math.min(2.4, hotspot.radius * 0.28)),
      target: { type: "neighborhood", id: hotspot.id, label: hotspot.label },
      position: new THREE.Vector3(hotspot.x, 0, hotspot.z)
    });
  }

  for (const contact of crimeContacts) {
    const progress = districtProgress(currentState, contact.districtId);
    const marker = createCrimeContactMarker(contact.color, contact.kind, progress.access);
    marker.position.set(contact.x, 0.02, contact.z);
    group.add(marker);
    addLabel(group, contact.label, contact.color, new THREE.Vector3(contact.x, 0, contact.z), progress.access === "locked" ? 1.42 : 1.62);
    interactables.push({
      radius: Math.max(1.2, Math.min(2.2, contact.radius * 0.3)),
      target: { type: "crime_contact", id: contact.id, label: contact.label },
      position: new THREE.Vector3(contact.x, 0, contact.z)
    });
  }

  const rivalOperations = Object.values(currentState.rivalOrganizations ?? {}).flatMap((organization) => organization.operations.filter((operation) => !operation.resolvedHour));
  for (const operation of rivalOperations) {
    const location = currentState.locations[operation.locationId];
    const faction = currentState.factions[operation.factionId];
    if (!location || !faction) {
      continue;
    }

    const basePosition = new THREE.Vector3(location.position.x + 0.95, 0, location.position.z + 0.95);
    const marker = createRivalOperationMarker(faction.color, operation.progress, operation.exposed);
    marker.position.copy(basePosition);
    marker.position.y = 0.03;
    group.add(marker);
    group.add(createRivalCrewActor(operation, faction.color, basePosition, currentState.worldTimeHours, quality, modelConfig, operation.id.length));
    addLabel(group, `${faction.name.split(" ")[0]} OP`, operation.exposed ? "#fbbf24" : faction.color, basePosition, 1.78);
    interactables.push({
      radius: 1.55,
      target: { type: "rival_operation", id: operation.id, label: `${faction.name} operation` },
      position: basePosition
    });
  }

  activeDistrictEvents(currentState).slice(0, quality === "low" ? 2 : quality === "high" ? 5 : 4).forEach((event, index) => {
    const eventLocation = Object.values(currentState.locations)
      .filter((location) => location.districtId === event.districtId)
      .sort((a, b) => b.footTraffic - a.footTraffic)[0];
    if (!eventLocation) {
      return;
    }

    group.add(createDistrictEventMarker(event, eventLocation, currentState.worldTimeHours, quality, modelConfig, index));
  });

  for (const location of Object.values(currentState.locations)) {
    const position = new THREE.Vector3(location.position.x, 0, location.position.z);
    const machinePlacement = machinePlacementForLocation(location);
    const isGuidanceTarget = guidanceLocationId === location.id;
    const activeConflict = activeConflictByLocation.get(location.id);
    const routePlanStop = routePlanByLocation.get(location.id);
    const addGuidanceBeacon = (color: string, beaconPosition = position) => {
      if (!isGuidanceTarget) {
        return;
      }

      const beacon = createMissionBeacon(color);
      beacon.position.copy(beaconPosition);
      group.add(beacon);
      addLabel(group, "NEXT", color, beaconPosition, 3.75);
    };
    const addConflictMarker = (markerPosition = position) => {
      if (!activeConflict) {
        return;
      }

      const conflictRing = createRoutePressureRing("danger");
      conflictRing.position.set(markerPosition.x, 2.72, markerPosition.z);
      group.add(conflictRing);
      addLabel(
        group,
        activeConflict.kind === "base_raid" ? "BASE RAID" : activeConflict.kind === "route_ambush" ? "AMBUSH" : "CHASE",
        "#fb7185",
        markerPosition,
        3.42
      );
    };
    const addRoutePlanMarker = (markerPosition = position) => {
      if (!routePlanStop) {
        return;
      }

      const planRing = createRoutePressureRing(routePlanStop.task.tone);
      planRing.position.set(markerPosition.x, 2.48, markerPosition.z);
      planRing.scale.setScalar(0.74);
      group.add(planRing);
      addLabel(group, `ROUTE ${routePlanStop.order}`, routePlanStop.task.tone === "danger" ? "#fb7185" : routePlanStop.task.tone === "warning" ? "#facc15" : "#a3e635", markerPosition, 3.2);
    };

    if (location.kind === "garage") {
      const marker = addMarker("#38bdf8");
      marker.position.copy(position);
      group.add(marker);
      if (garageStorageUnits(currentState) > 0) {
        const storedProductIds = Object.entries(currentState.player.garageStorage)
          .filter(([, quantity]) => quantity > 0)
          .map(([productId]) => productId as ProductId);
        const storageBay = createStorageBay(storedProductIds, modelConfig);
        storageBay.position.set(position.x - 1.02, 0.02, position.z + 0.34);
        storageBay.rotation.y = 0.08;
        applyModelTransformById(storageBay, modelConfig, "machine.storage_bay");
        group.add(storageBay);
      }
      addLabel(group, location.name, "#38bdf8", position, 1.1);
      addGuidanceBeacon("#38bdf8");
      addConflictMarker(position);
      addRoutePlanMarker(position);
      interactables.push({ radius: 1.35, target: { type: "base", id: "garage", label: location.name }, position });
      continue;
    }

    if (location.kind === "supplier") {
      const marker = addMarker("#f59e0b");
      marker.position.copy(position);
      group.add(marker);
      const supplierStack = createCrateStack(["soda", "chips", "energy", "water", "coffee_can", "mystery_capsules", "mood_fizz", "phone_charger"], modelConfig);
      supplierStack.position.set(position.x - 0.76, 0.02, position.z - 0.2);
      supplierStack.rotation.y = 0.45;
      group.add(supplierStack);
      addLabel(group, location.name, "#f59e0b", position, 1.1);
      addGuidanceBeacon("#f59e0b");
      addConflictMarker(position);
      addRoutePlanMarker(position);
      interactables.push({ radius: 1.35, target: { type: "supplier", id: "supplier", label: location.name }, position });
      continue;
    }

    const machine = machineAtLocation(currentState, location.id);
    if (machine) {
      const owner = currentState.factions[machine.ownerFactionId];
      const pad = createMachinePlacementDressing(machinePlacement, owner?.color ?? "#94a3b8", true);
      applyModelTransformById(pad, modelConfig, "machine.placement_pad");
      group.add(pad);
      const machineGroup = createMachineMesh(owner?.color ?? "#94a3b8", machine.damage, machine.upgrades ?? [], quality, machineStockRatio(machine), stockedProductIds(machine));
      machineGroup.position.copy(machinePlacement.position);
      machineGroup.rotation.y = machinePlacement.rotationY;
      applyModelTransformById(machineGroup, modelConfig, "machine.vending");
      group.add(machineGroup);
      const servicePoint = machineInteractionPoint(machinePlacement);
      const pressure = machine.ownerFactionId === currentState.playerFactionId ? machineRoutePressure(currentState, machine) : undefined;
      const activeAlarm = activeAlarmByMachine.get(machine.id);
      if (pressure && pressure.score >= 2) {
        const pressureRing = createRoutePressureRing(pressure.tone);
        pressureRing.position.set(machinePlacement.position.x, 2.02, machinePlacement.position.z);
        group.add(pressureRing);
      }
      if (activeAlarm) {
        const alarmRing = createRoutePressureRing("danger");
        alarmRing.position.set(machinePlacement.position.x, 2.36, machinePlacement.position.z);
        group.add(alarmRing);
        addLabel(group, "ALARM", "#fb7185", machinePlacement.position, 3.08);
        group.add(createAlarmIntruderActor(machinePlacement, currentState.worldTimeHours, activeAlarm.startedHour, quality, modelConfig));
      }
      addLabel(group, machine.name, owner?.color ?? "#94a3b8", machinePlacement.position, 2.2);
      addGuidanceBeacon(owner?.color ?? "#94a3b8", machinePlacement.position);
      addConflictMarker(machinePlacement.position);
      addRoutePlanMarker(machinePlacement.position);
      interactables.push({ radius: 1.15, target: { type: "machine", id: machine.id, label: machine.name }, position: servicePoint });
    } else {
      const access = districtProgress(currentState, location.districtId).access;
      const markerColor = access === "unlocked" ? "#a3e635" : districtAccessColor(access);
      const pad = createMachinePlacementDressing(machinePlacement, markerColor, false);
      applyModelTransformById(pad, modelConfig, "machine.placement_pad");
      group.add(pad);
      const marker = addMarker(markerColor);
      marker.position.copy(machinePlacement.position);
      group.add(marker);
      addLabel(group, location.name, markerColor, machinePlacement.position, 1.1);
      addGuidanceBeacon(markerColor, machinePlacement.position);
      addConflictMarker(machinePlacement.position);
      addRoutePlanMarker(machinePlacement.position);
      interactables.push({ radius: 1.2, target: { type: "placement", id: location.id, label: location.name }, position: machinePlacement.position });
    }
  }

  const renderedActivities = selectRenderedActivities(currentState.streetLife?.recentActivities ?? [], currentState.worldTimeHours, quality);
  const activityMachineIds = new Set(renderedActivities.map((activity) => activity.machineId).filter((machineId): machineId is MachineId => Boolean(machineId)));

  Object.values(currentState.machines)
    .filter((machine) => (machine.placementStatus ?? "installed") === "installed")
    .filter((machine) => machine.damage < 96)
    .filter((machine) => !activeAlarmByMachine.has(machine.id))
    .filter((machine) => !activityMachineIds.has(machine.id))
    .sort((a, b) => {
      const aLocation = currentState.locations[a.locationId];
      const bLocation = currentState.locations[b.locationId];
      return (bLocation?.footTraffic ?? 0) + b.revenueStored * 0.004 - ((aLocation?.footTraffic ?? 0) + a.revenueStored * 0.004);
    })
    .slice(0, quality === "low" ? 2 : quality === "high" ? 5 : 4)
    .forEach((machine, index) => {
      const location = currentState.locations[machine.locationId];
      if (!location) {
        return;
      }

      group.add(createAmbientMachineActor(machine, location, index, currentState.worldTimeHours, quality, modelConfig));
    });

  renderedActivities
    .forEach((activity, index) => {
      const machine = activity.machineId ? currentState.machines[activity.machineId] : undefined;
      const location = machine ? currentState.locations[machine.locationId] : currentState.locations[activity.locationId];
      if (!location) {
        return;
      }

      const placement = machine ? machinePlacementForLocation(location) : { position: new THREE.Vector3(location.position.x, 0, location.position.z), rotationY: 0 };
      const servicePoint = machine ? machineInteractionPoint(placement) : placement.position;
      const bubble = createActivityBubble(activity);
      bubble.position.set(servicePoint.x, 2.62 + index * 0.16, servicePoint.z);
      bubble.userData.baseY = bubble.position.y;
      group.add(bubble);

      if (machine) {
        const pulse = createActivityPulse(activity);
        pulse.position.copy(servicePoint);
        pulse.userData.phase = index * 0.7;
        group.add(pulse);

        // Passive machine sales are a coin pop over the machine, not a customer
        // walking up — so skip the NPC actor for that kind.
        if (activity.kind !== "machine_sale") {
          const actor = createActivityActor(activity, placement, servicePoint, currentState.worldTimeHours, quality, modelConfig, index);
          actor.userData.phase = index * 0.9 + activity.hour;
          group.add(actor);
        }
      }
    });

  Object.values(currentState.employees ?? {})
    .filter((employee) => !employee.betrayed)
    .slice(0, quality === "low" ? 3 : quality === "high" ? 9 : 6)
    .forEach((employee, index) => {
      const location = employeeVisibleLocation(currentState, employee);
      if (!location) {
        return;
      }

      const actor = createEmployeeRouteActor(employee, location, currentState.worldTimeHours, quality, modelConfig, index);
      actor.userData.employeeId = employee.id;
      group.add(actor);
    });

  const vehicle = activeVehicle(currentState);
  const vehicleLocation = vehicle ? currentState.locations[vehicle.locationId] : undefined;
  if (vehicle) {
    const vehiclePlacement = activeVehiclePlacementForVehicle(vehicle, vehicleLocation);
    const vehiclePosition = vehiclePlacement.position;
    const vehicleRig = new THREE.Group();
    vehicleRig.userData.routeVehicleId = vehicle.id;
    vehicleRig.position.copy(vehiclePosition);
    vehicleRig.rotation.y = vehiclePlacement.rotationY;
    const vehicleGroup = createVehicleMesh(quality);
    applyModelTransformById(vehicleGroup, modelConfig, "vehicle.route_van");
    vehicleRig.add(vehicleGroup);

    const loadedProductIds = Object.entries(vehicle.inventory)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId]) => productId as ProductId);
    if (loadedProductIds.length > 0) {
      const trunkStack = createCrateStack(loadedProductIds, modelConfig);
      trunkStack.position.set(0.15, 0.76, 0);
      trunkStack.scale.setScalar(0.58);
      vehicleRig.add(trunkStack);
    }

    const drivePrompt = createLabelSprite("F DRIVE", "#d9f99d");
    drivePrompt.position.set(0, WORLD_SCALE.vehicle.height + 0.72, 0);
    drivePrompt.scale.set(0.72, 0.19, 1);
    vehicleRig.add(drivePrompt);
    const vehicleLabel = createLabelSprite(vehicle.name, "#d9f99d");
    vehicleLabel.position.set(0, WORLD_SCALE.vehicle.height + 0.38, 0);
    vehicleRig.add(vehicleLabel);
    group.add(vehicleRig);
    interactables.push({ radius: 2.4, target: { type: "vehicle", id: vehicle.id, label: vehicle.name }, position: vehiclePosition });
  }

  return interactables;
}

function setRouteVehicleRigPose(group: THREE.Group, vehicleId: string, position: THREE.Vector3, heading: number): void {
  group.traverse((object) => {
    if (object.userData.routeVehicleId === vehicleId) {
      object.position.copy(position);
      object.rotation.y = heading;
    }
  });
}

function activeVehicleDrivePose(currentState: GameState): { vehicle: RouteVehicle; placement: { position: THREE.Vector3; rotationY: number } } | null {
  const vehicle = activeVehicle(currentState);
  if (!vehicle) {
    return null;
  }

  return {
    vehicle,
    placement: activeVehiclePlacementForVehicle(vehicle, currentState.locations[vehicle.locationId])
  };
}

export function ThreeScene({ feedbackEvent, graphicsQuality, guidanceLocationId, mapLayout, modelConfig, state, onVehicleDrive, onPlayerPositionChange, onPlayerHeadingChange, onTargetChange }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const debugGroupRef = useRef<THREE.Group | null>(null);
  const feedbackGroupRef = useRef<THREE.Group | null>(null);
  const animatedPropsRef = useRef<THREE.Object3D[]>([]);
  const carriedCrateMountRef = useRef<THREE.Group | null>(null);
  const playerAvatarCargoMountRef = useRef<THREE.Group | null>(null);
  const carriedCrateSignatureRef = useRef<string | null>(null);
  const processedFeedbackIdRef = useRef<string | null>(null);
  const interactablesRef = useRef<Interactable[]>([]);
  const guidanceLocationIdRef = useRef(guidanceLocationId);
  const targetIdRef = useRef<string | null>(null);
  const onPlayerPositionChangeRef = useRef(onPlayerPositionChange);
  const onPlayerHeadingChangeRef = useRef(onPlayerHeadingChange);
  const onTargetChangeRef = useRef(onTargetChange);
  const onVehicleDriveRef = useRef(onVehicleDrive);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    guidanceLocationIdRef.current = guidanceLocationId;
  }, [guidanceLocationId]);

  useEffect(() => {
    onPlayerPositionChangeRef.current = onPlayerPositionChange;
  }, [onPlayerPositionChange]);

  useEffect(() => {
    onPlayerHeadingChangeRef.current = onPlayerHeadingChange;
  }, [onPlayerHeadingChange]);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    onVehicleDriveRef.current = onVehicleDrive;
  }, [onVehicleDrive]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const renderProfile = resolveGraphicsProfile(graphicsQuality, mapLayout);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a");
    scene.fog = new THREE.Fog(
      "#18243a",
      renderProfile.detail === "low" ? 24 : renderProfile.detail === "high" ? 44 : 34,
      renderProfile.detail === "low" ? 108 : renderProfile.detail === "high" ? 162 : 136
    );

    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 220);
    camera.position.set(0, 1.65, 0);
    camera.rotation.order = "YXZ";

    const yaw = new THREE.Object3D();
    yaw.position.set(-9, 0, 5.9);
    yaw.rotation.y = Math.PI;
    yaw.add(camera);
    scene.add(yaw);

    const carriedCrateMount = new THREE.Group();
    camera.add(carriedCrateMount);
    carriedCrateMountRef.current = carriedCrateMount;
    updateCarriedCrateMount(carriedCrateMount, stateRef.current.player.carriedCrate ?? null);

    const { avatar: playerAvatar, cargoMount: playerAvatarCargoMount } = createPlayerAvatar(renderProfile.detail);
    applyModelTransformById(playerAvatar, modelConfig, "unit.player");
    playerAvatar.visible = false;
    yaw.add(playerAvatar);
    playerAvatarCargoMountRef.current = playerAvatarCargoMount;
    updateCarriedCrateMount(playerAvatarCargoMount, stateRef.current.player.carriedCrate ?? null, "avatar");

    carriedCrateSignatureRef.current = stateRef.current.player.carriedCrate
      ? `${stateRef.current.player.carriedCrate.productId}:${stateRef.current.player.carriedCrate.quantity}:${stateRef.current.player.carriedCrate.source}`
      : null;

    const renderer = new THREE.WebGLRenderer({ antialias: !renderProfile.lowPower, powerPreference: renderProfile.lowPower ? "default" : "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderProfile.maxPixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = renderProfile.enableShadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Filmic tone mapping gives the night-city neon a proper highlight rolloff
    // instead of clipping flat to white. Exposure compensates for the mid-tone
    // darkening ACES introduces relative to the previous linear (NoToneMapping) look.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    mount.appendChild(renderer.domElement);

    // Environment map: clearcoat car paint and glass need something to reflect.
    // Without this, MeshPhysicalMaterial vehicles render as flat matte plastic.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envEquirect = createEnvironmentMapTexture(renderProfile.detail);
    const envTarget = pmrem.fromEquirectangular(envEquirect);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = renderProfile.detail === "low" ? 0.4 : 0.6;
    envEquirect.dispose();
    pmrem.dispose();

    scene.add(createSkyDome(renderProfile.detail));
    const atmosphere = createAtmosphere(renderProfile.detail, renderProfile.atmosphereParticles);
    scene.add(atmosphere);

    // hemi + key are driven dynamically by the day/night palette below (see the
    // animate loop). Construction values are immediately overwritten each frame.
    const hemi = new THREE.HemisphereLight("#dbeafe", "#172554", 1.2);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#bfdbfe", 1.6);
    keyLight.position.set(-8, 13, 7);
    keyLight.castShadow = renderProfile.enableShadows;
    if (renderProfile.shadowMapSize > 0) {
      keyLight.shadow.mapSize.set(renderProfile.shadowMapSize, renderProfile.shadowMapSize);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 70;
      keyLight.shadow.camera.left = -38;
      keyLight.shadow.camera.right = 38;
      keyLight.shadow.camera.top = 38;
      keyLight.shadow.camera.bottom = -38;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.025;
    }
    scene.add(keyLight);

    // Day/night palette endpoints, lerped each frame in the animate loop by the
    // night factor derived from state.worldTimeHours. Working color objects are
    // reused to avoid per-frame allocation.
    const dayHemiSky = new THREE.Color("#dbeafe");
    const nightHemiSky = new THREE.Color("#162033");
    const dayHemiGround = new THREE.Color("#33475f");
    const nightHemiGround = new THREE.Color("#0a1020");
    const dayKeyColor = new THREE.Color("#ffedd0");
    const nightKeyColor = new THREE.Color("#5878b4");
    const dayFogColor = new THREE.Color("#26374f");
    const nightFogColor = new THREE.Color("#080f1d");
    const dayBgColor = new THREE.Color("#1a2740");
    const nightBgColor = new THREE.Color("#05090f");
    const sceneFog = scene.fog as THREE.Fog;
    const sceneBackground = scene.background as THREE.Color;

    // Window/sign emissive materials (tagged in proceduralArt) that brighten at
    // night. Chunks are built once and only visibility-culled, so this registry is
    // append-only — no cleanup needed. lastNightApplied throttles bulk updates.
    const nightEmissiveMaterials: Array<{ material: THREE.Material & { emissiveIntensity: number }; day: number; night: number }> = [];
    let lastNightApplied = -1;

    // Static warm fill + cool rim from the polish pass — these complement the
    // day/night-driven key/hemi and give cars and buildings extra form.
    const fillLight = new THREE.DirectionalLight("#f7b079", 0.55);
    fillLight.position.set(11, 6, -9);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight("#86b6ff", 0.7);
    rimLight.position.set(5, 9, -13);
    scene.add(rimLight);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth + 10, worldDepth + 10), createAsphaltMaterial(renderProfile.detail));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(worldCenterX, 0, worldCenterZ);
    ground.receiveShadow = true;
    scene.add(ground);

    scene.add(createPerimeterWalls());

    scene.add(createDistrictTintOverlay(stateRef.current));

    const staticChunkSpecs = new Map<string, WorldChunkBuildSpec>();
    const staticChunks = new Map<string, WorldChunkRuntime>();
    const staticChunkQueue: string[] = [];
    const queuedStaticChunks = new Set<string>();
    const animatedProps: THREE.Object3D[] = [];
    const addStaticObject = (createObject: () => THREE.Object3D, x: number, z: number) => {
      addObjectBuildJobToWorldChunk(staticChunkSpecs, createObject, x, z);
    };
    const roadMaterial = createRoadMaterial(renderProfile.detail);
    const sidewalkMaterial = createSidewalkMaterial(renderProfile.detail);
    const sidewalks = sidewalkFootprintsForRoads(mapLayout.roads, mapLayout.buildings);

    for (const road of mapLayout.roads) {
      addRectMeshBuildJobsToWorldChunks(staticChunkSpecs, roadBounds(road), 0.025, 0.035, roadMaterial, (mesh) => {
        mesh.receiveShadow = true;
      });
      if (renderProfile.detail !== "low") {
        addRoadMarkingBuildJobsToChunks(staticChunkSpecs, road);
      }
    }

    for (const sidewalk of sidewalks) {
      addRectMeshBuildJobsToWorldChunks(
        staticChunkSpecs,
        {
          minX: sidewalk.x - sidewalk.width / 2,
          maxX: sidewalk.x + sidewalk.width / 2,
          minZ: sidewalk.z - sidewalk.depth / 2,
          maxZ: sidewalk.z + sidewalk.depth / 2
        },
        0.06,
        0.04,
        sidewalkMaterial,
        (mesh) => {
          mesh.receiveShadow = true;
        }
      );
    }

    const walkableInteriorLocationIds = walkableInteriorLocationIdsForLayout(mapLayout);
    for (const building of mapLayout.buildings) {
      if (building.locationId && walkableInteriorLocationIds.has(building.locationId)) {
        continue;
      }

      addStaticObject(() => {
        const buildingGroup = createBuilding(building.width, building.depth, building.height, building.style, building.signText, renderProfile.detail);
        buildingGroup.position.set(building.x, 0, building.z);
        // Turn the -Z storefront to face the building's street before the global
        // storefront transform is added on top (applyModelTransformById uses +=).
        buildingGroup.rotation.y += facingToRotationY(building.facing ?? "north");
        applyModelTransformById(buildingGroup, modelConfig, "building.storefront");
        return buildingGroup;
      }, building.x, building.z);
    }

    for (const interior of mapLayout.interiors) {
      addStaticObject(() => createInteriorCell(interior, renderProfile.detail), interior.x, interior.z);
    }

    mapLayout.backdropBuildings.slice(0, renderProfile.maxBackdropBuildings).forEach((building) => {
      addStaticObject(() => {
        const backdrop = createBackdropBuilding(building, renderProfile.detail);
        applyModelTransformById(backdrop, modelConfig, "building.backdrop");
        return backdrop;
      }, building.x, building.z);
    });

    if (mapLayout.parks && mapLayout.parks.length > 0) {
      const parkMaterials = {
        grass: createGrassMaterial(renderProfile.detail),
        path: createParkPathMaterial(renderProfile.detail),
        pond: createPondMaterial()
      };
      for (const park of mapLayout.parks) {
        buildParkIntoChunks(park, staticChunkSpecs, addStaticObject, parkMaterials, renderProfile.detail, renderProfile.enableLocalLights);
      }
    }

    mapLayout.patrolZones.slice(0, renderProfile.maxPatrolZones).forEach((zone) => {
      addStaticObject(() => createPatrolZone(zone), zone.x, zone.z);
    });

    for (const decoration of mapLayout.decorations.slice(0, renderProfile.decorationLimit)) {
      addStaticObject(() => {
        const decorationGroup = createWorldDecoration(decoration, renderProfile.enableLocalLights, renderProfile.detail);
        applyModelTransformById(decorationGroup, modelConfig, `prop.${decoration.kind}`);
        return decorationGroup;
      }, decoration.x, decoration.z);
    }

    for (const label of districtLabels) {
      const district = stateRef.current.districts[label.districtId];
      if (district) {
        addStaticObject(() => {
          const labelGroup = new THREE.Group();
          const profile = districtVisualProfiles[label.districtId] ?? districtVisualProfiles.starter_suburb;
          const marker = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34, 0.34, 0.08, 24),
            new THREE.MeshBasicMaterial({ color: profile.accentColor, transparent: true, opacity: 0.75 })
          );
          marker.position.y = 0.09;
          labelGroup.add(marker);
          addLabel(labelGroup, district.name, label.color, new THREE.Vector3(0, 0, 0), 1.35);
          labelGroup.position.set(label.x, 0, label.z);
          return labelGroup;
        }, label.x, label.z);
      }
    }

    const streetProps = createStreetProps({
      enableLocalLights: renderProfile.enableLocalLights,
      maxNpcs: renderProfile.maxAmbientNpcs,
      quality: renderProfile.detail
    });
    streetProps.traverse((object) => {
      if (object.userData.floatSpeed) {
        animatedProps.push(object);
      }
    });
    [...streetProps.children].forEach((child) => {
      const worldPosition = new THREE.Vector3();
      child.getWorldPosition(worldPosition);
      addStaticObject(() => child, worldPosition.x, worldPosition.z);
    });

    const trafficLayer = createTrafficLayer(mapLayout.trafficLoops, mapLayout.roads, renderProfile.maxTrafficLoops, renderProfile.enableShadows, renderProfile.detail, modelConfig);
    animatedProps.push(...trafficLayer.animated);
    const policePatrolLayer = createPolicePatrolLayer(mapLayout.policePatrolPaths, renderProfile.maxPolicePatrols, renderProfile.detail, modelConfig);
    animatedProps.push(...policePatrolLayer.animated);
    animatedPropsRef.current = animatedProps;
    scene.add(trafficLayer.group);
    scene.add(policePatrolLayer.group);

    const activeChunkRadius = renderProfile.chunkRadius;
    const preloadChunkRadius = activeChunkRadius + 1;
    const chunkBuildBudgetMs = renderProfile.lowPower ? 2.5 : renderProfile.detail === "high" ? 6 : 4;
    const chunksPerFrame = renderProfile.lowPower ? 1 : renderProfile.detail === "high" ? 3 : 2;
    enqueueWorldChunksNear(staticChunkSpecs, staticChunks, staticChunkQueue, queuedStaticChunks, yaw.position, preloadChunkRadius);
    processWorldChunkBuildQueue(staticChunkSpecs, staticChunks, scene, staticChunkQueue, queuedStaticChunks, chunksPerFrame, chunkBuildBudgetMs);
    updateWorldChunkVisibility(staticChunks.values(), yaw.position, activeChunkRadius);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    const feedbackGroup = new THREE.Group();
    scene.add(feedbackGroup);
    feedbackGroupRef.current = feedbackGroup;

    const debugGroup = new THREE.Group();
    debugGroup.visible = false;
    scene.add(debugGroup);
    debugGroupRef.current = debugGroup;

    const keys = new Set<string>();
    let cameraMode: CameraMode = "first";
    let debugVisible = false;
    let drivingVehicleId: string | null = null;
    let vehicleVelocity = 0;
    let vehicleHeading = 0;
    let drivenDistanceSinceSync = 0;
    let lastVehicleDriveEmit = 0;
    let pitch = 0;
    let verticalVelocity = 0;
    let grounded = true;
    let lastTime = performance.now();
    let lastChunkVisibilityUpdate = 0;
    let lastPositionEmit = 0;
    let disposed = false;
    applyCameraMode(camera, playerAvatar, carriedCrateMount, cameraMode, pitch);

    const updateDynamicObjects = () => {
      if (!dynamicGroupRef.current) {
        return;
      }

      interactablesRef.current = populateDynamicObjects(dynamicGroupRef.current, stateRef.current, guidanceLocationIdRef.current, renderProfile.detail, modelConfig);
      if (debugVisible && debugGroupRef.current) {
        populateDebugOverlay(debugGroupRef.current, stateRef.current, interactablesRef.current, animatedProps, mapLayout);
      }
    };

    updateDynamicObjects();

    const syncDrivenVehicleVisual = () => {
      const dynamicGroupCurrent = dynamicGroupRef.current;
      if (!dynamicGroupCurrent || !drivingVehicleId) {
        return;
      }

      setRouteVehicleRigPose(dynamicGroupCurrent, drivingVehicleId, yaw.position, vehicleHeading);
    };

    const emitVehicleDrive = (force = false) => {
      if (!drivingVehicleId || !onVehicleDriveRef.current) {
        return;
      }

      const now = performance.now();
      if (!force && now - lastVehicleDriveEmit < 260 && drivenDistanceSinceSync < 1.2) {
        return;
      }

      onVehicleDriveRef.current(
        drivingVehicleId,
        { x: yaw.position.x, z: yaw.position.z },
        vehicleHeading,
        drivenDistanceSinceSync
      );
      drivenDistanceSinceSync = 0;
      lastVehicleDriveEmit = now;
    };

    const enterVehicle = () => {
      const pose = activeVehicleDrivePose(stateRef.current);
      if (!pose) {
        return;
      }

      const distanceToVehicle = yaw.position.distanceTo(pose.placement.position);
      if (distanceToVehicle > 3.2) {
        return;
      }

      drivingVehicleId = pose.vehicle.id;
      targetIdRef.current = null;
      vehicleVelocity = 0;
      vehicleHeading = pose.placement.rotationY;
      yaw.position.copy(pose.placement.position);
      yaw.rotation.y = vehicleHeading;
      cameraMode = "third";
      pitch = THREE.MathUtils.clamp(pitch, -0.45, 0.35);
      playerAvatar.visible = false;
      carriedCrateMount.visible = false;
      applyCameraMode(camera, playerAvatar, carriedCrateMount, cameraMode, pitch);
      syncDrivenVehicleVisual();
      onTargetChangeRef.current(null);
    };

    const exitVehicle = () => {
      if (!drivingVehicleId) {
        return;
      }

      emitVehicleDrive(true);
      const side = new THREE.Vector3(Math.cos(vehicleHeading), 0, -Math.sin(vehicleHeading));
      yaw.position.add(side.multiplyScalar(2.1));
      clampToWorld(yaw.position);
      drivingVehicleId = null;
      vehicleVelocity = 0;
      cameraMode = "first";
      pitch = 0;
      applyCameraMode(camera, playerAvatar, carriedCrateMount, cameraMode, pitch);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyF" && !event.repeat) {
        event.preventDefault();
        if (drivingVehicleId) {
          exitVehicle();
        } else {
          enterVehicle();
        }
        return;
      }

      if (event.code === "KeyV" && !event.repeat) {
        if (drivingVehicleId) {
          return;
        }
        cameraMode = cameraMode === "first" ? "third" : "first";
        applyCameraMode(camera, playerAvatar, carriedCrateMount, cameraMode, pitch);
        return;
      }

      if ((event.code === "F3" || event.code === "Backquote") && !event.repeat) {
        debugVisible = !debugVisible;
        debugGroup.visible = debugVisible;
        if (debugVisible) {
          populateDebugOverlay(debugGroup, stateRef.current, interactablesRef.current, animatedProps, mapLayout);
        }
        event.preventDefault();
        return;
      }

      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      const isUiControl = Boolean(eventTarget?.closest("input, textarea, select, button, [contenteditable='true']"));
      if (event.code === "Space" && !isUiControl && !drivingVehicleId) {
        event.preventDefault();
        if (!event.repeat && grounded) {
          verticalVelocity = playerJumpVelocity;
          grounded = false;
        }
      }

      keys.add(event.code);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) {
        return;
      }

      yaw.rotation.y -= event.movementX * 0.0022;
      pitch = THREE.MathUtils.clamp(
        pitch - event.movementY * 0.002,
        cameraMode === "third" ? -0.95 : -1.2,
        cameraMode === "third" ? 0.85 : 1.2
      );
      applyCameraMode(camera, playerAvatar, carriedCrateMount, cameraMode, pitch);
    };

    const onCanvasClick = () => {
      renderer.domElement.requestPointerLock();
    };

    const onResize = () => {
      if (!mountRef.current) {
        return;
      }

      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    const updateTarget = () => {
      if (drivingVehicleId) {
        if (targetIdRef.current !== null) {
          targetIdRef.current = null;
          onTargetChangeRef.current(null);
        }
        return;
      }

      const cameraWorld = new THREE.Vector3();
      camera.getWorldPosition(cameraWorld);
      const targetOrigin = cameraMode === "third"
        ? new THREE.Vector3(yaw.position.x, yaw.position.y + 1.35, yaw.position.z)
        : cameraWorld;
      const forward = new THREE.Vector3();
      if (cameraMode === "third") {
        forward.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.rotation.y).normalize();
      } else {
        camera.getWorldDirection(forward);
      }

      let best: Interactable | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const interactable of interactablesRef.current) {
        const toTarget = interactable.position.clone().sub(targetOrigin);
        const distance = toTarget.length();
        const maxDistance = interactable.radius + (cameraMode === "third" ? 2.9 : 2.45);
        if (distance > maxDistance) {
          continue;
        }

        const alignment = forward.dot(toTarget.normalize());
        if (distance > interactable.radius + 1.2 && alignment < 0.32) {
          continue;
        }

        if (distance > interactable.radius + 0.45 && alignment < -0.08) {
          continue;
        }

        const score = Math.max(0, distance - interactable.radius) - alignment * 1.25;
        if (score < bestScore) {
          bestScore = score;
          best = interactable;
        }
      }

      const nextId = best ? `${best.target.type}:${best.target.id}` : null;
      if (targetIdRef.current !== nextId) {
        targetIdRef.current = nextId;
        onTargetChangeRef.current(best?.target ?? null);
      }
    };

    const animate = (time: number) => {
      if (disposed) {
        return;
      }

      const delta = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      const currentState = stateRef.current;

      // Day/night cycle: drive the cheap global lights, fog and background from
      // the world clock so the city visibly shifts from daylight to a moody night.
      const night = nightFactorForHour(currentState.worldTimeHours);
      hemi.color.copy(dayHemiSky).lerp(nightHemiSky, night);
      hemi.groundColor.copy(dayHemiGround).lerp(nightHemiGround, night);
      hemi.intensity = THREE.MathUtils.lerp(1.35, 0.5, night);
      keyLight.color.copy(dayKeyColor).lerp(nightKeyColor, night);
      keyLight.intensity = THREE.MathUtils.lerp(1.95, 0.45, night);
      keyLight.position.set(-8, THREE.MathUtils.lerp(15, 6, night), 7);
      // Warm sodium-street fill rises after dark; the cool rim firms up silhouettes.
      fillLight.intensity = THREE.MathUtils.lerp(0.18, 0.7, night);
      rimLight.intensity = THREE.MathUtils.lerp(0.4, 0.85, night);
      sceneFog.color.copy(dayFogColor).lerp(nightFogColor, night);
      sceneBackground.copy(dayBgColor).lerp(nightBgColor, night);

      // Register any newly-built chunks' window/sign emissives and set them to the
      // current night level immediately (so chunks streamed in at night look right).
      for (const chunk of staticChunks.values()) {
        if (!chunk.built || chunk.group.userData.nightRegistered) {
          continue;
        }
        chunk.group.userData.nightRegistered = true;
        chunk.group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.material) {
            return;
          }
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            const tag = material.userData?.nightEmissive as { day: number; night: number } | undefined;
            if (tag) {
              const entry = { material: material as THREE.Material & { emissiveIntensity: number }, day: tag.day, night: tag.night };
              nightEmissiveMaterials.push(entry);
              entry.material.emissiveIntensity = THREE.MathUtils.lerp(tag.day, tag.night, night);
            }
          }
        });
      }
      // Re-lerp all registered emissives only when the night level shifts meaningfully.
      if (Math.abs(night - lastNightApplied) > 0.02) {
        for (const entry of nightEmissiveMaterials) {
          entry.material.emissiveIntensity = THREE.MathUtils.lerp(entry.day, entry.night, night);
        }
        lastNightApplied = night;
      }

      const carriedUnits = carriedCrateUnits(currentState);
      const carryLoadRatio = currentState.player.carriedCrate ? carriedUnits / Math.max(1, currentState.player.cargoCapacity) : 0;
      const carryPenalty = currentState.player.carriedCrate ? Math.min(0.38, 0.08 + carryLoadRatio * 0.3) : 0;
      const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7.5 : 4.2) * (1 - carryPenalty);
      const direction = new THREE.Vector3();

      let playerMoved = false;
      if (drivingVehicleId) {
        const acceleration = 9.8;
        const reverseAcceleration = 5.2;
        const brake = keys.has("Space") ? 12 : 0;
        const maxForward = 14.5 * Math.max(0.45, activeVehicle(stateRef.current)?.speed ?? 1);
        const maxReverse = -4.2;

        if (keys.has("KeyW") || keys.has("ArrowUp")) {
          vehicleVelocity += acceleration * delta;
        }
        if (keys.has("KeyS") || keys.has("ArrowDown")) {
          vehicleVelocity -= reverseAcceleration * delta;
        }
        if (brake > 0) {
          const brakeAmount = brake * delta;
          vehicleVelocity = Math.abs(vehicleVelocity) <= brakeAmount ? 0 : vehicleVelocity - Math.sign(vehicleVelocity) * brakeAmount;
        }

        vehicleVelocity *= Math.pow(0.985, delta * 60);
        vehicleVelocity = THREE.MathUtils.clamp(vehicleVelocity, maxReverse, maxForward);

        const steeringInput = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + (keys.has("KeyD") || keys.has("ArrowRight") ? -1 : 0);
        if (steeringInput !== 0 && Math.abs(vehicleVelocity) > 0.2) {
          const steeringStrength = 1.32 * THREE.MathUtils.clamp(Math.abs(vehicleVelocity) / 7, 0.25, 1);
          vehicleHeading += steeringInput * steeringStrength * delta * Math.sign(vehicleVelocity);
        }

        yaw.rotation.y = vehicleHeading;
        const driveForward = new THREE.Vector3(-Math.sin(vehicleHeading), 0, -Math.cos(vehicleHeading));
        const movement = driveForward.multiplyScalar(vehicleVelocity * delta);
        const before = yaw.position.clone();
        if (movement.lengthSq() > 0.000001) {
          playerMoved = movePlayerWithCollision(yaw.position, movement, collisionBoxesForState(stateRef.current, mapLayout, { excludeVehicleId: drivingVehicleId }));
          if (!playerMoved) {
            vehicleVelocity *= -0.16;
          } else {
            drivenDistanceSinceSync += before.distanceTo(yaw.position);
          }
        }

        yaw.position.y = playerGroundY;
        verticalVelocity = 0;
        grounded = true;
        syncDrivenVehicleVisual();
        emitVehicleDrive();
        if (targetIdRef.current !== null) {
          targetIdRef.current = null;
          onTargetChangeRef.current(null);
        }
      } else {
        if (keys.has("KeyW") || keys.has("ArrowUp")) direction.z -= 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) direction.z += 1;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) direction.x -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) direction.x += 1;

        if (direction.lengthSq() > 0) {
          direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.rotation.y);
          const movement = direction.multiplyScalar(speed * delta);
          playerMoved = movePlayerWithCollision(yaw.position, movement, collisionBoxesForState(stateRef.current, mapLayout));
        }
      }

      if (!drivingVehicleId && (!grounded || verticalVelocity > 0)) {
        verticalVelocity += playerGravity * delta;
        yaw.position.y += verticalVelocity * delta;
        if (yaw.position.y <= playerGroundY) {
          yaw.position.y = playerGroundY;
          verticalVelocity = 0;
          grounded = true;
        }
      }

      updateNpcRig(playerAvatar, time, playerMoved ? speed / 4.2 : 1, playerMoved || !grounded);

      if (time - lastPositionEmit > 180) {
        lastPositionEmit = time;
        onPlayerPositionChangeRef.current({ x: yaw.position.x, z: yaw.position.z });
        onPlayerHeadingChangeRef.current(THREE.MathUtils.radToDeg(-yaw.rotation.y));
      }

      const shouldRefreshChunks = playerMoved || time - lastChunkVisibilityUpdate > 500 || staticChunkQueue.length === 0;
      if (shouldRefreshChunks) {
        enqueueWorldChunksNear(staticChunkSpecs, staticChunks, staticChunkQueue, queuedStaticChunks, yaw.position, preloadChunkRadius);
      }
      const chunksBuilt = processWorldChunkBuildQueue(
        staticChunkSpecs,
        staticChunks,
        scene,
        staticChunkQueue,
        queuedStaticChunks,
        chunksPerFrame,
        chunkBuildBudgetMs
      );
      if (shouldRefreshChunks || chunksBuilt > 0) {
        lastChunkVisibilityUpdate = time;
        updateWorldChunkVisibility(staticChunks.values(), yaw.position, activeChunkRadius);
      }

      atmosphere.rotation.y += delta * 0.015;
      dynamicGroup.traverse((object) => {
        if (object.userData.beacon) {
          const pulse = 1 + Math.sin(time * 0.004) * 0.08;
          object.scale.set(pulse, 1, pulse);
          object.rotation.y += delta * 0.65;
        }

        if (object.userData.routePressure) {
          const pulse = 1 + Math.sin(time * 0.006) * 0.12;
          object.scale.set(pulse, pulse, pulse);
          object.rotation.y -= delta * 0.8;
        }

        if (object.userData.activityPulse) {
          const phase = typeof object.userData.phase === "number" ? object.userData.phase : 0;
          const pulse = 1 + Math.sin(time * 0.01 + phase) * 0.14;
          object.scale.set(pulse, 1, pulse);
          object.rotation.y += delta * 1.1;
        }

        if (object.userData.activityBubble) {
          const baseY = typeof object.userData.baseY === "number" ? object.userData.baseY : object.position.y;
          object.position.y = baseY + Math.sin(time * 0.004) * 0.035;
        }

        if (object.userData.dynamicNpc) {
          updateAnimatedStreetProp(object, time);
        }
      });
      for (const object of animatedProps) {
        if (object.userData.trafficLoop) {
          updateTrafficVehicle(object, time);
        } else {
          updateAnimatedStreetProp(object, time);
        }
      }
      updateFeedbackEffects(feedbackGroup, time);

      updateTarget();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("click", onCanvasClick);
    const animationId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      clearGroup(dynamicGroup);
      disposeObject(scene);
      envTarget.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      dynamicGroupRef.current = null;
      debugGroupRef.current = null;
      feedbackGroupRef.current = null;
      animatedPropsRef.current = [];
      carriedCrateMountRef.current = null;
      playerAvatarCargoMountRef.current = null;
      carriedCrateSignatureRef.current = null;
      interactablesRef.current = [];
    };
  }, [graphicsQuality, mapLayout, modelConfig]);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) {
      return;
    }

    interactablesRef.current = populateDynamicObjects(dynamicGroup, state, guidanceLocationId, graphicsQuality, modelConfig);
    const debugGroup = debugGroupRef.current;
    if (debugGroup?.visible) {
      populateDebugOverlay(debugGroup, state, interactablesRef.current, animatedPropsRef.current, mapLayout);
    }
  }, [graphicsQuality, guidanceLocationId, mapLayout, modelConfig, state]);

  useEffect(() => {
    const feedbackGroup = feedbackGroupRef.current;
    if (!feedbackGroup || !feedbackEvent || processedFeedbackIdRef.current === feedbackEvent.id) {
      return;
    }

    processedFeedbackIdRef.current = feedbackEvent.id;
    const effect = createSceneFeedbackEffect(feedbackEvent, state, graphicsQuality);
    if (effect) {
      feedbackGroup.add(effect);
    }
  }, [feedbackEvent, graphicsQuality, state]);

  useEffect(() => {
    const mount = carriedCrateMountRef.current;
    const avatarMount = playerAvatarCargoMountRef.current;
    if (!mount) {
      return;
    }

    const crate = state.player.carriedCrate ?? null;
    const signature = crate ? `${crate.productId}:${crate.quantity}:${crate.source}` : null;
    if (carriedCrateSignatureRef.current === signature) {
      return;
    }

    carriedCrateSignatureRef.current = signature;
    updateCarriedCrateMount(mount, crate);
    if (avatarMount) {
      updateCarriedCrateMount(avatarMount, crate, "avatar");
    }
  }, [state.player.carriedCrate]);

  return <div className="scene-mount" ref={mountRef} aria-label="3D district view" />;
}
