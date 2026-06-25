import { AlertTriangle, Building2, CircleDot, Copy, Eye, Gauge, History, Map, Music, Plus, Redo2, RotateCcw, RotateCw, Route, Save, Square, Trash2, Trees, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import * as THREE from "three";
import type { AudioConfig } from "../game/content/audioConfig";
import { districts, machinePlacementAnchors, worldBounds, type BuildingVisualStyle, type WorldDecorationKind, type WorldMapLayout } from "../game/content/world";
import { createDefaultWorldMapLayout, validateWorldMapLayout } from "../game/world/mapLayoutStorage";
import {
  loadAdminMonitoring,
  loadRemoteMapRevisions,
  clearStoredAdminSession,
  loadStoredAdminSession,
  loginAdmin,
  restoreRemoteMapRevision,
  resetRemoteMapLayout,
  saveRemoteMapLayout,
  type AdminMonitoringSnapshot,
  type AdminSession,
  type RemoteMapRevision
} from "../game/save/api";
import { createBuilding } from "../render/three/proceduralArt";
import { AdminAudioEditor } from "./AdminAudioEditor";

type EditableLayer = "roads" | "buildings" | "backdropBuildings" | "decorations" | "patrolZones";
type AdminViewMode = "2d" | "3d";
type AdminTab = "map" | "audio";

interface AdminMapEditorProps {
  initialAudioConfig: AudioConfig;
  initialLayout: WorldMapLayout;
  onAudioReset: (config: AudioConfig) => void;
  onAudioSave: (config: AudioConfig) => void;
  onReset: () => void;
  onSave: (layout: WorldMapLayout) => void;
}

interface Selection {
  index: number;
  layer: EditableLayer;
}

interface DragState extends Selection {
  offsetX: number;
  offsetZ: number;
}

interface AdminThreeMapEditorProps {
  activeLayer: EditableLayer;
  layout: WorldMapLayout;
  onEditStart: () => void;
  onMove: (target: Selection, patch: Record<string, unknown>, options?: { recordHistory?: boolean }) => void;
  onSelect: (target: Selection) => void;
  selection: Selection;
  snapEnabled: boolean;
  snapStep: number;
}

const editableLayers: Array<{ description: string; icon: ReactNode; id: EditableLayer; label: string }> = [
  { id: "roads", label: "Roads", description: "Driveable asphalt. Buildings should stay outside these rectangles.", icon: <Route size={16} aria-hidden="true" /> },
  { id: "buildings", label: "Buildings", description: "Playable storefronts and landmarks with collision and signs.", icon: <Building2 size={16} aria-hidden="true" /> },
  { id: "decorations", label: "Props", description: "Street detail such as lights, planters, dumpsters, and bollards.", icon: <Trees size={16} aria-hidden="true" /> },
  { id: "patrolZones", label: "Patrols", description: "Police/rival area markers used to place patrol activity.", icon: <CircleDot size={16} aria-hidden="true" /> },
  { id: "backdropBuildings", label: "Backdrops", description: "Non-playable skyline blocks used to fill distant city space.", icon: <Square size={16} aria-hidden="true" /> }
];

const buildingStyles: BuildingVisualStyle[] = ["garage", "supplier", "laundromat", "gym", "arcade", "transit", "rival"];
const decorationKinds: WorldDecorationKind[] = ["billboard", "bollard", "dumpster", "planter", "streetlight", "utility_box"];
const layerColors: Record<EditableLayer, string> = {
  roads: "#64748b",
  buildings: "#2dd4bf",
  decorations: "#f59e0b",
  patrolZones: "#93c5fd",
  backdropBuildings: "#94a3b8"
};
const buildingStyleColors: Record<BuildingVisualStyle, string> = {
  arcade: "#7c3aed",
  garage: "#64748b",
  gym: "#dc2626",
  laundromat: "#0891b2",
  rival: "#be123c",
  supplier: "#ca8a04",
  transit: "#2563eb"
};

const mapWidth = worldBounds.maxX - worldBounds.minX;
const mapDepth = worldBounds.maxZ - worldBounds.minZ;
const worldWidth = mapWidth;
const worldDepth = mapDepth;
const worldCenterX = (worldBounds.minX + worldBounds.maxX) / 2;
const worldCenterZ = (worldBounds.minZ + worldBounds.maxZ) / 2;

function cloneLayout(layout: WorldMapLayout): WorldMapLayout {
  return JSON.parse(JSON.stringify(layout)) as WorldMapLayout;
}

function mapX(x: number): number {
  return x - worldBounds.minX;
}

function mapY(z: number): number {
  return worldBounds.maxZ - z;
}

function rectY(z: number, depth: number): number {
  return worldBounds.maxZ - z - depth / 2;
}

function layerItems(layout: WorldMapLayout, layer: EditableLayer): Array<Record<string, unknown>> {
  return layout[layer] as unknown as Array<Record<string, unknown>>;
}

function itemName(layer: EditableLayer, item: Record<string, unknown>, index: number): string {
  if (layer === "roads") {
    return String(item.id ?? `Road ${index + 1}`);
  }

  if (layer === "buildings") {
    return String(item.signText ?? `Building ${index + 1}`);
  }

  if (layer === "decorations") {
    return String(item.id ?? `Prop ${index + 1}`);
  }

  if (layer === "patrolZones") {
    return String(item.label ?? item.id ?? `Patrol ${index + 1}`);
  }

  return `${String(item.districtId ?? "Backdrop")} ${index + 1}`;
}

function itemPosition(item: Record<string, unknown>): { x: number; z: number } {
  return {
    x: typeof item.x === "number" ? item.x : 0,
    z: typeof item.z === "number" ? item.z : 0
  };
}

function numericValue(item: Record<string, unknown>, key: string, fallback = 0): number {
  return typeof item[key] === "number" ? item[key] as number : fallback;
}

function layerMeta(layer: EditableLayer): (typeof editableLayers)[number] {
  return editableLayers.find((candidate) => candidate.id === layer) ?? editableLayers[0];
}

function isSameSelection(left: Selection, right: Selection): boolean {
  return left.layer === right.layer && left.index === right.index;
}

function districtName(item: Record<string, unknown>): string {
  const districtId = String(item.districtId ?? "");
  return districts[districtId]?.name ?? (districtId || "No district");
}

function itemMetrics(layer: EditableLayer, item: Record<string, unknown>): string {
  if (layer === "roads") {
    return `${numericValue(item, "width", 1).toFixed(1)}w x ${numericValue(item, "depth", 1).toFixed(1)}d road`;
  }

  if (layer === "buildings" || layer === "backdropBuildings") {
    return `${numericValue(item, "width", 1).toFixed(1)}w x ${numericValue(item, "depth", 1).toFixed(1)}d x ${numericValue(item, "height", 1).toFixed(1)}h`;
  }

  if (layer === "decorations") {
    return `${String(item.kind ?? "prop").replace("_", " ")} / scale ${numericValue(item, "scale", 1).toFixed(2)}`;
  }

  return `radius ${numericValue(item, "radius", 1).toFixed(1)}`;
}

function itemCoordinates(item: Record<string, unknown>): string {
  return `X ${numericValue(item, "x").toFixed(1)} / Z ${numericValue(item, "z").toFixed(1)}`;
}

function labelText(layer: EditableLayer, item: Record<string, unknown>, index: number): string {
  const name = itemName(layer, item, index);
  return name.length > 24 ? `${name.slice(0, 21)}...` : name;
}

function layerClass(layer: EditableLayer): string {
  return `admin-map-object ${layer}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function snapCoordinate(value: number, enabled: boolean, step: number): number {
  if (!enabled || step <= 0) {
    return Number(value.toFixed(2));
  }

  return Number((Math.round(value / step) * step).toFixed(2));
}

function uniqueId(prefix: string, items: Array<Record<string, unknown>>): string {
  const ids = new Set(items.map((item) => String(item.id ?? "")));
  let index = items.length + 1;
  let candidate = `${prefix}_${index}`;
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${prefix}_${index}`;
  }
  return candidate;
}

