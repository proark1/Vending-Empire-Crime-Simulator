import * as THREE from "three";

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

export function createAsphaltMaterial(): THREE.MeshStandardMaterial {
  const map = textureFromCanvas(
    256,
    (context, size) => {
      context.fillStyle = "#202936";
      context.fillRect(0, 0, size, size);
      jitter(context, size, 1500, 0.16);
      context.strokeStyle = "rgba(226, 232, 240, 0.18)";
      context.lineWidth = 2;
      for (let x = 20; x < size; x += 64) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + 20, size);
        context.stroke();
      }
    },
    8
  );

  return new THREE.MeshStandardMaterial({ map, color: "#2f3a47", roughness: 0.92, metalness: 0.02 });
}

export function createRoadMaterial(): THREE.MeshStandardMaterial {
  const map = textureFromCanvas(
    256,
    (context, size) => {
      context.fillStyle = "#171d27";
      context.fillRect(0, 0, size, size);
      jitter(context, size, 1900, 0.19);
      context.fillStyle = "rgba(248, 250, 252, 0.18)";
      for (let y = 120; y < size; y += 128) {
        for (let x = 18; x < size; x += 72) {
          context.fillRect(x, y, 36, 4);
        }
      }
    },
    6
  );

  return new THREE.MeshStandardMaterial({ map, color: "#222a35", roughness: 0.96 });
}

export function createSidewalkMaterial(): THREE.MeshStandardMaterial {
  const map = textureFromCanvas(
    256,
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
      jitter(context, size, 800, 0.12);
    },
    5
  );

  return new THREE.MeshStandardMaterial({ map, color: "#8a94a5", roughness: 0.88 });
}

function createWallMaterial(base: string, mortar: string): THREE.MeshStandardMaterial {
  const map = textureFromCanvas(
    256,
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
      jitter(context, size, 550, 0.12);
    },
    2
  );

  const bumpMap = textureFromCanvas(
    256,
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
      jitter(context, size, 420, 0.22);
    },
    2
  );

  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.035, color: "#ffffff", roughness: 0.9, metalness: 0.02 });
}

function createSignTexture(text: string, background: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = accent;
    context.lineWidth = 8;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
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

function addWindows(group: THREE.Group, width: number, height: number, depth: number, buildingHeight: number, style: BuildingStyle): void {
  const frameMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.48, metalness: 0.12 });
  const sillMaterial = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.7, metalness: 0.05 });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: style === "arcade" ? "#f0abfc" : "#a7f3d0",
    emissive: style === "arcade" ? "#86198f" : "#0f766e",
    emissiveIntensity: style === "arcade" ? 0.7 : 0.25,
    roughness: 0.18,
    metalness: 0.04
  });

  const cols = Math.max(2, Math.floor(width / 1.3));
  const rows = Math.max(1, Math.floor(buildingHeight / 1.25));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col) % 3 === 0 && style !== "arcade") {
        continue;
      }

      const x = -width / 2 + 0.55 + col * ((width - 1.1) / Math.max(1, cols - 1));
      const y = 0.95 + row * 0.82;
      if (y > height - 0.4) {
        continue;
      }
      addPlane(group, 0.48, 0.42, frameMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.012), 0);
      addPlane(group, 0.38, 0.32, windowMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.011), 0);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.045, 0.12), sillMaterial);
      sill.position.set(x, y - 0.21, -depth / 2 - 0.045);
      sill.castShadow = true;
      group.add(sill);
    }
  }
}

