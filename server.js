import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { analyzeLiveOpsSaveRows } from "./liveOpsAnalyzer.js";
import { createRoomManager, sweepDeadConnections } from "./roomManager.js";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const generatedAudioDir = path.join(__dirname, "generated-audio");
const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;
const isProductionRuntime = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT === "production" || process.env.RAILWAY_ENVIRONMENT_NAME === "production";
// Never fall back to a committed default in production — a publicly-known admin
// credential (seeded live) is a full remote takeover with data-wipe + PII-read
// reach. Locally, a dev-only fallback keeps `npm start` working without config.
// In production, an unset ADMIN_NAME/ADMIN_PIN leaves these empty so
// ensureSeededAdminUser() refuses to seed and logs a warning instead.
const seedAdminName = process.env.ADMIN_NAME || (isProductionRuntime ? "" : "assad");
const seedAdminPin = process.env.ADMIN_PIN || (isProductionRuntime ? "" : "dev-pin-1234");
const sessionDays = Number(process.env.SESSION_DAYS ?? 14);
// Admin sessions are high-privilege (data wipe, PII read, config edits), so they
// live hours, not the 14-day player window, and can be revoked via logout.
const adminSessionHours = Math.max(1, Number(process.env.ADMIN_SESSION_HOURS ?? 12));
const jsonLimitBytes = Number(process.env.JSON_LIMIT_BYTES ?? 8 * 1024 * 1024);
// A real GameState serializes well under this; the generous 8MB HTTP limit only
// needs to cover admin map/audio payloads. Reject bloated saves so one profile
// can't stuff the DB (or OOM the monitoring dashboard) with a giant blob.
const gameSaveLimitBytes = Number(process.env.GAME_SAVE_LIMIT_BYTES ?? 2 * 1024 * 1024);
// Multiplayer frames (commands + snapshots) are tiny next to admin JSON, so the
// relay gets a much smaller cap of its own instead of inheriting the 8MB limit.
const multiplayerMaxPayloadBytes = Number(process.env.MULTIPLAYER_MAX_PAYLOAD_BYTES ?? 512 * 1024);
const multiplayerMaxSocketsPerProfile = Number(process.env.MULTIPLAYER_MAX_SOCKETS_PER_PROFILE ?? 3);
const multiplayerMessagesPerSecond = Number(process.env.MULTIPLAYER_MESSAGES_PER_SECOND ?? 40);
const multiplayerJoinsPerMinute = Number(process.env.MULTIPLAYER_JOINS_PER_MINUTE ?? 12);
// How many past save revisions to retain per profile for admin restore.
const gameSaveRevisionHistory = Math.max(0, Number(process.env.GAME_SAVE_REVISION_HISTORY ?? 10));
// Cap on how many player saves the admin monitoring query pulls into memory.
const monitoringSaveLimit = Math.max(1, Number(process.env.MONITORING_SAVE_LIMIT ?? 100));
const startedAt = new Date();

// Last-resort guards so a stray async error can't silently take the whole server
// (and every connected player) down. These log instead of letting the process die.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  // Node leaves the process in an undefined state after an uncaught exception, so
  // the correct move is to log and exit and let the supervisor (Railway) restart
  // a clean process — rather than keep serving every connected player from a
  // half-broken event loop. Set UNCAUGHT_KEEP_ALIVE=1 to fall back to
  // log-and-continue if a deploy ever needs it.
  console.error("Uncaught exception:", error);
  if (process.env.UNCAUGHT_KEEP_ALIVE === "1") {
    return;
  }
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100).unref?.();
});

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
  multiplayerTimeouts: 0,
  playerDataResets: 0,
  serverErrors: 0
};

