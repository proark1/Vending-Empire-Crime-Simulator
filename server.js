import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { WebSocket, WebSocketServer } from "ws";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const generatedAudioDir = path.join(__dirname, "generated-audio");
const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;
const seedAdminName = process.env.ADMIN_NAME ?? "proark";
const seedAdminPin = process.env.ADMIN_PIN ?? "4924";
const sessionDays = Number(process.env.SESSION_DAYS ?? 14);
const jsonLimitBytes = Number(process.env.JSON_LIMIT_BYTES ?? 8 * 1024 * 1024);
const startedAt = new Date();

let pool = null;
let databaseReady = null;
const recentEvents = [];
const metrics = {
  adminFailedLogins: 0,
  adminLogins: 0,
  apiRequests: 0,
  audioRestores: 0,
  audioRevisions: 0,
  audioProviderSaves: 0,
  audioGenerations: 0,
  audioSaves: 0,
  dbFailures: 0,
  expiredSessions: 0,
  failedWrites: 0,
  gameSaveConflicts: 0,
  gameSaves: 0,
  mapRestores: 0,
  mapRevisions: 0,
  mapSaves: 0,
  multiplayerConnections: 0,
  multiplayerDisconnects: 0,
  multiplayerMessages: 0,
  multiplayerRoomsCreated: 0,
  serverErrors: 0
};

const multiplayerRooms = new Map();
const multiplayerPeers = new Map();
const multiplayerRoomMaxPeers = Number(process.env.MULTIPLAYER_ROOM_MAX_PEERS ?? 4);
const multiplayerProtocolVersion = 1;

function recordEvent(level, type, message, details = {}) {
  const event = {
    at: new Date().toISOString(),
    level,
    type,
    message,
    details
  };
  recentEvents.unshift(event);
  recentEvents.splice(80);
  const log = JSON.stringify(event);
  if (level === "error") {
    console.error(log);
  } else if (level === "warning") {
    console.warn(log);
  } else {
    console.log(log);
  }
}

