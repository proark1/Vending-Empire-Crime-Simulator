import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GameState } from "../../game/core/types";
import { machineAtLocation } from "../../game/core/selectors";
import type { SceneTarget } from "./SceneTargets";
import { createAsphaltMaterial, createBuilding, createRoadMaterial, createSidewalkMaterial, createSkyDome, createStreetProps } from "./proceduralArt";

interface ThreeSceneProps {
  state: GameState;
  onPlayerPositionChange: (position: { x: number; z: number }) => void;
  onTargetChange: (target: SceneTarget | null) => void;
}

interface Interactable {
  target: SceneTarget;
  position: THREE.Vector3;
}

function createMachineMesh(color: string, damage: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.7, 0.48),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 })
  );
  body.position.y = 0.85;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const windowPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.82, 0.03),
    new THREE.MeshStandardMaterial({ color: damage > 65 ? "#7f1d1d" : "#c7f9ff", emissive: damage > 65 ? "#3f1010" : "#0e7490", emissiveIntensity: 0.25 })
  );
  windowPanel.position.set(0, 1.05, -0.255);
  group.add(windowPanel);

  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.12, 0.035),
    new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.35 })
  );
  slot.position.set(0, 0.42, -0.265);
  group.add(slot);

  if (damage > 15) {
    const dent = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 + damage / 340, 0.05, 0.04),
      new THREE.MeshStandardMaterial({ color: "#fbbf24", emissive: "#92400e", emissiveIntensity: 0.25 })
    );
    dent.position.set(0.16, 1.43, -0.285);
    dent.rotation.z = -0.4;
    group.add(dent);
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