const multiplayerRoomMaxPeers = Number(process.env.MULTIPLAYER_ROOM_MAX_PEERS ?? 4);
// Live peer sockets, kept only so the admin "reset player data" path can force
// them closed; all room/peer/relay state lives in the unit-tested room manager.
const multiplayerSockets = new Map();
// profileId -> live socket count, so one session token can't open unbounded sockets.
const multiplayerSocketsByProfile = new Map();
const multiplayerRoomManager = createRoomManager({
  maxPeers: multiplayerRoomMaxPeers,
  maxMessageBytes: multiplayerMaxPayloadBytes,
  maxMessagesPerSecond: multiplayerMessagesPerSecond,
  maxJoinsPerMinute: multiplayerJoinsPerMinute,
  log: recordEvent,
  onRoomCreated: () => {
    metrics.multiplayerRoomsCreated += 1;
  }
});

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

function adminSessionExpiry() {
  return new Date(Date.now() + adminSessionHours * 60 * 60 * 1000);
}

function createPinRecord(pin) {
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    hash: hashPin(pin, salt)
  };
}

// TLS policy for the Postgres connection.
// - PGSSLMODE=disable    -> no TLS (local dev).
// - PGSSL_CA set         -> verify the server cert against the provided CA (verify-full).
// - PGSSL_VERIFY=1       -> verify against the system trust store.
// - otherwise            -> encrypted but unverified (rejectUnauthorized:false).
// The last is the historical default and stays the default so managed providers
// with self-signed internal certs (e.g. Railway) keep working, but it now warns
// in production so an operator can opt into verification.
function resolvePostgresSsl() {
  if (process.env.PGSSLMODE === "disable") {
    return false;
  }
  if (process.env.PGSSL_CA) {
    return { ca: process.env.PGSSL_CA, rejectUnauthorized: true };
  }
  if (process.env.PGSSL_VERIFY === "1") {
    return { rejectUnauthorized: true };
  }
  if (isProductionRuntime) {
    recordEvent("warning", "postgres_ssl_unverified", "Postgres TLS certificate is not verified. Set PGSSL_CA or PGSSL_VERIFY=1 to enable verification.");
  }
  return { rejectUnauthorized: false };
}

