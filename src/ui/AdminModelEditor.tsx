import { Box, Focus, MousePointer2, Move3d, Rotate3d, RotateCcw, Save, Scale3d, Scaling, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls, type TransformControlsMode } from "three/examples/jsm/controls/TransformControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  createDefaultModelConfig,
  defaultModelTransform,
  modelCatalog,
  modelTransformFor,
  normalizeModelConfig,
  normalizeModelTransform,
  type ModelCategory,
  type ModelConfig,
  type ModelDefinition,
  type ModelTransform
} from "../game/content/modelConfig";
import { WORLD_SCALE } from "../game/world/scale";
import { createBuilding, createNpcCharacter } from "../render/three/proceduralArt";

interface AdminModelEditorProps {
  config: ModelConfig;
  onReset: () => void;
  onSave: (config: ModelConfig) => void;
}

type ModelCategoryFilter = "all" | ModelCategory;
type ModelTransformPatch = Partial<ModelTransform>;

interface PreviewRuntime {
  bounds: THREE.BoxHelper;
  modelId: string;
  transformNode: THREE.Group;
}

type PreviewTransformMode = TransformControlsMode;

const categoryLabels: Record<ModelCategoryFilter, string> = {
  all: "All",
  buildings: "Buildings",
  machines: "Machines",
  props: "Props",
  units: "Units",
  vehicles: "Vehicles"
};

const categoryOrder: ModelCategoryFilter[] = ["all", "vehicles", "units", "machines", "buildings", "props"];

function cloneConfig(config: ModelConfig): ModelConfig {
  return normalizeModelConfig(JSON.parse(JSON.stringify(config)) as ModelConfig);
}

function formatNumber(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toString();
}