function addFacadeDetails(group: THREE.Group, width: number, depth: number, height: number, style: BuildingStyle, accent: string): void {
  const frontZ = -depth / 2;
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.55, metalness: 0.12 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.58, metalness: 0.08 });
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.82, metalness: 0.02 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: style === "arcade" ? "#f5d0fe" : "#bfdbfe",
    emissive: style === "arcade" ? "#86198f" : "#075985",
    emissiveIntensity: style === "arcade" ? 0.5 : 0.16,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.64,
    transmission: 0.12
  });

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

  const storefrontY = 0.82;
  const doorX = -Math.min(width * 0.28, 1.1);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.32, 0.08), darkMaterial);
  doorFrame.position.set(doorX, storefrontY, frontZ - 0.055);
  doorFrame.castShadow = true;
  group.add(doorFrame);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.12, 0.035), glassMaterial);
  door.position.set(doorX, storefrontY, frontZ - 0.105);
  group.add(door);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
  handle.position.set(doorX + 0.17, storefrontY, frontZ - 0.13);
  handle.rotation.x = Math.PI / 2;
  group.add(handle);

  const displayWidth = Math.min(width * 0.44, 1.9);
  const displayX = Math.min(width * 0.18, 1.0);
  const displayFrame = new THREE.Mesh(new THREE.BoxGeometry(displayWidth + 0.18, 0.94, 0.075), darkMaterial);
  displayFrame.position.set(displayX, 0.9, frontZ - 0.054);
  displayFrame.castShadow = true;
  group.add(displayFrame);

  const displayGlass = new THREE.Mesh(new THREE.BoxGeometry(displayWidth, 0.76, 0.034), glassMaterial);
  displayGlass.position.set(displayX, 0.9, frontZ - 0.104);
  group.add(displayGlass);

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
  vent.position.set(-width / 2 + 0.55, Math.min(height - 0.45, 1.95), frontZ - 0.075);
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
  group.add(hvac);

  const fan = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 8, 26), darkMaterial);
  fan.position.set(hvac.position.x, hvac.position.y + 0.01, hvac.position.z - 0.3);
  fan.rotation.x = Math.PI / 2;
  group.add(fan);
}

export function createBuilding(width: number, depth: number, height: number, style: BuildingStyle, signText: string): THREE.Group {
  const group = new THREE.Group();
  const materialByStyle: Record<BuildingStyle, THREE.MeshStandardMaterial> = {
    garage: createWallMaterial("#475569", "rgba(15, 23, 42, 0.26)"),
    supplier: createWallMaterial("#6b3f17", "rgba(15, 23, 42, 0.28)"),
    laundromat: createWallMaterial("#0f766e", "rgba(15, 23, 42, 0.24)"),
    gym: createWallMaterial("#7c2d12", "rgba(15, 23, 42, 0.26)"),
    arcade: createWallMaterial("#4c1d95", "rgba(15, 23, 42, 0.2)"),
    transit: createWallMaterial("#0e7490", "rgba(15, 23, 42, 0.24)"),
    rival: createWallMaterial("#7f1d1d", "rgba(15, 23, 42, 0.32)")
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

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materialByStyle[style]);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  addFacadeDetails(group, width, depth, height, style, signAccent[style]);
  addWindows(group, width, height, depth, height, style);

  const signMaterial = new THREE.MeshStandardMaterial({
    map: createSignTexture(signText, "rgba(15, 23, 42, 0.96)", signAccent[style]),
    emissive: signAccent[style],
    emissiveIntensity: 0.22,
    transparent: true,
    roughness: 0.35
  });
  addPlane(group, Math.min(width * 0.72, 3.8), 0.58, signMaterial, new THREE.Vector3(0, Math.min(height - 0.55, 2.2), -depth / 2 - 0.025), 0);

  const awningMaterial = new THREE.MeshStandardMaterial({ color: signAccent[style], roughness: 0.62, metalness: 0.08 });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(Math.min(width * 0.55, 3.2), 0.12, 0.48), awningMaterial);
  awning.position.set(0, Math.min(height - 0.95, 1.55), -depth / 2 - 0.22);
  awning.castShadow = true;
  group.add(awning);

  return group;
}

export function createSkyDome(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#06111f");
    gradient.addColorStop(0.45, "#142b43");
    gradient.addColorStop(1, "#36506b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(248, 250, 252, 0.8)";
    for (let i = 0; i < 90; i += 1) {
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
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(62, 48, 24),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
  );
  sky.position.y = 6;
  return sky;
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

function capsuleLike(radius: number, height: number, color: string, roughness = 0.7): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, height, 8, 12),
    new THREE.MeshStandardMaterial({ color, roughness })
  );
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
}

type NpcVariant = "customer" | "rival" | "worker" | "scout";
type StreetNpcAction = "walk" | "carry" | "pace" | "scan";

interface NpcLimbRig {
  lower: THREE.Group;
  upper: THREE.Group;
  wrist: THREE.Group;
}

function createJoint(radius: number, material: THREE.Material): THREE.Mesh {
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), material);
  joint.castShadow = true;
  joint.receiveShadow = true;
  return joint;
}