function httpError(message, statusCode, code, details = {}) {
  return Object.assign(new Error(message), { code, details, statusCode });
}

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
          revision INTEGER NOT NULL DEFAULT 1,
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
          revision INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by TEXT
        );

        CREATE TABLE IF NOT EXISTS map_layout_revisions (
          id TEXT PRIMARY KEY,
          layout_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          layout JSONB NOT NULL,
          action TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_by TEXT
        );

        CREATE INDEX IF NOT EXISTS map_layout_revisions_layout_id_idx ON map_layout_revisions(layout_id);
        CREATE INDEX IF NOT EXISTS map_layout_revisions_created_at_idx ON map_layout_revisions(created_at);

        CREATE TABLE IF NOT EXISTS audio_configs (
          id TEXT PRIMARY KEY,
          config JSONB NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by TEXT
        );

        CREATE TABLE IF NOT EXISTS audio_config_revisions (
          id TEXT PRIMARY KEY,
          config_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          config JSONB NOT NULL,
          action TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_by TEXT
        );

        CREATE INDEX IF NOT EXISTS audio_config_revisions_config_id_idx ON audio_config_revisions(config_id);
        CREATE INDEX IF NOT EXISTS audio_config_revisions_created_at_idx ON audio_config_revisions(created_at);

        CREATE TABLE IF NOT EXISTS audio_provider_settings (
          id TEXT PRIMARY KEY,
          settings JSONB NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by TEXT
        );
      `);
      await db.query("ALTER TABLE game_saves ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1");
      await db.query("ALTER TABLE map_layouts ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1");
      await db.query("ALTER TABLE audio_configs ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1");
      await db.query("ALTER TABLE audio_provider_settings ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1");
      await ensureSeededAdminUser(db);
      recordEvent("info", "database_ready", "Database schema is ready.");
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

async function requirePlayerToken(token) {
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
    metrics.expiredSessions += 1;
    throw httpError("Session expired. Sign in again.", 401, "SESSION_EXPIRED");
  }

  return result.rows[0];
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
  return requirePlayerToken(bearerToken(request) ?? bodyToken);
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
    metrics.expiredSessions += 1;
    throw httpError("Admin session expired. Sign in again.", 401, "ADMIN_SESSION_EXPIRED");
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

  if (!profile) {
    jsonResponse(response, 401, { error: "Name or PIN is incorrect." });
    return;
  }

  const expectedHash = hashPin(credentials.pin, profile.pin_salt);
  if (!safeEqual(expectedHash, profile.pin_hash)) {
    jsonResponse(response, 401, { error: "Name or PIN is incorrect." });
    return;
  }

  await db.query("UPDATE player_profiles SET name = $1, updated_at = now(), last_login_at = now() WHERE id = $2", [credentials.name, profile.id]);

  await db.query("DELETE FROM player_sessions WHERE expires_at <= now()");
  const token = await createPlayerSession(profile.id);
  const save = await db.query("SELECT state, updated_at, revision FROM game_saves WHERE profile_id = $1", [profile.id]);

  jsonResponse(response, 200, {
    profile: { id: profile.id, name: profile.name },
    save: save.rows[0] ? { state: save.rows[0].state, updatedAt: save.rows[0].updated_at, revision: save.rows[0].revision } : null,
    token
  });
}

async function handleGameRegister(response, body) {
  const credentials = validateGameCredentials(body);
  if (credentials.error) {
    jsonResponse(response, 400, { error: credentials.error });
    return;
  }

  await ensureDatabase();
  const db = getPool();
  const existing = await db.query("SELECT id FROM player_profiles WHERE name_key = $1", [credentials.nameKey]);
  if (existing.rows[0]) {
    jsonResponse(response, 409, { error: "That player name is already registered. Log in instead." });
    return;
  }

  const pinRecord = createPinRecord(credentials.pin);
  const inserted = await db.query(
    `INSERT INTO player_profiles (id, name, name_key, pin_salt, pin_hash, last_login_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING *`,
    [randomUUID(), credentials.name, credentials.nameKey, pinRecord.salt, pinRecord.hash]
  );
  const profile = inserted.rows[0];

  await db.query("DELETE FROM player_sessions WHERE expires_at <= now()");
  const token = await createPlayerSession(profile.id);

  jsonResponse(response, 200, {
    profile: { id: profile.id, name: profile.name },
    save: null,
    token
  });
}

async function handleGameSave(request, response, body) {
  const profile = await requirePlayer(request, body?.token);
  if (!body?.state || typeof body.state !== "object") {
    jsonResponse(response, 400, { error: "Missing game state." });
    return;
  }

  const baseRevision = typeof body.baseRevision === "number" && Number.isFinite(body.baseRevision) ? Math.max(0, Math.floor(body.baseRevision)) : null;
  const result = await getPool().query(
    `INSERT INTO game_saves (profile_id, state, revision, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (profile_id)
     DO UPDATE SET
       state = EXCLUDED.state,
       revision = game_saves.revision + 1,
       updated_at = now()
     WHERE $3::integer IS NULL OR game_saves.revision = $3::integer
     RETURNING updated_at, revision`,
    [profile.id, body.state, baseRevision]
  );

  if (!result.rows[0]) {
    metrics.gameSaveConflicts += 1;
    const current = await getPool().query("SELECT updated_at, revision FROM game_saves WHERE profile_id = $1", [profile.id]);
    recordEvent("warning", "game_save_conflict", "Rejected stale game save.", {
      baseRevision,
      currentRevision: current.rows[0]?.revision ?? null,
      profileId: profile.id
    });
    jsonResponse(response, 409, {
      code: "SAVE_CONFLICT",
      error: "This save is older than the database copy. Reloaded the latest saved state.",
      save: current.rows[0] ? { updatedAt: current.rows[0].updated_at, revision: current.rows[0].revision } : null
    });
    return;
  }

  metrics.gameSaves += 1;
  jsonResponse(response, 200, { ok: true, updatedAt: result.rows[0].updated_at, revision: result.rows[0].revision });
}

async function handleGameSaveRead(request, response) {
  const profile = await requirePlayer(request);
  const save = await getPool().query("SELECT state, updated_at, revision FROM game_saves WHERE profile_id = $1", [profile.id]);
  jsonResponse(response, 200, {
    profile,
    save: save.rows[0] ? { state: save.rows[0].state, updatedAt: save.rows[0].updated_at, revision: save.rows[0].revision } : null
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
    metrics.adminFailedLogins += 1;
    recordEvent("warning", "admin_login_failed", "Admin login failed.", { name });
    jsonResponse(response, 401, { error: "Admin name or PIN is incorrect." });
    return;
  }

  await getPool().query("DELETE FROM admin_sessions WHERE expires_at <= now()");
  const token = await createAdminSession(admin.name);
  metrics.adminLogins += 1;
  recordEvent("info", "admin_login", "Admin signed in.", { name: admin.name, role: admin.role });
  jsonResponse(response, 200, { token, admin: { name: admin.name, role: admin.role } });
}

async function handleMapLayoutRead(response) {
  await ensureDatabase();
  const result = await getPool().query("SELECT layout, updated_at, updated_by, revision FROM map_layouts WHERE id = 'default'");
  jsonResponse(response, 200, {
    layout: result.rows[0]?.layout ?? null,
    updatedAt: result.rows[0]?.updated_at ?? null,
    updatedBy: result.rows[0]?.updated_by ?? null,
    revision: result.rows[0]?.revision ?? null
  });
}

async function handleMapLayoutSave(request, response, body) {
  const admin = await requireAdmin(request);
  if (!body?.layout || typeof body.layout !== "object") {
    jsonResponse(response, 400, { error: "Missing map layout." });
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const saved = await client.query(
      `INSERT INTO map_layouts (id, layout, revision, updated_at, updated_by)
       VALUES ('default', $1, 1, now(), $2)
       ON CONFLICT (id)
       DO UPDATE SET
         layout = EXCLUDED.layout,
         revision = map_layouts.revision + 1,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING layout, updated_at, updated_by, revision`,
      [body.layout, admin.name]
    );
    const row = saved.rows[0];
    await client.query(
      `INSERT INTO map_layout_revisions (id, layout_id, revision, layout, action, created_by)
       VALUES ($1, 'default', $2, $3, 'save', $4)`,
      [randomUUID(), row.revision, row.layout, admin.name]
    );
    await client.query("COMMIT");
    metrics.mapSaves += 1;
    metrics.mapRevisions += 1;
    recordEvent("info", "map_saved", "Map layout saved.", { revision: row.revision, updatedBy: admin.name });
    jsonResponse(response, 200, { ok: true, updatedAt: row.updated_at, updatedBy: row.updated_by, revision: row.revision });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "map_save_failed", "Map layout save failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function handleMapLayoutReset(request, response) {
  const admin = await requireAdmin(request);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT layout, revision FROM map_layouts WHERE id = 'default'");
    if (current.rows[0]) {
      await client.query(
        `INSERT INTO map_layout_revisions (id, layout_id, revision, layout, action, created_by)
         VALUES ($1, 'default', $2, $3, 'reset_backup', $4)`,
        [randomUUID(), current.rows[0].revision + 1, current.rows[0].layout, admin.name]
      );
      metrics.mapRevisions += 1;
    }
    await client.query("DELETE FROM map_layouts WHERE id = 'default'");
    await client.query("COMMIT");
    recordEvent("warning", "map_reset", "Map layout reset to authored default.", { by: admin.name });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "map_reset_failed", "Map layout reset failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
  emptyResponse(response);
}

async function handleMapLayoutRevisionsRead(request, response) {
  await requireAdmin(request);
  const result = await getPool().query(
    `SELECT id, revision, action, created_at, created_by
       FROM map_layout_revisions
      WHERE layout_id = 'default'
      ORDER BY created_at DESC
      LIMIT 30`
  );
  jsonResponse(response, 200, {
    revisions: result.rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      action: row.action,
      createdAt: row.created_at,
      createdBy: row.created_by
    }))
  });
}

async function handleMapLayoutRestore(request, response, body) {
  const admin = await requireAdmin(request);
  const revisionId = String(body?.revisionId ?? "").trim();
  if (!revisionId) {
    jsonResponse(response, 400, { error: "Missing revision id." });
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const revision = await client.query("SELECT layout, revision FROM map_layout_revisions WHERE id = $1 AND layout_id = 'default'", [revisionId]);
    if (!revision.rows[0]) {
      await client.query("ROLLBACK");
      jsonResponse(response, 404, { error: "Map revision not found." });
      return;
    }

    const restored = await client.query(
      `INSERT INTO map_layouts (id, layout, revision, updated_at, updated_by)
       VALUES ('default', $1, 1, now(), $2)
       ON CONFLICT (id)
       DO UPDATE SET
         layout = EXCLUDED.layout,
         revision = map_layouts.revision + 1,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING layout, updated_at, updated_by, revision`,
      [revision.rows[0].layout, admin.name]
    );
    const row = restored.rows[0];
    await client.query(
      `INSERT INTO map_layout_revisions (id, layout_id, revision, layout, action, created_by)
       VALUES ($1, 'default', $2, $3, 'restore', $4)`,
      [randomUUID(), row.revision, row.layout, admin.name]
    );
    await client.query("COMMIT");
    metrics.mapRestores += 1;
    metrics.mapRevisions += 1;
    recordEvent("warning", "map_restored", "Map layout restored from revision.", {
      restoredFromRevision: revision.rows[0].revision,
      revision: row.revision,
      by: admin.name
    });
    jsonResponse(response, 200, {
      layout: row.layout,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      revision: row.revision
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "map_restore_failed", "Map layout restore failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function handleAudioConfigRead(response) {
  await ensureDatabase();
  const result = await getPool().query("SELECT config, updated_at, updated_by, revision FROM audio_configs WHERE id = 'default'");
  jsonResponse(response, 200, {
    config: result.rows[0]?.config ? await enrichAudioConfigFileSizes(result.rows[0].config) : null,
    updatedAt: result.rows[0]?.updated_at ?? null,
    updatedBy: result.rows[0]?.updated_by ?? null,
    revision: result.rows[0]?.revision ?? null
  });
}

async function handleAudioConfigSave(request, response, body) {
  const admin = await requireAdmin(request);
  if (!body?.config || typeof body.config !== "object") {
    jsonResponse(response, 400, { error: "Missing audio config." });
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const saved = await client.query(
      `INSERT INTO audio_configs (id, config, revision, updated_at, updated_by)
       VALUES ('default', $1, 1, now(), $2)
       ON CONFLICT (id)
       DO UPDATE SET
         config = EXCLUDED.config,
         revision = audio_configs.revision + 1,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING config, updated_at, updated_by, revision`,
      [body.config, admin.name]
    );
    const row = saved.rows[0];
    await client.query(
      `INSERT INTO audio_config_revisions (id, config_id, revision, config, action, created_by)
       VALUES ($1, 'default', $2, $3, 'save', $4)`,
      [randomUUID(), row.revision, row.config, admin.name]
    );
    await client.query("COMMIT");
    metrics.audioSaves += 1;
    metrics.audioRevisions += 1;
    recordEvent("info", "audio_config_saved", "Audio config saved.", { revision: row.revision, updatedBy: admin.name });
    jsonResponse(response, 200, { ok: true, updatedAt: row.updated_at, updatedBy: row.updated_by, revision: row.revision });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "audio_config_save_failed", "Audio config save failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function handleAudioConfigReset(request, response) {
  const admin = await requireAdmin(request);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT config, revision FROM audio_configs WHERE id = 'default'");
    if (current.rows[0]) {
      await client.query(
        `INSERT INTO audio_config_revisions (id, config_id, revision, config, action, created_by)
         VALUES ($1, 'default', $2, $3, 'reset_backup', $4)`,
        [randomUUID(), current.rows[0].revision + 1, current.rows[0].config, admin.name]
      );
      metrics.audioRevisions += 1;
    }
    await client.query("DELETE FROM audio_configs WHERE id = 'default'");
    await client.query("COMMIT");
    recordEvent("warning", "audio_config_reset", "Audio config reset to authored default.", { by: admin.name });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "audio_config_reset_failed", "Audio config reset failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
  emptyResponse(response);
}

async function handleAudioConfigRevisionsRead(request, response) {
  await requireAdmin(request);
  const result = await getPool().query(
    `SELECT id, revision, action, created_at, created_by
       FROM audio_config_revisions
      WHERE config_id = 'default'
      ORDER BY created_at DESC
      LIMIT 30`
  );
  jsonResponse(response, 200, {
    revisions: result.rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      action: row.action,
      createdAt: row.created_at,
      createdBy: row.created_by
    }))
  });
}

async function handleAudioConfigRestore(request, response, body) {
  const admin = await requireAdmin(request);
  const revisionId = String(body?.revisionId ?? "").trim();
  if (!revisionId) {
    jsonResponse(response, 400, { error: "Missing revision id." });
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const revision = await client.query("SELECT config, revision FROM audio_config_revisions WHERE id = $1 AND config_id = 'default'", [revisionId]);
    if (!revision.rows[0]) {
      await client.query("ROLLBACK");
      jsonResponse(response, 404, { error: "Audio config revision not found." });
      return;
    }

    const restored = await client.query(
      `INSERT INTO audio_configs (id, config, revision, updated_at, updated_by)
       VALUES ('default', $1, 1, now(), $2)
       ON CONFLICT (id)
       DO UPDATE SET
         config = EXCLUDED.config,
         revision = audio_configs.revision + 1,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING config, updated_at, updated_by, revision`,
      [revision.rows[0].config, admin.name]
    );
    const row = restored.rows[0];
    await client.query(
      `INSERT INTO audio_config_revisions (id, config_id, revision, config, action, created_by)
       VALUES ($1, 'default', $2, $3, 'restore', $4)`,
      [randomUUID(), row.revision, row.config, admin.name]
    );
    await client.query("COMMIT");
    metrics.audioRestores += 1;
    metrics.audioRevisions += 1;
    recordEvent("warning", "audio_config_restored", "Audio config restored from revision.", {
      restoredFromRevision: revision.rows[0].revision,
      revision: row.revision,
      by: admin.name
    });
    jsonResponse(response, 200, {
      config: row.config,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      revision: row.revision
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "audio_config_restore_failed", "Audio config restore failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

function normalizeAudioProviderCategory(value) {
  return value === "sound" || value === "music" || value === "voice" ? value : "voice";
}

function normalizeAudioProviderNumber(value, fallback, min = 0, max = 1) {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function normalizeAudioProviderString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

const recommendedAudioVoiceProfileByPromptKey = Object.freeze({
  voice_district_entry: "voice_fixer_dispatcher",
  "voice.district_entry": "voice_fixer_dispatcher",
  voice_heat_warning: "voice_authority",
  "voice.heat_warning": "voice_authority",
  voice_rival_attack: "voice_rival_enforcer",
  "voice.rival_attack": "voice_rival_enforcer",
  voice_mission_complete: "voice_fixer_dispatcher",
  "voice.mission_complete": "voice_fixer_dispatcher",
  voice_supplier_offer: "voice_supplier_mechanic",
  "voice.supplier_offer": "voice_supplier_mechanic",
  voice_fixer_tip: "voice_fixer_dispatcher",
  "voice.fixer_tip": "voice_fixer_dispatcher",
  voice_landlord_pressure: "voice_authority",
  "voice.landlord_pressure": "voice_authority",
  voice_rival_boss_threat: "voice_rival_enforcer",
  "voice.rival_boss_threat": "voice_rival_enforcer",
  voice_mechanic_unlock: "voice_supplier_mechanic",
  "voice.mechanic_unlock": "voice_supplier_mechanic",
  voice_driver_warning: "voice_supplier_mechanic",
  "voice.driver_warning": "voice_supplier_mechanic",
  voice_guard_contact: "voice_rival_enforcer",
  "voice.guard_contact": "voice_rival_enforcer",
  voice_inspector_notice: "voice_authority",
  "voice.inspector_notice": "voice_authority",
  voice_lawyer_notice: "voice_authority",
  "voice.lawyer_notice": "voice_authority",
  voice_informant_tip: "voice_informant",
  "voice.informant_tip": "voice_informant"
});

function recommendedAudioProviderVoiceProfileId(promptInput) {
  return recommendedAudioVoiceProfileByPromptKey[normalizeAudioProviderString(promptInput.id)]
    || recommendedAudioVoiceProfileByPromptKey[normalizeAudioProviderString(promptInput.trigger)]
    || "";
}

function normalizeAudioProviderSettings(candidate, existing = null, options = {}) {
  const input = typeof candidate === "object" && candidate !== null ? candidate : {};
  const existingSettings = typeof existing === "object" && existing !== null ? existing : {};
  const defaultModelId = normalizeAudioProviderString(input.defaultModelId, normalizeAudioProviderString(existingSettings.defaultModelId, "eleven_multilingual_v2"));
  const profiles = Array.isArray(input.voiceProfiles) ? input.voiceProfiles : [];
  const prompts = Array.isArray(input.generationPrompts)
    ? input.generationPrompts
    : Array.isArray(existingSettings.generationPrompts)
      ? existingSettings.generationPrompts
      : null;
  const apiKeyInput = normalizeAudioProviderString(input.apiKey);
  const existingApiKey = normalizeAudioProviderString(existingSettings.apiKey);
  const apiKey = options.clearApiKey ? "" : apiKeyInput || existingApiKey;

  return {
    apiKey,
    defaultModelId,
    ...(prompts ? {
      generationPrompts: prompts.map((prompt, index) => {
        const promptInput = typeof prompt === "object" && prompt !== null ? prompt : {};
        const id = normalizeAudioProviderString(promptInput.id, `prompt_${index + 1}`);
        const label = normalizeAudioProviderString(promptInput.label, `Prompt ${index + 1}`);
        const trigger = normalizeAudioProviderString(promptInput.trigger);
        return {
          durationSeconds: normalizeAudioProviderNumber(promptInput.durationSeconds, 3, 0.5, 180),
          enabled: typeof promptInput.enabled === "boolean" ? promptInput.enabled : true,
          generatedAt: normalizeAudioProviderString(promptInput.generatedAt),
          generatedSizeBytes: typeof promptInput.generatedSizeBytes === "number" && Number.isFinite(promptInput.generatedSizeBytes) ? Math.max(0, Math.round(promptInput.generatedSizeBytes)) : null,
          generatedUrl: normalizeAudioProviderString(promptInput.generatedUrl),
          id,
          label,
          negativePrompt: normalizeAudioProviderString(promptInput.negativePrompt),
          prompt: normalizeAudioProviderString(promptInput.prompt),
          purpose: normalizeAudioProviderCategory(promptInput.purpose),
          trigger,
          voiceProfileId: normalizeAudioProviderString(promptInput.voiceProfileId) || recommendedAudioProviderVoiceProfileId({ id, trigger })
        };
      })
    } : {}),
    hasApiKey: Boolean(apiKey),
    provider: "elevenlabs",
    voiceProfiles: profiles.map((profile, index) => {
      const profileInput = typeof profile === "object" && profile !== null ? profile : {};
      const label = normalizeAudioProviderString(profileInput.label, `Voice ${index + 1}`);
      return {
        designPrompt: normalizeAudioProviderString(profileInput.designPrompt),
        id: normalizeAudioProviderString(profileInput.id, `voice_${index + 1}`),
        label,
        modelId: normalizeAudioProviderString(profileInput.modelId, defaultModelId),
        purpose: normalizeAudioProviderCategory(profileInput.purpose),
        similarityBoost: normalizeAudioProviderNumber(profileInput.similarityBoost, 0.75),
        stability: normalizeAudioProviderNumber(profileInput.stability, 0.45),
        style: normalizeAudioProviderNumber(profileInput.style, 0),
        useSpeakerBoost: typeof profileInput.useSpeakerBoost === "boolean" ? profileInput.useSpeakerBoost : true,
        voiceId: normalizeAudioProviderString(profileInput.voiceId)
      };
    })
  };
}

async function redactAudioProviderSettings(settings) {
  const normalized = await enrichProviderFileSizes(settings);
  return {
    ...normalized,
    apiKey: "",
    hasApiKey: Boolean(normalized.apiKey)
  };
}

async function handleAudioProviderSettingsRead(request, response) {
  await requireAdmin(request);
  const result = await getPool().query("SELECT settings, updated_at, updated_by, revision FROM audio_provider_settings WHERE id = 'default'");
  jsonResponse(response, 200, {
    settings: await redactAudioProviderSettings(result.rows[0]?.settings ?? null),
    updatedAt: result.rows[0]?.updated_at ?? null,
    updatedBy: result.rows[0]?.updated_by ?? null,
    revision: result.rows[0]?.revision ?? null
  });
}

async function handleAudioProviderSettingsSave(request, response, body) {
  const admin = await requireAdmin(request);
  if (!body?.settings || typeof body.settings !== "object") {
    jsonResponse(response, 400, { error: "Missing audio provider settings." });
    return;
  }

  const current = await getPool().query("SELECT settings FROM audio_provider_settings WHERE id = 'default'");
  const settings = normalizeAudioProviderSettings(body.settings, current.rows[0]?.settings ?? null, { clearApiKey: body.clearApiKey === true });
  const saved = await getPool().query(
    `INSERT INTO audio_provider_settings (id, settings, revision, updated_at, updated_by)
     VALUES ('default', $1, 1, now(), $2)
     ON CONFLICT (id)
     DO UPDATE SET
       settings = EXCLUDED.settings,
       revision = audio_provider_settings.revision + 1,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by
     RETURNING settings, updated_at, updated_by, revision`,
    [settings, admin.name]
  );
  const row = saved.rows[0];
  metrics.audioProviderSaves += 1;
  recordEvent("info", "audio_provider_saved", "Audio provider settings saved.", { revision: row.revision, updatedBy: admin.name });
  jsonResponse(response, 200, {
    ok: true,
    settings: await redactAudioProviderSettings(row.settings),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    revision: row.revision
  });
}

function safeFileSegment(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "audio";
}

function generatedAudioUrl(filename) {
  return `/generated-audio/${encodeURIComponent(filename)}`;
}

function generatedAudioFilePathFromUrl(urlValue) {
  const urlString = normalizeAudioProviderString(urlValue);
  if (!urlString.startsWith("/generated-audio/")) {
    return null;
  }

  let safeName = "";
  try {
    safeName = path.basename(decodeURIComponent(urlString.slice("/generated-audio/".length)));
  } catch {
    return null;
  }

  if (!safeName) {
    return null;
  }

  const filePath = path.normalize(path.join(generatedAudioDir, safeName));
  return filePath.startsWith(generatedAudioDir) ? filePath : null;
}

async function generatedAudioSizeFromUrl(urlValue) {
  const filePath = generatedAudioFilePathFromUrl(urlValue);
  if (!filePath) {
    return null;
  }

  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? fileStat.size : null;
  } catch {
    return null;
  }
}

async function enrichAudioConfigFileSizes(config) {
  if (!config || typeof config !== "object" || !Array.isArray(config.assets)) {
    return config;
  }

  const assets = await Promise.all(config.assets.map(async (asset) => {
    if (!asset || typeof asset !== "object" || asset.sizeBytes) {
      return asset;
    }

    const sizeBytes = await generatedAudioSizeFromUrl(asset.url);
    return sizeBytes ? { ...asset, sizeBytes } : asset;
  }));
  return { ...config, assets };
}

async function enrichProviderFileSizes(settings) {
  const normalized = normalizeAudioProviderSettings(settings);
  const generationPrompts = await Promise.all(normalized.generationPrompts.map(async (prompt) => {
    if (prompt.generatedSizeBytes || !prompt.generatedUrl) {
      return prompt;
    }

    const sizeBytes = await generatedAudioSizeFromUrl(prompt.generatedUrl);
    return sizeBytes ? { ...prompt, generatedSizeBytes: sizeBytes } : prompt;
  }));
  return { ...normalized, generationPrompts };
}

function findVoiceProfile(settings, prompt) {
  if (prompt.voiceProfileId) {
    return settings.voiceProfiles.find((profile) => profile.id === prompt.voiceProfileId) ?? null;
  }

  return settings.voiceProfiles.find((profile) => profile.purpose === "voice") ?? settings.voiceProfiles[0] ?? null;
}

async function elevenLabsAudioRequest({ apiKey, endpoint, payload }) {
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "");
    throw httpError(`ElevenLabs generation failed: ${errorText || upstream.statusText}`, upstream.status >= 500 ? 502 : 400, "ELEVENLABS_GENERATION_FAILED");
  }

  return Buffer.from(await upstream.arrayBuffer());
}

async function generateElevenLabsAudio(settings, prompt) {
  const apiKey = normalizeAudioProviderString(settings.apiKey);
  if (!apiKey) {
    throw httpError("ElevenLabs API key is not set.", 400, "ELEVENLABS_API_KEY_MISSING");
  }

  if (!prompt.prompt) {
    throw httpError("Generation prompt text is missing.", 400, "AUDIO_PROMPT_MISSING");
  }

  if (prompt.purpose === "voice") {
    const profile = findVoiceProfile(settings, prompt);
    if (!profile?.voiceId) {
      throw httpError("Select a voice profile with an ElevenLabs voice ID before generating voice audio.", 400, "ELEVENLABS_VOICE_ID_MISSING");
    }

    return elevenLabsAudioRequest({
      apiKey,
      endpoint: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(profile.voiceId)}?output_format=mp3_44100_128`,
      payload: {
        model_id: profile.modelId || settings.defaultModelId || "eleven_multilingual_v2",
        text: prompt.prompt,
        voice_settings: {
          similarity_boost: profile.similarityBoost,
          stability: profile.stability,
          style: profile.style,
          use_speaker_boost: profile.useSpeakerBoost
        }
      }
    });
  }

  if (prompt.purpose === "music") {
    return elevenLabsAudioRequest({
      apiKey,
      endpoint: "https://api.elevenlabs.io/v1/music/stream?output_format=mp3_44100_128",
      payload: {
        force_instrumental: true,
        model_id: "music_v1",
        music_length_ms: Math.round(Math.min(600, Math.max(3, prompt.durationSeconds || 60)) * 1000),
        prompt: prompt.prompt
      }
    });
  }

  return elevenLabsAudioRequest({
    apiKey,
    endpoint: "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    payload: {
      duration_seconds: Math.min(30, Math.max(0.5, prompt.durationSeconds || 2)),
      loop: prompt.trigger?.startsWith("music.") || prompt.label?.toLowerCase().includes("loop") || false,
      model_id: "eleven_text_to_sound_v2",
      prompt_influence: 0.35,
      text: prompt.prompt
    }
  });
}

