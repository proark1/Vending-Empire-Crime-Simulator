import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GameState, Location, MachineUpgradeId, ProductId, StockCrate } from "../../game/core/types";
import { activeVehicle, garageStorageUnits, machineAtLocation, machineRoutePressure } from "../../game/core/selectors";
import type { SceneTarget } from "./SceneTargets";
import { createAsphaltMaterial, createAtmosphere, createBuilding, createRoadMaterial, createSidewalkMaterial, createSkyDome, createStreetProps } from "./proceduralArt";

interface ThreeSceneProps {
  guidanceLocationId?: string;
  state: GameState;
  onPlayerPositionChange: (position: { x: number; z: number }) => void;
  onPlayerHeadingChange: (headingDegrees: number) => void;
  onTargetChange: (target: SceneTarget | null) => void;
}

interface Interactable {
  target: SceneTarget;
  position: THREE.Vector3;
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
  mystery_capsules: "#e879f9"
};

const machinePlacementAnchors: Record<string, { x: number; z: number; rotationY: number }> = {
  laundromat: { x: -5.2, z: -5.15, rotationY: Math.PI },
  gym: { x: 4.25, z: -6.05, rotationY: Math.PI },
  arcade: { x: 8.75, z: 0.05, rotationY: Math.PI },
  transit: { x: -9.72, z: -1.1, rotationY: -Math.PI / 2 },
  rival_corner: { x: 1.35, z: 2.38, rotationY: 0 }
};

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
      object.rotation.y = Math.atan2(state.direction.x, -state.direction.z);
      isMoving = true;
    }
  }

  const walkBob = isMoving ? Math.abs(Math.cos(time * 0.0055 * Math.max(0.8, walkSpeed * 2.8) + phase)) * 0.01 : 0;
  object.position.y = baseY + Math.sin(time * 0.003 * floatSpeed + phase) * amount + walkBob;
  updateNpcRig(object, time, walkSpeed || floatSpeed, isMoving);
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

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.58, 0.78), bodyMaterial);
  body.position.y = 0.48;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.48, 0.72), bodyMaterial);
  cab.position.set(-0.45, 0.92, 0);
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.54), glassMaterial);
  windshield.position.set(-0.76, 0.96, 0);
  group.add(windshield);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.03), new THREE.MeshBasicMaterial({ color: "#2dd4bf" }));
  stripe.position.set(0.05, 0.57, -0.405);
  group.add(stripe);

  for (const x of [-0.46, 0.48]) {
    for (const z of [-0.43, 0.43]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 20), trimMaterial);
      wheel.position.set(x, 0.2, z);
      wheel.rotation.x = Math.PI / 2;
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  const headlightMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a" });
  for (const z of [-0.24, 0.24]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.13), headlightMaterial);
    light.position.set(-1.14, 0.52, z);
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

