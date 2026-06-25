import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { DistrictAccess, GameState, GameEventTone, Location, MachineUpgradeId, ProductId, StockCrate, StreetActivity, VendingMachine } from "../../game/core/types";
import { activeConflictEvents, activeMachineAlarms, activeVehicle, carriedCrateUnits, districtProgress, garageStorageUnits, machineAtLocation, machineRoutePressure } from "../../game/core/selectors";
import {
  districtLabels,
  districtVisualProfiles,
  machinePlacementAnchors,
  worldBounds,
  type CityBackdropBuilding,
  type PatrolZone,
  type PolicePatrolPath,
  type TrafficLoop,
  type WorldDecoration,
  type WorldInterior,
  type WorldMapLayout,
  type WorldRoad
} from "../../game/content/world";
import { pathOnRoads, roadBounds } from "../../game/world/roadGraph";
import type { SceneFeedbackEvent, SceneTarget } from "./SceneTargets";
import { createAsphaltMaterial, createAtmosphere, createBuilding, createNpcCharacter, createRoadMaterial, createSidewalkMaterial, createSkyDome, createStreetProps } from "./proceduralArt";

interface ThreeSceneProps {
  feedbackEvent?: SceneFeedbackEvent | null;
  guidanceLocationId?: string;
  mapLayout: WorldMapLayout;
  state: GameState;
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
  group: THREE.Group;
  indexX: number;
  indexZ: number;
  key: string;
}

interface FeedbackRuntime {
  baseScale: number;
  createdAt: number;
  duration: number;
  kind: SceneFeedbackEvent["kind"];
  startY: number;
}

interface SceneRenderProfile {
  enableLocalLights: boolean;
  enableShadows: boolean;
  lowPower: boolean;
  maxAmbientNpcs: number;
  maxBackdropBuildings: number;
  maxPixelRatio: number;
  maxPolicePatrols: number;
  maxTrafficLoops: number;
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

const playerRadius = 0.36;
const worldWidth = worldBounds.maxX - worldBounds.minX;
const worldDepth = worldBounds.maxZ - worldBounds.minZ;
const worldCenterX = (worldBounds.minX + worldBounds.maxX) / 2;
const worldCenterZ = (worldBounds.minZ + worldBounds.maxZ) / 2;
const worldChunkSize = 24;

function detectRenderProfile(layout: WorldMapLayout): SceneRenderProfile {
  const cores = navigator.hardwareConcurrency || 4;
  const mobileViewport = window.matchMedia("(max-width: 860px), (max-height: 620px)").matches;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const highMemory = typeof deviceMemory === "number" && deviceMemory >= 8;
  const highTier = cores >= 8 && highMemory && !mobileViewport;
  const lowPower = !highTier;

  return {
    enableLocalLights: highTier,
    enableShadows: highTier,
    lowPower,
    maxAmbientNpcs: lowPower ? 7 : 12,
    maxBackdropBuildings: lowPower ? 16 : layout.backdropBuildings.length,
    maxPixelRatio: lowPower ? 1.1 : 1.5,
    maxPolicePatrols: lowPower ? 2 : layout.policePatrolPaths.length,
    maxTrafficLoops: lowPower ? 5 : layout.trafficLoops.length
  };
}

function chunkIndexForCoordinate(value: number, min: number): number {
  return Math.floor((value - min) / worldChunkSize);
}

function chunkKey(indexX: number, indexZ: number): string {
  return `${indexX}:${indexZ}`;
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

  const chunk = { group, indexX, indexZ, key };
  chunks.set(key, chunk);
  return chunk;
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

function updateWorldChunkVisibility(chunks: Iterable<WorldChunkRuntime>, position: THREE.Vector3, radius: number): void {
  const currentIndexX = chunkIndexForCoordinate(position.x, worldBounds.minX);
  const currentIndexZ = chunkIndexForCoordinate(position.z, worldBounds.minZ);

  for (const chunk of chunks) {
    chunk.group.visible = Math.abs(chunk.indexX - currentIndexX) <= radius && Math.abs(chunk.indexZ - currentIndexZ) <= radius;
  }
}

function machineFrontVector(rotationY: number): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(rotationY), 0, -Math.cos(rotationY));
}