function defaultItemForLayer(layer: EditableLayer, layout: WorldMapLayout, selectedItem?: Record<string, unknown>): Record<string, unknown> {
  const districtId = String(selectedItem?.districtId ?? "starter_suburb");
  const position = selectedItem ? itemPosition(selectedItem) : { x: -1, z: 1 };
  const x = clamp(position.x + 1.5, worldBounds.minX + 1, worldBounds.maxX - 1);
  const z = clamp(position.z + 1.5, worldBounds.minZ + 1, worldBounds.maxZ - 1);

  if (layer === "roads") {
    return {
      id: uniqueId("road", layout.roads as unknown as Array<Record<string, unknown>>),
      districtId,
      x,
      z,
      width: 8,
      depth: 2.8
    };
  }

  if (layer === "buildings") {
    return {
      districtId,
      height: 3.4,
      signText: "NEW BUILDING",
      style: "garage",
      width: 4.2,
      depth: 3.2,
      x,
      z
    };
  }

  if (layer === "backdropBuildings") {
    return {
      color: "#475569",
      districtId,
      height: 8,
      lit: 0.35,
      width: 4.4,
      depth: 4,
      x,
      z
    };
  }

  if (layer === "patrolZones") {
    return {
      id: uniqueId("patrol_zone", layout.patrolZones as unknown as Array<Record<string, unknown>>),
      color: "#93c5fd",
      districtId,
      label: "New patrol",
      radius: 5,
      x,
      z
    };
  }

  return {
    id: uniqueId("prop", layout.decorations as unknown as Array<Record<string, unknown>>),
    color: "#f59e0b",
    districtId,
    kind: "streetlight",
    rotationY: 0,
    scale: 1,
    x,
    z
  };
}

function cloneItemForLayer(layer: EditableLayer, item: Record<string, unknown>, layout: WorldMapLayout): Record<string, unknown> {
  const clone = { ...item };
  const position = itemPosition(item);
  clone.x = clamp(position.x + 1.5, worldBounds.minX + 1, worldBounds.maxX - 1);
  clone.z = clamp(position.z + 1.5, worldBounds.minZ + 1, worldBounds.maxZ - 1);

  if ("id" in clone) {
    clone.id = uniqueId(String(clone.id || layer), layerItems(layout, layer));
  }

  if (layer === "buildings") {
    clone.signText = `${String(clone.signText ?? "BUILDING")} COPY`;
    delete clone.locationId;
  }

  return clone;
}

function createAdminMaterial(color: string, opacity: number, emissive = "#000000"): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: emissive === "#000000" ? 0 : 0.16,
    metalness: 0.05,
    opacity,
    roughness: 0.78,
    transparent: opacity < 1
  });
}

function setObjectOpacity(object: THREE.Object3D, opacity: number): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.transparent = opacity < 1;
        material.opacity = opacity;
      });
    }
  });
}

function disposeThreeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function tagPickable(object: THREE.Object3D, selection: Selection, pickables: THREE.Object3D[]): void {
  object.userData.adminSelection = selection;
  object.traverse((child) => {
    child.userData.adminSelection = selection;
    if (child instanceof THREE.Mesh) {
      pickables.push(child);
    }
  });
}

function createDecorationObject(item: Record<string, unknown>, opacity: number, selected: boolean): THREE.Object3D {
  const kind = String(item.kind ?? "streetlight") as WorldDecorationKind;
  const scale = numericValue(item, "scale", 1);
  const group = new THREE.Group();
  const color = String(item.color ?? layerColors.decorations);
  const material = createAdminMaterial(color, opacity, selected ? "#f59e0b" : "#000000");
  const darkMaterial = createAdminMaterial("#334155", opacity);

  if (kind === "streetlight") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.06 * scale, 1.7 * scale, 10), darkMaterial);
    pole.position.y = 0.85 * scale;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 12, 8), createAdminMaterial("#fde68a", opacity, "#f59e0b"));
    lamp.position.set(0.18 * scale, 1.72 * scale, 0);
    group.add(pole, lamp);
  } else if (kind === "billboard") {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.06 * scale, 1.2 * scale, 8), darkMaterial);
    post.position.y = 0.6 * scale;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4 * scale, 0.7 * scale, 0.1 * scale), material);
    board.position.y = 1.25 * scale;
    group.add(post, board);
  } else if (kind === "bollard") {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.14 * scale, 0.55 * scale, 12), material);
    bollard.position.y = 0.28 * scale;
    group.add(bollard);
  } else if (kind === "dumpster") {
    const dumpster = new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.55 * scale, 0.55 * scale), material);
    dumpster.position.y = 0.28 * scale;
    group.add(dumpster);
  } else if (kind === "planter") {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 0.28 * scale, 0.42 * scale), material);
    planter.position.y = 0.14 * scale;
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.26 * scale, 0.6 * scale, 8), createAdminMaterial("#22c55e", opacity));
    plant.position.y = 0.58 * scale;
    group.add(planter, plant);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55 * scale, 0.72 * scale, 0.38 * scale), material);
    box.position.y = 0.36 * scale;
    group.add(box);
  }

  group.position.set(numericValue(item, "x"), 0, numericValue(item, "z"));
  group.rotation.y = numericValue(item, "rotationY");
  return group;
}