function addLabel(group: THREE.Group, text: string, color: string, position: THREE.Vector3, height: number): void {
  const label = createLabelSprite(text, color);
  label.position.set(position.x, height, position.z);
  group.add(label);
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

function updateCarriedCrateMount(mount: THREE.Group, crate: StockCrate | null): void {
  clearGroup(mount);
  if (!crate) {
    return;
  }

  const crateMesh = createStockCrateMesh(crate.productId, crate.quantity, true);
  crateMesh.position.set(0.42, -0.46, -0.78);
  crateMesh.rotation.set(-0.16, -0.32, 0.08);
  crateMesh.scale.setScalar(0.92);
  mount.add(crateMesh);
}

function addBuilding(scene: THREE.Scene, x: number, z: number, width: number, depth: number, height: number, style: Parameters<typeof createBuilding>[3], signText: string): void {
  const building = createBuilding(width, depth, height, style, signText);
  building.position.set(x, 0, z);
  scene.add(building);
}

function populateDynamicObjects(group: THREE.Group, currentState: GameState, guidanceLocationId?: string): Interactable[] {
  clearGroup(group);
  const interactables: Interactable[] = [];

  for (const location of Object.values(currentState.locations)) {
    const position = new THREE.Vector3(location.position.x, 0, location.position.z);
    const machinePlacement = machinePlacementForLocation(location);
    const isGuidanceTarget = guidanceLocationId === location.id;
    const addGuidanceBeacon = (color: string, beaconPosition = position) => {
      if (!isGuidanceTarget) {
        return;
      }

      const beacon = createMissionBeacon(color);
      beacon.position.copy(beaconPosition);
      group.add(beacon);
      addLabel(group, "NEXT", color, beaconPosition, 3.75);
    };

    if (location.kind === "garage") {
      const marker = addMarker("#38bdf8");
      marker.position.copy(position);
      group.add(marker);
      if (garageStorageUnits(currentState) > 0) {
        const storedProductIds = Object.entries(currentState.player.garageStorage)
          .filter(([, quantity]) => quantity > 0)
          .map(([productId]) => productId as ProductId);
        const stack = createCrateStack(storedProductIds);
        stack.position.set(position.x + 0.78, 0.02, position.z - 0.22);
        stack.rotation.y = -0.35;
        group.add(stack);
      }
      addLabel(group, location.name, "#38bdf8", position, 1.1);
      addGuidanceBeacon("#38bdf8");
      interactables.push({ target: { type: "base", id: "garage", label: location.name }, position });
      continue;
    }

    if (location.kind === "supplier") {
      const marker = addMarker("#f59e0b");
      marker.position.copy(position);
      group.add(marker);
      const supplierStack = createCrateStack(["soda", "chips", "energy", "mystery_capsules"]);
      supplierStack.position.set(position.x - 0.76, 0.02, position.z - 0.2);
      supplierStack.rotation.y = 0.45;
      group.add(supplierStack);
      addLabel(group, location.name, "#f59e0b", position, 1.1);
      addGuidanceBeacon("#f59e0b");
      interactables.push({ target: { type: "supplier", id: "supplier", label: location.name }, position });
      continue;
    }

    const machine = machineAtLocation(currentState, location.id);
    if (machine) {
      const owner = currentState.factions[machine.ownerFactionId];
      const machineGroup = createMachineMesh(owner?.color ?? "#94a3b8", machine.damage, machine.upgrades ?? []);
      machineGroup.position.copy(machinePlacement.position);
      machineGroup.rotation.y = machinePlacement.rotationY;
      group.add(machineGroup);
      const pressure = machine.ownerFactionId === currentState.playerFactionId ? machineRoutePressure(currentState, machine) : undefined;
      if (pressure && pressure.score >= 2) {
        const pressureRing = createRoutePressureRing(pressure.tone);
        pressureRing.position.set(machinePlacement.position.x, 2.02, machinePlacement.position.z);
        group.add(pressureRing);
      }
      addLabel(group, machine.name, owner?.color ?? "#94a3b8", machinePlacement.position, 2.2);
      addGuidanceBeacon(owner?.color ?? "#94a3b8", machinePlacement.position);
      interactables.push({ target: { type: "machine", id: machine.id, label: machine.name }, position: machinePlacement.position });
    } else {
      const marker = addMarker("#a3e635");
      marker.position.copy(machinePlacement.position);
      group.add(marker);
      addLabel(group, location.name, "#a3e635", machinePlacement.position, 1.1);
      addGuidanceBeacon("#a3e635", machinePlacement.position);
      interactables.push({ target: { type: "placement", id: location.id, label: location.name }, position: machinePlacement.position });
    }
  }

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

export function ThreeScene({ guidanceLocationId, state, onPlayerPositionChange, onPlayerHeadingChange, onTargetChange }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const carriedCrateMountRef = useRef<THREE.Group | null>(null);
  const carriedCrateSignatureRef = useRef<string | null>(null);
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a");
    scene.fog = new THREE.Fog("#18243a", 20, 48);

    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 80);
    camera.position.set(0, 1.65, 0);
    camera.rotation.order = "YXZ";

    const yaw = new THREE.Object3D();
    yaw.position.set(-8, 0, 1.4);
    yaw.add(camera);
    scene.add(yaw);

    const carriedCrateMount = new THREE.Group();
    camera.add(carriedCrateMount);
    carriedCrateMountRef.current = carriedCrateMount;
    updateCarriedCrateMount(carriedCrateMount, stateRef.current.player.carriedCrate ?? null);
    carriedCrateSignatureRef.current = stateRef.current.player.carriedCrate
      ? `${stateRef.current.player.carriedCrate.productId}:${stateRef.current.player.carriedCrate.quantity}:${stateRef.current.player.carriedCrate.source}`
      : null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(createSkyDome());
    const atmosphere = createAtmosphere();
    scene.add(atmosphere);

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
    const streetProps = createStreetProps();
    const animatedProps: THREE.Object3D[] = [];
    streetProps.traverse((object) => {
      if (object.userData.floatSpeed) {
        animatedProps.push(object);
      }
    });
    scene.add(streetProps);

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

      interactablesRef.current = populateDynamicObjects(dynamicGroupRef.current, stateRef.current, guidanceLocationIdRef.current);
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
        if (distance > 3.4) {
          continue;
        }

        const alignment = forward.dot(toTarget.normalize());
        if (distance > 2.2 && alignment < 0.55) {
          continue;
        }

        if (distance > 1.4 && alignment < 0.18) {
          continue;
        }

        const score = distance - alignment * 1.4;
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
        onPlayerHeadingChangeRef.current(THREE.MathUtils.radToDeg(-yaw.rotation.y));
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
      });
      for (const object of animatedProps) {
        updateAnimatedStreetProp(object, time);
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
      carriedCrateMountRef.current = null;
      carriedCrateSignatureRef.current = null;
      interactablesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) {
      return;
    }

    interactablesRef.current = populateDynamicObjects(dynamicGroup, state, guidanceLocationId);
  }, [guidanceLocationId, state]);

  useEffect(() => {
    const mount = carriedCrateMountRef.current;
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
  }, [state.player.carriedCrate]);

  return <div className="scene-mount" ref={mountRef} aria-label="3D district view" />;
}