function addLabel(group: THREE.Group, text: string, color: string, position: THREE.Vector3, height: number): void {
  const label = createLabelSprite(text, color);
  label.position.set(position.x, height, position.z);
  group.add(label);
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
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

function addBuilding(scene: THREE.Scene, x: number, z: number, width: number, depth: number, height: number, style: Parameters<typeof createBuilding>[3], signText: string): void {
  const building = createBuilding(width, depth, height, style, signText);
  building.position.set(x, 0, z);
  scene.add(building);
}

function populateDynamicObjects(group: THREE.Group, currentState: GameState): Interactable[] {
  clearGroup(group);
  const interactables: Interactable[] = [];

  for (const location of Object.values(currentState.locations)) {
    const position = new THREE.Vector3(location.position.x, 0, location.position.z);

    if (location.kind === "garage") {
      const marker = addMarker("#38bdf8");
      marker.position.copy(position);
      group.add(marker);
      addLabel(group, location.name, "#38bdf8", position, 1.1);
      interactables.push({ target: { type: "base", id: "garage", label: location.name }, position });
      continue;
    }

    if (location.kind === "supplier") {
      const marker = addMarker("#f59e0b");
      marker.position.copy(position);
      group.add(marker);
      addLabel(group, location.name, "#f59e0b", position, 1.1);
      interactables.push({ target: { type: "supplier", id: "supplier", label: location.name }, position });
      continue;
    }

    const machine = machineAtLocation(currentState, location.id);
    if (machine) {
      const owner = currentState.factions[machine.ownerFactionId];
      const machineGroup = createMachineMesh(owner?.color ?? "#94a3b8", machine.damage);
      machineGroup.position.copy(position);
      machineGroup.lookAt(new THREE.Vector3(0, 0, 0));
      group.add(machineGroup);
      addLabel(group, machine.name, owner?.color ?? "#94a3b8", position, 2.2);
      interactables.push({ target: { type: "machine", id: machine.id, label: machine.name }, position });
    } else {
      const marker = addMarker("#a3e635");
      marker.position.copy(position);
      group.add(marker);
      addLabel(group, location.name, "#a3e635", position, 1.1);
      interactables.push({ target: { type: "placement", id: location.id, label: location.name }, position });
    }
  }

  return interactables;
}

export function ThreeScene({ state, onPlayerPositionChange, onTargetChange }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const interactablesRef = useRef<Interactable[]>([]);
  const targetIdRef = useRef<string | null>(null);
  const onPlayerPositionChangeRef = useRef(onPlayerPositionChange);
  const onTargetChangeRef = useRef(onTargetChange);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onPlayerPositionChangeRef.current = onPlayerPositionChange;
  }, [onPlayerPositionChange]);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a");
    scene.fog = new THREE.Fog("#18243a", 20, 48);

    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 80);
    camera.position.set(0, 1.65, 0);
    camera.rotation.order = "YXZ";

    const yaw = new THREE.Object3D();
    yaw.position.set(-8, 0, 1.4);
    yaw.rotation.y = Math.PI;
    yaw.add(camera);
    scene.add(yaw);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(createSkyDome());

    const hemi = new THREE.HemisphereLight("#dbeafe", "#172554", 1.05);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#bfdbfe", 1.45);
    keyLight.position.set(-8, 13, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 40),
      createAsphaltMaterial()
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(42, 0.03, 4),
      createRoadMaterial()
    );
    road.position.set(0, 0.02, 0);
    road.receiveShadow = true;
    scene.add(road);

    const crossRoad = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.035, 30),
      createRoadMaterial()
    );
    crossRoad.position.set(0, 0.025, 0);
    crossRoad.receiveShadow = true;
    scene.add(crossRoad);

    const sidewalkMaterial = createSidewalkMaterial();
    const sidewalks = [
      { x: 0, z: -3.35, width: 42, depth: 1.8 },
      { x: 0, z: 3.35, width: 42, depth: 1.8 },
      { x: -3.35, z: 0, width: 1.8, depth: 30 },
      { x: 3.35, z: 0, width: 1.8, depth: 30 }
    ];

    for (const sidewalk of sidewalks) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sidewalk.width, 0.04, sidewalk.depth), sidewalkMaterial);
      mesh.position.set(sidewalk.x, 0.06, sidewalk.z);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    addBuilding(scene, -9, 8.8, 5.5, 3.5, 2.6, "garage", "STORAGE");
    addBuilding(scene, 8.4, 8.7, 4.8, 3.2, 2.4, "supplier", "SUPPLY");
    addBuilding(scene, -5.2, -7.2, 5.8, 2.9, 2.8, "laundromat", "FOAM & FOLD");
    addBuilding(scene, 4.3, -8.1, 5.3, 2.8, 3.1, "gym", "IRON HABIT");
    addBuilding(scene, 9.6, -2.8, 3.4, 4.6, 3.6, "arcade", "PIXEL");
    addBuilding(scene, -11.6, -2.1, 2.8, 5.3, 2.7, "transit", "BUS STOP");
    addBuilding(scene, 1.5, 4.7, 4.2, 3.4, 2.5, "rival", "REDLINE");
    scene.add(createStreetProps());

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    const keys = new Set<string>();
    let pitch = 0;
    let lastTime = performance.now();
    let lastPositionEmit = 0;
    let disposed = false;

    const updateDynamicObjects = () => {
      if (!dynamicGroupRef.current) {
        return;
      }

      interactablesRef.current = populateDynamicObjects(dynamicGroupRef.current, stateRef.current);
    };

    updateDynamicObjects();

    const onKeyDown = (event: KeyboardEvent) => {
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
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002, -1.2, 1.2);
      camera.rotation.x = pitch;
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
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);

      let best: Interactable | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const interactable of interactablesRef.current) {
        const toTarget = interactable.position.clone().sub(cameraWorld);
        const distance = toTarget.length();
        if (distance > 3.2) {
          continue;
        }

        const alignment = forward.dot(toTarget.normalize());
        if (alignment < 0.22) {
          continue;
        }

        const score = distance - alignment;
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

      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7.5 : 4.2;
      const direction = new THREE.Vector3();

      if (keys.has("KeyW") || keys.has("ArrowUp")) direction.z -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) direction.z += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) direction.x -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) direction.x += 1;

      if (direction.lengthSq() > 0) {
        direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.rotation.y);
        yaw.position.addScaledVector(direction, speed * delta);
        yaw.position.x = THREE.MathUtils.clamp(yaw.position.x, -17, 17);
        yaw.position.z = THREE.MathUtils.clamp(yaw.position.z, -13, 13);
      }

      if (time - lastPositionEmit > 180) {
        lastPositionEmit = time;
        onPlayerPositionChangeRef.current({ x: yaw.position.x, z: yaw.position.z });
      }

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
      interactablesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) {
      return;
    }

    interactablesRef.current = populateDynamicObjects(dynamicGroup, state);
  }, [state]);

  return <div className="scene-mount" ref={mountRef} aria-label="3D district view" />;
}
