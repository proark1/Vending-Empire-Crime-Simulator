import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;
const seedAdminName = process.env.ADMIN_NAME ?? "proark";
const seedAdminPin = process.env.ADMIN_PIN ?? "4924";
const sessionDays = Number(process.env.SESSION_DAYS ?? 14);
const jsonLimitBytes = Number(process.env.JSON_LIMIT_BYTES ?? 8 * 1024 * 1024);

let pool = null;
let databaseReady = null;

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashPin(pin, salt) {
  return hashValue(`${salt}:${pin}`);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function validateGameCredentials(body) {
  const name = normalizeName(body?.name);
  const pin = String(body?.pin ?? "").trim();

  if (name.length < 2 || name.length > 36) {
    return { error: "Name must be 2-36 characters." };
  }

  if (!/^[\w .-]+$/.test(name)) {
    return { error: "Name can use letters, numbers, spaces, dots, dashes, and underscores." };
  }

  if (!/^\d{4,12}$/.test(pin)) {
    return { error: "PIN must be 4-12 digits." };
  }

  return { name, nameKey: name.toLowerCase(), pin };
}

function sessionExpiry() {
  return new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
}

function createPinRecord(pin) {
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    hash: hashPin(pin, salt)
  };
}

function getPool() {
  if (!databaseUrl) {
    throw Object.assign(new Error("DATABASE_URL is not configured."), { statusCode: 503 });
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function ensureDatabase() {
  if (!databaseReady) {
    databaseReady = (async () => {
      const db = getPool();
      await db.query(`
        CREATE TABLE IF NOT EXISTS player_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          name_key TEXT UNIQUE NOT NULL,
          pin_salt TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_login_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS player_sessions (
          token_hash TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS player_sessions_profile_id_idx ON player_sessions(profile_id);
        CREATE INDEX IF NOT EXISTS player_sessions_expires_at_idx ON player_sessions(expires_at);

        CREATE TABLE IF NOT EXISTS game_saves (
          profile_id TEXT PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
          state JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS admin_users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          name_key TEXT UNIQUE NOT NULL,
          pin_salt TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin',
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS admin_sessions (
          token_hash TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions(expires_at);

        CREATE TABLE IF NOT EXISTS map_layouts (
          id TEXT PRIMARY KEY,
          layout JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by TEXT
        );
      `);
      await ensureSeededAdminUser(db);
    })();
  }

  return databaseReady;
}

async function ensureSeededAdminUser(db) {
  const name = normalizeName(seedAdminName);
  const pin = String(seedAdminPin).trim();
  if (!name || !pin) {
    return;
  }

  const nameKey = name.toLowerCase();
  const adminPinRecord = createPinRecord(pin);
  await db.query(
    `INSERT INTO admin_users (id, name, name_key, pin_salt, pin_hash, role, active)
     VALUES ($1, $2, $3, $4, $5, 'admin', true)
     ON CONFLICT (name_key)
     DO UPDATE SET
       name = EXCLUDED.name,
       pin_salt = EXCLUDED.pin_salt,
       pin_hash = EXCLUDED.pin_hash,
       role = 'admin',
       active = true,
       updated_at = now()`,
    [randomUUID(), name, nameKey, adminPinRecord.salt, adminPinRecord.hash]
  );

  const playerPinRecord = createPinRecord(pin);
  await db.query(
    `INSERT INTO player_profiles (id, name, name_key, pin_salt, pin_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name_key)
     DO UPDATE SET
       name = EXCLUDED.name,
       pin_salt = EXCLUDED.pin_salt,
       pin_hash = EXCLUDED.pin_hash,
       updated_at = now()`,
    [randomUUID(), name, nameKey, playerPinRecord.salt, playerPinRecord.hash]
  );
}

function jsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function emptyResponse(response, statusCode = 204) {
  response.writeHead(statusCode, { "cache-control": "no-store" });
  response.end();
}

async function readJson(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > jsonLimitBytes) {
      throw Object.assign(new Error("Payload too large."), { statusCode: 413 });
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { statusCode: 400 });
  }
}