function roundNumber(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function radToDeg(value: number): number {
  return value * 180 / Math.PI;
}

function degToRad(value: number): number {
  return value * Math.PI / 180;
}

function updateConfigTransform(config: ModelConfig, modelId: string, patch: ModelTransformPatch): ModelConfig {
  return normalizeModelConfig({
    ...config,
    [modelId]: normalizeModelTransform({
      ...modelTransformFor(config, modelId),
      ...patch
    })
  });
}

function vehicleColor(modelId: string): string {
  if (modelId === "vehicle.police") {
    return "#f8fafc";
  }
  if (modelId === "vehicle.delivery") {
    return "#d97706";
  }
  if (modelId === "vehicle.route_van") {
    return "#bef264";
  }
  return "#38bdf8";
}

function previewRoundedBox(width: number, height: number, depth: number, radius: number): RoundedBoxGeometry {
  return new RoundedBoxGeometry(width, height, depth, 3, radius);
}

function createPreviewVehicle(modelId: string): THREE.Group {
  const group = new THREE.Group();
  const isDelivery = modelId === "vehicle.delivery" || modelId === "vehicle.route_van";
  const isPolice = modelId === "vehicle.police";
  const length = isDelivery ? WORLD_SCALE.vehicle.deliveryLength : WORLD_SCALE.vehicle.length;
  const width = isDelivery ? WORLD_SCALE.vehicle.deliveryWidth : WORLD_SCALE.vehicle.width;
  const bodyHeight = isDelivery ? 1.05 : 0.72;
  const cabHeight = isDelivery ? 0.82 : 0.66;
  const wheelRadius = isDelivery ? 0.38 : 0.34;
  const baseY = wheelRadius + 0.14;
  const paint = new THREE.MeshPhysicalMaterial({ color: vehicleColor(modelId), roughness: 0.36, metalness: 0.12, clearcoat: 0.28, clearcoatRoughness: 0.44 });
  const trim = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.52, metalness: 0.18 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#93c5fd", roughness: 0.03, metalness: 0.02, transparent: true, opacity: 0.58, transmission: 0.1 });
  const hub = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.34, metalness: 0.42 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.16, length * 0.86), trim);
  chassis.position.set(0, baseY, 0);
  group.add(chassis);

  const body = new THREE.Mesh(previewRoundedBox(width * 0.92, bodyHeight * 0.74, length * (isDelivery ? 0.5 : 0.58), 0.08), paint);
  body.position.set(0, baseY + bodyHeight * 0.42, isDelivery ? length * 0.14 : 0.06);
  group.add(body);

  const hood = new THREE.Mesh(previewRoundedBox(width * 0.8, bodyHeight * 0.34, length * 0.2, 0.07), paint);
  hood.position.set(0, baseY + bodyHeight * 0.42, -length * 0.34);
  group.add(hood);

  const cab = new THREE.Mesh(previewRoundedBox(width * 0.72, cabHeight, length * 0.24, 0.08), glass);
  cab.position.set(0, baseY + bodyHeight * 0.94, isDelivery ? -length * 0.22 : -length * 0.06);
  group.add(cab);

  for (const z of [-length / 2 - 0.04, length / 2 + 0.04]) {
    const bumper = new THREE.Mesh(previewRoundedBox(width * 0.86, 0.1, 0.08, 0.025), trim);
    bumper.position.set(0, baseY + 0.18, z);
    group.add(bumper);
  }

  for (const side of [-1, 1]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.035, cabHeight * 0.46, length * 0.14), glass);
    sideWindow.position.set(side * (width / 2 + 0.03), cab.position.y + 0.02, cab.position.z);
    group.add(sideWindow);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.035, 0.16), trim);
    handle.position.set(side * (width / 2 + 0.06), baseY + bodyHeight * 0.58, cab.position.z + length * 0.05);
    group.add(handle);
  }

  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.09, length * 0.68), new THREE.MeshBasicMaterial({ color: "#2563eb" }));
    stripe.position.set(0, baseY + 0.55, 0);
    group.add(stripe);
    const lightbar = new THREE.Group();
    lightbar.position.set(0, cab.position.y + 0.42, cab.position.z);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.18), new THREE.MeshBasicMaterial({ color: "#ef4444" }));
    red.position.x = -0.15;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.18), new THREE.MeshBasicMaterial({ color: "#2563eb" }));
    blue.position.x = 0.15;
    lightbar.add(red, blue);
    group.add(lightbar);
  }

  if (isDelivery) {
    const cargoBox = new THREE.Mesh(previewRoundedBox(width * 0.94, bodyHeight * 0.98, length * 0.46, 0.08), paint);
    cargoBox.position.set(0, baseY + bodyHeight * 0.64, length * 0.16);
    group.add(cargoBox);

    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.46, length * 0.26), new THREE.MeshBasicMaterial({ color: modelId === "vehicle.route_van" ? "#2dd4bf" : "#facc15" }));
      panel.position.set(side * (width / 2 + 0.03), baseY + bodyHeight * 0.68, length * 0.14);
      group.add(panel);
    }
  }

  for (const x of [-width / 2 - 0.06, width / 2 + 0.06]) {
    for (const z of [-length * 0.32, length * 0.32]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.17, 22), trim);
      wheel.position.set(x, 0.32, z);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);

      const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.44, wheelRadius * 0.44, 0.18, 14), hub);
      wheelHub.position.copy(wheel.position);
      wheelHub.rotation.z = Math.PI / 2;
      group.add(wheelHub);

      const arch = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 1.08, 0.028, 8, 20, Math.PI), trim);
      arch.position.set(x, wheelRadius + 0.14, z);
      arch.rotation.x = Math.PI / 2;
      group.add(arch);
    }
  }

  return group;
}

function unitVariant(modelId: string): "customer" | "rival" | "scout" | "worker" {
  if (modelId === "unit.rival") {
    return "rival";
  }
  if (modelId === "unit.scout") {
    return "scout";
  }
  if (modelId === "unit.worker" || modelId === "unit.player") {
    return "worker";
  }
  return "customer";
}