function machineInteractionPoint(placement: { position: THREE.Vector3; rotationY: number }): THREE.Vector3 {
  return placement.position.clone().add(machineFrontVector(placement.rotationY).multiplyScalar(0.82));
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
    .map((building) => collisionBoxFromCenter(building.x, building.z, building.width, building.depth));
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

function collisionBoxesForState(currentState: GameState, layout: WorldMapLayout): CollisionBox[] {
  const boxes = [...buildingCollisionBoxesForLayout(layout)];

  for (const location of Object.values(currentState.locations)) {
    if (machineAtLocation(currentState, location.id)) {
      boxes.push(machineCollisionBox(machinePlacementForLocation(location)));
    }
  }

  const vehicle = activeVehicle(currentState);
  const vehicleLocation = vehicle ? currentState.locations[vehicle.locationId] : undefined;
  if (vehicle && vehicleLocation) {
    boxes.push(collisionBoxFromCenter(vehicleLocation.position.x + 1.15, vehicleLocation.position.z + 0.88, 2.35, 1.2));
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
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, 12);
    context.fillRect(0, canvas.height - 12, canvas.width, 12);
    context.fillStyle = damage > 70 ? "#fecdd3" : "#f8fafc";
    context.font = "900 46px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = color;
    context.shadowBlur = damage > 70 ? 0 : 16;
    context.fillText("VEND", canvas.width / 2, 52);
    context.shadowBlur = 0;
    context.fillStyle = "#cbd5e1";
    context.font = "700 18px Inter, system-ui, sans-serif";
    context.fillText(damage > 70 ? "SERVICE NEEDED" : "COLD STOCK", canvas.width / 2, 92);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMachineMesh(color: string, damage: number, installedUpgrades: MachineUpgradeId[] = []): THREE.Group {
  const group = new THREE.Group();
  const upgrades = new Set(installedUpgrades);
  const trimMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.12 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.44, metalness: 0.08 });
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
  const productColors = ["#ef4444", "#22c55e", "#f59e0b", "#38bdf8", "#e879f9", "#f8fafc"];
  for (let row = 0; row < 3; row += 1) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.03), shelfMaterial);
    shelf.position.set(-0.08, 0.84 + row * 0.22, -0.3);
    group.add(shelf);

    for (let col = 0; col < 4; col += 1) {
      const product = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.115, 0.04),
        new THREE.MeshStandardMaterial({ color: productColors[(row * 2 + col) % productColors.length], roughness: 0.46, metalness: 0.04 })
      );
      product.position.set(-0.245 + col * 0.11, 0.91 + row * 0.22, -0.312);
      group.add(product);

      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 16), new THREE.MeshBasicMaterial({ color: "#cbd5e1" }));
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
    new THREE.MeshBasicMaterial({ color: damage > 75 ? "#7f1d1d" : "#22d3ee" })
  );
  display.position.set(0.26, 1.36, -0.304);
  group.add(display);

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
  }

  return group;
}

function createStockCrateMesh(productId: ProductId, quantity: number, compact = false): THREE.Group {
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

  return group;
}

function createCrateStack(productIds: ProductId[]): THREE.Group {
  const group = new THREE.Group();
  productIds.slice(0, 5).forEach((productId, index) => {
    const crate = createStockCrateMesh(productId, 6);
    crate.position.set((index % 3) * 0.46 - 0.46, 0.22 + Math.floor(index / 3) * 0.34, Math.floor(index / 3) * 0.18);
    crate.rotation.y = (index % 2 === 0 ? 0.08 : -0.1);
    group.add(crate);
  });
  return group;
}