function bearerToken(request) {
  const header = request.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function createPlayerSession(profileId) {
  const token = randomBytes(32).toString("base64url");
  await getPool().query(
    "INSERT INTO player_sessions (token_hash, profile_id, expires_at) VALUES ($1, $2, $3)",
    [hashValue(token), profileId, sessionExpiry()]
  );
  return token;
}

async function requirePlayer(request, bodyToken = null) {
  const token = bearerToken(request) ?? bodyToken;
  if (!token) {
    throw Object.assign(new Error("Missing session token."), { statusCode: 401 });
  }

  await ensureDatabase();
  const result = await getPool().query(
    `SELECT p.id, p.name
       FROM player_sessions s
       JOIN player_profiles p ON p.id = s.profile_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashValue(token)]
  );

  if (!result.rows[0]) {
    throw Object.assign(new Error("Session expired. Sign in again."), { statusCode: 401 });
  }

  return result.rows[0];
}

async function createAdminSession(name) {
  const token = randomBytes(32).toString("base64url");
  await getPool().query(
    "INSERT INTO admin_sessions (token_hash, name, expires_at) VALUES ($1, $2, $3)",
    [hashValue(token), name, sessionExpiry()]
  );
  return token;
}

async function requireAdmin(request) {
  const token = bearerToken(request);
  if (!token) {
    throw Object.assign(new Error("Missing admin token."), { statusCode: 401 });
  }

  await ensureDatabase();
  const result = await getPool().query(
    "SELECT name FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()",
    [hashValue(token)]
  );

  if (!result.rows[0]) {
    throw Object.assign(new Error("Admin session expired. Sign in again."), { statusCode: 401 });
  }

  return result.rows[0];
}

async function handleGameLogin(response, body) {
  const credentials = validateGameCredentials(body);
  if (credentials.error) {
    jsonResponse(response, 400, { error: credentials.error });
    return;
  }

  await ensureDatabase();
  const db = getPool();
  const existing = await db.query("SELECT * FROM player_profiles WHERE name_key = $1", [credentials.nameKey]);
  let profile = existing.rows[0];

  if (profile) {
    const expectedHash = hashPin(credentials.pin, profile.pin_salt);
    if (!safeEqual(expectedHash, profile.pin_hash)) {
      jsonResponse(response, 401, { error: "Name or PIN is incorrect." });
      return;
    }

    await db.query("UPDATE player_profiles SET name = $1, updated_at = now(), last_login_at = now() WHERE id = $2", [credentials.name, profile.id]);
  } else {
    const salt = randomBytes(16).toString("hex");
    const id = randomUUID();
    const inserted = await db.query(
      `INSERT INTO player_profiles (id, name, name_key, pin_salt, pin_hash, last_login_at)
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING *`,
      [id, credentials.name, credentials.nameKey, salt, hashPin(credentials.pin, salt)]
    );
    profile = inserted.rows[0];
  }

  await db.query("DELETE FROM player_sessions WHERE expires_at <= now()");
  const token = await createPlayerSession(profile.id);
  const save = await db.query("SELECT state, updated_at FROM game_saves WHERE profile_id = $1", [profile.id]);

  jsonResponse(response, 200, {
    profile: { id: profile.id, name: profile.name },
    save: save.rows[0] ? { state: save.rows[0].state, updatedAt: save.rows[0].updated_at } : null,
    token
  });
}

async function handleGameSave(request, response, body) {
  const profile = await requirePlayer(request, body?.token);
  if (!body?.state || typeof body.state !== "object") {
    jsonResponse(response, 400, { error: "Missing game state." });
    return;
  }

  await getPool().query(
    `INSERT INTO game_saves (profile_id, state, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (profile_id)
     DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [profile.id, body.state]
  );

  jsonResponse(response, 200, { ok: true, updatedAt: new Date().toISOString() });
}

async function handleGameSaveRead(request, response) {
  const profile = await requirePlayer(request);
  const save = await getPool().query("SELECT state, updated_at FROM game_saves WHERE profile_id = $1", [profile.id]);
  jsonResponse(response, 200, {
    profile,
    save: save.rows[0] ? { state: save.rows[0].state, updatedAt: save.rows[0].updated_at } : null
  });
}

async function handleAdminLogin(response, body) {
  const name = normalizeName(body?.name);
  const pin = String(body?.pin ?? "").trim();

  await ensureDatabase();
  const result = await getPool().query(
    "SELECT name, pin_salt, pin_hash, role FROM admin_users WHERE name_key = $1 AND active = true",
    [name.toLowerCase()]
  );
  const admin = result.rows[0];
  const expectedHash = admin ? hashPin(pin, admin.pin_salt) : "";

  if (!admin || !safeEqual(expectedHash, admin.pin_hash)) {
    jsonResponse(response, 401, { error: "Admin name or PIN is incorrect." });
    return;
  }

  await getPool().query("DELETE FROM admin_sessions WHERE expires_at <= now()");
  const token = await createAdminSession(admin.name);
  jsonResponse(response, 200, { token, admin: { name: admin.name, role: admin.role } });
}

async function handleMapLayoutRead(response) {
  await ensureDatabase();
  const result = await getPool().query("SELECT layout, updated_at, updated_by FROM map_layouts WHERE id = 'default'");
  jsonResponse(response, 200, {
    layout: result.rows[0]?.layout ?? null,
    updatedAt: result.rows[0]?.updated_at ?? null,
    updatedBy: result.rows[0]?.updated_by ?? null
  });
}

async function handleMapLayoutSave(request, response, body) {
  const admin = await requireAdmin(request);
  if (!body?.layout || typeof body.layout !== "object") {
    jsonResponse(response, 400, { error: "Missing map layout." });
    return;
  }

  await getPool().query(
    `INSERT INTO map_layouts (id, layout, updated_at, updated_by)
     VALUES ('default', $1, now(), $2)
     ON CONFLICT (id)
     DO UPDATE SET layout = EXCLUDED.layout, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [body.layout, admin.name]
  );
  jsonResponse(response, 200, { ok: true, updatedAt: new Date().toISOString() });
}

async function handleMapLayoutReset(request, response) {
  await requireAdmin(request);
  await getPool().query("DELETE FROM map_layouts WHERE id = 'default'");
  emptyResponse(response);
}

async function routeApi(request, response, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    jsonResponse(response, 200, { ok: true, database: Boolean(databaseUrl) });
    return true;
  }

  if (!url.pathname.startsWith("/api/")) {
    return false;
  }

  try {
    const body = request.method === "GET" || request.method === "DELETE" ? {} : await readJson(request);

    if (url.pathname === "/api/game/login" && request.method === "POST") {
      await handleGameLogin(response, body);
      return true;
    }

    if ((url.pathname === "/api/game/save" || url.pathname === "/api/game/save-beacon") && request.method === "POST") {
      await handleGameSave(request, response, body);
      return true;
    }

    if (url.pathname === "/api/game/save" && request.method === "GET") {
      await handleGameSaveRead(request, response);
      return true;
    }

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      await handleAdminLogin(response, body);
      return true;
    }

    if (url.pathname === "/api/map-layout" && request.method === "GET") {
      await handleMapLayoutRead(response);
      return true;
    }

    if (url.pathname === "/api/admin/map-layout" && request.method === "POST") {
      await handleMapLayoutSave(request, response, body);
      return true;
    }

    if (url.pathname === "/api/admin/map-layout" && request.method === "DELETE") {
      await handleMapLayoutReset(request, response);
      return true;
    }

    jsonResponse(response, 404, { error: "API route not found." });
    return true;
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    jsonResponse(response, statusCode, {
      error: statusCode === 500 ? "Server error." : error.message
    });
    if (statusCode === 500) {
      console.error(error);
    }
    return true;
  }
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

async function serveStatic(request, response, url) {
  const decodedPath = decodeURIComponent(url.pathname);
  const safePath = decodedPath === "/" ? "/index.html" : decodedPath;
  let filePath = path.normalize(path.join(distDir, safePath));

  if (!filePath.startsWith(distDir)) {
    jsonResponse(response, 403, { error: "Forbidden." });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    filePath = path.join(distDir, "index.html");
  }

  const ext = path.extname(filePath);
  response.writeHead(200, {
    "content-type": contentTypes[ext] ?? "application/octet-stream",
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const handledApi = await routeApi(request, response, url);
  if (handledApi) {
    return;
  }

  await serveStatic(request, response, url);
});

server.listen(port, () => {
  console.log(`Vendetta Vending server listening on ${port}`);
});
