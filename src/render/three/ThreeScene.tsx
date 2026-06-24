import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GameState } from "../../game/core/types";
import { machineAtLocation } from "../../game/core/selectors";
import type { SceneTarget } from "./SceneTargets";

interface ThreeSceneProps {
  state: GameState;
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

function addBlock(scene: THREE.Scene, x: number, z: number, width: number, depth: number, height: number, color: string): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 })
  );
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
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

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
}

function clearGroup(group: THREE.Group): void {
  for (const child of group.children) {
    disposeObject(child);
  }
  group.clear();
}

export function ThreeScene({ state, onTargetChange }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const interactablesRef = useRef<Interactable[]>([]);
  const targetIdRef = useRef<string | null>(null);
  const onTargetChangeRef = useRef(onTargetChange);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111827");
    scene.fog = new THREE.Fog("#111827", 16, 34);

    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 80);
    camera.position.set(0, 1.65, 0);
    camera.rotation.order = "YXZ";

    const yaw = new THREE.Object3D();
    yaw.position.set(-8, 0, 9);
    yaw.add(camera);
    scene.add(yaw);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight("#dbeafe", "#172554", 1.15);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#fef3c7", 2.2);
    keyLight.position.set(-6, 11, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 40),
      new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(42, 0.03, 4),
      new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.85 })
    );
    road.position.set(0, 0.02, 0);
    road.receiveShadow = true;
    scene.add(road);

    const crossRoad = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.035, 30),
      new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.85 })
    );
    crossRoad.position.set(0, 0.025, 0);
    crossRoad.receiveShadow = true;
    scene.add(crossRoad);

    addBlock(scene, -9, 8.8, 5.5, 3.5, 2.6, "#475569");
    addBlock(scene, 8.4, 8.7, 4.8, 3.2, 2.4, "#78350f");
    addBlock(scene, -5.2, -7.2, 5.8, 2.9, 2.8, "#0f766e");
    addBlock(scene, 4.3, -8.1, 5.3, 2.8, 3.1, "#7c2d12");
    addBlock(scene, 9.6, -2.8, 3.4, 4.6, 3.6, "#4c1d95");
    addBlock(scene, -11.6, -2.1, 2.8, 5.3, 2.7, "#0e7490");
    addBlock(scene, 1.5, 4.7, 4.2, 3.4, 2.5, "#991b1b");

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    const keys = new Set<string>();
    let pitch = 0;
    let lastTime = performance.now();
    let disposed = false;

    const updateDynamicObjects = () => {
      if (!dynamicGroupRef.current) {
        return;
      }

      clearGroup(dynamicGroupRef.current);
      const interactables: Interactable[] = [];
      const currentState = stateRef.current;

      for (const location of Object.values(currentState.locations)) {
        const position = new THREE.Vector3(location.position.x, 0, location.position.z);

        if (location.kind === "garage") {
          const marker = addMarker("#38bdf8");
          marker.position.copy(position);
          dynamicGroupRef.current.add(marker);
          interactables.push({ target: { type: "base", id: "garage", label: location.name }, position });
          continue;
        }

        if (location.kind === "supplier") {
          const marker = addMarker("#f59e0b");
          marker.position.copy(position);
          dynamicGroupRef.current.add(marker);
          interactables.push({ target: { type: "supplier", id: "supplier", label: location.name }, position });
          continue;
        }

        const machine = machineAtLocation(currentState, location.id);
        if (machine) {
          const owner = currentState.factions[machine.ownerFactionId];
          const machineGroup = createMachineMesh(owner?.color ?? "#94a3b8", machine.damage);
          machineGroup.position.copy(position);
          const lookAt = new THREE.Vector3(0, 0, 0);
          machineGroup.lookAt(lookAt);
          dynamicGroupRef.current.add(machineGroup);
          interactables.push({ target: { type: "machine", id: machine.id, label: machine.name }, position });
        } else {
          const marker = addMarker("#a3e635");
          marker.position.copy(position);
          dynamicGroupRef.current.add(marker);
          interactables.push({ target: { type: "placement", id: location.id, label: location.name }, position });
        }
      }

      interactablesRef.current = interactables;
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

    clearGroup(dynamicGroup);
    const interactables: Interactable[] = [];

    for (const location of Object.values(state.locations)) {
      const position = new THREE.Vector3(location.position.x, 0, location.position.z);

      if (location.kind === "garage") {
        const marker = addMarker("#38bdf8");
        marker.position.copy(position);
        dynamicGroup.add(marker);
        interactables.push({ target: { type: "base", id: "garage", label: location.name }, position });
        continue;
      }

      if (location.kind === "supplier") {
        const marker = addMarker("#f59e0b");
        marker.position.copy(position);
        dynamicGroup.add(marker);
        interactables.push({ target: { type: "supplier", id: "supplier", label: location.name }, position });
        continue;
      }

      const machine = machineAtLocation(state, location.id);
      if (machine) {
        const owner = state.factions[machine.ownerFactionId];
        const machineGroup = createMachineMesh(owner?.color ?? "#94a3b8", machine.damage);
        machineGroup.position.copy(position);
        machineGroup.lookAt(new THREE.Vector3(0, 0, 0));
        dynamicGroup.add(machineGroup);
        interactables.push({ target: { type: "machine", id: machine.id, label: machine.name }, position });
      } else {
        const marker = addMarker("#a3e635");
        marker.position.copy(position);
        dynamicGroup.add(marker);
        interactables.push({ target: { type: "placement", id: location.id, label: location.name }, position });
      }
    }

    interactablesRef.current = interactables;
  }, [state]);

  return <div className="scene-mount" ref={mountRef} aria-label="3D district view" />;
}