function createStorageBay(productIds: ProductId[]): THREE.Group {
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

  const stack = createCrateStack(productIds);
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

function createVehicleMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#d9f99d", roughness: 0.48, metalness: 0.08 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.42, metalness: 0.12 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: "#bae6fd", roughness: 0.08, transparent: true, opacity: 0.72 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.72, 1.04), bodyMaterial);
  body.position.y = 0.58;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 0.92), bodyMaterial);
  cab.position.set(-0.66, 1.17, 0);
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.36, 0.66), glassMaterial);
  windshield.position.set(-1.09, 1.2, 0);
  group.add(windshield);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.1, 0.035), new THREE.MeshBasicMaterial({ color: "#2dd4bf" }));
  stripe.position.set(0.08, 0.66, -0.54);
  group.add(stripe);

  for (const x of [-0.68, 0.74]) {
    for (const z of [-0.56, 0.56]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 20), trimMaterial);
      wheel.position.set(x, 0.24, z);
      wheel.rotation.x = Math.PI / 2;
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  const headlightMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a" });
  for (const z of [-0.34, 0.34]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.16), headlightMaterial);
    light.position.set(-1.2, 0.66, z);
    group.add(light);
  }

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
  if (activity.kind === "customer_purchase") {
    return activity.amount ? `SALE +$${Math.round(activity.amount)}` : "SALE";
  }

  if (activity.kind === "customer_complaint") {
    return "EMPTY";
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

  if (activity.kind === "customer_purchase") {
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

  return group;
}

function activityActorVariant(activity: StreetActivity): "customer" | "rival" | "scout" | "worker" {
  if (activity.actor === "worker") {
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

function createActivityActor(activity: StreetActivity, placement: { position: THREE.Vector3; rotationY: number }, servicePoint: THREE.Vector3, currentWorldTime: number): THREE.Group {
  const variant = activityActorVariant(activity);
  const character = createNpcCharacter(variant);
  const front = machineFrontVector(placement.rotationY).normalize();
  const side = new THREE.Vector3(-front.z, 0, front.x);
  const sideDirection = activity.id.charCodeAt(activity.id.length - 1) % 2 === 0 ? 1 : -1;
  const approach = servicePoint.clone().add(front.clone().multiplyScalar(1.45));
  const start = approach.clone().add(side.clone().multiplyScalar(1.6 * sideDirection));
  const stop = servicePoint.clone().add(front.clone().multiplyScalar(activity.kind === "rival_scout" ? 1.25 : 0.42));
  const exit = approach.clone().add(side.clone().multiplyScalar(-1.8 * sideDirection)).add(front.clone().multiplyScalar(0.55));

  character.position.copy(start);
  character.scale.setScalar(activity.kind === "customer_complaint" ? 1.02 : 0.96);
  character.userData.action = activity.kind === "worker_supply" ? "carry" : activity.kind === "rival_scout" ? "scan" : "walk";
  character.userData.baseY = 0;
  character.userData.dynamicNpc = true;
  character.userData.floatAmount = 0.006;
  character.userData.floatSpeed = 1.15;
  character.userData.pathOffset = Math.max(0, currentWorldTime - activity.hour) * 7 + activity.id.length * 0.37;
  character.userData.phase = activity.hour * 0.7 + activity.id.length;
  character.userData.walkPath = [start, stop, stop.clone().add(front.clone().multiplyScalar(0.2)), exit];
  character.userData.walkSpeed = activity.kind === "rival_scout" ? 0.26 : activity.kind === "worker_supply" ? 0.34 : 0.42;

  if (activity.kind === "customer_complaint") {
    const complaint = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({ color: "#fb7185" })
    );
    complaint.position.set(0.18, 1.55, -0.15);
    character.add(complaint);
  }

  return character;
}

function createAmbientMachineActor(machine: VendingMachine, location: Location, index: number, currentWorldTime: number): THREE.Group {
  const variant = machine.ownerFactionId === "player" ? "customer" : "rival";
  const character = createNpcCharacter(variant);
  const placement = machinePlacementForLocation(location);
  const servicePoint = machineInteractionPoint(placement);
  const front = machineFrontVector(placement.rotationY).normalize();
  const side = new THREE.Vector3(-front.z, 0, front.x);
  const sideDirection = index % 2 === 0 ? 1 : -1;
  const trafficOffset = Math.max(0.7, location.footTraffic) * 0.24;
  const start = servicePoint.clone().add(front.clone().multiplyScalar(1.1 + trafficOffset)).add(side.clone().multiplyScalar((1.35 + index * 0.08) * sideDirection));
  const linger = servicePoint.clone().add(front.clone().multiplyScalar(0.55 + trafficOffset * 0.25));
  const exit = servicePoint.clone().add(front.clone().multiplyScalar(1.32 + trafficOffset)).add(side.clone().multiplyScalar((-1.45 - index * 0.06) * sideDirection));

  character.position.copy(start);
  character.scale.setScalar(machine.ownerFactionId === "player" ? 0.92 : 0.98);
  character.userData.action = index % 3 === 0 ? "pace" : "walk";
  character.userData.baseY = 0;
  character.userData.dynamicNpc = true;
  character.userData.floatAmount = 0.004;
  character.userData.floatSpeed = 0.9;
  character.userData.pathOffset = currentWorldTime * 0.13 + index * 0.27 + machine.id.length * 0.05;
  character.userData.phase = index * 0.8 + machine.lastServicedHour * 0.13;
  character.userData.walkPath = [start, linger, linger.clone().add(side.clone().multiplyScalar(0.25 * sideDirection)), exit];
  character.userData.walkSpeed = 0.11 + Math.min(0.12, location.footTraffic * 0.035);
  return character;
}

function createAlarmIntruderActor(placement: { position: THREE.Vector3; rotationY: number }, currentWorldTime: number, startedHour: number): THREE.Group {
  const character = createNpcCharacter("rival");
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

  const warning = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), new THREE.MeshBasicMaterial({ color: "#fb7185" }));
  warning.position.set(0, 1.62, 0);
  character.add(warning);
  return character;
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
    return "REPAIRED";
  }

  if (event.kind === "upgrade") {
    return "UPGRADE";
  }

  if (event.kind === "sabotage") {
    return "JAMMED";
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

function createSceneFeedbackEffect(event: SceneFeedbackEvent, currentState: GameState): THREE.Group | null {
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
    duration: event.kind === "district" ? 2400 : event.kind === "install" || event.kind === "scout" ? 1900 : 1450,
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
    const ghost = createMachineMesh("#2dd4bf", 0);
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
    child.scale.setScalar(runtime.baseScale * (1 + Math.sin(progress * Math.PI) * 0.16));

    child.traverse((object) => {
      if (object.userData.feedbackRing) {
        object.scale.set(1 + progress * 1.4, 1 + progress * 1.4, 1 + progress * 1.4);
      }

      if (object.userData.feedbackCoin || object.userData.feedbackSpark) {
        const phase = typeof object.userData.phase === "number" ? object.userData.phase : 0;
        object.position.y += Math.sin(time * 0.012 + phase) * 0.003;
        object.rotation.y += 0.04;
      }

      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        const materials = object instanceof THREE.Sprite ? [object.material] : Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.transparent = true;
          material.opacity = Math.min(material.opacity, Math.max(0, 1 - Math.max(0, progress - 0.65) / 0.35));
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

function createPlayerAvatar(): { avatar: THREE.Group; cargoMount: THREE.Group } {
  const avatar = createNpcCharacter("worker");
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

function addInteriorProps(group: THREE.Group, interior: WorldInterior): void {
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

  const shell = createMachineMesh("#64748b", 82);
  shell.position.set(0.55, 0.02, -0.65);
  shell.rotation.y = 0.08;
  shell.scale.setScalar(0.62);
  group.add(shell);
}

function createInteriorCell(interior: WorldInterior): THREE.Group {
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

  addInteriorProps(group, interior);
  addLabel(group, interior.label, profile.accentColor, new THREE.Vector3(0, 0, 0), 2.72);
  group.position.set(interior.x, 0, interior.z);
  return group;
}

function createBackdropBuilding(definition: CityBackdropBuilding): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.84, metalness: 0.05 });
  const trimMaterial = new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.5 });
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

  const rows = Math.max(2, Math.min(8, Math.floor(definition.height / 1.15)));
  const cols = Math.max(2, Math.min(6, Math.floor(definition.width / 0.85)));
  const frontZ = -definition.depth / 2 - 0.012;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = ((row * 5 + col * 3 + Math.round(definition.x + definition.z)) % 10) / 10 < definition.lit;
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.018), lit ? litMaterial : darkWindowMaterial);
      window.position.set(
        -definition.width / 2 + 0.42 + col * ((definition.width - 0.84) / Math.max(1, cols - 1)),
        0.78 + row * ((definition.height - 1.4) / Math.max(1, rows - 1)),
        frontZ
      );
      group.add(window);
    }
  }

  const lobbyGlow = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(definition.width * 0.55, 2.1), 0.42, 0.024),
    new THREE.MeshBasicMaterial({ color: litMaterial.color, transparent: true, opacity: 0.28 + definition.lit * 0.18 })
  );
  lobbyGlow.position.set(0, 0.54, frontZ - 0.005);
  group.add(lobbyGlow);

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

