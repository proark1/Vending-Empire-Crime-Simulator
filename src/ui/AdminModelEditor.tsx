import { Box, MousePointer2, RotateCcw, Save, Scaling, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
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
  ring: THREE.Mesh;
  transformNode: THREE.Group;
}

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

function createPreviewVehicle(modelId: string): THREE.Group {
  const group = new THREE.Group();
  const isDelivery = modelId === "vehicle.delivery" || modelId === "vehicle.route_van";
  const isPolice = modelId === "vehicle.police";
  const length = isDelivery ? WORLD_SCALE.vehicle.deliveryLength : WORLD_SCALE.vehicle.length;
  const width = isDelivery ? WORLD_SCALE.vehicle.deliveryWidth : WORLD_SCALE.vehicle.width;
  const bodyHeight = isDelivery ? 1.05 : 0.72;
  const baseY = 0.44;
  const paint = new THREE.MeshStandardMaterial({ color: vehicleColor(modelId), roughness: 0.45, metalness: 0.08 });
  const trim = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.6, metalness: 0.08 });
  const glass = new THREE.MeshBasicMaterial({ color: "#bae6fd", transparent: true, opacity: 0.68 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.16, length * 0.84), trim);
  chassis.position.y = baseY;
  group.add(chassis);

  const body = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, bodyHeight, length * (isDelivery ? 0.52 : 0.62)), paint);
  body.position.set(0, baseY + bodyHeight * 0.55, isDelivery ? length * 0.12 : 0.05);
  group.add(body);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.64, length * 0.22), glass);
  cab.position.set(0, baseY + bodyHeight + 0.18, -length * 0.22);
  group.add(cab);

  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.09, length * 0.68), new THREE.MeshBasicMaterial({ color: "#2563eb" }));
    stripe.position.set(0, baseY + 0.55, 0);
    group.add(stripe);
    const lightbar = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.18), new THREE.MeshBasicMaterial({ color: "#ef4444" }));
    lightbar.position.set(0, cab.position.y + 0.36, cab.position.z);
    group.add(lightbar);
  }

  for (const x of [-width / 2 - 0.06, width / 2 + 0.06]) {
    for (const z of [-length * 0.32, length * 0.32]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 18), trim);
      wheel.position.set(x, 0.32, z);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
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
}

