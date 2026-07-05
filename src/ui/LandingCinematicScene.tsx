import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MachineModelId, MachineUpgradeId, ProductId } from "../game/core/types";
import { modelTransformFor, type ModelConfig } from "../game/content/modelConfig";
import type { GraphicsQuality } from "../render/three/graphicsQuality";
import { createNpcCharacter } from "../render/three/proceduralArt";

interface LandingCinematicSceneProps {
  modelConfig: ModelConfig;
}

function createNeonSignTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "#050816";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = color;
    context.lineWidth = 8;
    context.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    context.fillStyle = "#f8fafc";
    context.shadowColor = color;
    context.shadowBlur = 28;
    context.font = "900 58px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const previewProductColors: Record<ProductId, string> = {
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

function applyPreviewModelTransformById(object: THREE.Object3D, modelConfig: ModelConfig, modelId: string): void {
  const transform = modelTransformFor(modelConfig, modelId);
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
}

function addPreviewDetail(group: THREE.Group, object: THREE.Object3D): void {
  object.userData.landingPreviewDetail = true;
  group.add(object);
}

function createPreviewMachineMesh(
  color: string,
  damage: number,
  installedUpgrades: MachineUpgradeId[] = [],
  quality: GraphicsQuality = "medium",
  stockRatio = 1,
  productIds: ProductId[] = [],
  machineModelId: MachineModelId = "basic_snack"
): THREE.Group {
  const group = new THREE.Group();
  const upgrades = new Set(installedUpgrades);
  group.userData.machineModelId = machineModelId;

  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.12 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.48, metalness: 0.18 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color });
  const damaged = damage > 55;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.58, 0.5), bodyMaterial);
  body.position.y = 0.92;
  body.castShadow = true;
  group.add(body);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.62), darkMaterial);
  base.position.y = 0.07;
  group.add(base);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.18, 0.035),
    new THREE.MeshBasicMaterial({ map: createNeonSignTexture(machineModelId === "armored_unit" ? "ARMOR" : "VEND-X", damaged ? "#fb7185" : color) })
  );
  sign.position.set(0, 1.62, -0.27);
  group.add(sign);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.43, 0.78, 0.032),
    new THREE.MeshPhysicalMaterial({
      color: damaged ? "#7f1d1d" : "#bae6fd",
      emissive: damaged ? "#3f1010" : "#0891b2",
      emissiveIntensity: damaged ? 0.18 : 0.34,
      roughness: 0.08,
      transparent: true,
      opacity: 0.68
    })
  );
  glass.position.set(-0.09, 1.08, -0.286);
  group.add(glass);

  const visibleProducts = Math.ceil(THREE.MathUtils.clamp(stockRatio, 0, 1) * 9);
  for (let row = 0; row < 3; row += 1) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.03), darkMaterial);
    shelf.position.set(-0.09, 0.83 + row * 0.23, -0.315);
    group.add(shelf);
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      const filled = index < visibleProducts;
      const productId = productIds[index % Math.max(1, productIds.length)] ?? "energy";
      const product = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.12, 0.04),
        new THREE.MeshStandardMaterial({
          color: filled ? previewProductColors[productId] : "#172033",
          roughness: 0.44,
          transparent: !filled,
          opacity: filled ? 1 : 0.24
        })
      );
      product.position.set(-0.25 + col * 0.16, 0.91 + row * 0.23, -0.34);
      group.add(product);
    }
  }

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.035), darkMaterial);
  panel.position.set(0.26, 1.06, -0.305);
  group.add(panel);

  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.1, 0.02),
    new THREE.MeshBasicMaterial({ color: damaged ? "#fb7185" : "#5eead4" })
  );
  display.position.set(0.26, 1.28, -0.328);
  group.add(display);

  if (upgrades.has("neon_sign")) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.014, 8, 48), glowMaterial);
    halo.position.set(0, 1.71, -0.31);
    halo.scale.y = 0.22;
    addPreviewDetail(group, halo);
  }

  if (upgrades.has("security_camera")) {
    const camera = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), darkMaterial);
    camera.position.set(0.3, 1.9, -0.1);
    addPreviewDetail(group, camera);
  }

  if (machineModelId === "armored_unit") {
    for (const x of [-0.42, 0.42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.28, 0.08), new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.46, metalness: 0.42 }));
      rail.position.set(x, 0.96, -0.32);
      addPreviewDetail(group, rail);
    }
  }

  if (quality === "high") {
    const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.26, 0.024), glowMaterial);
    sideStripe.position.set(-0.35, 0.98, -0.315);
    addPreviewDetail(group, sideStripe);
  }

  if (damage > 15) {
    const dent = new THREE.Mesh(new THREE.BoxGeometry(0.18 + damage / 340, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: "#fbbf24" }));
    dent.position.set(0.14, 1.43, -0.33);
    dent.rotation.z = -0.4;
    group.add(dent);
  }

  return group;
}