function createPolicePatrolOfficer(patrol: PolicePatrolPath): THREE.Group {
  const officer = createNpcCharacter("scout");
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

  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.028), new THREE.MeshBasicMaterial({ color: patrol.color }));
  badge.position.set(-0.08, 1.08, -0.235);
  officer.add(badge);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.055, 16), new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.48, metalness: 0.08 }));
  cap.position.set(0, 1.48, -0.005);
  officer.add(cap);

  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.04), new THREE.MeshBasicMaterial({ color: "#020617" }));
  radio.position.set(0.23, 1.02, -0.2);
  officer.add(radio);
  return officer;
}

function createPolicePatrolLayer(patrols: PolicePatrolPath[], maxPatrols: number): { animated: THREE.Object3D[]; group: THREE.Group } {
  const group = new THREE.Group();
  const animated: THREE.Object3D[] = [];

  patrols.slice(0, maxPatrols).forEach((patrol) => {
    const officer = createPolicePatrolOfficer(patrol);
    group.add(officer);
    animated.push(officer);
  });

  return { animated, group };
}

function createTrafficVehicleMesh(loop: TrafficLoop, enableShadows: boolean): THREE.Group {
  const group = new THREE.Group();
  const bodyColor = loop.kind === "police" ? "#f8fafc" : loop.color;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.48, metalness: 0.08 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.52, metalness: 0.18 });
  const glassMaterial = new THREE.MeshBasicMaterial({ color: "#bae6fd", transparent: true, opacity: 0.58 });
  const length = loop.kind === "delivery" ? 2.65 : loop.kind === "police" ? 2.28 : 2.05;
  const width = loop.kind === "delivery" ? 1.08 : loop.kind === "police" ? 1.02 : 0.92;
  const bodyHeight = loop.kind === "delivery" ? 0.68 : 0.52;
  const cabHeight = loop.kind === "delivery" ? 0.62 : 0.5;
  const cabDepth = loop.kind === "delivery" ? 0.92 : 0.72;

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, bodyHeight, length), bodyMaterial);
  body.position.y = 0.3 + bodyHeight / 2;
  body.castShadow = enableShadows;
  body.receiveShadow = enableShadows;
  group.add(body);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, cabHeight, cabDepth), glassMaterial);
  cab.position.set(0, body.position.y + bodyHeight / 2 + cabHeight / 2 - 0.08, -length * 0.16);
  group.add(cab);

  if (loop.kind === "police") {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.1, length + 0.045), new THREE.MeshBasicMaterial({ color: "#1d4ed8" }));
    stripe.position.set(0, body.position.y + 0.02, 0);
    group.add(stripe);
    const lightbar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.16), new THREE.MeshBasicMaterial({ color: "#ef4444" }));
    lightbar.position.set(0, cab.position.y + cabHeight / 2 + 0.07, -0.08);
    group.add(lightbar);
    group.userData.emergencyLight = lightbar;
  }

  if (loop.kind === "delivery") {
    const cargoLine = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.09, 1.18), new THREE.MeshBasicMaterial({ color: "#451a03" }));
    cargoLine.position.set(0, body.position.y + 0.08, 0.25);
    group.add(cargoLine);
  }

  for (const x of [-width / 2 - 0.05, width / 2 + 0.05]) {
    for (const z of [-length * 0.32, length * 0.34]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), trimMaterial);
      wheel.position.set(x, 0.22, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = enableShadows;
      group.add(wheel);
    }
  }

  const headlightMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.76 });
  for (const x of [-width * 0.24, width * 0.24]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.022), headlightMaterial);
    light.position.set(x, body.position.y + 0.02, -length / 2 - 0.015);
    group.add(light);
  }

  return group;
}