async function handleAudioProviderGenerate(request, response, body) {
  const admin = await requireAdmin(request);
  if (!body?.prompt || typeof body.prompt !== "object") {
    jsonResponse(response, 400, { error: "Missing generation prompt." });
    return;
  }

  const current = await getPool().query("SELECT settings FROM audio_provider_settings WHERE id = 'default'");
  const settings = normalizeAudioProviderSettings(body.settings ?? {}, current.rows[0]?.settings ?? null);
  const prompt = normalizeAudioProviderSettings({ generationPrompts: [body.prompt] }).generationPrompts[0];
  const audio = await generateElevenLabsAudio(settings, prompt);
  await mkdir(generatedAudioDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const filename = `${safeFileSegment(prompt.purpose)}-${safeFileSegment(prompt.id)}-${Date.now()}.mp3`;
  const filePath = path.join(generatedAudioDir, filename);
  await writeFile(filePath, audio);

  const generatedPrompt = {
    ...prompt,
    generatedAt,
    generatedSizeBytes: audio.length,
    generatedUrl: generatedAudioUrl(filename)
  };

  metrics.audioGenerations += 1;
  recordEvent("info", "audio_generated", "ElevenLabs audio generated.", {
    by: admin.name,
    promptId: prompt.id,
    purpose: prompt.purpose,
    sizeBytes: audio.length
  });
  jsonResponse(response, 200, {
    asset: {
      category: prompt.purpose,
      id: `generated_${prompt.id}`,
      label: prompt.label,
      loop: prompt.purpose === "music",
      sizeBytes: audio.length,
      url: generatedPrompt.generatedUrl,
      volume: 0.85
    },
    prompt: generatedPrompt
  });
}

async function handleAdminMonitoring(request, response) {
  await requireAdmin(request);
  let database = { ok: false, latencyMs: null };
  if (databaseUrl) {
    const started = Date.now();
    try {
      await getPool().query("SELECT 1");
      database = { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      metrics.dbFailures += 1;
      recordEvent("error", "database_check_failed", "Database health check failed.", { error: error.message });
    }
  }

  jsonResponse(response, 200, {
    ok: true,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    database,
    metrics,
    recentEvents
  });
}

function generateMultiplayerRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    const bytes = randomBytes(5);
    for (const byte of bytes) {
      code += alphabet[byte % alphabet.length];
    }
    if (!multiplayerRooms.has(code)) {
      return code;
    }
  }

  return randomUUID().slice(0, 6).toUpperCase();
}