function createPreviewMachine(modelId: string): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: modelId === "machine.placement_pad" ? "#334155" : "#14b8a6", roughness: 0.45, metalness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.6, metalness: 0.1 });

  if (modelId === "machine.placement_pad") {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 1.18), material);
    pad.position.y = 0.04;
    group.add(pad);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 12), dark);
    post.position.set(-0.58, 0.32, -0.48);
    group.add(post);
    return group;
  }

  if (modelId === "machine.storage_bay") {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 0.88), material);
    platform.position.y = 0.06;
    group.add(platform);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.56, 0.1), dark);
    rail.position.set(0, 0.36, 0.42);
    group.add(rail);
    return group;
  }

  if (modelId === "stock.crate") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.54), new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.62 }));
    crate.position.y = 0.22;
    group.add(crate);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.58), dark);
    strap.position.y = 0.24;
    group.add(strap);
    return group;
  }

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.68, 0.58), material);
  cabinet.position.y = 0.84;
  group.add(cabinet);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.82, 0.04), new THREE.MeshBasicMaterial({ color: "#dffbff", transparent: true, opacity: 0.72 }));
  glass.position.set(-0.14, 1.02, -0.31);
  group.add(glass);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.05), dark);
  slot.position.set(0.24, 0.46, -0.32);
  group.add(slot);
  return group;
}

function createPreviewProp(modelId: string): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.55, metalness: 0.12 });
  const accent = new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.48, metalness: 0.06 });

  if (modelId === "prop.streetlight") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 2.6, 12), metal);
    pole.position.y = 1.3;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.06), metal);
    arm.position.set(0.3, 2.46, 0);
    group.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10), new THREE.MeshBasicMaterial({ color: "#fef3c7" }));
    lamp.position.set(0.66, 2.42, 0);
    group.add(lamp);
    return group;
  }

  if (modelId === "prop.billboard") {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), metal);
    post.position.y = 0.75;
    group.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.82, 0.12), accent);
    board.position.y = 1.58;
    group.add(board);
    return group;
  }

  if (modelId === "prop.bollard") {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.72, 16), metal);
    bollard.position.y = 0.36;
    group.add(bollard);
    return group;
  }

  if (modelId === "prop.dumpster") {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.72, 0.82), new THREE.MeshStandardMaterial({ color: "#14532d", roughness: 0.72 }));
    bin.position.y = 0.36;
    group.add(bin);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.08, 0.9), metal);
    lid.position.y = 0.78;
    group.add(lid);
    return group;
  }

  if (modelId === "prop.planter") {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.44), new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.76 }));
    box.position.y = 0.15;
    group.add(box);
    for (const x of [-0.32, 0, 0.32]) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 7), new THREE.MeshStandardMaterial({ color: "#22c55e", roughness: 0.7 }));
      leaf.position.set(x, 0.55, 0);
      group.add(leaf);
    }
    return group;
  }

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.86, 0.42), metal);
  cabinet.position.y = 0.43;
  group.add(cabinet);
  return group;
}

function createPreviewModel(definition: ModelDefinition): THREE.Group {
  if (definition.category === "vehicles") {
    return createPreviewVehicle(definition.id);
  }

  if (definition.category === "units") {
    const character = createNpcCharacter(unitVariant(definition.id), "medium");
    if (definition.id === "unit.player") {
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.028), new THREE.MeshBasicMaterial({ color: "#2dd4bf" }));
      badge.position.set(-0.08, 1, -0.225);
      character.add(badge);
    }
    return character;
  }

  if (definition.category === "machines") {
    return createPreviewMachine(definition.id);
  }

  if (definition.category === "buildings") {
    if (definition.id === "building.backdrop") {
      const block = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.6, 2.2), new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.78 }));
      tower.position.y = 2.8;
      block.add(tower);
      return block;
    }
    return createBuilding(4.2, 3.2, 3.4, "garage", "MODEL", "medium");
  }

  return createPreviewProp(definition.id);
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function applyPreviewTransform(runtime: PreviewRuntime, transform: ModelTransform): void {
  runtime.transformNode.position.set(transform.offsetX, transform.offsetY, transform.offsetZ);
  runtime.transformNode.rotation.set(transform.rotationX, transform.rotationY, transform.rotationZ);
  runtime.transformNode.scale.set(transform.scaleX, transform.scaleY, transform.scaleZ);
  runtime.transformNode.updateMatrixWorld(true);
  runtime.bounds.update();
}

function transformFromPreviewObject(object: THREE.Object3D): ModelTransform {
  return normalizeModelTransform({
    offsetX: roundNumber(object.position.x),
    offsetY: roundNumber(object.position.y),
    offsetZ: roundNumber(object.position.z),
    rotationX: roundNumber(object.rotation.x, 4),
    rotationY: roundNumber(object.rotation.y, 4),
    rotationZ: roundNumber(object.rotation.z, 4),
    scaleX: roundNumber(object.scale.x),
    scaleY: roundNumber(object.scale.y),
    scaleZ: roundNumber(object.scale.z)
  });
}