function createTrafficLayer(loops: TrafficLoop[], roads: WorldRoad[], maxLoops: number, enableShadows: boolean): { animated: THREE.Object3D[]; group: THREE.Group } {
  const group = new THREE.Group();
  const animated: THREE.Object3D[] = [];

  loops.filter((loop) => pathOnRoads(loop.path, roads)).slice(0, maxLoops).forEach((loop) => {
    const vehicle = createTrafficVehicleMesh(loop, enableShadows);
    const start = loop.path[0];
    vehicle.position.set(start.x, 0.02, start.z);
    vehicle.userData.trafficLoop = true;
    vehicle.userData.walkPath = loop.path.map((point) => new THREE.Vector3(point.x, 0.02, point.z));
    vehicle.userData.walkSpeed = loop.speed;
    vehicle.userData.pathOffset = loop.phase;
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

function createWorldDecoration(decoration: WorldDecoration, enableLocalLights: boolean): THREE.Group {
  const group = new THREE.Group();
  const color = decoration.color ?? "#94a3b8";
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.55, metalness: 0.12 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.08 });

  if (decoration.kind === "streetlight") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6, 10), darkMaterial);
    pole.position.y = 1.3;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.045, 0.06), darkMaterial);
    arm.position.set(0.24, 2.48, 0);
    arm.castShadow = true;
    group.add(arm);

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color }));
    lamp.position.set(0.55, 2.42, 0);
    group.add(lamp);

    if (enableLocalLights) {
      const light = new THREE.PointLight(color, 0.45, 5.5);
      light.position.copy(lamp.position);
      group.add(light);
    }
  } else if (decoration.kind === "planter") {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.38), new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.78, metalness: 0.02 }));
    planter.position.y = 0.16;
    planter.castShadow = true;
    planter.receiveShadow = true;
    group.add(planter);

    for (const x of [-0.32, 0, 0.32]) {
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 7), accentMaterial);
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
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 12), darkMaterial);
      wheel.position.set(x, 0.08, 0.35);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
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
  } else if (decoration.kind === "bollard") {
    for (const x of [-0.36, 0, 0.36]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.58, 12), darkMaterial);
      bollard.position.set(x, 0.31, 0);
      bollard.castShadow = true;
      group.add(bollard);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 6), new THREE.MeshBasicMaterial({ color }));
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

