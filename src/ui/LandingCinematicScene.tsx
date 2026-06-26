import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ProductId } from "../game/core/types";
import type { ModelConfig } from "../game/content/modelConfig";
import type { GraphicsQuality } from "../render/three/graphicsQuality";
import { applyModelTransformById, createMachineMesh, createStockCrateMesh, createVehicleMesh } from "../render/three/ThreeScene";
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

function addBackdrop(scene: THREE.Scene, quality: GraphicsQuality): void {
  const buildingMaterials = ["#111827", "#1e293b", "#312e81", "#14532d", "#581c87"].map(
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
    new THREE.BoxGeometry(2.1, 0.62, 0.035),
    new THREE.MeshBasicMaterial({ map: createNeonSignTexture("VEND-X", "#2dd4bf") })
  );
  sign.position.set(-3.6, 2.05, -2.84);
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
    scene.fog = new THREE.Fog("#130f2a", 7, 15);

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

    const neonLeft = new THREE.PointLight("#2dd4bf", 3.6, 8);
    neonLeft.position.set(-2.4, 1.45, 0.7);
    scene.add(neonLeft);

    const dangerLight = new THREE.PointLight("#fb7185", 2.8, 7);
    dangerLight.position.set(2.2, 1.2, 0.1);
    scene.add(dangerLight);

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

    const heroMachine = createMachineMesh("#14b8a6", 2, ["smart_lock", "security_camera", "neon_sign"], quality, 0.95, ["energy", "luxury_snack", "glitch_gum"]);
    heroMachine.position.set(-1.15, 0, 0.35);
    heroMachine.rotation.y = -0.28;
    heroMachine.scale.setScalar(1.34);
    applyModelTransformById(heroMachine, modelConfig, "machine.vending");
    setShadow(heroMachine);
    scene.add(heroMachine);

    const rivalMachine = createMachineMesh("#fb7185", 63, ["reinforced_glass"], "medium", 0.36, ["mystery_capsules", "mood_fizz"]);
    rivalMachine.position.set(1.2, 0, -1.1);
    rivalMachine.rotation.y = 0.18;
    rivalMachine.scale.setScalar(0.86);
    applyModelTransformById(rivalMachine, modelConfig, "machine.vending");
    setShadow(rivalMachine);
    scene.add(rivalMachine);

    const van = createVehicleMesh(quality);
    van.position.set(2.25, 0, 0.88);
    van.rotation.y = -0.82;
    van.scale.setScalar(0.58);
    applyModelTransformById(van, modelConfig, "vehicle.route_van");
    setShadow(van);
    scene.add(van);

    const productIds: ProductId[] = ["energy", "glitch_gum", "luxury_snack", "mystery_capsules"];
    productIds.forEach((productId, index) => {
      const crate = createStockCrateMesh(productId, 8, false, modelConfig);
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
    applyModelTransformById(worker, modelConfig, "unit.worker");
    setShadow(worker);
    scene.add(worker);

    const rival = createNpcCharacter("rival", quality);
    rival.position.set(0.65, 0, -0.55);
    rival.rotation.y = -0.4;
    rival.scale.setScalar(0.86);
    applyModelTransformById(rival, modelConfig, "unit.rival");
    setShadow(rival);
    scene.add(rival);

    const alarm = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.024, 10, 54),
      new THREE.MeshBasicMaterial({ color: "#fb7185", transparent: true, opacity: 0.78 })
    );
    alarm.position.set(1.2, 0.03, -1.1);
    alarm.rotation.x = Math.PI / 2;
    scene.add(alarm);

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
      <div className="landing-scene-badge top">Route alarm live</div>
      <div className="landing-scene-badge bottom">Stock, drive, fight for the corner</div>
    </div>
  );
}