function multiplayerPeerPayload(peer) {
  return {
    connectedAt: peer.connectedAt,
    id: peer.id,
    profile: peer.profile,
    role: peer.role
  };
}

function multiplayerRoomPayload(room) {
  return {
    code: room.code,
    createdAt: room.createdAt,
    hostPeerId: room.hostPeerId,
    maxPeers: room.maxPeers,
    peers: [...room.peers.values()].map(multiplayerPeerPayload)
  };
}

function sendMultiplayerMessage(peer, message) {
  if (!peer || peer.socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  peer.socket.send(JSON.stringify(message));
  return true;
}

function sendMultiplayerError(peer, code, message) {
  sendMultiplayerMessage(peer, {
    code,
    message,
    type: "error"
  });
}

function broadcastMultiplayerRoom(room, message, excludedPeerId = null) {
  for (const target of room.peers.values()) {
    if (target.id !== excludedPeerId) {
      sendMultiplayerMessage(target, message);
    }
  }
}

function leaveMultiplayerRoom(peer, reason = "left") {
  if (!peer.roomCode) {
    return;
  }

  const room = multiplayerRooms.get(peer.roomCode);
  peer.roomCode = null;
  peer.role = "idle";

  if (!room) {
    return;
  }

  room.peers.delete(peer.id);

  if (room.hostPeerId === peer.id) {
    for (const remainingPeer of room.peers.values()) {
      remainingPeer.roomCode = null;
      remainingPeer.role = "idle";
    }
    broadcastMultiplayerRoom(room, {
      reason,
      type: "room:closed"
    });
    multiplayerRooms.delete(room.code);
    recordEvent("info", "multiplayer_room_closed", "Multiplayer room closed.", {
      reason,
      roomCode: room.code
    });
    return;
  }

  if (room.peers.size === 0) {
    multiplayerRooms.delete(room.code);
    return;
  }

  broadcastMultiplayerRoom(room, {
    peerId: peer.id,
    reason,
    type: "peer:left"
  });
}

function createMultiplayerRoom(peer) {
  leaveMultiplayerRoom(peer, "switch_room");
  const code = generateMultiplayerRoomCode();
  const room = {
    code,
    createdAt: new Date().toISOString(),
    hostPeerId: peer.id,
    maxPeers: Math.max(2, multiplayerRoomMaxPeers),
    peers: new Map([[peer.id, peer]])
  };

  peer.roomCode = code;
  peer.role = "host";
  multiplayerRooms.set(code, room);
  metrics.multiplayerRoomsCreated += 1;
  recordEvent("info", "multiplayer_room_created", "Multiplayer room created.", {
    hostProfileId: peer.profile.id,
    roomCode: code
  });
  sendMultiplayerMessage(peer, {
    peerId: peer.id,
    room: multiplayerRoomPayload(room),
    type: "room:created"
  });
}

function joinMultiplayerRoom(peer, roomCode) {
  const code = String(roomCode ?? "").trim().toUpperCase();
  const room = multiplayerRooms.get(code);
  if (!room) {
    sendMultiplayerError(peer, "ROOM_NOT_FOUND", "Room not found.");
    return;
  }

  if (room.peers.size >= room.maxPeers && !room.peers.has(peer.id)) {
    sendMultiplayerError(peer, "ROOM_FULL", "Room is full.");
    return;
  }

  leaveMultiplayerRoom(peer, "switch_room");
  peer.roomCode = room.code;
  peer.role = room.hostPeerId === peer.id ? "host" : "guest";
  room.peers.set(peer.id, peer);

  sendMultiplayerMessage(peer, {
    peerId: peer.id,
    room: multiplayerRoomPayload(room),
    type: "room:joined"
  });
  broadcastMultiplayerRoom(
    room,
    {
      peer: multiplayerPeerPayload(peer),
      room: multiplayerRoomPayload(room),
      type: "peer:joined"
    },
    peer.id
  );
  recordEvent("info", "multiplayer_room_joined", "Player joined multiplayer room.", {
    peerId: peer.id,
    profileId: peer.profile.id,
    roomCode: room.code
  });
}

function forwardMultiplayerSignal(peer, message) {
  const room = peer.roomCode ? multiplayerRooms.get(peer.roomCode) : null;
  const target = room?.peers.get(message.targetPeerId);
  if (!room || !target || target.id === peer.id) {
    sendMultiplayerError(peer, "PEER_NOT_FOUND", "Peer is not available.");
    return;
  }

  sendMultiplayerMessage(target, {
    data: message.data,
    fromPeerId: peer.id,
    type: "signal"
  });
}

function relayMultiplayerGameMessage(peer, message) {
  const room = peer.roomCode ? multiplayerRooms.get(peer.roomCode) : null;
  if (!room) {
    sendMultiplayerError(peer, "ROOM_REQUIRED", "Join a room before sending game messages.");
    return;
  }

  if (message.targetPeerId) {
    const target = room.peers.get(message.targetPeerId);
    if (!target || target.id === peer.id) {
      sendMultiplayerError(peer, "PEER_NOT_FOUND", "Peer is not available.");
      return;
    }

    sendMultiplayerMessage(target, {
      data: message.data,
      fromPeerId: peer.id,
      relayed: true,
      type: "game:relay"
    });
    return;
  }

  if (room.hostPeerId === peer.id) {
    broadcastMultiplayerRoom(
      room,
      {
        data: message.data,
        fromPeerId: peer.id,
        relayed: true,
        type: "game:relay"
      },
      peer.id
    );
    return;
  }

  const host = room.peers.get(room.hostPeerId);
  if (!host) {
    sendMultiplayerError(peer, "HOST_MISSING", "Room host is not connected.");
    return;
  }

  sendMultiplayerMessage(host, {
    data: message.data,
    fromPeerId: peer.id,
    relayed: true,
    type: "game:relay"
  });
}

function handleMultiplayerMessage(peer, rawMessage) {
  const raw = Buffer.isBuffer(rawMessage) ? rawMessage.toString("utf8") : String(rawMessage);
  if (Buffer.byteLength(raw, "utf8") > jsonLimitBytes) {
    sendMultiplayerError(peer, "PAYLOAD_TOO_LARGE", "Multiplayer message is too large.");
    return;
  }

  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    sendMultiplayerError(peer, "INVALID_JSON", "Invalid multiplayer message.");
    return;
  }

  if (!message || typeof message.type !== "string") {
    sendMultiplayerError(peer, "INVALID_MESSAGE", "Invalid multiplayer message.");
    return;
  }

  metrics.multiplayerMessages += 1;

  switch (message.type) {
    case "room:create":
      createMultiplayerRoom(peer);
      break;
    case "room:join":
      joinMultiplayerRoom(peer, message.roomCode);
      break;
    case "room:leave":
      leaveMultiplayerRoom(peer, "left");
      sendMultiplayerMessage(peer, { type: "room:left" });
      break;
    case "signal":
      forwardMultiplayerSignal(peer, message);
      break;
    case "game:relay":
      relayMultiplayerGameMessage(peer, message);
      break;
    case "ping":
      sendMultiplayerMessage(peer, { at: new Date().toISOString(), type: "pong" });
      break;
    default:
      sendMultiplayerError(peer, "UNKNOWN_MESSAGE", "Unknown multiplayer message.");
      break;
  }
}