function sidewalkStripsForRoad(road: WorldRoad): Array<{ depth: number; width: number; x: number; z: number }> {
  const sidewalkWidth = 1.9;
  if (road.width >= road.depth) {
    const offset = road.depth / 2 + sidewalkWidth / 2;
    return [
      { x: road.x, z: road.z - offset, width: road.width, depth: sidewalkWidth },
      { x: road.x, z: road.z + offset, width: road.width, depth: sidewalkWidth }
    ];
  }

  const offset = road.width / 2 + sidewalkWidth / 2;
  return [
    { x: road.x - offset, z: road.z, width: sidewalkWidth, depth: road.depth },
    { x: road.x + offset, z: road.z, width: sidewalkWidth, depth: road.depth }
  ];
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

function populateDynamicObjects(group: THREE.Group, currentState: GameState, guidanceLocationId?: string): Interactable[] {
  clearGroup(group);
  const interactables: Interactable[] = [];
  addDistrictAccessOverlays(group, currentState);
  const activeAlarmByMachine = new Map(activeMachineAlarms(currentState).map((alarm) => [alarm.machineId, alarm]));
  const activeConflictByLocation = new Map(activeConflictEvents(currentState).map((conflict) => [conflict.locationId, conflict]));

  for (const location of Object.values(currentState.locations)) {
    const position = new THREE.Vector3(location.position.x, 0, location.position.z);
    const machinePlacement = machinePlacementForLocation(location);
    const isGuidanceTarget = guidanceLocationId === location.id;
    const activeConflict = activeConflictByLocation.get(location.id);
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

    if (location.kind === "garage") {
      const marker = addMarker("#38bdf8");
      marker.position.copy(position);
      group.add(marker);
      if (garageStorageUnits(currentState) > 0) {
        const storedProductIds = Object.entries(currentState.player.garageStorage)
          .filter(([, quantity]) => quantity > 0)
          .map(([productId]) => productId as ProductId);
        const storageBay = createStorageBay(storedProductIds);
        storageBay.position.set(position.x - 1.02, 0.02, position.z + 0.34);
        storageBay.rotation.y = 0.08;
        group.add(storageBay);
      }
      addLabel(group, location.name, "#38bdf8", position, 1.1);
      addGuidanceBeacon("#38bdf8");
      addConflictMarker(position);
      interactables.push({ radius: 1.35, target: { type: "base", id: "garage", label: location.name }, position });
      continue;
    }

    if (location.kind === "supplier") {
      const marker = addMarker("#f59e0b");
      marker.position.copy(position);
      group.add(marker);
      const supplierStack = createCrateStack(["soda", "chips", "energy", "water", "coffee_can", "mystery_capsules", "mood_fizz", "phone_charger"]);
      supplierStack.position.set(position.x - 0.76, 0.02, position.z - 0.2);
      supplierStack.rotation.y = 0.45;
      group.add(supplierStack);
      addLabel(group, location.name, "#f59e0b", position, 1.1);
      addGuidanceBeacon("#f59e0b");
      addConflictMarker(position);
      interactables.push({ radius: 1.35, target: { type: "supplier", id: "supplier", label: location.name }, position });
      continue;
    }

    const machine = machineAtLocation(currentState, location.id);
    if (machine) {
      const owner = currentState.factions[machine.ownerFactionId];
      const machineGroup = createMachineMesh(owner?.color ?? "#94a3b8", machine.damage, machine.upgrades ?? []);
      machineGroup.position.copy(machinePlacement.position);
      machineGroup.rotation.y = machinePlacement.rotationY;
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
        group.add(createAlarmIntruderActor(machinePlacement, currentState.worldTimeHours, activeAlarm.startedHour));
      }
      addLabel(group, machine.name, owner?.color ?? "#94a3b8", machinePlacement.position, 2.2);
      addGuidanceBeacon(owner?.color ?? "#94a3b8", machinePlacement.position);
      addConflictMarker(machinePlacement.position);
      interactables.push({ radius: 1.15, target: { type: "machine", id: machine.id, label: machine.name }, position: servicePoint });
    } else {
      const access = districtProgress(currentState, location.districtId).access;
      const markerColor = access === "unlocked" ? "#a3e635" : districtAccessColor(access);
      const marker = addMarker(markerColor);
      marker.position.copy(machinePlacement.position);
      group.add(marker);
      addLabel(group, location.name, markerColor, machinePlacement.position, 1.1);
      addGuidanceBeacon(markerColor, machinePlacement.position);
      addConflictMarker(machinePlacement.position);
      interactables.push({ radius: 1.2, target: { type: "placement", id: location.id, label: location.name }, position: machinePlacement.position });
    }
  }

  Object.values(currentState.machines)
    .filter((machine) => (machine.placementStatus ?? "installed") === "installed")
    .filter((machine) => machine.damage < 96)
    .filter((machine) => !activeAlarmByMachine.has(machine.id))
    .sort((a, b) => {
      const aLocation = currentState.locations[a.locationId];
      const bLocation = currentState.locations[b.locationId];
      return (bLocation?.footTraffic ?? 0) + b.revenueStored * 0.004 - ((aLocation?.footTraffic ?? 0) + a.revenueStored * 0.004);
    })
    .slice(0, 7)
    .forEach((machine, index) => {
      const location = currentState.locations[machine.locationId];
      if (!location) {
        return;
      }

      group.add(createAmbientMachineActor(machine, location, index, currentState.worldTimeHours));
    });

  const recentActivities = currentState.streetLife?.recentActivities ?? [];
  recentActivities
    .filter((activity) => currentState.worldTimeHours - activity.hour <= 1.25)
    .slice(0, 8)
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

        const actor = createActivityActor(activity, placement, servicePoint, currentState.worldTimeHours);
        actor.userData.phase = index * 0.9 + activity.hour;
        group.add(actor);
      }
    });

  const vehicle = activeVehicle(currentState);
  const vehicleLocation = vehicle ? currentState.locations[vehicle.locationId] : undefined;
  if (vehicle && vehicleLocation) {
    const vehiclePosition = new THREE.Vector3(vehicleLocation.position.x + 1.15, 0, vehicleLocation.position.z + 0.88);
    const vehicleGroup = createVehicleMesh();
    vehicleGroup.position.copy(vehiclePosition);
    vehicleGroup.rotation.y = vehicleLocation.id === "garage" || vehicleLocation.position.z > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(vehicleGroup);

    const loadedProductIds = Object.entries(vehicle.inventory)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId]) => productId as ProductId);
    if (loadedProductIds.length > 0) {
      const trunkStack = createCrateStack(loadedProductIds);
      trunkStack.position.set(vehiclePosition.x + 0.15, 0.58, vehiclePosition.z);
      trunkStack.scale.setScalar(0.58);
      trunkStack.rotation.y = vehicleGroup.rotation.y;
      group.add(trunkStack);
    }

    addLabel(group, vehicle.name, "#d9f99d", vehiclePosition, 1.65);
  }

  return interactables;
}