function createPreviewStockCrateMesh(productId: ProductId, quantity: number, compact = false, modelConfig?: ModelConfig): THREE.Group {
  const color = previewProductColors[productId] ?? "#94a3b8";
  const group = new THREE.Group();
  const width = compact ? 0.34 : 0.58;
  const height = compact ? 0.24 : 0.36;
  const depth = compact ? 0.28 : 0.42;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  crate.castShadow = true;
  group.add(crate);

  const strapMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.5 });
  group.add(new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.04, depth + 0.02), strapMaterial));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, height + 0.02, depth + 0.03), strapMaterial));

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.56, height * 0.38),
    new THREE.MeshBasicMaterial({ color: "#f8fafc", side: THREE.DoubleSide })
  );
  label.position.set(width * 0.12, height * 0.06, -depth / 2 - 0.012);
  group.add(label);

  const ticks = Math.max(1, Math.min(4, Math.ceil(quantity / 4)));
  for (let index = 0; index < ticks; index += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 0.008), new THREE.MeshBasicMaterial({ color }));
    tick.position.set(-0.1 + index * 0.06, height * 0.08, -depth / 2 - 0.018);
    group.add(tick);
  }

  if (modelConfig) {
    applyPreviewModelTransformById(group, modelConfig, "stock.crate");
  }

  return group;
}

function createPreviewVehicleMesh(quality: GraphicsQuality = "medium"): THREE.Group {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: "#d9f99d", roughness: 0.3, metalness: 0.16, clearcoat: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.42, metalness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#93c5fd", roughness: 0.04, transparent: true, opacity: 0.58 });
  const length = 2.9;
  const width = 1.16;
  const baseY = 0.38;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.92, width), paint);
  body.position.set(0.28, baseY + 0.52, 0);
  body.castShadow = true;
  group.add(body);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.74, width * 0.86), paint);
  cab.position.set(-0.78, baseY + 0.45, 0);
  cab.castShadow = true;
  group.add(cab);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, width * 0.78), paint);
  hood.position.set(-1.28, baseY + 0.28, 0);
  group.add(hood);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.42, width * 0.54), glass);
  windshield.position.set(-1.08, baseY + 0.64, 0);
  windshield.rotation.z = -0.18;
  group.add(windshield);

  for (const z of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.09, 0.035), new THREE.MeshBasicMaterial({ color: "#2dd4bf" }));
    stripe.position.set(-0.05, baseY + 0.42, z * (width / 2 + 0.03));
    group.add(stripe);

    if (quality !== "low") {
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.03), glass);
      sideGlass.position.set(-0.78, baseY + 0.72, z * (width / 2 + 0.025));
      group.add(sideGlass);
    }
  }

  for (const x of [-1.0, 0.84]) {
    for (const z of [-width / 2 - 0.04, width / 2 + 0.04]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.15, quality === "low" ? 12 : 20), trim);
      wheel.position.set(x, 0.22, z);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    }
  }

  const frontLight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.42), new THREE.MeshBasicMaterial({ color: "#fef3c7" }));
  frontLight.position.set(-length / 2, baseY + 0.28, 0);
  group.add(frontLight);

  return group;
}