function getPool() {
  if (!databaseUrl) {
    throw Object.assign(new Error("DATABASE_URL is not configured."), { statusCode: 503 });
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: resolvePostgresSsl()
    });
    // An idle client emitting 'error' (e.g. the DB dropping the connection) throws
    // on the pool and would crash the process for every connected player. Log and
    // let the pool recycle the client instead.
    pool.on("error", (error) => {
      console.error("Postgres pool error (idle client):", error.message);
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

        CREATE TABLE IF NOT EXISTS game_save_revisions (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          state JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS game_save_revisions_profile_idx ON game_save_revisions(profile_id, created_at DESC);

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

        CREATE TABLE IF NOT EXISTS generated_audio (
          filename TEXT PRIMARY KEY,
          content_type TEXT NOT NULL,
          bytes BYTEA NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
    if (isProductionRuntime) {
      recordEvent("warning", "admin_seed_missing", "ADMIN_NAME and ADMIN_PIN must be configured to seed or rotate the admin account.");
    }
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

// Defense-in-depth HTTP headers applied to every response. Set via setHeader
// before any writeHead so per-response headers (content-type, cache-control)
// merge on top. CSP is self-contained (the whole app is same-origin, all assets
// procedural) but can be disabled with DISABLE_CSP=1 if a build ever needs it.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self' ws: wss:"
].join("; ");

function applyBaseSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "same-origin");
  if (isProductionRuntime) {
    response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  if (process.env.DISABLE_CSP !== "1") {
    response.setHeader("content-security-policy", contentSecurityPolicy);
  }
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
    [hashValue(token), name, adminSessionExpiry()]
  );
  return token;
}

// Revoke the presented admin token so a leaked/stale session can be killed
// server-side before its (now short) expiry.
async function handleAdminLogout(request, response) {
  const token = bearerToken(request);
  if (token) {
    await ensureDatabase();
    await getPool().query("DELETE FROM admin_sessions WHERE token_hash = $1", [hashValue(token)]);
  }
  emptyResponse(response, 204);
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

// --- Login throttling -------------------------------------------------------
// Single-process server, so an in-memory Map is enough to blunt PIN brute-force
// on the HTTP login endpoints. We track failures on two keys per attempt — one
// per client IP and one per account name — so neither "hammer one account from
// many IPs" nor "hammer many accounts from one IP" slips through. A successful
// login clears the keys; a locked key answers 429 with Retry-After.
const loginAttempts = new Map();
const loginMaxFails = Math.max(1, Number(process.env.LOGIN_MAX_FAILS ?? 8));
const loginWindowMs = Math.max(1000, Number(process.env.LOGIN_WINDOW_MS ?? 15 * 60 * 1000));
const loginLockMs = Math.max(1000, Number(process.env.LOGIN_LOCK_MS ?? 15 * 60 * 1000));

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? "unknown";
}

function loginKeys(scope, request, accountName) {
  const account = String(accountName ?? "").trim().toLowerCase();
  return [`${scope}:ip:${clientIp(request)}`, `${scope}:acct:${account}`];
}

// Returns the largest remaining lockout (ms) across the given keys, or 0 if none
// are locked. Also drops entries whose window has fully expired.
function loginLockRemainingMs(keys) {
  const now = Date.now();
  let remaining = 0;
  for (const key of keys) {
    const entry = loginAttempts.get(key);
    if (!entry) continue;
    if (entry.lockedUntil > now) {
      remaining = Math.max(remaining, entry.lockedUntil - now);
    } else if (entry.lockedUntil <= now && entry.firstFailAt + loginWindowMs <= now) {
      loginAttempts.delete(key);
    }
  }
  return remaining;
}

function recordLoginFailure(keys) {
  const now = Date.now();
  for (const key of keys) {
    const entry = loginAttempts.get(key) ?? { fails: 0, firstFailAt: now, lockedUntil: 0 };
    if (entry.firstFailAt + loginWindowMs <= now) {
      entry.fails = 0;
      entry.firstFailAt = now;
    }
    entry.fails += 1;
    if (entry.fails >= loginMaxFails) {
      entry.lockedUntil = now + loginLockMs;
    }
    loginAttempts.set(key, entry);
  }
  // Bound memory: prune fully-expired entries if the map grows unusually large.
  if (loginAttempts.size > 5000) {
    for (const [key, entry] of loginAttempts) {
      if (entry.lockedUntil <= now && entry.firstFailAt + loginWindowMs <= now) {
        loginAttempts.delete(key);
      }
    }
  }
}

function clearLoginFailures(keys) {
  for (const key of keys) {
    loginAttempts.delete(key);
  }
}

function respondLoginThrottled(response, remainingMs) {
  const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
  response.writeHead(429, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "retry-after": String(retryAfter)
  });
  response.end(JSON.stringify({ error: "Too many attempts. Try again later." }));
}

async function handleGameLogin(request, response, body) {
  const credentials = validateGameCredentials(body);
  if (credentials.error) {
    jsonResponse(response, 400, { error: credentials.error });
    return;
  }

  const throttleKeys = loginKeys("game", request, credentials.nameKey);
  const lockedMs = loginLockRemainingMs(throttleKeys);
  if (lockedMs > 0) {
    respondLoginThrottled(response, lockedMs);
    return;
  }

  await ensureDatabase();
  const db = getPool();
  const existing = await db.query("SELECT * FROM player_profiles WHERE name_key = $1", [credentials.nameKey]);
  let profile = existing.rows[0];

  if (!profile) {
    recordLoginFailure(throttleKeys);
    jsonResponse(response, 401, { error: "Name or PIN is incorrect." });
    return;
  }

  const expectedHash = hashPin(credentials.pin, profile.pin_salt);
  if (!safeEqual(expectedHash, profile.pin_hash)) {
    recordLoginFailure(throttleKeys);
    jsonResponse(response, 401, { error: "Name or PIN is incorrect." });
    return;
  }

  clearLoginFailures(throttleKeys);

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

// Cheap structural sanity check so a truncated write or a hand-crafted POST can't
// persist a save that later throws in the client's migrator and bricks the account.
// This is deliberately shallow — it rejects obvious garbage, not every invariant.
function validateGameSaveState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return "Game state must be an object.";
  }
  if (typeof state.version !== "number" || !Number.isFinite(state.version)) {
    return "Game state is missing a numeric version.";
  }
  for (const key of ["playerFactionId", "factions", "machines"]) {
    if (!(key in state)) {
      return `Game state is missing required field: ${key}.`;
    }
  }
  if (typeof state.factions !== "object" || state.factions === null) {
    return "Game state factions are malformed.";
  }
  return null;
}