export function ThreeScene({ feedbackEvent, guidanceLocationId, mapLayout, state, onPlayerPositionChange, onPlayerHeadingChange, onTargetChange }: ThreeSceneProps) {
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
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const renderProfile = detectRenderProfile(mapLayout);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a");
    scene.fog = new THREE.Fog("#18243a", renderProfile.lowPower ? 28 : 38, renderProfile.lowPower ? 122 : 148);

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

    const { avatar: playerAvatar, cargoMount: playerAvatarCargoMount } = createPlayerAvatar();
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
    mount.appendChild(renderer.domElement);

    scene.add(createSkyDome());
    const atmosphere = createAtmosphere();
    scene.add(atmosphere);

    const hemi = new THREE.HemisphereLight("#dbeafe", "#172554", 1.05);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#bfdbfe", 1.45);
    keyLight.position.set(-8, 13, 7);
    keyLight.castShadow = renderProfile.enableShadows;
    keyLight.shadow.mapSize.set(renderProfile.lowPower ? 512 : 1024, renderProfile.lowPower ? 512 : 1024);
    scene.add(keyLight);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth + 10, worldDepth + 10), createAsphaltMaterial());
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(worldCenterX, 0, worldCenterZ);
    ground.receiveShadow = true;
    scene.add(ground);

    const staticChunks = new Map<string, WorldChunkRuntime>();
    const addStaticObject = (object: THREE.Object3D, x: number, z: number) => {
      addObjectToWorldChunk(staticChunks, scene, object, x, z);
    };
    const roadMaterial = createRoadMaterial();
    const sidewalkMaterial = createSidewalkMaterial();
    const sidewalks = mapLayout.roads.flatMap(sidewalkStripsForRoad);

    for (const road of mapLayout.roads) {
      addRectMeshesToWorldChunks(staticChunks, scene, roadBounds(road), 0.025, 0.035, roadMaterial, (mesh) => {
        mesh.receiveShadow = true;
      });
      addRoadMarkingsToChunks(staticChunks, scene, road);
    }

    for (const sidewalk of sidewalks) {
      addRectMeshesToWorldChunks(
        staticChunks,
        scene,
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

      const buildingGroup = createBuilding(building.width, building.depth, building.height, building.style, building.signText);
      buildingGroup.position.set(building.x, 0, building.z);
      addStaticObject(buildingGroup, building.x, building.z);
    }

    for (const interior of mapLayout.interiors) {
      addStaticObject(createInteriorCell(interior), interior.x, interior.z);
    }

    mapLayout.backdropBuildings.slice(0, renderProfile.maxBackdropBuildings).forEach((building) => {
      addStaticObject(createBackdropBuilding(building), building.x, building.z);
    });

    mapLayout.patrolZones.slice(0, renderProfile.lowPower ? 2 : mapLayout.patrolZones.length).forEach((zone) => {
      addStaticObject(createPatrolZone(zone), zone.x, zone.z);
    });

    for (const decoration of mapLayout.decorations) {
      addStaticObject(createWorldDecoration(decoration, renderProfile.enableLocalLights), decoration.x, decoration.z);
    }

    for (const label of districtLabels) {
      const district = stateRef.current.districts[label.districtId];
      if (district) {
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
        addStaticObject(labelGroup, label.x, label.z);
      }
    }

    const streetProps = createStreetProps({
      enableLocalLights: renderProfile.enableLocalLights,
      maxNpcs: renderProfile.maxAmbientNpcs
    });
    const animatedProps: THREE.Object3D[] = [];
    streetProps.traverse((object) => {
      if (object.userData.floatSpeed) {
        animatedProps.push(object);
      }
    });
    [...streetProps.children].forEach((child) => {
      const worldPosition = new THREE.Vector3();
      child.getWorldPosition(worldPosition);
      addStaticObject(child, worldPosition.x, worldPosition.z);
    });

    const trafficLayer = createTrafficLayer(mapLayout.trafficLoops, mapLayout.roads, renderProfile.maxTrafficLoops, renderProfile.enableShadows);
    animatedProps.push(...trafficLayer.animated);
    const policePatrolLayer = createPolicePatrolLayer(mapLayout.policePatrolPaths, renderProfile.maxPolicePatrols);
    animatedProps.push(...policePatrolLayer.animated);
    animatedPropsRef.current = animatedProps;
    scene.add(trafficLayer.group);
    scene.add(policePatrolLayer.group);

    const staticChunkRuntimes = Array.from(staticChunks.values());
    const activeChunkRadius = renderProfile.lowPower ? 1 : 2;
    updateWorldChunkVisibility(staticChunkRuntimes, yaw.position, activeChunkRadius);

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
    let pitch = 0;
    let lastTime = performance.now();
    let lastChunkVisibilityUpdate = 0;
    let lastPositionEmit = 0;
    let disposed = false;
    applyCameraMode(camera, playerAvatar, carriedCrateMount, cameraMode, pitch);

    const updateDynamicObjects = () => {
      if (!dynamicGroupRef.current) {
        return;
      }

      interactablesRef.current = populateDynamicObjects(dynamicGroupRef.current, stateRef.current, guidanceLocationIdRef.current);
      if (debugVisible && debugGroupRef.current) {
        populateDebugOverlay(debugGroupRef.current, stateRef.current, interactablesRef.current, animatedProps, mapLayout);
      }
    };

    updateDynamicObjects();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyV" && !event.repeat) {
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
      const cameraWorld = new THREE.Vector3();
      camera.getWorldPosition(cameraWorld);
      const targetOrigin = cameraMode === "third"
        ? new THREE.Vector3(yaw.position.x, 1.35, yaw.position.z)
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
      const carriedUnits = carriedCrateUnits(currentState);
      const carryLoadRatio = currentState.player.carriedCrate ? carriedUnits / Math.max(1, currentState.player.cargoCapacity) : 0;
      const carryPenalty = currentState.player.carriedCrate ? Math.min(0.38, 0.08 + carryLoadRatio * 0.3) : 0;
      const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7.5 : 4.2) * (1 - carryPenalty);
      const direction = new THREE.Vector3();

      if (keys.has("KeyW") || keys.has("ArrowUp")) direction.z -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) direction.z += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) direction.x -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) direction.x += 1;

      let playerMoved = false;
      if (direction.lengthSq() > 0) {
        direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.rotation.y);
        const movement = direction.multiplyScalar(speed * delta);
        playerMoved = movePlayerWithCollision(yaw.position, movement, collisionBoxesForState(stateRef.current, mapLayout));
      }
      updateNpcRig(playerAvatar, time, playerMoved ? speed / 4.2 : 1, playerMoved);

      if (time - lastPositionEmit > 180) {
        lastPositionEmit = time;
        onPlayerPositionChangeRef.current({ x: yaw.position.x, z: yaw.position.z });
        onPlayerHeadingChangeRef.current(THREE.MathUtils.radToDeg(-yaw.rotation.y));
      }

      if (playerMoved || time - lastChunkVisibilityUpdate > 500) {
        lastChunkVisibilityUpdate = time;
        updateWorldChunkVisibility(staticChunkRuntimes, yaw.position, activeChunkRadius);
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
  }, [mapLayout]);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) {
      return;
    }

    interactablesRef.current = populateDynamicObjects(dynamicGroup, state, guidanceLocationId);
    const debugGroup = debugGroupRef.current;
    if (debugGroup?.visible) {
      populateDebugOverlay(debugGroup, state, interactablesRef.current, animatedPropsRef.current, mapLayout);
    }
  }, [guidanceLocationId, mapLayout, state]);

  useEffect(() => {
    const feedbackGroup = feedbackGroupRef.current;
    if (!feedbackGroup || !feedbackEvent || processedFeedbackIdRef.current === feedbackEvent.id) {
      return;
    }

    processedFeedbackIdRef.current = feedbackEvent.id;
    const effect = createSceneFeedbackEffect(feedbackEvent, state);
    if (effect) {
      feedbackGroup.add(effect);
    }
  }, [feedbackEvent, state]);

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