function AdminModelPreview({
  config,
  onChange,
  selectedId,
  transformMode,
  viewResetKey
}: {
  config: ModelConfig;
  onChange: (modelId: string, patch: ModelTransformPatch) => void;
  selectedId: string;
  transformMode: PreviewTransformMode;
  viewResetKey: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const configRef = useRef(config);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const selectedIdRef = useRef(selectedId);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const transformModeRef = useRef<PreviewTransformMode>(transformMode);
  const applyingTransformRef = useRef(false);
  const onChangeRef = useRef(onChange);

  const updateTransformMode = useCallback((mode: PreviewTransformMode) => {
    const controls = transformControlsRef.current;
    transformModeRef.current = mode;
    if (!controls) {
      return;
    }

    controls.setMode(mode);
    controls.setSpace(mode === "translate" ? "world" : "local");
    controls.showX = true;
    controls.showY = true;
    controls.showZ = true;
  }, []);

  const applySelectedTransform = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || transformControlsRef.current?.dragging) {
      return;
    }

    applyingTransformRef.current = true;
    applyPreviewTransform(runtime, modelTransformFor(configRef.current, runtime.modelId));
    applyingTransformRef.current = false;
  }, []);

  const frameSelectedModel = useCallback(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    const runtime = runtimeRef.current;
    const renderer = rendererRef.current;
    if (!camera || !controls || !runtime || !renderer) {
      return;
    }

    runtime.transformNode.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(runtime.transformNode);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const distance = THREE.MathUtils.clamp(maxDimension * 2.45, 4.8, 28);
    const direction = new THREE.Vector3(0.9, 0.58, 1).normalize();

    camera.position.set(
      center.x + direction.x * distance,
      center.y + Math.max(maxDimension * 0.72, direction.y * distance),
      center.z + direction.z * distance
    );
    camera.near = Math.max(0.02, distance / 120);
    camera.far = Math.max(80, distance * 8);
    camera.updateProjectionMatrix();
    controls.target.set(center.x, Math.max(0.35, center.y), center.z);
    controls.update();
    renderer.render(sceneRef.current as THREE.Scene, camera);
  }, []);

  const replaceSelectedModel = useCallback((modelId: string) => {
    const scene = sceneRef.current;
    const transformControls = transformControlsRef.current;
    if (!scene || !transformControls) {
      return;
    }

    const definition = modelCatalog.find((model) => model.id === modelId) ?? modelCatalog[0];
    if (!definition) {
      return;
    }

    if (runtimeRef.current) {
      transformControls.detach();
      scene.remove(runtimeRef.current.transformNode);
      scene.remove(runtimeRef.current.bounds);
      disposeObject(runtimeRef.current.transformNode);
      disposeObject(runtimeRef.current.bounds);
      runtimeRef.current = null;
    }

    const transformNode = new THREE.Group();
    transformNode.name = `admin-model-preview:${definition.id}`;
    transformNode.userData.modelId = definition.id;
    const modelObject = createPreviewModel(definition);
    modelObject.traverse((object) => {
      object.userData.modelId = definition.id;
    });
    transformNode.add(modelObject);
    scene.add(transformNode);

    const bounds = new THREE.BoxHelper(transformNode, "#2dd4bf");
    bounds.name = `admin-model-bounds:${definition.id}`;
    scene.add(bounds);

    const runtime: PreviewRuntime = { bounds, modelId: definition.id, transformNode };
    runtimeRef.current = runtime;
    applyPreviewTransform(runtime, modelTransformFor(configRef.current, definition.id));
    transformControls.attach(transformNode);
    updateTransformMode(transformModeRef.current);
    frameSelectedModel();
  }, [frameSelectedModel, updateTransformMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020617");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(54, mount.clientWidth / mount.clientHeight, 0.1, 120);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight("#e0f2fe", "#0f172a", 1.7);
    scene.add(hemi);
    const key = new THREE.DirectionalLight("#f8fafc", 1.6);
    key.position.set(-5, 9, 6);
    scene.add(key);

    const grid = new THREE.GridHelper(44, 44, "#334155", "#1e293b");
    grid.position.y = -0.01;
    scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.MeshBasicMaterial({ color: "#0f172a", transparent: true, opacity: 0.55 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const axes = new THREE.AxesHelper(2.2);
    axes.position.y = 0.04;
    scene.add(axes);

    const origin = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.36, 32),
      new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.72, side: THREE.DoubleSide })
    );
    origin.rotation.x = -Math.PI / 2;
    origin.position.y = 0.03;
    scene.add(origin);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.minDistance = 2.6;
    orbitControls.maxDistance = 44;
    orbitControls.screenSpacePanning = false;
    orbitControlsRef.current = orbitControls;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setTranslationSnap(0.05);
    transformControls.setRotationSnap(degToRad(1));
    transformControls.setScaleSnap(0.025);
    transformControls.setSize(0.9);
    transformControlsRef.current = transformControls;
    const transformHelper = transformControls.getHelper();
    scene.add(transformHelper);

    const syncTransformFromControls = () => {
      const runtime = runtimeRef.current;
      if (!runtime || applyingTransformRef.current) {
        return;
      }

      const nextTransform = transformFromPreviewObject(runtime.transformNode);
      applyingTransformRef.current = true;
      applyPreviewTransform(runtime, nextTransform);
      applyingTransformRef.current = false;
      configRef.current = updateConfigTransform(configRef.current, runtime.modelId, nextTransform);
      onChangeRef.current(runtime.modelId, nextTransform);
    };

    const updateOrbitDragState = (event: { value: unknown }) => {
      orbitControls.enabled = !event.value;
    };

    transformControls.addEventListener("objectChange", syncTransformFromControls);
    transformControls.addEventListener("dragging-changed", updateOrbitDragState);
    let disposed = false;

    const onResize = () => {
      if (!mountRef.current) {
        return;
      }
      const width = Math.max(1, mountRef.current.clientWidth);
      const height = Math.max(1, mountRef.current.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);
    onResize();
    updateTransformMode(transformModeRef.current);
    replaceSelectedModel(selectedIdRef.current);

    const animate = () => {
      if (disposed) {
        return;
      }
      orbitControls.update();
      if (runtimeRef.current) {
        runtimeRef.current.bounds.update();
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      transformControls.removeEventListener("objectChange", syncTransformFromControls);
      transformControls.removeEventListener("dragging-changed", updateOrbitDragState);
      transformControls.detach();
      transformControls.dispose();
      transformHelper.dispose();
      orbitControls.dispose();
      disposeObject(scene);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      orbitControlsRef.current = null;
      transformControlsRef.current = null;
      runtimeRef.current = null;
    };
  }, [replaceSelectedModel, updateTransformMode]);

  useEffect(() => {
    configRef.current = config;
    onChangeRef.current = onChange;
    applySelectedTransform();
  }, [applySelectedTransform, config, onChange]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    replaceSelectedModel(selectedId);
  }, [replaceSelectedModel, selectedId]);

  useEffect(() => {
    updateTransformMode(transformMode);
  }, [transformMode, updateTransformMode]);

  useEffect(() => {
    if (viewResetKey > 0) {
      frameSelectedModel();
    }
  }, [frameSelectedModel, viewResetKey]);

  return (
    <div className="admin-model-preview" ref={mountRef}>
      <div className="admin-model-preview-badge">
        <MousePointer2 size={14} aria-hidden="true" />
        <span>Solo 3D</span>
      </div>
    </div>
  );
}

