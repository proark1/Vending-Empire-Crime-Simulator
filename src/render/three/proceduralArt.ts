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
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x, y + brickHeight);
          context.stroke();
        }
      }
      jitter(context, size, 550, 0.12);
    },
    2
  );

  return new THREE.MeshStandardMaterial({ map, color: "#ffffff", roughness: 0.84 });
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
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: style === "arcade" ? "#f0abfc" : "#a7f3d0",
    emissive: style === "arcade" ? "#86198f" : "#0f766e",
    emissiveIntensity: style === "arcade" ? 0.7 : 0.25,
    roughness: 0.28
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
      addPlane(group, 0.38, 0.32, windowMaterial, new THREE.Vector3(x, y, -depth / 2 - 0.011), 0);
    }
  }
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

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materialByStyle[style]);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  addWindows(group, width, height, depth, height, style);

  const signAccent: Record<BuildingStyle, string> = {
    garage: "#38bdf8",
    supplier: "#f59e0b",
    laundromat: "#5eead4",
    gym: "#fb923c",
    arcade: "#e879f9",
    transit: "#67e8f9",
    rival: "#fb7185"
  };
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

function createSpriteTexture(kind: "poster" | "trash" | "person" | "pallet" | "graffiti"): THREE.CanvasTexture {
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

    if (kind === "person") {
      context.fillStyle = "rgba(15, 23, 42, 0.86)";
      context.beginPath();
      context.arc(128, 64, 24, 0, Math.PI * 2);
      context.fill();
      context.fillRect(105, 88, 46, 88);
      context.fillRect(92, 176, 28, 54);
      context.fillRect(136, 176, 28, 54);
      context.fillStyle = "rgba(45, 212, 191, 0.65)";
      context.fillRect(110, 112, 36, 10);
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

function createBillboardSprite(kind: "poster" | "trash" | "person" | "pallet" | "graffiti", width: number, height: number): THREE.Sprite {
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

export function createStreetProps(): THREE.Group {
  const group = new THREE.Group();
  const props: Array<{ kind: "poster" | "trash" | "person" | "pallet" | "graffiti"; x: number; z: number; y: number; w: number; h: number }> = [
    { kind: "poster", x: -6.9, z: -6.6, y: 1.1, w: 0.85, h: 1.15 },
    { kind: "poster", x: 6.4, z: 7.0, y: 1.0, w: 0.85, h: 1.15 },
    { kind: "trash", x: -2.8, z: 2.2, y: 0.38, w: 0.9, h: 0.65 },
    { kind: "trash", x: 7.3, z: -4.2, y: 0.38, w: 0.85, h: 0.6 },
    { kind: "person", x: -3.2, z: -1.8, y: 0.95, w: 0.62, h: 1.55 },
    { kind: "person", x: 6.6, z: 1.6, y: 0.95, w: 0.62, h: 1.55 },
    { kind: "pallet", x: 7.0, z: 5.6, y: 0.5, w: 1.2, h: 0.9 },
    { kind: "graffiti", x: 1.5, z: 3.08, y: 1.25, w: 1.4, h: 0.9 }
  ];

  for (const prop of props) {
    const sprite = createBillboardSprite(prop.kind, prop.w, prop.h);
    sprite.position.set(prop.x, prop.y, prop.z);
    group.add(sprite);
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