function addBackdrop(scene: THREE.Scene, quality: GraphicsQuality): void {
  const buildingMaterials = ["#111827", "#263238", "#4c1d95", "#14532d", "#7f1d1d"].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04 })
  );

  for (let index = 0; index < 9; index += 1) {
    const width = 1.25 + (index % 3) * 0.46;
    const height = 2.8 + ((index * 7) % 5) * 0.48;
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.5),
      buildingMaterials[index % buildingMaterials.length]
    );
    building.position.set(-5.4 + index * 1.32, height / 2 - 0.05, -3.2 - (index % 2) * 0.34);
    building.receiveShadow = true;
    scene.add(building);

    const windowMaterial = new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? "#fef08a" : "#67e8f9", transparent: true, opacity: 0.74 });
    for (let row = 0; row < Math.min(5, Math.floor(height)); row += 1) {
      for (let col = 0; col < 2; col += 1) {
        if ((row + col + index) % 3 === 0) {
          continue;
        }
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.018), windowMaterial);
        light.position.set(building.position.x - width * 0.22 + col * width * 0.42, 0.62 + row * 0.46, building.position.z + 0.26);
        scene.add(light);
      }
    }
  }

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.74, 0.68, 0.035),
    new THREE.MeshBasicMaterial({ map: createNeonSignTexture("SNACK BEEF", "#fbbf24") })
  );
  sign.position.set(-3.38, 2.08, -2.84);
  scene.add(sign);

  if (quality !== "low") {
    const hazeMaterial = new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.08, depthWrite: false });
    const haze = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 2.2, 7, 32, 1, true), hazeMaterial);
    haze.position.set(-1.2, 2.8, -1.8);
    haze.rotation.z = -0.7;
    scene.add(haze);
  }
}