export function AdminModelEditor({ config, onReset, onSave }: AdminModelEditorProps) {
  const [draft, setDraft] = useState<ModelConfig>(() => cloneConfig(config));
  const [selectedId, setSelectedId] = useState(modelCatalog[0]?.id ?? "unit.player");
  const [activeCategory, setActiveCategory] = useState<ModelCategoryFilter>("all");
  const [transformMode, setTransformMode] = useState<PreviewTransformMode>("translate");
  const [status, setStatus] = useState("");
  const [viewResetKey, setViewResetKey] = useState(0);

  useEffect(() => {
    setDraft(cloneConfig(config));
  }, [config]);

  const selectedModel = modelCatalog.find((model) => model.id === selectedId) ?? modelCatalog[0];
  const selectedTransform = modelTransformFor(draft, selectedId);
  const filteredModels = modelCatalog.filter((model) => activeCategory === "all" || model.category === activeCategory);
  const hasChanges = useMemo(() => JSON.stringify(normalizeModelConfig(draft)) !== JSON.stringify(normalizeModelConfig(config)), [config, draft]);

  const updateTransform = useCallback((modelId: string, patch: ModelTransformPatch) => {
    setDraft((current) => updateConfigTransform(current, modelId, patch));
    setStatus("Unsaved model changes.");
  }, []);

  const updateSelectedTransform = useCallback((patch: ModelTransformPatch) => {
    updateTransform(selectedId, patch);
  }, [selectedId, updateTransform]);

  const selectCategory = (category: ModelCategoryFilter) => {
    setActiveCategory(category);
    const nextModels = modelCatalog.filter((model) => category === "all" || model.category === category);
    if (!nextModels.some((model) => model.id === selectedId) && nextModels[0]) {
      setSelectedId(nextModels[0].id);
    }
  };

  const handleNumberChange = (key: keyof ModelTransform, value: string, isRotation = false) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    updateSelectedTransform({ [key]: isRotation ? degToRad(parsed) : parsed } as ModelTransformPatch);
  };

  const resetSelected = () => {
    updateTransform(selectedId, defaultModelTransform);
    setStatus(`${selectedModel.label} reset in draft.`);
  };

  const resetAll = () => {
    if (!window.confirm("Reset all 3D model transforms and apply the reset live?")) {
      return;
    }
    const defaults = createDefaultModelConfig();
    setDraft(defaults);
    onReset();
    setStatus("All model transforms reset live.");
  };

  const saveDraft = () => {
    const normalized = normalizeModelConfig(draft);
    setDraft(normalized);
    onSave(normalized);
    setStatus("3D model settings saved live.");
  };

  const revertDraft = () => {
    setDraft(cloneConfig(config));
    setStatus("Draft reverted to saved model settings.");
  };

  const quickScale = (amount: number) => {
    updateSelectedTransform({
      scaleX: Number((selectedTransform.scaleX * amount).toFixed(2)),
      scaleY: Number((selectedTransform.scaleY * amount).toFixed(2)),
      scaleZ: Number((selectedTransform.scaleZ * amount).toFixed(2))
    });
  };

  const quickRotate = (degrees: number) => {
    updateSelectedTransform({ rotationY: selectedTransform.rotationY + degToRad(degrees) });
  };

  return (
    <section className="admin-model-editor">
      <aside className="admin-model-sidebar">
        <div className="admin-model-tabs">
          {categoryOrder.map((category) => (
            <button className={activeCategory === category ? "active" : ""} key={category} onClick={() => selectCategory(category)} type="button">
              {categoryLabels[category]}
            </button>
          ))}
        </div>
        <div className="admin-model-list">
          {filteredModels.map((model) => (
            <button className={selectedId === model.id ? "active" : ""} key={model.id} onClick={() => setSelectedId(model.id)} type="button">
              <span>{model.label}</span>
              <small>{categoryLabels[model.category]} / {model.id}</small>
            </button>
          ))}
        </div>
      </aside>

      <div className="admin-model-stage">
        <div className="admin-model-toolbar">
          <div>
            <Box size={17} aria-hidden="true" />
            <strong>{selectedModel.label}</strong>
          </div>
          <div className="admin-model-tool-group" role="group" aria-label="3D transform mode">
            <button className={transformMode === "translate" ? "active" : ""} onClick={() => setTransformMode("translate")} title="Move with 3D handles" type="button">
              <Move3d size={15} aria-hidden="true" />
              Move
            </button>
            <button className={transformMode === "rotate" ? "active" : ""} onClick={() => setTransformMode("rotate")} title="Rotate with 3D handles" type="button">
              <Rotate3d size={15} aria-hidden="true" />
              Rotate
            </button>
            <button className={transformMode === "scale" ? "active" : ""} onClick={() => setTransformMode("scale")} title="Scale with 3D handles" type="button">
              <Scale3d size={15} aria-hidden="true" />
              Scale
            </button>
          </div>
          <div>
            <button onClick={() => quickRotate(-15)} type="button">
              <Rotate3d size={15} aria-hidden="true" />
              -15
            </button>
            <button onClick={() => quickRotate(15)} type="button">
              <Rotate3d size={15} aria-hidden="true" />
              +15
            </button>
            <button onClick={() => quickScale(0.9)} type="button">
              <Scale3d size={15} aria-hidden="true" />
              -
            </button>
            <button onClick={() => quickScale(1.1)} type="button">
              <Scale3d size={15} aria-hidden="true" />
              +
            </button>
            <button onClick={() => setViewResetKey((current) => current + 1)} title="Frame selected model" type="button">
              <Focus size={15} aria-hidden="true" />
              Fit
            </button>
          </div>
        </div>
        <AdminModelPreview config={draft} onChange={updateTransform} selectedId={selectedId} transformMode={transformMode} viewResetKey={viewResetKey} />
      </div>

      <aside className="admin-model-inspector">
        <div className="admin-model-heading">
          <div>
            <h2>{selectedModel.label}</h2>
            <span>{selectedModel.id}</span>
          </div>
          <SlidersHorizontal size={18} aria-hidden="true" />
        </div>
        <p className="admin-model-description">{selectedModel.description}</p>

        <div className="admin-model-field-grid">
          <label>
            Scale X
            <input min="0.1" max="5" step="0.05" type="number" value={formatNumber(selectedTransform.scaleX)} onChange={(event) => handleNumberChange("scaleX", event.target.value)} />
          </label>
          <label>
            Scale Y
            <input min="0.1" max="5" step="0.05" type="number" value={formatNumber(selectedTransform.scaleY)} onChange={(event) => handleNumberChange("scaleY", event.target.value)} />
          </label>
          <label>
            Scale Z
            <input min="0.1" max="5" step="0.05" type="number" value={formatNumber(selectedTransform.scaleZ)} onChange={(event) => handleNumberChange("scaleZ", event.target.value)} />
          </label>
          <label>
            Move X
            <input min="-20" max="20" step="0.1" type="number" value={formatNumber(selectedTransform.offsetX)} onChange={(event) => handleNumberChange("offsetX", event.target.value)} />
          </label>
          <label>
            Move Y
            <input min="-20" max="20" step="0.1" type="number" value={formatNumber(selectedTransform.offsetY)} onChange={(event) => handleNumberChange("offsetY", event.target.value)} />
          </label>
          <label>
            Move Z
            <input min="-20" max="20" step="0.1" type="number" value={formatNumber(selectedTransform.offsetZ)} onChange={(event) => handleNumberChange("offsetZ", event.target.value)} />
          </label>
          <label>
            Rotate X
            <input step="1" type="number" value={formatNumber(radToDeg(selectedTransform.rotationX), 1)} onChange={(event) => handleNumberChange("rotationX", event.target.value, true)} />
          </label>
          <label>
            Rotate Y
            <input step="1" type="number" value={formatNumber(radToDeg(selectedTransform.rotationY), 1)} onChange={(event) => handleNumberChange("rotationY", event.target.value, true)} />
          </label>
          <label>
            Rotate Z
            <input step="1" type="number" value={formatNumber(radToDeg(selectedTransform.rotationZ), 1)} onChange={(event) => handleNumberChange("rotationZ", event.target.value, true)} />
          </label>
        </div>

        <div className="admin-model-actions">
          <button className="primary" disabled={!hasChanges} onClick={saveDraft} type="button">
            <Save size={16} aria-hidden="true" />
            Save live
          </button>
          <button disabled={!hasChanges} onClick={revertDraft} type="button">
            <RotateCcw size={16} aria-hidden="true" />
            Revert
          </button>
          <button onClick={resetSelected} type="button">
            <Scaling size={16} aria-hidden="true" />
            Reset item
          </button>
          <button onClick={resetAll} type="button">
            <RotateCcw size={16} aria-hidden="true" />
            Reset all
          </button>
        </div>

        {status && <p className="admin-status">{status}</p>}
      </aside>
    </section>
  );
}