function createLimbSegment(length: number, topRadius: number, bottomRadius: number, material: THREE.Material): THREE.Mesh {
  const segment = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, length, 10), material);
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
  wrist.add(shoe);
  lower.add(wrist);

  upper.add(lower);
  return { lower, upper, wrist };
}

export function createNpcCharacter(variant: NpcVariant): THREE.Group {
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

  const body = capsuleLike(0.22, 0.48, palette.jacket, 0.62);
  body.position.set(0, 0.84, 0);
  body.scale.x = 0.92;
  group.add(body);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.22), pantsMaterial);
  hips.position.set(0, 0.58, -0.005);
  hips.castShadow = true;
  group.add(hips);

  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.24), jacketMaterial);
  shoulders.position.set(0, 1.05, -0.01);
  shoulders.castShadow = true;
  group.add(shoulders);

  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.035), shirtMaterial);
  shirt.position.set(0, 0.82, -0.205);
  group.add(shirt);

  const collarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.025), new THREE.MeshBasicMaterial({ color: palette.shirt }));
  collarLeft.position.set(-0.055, 1.1, -0.205);
  collarLeft.rotation.z = -0.42;
  group.add(collarLeft);
  const collarRight = collarLeft.clone();
  collarRight.position.x = 0.055;
  collarRight.rotation.z = 0.42;
  group.add(collarRight);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.045, 0.035), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.5, metalness: 0.08 }));
  belt.position.set(0, 0.57, -0.19);
  group.add(belt);

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
  group.add(badge);

  const carryMount = new THREE.Group();
  carryMount.position.set(0, 0.82, -0.29);
  group.add(carryMount);

  if (variant === "rival") {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.26), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.45 }));
    cap.position.set(0, 0.29, -0.035);
    headPivot.add(cap);

    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.011, 8, 20), new THREE.MeshBasicMaterial({ color: "#facc15" }));
    chain.position.set(0, 1.15, -0.19);
    chain.rotation.x = Math.PI / 2;
    group.add(chain);

    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.015), new THREE.MeshBasicMaterial({ color: "#020617" }));
    phone.position.set(0.02, -0.015, -0.07);
    phone.rotation.x = 0.18;
    leftArm.wrist.add(phone);
  }

  if (variant === "worker") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.22), new THREE.MeshStandardMaterial({ color: "#92400e", roughness: 0.8 }));
    crate.position.set(0, 0, 0);
    crate.rotation.z = 0.04;
    crate.castShadow = true;
    carryMount.add(crate);

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.035, 0.235), new THREE.MeshStandardMaterial({ color: "#451a03", roughness: 0.7 }));
    strap.position.y = 0.015;
    carryMount.add(strap);
  }

  if (variant === "scout") {
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.025), new THREE.MeshBasicMaterial({ color: "#38bdf8" }));
    tablet.position.set(0.025, -0.015, -0.08);
    tablet.rotation.set(0.35, -0.08, -0.12);
    rightArm.wrist.add(tablet);
  }

  if (variant === "customer") {
    const bag = new THREE.Group();
    const bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.075), new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.72 }));
    bagBody.position.y = -0.12;
    bagBody.castShadow = true;
    bag.add(bagBody);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 6, 18, Math.PI), new THREE.MeshStandardMaterial({ color: "#e0f2fe", roughness: 0.52 }));
    handle.position.y = -0.025;
    handle.rotation.z = Math.PI;
    bag.add(handle);
    bag.position.set(-0.015, -0.03, 0.025);
    leftArm.wrist.add(bag);
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