function AdminModelPreview({
  category,
  config,
  onChange,
  onSelect,
  selectedId
}: {
  category: ModelCategoryFilter;
  config: ModelConfig;
  onChange: (modelId: string, patch: ModelTransformPatch) => void;
  onSelect: (modelId: string) => void;
  selectedId: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef(config);
  const selectedIdRef = useRef(selectedId);
  const runtimesRef = useRef<Map<string, PreviewRuntime>>(new Map());

  const visibleModels = useMemo(
    () => modelCatalog.filter((model) => category === "all" || model.category === category),
    [category]
  );

  const updateRuntimes = useCallback(() => {
    for (const [modelId, runtime] of runtimesRef.current) {
      applyPreviewTransform(runtime, modelTransformFor(configRef.current, modelId));
      runtime.ring.visible = modelId === selectedIdRef.current;
    }
  }, []);

  useEffect(() => {
    configRef.current = config;
    selectedIdRef.current = selectedId;
    updateRuntimes();
  }, [config, selectedId, updateRuntimes]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020617");
    const camera = new THREE.PerspectiveCamera(54, mount.clientWidth / mount.clientHeight, 0.1, 80);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight("#e0f2fe", "#0f172a", 1.7);
    scene.add(hemi);
    const key = new THREE.DirectionalLight("#f8fafc", 1.6);
    key.position.set(-5, 9, 6);
    scene.add(key);

    const grid = new THREE.GridHelper(26, 26, "#334155", "#1e293b");
    grid.position.y = -0.01;
    scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 24),
      new THREE.MeshBasicMaterial({ color: "#0f172a", transparent: true, opacity: 0.55 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const pickables: THREE.Object3D[] = [];
    const runtimes = new Map<string, PreviewRuntime>();
    const columns = Math.max(3, Math.ceil(Math.sqrt(visibleModels.length)));
    const rowCount = Math.ceil(visibleModels.length / columns);
    const spacingX = 4.8;
    const spacingZ = 4.2;

    visibleModels.forEach((model, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const root = new THREE.Group();
      root.position.set((column - (columns - 1) / 2) * spacingX, 0, (row - (rowCount - 1) / 2) * spacingZ);
      root.userData.modelId = model.id;

      const transformNode = new THREE.Group();
      const modelObject = createPreviewModel(model);
      modelObject.traverse((object) => {
        object.userData.modelId = model.id;
        if ((object as THREE.Mesh).isMesh) {
          pickables.push(object);
        }
      });
      transformNode.add(modelObject);
      root.add(transformNode);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.035, 8, 64),
        new THREE.MeshBasicMaterial({ color: "#2dd4bf", transparent: true, opacity: 0.9 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      ring.visible = false;
      root.add(ring);

      scene.add(root);
      runtimes.set(model.id, { ring, transformNode });
    });

    runtimesRef.current = runtimes;
    updateRuntimes();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planePoint = new THREE.Vector3();
    const viewState = { distance: 18, draggingCamera: false, lastX: 0, lastY: 0, pitch: -0.48, yaw: -0.62 };
    let activeDrag: {
      modelId: string;
      startPoint: THREE.Vector3;
      startTransform: ModelTransform;
    } | null = null;
    let disposed = false;

    const updateCamera = () => {
      const target = new THREE.Vector3(0, 1.1, 0);
      camera.position.set(
        Math.sin(viewState.yaw) * Math.cos(viewState.pitch) * viewState.distance,
        Math.max(4.5, Math.sin(-viewState.pitch) * viewState.distance + 2),
        Math.cos(viewState.yaw) * Math.cos(viewState.pitch) * viewState.distance
      );
      camera.lookAt(target);
    };

    const setPointerFromEvent = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
    };

    const pickModel = (event: PointerEvent): string | null => {
      setPointerFromEvent(event);
      const intersections = raycaster.intersectObjects(pickables, false);
      for (const intersection of intersections) {
        const modelId = intersection.object.userData.modelId;
        if (typeof modelId === "string") {
          return modelId;
        }
      }
      return null;
    };

    const intersectGround = (event: PointerEvent): THREE.Vector3 | null => {
      setPointerFromEvent(event);
      return raycaster.ray.intersectPlane(groundPlane, planePoint) ? planePoint.clone() : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      const modelId = pickModel(event);
      viewState.lastX = event.clientX;
      viewState.lastY = event.clientY;

      if (modelId && event.button === 0) {
        selectedIdRef.current = modelId;
        onSelect(modelId);
        updateRuntimes();
        const startPoint = intersectGround(event);
        if (startPoint) {
          activeDrag = {
            modelId,
            startPoint,
            startTransform: modelTransformFor(configRef.current, modelId)
          };
        }
        return;
      }

      viewState.draggingCamera = true;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activeDrag) {
        const nextPoint = intersectGround(event);
        if (!nextPoint) {
          return;
        }
        const patch = {
          offsetX: Number((activeDrag.startTransform.offsetX + nextPoint.x - activeDrag.startPoint.x).toFixed(2)),
          offsetZ: Number((activeDrag.startTransform.offsetZ + nextPoint.z - activeDrag.startPoint.z).toFixed(2))
        };
        configRef.current = updateConfigTransform(configRef.current, activeDrag.modelId, patch);
        onChange(activeDrag.modelId, patch);
        updateRuntimes();
        return;
      }

      if (!viewState.draggingCamera) {
        return;
      }

      viewState.yaw -= (event.clientX - viewState.lastX) * 0.008;
      viewState.pitch = THREE.MathUtils.clamp(viewState.pitch - (event.clientY - viewState.lastY) * 0.006, -0.95, -0.18);
      viewState.lastX = event.clientX;
      viewState.lastY = event.clientY;
      updateCamera();
    };

    const onPointerUp = (event: PointerEvent) => {
      activeDrag = null;
      viewState.draggingCamera = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      viewState.distance = THREE.MathUtils.clamp(viewState.distance + event.deltaY * 0.012, 9, 34);
      updateCamera();
    };

    const onResize = () => {
      if (!mountRef.current) {
        return;
      }
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    const animate = () => {
      if (disposed) {
        return;
      }
      for (const runtime of runtimes.values()) {
        runtime.ring.rotation.z += 0.01;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    updateCamera();
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    const animationId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      disposeObject(scene);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      runtimesRef.current = new Map();
    };
  }, [onChange, onSelect, updateRuntimes, visibleModels]);

  return (
    <div className="admin-model-preview" ref={mountRef}>
      <div className="admin-model-preview-badge">
        <MousePointer2 size={14} aria-hidden="true" />
        <span>Direct 3D</span>
      </div>
    </div>
  );
}

export function AdminModelEditor({ config, onReset, onSave }: AdminModelEditorProps) {
  const [draft, setDraft] = useState<ModelConfig>(() => cloneConfig(config));
  const [selectedId, setSelectedId] = useState(modelCatalog[0]?.id ?? "unit.player");
  const [activeCategory, setActiveCategory] = useState<ModelCategoryFilter>("all");
  const [status, setStatus] = useState("");

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
            <button className={activeCategory === category ? "active" : ""} key={category} onClick={() => setActiveCategory(category)} type="button">
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
          <div>
            <button onClick={() => quickRotate(-15)} type="button">Turn -15</button>
            <button onClick={() => quickRotate(15)} type="button">Turn +15</button>
            <button onClick={() => quickScale(0.9)} type="button">Scale -</button>
            <button onClick={() => quickScale(1.1)} type="button">Scale +</button>
          </div>
        </div>
        <AdminModelPreview category={activeCategory} config={draft} onChange={updateTransform} onSelect={setSelectedId} selectedId={selectedId} />
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