async function handleGameSave(request, response, body) {
  const profile = await requirePlayer(request, body?.token);
  const shapeError = validateGameSaveState(body?.state);
  if (shapeError) {
    jsonResponse(response, 400, { error: shapeError });
    return;
  }

  const stateBytes = Buffer.byteLength(JSON.stringify(body.state), "utf8");
  if (stateBytes > gameSaveLimitBytes) {
    recordEvent("warning", "game_save_too_large", "Rejected oversized game save.", { profileId: profile.id, stateBytes });
    jsonResponse(response, 413, { error: "Save data is too large." });
    return;
  }

  const baseRevision = typeof body.baseRevision === "number" && Number.isFinite(body.baseRevision) ? Math.max(0, Math.floor(body.baseRevision)) : null;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
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
      await client.query("ROLLBACK");
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

    // Retain a bounded history per profile so a corrupt/regretted save can be
    // rolled back from the admin console instead of being gone forever.
    if (gameSaveRevisionHistory > 0) {
      await client.query(
        "INSERT INTO game_save_revisions (id, profile_id, revision, state) VALUES ($1, $2, $3, $4)",
        [randomUUID(), profile.id, result.rows[0].revision, body.state]
      );
      await client.query(
        `DELETE FROM game_save_revisions
          WHERE profile_id = $1
            AND id NOT IN (
              SELECT id FROM game_save_revisions WHERE profile_id = $1 ORDER BY created_at DESC LIMIT $2
            )`,
        [profile.id, gameSaveRevisionHistory]
      );
    }

    await client.query("COMMIT");
    metrics.gameSaves += 1;
    jsonResponse(response, 200, { ok: true, updatedAt: result.rows[0].updated_at, revision: result.rows[0].revision });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function handleGameSaveRead(request, response) {
  const profile = await requirePlayer(request);
  const save = await getPool().query("SELECT state, updated_at, revision FROM game_saves WHERE profile_id = $1", [profile.id]);
  jsonResponse(response, 200, {
    profile,
    save: save.rows[0] ? { state: save.rows[0].state, updatedAt: save.rows[0].updated_at, revision: save.rows[0].revision } : null
  });
}

async function handleAdminLogin(request, response, body) {
  const name = normalizeName(body?.name);
  const pin = String(body?.pin ?? "").trim();

  const throttleKeys = loginKeys("admin", request, name);
  const lockedMs = loginLockRemainingMs(throttleKeys);
  if (lockedMs > 0) {
    respondLoginThrottled(response, lockedMs);
    return;
  }

  // Shape the input before touching the DB so the admin path isn't the least
  // validated login. Charset stays permissive (admin PINs may be passphrases),
  // but empty/absurd lengths are rejected as a failed attempt.
  if (name.length === 0 || pin.length < 4 || pin.length > 128) {
    recordLoginFailure(throttleKeys);
    jsonResponse(response, 401, { error: "Admin name or PIN is incorrect." });
    return;
  }

  await ensureDatabase();
  const result = await getPool().query(
    "SELECT name, pin_salt, pin_hash, role FROM admin_users WHERE name_key = $1 AND active = true",
    [name.toLowerCase()]
  );
  const admin = result.rows[0];
  const expectedHash = admin ? hashPin(pin, admin.pin_salt) : "";

  if (!admin || !safeEqual(expectedHash, admin.pin_hash)) {
    recordLoginFailure(throttleKeys);
    metrics.adminFailedLogins += 1;
    recordEvent("warning", "admin_login_failed", "Admin login failed.", { name });
    jsonResponse(response, 401, { error: "Admin name or PIN is incorrect." });
    return;
  }

  clearLoginFailures(throttleKeys);
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

function isGeneratedAudioFileUrl(urlValue) {
  return Boolean(generatedAudioFilePathFromUrl(urlValue));
}

async function generatedAudioSizeFromUrl(urlValue) {
  const filePath = generatedAudioFilePathFromUrl(urlValue);
  if (!filePath) {
    return null;
  }

  // Fast path: the disk cache for this container still has the file.
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      return fileStat.size;
    }
  } catch {
    // Disk cache miss — fall through to the persisted DB copy below.
  }

  // The container filesystem is ephemeral on Railway (wiped on every redeploy), so
  // the disk cache is empty even though the bytes are safe in Postgres. Mirror the
  // serveGeneratedAudio() DB fallback here so the admin status reflects the durable
  // copy instead of reporting a false "Missing file" for audio that still plays.
  if (databaseUrl) {
    try {
      await ensureDatabase();
      const filename = path.basename(filePath);
      const result = await getPool().query("SELECT size_bytes FROM generated_audio WHERE filename = $1", [filename]);
      const sizeBytes = result.rows[0]?.size_bytes;
      if (typeof sizeBytes === "number" && sizeBytes > 0) {
        return sizeBytes;
      }
    } catch (error) {
      console.error("generated audio size DB read failed:", error.message);
    }
  }

  return null;
}

