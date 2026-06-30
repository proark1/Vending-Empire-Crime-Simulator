import * as THREE from "three";
import { WORLD_SCALE } from "../../game/world/scale";
import type { GraphicsQuality } from "./graphicsQuality";

type TexturePainter = (context: CanvasRenderingContext2D, size: number) => void;

export type BuildingStyle = "garage" | "supplier" | "laundromat" | "gym" | "arcade" | "transit" | "rival";

function textureFromCanvas(size: number, painter: TexturePainter, repeat = 1): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (context) {
    painter(context, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

function jitter(context: CanvasRenderingContext2D, size: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i += 1) {
    const shade = 90 + Math.random() * 95;
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
    context.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

export function createAsphaltMaterial(quality: GraphicsQuality = "medium"): THREE.MeshStandardMaterial {
  const size = quality === "low" ? 128 : quality === "high" ? 512 : 256;
  const map = textureFromCanvas(
    size,
    (context, size) => {
      context.fillStyle = "#202936";
      context.fillRect(0, 0, size, size);
      jitter(context, size, quality === "low" ? 420 : quality === "high" ? 2600 : 1500, quality === "low" ? 0.1 : 0.16);
      context.strokeStyle = "rgba(226, 232, 240, 0.18)";
      context.lineWidth = 2;
      for (let x = 20; x < size; x += 64) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + 20, size);
        context.stroke();
      }
    },
    quality === "low" ? 4 : quality === "high" ? 10 : 8
  );

  const bumpMap = quality === "low"
    ? undefined
    : textureFromCanvas(
      size,
      (context, size) => {
        context.fillStyle = "#777";
        context.fillRect(0, 0, size, size);
        jitter(context, size, quality === "high" ? 2200 : 1200, 0.36);
        context.strokeStyle = "rgba(25, 25, 25, 0.48)";
        context.lineWidth = 2;
        for (let x = 24; x < size; x += 84) {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x + 18, size);
          context.stroke();
        }
      },
      quality === "high" ? 10 : 8
    );

  return new THREE.MeshStandardMaterial({ map, ...(bumpMap ? { bumpMap, bumpScale: 0.028 } : {}), color: "#2f3a47", roughness: 0.92, metalness: 0.02 });
}

export function createRoadMaterial(quality: GraphicsQuality = "medium"): THREE.MeshStandardMaterial {
  const size = quality === "low" ? 128 : quality === "high" ? 512 : 256;
  const map = textureFromCanvas(
    size,
    (context, size) => {
      context.fillStyle = "#171d27";
      context.fillRect(0, 0, size, size);
      jitter(context, size, quality === "low" ? 520 : quality === "high" ? 3200 : 1900, quality === "low" ? 0.12 : 0.19);
      context.fillStyle = "rgba(248, 250, 252, 0.18)";
      for (let y = 120; y < size; y += 128) {
        for (let x = 18; x < size; x += 72) {
          context.fillRect(x, y, 36, 4);
        }
      }
    },
    quality === "low" ? 3 : quality === "high" ? 8 : 6
  );

  const bumpMap = quality === "low"
    ? undefined
    : textureFromCanvas(
      size,
      (context, size) => {
        context.fillStyle = "#666";
        context.fillRect(0, 0, size, size);
        jitter(context, size, quality === "high" ? 2600 : 1500, 0.4);
        context.strokeStyle = "rgba(10, 10, 10, 0.5)";
        context.lineWidth = 2;
        for (let y = 0; y < size; y += 96) {
          context.beginPath();
          context.moveTo(0, y + Math.random() * 12);
          context.lineTo(size, y + 4 + Math.random() * 12);
          context.stroke();
        }
      },
      quality === "high" ? 8 : 6
    );

  return new THREE.MeshStandardMaterial({ map, ...(bumpMap ? { bumpMap, bumpScale: 0.024 } : {}), color: "#222a35", roughness: 0.96 });
}

export function createSidewalkMaterial(quality: GraphicsQuality = "medium"): THREE.MeshStandardMaterial {
  const size = quality === "low" ? 128 : quality === "high" ? 512 : 256;
  const map = textureFromCanvas(
    size,
    (context, size) => {
      context.fillStyle = "#596476";
      context.fillRect(0, 0, size, size);
      context.strokeStyle = "rgba(15, 23, 42, 0.22)";
      context.lineWidth = 3;
      for (let x = 0; x <= size; x += 64) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, size);
        context.stroke();
      }
      for (let y = 0; y <= size; y += 64) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(size, y);
        context.stroke();
      }
      jitter(context, size, quality === "low" ? 220 : quality === "high" ? 1400 : 800, quality === "low" ? 0.08 : 0.12);
    },
    quality === "low" ? 3 : quality === "high" ? 7 : 5
  );

  const bumpMap = quality === "low"
    ? undefined
    : textureFromCanvas(
      size,
      (context, size) => {
        context.fillStyle = "#868686";
        context.fillRect(0, 0, size, size);
        context.strokeStyle = "#363636";
        context.lineWidth = 3;
        for (let x = 0; x <= size; x += 64) {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, size);
          context.stroke();
        }
        for (let y = 0; y <= size; y += 64) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(size, y);
          context.stroke();
        }
        jitter(context, size, quality === "high" ? 1200 : 700, 0.28);
      },
      quality === "high" ? 7 : 5
    );

  return new THREE.MeshStandardMaterial({ map, ...(bumpMap ? { bumpMap, bumpScale: 0.018 } : {}), color: "#8a94a5", roughness: 0.88 });
}

export function createGrassMaterial(quality: GraphicsQuality = "medium"): THREE.MeshStandardMaterial {
  const size = quality === "low" ? 128 : quality === "high" ? 512 : 256;
  const map = textureFromCanvas(
    size,
    (context, size) => {
      const base = context.createLinearGradient(0, 0, size, size);
      base.addColorStop(0, "#33632f");
      base.addColorStop(1, "#274f29");
      context.fillStyle = base;
      context.fillRect(0, 0, size, size);
      const blades = quality === "low" ? 700 : quality === "high" ? 4200 : 2200;
      for (let i = 0; i < blades; i += 1) {
        const g = 70 + Math.random() * 95;
        context.fillStyle = `rgba(${Math.round(g * 0.42)}, ${Math.round(g)}, ${Math.round(g * 0.46)}, ${0.1 + Math.random() * 0.18})`;
        context.fillRect(Math.random() * size, Math.random() * size, 1, 2 + Math.random() * 3);
      }
      // soft mowing stripes for a manicured-lawn read
      for (let x = 0; x < size; x += 28) {
        context.fillStyle = (x / 28) % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(2,12,2,0.05)";
        context.fillRect(x, 0, 14, size);
      }
    },
    quality === "low" ? 4 : quality === "high" ? 12 : 8
  );

  return new THREE.MeshStandardMaterial({ map, color: "#3c6f3a", roughness: 0.97, metalness: 0 });
}

export function createParkPathMaterial(quality: GraphicsQuality = "medium"): THREE.MeshStandardMaterial {
  const size = quality === "low" ? 128 : quality === "high" ? 384 : 256;
  const map = textureFromCanvas(
    size,
    (context, size) => {
      context.fillStyle = "#c2ad80";
      context.fillRect(0, 0, size, size);
      const specks = quality === "low" ? 400 : quality === "high" ? 2200 : 1200;
      for (let i = 0; i < specks; i += 1) {
        const tone = Math.random() < 0.5 ? 150 + Math.random() * 50 : 90 + Math.random() * 40;
        context.fillStyle = `rgba(${tone}, ${Math.round(tone * 0.9)}, ${Math.round(tone * 0.62)}, ${0.16 + Math.random() * 0.22})`;
        context.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    },
    quality === "low" ? 2 : 4
  );

  return new THREE.MeshStandardMaterial({ map, color: "#c4ac7d", roughness: 0.95, metalness: 0 });
}

export function createPondMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: "#2f7da0", roughness: 0.16, metalness: 0.3, transparent: true, opacity: 0.92 });
}

function parkRandom(seed: number): () => number {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) {
    s += 2147483646;
  }
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function markModelPolishDetail<T extends THREE.Object3D>(object: T, detail: string): T {
  object.userData.modelPolishDetail = detail;
  return object;
}

function addModelPolishDetail<T extends THREE.Object3D>(group: THREE.Group, object: T, detail: string): T {
  markModelPolishDetail(object, detail);
  group.add(object);
  return object;
}

export function createTree(quality: GraphicsQuality = "medium", seed = 1): THREE.Group {
  const rng = parkRandom(seed * 911 + 13);
  const group = new THREE.Group();
  const segs = quality === "low" ? 5 : quality === "high" ? 8 : 6;
  const trunkHeight = 1.25 + rng() * 1.0;
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#5b3b22", roughness: 0.92, metalness: 0.02 });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.18, trunkHeight, segs),
    trunkMaterial
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  addModelPolishDetail(group, trunk, "tree-tapered-trunk");

  for (let rootIndex = 0; rootIndex < 4; rootIndex += 1) {
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.42, 6), trunkMaterial);
    root.position.set(Math.cos(rootIndex * Math.PI / 2) * 0.15, 0.09, Math.sin(rootIndex * Math.PI / 2) * 0.15);
    root.rotation.z = Math.PI / 2;
    root.rotation.y = rootIndex * Math.PI / 2;
    root.castShadow = true;
    addModelPolishDetail(group, root, "tree-root-flare");
  }

  if (quality !== "low") {
    for (let ridgeIndex = 0; ridgeIndex < 5; ridgeIndex += 1) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, trunkHeight * 0.72, 0.012), new THREE.MeshBasicMaterial({ color: "#3f2717", transparent: true, opacity: 0.62 }));
      const angle = ridgeIndex * ((Math.PI * 2) / 5);
      ridge.position.set(Math.cos(angle) * 0.12, trunkHeight * 0.48, Math.sin(angle) * 0.12);
      ridge.rotation.y = -angle;
      addModelPolishDetail(group, ridge, "tree-bark-ridge");
    }
  }

  const greens = ["#2f6b34", "#387a3c", "#356b39", "#43824a", "#2c5f31"];
  const blobCount = quality === "low" ? 1 : 2 + Math.floor(rng() * 2);
  const baseRadius = 0.95 + rng() * 0.5;
  const detail = quality === "low" ? 0 : 1;
  for (let i = 0; i < blobCount; i += 1) {
    const radius = baseRadius * (1 - i * 0.17);
    const foliage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, detail),
      new THREE.MeshStandardMaterial({ color: greens[Math.floor(rng() * greens.length)], roughness: 0.86, metalness: 0, flatShading: true })
    );
    foliage.position.set((rng() - 0.5) * 0.55, trunkHeight + radius * 0.5 + i * baseRadius * 0.48, (rng() - 0.5) * 0.55);
    foliage.castShadow = true;
    group.add(foliage);
  }

  if (quality !== "low") {
    const branchMaterial = new THREE.MeshStandardMaterial({ color: "#4a2f1c", roughness: 0.88, metalness: 0.02 });
    for (let branchIndex = 0; branchIndex < 3; branchIndex += 1) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.7, 7), branchMaterial);
      const angle = branchIndex * ((Math.PI * 2) / 3) + rng() * 0.35;
      branch.position.set(Math.cos(angle) * 0.22, trunkHeight * (0.62 + branchIndex * 0.08), Math.sin(angle) * 0.22);
      branch.rotation.z = Math.PI / 2.8;
      branch.rotation.y = -angle;
      branch.castShadow = true;
      addModelPolishDetail(group, branch, "tree-visible-branch");
    }
  }

  group.scale.setScalar(0.82 + rng() * 0.5);
  group.rotation.y = rng() * Math.PI * 2;
  return group;
}