export function LandingCinematicScene({ modelConfig }: LandingCinematicSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    const quality: GraphicsQuality = window.matchMedia("(max-width: 760px)").matches ? "medium" : "high";
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#18081f", 7, 15);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    camera.position.set(4.8, 2.85, 6.4);
    camera.lookAt(0.1, 1.08, -0.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.append(renderer.domElement);

    const ambient = new THREE.HemisphereLight("#bae6fd", "#20112f", 1.4);
    scene.add(ambient);

    const key = new THREE.DirectionalLight("#fef3c7", 2.4);
    key.position.set(3.8, 6.5, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    const neonLeft = new THREE.PointLight("#34d399", 4.2, 8);
    neonLeft.position.set(-2.4, 1.45, 0.7);
    scene.add(neonLeft);

    const dangerLight = new THREE.PointLight("#fb7185", 3.35, 7);
    dangerLight.position.set(2.2, 1.2, 0.1);
    scene.add(dangerLight);

    const hotSignLight = new THREE.PointLight("#fbbf24", 2.8, 7);
    hotSignLight.position.set(-3.6, 2.2, -1.7);
    scene.add(hotSignLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 8),
      new THREE.MeshStandardMaterial({ color: "#151923", roughness: 0.88, metalness: 0.03 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.012, 0.06),
      new THREE.MeshBasicMaterial({ color: "#fef3c7", transparent: true, opacity: 0.62 })
    );
    lane.position.set(0.8, 0.018, 1.18);
    lane.rotation.y = -0.08;
    scene.add(lane);

    addBackdrop(scene, quality);

    const setShadow = (object: THREE.Object3D) => {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    };

    const heroMachine = createPreviewMachineMesh("#10b981", 2, ["smart_lock", "security_camera", "neon_sign"], quality, 0.95, ["energy", "luxury_snack", "glitch_gum"], "smart_vendor");
    heroMachine.position.set(-1.15, 0, 0.35);
    heroMachine.rotation.y = -0.28;
    heroMachine.scale.setScalar(1.34);
    applyPreviewModelTransformById(heroMachine, modelConfig, "machine.vending");
    setShadow(heroMachine);
    scene.add(heroMachine);

    const rivalMachine = createPreviewMachineMesh("#fb7185", 63, ["reinforced_glass"], "medium", 0.36, ["mystery_capsules", "mood_fizz"], "armored_unit");
    rivalMachine.position.set(1.2, 0, -1.1);
    rivalMachine.rotation.y = 0.18;
    rivalMachine.scale.setScalar(0.86);
    applyPreviewModelTransformById(rivalMachine, modelConfig, "machine.vending");
    setShadow(rivalMachine);
    scene.add(rivalMachine);

    const van = createPreviewVehicleMesh(quality);
    van.position.set(2.25, 0, 0.88);
    van.rotation.y = -0.82;
    van.scale.setScalar(0.58);
    applyPreviewModelTransformById(van, modelConfig, "vehicle.route_van");
    setShadow(van);
    scene.add(van);

    const productIds: ProductId[] = ["energy", "glitch_gum", "luxury_snack", "mystery_capsules"];
    productIds.forEach((productId, index) => {
      const crate = createPreviewStockCrateMesh(productId, 8, false, modelConfig);
      crate.position.set(-2.55 + index * 0.42, 0.22 + (index % 2) * 0.14, 1.12 + (index % 2) * 0.16);
      crate.rotation.y = -0.3 + index * 0.18;
      crate.scale.setScalar(0.78);
      setShadow(crate);
      scene.add(crate);
    });

    const worker = createNpcCharacter("worker", quality);
    worker.position.set(-2.25, 0, 0.08);
    worker.rotation.y = 0.58;
    worker.scale.setScalar(0.9);
    applyPreviewModelTransformById(worker, modelConfig, "unit.worker");
    setShadow(worker);
    scene.add(worker);

    const rival = createNpcCharacter("rival", quality);
    rival.position.set(0.65, 0, -0.55);
    rival.rotation.y = -0.4;
    rival.scale.setScalar(0.86);
    applyPreviewModelTransformById(rival, modelConfig, "unit.rival");
    setShadow(rival);
    scene.add(rival);

    const alarm = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.024, 10, 54),
      new THREE.MeshBasicMaterial({ color: "#fb7185", transparent: true, opacity: 0.78 })
    );
    alarm.position.set(1.2, 0.03, -1.1);
    alarm.rotation.x = Math.PI / 2;
    scene.add(alarm);

    const coins = Array.from({ length: 18 }, (_, index) => {
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055 + (index % 3) * 0.012, 0.055 + (index % 3) * 0.012, 0.012, 24),
        new THREE.MeshBasicMaterial({ color: index % 4 === 0 ? "#fef3c7" : "#facc15", transparent: true, opacity: 0.9 })
      );
      coin.position.set(-2.65 + Math.random() * 5.2, 0.64 + Math.random() * 2.2, -1.2 + Math.random() * 2.45);
      coin.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(coin);
      return coin;
    });

    const receipts = Array.from({ length: 10 }, (_, index) => {
      const receipt = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.24),
        new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? "#f8fafc" : "#fde68a", transparent: true, opacity: 0.72, side: THREE.DoubleSide })
      );
      receipt.position.set(-1.9 + Math.random() * 4.2, 0.7 + Math.random() * 2.5, -1.15 + Math.random() * 2.2);
      receipt.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(receipt);
      return receipt;
    });

    const sparks = Array.from({ length: 28 }, (_, index) => {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.018 + (index % 4) * 0.006, 8, 6),
        new THREE.MeshBasicMaterial({ color: index % 3 === 0 ? "#fde68a" : index % 3 === 1 ? "#2dd4bf" : "#fb7185" })
      );
      spark.position.set(-2.8 + Math.random() * 5.6, 0.45 + Math.random() * 2.7, -1.6 + Math.random() * 2.2);
      scene.add(spark);
      return spark;
    });

    let frame = 0;
    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const time = performance.now() * 0.001;
      heroMachine.rotation.y = -0.28 + Math.sin(time * 0.55) * 0.035;
      van.position.y = Math.sin(time * 1.4) * 0.015;
      alarm.scale.setScalar(1 + Math.sin(time * 3.8) * 0.08);
      alarm.material.opacity = 0.52 + Math.sin(time * 4.5) * 0.2;
      coins.forEach((coin, index) => {
        coin.rotation.y += 0.018 + (index % 4) * 0.004;
        coin.position.y += Math.sin(time * 1.9 + index) * 0.0009;
      });
      receipts.forEach((receipt, index) => {
        receipt.rotation.z += 0.004 + (index % 3) * 0.002;
        receipt.position.y += Math.sin(time * 1.35 + index * 0.7) * 0.0007;
      });
      sparks.forEach((spark, index) => {
        spark.position.y += Math.sin(time * 1.8 + index) * 0.0008;
      });
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelConfig]);

  return (
    <div className="landing-cinematic-scene" ref={mountRef} role="img" aria-label="In-game vending machine, delivery van, stock crates, and rival confrontation rendered as cinematic key art">
      <div className="landing-scene-badge top">Cabinet beef live</div>
      <div className="landing-scene-badge bottom">Stock, drive, start problems</div>
      <div className="landing-scene-sticker one" aria-hidden="true">snack beef speedrun</div>
      <div className="landing-scene-sticker two" aria-hidden="true">bad idea: profitable</div>
    </div>
  );
}