function createAdminObject(layer: EditableLayer, item: Record<string, unknown>, index: number, activeLayer: EditableLayer, selection: Selection): THREE.Object3D {
  const currentSelection = { layer, index };
  const selected = isSameSelection(currentSelection, selection);
  const active = activeLayer === layer;
  const opacity = selected || active ? 1 : 0.34;
  const x = numericValue(item, "x");
  const z = numericValue(item, "z");

  if (layer === "roads") {
    const group = new THREE.Group();
    const width = numericValue(item, "width", 1);
    const depth = numericValue(item, "depth", 1);
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, depth),
      createAdminMaterial("#263241", opacity, selected ? "#64748b" : "#000000")
    );
    road.position.set(0, 0.04, 0);
    group.add(road);

    const laneAlongX = width >= depth;
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(laneAlongX ? width * 0.86 : 0.08, 0.025, laneAlongX ? 0.08 : depth * 0.86),
      createAdminMaterial("#e2e8f0", opacity)
    );
    lane.position.y = 0.095;
    group.add(lane);

    const curbMaterial = createAdminMaterial("#94a3b8", opacity);
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(laneAlongX ? width : 0.14, 0.12, laneAlongX ? 0.14 : depth),
        curbMaterial
      );
      curb.position.set(laneAlongX ? 0 : side * width / 2, 0.11, laneAlongX ? side * depth / 2 : 0);
      group.add(curb);
    }
    group.position.set(x, 0, z);
    return group;
  }

  if (layer === "buildings" || layer === "backdropBuildings") {
    const style = String(item.style ?? "garage") as BuildingVisualStyle;
    const height = numericValue(item, "height", 1);
    const color = layer === "buildings" ? buildingStyleColors[style] ?? layerColors.buildings : String(item.color ?? "#475569");
    if (layer === "buildings") {
      const building = createBuilding(numericValue(item, "width", 1), numericValue(item, "depth", 1), height, style, String(item.signText ?? ""));
      building.position.set(x, 0, z);
      setObjectOpacity(building, opacity);
      if (selected) {
        const glow = new THREE.Mesh(
          new THREE.BoxGeometry(numericValue(item, "width", 1) + 0.18, height + 0.18, numericValue(item, "depth", 1) + 0.18),
          new THREE.MeshBasicMaterial({ color: "#f8fafc", opacity: 0.12, transparent: true, wireframe: true })
        );
        glow.position.y = height / 2;
        building.add(glow);
      }
      return building;
    }

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(numericValue(item, "width", 1), height, numericValue(item, "depth", 1)), createAdminMaterial(color, opacity, selected ? color : "#000000"));
    mesh.position.set(x, height / 2, z);
    return mesh;
  }

  if (layer === "patrolZones") {
    const material = new THREE.MeshBasicMaterial({
      color: String(item.color ?? layerColors.patrolZones),
      opacity: selected ? 0.44 : active ? 0.22 : 0.08,
      side: THREE.DoubleSide,
      transparent: true
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(numericValue(item, "radius", 1) * 0.92, numericValue(item, "radius", 1), 56), material);
    ring.position.set(x, 0.09, z);
    ring.rotation.x = -Math.PI / 2;
    return ring;
  }

  return createDecorationObject(item, opacity, selected);
}

function createSelectionMarker(layer: EditableLayer, item: Record<string, unknown>): THREE.Mesh {
  const { x, z } = itemPosition(item);
  const radius =
    layer === "patrolZones"
      ? numericValue(item, "radius", 1)
      : Math.max(0.8, Math.hypot(numericValue(item, "width", 1), numericValue(item, "depth", 1)) / 2);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(radius + 0.18, radius + 0.34, 64),
    new THREE.MeshBasicMaterial({
      color: "#f8fafc",
      opacity: 0.9,
      side: THREE.DoubleSide,
      transparent: true
    })
  );
  marker.position.set(x, 0.13, z);
  marker.rotation.x = -Math.PI / 2;
  marker.userData.ignorePick = true;
  return marker;
}

function createPathOverlay(path: Array<{ x: number; z: number }>, color: string, y = 0.18): THREE.Line | null {
  if (path.length < 2) {
    return null;
  }

  const points = [...path, path[0]].map((point) => new THREE.Vector3(point.x, y, point.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 }));
}

function createAnchorMarker(x: number, z: number, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16),
    new THREE.MeshBasicMaterial({ color: "#fef08a", transparent: true, opacity: 0.8 })
  );
  base.position.y = 0.22;
  const direction = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.42, 3),
    new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.9 })
  );
  direction.position.set(-Math.sin(rotationY) * 0.48, 0.28, -Math.cos(rotationY) * 0.48);
  direction.rotation.y = rotationY;
  group.add(base, direction);
  group.position.set(x, 0, z);
  group.userData.ignorePick = true;
  return group;
}