async function handleMultiplayerUpgrade(request, socket, head, url, wss) {
  const token = url.searchParams.get("token");
  let profile;
  try {
    profile = await requirePlayerToken(token);
  } catch (error) {
    const statusCode = error.statusCode ?? 401;
    socket.write(`HTTP/1.1 ${statusCode} Unauthorized\r\nConnection: close\r\n\r\n`);
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const peer = {
      connectedAt: new Date().toISOString(),
      id: `peer_${randomUUID()}`,
      profile: { id: profile.id, name: profile.name },
      role: "idle",
      roomCode: null,
      socket: ws
    };

    multiplayerPeers.set(peer.id, peer);
    metrics.multiplayerConnections += 1;
    sendMultiplayerMessage(peer, {
      peer: multiplayerPeerPayload(peer),
      protocolVersion: multiplayerProtocolVersion,
      type: "server:hello"
    });

    ws.on("message", (message) => handleMultiplayerMessage(peer, message));
    ws.on("close", () => {
      metrics.multiplayerDisconnects += 1;
      leaveMultiplayerRoom(peer, "disconnected");
      multiplayerPeers.delete(peer.id);
    });
    ws.on("error", (error) => {
      recordEvent("warning", "multiplayer_socket_error", "Multiplayer socket error.", {
        error: error.message,
        peerId: peer.id
      });
    });
  });
}