export function createBush(quality: GraphicsQuality = "medium", seed = 1): THREE.Group {
  const rng = parkRandom(seed * 547 + 29);
  const group = new THREE.Group();
  const greens = ["#3a7a3e", "#2f6b34", "#46894b"];
  const blobs = quality === "low" ? 1 : 2 + Math.floor(rng() * 2);
  for (let i = 0; i < blobs; i += 1) {
    const radius = 0.32 + rng() * 0.26;
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, quality === "low" ? 0 : 1),
      new THREE.MeshStandardMaterial({ color: greens[Math.floor(rng() * greens.length)], roughness: 0.9, metalness: 0, flatShading: true })
    );
    blob.position.set((rng() - 0.5) * 0.6, radius * 0.7, (rng() - 0.5) * 0.6);
    blob.castShadow = true;
    group.add(blob);
  }
  if (quality !== "low") {
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: "#bbf7d0", transparent: true, opacity: 0.76 });
    for (let leafIndex = 0; leafIndex < 5; leafIndex += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 5), highlightMaterial);
      leaf.position.set((rng() - 0.5) * 0.55, 0.42 + rng() * 0.18, (rng() - 0.5) * 0.55);
      leaf.rotation.set(rng() * 0.5, rng() * Math.PI * 2, -0.35 + rng() * 0.7);
      addModelPolishDetail(group, leaf, "bush-highlight-leaf");
    }
  }
  group.rotation.y = rng() * Math.PI * 2;
  return group;
}

export function createParkBench(): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#6f4a2c", roughness: 0.78, metalness: 0.05 });
  const frame = new THREE.MeshStandardMaterial({ color: "#2b3340", roughness: 0.5, metalness: 0.45 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.5), wood);
  seat.position.y = 0.45;
  seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.07), wood);
  back.position.set(0, 0.7, -0.21);
  back.castShadow = true;
  group.add(back);
  for (let index = 0; index < 4; index += 1) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.028, 0.045), wood);
    slat.position.set(0, 0.505, -0.18 + index * 0.12);
    slat.castShadow = true;
    addModelPolishDetail(group, slat, "bench-seat-slat");
  }
  for (const side of [-1, 1]) {
    const armRest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.62), frame);
    armRest.position.set(side * 0.82, 0.62, 0);
    armRest.castShadow = true;
    addModelPolishDetail(group, armRest, "bench-metal-armrest");
  }
  for (const side of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.45, 0.46), frame);
    leg.position.set(side, 0.225, 0);
    group.add(leg);
    for (const z of [-0.16, 0.16]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10), new THREE.MeshBasicMaterial({ color: "#e2e8f0" }));
      bolt.position.set(side, 0.47, z);
      bolt.rotation.x = Math.PI / 2;
      addModelPolishDetail(group, bolt, "bench-bolt-head");
    }
  }
  return group;
}

export function createParkLamp(enableLight = false): THREE.Group {
  const group = new THREE.Group();
  const height = 2.6;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, height, 8),
    new THREE.MeshStandardMaterial({ color: "#1f2733", roughness: 0.5, metalness: 0.6 })
  );
  pole.position.y = height / 2;
  pole.castShadow = true;
  group.add(pole);
  const glassMat = new THREE.MeshBasicMaterial({ color: "#ffe7ad" });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glassMat);
  head.position.y = height + 0.06;
  addModelPolishDetail(group, head, "lamp-glass-globe");
  for (let barIndex = 0; barIndex < 4; barIndex += 1) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.46, 6), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.44, metalness: 0.5 }));
    const angle = barIndex * (Math.PI / 2);
    bar.position.set(Math.cos(angle) * 0.18, height + 0.06, Math.sin(angle) * 0.18);
    bar.castShadow = true;
    addModelPolishDetail(group, bar, "lamp-cage-bar");
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.44, metalness: 0.5 }));
  ring.position.y = height + 0.06;
  ring.rotation.x = Math.PI / 2;
  addModelPolishDetail(group, ring, "lamp-protective-ring");
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: "#141a24", roughness: 0.5, metalness: 0.6 })
  );
  cap.position.y = height + 0.26;
  group.add(cap);
  if (enableLight) {
    const light = new THREE.PointLight("#ffdf9e", 0.9, 11, 2);
    light.position.y = height + 0.05;
    group.add(light);
  }
  return group;
}