function AdminThreeMapEditor({ activeLayer, layout, onEditStart, onMove, onSelect, selection, snapEnabled, snapStep }: AdminThreeMapEditorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mapGroupRef = useRef<THREE.Group | null>(null);
  const pickablesRef = useRef<THREE.Object3D[]>([]);
  const propsRef = useRef({ activeLayer, layout, onEditStart, onMove, onSelect, selection, snapEnabled, snapStep });
  const dragRef = useRef<DragState | null>(null);
  const lookDragRef = useRef<{ x: number; y: number } | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const yawRef = useRef(0);
  const pitchRef = useRef(-0.42);
  const movementKeyCodes = useMemo(
    () => new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]),
    []
  );

  useEffect(() => {
    propsRef.current = { activeLayer, layout, onEditStart, onMove, onSelect, selection, snapEnabled, snapStep };
  }, [activeLayer, layout, onEditStart, onMove, onSelect, selection, snapEnabled, snapStep]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020617");
    scene.fog = new THREE.Fog("#020617", 85, 210);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
    camera.position.set(worldCenterX, 18, worldBounds.maxZ + 24);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#cbd5e1", 0.72));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(-34, 48, 28);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(worldWidth, worldDepth),
      new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.92, metalness: 0.02 })
    );
    ground.position.set(worldCenterX, -0.01, worldCenterZ);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const grid = new THREE.GridHelper(Math.max(worldWidth, worldDepth), 36, "#475569", "#1e293b");
    grid.position.set(worldCenterX, 0.02, worldCenterZ);
    scene.add(grid);

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(worldBounds.minX, 0.12, worldBounds.minZ),
      new THREE.Vector3(worldBounds.maxX, 0.12, worldBounds.minZ),
      new THREE.Vector3(worldBounds.maxX, 0.12, worldBounds.maxZ),
      new THREE.Vector3(worldBounds.minX, 0.12, worldBounds.maxZ),
      new THREE.Vector3(worldBounds.minX, 0.12, worldBounds.minZ)
    ]);
    scene.add(new THREE.Line(outlineGeometry, new THREE.LineBasicMaterial({ color: "#2dd4bf", transparent: true, opacity: 0.62 })));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundPoint = new THREE.Vector3();

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const updatePointer = (event: globalThis.PointerEvent) => {
      const bounds = mount.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
    };

    const pointOnGround = (event: globalThis.PointerEvent): THREE.Vector3 | null => {
      updatePointer(event);
      return raycaster.ray.intersectPlane(groundPlane, groundPoint) ? groundPoint : null;
    };

    const updateCameraRotation = () => {
      camera.rotation.y = yawRef.current;
      camera.rotation.x = pitchRef.current;
    };

    const onPointerDown = (event: globalThis.PointerEvent) => {
      mount.focus();

      if (event.button !== 0) {
        dragRef.current = null;
        lookDragRef.current = { x: event.clientX, y: event.clientY };
      } else {
        updatePointer(event);
        const hit = raycaster.intersectObjects(pickablesRef.current, false).find((candidate) => !candidate.object.userData.ignorePick);
        const hitSelection = hit?.object.userData.adminSelection as Selection | undefined;

        if (hitSelection) {
          const currentItem = layerItems(propsRef.current.layout, hitSelection.layer)[hitSelection.index];
          const point = pointOnGround(event);
          propsRef.current.onSelect(hitSelection);
          if (currentItem && point) {
            propsRef.current.onEditStart();
            const currentPosition = itemPosition(currentItem);
            dragRef.current = {
              ...hitSelection,
              offsetX: point.x - currentPosition.x,
              offsetZ: point.z - currentPosition.z
            };
          }
        } else {
          lookDragRef.current = { x: event.clientX, y: event.clientY };
        }
      }

      mount.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const point = pointOnGround(event);
        if (point) {
          propsRef.current.onMove(drag, {
            x: snapCoordinate(clamp(point.x - drag.offsetX, worldBounds.minX, worldBounds.maxX), propsRef.current.snapEnabled, propsRef.current.snapStep),
            z: snapCoordinate(clamp(point.z - drag.offsetZ, worldBounds.minZ, worldBounds.maxZ), propsRef.current.snapEnabled, propsRef.current.snapStep)
          }, { recordHistory: false });
        }
        event.preventDefault();
        return;
      }

      const lookDrag = lookDragRef.current;
      if (lookDrag) {
        const deltaX = event.clientX - lookDrag.x;
        const deltaY = event.clientY - lookDrag.y;
        yawRef.current -= deltaX * 0.004;
        pitchRef.current = clamp(pitchRef.current - deltaY * 0.004, -1.25, 0.18);
        lookDragRef.current = { x: event.clientX, y: event.clientY };
        updateCameraRotation();
        event.preventDefault();
      }
    };

    const stopPointerAction = (event: globalThis.PointerEvent) => {
      dragRef.current = null;
      lookDragRef.current = null;
      if (mount.hasPointerCapture(event.pointerId)) {
        mount.releasePointerCapture(event.pointerId);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (movementKeyCodes.has(event.code)) {
        keysRef.current.add(event.code);
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };

    const clearInputState = () => {
      keysRef.current.clear();
      dragRef.current = null;
      lookDragRef.current = null;
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerup", stopPointerAction);
    mount.addEventListener("pointercancel", stopPointerAction);
    mount.addEventListener("keydown", onKeyDown);
    mount.addEventListener("keyup", onKeyUp);
    mount.addEventListener("blur", clearInputState);
    mount.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", clearInputState);
    mount.focus({ preventScroll: true });

    const clock = new THREE.Clock();
    let animationId = 0;

    const animate = () => {
      const delta = Math.min(0.05, clock.getDelta());
      const keys = keysRef.current;
      const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 24 : 10) * delta;
      const turnSpeed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1.9 : 1.15) * delta;

      if (keys.has("ArrowLeft")) {
        yawRef.current += turnSpeed;
      }
      if (keys.has("ArrowRight")) {
        yawRef.current -= turnSpeed;
      }
      if (keys.has("ArrowUp")) {
        pitchRef.current = clamp(pitchRef.current + turnSpeed, -1.25, 0.18);
      }
      if (keys.has("ArrowDown")) {
        pitchRef.current = clamp(pitchRef.current - turnSpeed, -1.25, 0.18);
      }
      if (keys.has("ArrowLeft") || keys.has("ArrowRight") || keys.has("ArrowUp") || keys.has("ArrowDown")) {
        updateCameraRotation();
      }

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      if (keys.has("KeyW")) {
        camera.position.addScaledVector(forward, speed);
      }
      if (keys.has("KeyS")) {
        camera.position.addScaledVector(forward, -speed);
      }
      if (keys.has("KeyA")) {
        camera.position.addScaledVector(right, -speed);
      }
      if (keys.has("KeyD")) {
        camera.position.addScaledVector(right, speed);
      }
      if (keys.has("KeyE")) {
        camera.position.y += speed;
      }
      if (keys.has("KeyQ")) {
        camera.position.y -= speed;
      }

      camera.position.x = clamp(camera.position.x, worldBounds.minX - 24, worldBounds.maxX + 24);
      camera.position.z = clamp(camera.position.z, worldBounds.minZ - 24, worldBounds.maxZ + 24);
      camera.position.y = clamp(camera.position.y, 2.2, 72);

      renderer.render(scene, camera);
      animationId = window.requestAnimationFrame(animate);
    };

    animationId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      mount.removeEventListener("pointerdown", onPointerDown);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerup", stopPointerAction);
      mount.removeEventListener("pointercancel", stopPointerAction);
      mount.removeEventListener("keydown", onKeyDown);
      mount.removeEventListener("keyup", onKeyUp);
      mount.removeEventListener("blur", clearInputState);
      mount.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", clearInputState);
      clearInputState();
      if (mapGroupRef.current) {
        scene.remove(mapGroupRef.current);
        disposeThreeObject(mapGroupRef.current);
      }
      disposeThreeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      mapGroupRef.current = null;
      pickablesRef.current = [];
    };
  }, [movementKeyCodes]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    if (mapGroupRef.current) {
      scene.remove(mapGroupRef.current);
      disposeThreeObject(mapGroupRef.current);
    }

    const group = new THREE.Group();
    const pickables: THREE.Object3D[] = [];
    const addLayer = (layer: EditableLayer) => {
      layerItems(layout, layer).forEach((item, index) => {
        const object = createAdminObject(layer, item, index, activeLayer, selection);
        tagPickable(object, { layer, index }, pickables);
        group.add(object);
      });
    };

    addLayer("roads");
    addLayer("backdropBuildings");
    addLayer("patrolZones");
    addLayer("buildings");
    addLayer("decorations");

    layout.trafficLoops.forEach((loop) => {
      const line = createPathOverlay(loop.path, loop.kind === "police" ? "#93c5fd" : loop.color, 0.2);
      if (line) {
        line.userData.ignorePick = true;
        group.add(line);
      }
    });

    layout.policePatrolPaths.forEach((path) => {
      const line = createPathOverlay(path.path, path.color, 0.28);
      if (line) {
        line.userData.ignorePick = true;
        group.add(line);
      }
    });

    Object.values(machinePlacementAnchors).forEach((anchor) => {
      group.add(createAnchorMarker(anchor.x, anchor.z, anchor.rotationY));
    });

    const selectedItem = layerItems(layout, selection.layer)[selection.index];
    if (selectedItem) {
      group.add(createSelectionMarker(selection.layer, selectedItem));
    }

    scene.add(group);
    mapGroupRef.current = group;
    pickablesRef.current = pickables;
  }, [activeLayer, layout, selection]);

  return (
    <div className="admin-3d-stage" ref={mountRef} tabIndex={0}>
      <div className="admin-3d-help">
        <strong>3D edit</strong>
        <span>Click an object to select. Drag it across the ground to move it. WASD flies, Q/E changes height, arrow keys turn, Shift speeds up. Drag empty space or right-drag to look around.</span>
      </div>
    </div>
  );
}