async function routeApi(request, response, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    metrics.apiRequests += 1;
    jsonResponse(response, 200, {
      ok: true,
      database: Boolean(databaseUrl),
      multiplayer: {
        peers: multiplayerPeers.size,
        rooms: multiplayerRooms.size
      },
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000)
    });
    return true;
  }

  if (!url.pathname.startsWith("/api/")) {
    return false;
  }

  metrics.apiRequests += 1;

  try {
    const body = request.method === "GET" || request.method === "DELETE" ? {} : await readJson(request);

    if (url.pathname === "/api/game/login" && request.method === "POST") {
      await handleGameLogin(response, body);
      return true;
    }

    if (url.pathname === "/api/game/register" && request.method === "POST") {
      await handleGameRegister(response, body);
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

    if (url.pathname === "/api/audio-config" && request.method === "GET") {
      await handleAudioConfigRead(response);
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

    if (url.pathname === "/api/admin/map-layout/revisions" && request.method === "GET") {
      await handleMapLayoutRevisionsRead(request, response);
      return true;
    }

    if (url.pathname === "/api/admin/map-layout/restore" && request.method === "POST") {
      await handleMapLayoutRestore(request, response, body);
      return true;
    }

    if (url.pathname === "/api/admin/audio-config" && request.method === "POST") {
      await handleAudioConfigSave(request, response, body);
      return true;
    }

    if (url.pathname === "/api/admin/audio-config" && request.method === "DELETE") {
      await handleAudioConfigReset(request, response);
      return true;
    }

    if (url.pathname === "/api/admin/audio-config/revisions" && request.method === "GET") {
      await handleAudioConfigRevisionsRead(request, response);
      return true;
    }

    if (url.pathname === "/api/admin/audio-config/restore" && request.method === "POST") {
      await handleAudioConfigRestore(request, response, body);
      return true;
    }

    if (url.pathname === "/api/admin/audio-provider" && request.method === "GET") {
      await handleAudioProviderSettingsRead(request, response);
      return true;
    }

    if (url.pathname === "/api/admin/audio-provider" && request.method === "POST") {
      await handleAudioProviderSettingsSave(request, response, body);
      return true;
    }

    if (url.pathname === "/api/admin/audio-provider/generate" && request.method === "POST") {
      await handleAudioProviderGenerate(request, response, body);
      return true;
    }

    if (url.pathname === "/api/admin/monitoring" && request.method === "GET") {
      await handleAdminMonitoring(request, response);
      return true;
    }

    jsonResponse(response, 404, { error: "API route not found." });
    return true;
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    if (statusCode === 500) {
      metrics.serverErrors += 1;
    }
    if (statusCode >= 500) {
      metrics.dbFailures += url.pathname.includes("save") || url.pathname.includes("map-layout") ? 1 : 0;
    }
    recordEvent(statusCode >= 500 ? "error" : "warning", "api_error", error.message, {
      code: error.code,
      path: url.pathname,
      statusCode
    });
    jsonResponse(response, statusCode, {
      code: error.code,
      error: statusCode === 500 ? "Server error." : error.message
    });
    return true;
  }
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp"
};

async function serveGeneratedAudio(response, url) {
  const filePath = generatedAudioFilePathFromUrl(url.pathname);
  if (!filePath) {
    jsonResponse(response, 403, { error: "Forbidden." });
    return;
  }

  try {
    await stat(filePath);
  } catch {
    jsonResponse(response, 404, { error: "Generated audio file not found." });
    return;
  }

  const ext = path.extname(filePath);
  response.writeHead(200, {
    "content-type": contentTypes[ext] ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
}

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

  if (url.pathname.startsWith("/generated-audio/")) {
    await serveGeneratedAudio(response, url);
    return;
  }

  await serveStatic(request, response, url);
});

const multiplayerWss = new WebSocketServer({ maxPayload: jsonLimitBytes, noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/api/multiplayer/ws") {
    socket.destroy();
    return;
  }

  void handleMultiplayerUpgrade(request, socket, head, url, multiplayerWss);
});

server.listen(port, () => {
  console.log(`Vendetta Vending server listening on ${port}`);
});