async function enrichAudioConfigFileSizes(config) {
  if (!config || typeof config !== "object" || !Array.isArray(config.assets)) {
    return config;
  }

  const assets = await Promise.all(config.assets.map(async (asset) => {
    if (!asset || typeof asset !== "object") {
      return asset;
    }

    if (isGeneratedAudioFileUrl(asset.url)) {
      return { ...asset, sizeBytes: await generatedAudioSizeFromUrl(asset.url) };
    }

    if (asset.sizeBytes) {
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
    if (!prompt.generatedUrl) {
      return prompt;
    }

    if (isGeneratedAudioFileUrl(prompt.generatedUrl)) {
      return { ...prompt, generatedSizeBytes: await generatedAudioSizeFromUrl(prompt.generatedUrl) };
    }

    if (prompt.generatedSizeBytes) {
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

  const generatedAt = new Date().toISOString();
  const filename = `${safeFileSegment(prompt.purpose)}-${safeFileSegment(prompt.id)}-${Date.now()}.mp3`;
  const filePath = path.join(generatedAudioDir, filename);

  // Persist the bytes in Postgres — the container filesystem is ephemeral on
  // Railway (wiped on every redeploy), so disk-only files vanish and the saved
  // prompts play back as "missing". The DB copy survives; the disk copy is just a
  // best-effort same-container cache that serveGeneratedAudio falls back from.
  await getPool().query(
    `INSERT INTO generated_audio (filename, content_type, bytes, size_bytes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (filename) DO UPDATE SET content_type = EXCLUDED.content_type, bytes = EXCLUDED.bytes, size_bytes = EXCLUDED.size_bytes, created_at = now()`,
    [filename, "audio/mpeg", audio, audio.length]
  );
  try {
    await mkdir(generatedAudioDir, { recursive: true });
    await writeFile(filePath, audio);
  } catch (error) {
    console.error("generated audio disk cache write failed (serving from DB):", error.message);
  }

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
  const admin = await requireAdmin(request);
  // Monitoring returns every player's profile name + progress — treat reads as
  // PII access and log who pulled the dossier, so access is auditable.
  recordEvent("info", "admin_monitoring_read", "Admin read the player monitoring dossier (PII).", { by: admin.name });
  let database = { ok: false, latencyMs: null };
  let liveOps = analyzeLiveOpsSaveRows([]);
  if (databaseUrl) {
    const started = Date.now();
    try {
      const client = await getPool().connect();
      try {
        await client.query("SELECT 1");
        const saves = await client.query(`
          SELECT
            player_profiles.id AS profile_id,
            player_profiles.name,
            game_saves.state,
            game_saves.revision,
            game_saves.updated_at
          FROM player_profiles
          LEFT JOIN game_saves ON game_saves.profile_id = player_profiles.id
          ORDER BY game_saves.updated_at DESC NULLS LAST, player_profiles.last_login_at DESC NULLS LAST
          LIMIT $1
        `, [monitoringSaveLimit]);
        liveOps = analyzeLiveOpsSaveRows(saves.rows);
      } finally {
        client.release();
      }
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
    liveOps,
    metrics,
    recentEvents
  });
}

async function handlePlayerDataReset(request, response) {
  const admin = await requireAdmin(request);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const players = await client.query("SELECT count(*)::integer AS count FROM player_profiles");
    const saves = await client.query("DELETE FROM game_saves RETURNING profile_id");
    const sessions = await client.query("DELETE FROM player_sessions RETURNING token_hash");
    await client.query("COMMIT");

    for (const ws of multiplayerSockets.values()) {
      ws.close(4001, "Player data reset");
    }

    metrics.playerDataResets += 1;
    recordEvent("warning", "player_data_reset", "All player saves were reset.", {
      by: admin.name,
      deletedSaves: saves.rowCount,
      deletedSessions: sessions.rowCount,
      playerCount: players.rows[0]?.count ?? 0
    });
    jsonResponse(response, 200, {
      ok: true,
      deletedSaves: saves.rowCount,
      deletedSessions: sessions.rowCount,
      playerCount: players.rows[0]?.count ?? 0
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "player_data_reset_failed", "Player data reset failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function handleGameSaveRevisionsRead(request, response, url) {
  await requireAdmin(request);
  const profileId = String(url.searchParams.get("profileId") ?? "").trim();
  if (!profileId) {
    jsonResponse(response, 400, { error: "Missing profileId." });
    return;
  }

  const result = await getPool().query(
    `SELECT id, revision, created_at
       FROM game_save_revisions
      WHERE profile_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [profileId]
  );
  jsonResponse(response, 200, {
    revisions: result.rows.map((row) => ({ id: row.id, revision: row.revision, createdAt: row.created_at }))
  });
}

async function handleGameSaveRestore(request, response, body) {
  const admin = await requireAdmin(request);
  const profileId = String(body?.profileId ?? "").trim();
  const revisionId = String(body?.revisionId ?? "").trim();
  if (!profileId || !revisionId) {
    jsonResponse(response, 400, { error: "Missing profileId or revisionId." });
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const snapshot = await client.query(
      "SELECT state FROM game_save_revisions WHERE id = $1 AND profile_id = $2",
      [revisionId, profileId]
    );
    if (!snapshot.rows[0]) {
      await client.query("ROLLBACK");
      jsonResponse(response, 404, { error: "Save revision not found." });
      return;
    }

    const restored = await client.query(
      `INSERT INTO game_saves (profile_id, state, revision, updated_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (profile_id)
       DO UPDATE SET state = EXCLUDED.state, revision = game_saves.revision + 1, updated_at = now()
       RETURNING revision, updated_at`,
      [profileId, snapshot.rows[0].state]
    );
    const row = restored.rows[0];
    if (gameSaveRevisionHistory > 0) {
      await client.query(
        "INSERT INTO game_save_revisions (id, profile_id, revision, state) VALUES ($1, $2, $3, $4)",
        [randomUUID(), profileId, row.revision, snapshot.rows[0].state]
      );
    }
    await client.query("COMMIT");
    recordEvent("warning", "game_save_restored", "Player save restored from revision.", { by: admin.name, profileId, revisionId });
    jsonResponse(response, 200, { ok: true, revision: row.revision, updatedAt: row.updated_at });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    metrics.failedWrites += 1;
    recordEvent("error", "game_save_restore_failed", "Player save restore failed.", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

// The session token is read from the Sec-WebSocket-Protocol header
// ("vendetta.token.<token>") so it stays out of the request URL (and therefore out
// of proxy/edge access logs). The old "?token=" query param is still accepted so a
// client from a previous deploy keeps working during rollout.
function multiplayerTokenFromRequest(request, url) {
  const header = request.headers["sec-websocket-protocol"];
  if (typeof header === "string") {
    for (const raw of header.split(",")) {
      const value = raw.trim();
      if (value.startsWith("vendetta.token.")) {
        return value.slice("vendetta.token.".length);
      }
    }
  }
  return url.searchParams.get("token");
}

async function handleMultiplayerUpgrade(request, socket, head, url, wss) {
  const token = multiplayerTokenFromRequest(request, url);
  let profile;
  try {
    profile = await requirePlayerToken(token);
  } catch (error) {
    const statusCode = error.statusCode ?? 401;
    socket.write(`HTTP/1.1 ${statusCode} Unauthorized\r\nConnection: close\r\n\r\n`);
    socket.destroy();
    return;
  }

  const activeForProfile = multiplayerSocketsByProfile.get(profile.id) ?? 0;
  if (activeForProfile >= multiplayerMaxSocketsPerProfile) {
    recordEvent("warning", "multiplayer_socket_limit", "Rejected multiplayer socket over per-profile cap.", { profileId: profile.id });
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const peerId = `peer_${randomUUID()}`;
    multiplayerSockets.set(peerId, ws);
    multiplayerSocketsByProfile.set(profile.id, (multiplayerSocketsByProfile.get(profile.id) ?? 0) + 1);
    metrics.multiplayerConnections += 1;
    multiplayerRoomManager.addPeer({
      id: peerId,
      profile: { id: profile.id, name: profile.name },
      send: (message) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      }
    });

    // WS-level heartbeat: the browser auto-pongs our pings, re-arming isAlive so the
    // sweep can tell a live socket from a half-open one.
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (message) => {
      if (multiplayerRoomManager.handleMessage(peerId, message)) {
        metrics.multiplayerMessages += 1;
      }
    });
    ws.on("close", () => {
      metrics.multiplayerDisconnects += 1;
      multiplayerRoomManager.removePeer(peerId, "disconnected");
      multiplayerSockets.delete(peerId);
      const remaining = (multiplayerSocketsByProfile.get(profile.id) ?? 1) - 1;
      if (remaining > 0) {
        multiplayerSocketsByProfile.set(profile.id, remaining);
      } else {
        multiplayerSocketsByProfile.delete(profile.id);
      }
    });
    ws.on("error", (error) => {
      recordEvent("warning", "multiplayer_socket_error", "Multiplayer socket error.", {
        error: error.message,
        peerId
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
        peers: multiplayerRoomManager.peerCount,
        rooms: multiplayerRoomManager.roomCount
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
      await handleGameLogin(request, response, body);
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
      await handleAdminLogin(request, response, body);
      return true;
    }

    if (url.pathname === "/api/admin/logout" && request.method === "POST") {
      await handleAdminLogout(request, response);
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

    if (url.pathname === "/api/admin/player-data" && request.method === "DELETE") {
      await handlePlayerDataReset(request, response);
      return true;
    }

    if (url.pathname === "/api/admin/game-saves/revisions" && request.method === "GET") {
      await handleGameSaveRevisionsRead(request, response, url);
      return true;
    }

    if (url.pathname === "/api/admin/game-saves/restore" && request.method === "POST") {
      await handleGameSaveRestore(request, response, body);
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

  const ext = path.extname(filePath);

  // Fast path: the disk cache for this container still has the file.
  let onDisk = true;
  try {
    await stat(filePath);
  } catch {
    onDisk = false;
  }
  if (onDisk) {
    response.writeHead(200, {
      "content-type": contentTypes[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable"
    });
    createReadStream(filePath).pipe(response);
    return;
  }

  // Disk copy is gone (ephemeral container redeployed) — serve the persisted DB
  // copy and re-cache it to disk for the rest of this container's life.
  if (databaseUrl) {
    try {
      await ensureDatabase();
      const filename = path.basename(filePath);
      const result = await getPool().query("SELECT content_type, bytes FROM generated_audio WHERE filename = $1", [filename]);
      const row = result.rows[0];
      if (row?.bytes) {
        void mkdir(generatedAudioDir, { recursive: true }).then(() => writeFile(filePath, row.bytes)).catch(() => {});
        response.writeHead(200, {
          "content-type": row.content_type ?? contentTypes[ext] ?? "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable"
        });
        response.end(row.bytes);
        return;
      }
    } catch (error) {
      console.error("generated audio DB read failed:", error.message);
    }
  }

  jsonResponse(response, 404, { error: "Generated audio file not found." });
}

async function serveStatic(request, response, url) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    // Malformed percent-encoding (e.g. "GET /%") — answer cleanly instead of
    // letting the URIError reject the async handler and leave the socket hanging.
    jsonResponse(response, 400, { error: "Bad request." });
    return;
  }

  const safePath = decodedPath === "/" ? "/index.html" : decodedPath;
  let filePath = path.normalize(path.join(distDir, safePath));

  // Require the separator (or an exact match) so a sibling like "dist-backup"
  // whose path also startsWith "dist" can't be escaped into.
  if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
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
    "x-content-type-options": "nosniff",
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  applyBaseSecurityHeaders(response);
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

const multiplayerWss = new WebSocketServer({
  maxPayload: multiplayerMaxPayloadBytes,
  noServer: true,
  // The client offers ["vendetta.v1", "vendetta.token.<token>"]; we select only the
  // non-secret marker so the browser handshake completes without the server ever
  // echoing the token back in the response header.
  handleProtocols: (protocols) => (protocols.has("vendetta.v1") ? "vendetta.v1" : false)
});

// Reap half-open sockets (laptop sleep, crash, network drop) that never sent a
// close frame — otherwise a ghost peer lingers in its room, and a ghost host keeps
// the room open forever so guests never get room:closed. terminate() fires 'close',
// which routes cleanup back through the room manager.
const multiplayerHeartbeatMs = Number(process.env.MULTIPLAYER_HEARTBEAT_MS ?? 30000);
const multiplayerHeartbeat = setInterval(() => {
  metrics.multiplayerTimeouts += sweepDeadConnections(multiplayerWss.clients);
}, multiplayerHeartbeatMs);
multiplayerHeartbeat.unref?.();
multiplayerWss.on("close", () => clearInterval(multiplayerHeartbeat));

function isAllowedWebSocketOrigin(request) {
  if (process.env.WS_ALLOW_CROSS_ORIGIN === "1") {
    return true;
  }
  const origin = request.headers.origin;
  if (!origin) {
    // No Origin header = a non-browser client. Allowed only outside production so
    // local tooling still connects; in production a browser always sends Origin.
    return !isProductionRuntime;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/api/multiplayer/ws") {
    socket.destroy();
    return;
  }

  // Reject cross-origin WebSocket handshakes in all environments (CSWSH defense).
  // A missing Origin (non-browser client) is allowed only outside production, and
  // WS_ALLOW_CROSS_ORIGIN=1 opts out entirely for local tooling on another port.
  if (!isAllowedWebSocketOrigin(request)) {
    recordEvent("warning", "multiplayer_bad_origin", "Rejected multiplayer upgrade from disallowed origin.", { origin: request.headers.origin });
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  void handleMultiplayerUpgrade(request, socket, head, url, multiplayerWss);
});

server.listen(port, () => {
  console.log(`Vendetta Vending server listening on ${port}`);
});
