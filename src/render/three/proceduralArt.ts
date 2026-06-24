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

function addFace(group: THREE.Group, y: number, z: number): void {
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#111827" });
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMaterial);
    eye.position.set(x, y, z);
    group.add(eye);
  }
}

export function createNpcCharacter(variant: "customer" | "rival" | "worker" | "scout"): THREE.Group {
  const palette = {
    customer: { jacket: "#0f766e", shirt: "#e0f2fe", pants: "#1e293b", accent: "#2dd4bf", skin: "#c08457" },
    rival: { jacket: "#991b1b", shirt: "#111827", pants: "#020617", accent: "#fb7185", skin: "#b45309" },
    worker: { jacket: "#f97316", shirt: "#fef3c7", pants: "#334155", accent: "#facc15", skin: "#d6a06f" },
    scout: { jacket: "#4338ca", shirt: "#dbeafe", pants: "#111827", accent: "#93c5fd", skin: "#9a6a4f" }
  }[variant];

  const group = new THREE.Group();
  group.userData.floatSpeed = variant === "rival" ? 1.4 : 1;
  group.userData.floatAmount = variant === "worker" ? 0.018 : 0.012;

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.35 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  const legsMaterial = new THREE.MeshStandardMaterial({ color: palette.pants, roughness: 0.78 });
  for (const x of [-0.11, 0.11]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.58, 8), legsMaterial);
    leg.position.set(x, 0.32, 0);
    leg.rotation.z = x > 0 ? -0.08 : 0.08;
    leg.castShadow = true;
    group.add(leg);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.24), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.62 }));
    shoe.position.set(x, 0.055, -0.045);
    shoe.castShadow = true;
    group.add(shoe);
  }

  const body = capsuleLike(0.22, 0.48, palette.jacket, 0.62);
  body.position.set(0, 0.84, 0);
  body.scale.x = 0.92;
  group.add(body);

  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.035), new THREE.MeshStandardMaterial({ color: palette.shirt, roughness: 0.66 }));
  shirt.position.set(0, 0.82, -0.205);
  group.add(shirt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.58 }));
  head.position.set(0, 1.34, -0.005);
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.185, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    new THREE.MeshStandardMaterial({ color: variant === "worker" ? "#78350f" : "#111827", roughness: 0.7 })
  );
  hair.position.set(0, 1.41, -0.005);
  group.add(hair);
  addFace(group, 1.345, -0.17);

  const armMaterial = new THREE.MeshStandardMaterial({ color: palette.jacket, roughness: 0.68 });
  for (const x of [-0.31, 0.31]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 8), armMaterial);
    arm.position.set(x, 0.86, -0.02);
    arm.rotation.z = x > 0 ? -0.28 : 0.28;
    arm.castShadow = true;
    group.add(arm);
  }

  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.025), new THREE.MeshBasicMaterial({ color: palette.accent }));
  badge.position.set(0.08, 1.0, -0.215);
  group.add(badge);

  if (variant === "rival") {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.26), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.45 }));
    cap.position.set(0, 1.51, -0.04);
    group.add(cap);

    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.011, 8, 20), new THREE.MeshBasicMaterial({ color: "#facc15" }));
    chain.position.set(0, 1.15, -0.19);
    chain.rotation.x = Math.PI / 2;
    group.add(chain);
  }

  if (variant === "worker") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.22), new THREE.MeshStandardMaterial({ color: "#92400e", roughness: 0.8 }));
    crate.position.set(-0.42, 0.78, -0.04);
    crate.rotation.z = 0.1;
    crate.castShadow = true;
    group.add(crate);
  }

  if (variant === "scout") {
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.025), new THREE.MeshBasicMaterial({ color: "#38bdf8" }));
    tablet.position.set(0.34, 0.93, -0.16);
    tablet.rotation.z = -0.12;
    group.add(tablet);
  }

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

  const npcs: Array<{ variant: "customer" | "rival" | "worker" | "scout"; x: number; z: number; rotation: number }> = [
    { variant: "customer", x: -3.2, z: -1.8, rotation: 2.15 },
    { variant: "worker", x: 7.0, z: 1.6, rotation: -0.7 },
    { variant: "rival", x: 1.1, z: 2.9, rotation: Math.PI },
    { variant: "scout", x: -6.3, z: -4.6, rotation: 0.15 }
  ];

  for (const npc of npcs) {
    const character = createNpcCharacter(npc.variant);
    character.position.set(npc.x, 0, npc.z);
    character.rotation.y = npc.rotation;
    character.userData.baseY = character.position.y;
    character.userData.phase = npc.x * 0.4 + npc.z * 0.7;
    group.add(character);
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