function createWallMaterial(base: string, mortar: string, quality: GraphicsQuality): THREE.MeshStandardMaterial {
  const size = quality === "low" ? 128 : quality === "high" ? 512 : 256;
  const map = textureFromCanvas(
    size,
    (context, size) => {
      context.fillStyle = base;
      context.fillRect(0, 0, size, size);
      const wash = context.createLinearGradient(0, 0, size, size);
      wash.addColorStop(0, "rgba(255,255,255,0.08)");
      wash.addColorStop(0.55, "rgba(15,23,42,0.05)");
      wash.addColorStop(1, "rgba(2,6,23,0.16)");
      context.fillStyle = wash;
      context.fillRect(0, 0, size, size);
      context.strokeStyle = mortar;
      context.lineWidth = 3;
      const brickHeight = 32;
      const brickWidth = 74;
      for (let y = 0; y <= size; y += brickHeight) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(size, y);
        context.stroke();
        const offset = (y / brickHeight) % 2 === 0 ? 0 : brickWidth / 2;
        for (let x = -offset; x <= size; x += brickWidth) {
          const shade = 210 + Math.random() * 35;
          context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.035)`;
          context.fillRect(x + 4, y + 4, brickWidth - 9, brickHeight - 9);
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x, y + brickHeight);
          context.stroke();
        }
      }
      context.strokeStyle = "rgba(15, 23, 42, 0.22)";
      context.lineWidth = 1.2;
      for (let i = 0; i < 18; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 12 + Math.random() * 30, y + Math.random() * 9 - 4);
        context.stroke();
      }
      jitter(context, size, quality === "low" ? 160 : quality === "high" ? 960 : 550, quality === "low" ? 0.08 : 0.12);
    },
    2
  );

  const bumpMap = quality === "low"
    ? undefined
    : textureFromCanvas(
      size,
      (context, size) => {
        context.fillStyle = "#8f8f8f";
        context.fillRect(0, 0, size, size);
        context.strokeStyle = "#303030";
        context.lineWidth = 4;
        const brickHeight = 32;
        const brickWidth = 74;
        for (let y = 0; y <= size; y += brickHeight) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(size, y);
          context.stroke();
          const offset = (y / brickHeight) % 2 === 0 ? 0 : brickWidth / 2;
          for (let x = -offset; x <= size; x += brickWidth) {
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x, y + brickHeight);
            context.stroke();
          }
        }
        jitter(context, size, quality === "high" ? 720 : 420, 0.22);
      },
      2
    );

  return new THREE.MeshStandardMaterial({
    map,
    ...(bumpMap ? { bumpMap, bumpScale: 0.035 } : {}),
    color: "#ffffff",
    roughness: 0.9,
    metalness: 0.02
  });
}

function createSignTexture(text: string, background: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const wash = context.createLinearGradient(0, 0, canvas.width, 0);
    wash.addColorStop(0, "rgba(255,255,255,0.05)");
    wash.addColorStop(0.5, "rgba(255,255,255,0.16)");
    wash.addColorStop(1, "rgba(255,255,255,0.04)");
    context.fillStyle = wash;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = accent;
    context.lineWidth = 8;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.strokeStyle = "rgba(248, 250, 252, 0.16)";
    context.lineWidth = 2;
    for (let y = 32; y < canvas.height - 20; y += 26) {
      context.beginPath();
      context.moveTo(28, y);
      context.lineTo(canvas.width - 28, y);
      context.stroke();
    }
    context.shadowColor = accent;
    context.shadowBlur = 14;
    context.fillStyle = "#f8fafc";
    context.font = "800 42px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2, 450);
    context.shadowBlur = 0;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addPlane(group: THREE.Group, width: number, height: number, material: THREE.Material, position: THREE.Vector3, rotationY: number): THREE.Mesh {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  plane.position.copy(position);
  plane.rotation.y = rotationY;
  group.add(plane);
  return plane;
}

// Soft elliptical "blob" shadow that grounds objects even when real shadow maps
// are disabled (Low/Medium quality). Lies flat in the XZ plane.
export function createContactShadow(spanX: number, spanZ: number, opacity = 0.46): THREE.Mesh {
  const texture = textureFromCanvas(128, (context, size) => {
    context.clearRect(0, 0, size, size);
    const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.92)");
    gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.4)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(spanX, spanZ),
    new THREE.MeshBasicMaterial({
      map: texture,
      color: "#000000",
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  // Ride just clear of the road (top ~0.043) / ground surfaces; the soft gradient
  // makes the small float imperceptible while staying visible on either surface.
  mesh.position.y = 0.05;
  mesh.renderOrder = 2;
  return mesh;
}

function windowLitColor(style: BuildingStyle): string {
  return style === "arcade"
    ? "#f5d0fe"
    : style === "transit"
      ? "#bae6fd"
      : style === "rival"
        ? "#fecaca"
        : "#d1fae5";
}

let cachedWindowGlowTexture: THREE.CanvasTexture | null = null;
function windowGlowTexture(): THREE.CanvasTexture {
  if (cachedWindowGlowTexture) {
    return cachedWindowGlowTexture;
  }
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const glow = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, "rgba(255, 255, 255, 1)");
    glow.addColorStop(0.45, "rgba(255, 255, 255, 0.4)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedWindowGlowTexture = texture;
  return texture;
}

function litWindowMaterial(style: BuildingStyle, lit: boolean): THREE.MeshStandardMaterial {
  const color = windowLitColor(style);
  const emissive = style === "arcade"
    ? "#a21caf"
    : style === "transit"
      ? "#0369a1"
      : style === "rival"
        ? "#991b1b"
        : "#0f766e";

  // Windows are dim in daylight and glow at night; the day/night cycle in
  // ThreeScene lerps emissiveIntensity between these via userData.nightEmissive.
  const dayIntensity = lit ? 0.08 : 0.02;
  const nightIntensity = lit ? (style === "arcade" ? 0.95 : 0.5) : 0.12;
  const material = new THREE.MeshStandardMaterial({
    color: lit ? color : "#1e293b",
    emissive,
    emissiveIntensity: dayIntensity,
    roughness: lit ? 0.16 : 0.38,
    metalness: 0.04
  });
  material.userData.nightEmissive = { day: dayIntensity, night: nightIntensity };
  return material;
}

function addWindows(group: THREE.Group, width: number, height: number, depth: number, buildingHeight: number, style: BuildingStyle, quality: GraphicsQuality): void {
  const frameMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.48, metalness: 0.12 });
  const mullionMaterial = new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.78 });
  const sillMaterial = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.7, metalness: 0.05 });
  // Soft additive glow that makes lit windows spill light onto the facade instead of reading as flat squares.
  const glowMaterial = quality === "low"
    ? null
    : new THREE.MeshBasicMaterial({
        map: windowGlowTexture(),
        color: windowLitColor(style),
        transparent: true,
        opacity: style === "arcade" ? 0.5 : 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

  if (buildingHeight < WORLD_SCALE.building.minimumStorefrontHeight + 0.55) {
    return;
  }

  const upperWindow = WORLD_SCALE.building.upperWindow;
  const firstRowY = 2.75;
  const rowSpacing = WORLD_SCALE.building.floorHeight;
  const cols = Math.max(1, Math.floor((width - 0.8) / (quality === "high" ? 1.25 : quality === "low" ? 2.0 : 1.45)));
  const rows = Math.max(1, Math.floor((buildingHeight - firstRowY + rowSpacing * 0.45) / rowSpacing));
  const usableWidth = Math.max(0.1, width - 1.1);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col) % (quality === "low" ? 2 : 3) === 0 && style !== "arcade") {
        continue;
      }

      const x = cols === 1 ? 0 : -usableWidth / 2 + col * (usableWidth / Math.max(1, cols - 1));
      const y = firstRowY + row * rowSpacing;
      if (y + upperWindow.frameHeight / 2 > height - 0.35) {
        continue;
      }
      const lit = style === "arcade" || ((row * 7 + col * 5 + Math.round(width * 10)) % 9) < 6;
      const windowMaterial = litWindowMaterial(style, lit);
      addPlane(group, upperWindow.frameWidth, upperWindow.frameHeight, frameMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.012), 0);
      addPlane(group, upperWindow.width, upperWindow.height, windowMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.011), 0);
      if (lit && glowMaterial) {
        const halo = addPlane(group, upperWindow.frameWidth * 1.85, upperWindow.frameHeight * 1.85, glowMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.02), 0);
        halo.renderOrder = 3;
      }
      if (quality !== "low") {
        addPlane(group, 0.028, upperWindow.height, mullionMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.018), 0);
        addPlane(group, upperWindow.width, 0.024, mullionMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.019), 0);
        const glint = addPlane(group, 0.035, upperWindow.height * 0.82, new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: lit ? 0.18 : 0.05 }), new THREE.Vector3(x - upperWindow.width * 0.28, y + 0.01, -depth / 2 - 0.02), 0);
        glint.rotation.z = -0.28;
        const sill = new THREE.Mesh(new THREE.BoxGeometry(upperWindow.frameWidth + 0.12, upperWindow.sillHeight, 0.12), sillMaterial);
        sill.position.set(x, y - upperWindow.frameHeight / 2 - upperWindow.sillHeight / 2, -depth / 2 - 0.045);
        sill.castShadow = true;
        group.add(sill);
      }

      if (quality === "high" && row % 2 === 1) {
        const awning = new THREE.Mesh(new THREE.BoxGeometry(upperWindow.frameWidth + 0.18, 0.055, 0.2), new THREE.MeshStandardMaterial({ color: style === "rival" ? "#fb7185" : "#38bdf8", roughness: 0.58, metalness: 0.06 }));
        awning.position.set(x, y + upperWindow.frameHeight / 2 + 0.1, -depth / 2 - 0.09);
        awning.castShadow = true;
        group.add(awning);
      }
    }
  }

  if (quality === "low") {
    return;
  }

  const sideRows = Math.max(1, Math.floor((buildingHeight - firstRowY + rowSpacing * 0.45) / rowSpacing));
  const sideCols = Math.max(1, Math.floor(depth / 1.45));
  for (let row = 0; row < sideRows; row += 1) {
    const y = firstRowY + row * rowSpacing;
    if (y + upperWindow.frameHeight / 2 > height - 0.45) {
      continue;
    }

    for (let col = 0; col < sideCols; col += 1) {
      if ((row + col) % 2 === 0 && style !== "arcade") {
        continue;
      }

      const z = -depth / 2 + 0.65 + col * ((depth - 1.3) / Math.max(1, sideCols - 1));
      for (const side of [-1, 1] as const) {
        const x = side * (width / 2 + 0.012);
        const lit = style === "arcade" || ((row * 4 + col * 3 + side + Math.round(depth * 10)) % 8) < 4;
        const windowMaterial = litWindowMaterial(style, lit);
        addPlane(group, upperWindow.frameWidth * 0.88, upperWindow.frameHeight * 0.9, frameMaterial, new THREE.Vector3(x, y, z), side > 0 ? Math.PI / 2 : -Math.PI / 2);
        addPlane(group, upperWindow.width * 0.86, upperWindow.height * 0.88, windowMaterial, new THREE.Vector3(x + side * 0.002, y, z), side > 0 ? Math.PI / 2 : -Math.PI / 2);
        addPlane(group, upperWindow.width * 0.86, 0.018, mullionMaterial, new THREE.Vector3(x + side * 0.004, y, z), side > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (quality === "high" && (row + col + side) % 3 === 0) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.22), new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.52, metalness: 0.32 }));
          ac.position.set(x + side * 0.055, y - upperWindow.frameHeight / 2 - 0.08, z);
          ac.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          ac.castShadow = true;
          group.add(ac);
        }
      }
    }
  }

  const rearCols = Math.max(1, Math.floor(width / 1.9));
  for (let col = 0; col < rearCols; col += 1) {
    const x = -width / 2 + 0.7 + col * ((width - 1.4) / Math.max(1, rearCols - 1));
    const windowMaterial = litWindowMaterial(style, col % 2 === 0);
    addPlane(group, upperWindow.frameWidth * 0.88, upperWindow.frameHeight * 0.9, frameMaterial, new THREE.Vector3(x, Math.min(height - 0.75, firstRowY), depth / 2 + 0.012), Math.PI);
    addPlane(group, upperWindow.width * 0.86, upperWindow.height * 0.88, windowMaterial, new THREE.Vector3(x, Math.min(height - 0.75, firstRowY), depth / 2 + 0.014), Math.PI);
  }
}

function addFacadeDetails(group: THREE.Group, width: number, depth: number, height: number, style: BuildingStyle, accent: string, quality: GraphicsQuality): void {
  const frontZ = -depth / 2;
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.55, metalness: 0.12 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.58, metalness: 0.08 });
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.82, metalness: 0.02 });
  const glassNightIntensity = style === "arcade" ? 0.5 : 0.16;
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: style === "arcade" ? "#f5d0fe" : "#bfdbfe",
    emissive: style === "arcade" ? "#86198f" : "#075985",
    emissiveIntensity: glassNightIntensity * 0.25,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.64,
    transmission: 0.12
  });
  glassMaterial.userData.nightEmissive = { day: glassNightIntensity * 0.25, night: glassNightIntensity };

  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.32, 0.24, depth + 0.34), darkMaterial);
  roofCap.position.set(0, height + 0.08, 0);
  roofCap.castShadow = true;
  roofCap.receiveShadow = true;
  group.add(roofCap);

  const parapet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.42, 0.28, 0.22), trimMaterial);
  parapet.position.set(0, height + 0.28, frontZ - 0.04);
  parapet.castShadow = true;
  group.add(parapet);

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.18, 0.2), concreteMaterial);
  foundation.position.set(0, 0.09, frontZ - 0.08);
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  group.add(foundation);

  for (let y = 2.75; y < height - 0.36; y += WORLD_SCALE.building.floorHeight) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.045, 0.08), darkMaterial);
    band.position.set(0, y, frontZ - 0.045);
    group.add(band);
  }

  for (const x of [-width / 2 - 0.035, width / 2 + 0.035]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.12, Math.max(1.4, height - 0.18), 0.16), concreteMaterial);
    corner.position.set(x, height / 2, frontZ - 0.035);
    corner.castShadow = true;
    group.add(corner);
  }

  const doorScale = WORLD_SCALE.building.door;
  const storefrontWindow = WORLD_SCALE.building.storefrontWindow;
  const doorBottom = 0.08;
  const doorY = doorBottom + doorScale.height / 2;
  const frameY = doorBottom + doorScale.frameHeight / 2;
  const doorX = -Math.min(width * 0.28, 1.1);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorScale.frameWidth, doorScale.frameHeight, 0.08), darkMaterial);
  doorFrame.position.set(doorX, frameY, frontZ - 0.055);
  doorFrame.castShadow = true;
  group.add(doorFrame);

  const door = new THREE.Mesh(new THREE.BoxGeometry(doorScale.width, doorScale.height, 0.035), glassMaterial);
  door.position.set(doorX, doorY, frontZ - 0.106);
  group.add(door);

  for (const [x, y, w, h] of [
    [doorX, doorY + doorScale.height / 2 + 0.03, doorScale.width + 0.1, 0.025],
    [doorX, doorY - doorScale.height / 2 - 0.03, doorScale.width + 0.1, 0.025],
    [doorX - doorScale.width / 2 - 0.03, doorY, 0.025, doorScale.height + 0.08],
    [doorX + doorScale.width / 2 + 0.03, doorY, 0.025, doorScale.height + 0.08]
  ] as Array<[number, number, number, number]>) {
    const doorGasket = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.018), darkMaterial);
    doorGasket.position.set(x, y, frontZ - 0.119);
    addModelPolishDetail(group, doorGasket, "building-door-gasket");
  }

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
  handle.position.set(doorX + doorScale.width * 0.32, 1.08, frontZ - 0.13);
  handle.rotation.x = Math.PI / 2;
  group.add(handle);

  const threshold = new THREE.Mesh(new THREE.BoxGeometry(doorScale.frameWidth + 0.16, 0.08, 0.22), concreteMaterial);
  threshold.position.set(doorX, 0.11, frontZ - 0.22);
  threshold.castShadow = true;
  threshold.receiveShadow = true;
  group.add(threshold);

  const doorMat = new THREE.Mesh(
    new THREE.BoxGeometry(doorScale.frameWidth + 0.1, 0.018, 0.42),
    new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.9, metalness: 0.02 })
  );
  doorMat.position.set(doorX, 0.025, frontZ - 0.44);
  doorMat.receiveShadow = true;
  group.add(doorMat);

  if (quality === "low") {
    return;
  }

  const displayWidth = Math.min(width * 0.44, 1.9);
  const displayX = Math.min(width * 0.18, 1.0);
  const displayFrameY = storefrontWindow.sillHeight + storefrontWindow.frameHeight / 2;
  const displayGlassY = storefrontWindow.sillHeight + storefrontWindow.height / 2;
  const displayFrame = new THREE.Mesh(new THREE.BoxGeometry(displayWidth + 0.18, storefrontWindow.frameHeight, 0.075), darkMaterial);
  displayFrame.position.set(displayX, displayFrameY, frontZ - 0.054);
  displayFrame.castShadow = true;
  group.add(displayFrame);

  const displayGlass = new THREE.Mesh(new THREE.BoxGeometry(displayWidth, storefrontWindow.height, 0.034), glassMaterial);
  displayGlass.position.set(displayX, displayGlassY, frontZ - 0.104);
  group.add(displayGlass);

  for (const [x, y, w, h] of [
    [displayX, displayFrameY + storefrontWindow.frameHeight / 2 - 0.04, displayWidth + 0.18, 0.025],
    [displayX, displayFrameY - storefrontWindow.frameHeight / 2 + 0.04, displayWidth + 0.18, 0.025],
    [displayX - displayWidth / 2 - 0.04, displayGlassY, 0.025, storefrontWindow.height],
    [displayX + displayWidth / 2 + 0.04, displayGlassY, 0.025, storefrontWindow.height]
  ] as Array<[number, number, number, number]>) {
    const gasket = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.018), darkMaterial);
    gasket.position.set(x, y, frontZ - 0.133);
    addModelPolishDetail(group, gasket, "building-window-gasket");
  }

  const displayGlare = new THREE.Mesh(new THREE.BoxGeometry(0.035, storefrontWindow.height * 0.86, 0.012), new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.18 }));
  displayGlare.position.set(displayX - displayWidth * 0.32, displayGlassY, frontZ - 0.126);
  displayGlare.rotation.z = -0.26;
  group.add(displayGlare);

  if (style === "garage" || style === "supplier") {
    const rollup = new THREE.Mesh(new THREE.BoxGeometry(displayWidth + 0.04, storefrontWindow.height, 0.03), new THREE.MeshStandardMaterial({ color: style === "garage" ? "#64748b" : "#92400e", roughness: 0.56, metalness: 0.18 }));
    rollup.position.set(displayX, displayGlassY, frontZ - 0.132);
    group.add(rollup);
    for (let y = storefrontWindow.sillHeight + 0.1; y <= storefrontWindow.sillHeight + storefrontWindow.height - 0.1; y += 0.16) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(displayWidth + 0.08, 0.018, 0.012), darkMaterial);
      slat.position.set(displayX, y, frontZ - 0.154);
      group.add(slat);
    }
  } else {
    const shelfMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.45, metalness: 0.18 });
    const displayAccent = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.88 });
    for (let shelfIndex = 0; shelfIndex < 2; shelfIndex += 1) {
      const shelfY = storefrontWindow.sillHeight + 0.28 + shelfIndex * 0.34;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(displayWidth * 0.82, 0.035, 0.06), shelfMaterial);
      shelf.position.set(displayX, shelfY, frontZ - 0.14);
      group.add(shelf);

      for (let itemIndex = 0; itemIndex < 5; itemIndex += 1) {
        const itemX = displayX - displayWidth * 0.32 + itemIndex * (displayWidth * 0.16);
        const itemColor = itemIndex % 3 === 0 ? accent : itemIndex % 3 === 1 ? "#f8fafc" : "#fbbf24";
        const material = itemIndex % 3 === 0 ? displayAccent : new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.52, metalness: 0.06 });
        const item = itemIndex % 2 === 0
          ? new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.05), material)
          : new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.17, 10), material);
        item.position.set(itemX, shelfY + 0.09, frontZ - 0.16);
        if (itemIndex % 2 !== 0) {
          item.rotation.z = 0.05;
        }
        item.castShadow = true;
        group.add(item);
      }
    }

    const neonTrim = new THREE.Mesh(new THREE.BoxGeometry(displayWidth * 0.88, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 }));
    neonTrim.position.set(displayX, displayFrameY + storefrontWindow.frameHeight / 2 + 0.08, frontZ - 0.134);
    group.add(neonTrim);
  }

  for (const x of [-width / 2 + 0.22, width / 2 - 0.22]) {
    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.18, Math.min(height, 3.2), 0.14), concreteMaterial);
    pilaster.position.set(x, Math.min(height, 3.2) / 2, frontZ - 0.055);
    pilaster.castShadow = true;
    group.add(pilaster);
  }

  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, Math.max(1.7, height - 0.7), 10), darkMaterial);
  pipe.position.set(width / 2 + 0.08, Math.max(1.7, height - 0.7) / 2, frontZ - 0.04);
  pipe.castShadow = true;
  group.add(pipe);

  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.25, 0.08), new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.54, metalness: 0.32 }));
  vent.position.set(-width / 2 + 0.55, Math.min(height - 0.45, 2.35), frontZ - 0.075);
  vent.castShadow = true;
  group.add(vent);
  for (let i = 0; i < 4; i += 1) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.014, 0.012), darkMaterial);
    slit.position.set(vent.position.x, vent.position.y - 0.07 + i * 0.045, frontZ - 0.125);
    group.add(slit);
  }

  const hvac = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.35, 0.58), new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.62, metalness: 0.22 }));
  hvac.position.set(width / 2 - 0.85, height + 0.42, 0.1);
  hvac.castShadow = true;
  addModelPolishDetail(group, hvac, "building-rooftop-hvac");

  const fan = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 8, 26), darkMaterial);
  fan.position.set(hvac.position.x, hvac.position.y + 0.01, hvac.position.z - 0.3);
  fan.rotation.x = Math.PI / 2;
  addModelPolishDetail(group, fan, "building-hvac-fan");
  for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.15, 0.018), new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.82 }));
    blade.position.copy(fan.position);
    blade.rotation.x = Math.PI / 2;
    blade.rotation.z = bladeIndex * Math.PI / 4;
    addModelPolishDetail(group, blade, "building-hvac-blade");
  }

  const roofVentMaterial = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.46, metalness: 0.36 });
  for (const x of [-width * 0.22, width * 0.18]) {
    const ventPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.34, 12), roofVentMaterial);
    ventPipe.position.set(x, height + 0.34, depth * 0.2);
    ventPipe.castShadow = true;
    group.add(ventPipe);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.055, 12), roofVentMaterial);
    cap.position.set(x, height + 0.54, depth * 0.2);
    group.add(cap);
  }

  if (height > 4.2) {
    const escapeMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.52, metalness: 0.38 });
    const sideX = -width / 2 - 0.08;
    for (let level = 0; level < Math.min(3, Math.floor((height - 2.1) / 1.05)); level += 1) {
      const y = 2.2 + level * 1.05;
      const platform = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 1.12), escapeMaterial);
      platform.position.set(sideX, y, -depth * 0.18);
      platform.castShadow = true;
      group.add(platform);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 1.12), escapeMaterial);
      rail.position.set(sideX - 0.05, y + 0.2, -depth * 0.18);
      group.add(rail);
    }
  }

  if (style === "arcade" || style === "rival" || style === "transit") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.92, 0.5), new THREE.MeshBasicMaterial({ color: accent }));
    blade.position.set(width / 2 + 0.1, Math.min(height - 0.5, 2.5), frontZ - 0.32);
    blade.castShadow = true;
    group.add(blade);

    const bladeCore = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.74, 0.36), darkMaterial);
    bladeCore.position.set(width / 2 + 0.105, blade.position.y, frontZ - 0.32);
    group.add(bladeCore);
  }

  if (quality === "high") {
    const stairMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.55, metalness: 0.32 });
    for (let step = 0; step < 4; step += 1) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(doorScale.frameWidth + 0.08 - step * 0.08, 0.045, 0.26), stairMaterial);
      tread.position.set(doorX, 0.14 + step * 0.075, frontZ - 0.36 - step * 0.17);
      tread.castShadow = true;
      tread.receiveShadow = true;
      group.add(tread);
    }

    const roofTank = new THREE.Group();
    const tankMaterial = new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.5, metalness: 0.28 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.62, 18), tankMaterial);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, height + 0.72, depth * 0.2);
    tank.castShadow = true;
    roofTank.add(tank);
    for (const x of [-0.22, 0.22]) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), stairMaterial);
      stand.position.set(x, height + 0.35, depth * 0.2);
      roofTank.add(stand);
    }
    group.add(roofTank);

    for (const x of [-width * 0.34, width * 0.36]) {
      const wallLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.85 }));
      wallLamp.position.set(x, 1.75, frontZ - 0.12);
      group.add(wallLamp);
    }

    const sideSign = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.82), new THREE.MeshBasicMaterial({ color: accent }));
    sideSign.position.set(-width / 2 - 0.08, Math.min(height - 0.55, 2.35), frontZ - 0.36);
    sideSign.castShadow = true;
    addModelPolishDetail(group, sideSign, "building-blade-sign");
  }
}

export function createBuilding(width: number, depth: number, height: number, style: BuildingStyle, signText: string, quality: GraphicsQuality = "medium"): THREE.Group {
  const group = new THREE.Group();
  const visualHeight = Math.max(height, WORLD_SCALE.building.minimumStorefrontHeight);
  const materialByStyle: Record<BuildingStyle, THREE.MeshStandardMaterial> = {
    garage: createWallMaterial("#475569", "rgba(15, 23, 42, 0.26)", quality),
    supplier: createWallMaterial("#6b3f17", "rgba(15, 23, 42, 0.28)", quality),
    laundromat: createWallMaterial("#0f766e", "rgba(15, 23, 42, 0.24)", quality),
    gym: createWallMaterial("#7c2d12", "rgba(15, 23, 42, 0.26)", quality),
    arcade: createWallMaterial("#4c1d95", "rgba(15, 23, 42, 0.2)", quality),
    transit: createWallMaterial("#0e7490", "rgba(15, 23, 42, 0.24)", quality),
    rival: createWallMaterial("#7f1d1d", "rgba(15, 23, 42, 0.32)", quality)
  };
  const signAccent: Record<BuildingStyle, string> = {
    garage: "#38bdf8",
    supplier: "#f59e0b",
    laundromat: "#5eead4",
    gym: "#fb923c",
    arcade: "#e879f9",
    transit: "#67e8f9",
    rival: "#fb7185"
  };

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, visualHeight, depth), materialByStyle[style]);
  body.position.y = visualHeight / 2;
  body.castShadow = quality !== "low";
  body.receiveShadow = true;
  group.add(body);

  addFacadeDetails(group, width, depth, visualHeight, style, signAccent[style], quality);
  addWindows(group, width, visualHeight, depth, visualHeight, style, quality);

  const signMaterial = new THREE.MeshStandardMaterial({
    map: createSignTexture(signText, "rgba(15, 23, 42, 0.96)", signAccent[style]),
    emissive: signAccent[style],
    emissiveIntensity: 0.08,
    transparent: true,
    roughness: 0.35
  });
  signMaterial.userData.nightEmissive = { day: 0.08, night: 0.42 };
  const signY = Math.min(visualHeight - 0.46, Math.max(2.52, WORLD_SCALE.building.door.frameHeight + 0.34));
  const signWidth = Math.min(width * 0.72, 3.8);
  const sign = addPlane(group, signWidth, 0.58, signMaterial, new THREE.Vector3(0, signY, -depth / 2 - 0.025), 0);
  sign.userData.modelPolishDetail = "building-lit-sign-face";
  const signTrimMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.42, metalness: 0.24 });
  for (const [x, y, w, h] of [
    [0, signY + 0.31, signWidth + 0.1, 0.035],
    [0, signY - 0.31, signWidth + 0.1, 0.035],
    [-signWidth / 2 - 0.035, signY, 0.035, 0.64],
    [signWidth / 2 + 0.035, signY, 0.035, 0.64]
  ] as Array<[number, number, number, number]>) {
    const signTrim = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), signTrimMaterial);
    signTrim.position.set(x, y, -depth / 2 - 0.04);
    addModelPolishDetail(group, signTrim, "building-sign-trim");
  }

  if (quality !== "low") {
    const signLampMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.86 });
    for (const x of [-signWidth * 0.32, signWidth * 0.32]) {
      const lampArm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.24), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.45, metalness: 0.34 }));
      lampArm.position.set(x, signY + 0.43, -depth / 2 - 0.12);
      group.add(lampArm);
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 14), signLampMaterial);
      lamp.position.set(x, signY + 0.34, -depth / 2 - 0.24);
      lamp.rotation.x = -Math.PI / 2;
      group.add(lamp);
    }
  }

  const awningMaterial = new THREE.MeshStandardMaterial({ color: signAccent[style], roughness: 0.62, metalness: 0.08 });
  const awningWidth = Math.min(width * 0.55, 3.2);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(awningWidth, 0.12, 0.48), awningMaterial);
  awning.position.set(0, Math.min(visualHeight - 0.95, WORLD_SCALE.building.door.frameHeight + 0.05), -depth / 2 - 0.22);
  awning.castShadow = true;
  addModelPolishDetail(group, awning, "building-awning-body");

  if (quality !== "low") {
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.76 });
    const stripeCount = Math.max(3, Math.floor(awningWidth / 0.42));
    for (let index = 0; index < stripeCount; index += 1) {
      if (index % 2 !== 0) {
        continue;
      }
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(awningWidth / stripeCount * 0.72, 0.014, 0.5), stripeMaterial);
      stripe.position.set(-awningWidth / 2 + (index + 0.5) * (awningWidth / stripeCount), awning.position.y + 0.07, awning.position.z);
      group.add(stripe);
    }
    for (let index = 0; index < stripeCount; index += 1) {
      const scallop = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, awningWidth / stripeCount * 0.62, 12), awningMaterial);
      scallop.position.set(-awningWidth / 2 + (index + 0.5) * (awningWidth / stripeCount), awning.position.y - 0.065, awning.position.z - 0.24);
      scallop.rotation.z = Math.PI / 2;
      addModelPolishDetail(group, scallop, "building-awning-scallop");
    }

    const securityCamera = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.36, metalness: 0.22 }));
    securityCamera.position.set(width / 2 - 0.28, 2.18, -depth / 2 - 0.16);
    securityCamera.castShadow = true;
    addModelPolishDetail(group, securityCamera, "building-security-camera");
    const cameraLens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 14), new THREE.MeshBasicMaterial({ color: "#38bdf8" }));
    cameraLens.position.set(width / 2 - 0.28, 2.18, -depth / 2 - 0.24);
    cameraLens.rotation.x = Math.PI / 2;
    addModelPolishDetail(group, cameraLens, "building-security-camera-lens");
  }

  return group;
}

export function createSkyDome(quality: GraphicsQuality = "medium"): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = quality === "low" ? 512 : quality === "high" ? 1536 : 1024;
  canvas.height = canvas.width / 2;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#06111f");
    gradient.addColorStop(0.45, "#142b43");
    gradient.addColorStop(1, "#36506b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(248, 250, 252, 0.8)";
    const starCount = quality === "low" ? 36 : quality === "high" ? 150 : 90;
    for (let i = 0; i < starCount; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.42;
      const radius = Math.random() * 1.6 + 0.4;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = "rgba(255, 244, 214, 0.86)";
    context.beginPath();
    context.arc(770, 84, 26, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(226, 232, 240, 0.15)";
    for (let i = 0; i < 7; i += 1) {
      const x = 90 + i * 140;
      const y = 92 + Math.sin(i) * 18;
      context.beginPath();
      context.ellipse(x, y, 90, 18, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const widthSegments = quality === "low" ? 24 : quality === "high" ? 64 : 48;
  const heightSegments = quality === "low" ? 12 : quality === "high" ? 32 : 24;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(106, widthSegments, heightSegments),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
  );
  sky.position.y = 6;
  return sky;
}

// Equirectangular night-city texture used to build a PMREM environment map.
// Gives clearcoat car paint and glass something believable to reflect: a dark
// sky, a warm horizon haze, and a few soft neon/streetlight glows.
export function createEnvironmentMapTexture(quality: GraphicsQuality = "medium"): THREE.CanvasTexture {
  const width = quality === "low" ? 256 : 512;
  const height = width / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (context) {
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#050b16");
    sky.addColorStop(0.4, "#102338");
    sky.addColorStop(0.5, "#3a5572");
    sky.addColorStop(0.52, "#1b2940");
    sky.addColorStop(1, "#070d16");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    const haze = context.createLinearGradient(0, height * 0.4, 0, height * 0.58);
    haze.addColorStop(0, "rgba(251, 191, 120, 0)");
    haze.addColorStop(0.5, "rgba(251, 146, 60, 0.34)");
    haze.addColorStop(1, "rgba(251, 191, 120, 0)");
    context.fillStyle = haze;
    context.fillRect(0, height * 0.4, width, height * 0.18);

    // Crisp moon — gives clearcoat paint and glass a sharp reflective highlight.
    const moonX = width * 0.72;
    const moonY = height * 0.17;
    const moonHalo = context.createRadialGradient(moonX, moonY, 0, moonX, moonY, height * 0.16);
    moonHalo.addColorStop(0, "rgba(226, 240, 255, 0.7)");
    moonHalo.addColorStop(1, "rgba(226, 240, 255, 0)");
    context.fillStyle = moonHalo;
    context.fillRect(moonX - height * 0.16, moonY - height * 0.16, height * 0.32, height * 0.32);
    context.fillStyle = "rgba(244, 250, 255, 0.95)";
    context.beginPath();
    context.arc(moonX, moonY, height * 0.035, 0, Math.PI * 2);
    context.fill();

    // Distant skyline window-lights — small bright specks that sparkle across reflective surfaces.
    const lightTints = ["#fde68a", "#fef3c7", "#fdba74", "#bae6fd", "#a7f3d0", "#f9a8d4"];
    const lightCount = quality === "low" ? 70 : 150;
    for (let i = 0; i < lightCount; i += 1) {
      const lx = Math.random() * width;
      const ly = height * (0.42 + Math.random() * 0.14);
      const size = 1 + Math.random() * (width / 256);
      context.globalAlpha = 0.5 + Math.random() * 0.45;
      context.fillStyle = lightTints[Math.floor(Math.random() * lightTints.length)];
      context.fillRect(lx, ly, size, size * (1 + Math.random()));
    }
    context.globalAlpha = 1;

    const glows: Array<[number, number, number, string]> = [
      [width * 0.18, height * 0.47, height * 0.2, "rgba(253, 230, 138, 0.7)"],
      [width * 0.46, height * 0.45, height * 0.16, "rgba(248, 250, 252, 0.5)"],
      [width * 0.64, height * 0.46, height * 0.24, "rgba(103, 232, 249, 0.46)"],
      [width * 0.86, height * 0.48, height * 0.18, "rgba(244, 114, 182, 0.42)"]
    ];
    for (const [x, y, radius, color] of glows) {
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, color);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function createSpriteTexture(kind: "poster" | "trash" | "pallet" | "graffiti"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (kind === "poster") {
      context.fillStyle = "#f59e0b";
      context.fillRect(42, 38, 172, 190);
      context.fillStyle = "#111827";
      context.fillRect(56, 52, 144, 54);
      context.fillStyle = "#f8fafc";
      context.font = "900 24px Inter, system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("TURBO", 128, 88);
      context.fillStyle = "#7c2d12";
      context.fillRect(62, 128, 132, 22);
      context.fillRect(62, 166, 98, 18);
    }

    if (kind === "trash") {
      context.fillStyle = "rgba(15, 23, 42, 0.92)";
      context.beginPath();
      context.ellipse(128, 168, 78, 52, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "rgba(71, 85, 105, 0.72)";
      context.beginPath();
      context.ellipse(100, 146, 34, 20, -0.5, 0, Math.PI * 2);
      context.fill();
    }

    if (kind === "pallet") {
      context.fillStyle = "#92400e";
      for (let y = 94; y <= 164; y += 28) {
        context.fillRect(40, y, 176, 14);
      }
      context.fillStyle = "#451a03";
      for (let x = 62; x <= 174; x += 56) {
        context.fillRect(x, 78, 18, 108);
      }
    }

    if (kind === "graffiti") {
      context.strokeStyle = "#fb7185";
      context.lineWidth = 14;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(52, 150);
      context.bezierCurveTo(82, 72, 118, 208, 152, 112);
      context.bezierCurveTo(172, 62, 190, 92, 206, 132);
      context.stroke();
      context.strokeStyle = "#67e8f9";
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(64, 180);
      context.lineTo(196, 178);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBillboardSprite(kind: "poster" | "trash" | "pallet" | "graffiti", width: number, height: number): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createSpriteTexture(kind),
      transparent: true,
      depthWrite: false
    })
  );
  sprite.scale.set(width, height, 1);
  return sprite;
}

function createTaperedBody(topRadius: number, bottomRadius: number, height: number, depthScale: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, 18), material);
  mesh.scale.z = depthScale;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createHorizontalCapsule(radius: number, length: number, material: THREE.Material, depthScale = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 16), material);
  mesh.rotation.z = Math.PI / 2;
  mesh.scale.z = depthScale;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addFace(group: THREE.Group, y: number, z: number, skinColor = "#9f6b45"): void {
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#111827" });
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMaterial);
    eye.position.set(x, y, z);
    group.add(eye);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: "#111827" }));
    brow.position.set(x, y + 0.045, z - 0.004);
    brow.rotation.z = x > 0 ? -0.15 : 0.15;
    group.add(brow);
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.065, 8), new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.62 }));
  nose.position.set(0, y - 0.03, z - 0.018);
  nose.rotation.x = Math.PI / 2;
  group.add(nose);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.01, 0.012), new THREE.MeshBasicMaterial({ color: "#7f1d1d" }));
  mouth.position.set(0, y - 0.095, z - 0.01);
  group.add(mouth);

  for (const x of [-0.085, 0.085]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: skinColor, transparent: true, opacity: 0.62 }));
    cheek.position.set(x, y - 0.058, z - 0.006);
    cheek.scale.set(1.35, 0.7, 0.3);
    group.add(cheek);
  }
}

type NpcVariant = "customer" | "rival" | "worker" | "scout";
type StreetNpcAction = "walk" | "carry" | "pace" | "scan";

interface NpcLimbRig {
  lower: THREE.Group;
  upper: THREE.Group;
  wrist: THREE.Group;
}

function createJoint(radius: number, material: THREE.Material): THREE.Mesh {
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material);
  joint.castShadow = true;
  joint.receiveShadow = true;
  return joint;
}

function createLimbSegment(length: number, topRadius: number, bottomRadius: number, material: THREE.Material): THREE.Mesh {
  const segment = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, length, 14), material);
  segment.position.y = -length / 2;
  segment.castShadow = true;
  segment.receiveShadow = true;
  return segment;
}

function createArmRig(side: -1 | 1, jacketMaterial: THREE.Material, cuffMaterial: THREE.Material, skinMaterial: THREE.Material): NpcLimbRig {
  const upperLength = 0.28;
  const lowerLength = 0.27;
  const upper = new THREE.Group();
  upper.position.set(side * 0.29, 1.07, -0.018);
  upper.rotation.z = -side * 0.18;

  const shoulder = createJoint(0.055, jacketMaterial);
  upper.add(shoulder);

  upper.add(createLimbSegment(upperLength, 0.052, 0.047, jacketMaterial));

  const elbow = createJoint(0.047, jacketMaterial);
  elbow.position.y = -upperLength;
  upper.add(elbow);

  const lower = new THREE.Group();
  lower.position.y = -upperLength;
  lower.add(createLimbSegment(lowerLength, 0.044, 0.04, jacketMaterial));

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.045, 0.055, 10), cuffMaterial);
  cuff.position.y = -lowerLength + 0.02;
  cuff.castShadow = true;
  lower.add(cuff);

  const wrist = new THREE.Group();
  wrist.position.y = -lowerLength;
  const hand = createJoint(0.058, skinMaterial);
  hand.scale.set(0.92, 1.08, 0.78);
  wrist.add(hand);
  lower.add(wrist);

  upper.add(lower);
  return { lower, upper, wrist };
}

function createLegRig(side: -1 | 1, pantsMaterial: THREE.Material, shoeMaterial: THREE.Material): NpcLimbRig {
  const upperLength = 0.27;
  const lowerLength = 0.26;
  const upper = new THREE.Group();
  upper.position.set(side * 0.115, 0.58, 0.015);
  upper.rotation.z = -side * 0.04;

  upper.add(createLimbSegment(upperLength, 0.062, 0.056, pantsMaterial));

  const knee = createJoint(0.052, pantsMaterial);
  knee.position.y = -upperLength;
  upper.add(knee);

  const lower = new THREE.Group();
  lower.position.y = -upperLength;
  lower.add(createLimbSegment(lowerLength, 0.052, 0.046, pantsMaterial));

  const wrist = new THREE.Group();
  wrist.position.y = -lowerLength;
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.24), shoeMaterial);
  shoe.position.set(0, -0.005, -0.055);
  shoe.castShadow = true;
  shoe.receiveShadow = true;
  wrist.add(markModelPolishDetail(shoe, "npc-shoe-upper"));
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.26), new THREE.MeshBasicMaterial({ color: "#0f172a" }));
  sole.position.set(0, -0.043, -0.055);
  wrist.add(markModelPolishDetail(sole, "npc-shoe-sole"));
  lower.add(wrist);

  upper.add(lower);
  return { lower, upper, wrist };
}

function createLowNpcCharacter(variant: NpcVariant): THREE.Group {
  const palette = {
    customer: { jacket: "#0f766e", pants: "#1e293b", accent: "#2dd4bf", skin: "#c08457" },
    rival: { jacket: "#991b1b", pants: "#020617", accent: "#fb7185", skin: "#b45309" },
    worker: { jacket: "#f97316", pants: "#334155", accent: "#facc15", skin: "#d6a06f" },
    scout: { jacket: "#4338ca", pants: "#111827", accent: "#93c5fd", skin: "#9a6a4f" }
  }[variant];

  const group = new THREE.Group();
  group.userData.floatSpeed = variant === "rival" ? 1.2 : 1;
  group.userData.floatAmount = variant === "worker" ? 0.012 : 0.008;

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 12),
    new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.3 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.add(shadow);

  const jacketMaterial = new THREE.MeshStandardMaterial({ color: palette.jacket, roughness: 0.7 });
  const pantsMaterial = new THREE.MeshStandardMaterial({ color: palette.pants, roughness: 0.78 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.62 });
  const accentMaterial = new THREE.MeshBasicMaterial({ color: palette.accent });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.46, 4, 8), jacketMaterial);
  body.position.set(0, 0.84, 0);
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMaterial);
  head.position.set(0, 1.3, -0.01);
  head.castShadow = true;
  group.add(head);

  for (const x of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.48, 8), pantsMaterial);
    leg.position.set(x, 0.34, 0.01);
    leg.castShadow = true;
    group.add(leg);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 8), jacketMaterial);
    arm.position.set(x * 2.15, 0.82, -0.02);
    arm.rotation.z = -Math.sign(x) * 0.2;
    arm.castShadow = true;
    group.add(arm);
  }

  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.025), accentMaterial);
  badge.position.set(0.08, 0.98, -0.19);
  group.add(badge);

  if (variant === "worker") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.18), new THREE.MeshStandardMaterial({ color: "#92400e", roughness: 0.8 }));
    crate.position.set(0, 0.76, -0.22);
    group.add(crate);
  }

  group.userData.npcVariant = variant;
  return group;
}

export function createNpcCharacter(variant: NpcVariant, quality: GraphicsQuality = "medium"): THREE.Group {
  if (quality === "low") {
    return createLowNpcCharacter(variant);
  }

  const palette = {
    customer: { jacket: "#0f766e", shirt: "#e0f2fe", pants: "#1e293b", accent: "#2dd4bf", skin: "#c08457" },
    rival: { jacket: "#991b1b", shirt: "#111827", pants: "#020617", accent: "#fb7185", skin: "#b45309" },
    worker: { jacket: "#f97316", shirt: "#fef3c7", pants: "#334155", accent: "#facc15", skin: "#d6a06f" },
    scout: { jacket: "#4338ca", shirt: "#dbeafe", pants: "#111827", accent: "#93c5fd", skin: "#9a6a4f" }
  }[variant];

  const group = new THREE.Group();
  group.userData.floatSpeed = variant === "rival" ? 1.4 : 1;
  group.userData.floatAmount = variant === "worker" ? 0.018 : 0.012;

  const jacketMaterial = new THREE.MeshStandardMaterial({ color: palette.jacket, roughness: 0.66 });
  const shirtMaterial = new THREE.MeshStandardMaterial({ color: palette.shirt, roughness: 0.64 });
  const pantsMaterial = new THREE.MeshStandardMaterial({ color: palette.pants, roughness: 0.78 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.58 });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.62 });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.35 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  const body = new THREE.Group();
  body.position.set(0, 0.84, 0);
  const torso = createTaperedBody(0.23, 0.17, 0.54, 0.62, jacketMaterial);
  torso.rotation.x = 0.02;
  body.add(torso);

  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.4, 0.028), shirtMaterial);
  shirt.position.set(0, -0.02, -0.15);
  shirt.scale.x = variant === "rival" ? 0.78 : 0.9;
  body.add(shirt);

  for (const side of [-1, 1] as const) {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.024), jacketMaterial);
    lapel.position.set(side * 0.055, 0.08, -0.168);
    lapel.rotation.z = side * 0.32;
    body.add(lapel);
  }

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.042, 0.032), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.5, metalness: 0.08 }));
  belt.position.set(0, -0.28, -0.15);
  body.add(belt);
  group.add(body);

  const hips = new THREE.Group();
  hips.position.set(0, 0.58, -0.004);
  const hipRoll = createHorizontalCapsule(0.07, 0.24, pantsMaterial, 1.2);
  hips.add(hipRoll);
  const beltBack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.18), pantsMaterial);
  beltBack.position.set(0, 0.035, 0.015);
  beltBack.castShadow = true;
  hips.add(beltBack);
  group.add(hips);

  const shoulders = new THREE.Group();
  shoulders.position.set(0, 1.06, -0.012);
  const shoulderRoll = createHorizontalCapsule(0.076, 0.39, jacketMaterial, 1.08);
  shoulders.add(shoulderRoll);
  const collarBack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.13), jacketMaterial);
  collarBack.position.set(0, 0.045, -0.02);
  collarBack.castShadow = true;
  shoulders.add(collarBack);
  group.add(shoulders);

  const collarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.025), new THREE.MeshBasicMaterial({ color: palette.shirt }));
  collarLeft.position.set(-0.055, 1.1, -0.19);
  collarLeft.rotation.z = -0.42;
  group.add(collarLeft);
  const collarRight = collarLeft.clone();
  collarRight.position.x = 0.055;
  collarRight.rotation.z = 0.42;
  group.add(collarRight);

  const leftLeg = createLegRig(-1, pantsMaterial, shoeMaterial);
  const rightLeg = createLegRig(1, pantsMaterial, shoeMaterial);
  group.add(leftLeg.upper, rightLeg.upper);

  const leftArm = createArmRig(-1, jacketMaterial, shirtMaterial, skinMaterial);
  const rightArm = createArmRig(1, jacketMaterial, shirtMaterial, skinMaterial);
  group.add(leftArm.upper, rightArm.upper);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 12), skinMaterial);
  neck.position.set(0, 1.19, -0.005);
  neck.castShadow = true;
  group.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.22, -0.005);
  group.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), skinMaterial);
  head.position.set(0, 0.12, 0);
  head.scale.set(0.88, 1.06, 0.96);
  head.castShadow = true;
  headPivot.add(head);

  for (const x of [-0.17, 0.17]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), skinMaterial);
    ear.position.set(x, 0.12, -0.005);
    ear.scale.set(0.7, 1, 0.42);
    headPivot.add(ear);
  }

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.185, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    new THREE.MeshStandardMaterial({ color: variant === "worker" ? "#78350f" : "#111827", roughness: 0.7 })
  );
  hair.position.set(0, 0.19, 0);
  headPivot.add(hair);
  addFace(headPivot, 0.125, -0.17, palette.skin);

  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.025), new THREE.MeshBasicMaterial({ color: palette.accent }));
  badge.position.set(0.08, 1.0, -0.215);
  addModelPolishDetail(group, badge, "npc-name-badge");

  const jacketZip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.42, 0.018), new THREE.MeshBasicMaterial({ color: "#e2e8f0", transparent: true, opacity: 0.72 }));
  jacketZip.position.set(0, 0.86, -0.226);
  addModelPolishDetail(group, jacketZip, "npc-jacket-zipper");

  for (const side of [-1, 1] as const) {
    const sleeveStripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.018), new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.76 }));
    sleeveStripe.position.set(side * 0.31, 0.91, -0.09);
    sleeveStripe.rotation.z = side * 0.18;
    addModelPolishDetail(group, sleeveStripe, "npc-sleeve-patch");
  }

  const carryMount = new THREE.Group();
  carryMount.position.set(0, 0.82, -0.29);
  group.add(carryMount);

  if (variant === "rival") {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.26), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.45 }));
    cap.position.set(0, 0.29, -0.035);
    headPivot.add(markModelPolishDetail(cap, "npc-cap-crown"));
    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.024, 0.16), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.45 }));
    capBrim.position.set(0, 0.26, -0.16);
    headPivot.add(markModelPolishDetail(capBrim, "npc-cap-brim"));

    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.011, 8, 20), new THREE.MeshBasicMaterial({ color: "#facc15" }));
    chain.position.set(0, 1.15, -0.19);
    chain.rotation.x = Math.PI / 2;
    addModelPolishDetail(group, chain, "npc-chain");

    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.015), new THREE.MeshBasicMaterial({ color: "#020617" }));
    phone.position.set(0.02, -0.015, -0.07);
    phone.rotation.x = 0.18;
    leftArm.wrist.add(markModelPolishDetail(phone, "npc-phone"));
  }

  if (variant === "worker") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.22), new THREE.MeshStandardMaterial({ color: "#92400e", roughness: 0.8 }));
    crate.position.set(0, 0, 0);
    crate.rotation.z = 0.04;
    crate.castShadow = true;
    carryMount.add(markModelPolishDetail(crate, "npc-worker-crate"));

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.035, 0.235), new THREE.MeshStandardMaterial({ color: "#451a03", roughness: 0.7 }));
    strap.position.y = 0.015;
    carryMount.add(markModelPolishDetail(strap, "npc-worker-crate-strap"));
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.012), new THREE.MeshBasicMaterial({ color: "#fef3c7", transparent: true, opacity: 0.86 }));
    label.position.set(0.05, 0.04, -0.118);
    carryMount.add(markModelPolishDetail(label, "npc-worker-crate-label"));
  }

  if (variant === "scout") {
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.025), new THREE.MeshBasicMaterial({ color: "#38bdf8" }));
    tablet.position.set(0.025, -0.015, -0.08);
    tablet.rotation.set(0.35, -0.08, -0.12);
    rightArm.wrist.add(markModelPolishDetail(tablet, "npc-tablet-screen"));
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.16, 6), new THREE.MeshBasicMaterial({ color: "#93c5fd" }));
    antenna.position.set(0.1, 0.065, -0.08);
    antenna.rotation.z = -0.35;
    rightArm.wrist.add(markModelPolishDetail(antenna, "npc-tablet-antenna"));
  }

  if (variant === "customer") {
    const bag = new THREE.Group();
    const bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.075), new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.72 }));
    bagBody.position.y = -0.12;
    bagBody.castShadow = true;
    bag.add(markModelPolishDetail(bagBody, "npc-shopping-bag-body"));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 6, 18, Math.PI), new THREE.MeshStandardMaterial({ color: "#e0f2fe", roughness: 0.52 }));
    handle.position.y = -0.025;
    handle.rotation.z = Math.PI;
    bag.add(markModelPolishDetail(handle, "npc-shopping-bag-handle"));
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.012), new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.82 }));
    label.position.set(0, -0.12, -0.045);
    bag.add(markModelPolishDetail(label, "npc-shopping-bag-label"));
    bag.position.set(-0.015, -0.03, 0.025);
    leftArm.wrist.add(bag);
  }

  if (quality === "high") {
    const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.5, 0.018), new THREE.MeshBasicMaterial({ color: "#e2e8f0", transparent: true, opacity: 0.78 }));
    zipper.position.set(0, 0.84, -0.228);
    addModelPolishDetail(group, zipper, "npc-high-detail-zipper");

    for (const side of [-1, 1] as const) {
      const shoulderPatch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, 0.026), new THREE.MeshBasicMaterial({ color: palette.accent }));
      shoulderPatch.position.set(side * 0.23, 1.08, -0.17);
      shoulderPatch.rotation.z = side * 0.12;
      addModelPolishDetail(group, shoulderPatch, "npc-shoulder-patch");
    }

    if (variant === "worker") {
      const clipboard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.19, 0.018), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
      clipboard.position.set(-0.02, -0.03, -0.08);
      clipboard.rotation.x = 0.18;
      rightArm.wrist.add(markModelPolishDetail(clipboard, "npc-clipboard"));
    }

    if (variant === "scout") {
      const earpiece = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: "#38bdf8" }));
      earpiece.position.set(0.18, 0.13, -0.03);
      headPivot.add(markModelPolishDetail(earpiece, "npc-earpiece"));
    }
  }

  group.userData.npcVariant = variant;
  group.userData.rig = {
    body,
    carryMount,
    head: headPivot,
    hips,
    leftArm,
    leftLeg,
    rightArm,
    rightLeg,
    shoulders
  };

  return group;
}

export function createAtmosphere(quality: GraphicsQuality = "medium", overrideCount?: number): THREE.Points {
  const count = overrideCount ?? (quality === "low" ? 70 : quality === "high" ? 280 : 160);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const radius = 8 + Math.random() * 22;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.8 + Math.random() * 5.5;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    color.set(Math.random() > 0.7 ? "#67e8f9" : "#f8fafc");
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.035,
      transparent: true,
      opacity: 0.48,
      vertexColors: true,
      depthWrite: false
    })
  );
  points.userData.rotateSlowly = true;
  return points;
}

export function createStreetProps(options: { enableLocalLights?: boolean; maxNpcs?: number; quality?: GraphicsQuality } = {}): THREE.Group {
  const group = new THREE.Group();
  const maxNpcs = options.maxNpcs ?? 16;
  const enableLocalLights = options.enableLocalLights ?? true;
  const quality = options.quality ?? "medium";
  const props: Array<{ kind: "poster" | "trash" | "pallet" | "graffiti"; x: number; z: number; y: number; w: number; h: number }> = [
    { kind: "poster", x: -6.9, z: -6.6, y: 1.1, w: 0.85, h: 1.15 },
    { kind: "poster", x: 6.4, z: 7.0, y: 1.0, w: 0.85, h: 1.15 },
    { kind: "trash", x: -2.8, z: 2.2, y: 0.38, w: 0.9, h: 0.65 },
    { kind: "trash", x: 7.3, z: -4.2, y: 0.38, w: 0.85, h: 0.6 },
    { kind: "pallet", x: 7.0, z: 5.6, y: 0.5, w: 1.2, h: 0.9 },
    { kind: "graffiti", x: 1.5, z: 3.08, y: 1.25, w: 1.4, h: 0.9 },
    { kind: "pallet", x: -36.8, z: 4.6, y: 0.5, w: 1.25, h: 0.9 },
    { kind: "trash", x: -29.4, z: 11.7, y: 0.38, w: 0.9, h: 0.62 },
    { kind: "graffiti", x: -33.6, z: 8.0, y: 1.25, w: 1.4, h: 0.9 },
    { kind: "poster", x: 28.6, z: -9.6, y: 1.18, w: 0.85, h: 1.15 },
    { kind: "trash", x: 24.3, z: 7.8, y: 0.38, w: 0.86, h: 0.6 },
    { kind: "poster", x: 13.4, z: -24.6, y: 1.05, w: 0.85, h: 1.15 },
    { kind: "graffiti", x: 21.2, z: -25.9, y: 1.22, w: 1.5, h: 0.95 }
  ];

  const visibleProps = quality === "low" ? props.slice(0, 7) : quality === "high" ? props : props.slice(0, 11);
  for (const prop of visibleProps) {
    const sprite = createBillboardSprite(prop.kind, prop.w, prop.h);
    sprite.position.set(prop.x, prop.y, prop.z);
    markModelPolishDetail(sprite, `street-${prop.kind}-billboard`);
    group.add(sprite);
  }

  if (quality !== "low") {
    const cardboardMaterial = new THREE.MeshStandardMaterial({ color: "#a16207", roughness: 0.78, metalness: 0.02 });
    const tapeMaterial = new THREE.MeshBasicMaterial({ color: "#fef3c7", transparent: true, opacity: 0.78 });
    const coneMaterial = new THREE.MeshStandardMaterial({ color: "#f97316", roughness: 0.48, metalness: 0.04 });
    const coneStripeMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc" });
    const boxPiles: Array<[number, number, number]> = [
      [6.8, 5.85, 0.05],
      [-36.6, 4.35, -0.08],
      [24.1, 7.55, 0.12],
      [13.2, -24.0, -0.06]
    ];
    for (const [x, z, rotation] of quality === "medium" ? boxPiles.slice(0, 3) : boxPiles) {
      const pile = new THREE.Group();
      pile.position.set(x, 0.16, z);
      pile.rotation.y = rotation;
      for (let i = 0; i < 3; i += 1) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.34 + i * 0.03, 0.23, 0.28), cardboardMaterial);
        box.position.set((i - 1) * 0.19, i === 2 ? 0.24 : 0, i === 1 ? 0.13 : 0);
        box.rotation.y = i % 2 === 0 ? 0.08 : -0.12;
        box.castShadow = true;
        box.receiveShadow = true;
        pile.add(markModelPolishDetail(box, "street-cardboard-box"));

        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.36 + i * 0.03, 0.022, 0.03), tapeMaterial);
        tape.position.copy(box.position).add(new THREE.Vector3(0, 0.13, -0.13));
        tape.rotation.y = box.rotation.y;
        pile.add(markModelPolishDetail(tape, "street-box-tape"));

        const label = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.065, 0.012), new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.84 }));
        label.position.copy(box.position).add(new THREE.Vector3(0.04, 0.02, -0.148));
        label.rotation.y = box.rotation.y;
        pile.add(markModelPolishDetail(label, "street-box-label"));
      }
      pile.userData.modelPolishDetail = "street-box-pile";
      group.add(pile);
    }

    for (const [x, z] of [[-2.25, -3.32], [7.82, -0.62], [24.55, -7.2], [-29.25, 8.75]] as Array<[number, number]>) {
      const cone = new THREE.Group();
      cone.position.set(x, 0, z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.32), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.58, metalness: 0.08 }));
      base.position.y = 0.025;
      cone.add(markModelPolishDetail(base, "street-cone-rubber-base"));
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.44, 16), coneMaterial);
      body.position.y = 0.265;
      body.castShadow = true;
      cone.add(markModelPolishDetail(body, "street-cone-body"));
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.045, 16), coneStripeMaterial);
      stripe.position.y = 0.28;
      cone.add(markModelPolishDetail(stripe, "street-cone-reflective-band"));
      group.add(cone);
    }
  }

  const npcs: Array<{
    action: StreetNpcAction;
    path: Array<[number, number]>;
    rotation: number;
    speed: number;
    variant: NpcVariant;
  }> = [
    {
      action: "walk",
      path: [
        [-8.4, -3.55],
        [-2.1, -3.55],
        [-2.1, -1.55],
        [-8.4, -1.55]
      ],
      rotation: 2.15,
      speed: 0.55,
      variant: "customer"
    },
    {
      action: "carry",
      path: [
        [5.4, 3.55],
        [11.4, 3.55],
        [11.4, 6.55],
        [5.4, 6.55]
      ],
      rotation: -0.7,
      speed: 0.33,
      variant: "worker"
    },
    {
      action: "pace",
      path: [
        [-0.75, 1.65],
        [3.45, 1.65],
        [3.45, 2.55],
        [-0.75, 2.55]
      ],
      rotation: Math.PI,
      speed: 0.28,
      variant: "rival"
    },
    {
      action: "scan",
      path: [
        [-9.5, -5.35],
        [-7.2, -5.35],
        [-7.2, -1.0],
        [-9.5, -1.0]
      ],
      rotation: 0.15,
      speed: 0.36,
      variant: "scout"
    },
    {
      action: "carry",
      path: [
        [-34.8, 5.55],
        [-28.9, 5.55],
        [-28.9, 12.2],
        [-34.8, 12.2]
      ],
      rotation: -0.4,
      speed: 0.3,
      variant: "worker"
    },
    {
      action: "walk",
      path: [
        [24.2, -9.6],
        [24.2, 7.8],
        [28.8, 7.8],
        [28.8, -9.6]
      ],
      rotation: 0.1,
      speed: 0.48,
      variant: "customer"
    },
    {
      action: "pace",
      path: [
        [13.2, -24.8],
        [22.8, -24.8],
        [22.8, -20.2],
        [13.2, -20.2]
      ],
      rotation: Math.PI,
      speed: 0.36,
      variant: "rival"
    },
    {
      action: "scan",
      path: [
        [27.2, -26.2],
        [32.4, -26.2],
        [32.4, -22.4],
        [27.2, -22.4]
      ],
      rotation: -0.2,
      speed: 0.34,
      variant: "scout"
    },
    {
      action: "walk",
      path: [
        [-56.4, -31.2],
        [-50.8, -31.2],
        [-50.8, -25.4],
        [-56.4, -25.4]
      ],
      rotation: 0.25,
      speed: 0.44,
      variant: "customer"
    },
    {
      action: "scan",
      path: [
        [-52.8, -23.4],
        [-46.2, -23.4],
        [-46.2, -20.2],
        [-52.8, -20.2]
      ],
      rotation: -0.2,
      speed: 0.36,
      variant: "scout"
    },
    {
      action: "carry",
      path: [
        [-47.2, -34.8],
        [-42.8, -34.8],
        [-42.8, -30.8],
        [-47.2, -30.8]
      ],
      rotation: -0.5,
      speed: 0.3,
      variant: "worker"
    },
    {
      action: "pace",
      path: [
        [47.4, 21.8],
        [53.4, 21.8],
        [53.4, 25.8],
        [47.4, 25.8]
      ],
      rotation: Math.PI,
      speed: 0.3,
      variant: "rival"
    },
    {
      action: "walk",
      path: [
        [52.2, 30.2],
        [57.2, 30.2],
        [57.2, 36.8],
        [52.2, 36.8]
      ],
      rotation: 0.15,
      speed: 0.4,
      variant: "customer"
    },
    {
      action: "scan",
      path: [
        [43.6, 34.6],
        [48.6, 34.6],
        [48.6, 39.4],
        [43.6, 39.4]
      ],
      rotation: -0.25,
      speed: 0.34,
      variant: "scout"
    },
    {
      action: "carry",
      path: [
        [43.8, -23.4],
        [48.2, -23.4],
        [48.2, -18.2],
        [43.8, -18.2]
      ],
      rotation: -0.4,
      speed: 0.28,
      variant: "worker"
    },
    {
      action: "walk",
      path: [
        [-43.0, 21.2],
        [-38.0, 21.2],
        [-38.0, 27.0],
        [-43.0, 27.0]
      ],
      rotation: 0.35,
      speed: 0.38,
      variant: "customer"
    }
  ];

  npcs.slice(0, maxNpcs).forEach((npc, index) => {
    const [startX, startZ] = npc.path[0];
    const character = createNpcCharacter(npc.variant, quality);
    character.position.set(startX, 0, startZ);
    character.rotation.y = npc.rotation;
    character.userData.action = npc.action;
    character.userData.baseY = character.position.y;
    character.userData.pathOffset = index * 1.35;
    character.userData.phase = startX * 0.4 + startZ * 0.7;
    character.userData.walkPath = npc.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    character.userData.walkSpeed = npc.speed;
    group.add(character);
  });

  if (quality === "low") {
    return group;
  }

  const metalMaterial = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.5, metalness: 0.38 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: "#bfdbfe", roughness: 0.05, transparent: true, opacity: 0.34, transmission: 0.18 });
  const busShelter = new THREE.Group();
  busShelter.position.set(-10.55, 0, -1.95);
  busShelter.rotation.y = Math.PI / 2;
  const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.74), metalMaterial);
  shelterRoof.position.set(0, 2.12, 0);
  shelterRoof.castShadow = true;
  busShelter.add(markModelPolishDetail(shelterRoof, "street-bus-shelter-roof"));
  const shelterBack = new THREE.Mesh(new THREE.BoxGeometry(2.12, 1.52, 0.045), glassMaterial);
  shelterBack.position.set(0, 1.22, 0.34);
  busShelter.add(markModelPolishDetail(shelterBack, "street-bus-shelter-glass"));
  for (const x of [-1.02, 1.02]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.15, 10), metalMaterial);
    post.position.set(x, 1.05, 0.34);
    post.castShadow = true;
    busShelter.add(markModelPolishDetail(post, "street-bus-shelter-post"));
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 0.34), new THREE.MeshStandardMaterial({ color: "#7c2d12", roughness: 0.62, metalness: 0.04 }));
  bench.position.set(0, 0.55, 0.05);
  bench.castShadow = true;
  busShelter.add(markModelPolishDetail(bench, "street-bus-shelter-bench"));
  for (const x of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), metalMaterial);
    leg.position.set(x, 0.28, 0.05);
    busShelter.add(leg);
  }
  const routeMap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.018), new THREE.MeshBasicMaterial({ color: "#e0f2fe", transparent: true, opacity: 0.9 }));
  routeMap.position.set(-0.58, 1.28, 0.305);
  busShelter.add(markModelPolishDetail(routeMap, "street-bus-route-map"));
  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.38 - lineIndex * 0.045, 0.025, 0.012), new THREE.MeshBasicMaterial({ color: lineIndex % 2 === 0 ? "#0ea5e9" : "#f97316" }));
    line.position.set(-0.58, 1.43 - lineIndex * 0.12, 0.292);
    busShelter.add(markModelPolishDetail(line, "street-bus-route-line"));
  }
  const busSign = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.035), new THREE.MeshBasicMaterial({ color: "#facc15" }));
  busSign.position.set(0.72, 1.78, 0.3);
  busShelter.add(markModelPolishDetail(busSign, "street-bus-stop-sign"));
  group.add(busShelter);

  const utilityMaterial = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.68, metalness: 0.12 });
  const utilityBoxes: Array<[number, number, string]> = [
    [5.8, 4.6, "#0ea5e9"],
    [6.25, 4.62, "#f97316"],
    [-6.7, 2.75, "#22c55e"],
    [-28.6, 16.3, "#f97316"],
    [24.1, 10.2, "#0ea5e9"],
    [26.0, -19.4, "#e879f9"]
  ];
  for (const [x, z, color] of quality === "medium" ? utilityBoxes.slice(0, 4) : utilityBoxes) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 0.34), utilityMaterial);
    box.position.set(x, 0.36, z);
    box.castShadow = true;
    box.receiveShadow = true;
    addModelPolishDetail(group, box, "street-utility-box");
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.14, 0.018), new THREE.MeshBasicMaterial({ color }));
    label.position.set(x, 0.53, z - 0.18);
    addModelPolishDetail(group, label, "street-utility-label");
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), metalMaterial);
    hinge.position.set(x - 0.165, 0.36, z - 0.19);
    addModelPolishDetail(group, hinge, "street-utility-hinge");
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.018), new THREE.MeshBasicMaterial({ color: "#e2e8f0", transparent: true, opacity: 0.74 }));
    handle.position.set(x + 0.08, 0.36, z - 0.19);
    addModelPolishDetail(group, handle, "street-utility-handle");
  }

  const planterMaterial = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.72, metalness: 0.03 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: "#15803d", roughness: 0.74 });
  const planterRimMaterial = new THREE.MeshStandardMaterial({ color: "#451a03", roughness: 0.68, metalness: 0.04 });
  const planterPositions: Array<[number, number]> = [
    [-4.1, -3.75],
    [3.35, -4.55],
    [8.1, 1.35],
    [-28.9, -4.35],
    [-24.8, 15.25],
    [24.0, -4.8],
    [12.4, -19.3],
    [28.8, -20.0]
  ];
  for (const [x, z] of quality === "medium" ? planterPositions.slice(0, 6) : planterPositions) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.34), planterMaterial);
    planter.position.set(x, 0.13, z);
    planter.castShadow = true;
    addModelPolishDetail(group, planter, "street-planter-box");
    for (const offsetZ of [-0.18, 0.18]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.045, 0.045), planterRimMaterial);
      rim.position.set(x, 0.285, z + offsetZ);
      addModelPolishDetail(group, rim, "street-planter-rim");
    }
    for (const offsetX of [-0.385, 0.385]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.34), planterRimMaterial);
      rim.position.set(x + offsetX, 0.285, z);
      addModelPolishDetail(group, rim, "street-planter-rim");
    }
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 5), leafMaterial);
      leaf.position.set(x - 0.24 + i * 0.12, 0.42, z + (i % 2 === 0 ? 0.03 : -0.04));
      leaf.rotation.z = -0.28 + i * 0.14;
      addModelPolishDetail(group, leaf, "street-planter-leaf");
    }
  }

  const bollardPositions: Array<[number, number]> = [
    [-3.25, -3.35],
    [-2.85, -3.35],
    [2.85, 3.35],
    [3.25, 3.35],
    [8.55, -0.78],
    [-28.9, -0.25],
    [-28.9, 8.4],
    [24.0, -7.4],
    [24.0, 5.2],
    [7.0, -20.0],
    [18.0, -20.0]
  ];
  for (const [x, z] of quality === "medium" ? bollardPositions.slice(0, 8) : bollardPositions) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.54, 12), metalMaterial);
    bollard.position.set(x, 0.27, z);
    bollard.castShadow = true;
    addModelPolishDetail(group, bollard, "street-bollard-post");
    const reflectiveBand = new THREE.Mesh(new THREE.CylinderGeometry(0.059, 0.059, 0.04, 12), new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.84 }));
    reflectiveBand.position.set(x, 0.39, z);
    addModelPolishDetail(group, reflectiveBand, "street-bollard-reflective-band");
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.066, 12, 8), new THREE.MeshBasicMaterial({ color: "#facc15" }));
    cap.position.set(x, 0.56, z);
    addModelPolishDetail(group, cap, "street-bollard-cap");
  }

  const lampMaterial = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.5, metalness: 0.35 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.62 });
  const lampPositions = [
    new THREE.Vector3(-7.2, 0, 0.9),
    new THREE.Vector3(5.4, 0, -1.0),
    new THREE.Vector3(-1.1, 0, -6.5),
    new THREE.Vector3(-28.9, 0, -4.8),
    new THREE.Vector3(-28.9, 0, 14.4),
    new THREE.Vector3(24.0, 0, -9.4),
    new THREE.Vector3(24.0, 0, 11.2),
    new THREE.Vector3(8.4, 0, -20.0),
    new THREE.Vector3(29.6, 0, -20.1)
  ];
  for (const position of quality === "medium" ? lampPositions.slice(0, 6) : lampPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.4, 10), lampMaterial);
    pole.position.copy(position).add(new THREE.Vector3(0, 1.7, 0));
    pole.castShadow = true;
    addModelPolishDetail(group, pole, "street-lamp-pole");

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), glowMaterial);
    head.position.copy(position).add(new THREE.Vector3(0, 3.45, 0));
    addModelPolishDetail(group, head, "street-lamp-globe");
    const lampRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.009, 8, 24), lampMaterial);
    lampRing.position.copy(head.position);
    lampRing.rotation.x = Math.PI / 2;
    addModelPolishDetail(group, lampRing, "street-lamp-glass-ring");

    if (enableLocalLights) {
      const light = new THREE.PointLight("#fde68a", 9, 8, 1.6);
      light.position.copy(head.position);
      group.add(light);
    }
  }

  if (quality === "high") {
    const newspaperMaterial = new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.48, metalness: 0.1 });
    for (const [x, z, color] of [
      [-6.1, -3.4, "#f8fafc"],
      [7.7, 2.2, "#facc15"],
      [24.9, -6.5, "#fb7185"],
      [-29.8, 9.3, "#67e8f9"]
    ] as Array<[number, number, string]>) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.28), newspaperMaterial);
      stand.position.set(x, 0.24, z);
      stand.castShadow = true;
      addModelPolishDetail(group, stand, "street-newspaper-stand");
      const placard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.018), new THREE.MeshBasicMaterial({ color }));
      placard.position.set(x, 0.36, z - 0.15);
      addModelPolishDetail(group, placard, "street-newspaper-placard");
    }

    const rackMaterial = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.38, metalness: 0.42 });
    for (const [x, z] of [[-5.35, 2.2], [5.7, -4.6], [23.4, 8.8]] as Array<[number, number]>) {
      const rack = new THREE.Group();
      rack.position.set(x, 0.18, z);
      for (let loop = 0; loop < 3; loop += 1) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 20), rackMaterial);
        hoop.position.set((loop - 1) * 0.22, 0.2, 0);
        hoop.rotation.x = Math.PI / 2;
        rack.add(markModelPolishDetail(hoop, "street-bike-rack-hoop"));
      }
      group.add(rack);
    }
  }

  return group;
}