export function AdminMapEditor({ initialAudioConfig, initialLayout, onAudioReset, onAudioSave, onReset, onSave }: AdminMapEditorProps) {
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => loadStoredAdminSession());
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [saving, setSaving] = useState(false);
  const [layout, setLayout] = useState<WorldMapLayout>(() => cloneLayout(initialLayout));
  const [activeLayer, setActiveLayer] = useState<EditableLayer>("buildings");
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>("map");
  const [selection, setSelection] = useState<Selection>({ layer: "buildings", index: 0 });
  const [viewMode, setViewMode] = useState<AdminViewMode>("2d");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(0.5);
  const [history, setHistory] = useState<{ future: WorldMapLayout[]; past: WorldMapLayout[] }>({ future: [], past: [] });
  const [revisions, setRevisions] = useState<RemoteMapRevision[]>([]);
  const [monitoring, setMonitoring] = useState<AdminMonitoringSnapshot | null>(null);
  const [status, setStatus] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const layoutRef = useRef(layout);
  const issues = useMemo(() => validateWorldMapLayout(layout), [layout]);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const selectedItem = layerItems(layout, selection.layer)[selection.index];
  const activeItems = layerItems(layout, activeLayer);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const pointFromPointer = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, z: 0 };
    }

    const bounds = svg.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * mapWidth;
    const svgY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * mapDepth;
    return {
      x: worldBounds.minX + svgX,
      z: worldBounds.maxZ - svgY
    };
  };

  const pushHistorySnapshot = useCallback(() => {
    setHistory((current) => ({
      past: [...current.past.slice(-39), cloneLayout(layoutRef.current)],
      future: []
    }));
  }, []);

  const commitLayout = useCallback((updater: (current: WorldMapLayout) => WorldMapLayout, options: { recordHistory?: boolean } = {}) => {
    const recordHistory = options.recordHistory ?? true;
    setLayout((current) => {
      const next = updater(current);
      if (recordHistory) {
        setHistory((historyState) => ({
          past: [...historyState.past.slice(-39), cloneLayout(current)],
          future: []
        }));
      }
      return next;
    });
    setStatus("");
  }, []);

  const selectItem = useCallback((target: Selection) => {
    setSelection(target);
    setActiveLayer(target.layer);
    setStatus("");
  }, []);

  const updateItem = useCallback((target: Selection, patch: Record<string, unknown>, options: { recordHistory?: boolean } = {}) => {
    commitLayout((current) => {
      const items = layerItems(current, target.layer);
      return {
        ...current,
        [target.layer]: items.map((item, index) => (index === target.index ? { ...item, ...patch } : item))
      } as WorldMapLayout;
    }, options);
  }, [commitLayout]);

  const updateSelected = (patch: Record<string, unknown>) => {
    updateItem(selection, patch);
  };

  const handleUndo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) {
        return current;
      }

      setLayout(cloneLayout(previous));
      return {
        past: current.past.slice(0, -1),
        future: [cloneLayout(layoutRef.current), ...current.future.slice(0, 39)]
      };
    });
    setStatus("Undo applied.");
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) {
        return current;
      }

      setLayout(cloneLayout(next));
      return {
        past: [...current.past.slice(-39), cloneLayout(layoutRef.current)],
        future: current.future.slice(1)
      };
    });
    setStatus("Redo applied.");
  }, []);

  const handleAddItem = useCallback(() => {
    const item = defaultItemForLayer(activeLayer, layoutRef.current, selectedItem);
    commitLayout((current) => {
      const items = layerItems(current, activeLayer);
      const nextItems = [...items, item];
      window.setTimeout(() => selectItem({ layer: activeLayer, index: nextItems.length - 1 }), 0);
      return { ...current, [activeLayer]: nextItems } as WorldMapLayout;
    });
  }, [activeLayer, commitLayout, selectItem, selectedItem]);

  const handleDuplicateItem = useCallback(() => {
    if (!selectedItem) {
      return;
    }

    const duplicated = cloneItemForLayer(selection.layer, selectedItem, layoutRef.current);
    commitLayout((current) => {
      const items = layerItems(current, selection.layer);
      const nextItems = [...items, duplicated];
      window.setTimeout(() => selectItem({ layer: selection.layer, index: nextItems.length - 1 }), 0);
      return { ...current, [selection.layer]: nextItems } as WorldMapLayout;
    });
  }, [commitLayout, selectItem, selectedItem, selection.layer]);

  const handleDeleteItem = useCallback(() => {
    if (!selectedItem || layerItems(layoutRef.current, selection.layer).length <= 1) {
      setStatus("Keep at least one object in each layer.");
      return;
    }

    commitLayout((current) => {
      const items = layerItems(current, selection.layer);
      const nextItems = items.filter((_, index) => index !== selection.index);
      window.setTimeout(() => selectItem({ layer: selection.layer, index: Math.max(0, Math.min(selection.index, nextItems.length - 1)) }), 0);
      return { ...current, [selection.layer]: nextItems } as WorldMapLayout;
    });
  }, [commitLayout, selectItem, selectedItem, selection.index, selection.layer]);

  const handleRotateSelected = useCallback((amountRadians: number) => {
    if (!selectedItem) {
      return;
    }

    if (selection.layer === "decorations") {
      updateSelected({ rotationY: Number((numericValue(selectedItem, "rotationY") + amountRadians).toFixed(3)) });
      return;
    }

    if (selection.layer === "roads" || selection.layer === "buildings" || selection.layer === "backdropBuildings") {
      updateSelected({
        width: numericValue(selectedItem, "depth", 1),
        depth: numericValue(selectedItem, "width", 1)
      });
    }
  }, [selectedItem, selection.layer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA") {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
        event.preventDefault();
        handleRedo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handleDuplicateItem();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDeleteItem();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteItem, handleDuplicateItem, handleRedo, handleUndo]);

  const refreshRevisions = useCallback((session = adminSession) => {
    if (!session) {
      return;
    }

    loadRemoteMapRevisions(session)
      .then(setRevisions)
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Could not load map revisions.");
      });
  }, [adminSession]);

  const refreshMonitoring = useCallback((session = adminSession) => {
    if (!session) {
      return;
    }

    loadAdminMonitoring(session)
      .then(setMonitoring)
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Could not load monitoring data.");
      });
  }, [adminSession]);

  useEffect(() => {
    if (!adminSession) {
      return;
    }

    refreshRevisions(adminSession);
    refreshMonitoring(adminSession);
  }, [adminSession, refreshMonitoring, refreshRevisions]);

  const handleRestoreRevision = useCallback((revision: RemoteMapRevision) => {
    if (!adminSession) {
      setStatus("Admin session expired. Sign in again.");
      return;
    }

    if (!window.confirm(`Restore map revision ${revision.revision}? Current layout will become a new restorable revision.`)) {
      return;
    }

    setSaving(true);
    restoreRemoteMapRevision(adminSession, revision.id)
      .then((remote) => {
        if (remote.layout) {
          pushHistorySnapshot();
          setLayout(remote.layout);
          onSave(remote.layout);
          setStatus(`Restored map revision ${revision.revision}.`);
        }
        refreshRevisions(adminSession);
        refreshMonitoring(adminSession);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Map restore failed.");
      })
      .finally(() => setSaving(false));
  }, [adminSession, onSave, pushHistorySnapshot, refreshMonitoring, refreshRevisions]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    loginAdmin(credentials.username, credentials.password)
      .then((session) => {
        setAdminSession(session);
        refreshRevisions(session);
        refreshMonitoring(session);
      })
      .catch((error) => {
        setLoginError(error instanceof Error ? error.message : "Admin sign in failed.");
      });
  };

  const startDrag = (event: ReactPointerEvent<SVGElement>, target: Selection, currentX: number, currentZ: number) => {
    const point = pointFromPointer(event);
    pushHistorySnapshot();
    dragRef.current = {
      ...target,
      offsetX: point.x - currentX,
      offsetZ: point.z - currentZ
    };
    selectItem(target);
    svgRef.current?.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const point = pointFromPointer(event);
    updateItem(drag, {
      x: snapCoordinate(point.x - drag.offsetX, snapEnabled, snapStep),
      z: snapCoordinate(point.z - drag.offsetZ, snapEnabled, snapStep)
    }, { recordHistory: false });
  };

  const stopDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handleSave = () => {
    if (blockingIssues.length > 0) {
      setStatus("Fix validation errors before saving.");
      return;
    }

    if (!adminSession) {
      setStatus("Admin session expired. Sign in again.");
      return;
    }

    setSaving(true);
    saveRemoteMapLayout(adminSession, layout)
      .then((remote) => {
        onSave(layout);
        setStatus(`Map layout saved as revision ${remote.revision}.`);
        refreshRevisions(adminSession);
        refreshMonitoring(adminSession);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Map save failed.");
        clearStoredAdminSession();
        setAdminSession(null);
      })
      .finally(() => setSaving(false));
  };

  const handleReset = () => {
    if (!window.confirm("Reset the editable map layout to the default authored city?")) {
      return;
    }

    if (!adminSession) {
      setStatus("Admin session expired. Sign in again.");
      return;
    }

    setSaving(true);
    resetRemoteMapLayout(adminSession)
      .then(() => {
        const nextLayout = createDefaultWorldMapLayout();
        pushHistorySnapshot();
        setLayout(nextLayout);
        setSelection({ layer: "buildings", index: 0 });
        setActiveLayer("buildings");
        onReset();
        setStatus("Default map restored.");
        refreshRevisions(adminSession);
        refreshMonitoring(adminSession);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Map reset failed.");
        clearStoredAdminSession();
        setAdminSession(null);
      })
      .finally(() => setSaving(false));
  };

  if (!adminSession) {
    return (
      <main className="admin-shell">
        <form className="admin-login" onSubmit={handleLogin}>
          <div>
            <Map size={22} aria-hidden="true" />
            <h1>Map Editor</h1>
          </div>
          <label>
            Admin name
            <input autoComplete="username" value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} />
          </label>
          <label>
            Admin PIN
            <input autoComplete="current-password" type="password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} />
          </label>
          {loginError && <p className="admin-login-error">{loginError}</p>}
          <button type="submit">
            <Eye size={16} aria-hidden="true" />
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          {activeAdminTab === "audio" ? <Music size={20} aria-hidden="true" /> : <Map size={20} aria-hidden="true" />}
          <div>
            <h1>Admin Console</h1>
            <span>
              {activeAdminTab === "audio"
                ? "Sound, music, and voice controls"
                : blockingIssues.length === 0 ? "Layout valid" : `${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
        <div className="admin-actions">
          <button onClick={() => window.location.assign("/")} type="button">
            <Undo2 size={16} aria-hidden="true" />
            Game
          </button>
          {activeAdminTab === "map" && (
            <>
              <button disabled={history.past.length === 0 || saving} onClick={handleUndo} type="button">
                <Undo2 size={16} aria-hidden="true" />
                Undo
              </button>
              <button disabled={history.future.length === 0 || saving} onClick={handleRedo} type="button">
                <Redo2 size={16} aria-hidden="true" />
                Redo
              </button>
              <button disabled={saving} onClick={handleReset} type="button">
                <RotateCcw size={16} aria-hidden="true" />
                Reset
              </button>
              <button className="primary" disabled={blockingIssues.length > 0 || saving} onClick={handleSave} type="button">
                <Save size={16} aria-hidden="true" />
                {saving ? "Saving" : "Save"}
              </button>
            </>
          )}
        </div>
      </header>

      <nav className="admin-section-tabs" aria-label="Admin sections">
        <button className={activeAdminTab === "map" ? "active" : ""} onClick={() => setActiveAdminTab("map")} type="button">
          <Map size={16} aria-hidden="true" />
          Map
        </button>
        <button className={activeAdminTab === "audio" ? "active" : ""} onClick={() => setActiveAdminTab("audio")} type="button">
          <Music size={16} aria-hidden="true" />
          Audio
        </button>
      </nav>

      {activeAdminTab === "map" ? (
      <section className="admin-editor">
        <aside className="admin-sidebar">
          <div className="admin-layer-tabs">
            {editableLayers.map((layer) => (
              <button className={activeLayer === layer.id ? "active" : ""} key={layer.id} onClick={() => setActiveLayer(layer.id)} type="button">
                {layer.icon}
                {layer.label}
              </button>
            ))}
          </div>
          <div className="admin-layer-note">
            <strong>{layerMeta(activeLayer).label}</strong>
            <span>{layerMeta(activeLayer).description}</span>
            <button onClick={handleAddItem} type="button">
              <Plus size={15} aria-hidden="true" />
              Add {layerMeta(activeLayer).label.slice(0, -1) || layerMeta(activeLayer).label}
            </button>
          </div>

          <div className="admin-object-list">
            {activeItems.map((item, index) => (
              <button
                className={selection.layer === activeLayer && selection.index === index ? "active" : ""}
                key={`${activeLayer}-${index}`}
                onClick={() => selectItem({ layer: activeLayer, index })}
                type="button"
              >
                <span>{itemName(activeLayer, item, index)}</span>
                <small>{districtName(item)}</small>
                <small>{itemMetrics(activeLayer, item)} | {itemCoordinates(item)}</small>
              </button>
            ))}
          </div>
        </aside>

        <div className="admin-map-panel">
          <div className="admin-view-toolbar">
            <div className="admin-view-toggle" aria-label="Editor view mode">
              <button className={viewMode === "2d" ? "active" : ""} onClick={() => setViewMode("2d")} type="button">
                <Map size={15} aria-hidden="true" />
                2D
              </button>
              <button className={viewMode === "3d" ? "active" : ""} onClick={() => setViewMode("3d")} type="button">
                <Eye size={15} aria-hidden="true" />
                3D
              </button>
            </div>
            <label className="admin-snap-control">
              <input checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} type="checkbox" />
              Snap
              <input min="0.1" step="0.1" type="number" value={snapStep} onChange={(event) => setSnapStep(Math.max(0.1, Number(event.target.value) || 0.5))} />
            </label>
            <span>{viewMode === "2d" ? "Drag shapes to move them. Active layer names are shown on the map." : "Fly the map and drag objects directly in 3D."}</span>
          </div>

          <div className="admin-map-stage">
            {viewMode === "2d" ? (
              <svg
                className="admin-map"
                ref={svgRef}
                viewBox={`0 0 ${mapWidth} ${mapDepth}`}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerLeave={stopDrag}
                role="img"
                aria-label="Editable city map"
              >
                <rect className="admin-map-ground" width={mapWidth} height={mapDepth} x={0} y={0} />
                {layout.roads.map((road, index) => (
                  <rect
                    className={layerClass("roads")}
                    data-selected={selection.layer === "roads" && selection.index === index}
                    height={road.depth}
                    key={road.id}
                    width={road.width}
                    x={mapX(road.x - road.width / 2)}
                    y={rectY(road.z, road.depth)}
                    onPointerDown={(event) => startDrag(event, { layer: "roads", index }, road.x, road.z)}
                  />
                ))}
                {layout.backdropBuildings.map((building, index) => (
                  <rect
                    className={layerClass("backdropBuildings")}
                    data-selected={selection.layer === "backdropBuildings" && selection.index === index}
                    height={building.depth}
                    key={`backdrop-${index}`}
                    width={building.width}
                    x={mapX(building.x - building.width / 2)}
                    y={rectY(building.z, building.depth)}
                    onPointerDown={(event) => startDrag(event, { layer: "backdropBuildings", index }, building.x, building.z)}
                  />
                ))}
                {layout.patrolZones.map((zone, index) => (
                  <circle
                    className={layerClass("patrolZones")}
                    cx={mapX(zone.x)}
                    cy={mapY(zone.z)}
                    data-selected={selection.layer === "patrolZones" && selection.index === index}
                    key={zone.id}
                    r={zone.radius}
                    onPointerDown={(event) => startDrag(event, { layer: "patrolZones", index }, zone.x, zone.z)}
                  />
                ))}
                {layout.buildings.map((building, index) => (
                  <rect
                    className={layerClass("buildings")}
                    data-selected={selection.layer === "buildings" && selection.index === index}
                    height={building.depth}
                    key={`${building.signText}-${index}`}
                    width={building.width}
                    x={mapX(building.x - building.width / 2)}
                    y={rectY(building.z, building.depth)}
                    onPointerDown={(event) => startDrag(event, { layer: "buildings", index }, building.x, building.z)}
                  />
                ))}
                {layout.decorations.map((decoration, index) => (
                  <circle
                    className={layerClass("decorations")}
                    cx={mapX(decoration.x)}
                    cy={mapY(decoration.z)}
                    data-selected={selection.layer === "decorations" && selection.index === index}
                    key={decoration.id}
                    r={Math.max(0.45, decoration.scale * 0.58)}
                    onPointerDown={(event) => startDrag(event, { layer: "decorations", index }, decoration.x, decoration.z)}
                  />
                ))}
                <g className="admin-map-labels">
                  {activeItems.map((item, index) => {
                    const position = itemPosition(item);
                    const target = { layer: activeLayer, index };
                    return (
                      <text
                        data-selected={isSameSelection(selection, target)}
                        key={`${activeLayer}-label-${index}`}
                        x={mapX(position.x)}
                        y={mapY(position.z) - 1.1}
                      >
                        {labelText(activeLayer, item, index)}
                      </text>
                    );
                  })}
                </g>
              </svg>
            ) : (
              <AdminThreeMapEditor
                activeLayer={activeLayer}
                layout={layout}
                onEditStart={pushHistorySnapshot}
                onMove={updateItem}
                onSelect={selectItem}
                selection={selection}
                snapEnabled={snapEnabled}
                snapStep={snapStep}
              />
            )}

            <div className="admin-map-legend" aria-label="Map legend">
              {editableLayers.map((layer) => (
                <span key={layer.id}>
                  <i style={{ background: layerColors[layer.id] }} />
                  {layer.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <aside className="admin-inspector">
          <h2>{selectedItem ? itemName(selection.layer, selectedItem, selection.index) : "No selection"}</h2>
          {selectedItem && (
            <>
              <div className="admin-selection-summary">
                <p>
                  <strong>Layer</strong>
                  <span>{layerMeta(selection.layer).label}</span>
                </p>
                <p>
                  <strong>District</strong>
                  <span>{districtName(selectedItem)}</span>
                </p>
                <p>
                  <strong>Footprint</strong>
                  <span>{itemMetrics(selection.layer, selectedItem)}</span>
                </p>
                <p>
                  <strong>Position</strong>
                  <span>{itemCoordinates(selectedItem)}</span>
                </p>
              </div>

              <div className="admin-object-actions">
                <button onClick={handleDuplicateItem} type="button">
                  <Copy size={15} aria-hidden="true" />
                  Duplicate
                </button>
                <button onClick={() => handleRotateSelected(Math.PI / 12)} type="button">
                  <RotateCw size={15} aria-hidden="true" />
                  Rotate
                </button>
                <button className="danger" onClick={handleDeleteItem} type="button">
                  <Trash2 size={15} aria-hidden="true" />
                  Delete
                </button>
              </div>

              <div className="admin-field-grid">
                <label>
                  X
                  <input type="number" step="0.1" value={numericValue(selectedItem, "x")} onChange={(event) => updateSelected({ x: Number(event.target.value) })} />
                </label>
                <label>
                  Z
                  <input type="number" step="0.1" value={numericValue(selectedItem, "z")} onChange={(event) => updateSelected({ z: Number(event.target.value) })} />
                </label>

                {selection.layer === "buildings" && (
                  <label className="wide">
                    Sign text
                    <input type="text" value={String(selectedItem.signText ?? "")} onChange={(event) => updateSelected({ signText: event.target.value.toUpperCase() })} />
                  </label>
                )}

                {(selection.layer === "roads" || selection.layer === "decorations" || selection.layer === "patrolZones") && (
                  <label className="wide">
                    ID
                    <input type="text" value={String(selectedItem.id ?? "")} onChange={(event) => updateSelected({ id: event.target.value })} />
                  </label>
                )}

                {selection.layer === "patrolZones" && (
                  <label className="wide">
                    Label
                    <input type="text" value={String(selectedItem.label ?? "")} onChange={(event) => updateSelected({ label: event.target.value })} />
                  </label>
                )}

                {(selection.layer === "decorations" || selection.layer === "patrolZones" || selection.layer === "backdropBuildings") && (
                  <label className="wide">
                    Color
                    <input type="text" value={String(selectedItem.color ?? "")} onChange={(event) => updateSelected({ color: event.target.value })} />
                  </label>
                )}

                {(selection.layer === "roads" || selection.layer === "buildings" || selection.layer === "backdropBuildings") && (
                  <>
                    <label>
                      Width
                      <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "width", 1)} onChange={(event) => updateSelected({ width: Number(event.target.value) })} />
                    </label>
                    <label>
                      Depth
                      <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "depth", 1)} onChange={(event) => updateSelected({ depth: Number(event.target.value) })} />
                    </label>
                  </>
                )}

                {(selection.layer === "buildings" || selection.layer === "backdropBuildings") && (
                  <label>
                    Height
                    <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "height", 1)} onChange={(event) => updateSelected({ height: Number(event.target.value) })} />
                  </label>
                )}

                {selection.layer === "patrolZones" && (
                  <label>
                    Radius
                    <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "radius", 1)} onChange={(event) => updateSelected({ radius: Number(event.target.value) })} />
                  </label>
                )}

                {selection.layer === "decorations" && (
                  <>
                    <label>
                      Scale
                      <input type="number" min="0.2" step="0.05" value={numericValue(selectedItem, "scale", 1)} onChange={(event) => updateSelected({ scale: Number(event.target.value) })} />
                    </label>
                    <label>
                      Rotation
                      <input type="number" step="0.05" value={numericValue(selectedItem, "rotationY", 0)} onChange={(event) => updateSelected({ rotationY: Number(event.target.value) })} />
                    </label>
                  </>
                )}

                {selection.layer === "buildings" && (
                  <label className="wide">
                    Style
                    <select value={String(selectedItem.style ?? "garage")} onChange={(event) => updateSelected({ style: event.target.value as BuildingVisualStyle })}>
                      {buildingStyles.map((style) => (
                        <option key={style} value={style}>
                          {style.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {selection.layer === "decorations" && (
                  <label className="wide">
                    Kind
                    <select value={String(selectedItem.kind ?? "streetlight")} onChange={(event) => updateSelected({ kind: event.target.value as WorldDecorationKind })}>
                      {decorationKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </>
          )}

          <div className="admin-validation">
            <h3>
              <AlertTriangle size={16} aria-hidden="true" />
              Validation
            </h3>
            {issues.length === 0 ? (
              <p>No map validation issues.</p>
            ) : (
              issues.slice(0, 7).map((issue, index) => (
                <p className={issue.severity} key={`${issue.message}-${index}`}>
                  {issue.message}
                </p>
              ))
            )}
          </div>

          <div className="admin-revisions">
            <h3>
              <History size={16} aria-hidden="true" />
              Map History
              <button onClick={() => refreshRevisions()} type="button">Refresh</button>
            </h3>
            {revisions.length === 0 ? (
              <p>No saved revisions yet.</p>
            ) : (
              revisions.slice(0, 6).map((revision) => (
                <button disabled={saving} key={revision.id} onClick={() => handleRestoreRevision(revision)} type="button">
                  <span>r{revision.revision} {revision.action.replace("_", " ")}</span>
                  <small>{new Date(revision.createdAt).toLocaleString()} · {revision.createdBy ?? "unknown"}</small>
                </button>
              ))
            )}
          </div>

          <div className="admin-monitoring">
            <h3>
              <Gauge size={16} aria-hidden="true" />
              Operations
              <button onClick={() => refreshMonitoring()} type="button">Refresh</button>
            </h3>
            {monitoring ? (
              <>
                <p>DB {monitoring.database.ok ? "ok" : "offline"} · {monitoring.database.latencyMs ?? "--"}ms · uptime {monitoring.uptimeSeconds}s</p>
                <div>
                  <span>Requests {monitoring.metrics.apiRequests ?? 0}</span>
                  <span>Saves {monitoring.metrics.gameSaves ?? 0}</span>
                  <span>Conflicts {monitoring.metrics.gameSaveConflicts ?? 0}</span>
                  <span>Map saves {monitoring.metrics.mapSaves ?? 0}</span>
                  <span>Errors {monitoring.metrics.serverErrors ?? 0}</span>
                </div>
                {monitoring.recentEvents.slice(0, 4).map((event) => (
                  <small className={event.level} key={`${event.at}-${event.type}`}>{event.type}: {event.message}</small>
                ))}
              </>
            ) : (
              <p>Monitoring snapshot not loaded.</p>
            )}
          </div>
          {status && <p className="admin-status">{status}</p>}
        </aside>
      </section>
      ) : (
        <AdminAudioEditor initialConfig={initialAudioConfig} onReset={onAudioReset} onSave={onAudioSave} session={adminSession} />
      )}
    </main>
  );
}