export function createAtmosphere(): THREE.Points {
  const count = 160;
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

export function createStreetProps(): THREE.Group {
  const group = new THREE.Group();
  const props: Array<{ kind: "poster" | "trash" | "pallet" | "graffiti"; x: number; z: number; y: number; w: number; h: number }> = [
    { kind: "poster", x: -6.9, z: -6.6, y: 1.1, w: 0.85, h: 1.15 },
    { kind: "poster", x: 6.4, z: 7.0, y: 1.0, w: 0.85, h: 1.15 },
    { kind: "trash", x: -2.8, z: 2.2, y: 0.38, w: 0.9, h: 0.65 },
    { kind: "trash", x: 7.3, z: -4.2, y: 0.38, w: 0.85, h: 0.6 },
    { kind: "pallet", x: 7.0, z: 5.6, y: 0.5, w: 1.2, h: 0.9 },
    { kind: "graffiti", x: 1.5, z: 3.08, y: 1.25, w: 1.4, h: 0.9 }
  ];

  for (const prop of props) {
    const sprite = createBillboardSprite(prop.kind, prop.w, prop.h);
    sprite.position.set(prop.x, prop.y, prop.z);
    group.add(sprite);
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
    }
  ];

  npcs.forEach((npc, index) => {
    const [startX, startZ] = npc.path[0];
    const character = createNpcCharacter(npc.variant);
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

  const metalMaterial = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.5, metalness: 0.38 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: "#bfdbfe", roughness: 0.05, transparent: true, opacity: 0.34, transmission: 0.18 });
  const busShelter = new THREE.Group();
  busShelter.position.set(-10.55, 0, -1.95);
  busShelter.rotation.y = Math.PI / 2;
  const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.74), metalMaterial);
  shelterRoof.position.set(0, 2.12, 0);
  shelterRoof.castShadow = true;
  busShelter.add(shelterRoof);
  const shelterBack = new THREE.Mesh(new THREE.BoxGeometry(2.12, 1.52, 0.045), glassMaterial);
  shelterBack.position.set(0, 1.22, 0.34);
  busShelter.add(shelterBack);
  for (const x of [-1.02, 1.02]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.15, 10), metalMaterial);
    post.position.set(x, 1.05, 0.34);
    post.castShadow = true;
    busShelter.add(post);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 0.34), new THREE.MeshStandardMaterial({ color: "#7c2d12", roughness: 0.62, metalness: 0.04 }));
  bench.position.set(0, 0.55, 0.05);
  bench.castShadow = true;
  busShelter.add(bench);
  for (const x of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), metalMaterial);
    leg.position.set(x, 0.28, 0.05);
    busShelter.add(leg);
  }
  group.add(busShelter);

  const utilityMaterial = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.68, metalness: 0.12 });
  for (const [x, z, color] of [
    [5.8, 4.6, "#0ea5e9"],
    [6.25, 4.62, "#f97316"],
    [-6.7, 2.75, "#22c55e"]
  ] as Array<[number, number, string]>) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 0.34), utilityMaterial);
    box.position.set(x, 0.36, z);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.14, 0.018), new THREE.MeshBasicMaterial({ color }));
    label.position.set(x, 0.53, z - 0.18);
    group.add(label);
  }

  const planterMaterial = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.72, metalness: 0.03 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: "#15803d", roughness: 0.74 });
  for (const [x, z] of [
    [-4.1, -3.75],
    [3.35, -4.55],
    [8.1, 1.35]
  ] as Array<[number, number]>) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.34), planterMaterial);
    planter.position.set(x, 0.13, z);
    planter.castShadow = true;
    group.add(planter);
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 5), leafMaterial);
      leaf.position.set(x - 0.24 + i * 0.12, 0.42, z + (i % 2 === 0 ? 0.03 : -0.04));
      leaf.rotation.z = -0.28 + i * 0.14;
      group.add(leaf);
    }
  }

  for (const [x, z] of [
    [-3.25, -3.35],
    [-2.85, -3.35],
    [2.85, 3.35],
    [3.25, 3.35],
    [8.55, -0.78]
  ] as Array<[number, number]>) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.54, 12), metalMaterial);
    bollard.position.set(x, 0.27, z);
    bollard.castShadow = true;
    group.add(bollard);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.066, 12, 8), new THREE.MeshBasicMaterial({ color: "#facc15" }));
    cap.position.set(x, 0.56, z);
    group.add(cap);
  }

  const lampMaterial = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.5, metalness: 0.35 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.62 });
  for (const position of [
    new THREE.Vector3(-7.2, 0, 0.9),
    new THREE.Vector3(5.4, 0, -1.0),
    new THREE.Vector3(-1.1, 0, -6.5)
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.4, 10), lampMaterial);
    pole.position.copy(position).add(new THREE.Vector3(0, 1.7, 0));
    pole.castShadow = true;
    group.add(pole);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), glowMaterial);
    head.position.copy(position).add(new THREE.Vector3(0, 3.45, 0));
    group.add(head);

    const light = new THREE.PointLight("#fde68a", 9, 8, 1.6);
    light.position.copy(head.position);
    group.add(light);
  }

  return group;
}
