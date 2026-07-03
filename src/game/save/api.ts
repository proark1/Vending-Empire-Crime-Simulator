import type { GameState } from "../core/types";
import type { AudioAsset, AudioConfig } from "../content/audioConfig";
import type { AudioProviderSettings, ElevenLabsGenerationPrompt } from "../content/audioProvider";
import type { WorldMapLayout } from "../content/world";
import { migrateGameState } from "./storage";

const GAME_SESSION_KEY = "vendetta-vending.game-session.v1";
const ADMIN_SESSION_KEY = "vendetta-vending.admin-session.v1";

export interface GameSession {
  local?: boolean;
  profile: {
    id: string;
    name: string;
  };
  saveRevision?: number | null;
  saveUpdatedAt?: string | null;
  token: string;
}

export interface AdminSession {
  admin: {
    name: string;
  };
  token: string;
}

interface GameAuthResponse extends GameSession {
  save: {
    revision: number;
    state: GameState;
    updatedAt: string;
  } | null;
}

interface RemoteGameSaveResponse {
  profile: GameSession["profile"];
  save: {
    revision: number;
    state: GameState;
    updatedAt: string;
  } | null;
}

interface RemoteMapLayoutResponse {
  layout: WorldMapLayout | null;
  revision: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface RemoteAudioConfigResponse {
  config: AudioConfig | null;
  revision: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface RemoteAudioProviderSettingsResponse {
  revision: number | null;
  settings: AudioProviderSettings | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface GeneratedAudioResponse {
  asset: AudioAsset & {
    sizeBytes: number;
  };
  prompt: ElevenLabsGenerationPrompt;
}

export interface PlayerDataResetResponse {
  deletedSaves: number;
  deletedSessions: number;
  ok: true;
  playerCount: number;
}

export interface RemoteMapRevision {
  action: string;
  createdAt: string;
  createdBy: string | null;
  id: string;
  revision: number;
}

export interface RemoteAudioConfigRevision {
  action: string;
  createdAt: string;
  createdBy: string | null;
  id: string;
  revision: number;
}

export interface AdminMonitoringSnapshot {
  database: {
    latencyMs: number | null;
    ok: boolean;
  };
  liveOps: {
    issues: Array<{
      code: string;
      detail: string;
      profileName?: string;
      severity: "error" | "info" | "warning";
      title: string;
    }>;
    phaseCounts: Record<string, number>;
    players: Array<{
      activeAlarms: number;
      activeInspections: number;
      cash: number;
      day: number;
      flags: string[];
      heat: number;
      installedMachines: number;
      missionPhase: string;
      profileId: string;
      profileName: string;
      revision: number;
      saveAgeHours: number | null;
      stockUnits: number;
      unlockedDistricts: number;
      updatedAt: string | null;
    }>;
    summary: {
      activeAlarmPlayers: number;
      activeInspectionPlayers: number;
      averageRevision: number;
      endingPlayers: number;
      playerCount: number;
      profilesWithSaves: number;
      recentSaves: number;
      staleSaves: number;
      totalInstalledMachines: number;
    };
  };
  metrics: Record<string, number>;
  recentEvents: Array<{
    at: string;
    details?: Record<string, unknown>;
    level: "error" | "info" | "warning";
    message: string;
    type: string;
  }>;
  startedAt: string;
  uptimeSeconds: number;
}

export class ApiError extends Error {
  code?: string;
  payload: unknown;
  status: number;

  constructor(message: string, status: number, code: string | undefined, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.payload = payload;
    this.status = status;
  }
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Request failed.";
    throw new ApiError(message, response.status, typeof payload.code === "string" ? payload.code : undefined, payload);
  }

  return payload as T;
}

function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`
  };
}

export function loadStoredGameSession(): GameSession | null {
  const raw = window.localStorage.getItem(GAME_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as GameSession;
    return parsed?.token && parsed.profile?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function storeGameSession(session: GameSession): void {
  window.localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(session));
}

export function updateStoredGameSessionSaveRevision(revision: number | null, updatedAt: string | null): void {
  const session = loadStoredGameSession();
  if (!session) {
    return;
  }

  storeGameSession({
    ...session,
    saveRevision: revision,
    saveUpdatedAt: updatedAt
  });
}

export function clearStoredGameSession(): void {
  window.localStorage.removeItem(GAME_SESSION_KEY);
}

export function loadStoredAdminSession(): AdminSession | null {
  const raw = window.sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AdminSession;
    return parsed?.token && parsed.admin?.name ? parsed : null;
  } catch {
    return null;
  }
}

export function storeAdminSession(session: AdminSession): void {
  window.sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredAdminSession(): void {
  window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

function migrateGameAuthResponse(response: GameAuthResponse): GameAuthResponse {
  return response.save ? { ...response, save: { ...response.save, state: migrateGameState(response.save.state) } } : response;
}

export async function loginGame(name: string, pin: string): Promise<GameAuthResponse> {
  const response = await requestJson<GameAuthResponse>("/api/game/login", {
    method: "POST",
    body: JSON.stringify({ name, pin })
  });
  storeGameSession({ profile: response.profile, saveRevision: response.save?.revision ?? null, saveUpdatedAt: response.save?.updatedAt ?? null, token: response.token });
  return migrateGameAuthResponse(response);
}

export async function registerGame(name: string, pin: string): Promise<GameAuthResponse> {
  const response = await requestJson<GameAuthResponse>("/api/game/register", {
    method: "POST",
    body: JSON.stringify({ name, pin })
  });
  storeGameSession({ profile: response.profile, saveRevision: response.save?.revision ?? null, saveUpdatedAt: response.save?.updatedAt ?? null, token: response.token });
  return migrateGameAuthResponse(response);
}

export async function loadRemoteGame(session: GameSession): Promise<RemoteGameSaveResponse> {
  const response = await requestJson<RemoteGameSaveResponse>("/api/game/save", {
    method: "GET",
    headers: authHeaders(session.token)
  });
  updateStoredGameSessionSaveRevision(response.save?.revision ?? null, response.save?.updatedAt ?? null);
  return response.save ? { ...response, save: { ...response.save, state: migrateGameState(response.save.state) } } : response;
}

export async function saveRemoteGame(session: GameSession, state: GameState, baseRevision: number | null = session.saveRevision ?? null): Promise<{ revision: number; updatedAt: string }> {
  const response = await requestJson<{ ok: true; revision: number; updatedAt: string }>("/api/game/save", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ baseRevision, state })
  });
  updateStoredGameSessionSaveRevision(response.revision, response.updatedAt);
  return { revision: response.revision, updatedAt: response.updatedAt };
}

export function saveRemoteGameBeacon(session: GameSession, state: GameState, baseRevision: number | null = session.saveRevision ?? null): boolean {
  const payload = JSON.stringify({ baseRevision, token: session.token, state });

  if (navigator.sendBeacon) {
    return navigator.sendBeacon("/api/game/save-beacon", new Blob([payload], { type: "application/json" }));
  }

  void fetch("/api/game/save-beacon", {
    body: payload,
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST"
  });
  return false;
}

export async function loginAdmin(name: string, pin: string): Promise<AdminSession> {
  const session = await requestJson<AdminSession>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ name, pin })
  });
  storeAdminSession(session);
  return session;
}

export async function loadRemoteMapLayout(): Promise<RemoteMapLayoutResponse> {
  return requestJson<RemoteMapLayoutResponse>("/api/map-layout", {
    method: "GET"
  });
}

export async function loadRemoteAudioConfig(): Promise<RemoteAudioConfigResponse> {
  return requestJson<RemoteAudioConfigResponse>("/api/audio-config", {
    method: "GET"
  });
}

export interface LeaderboardEntry {
  rank: number;
  empireName: string;
  cash: number;
  machines: number;
  districts: number;
  day: number;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await requestJson<{ leaderboard: LeaderboardEntry[] }>("/api/leaderboard", {
    method: "GET"
  });
  return Array.isArray(response.leaderboard) ? response.leaderboard : [];
}

export async function loadAdminAudioProviderSettings(session: AdminSession): Promise<RemoteAudioProviderSettingsResponse> {
  return requestJson<RemoteAudioProviderSettingsResponse>("/api/admin/audio-provider", {
    method: "GET",
    headers: authHeaders(session.token)
  });
}

export async function saveRemoteMapLayout(session: AdminSession, layout: WorldMapLayout): Promise<{ revision: number; updatedAt: string; updatedBy: string }> {
  return requestJson<{ ok: true; revision: number; updatedAt: string; updatedBy: string }>("/api/admin/map-layout", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ layout })
  });
}

export async function saveRemoteAudioConfig(session: AdminSession, config: AudioConfig): Promise<{ revision: number; updatedAt: string; updatedBy: string }> {
  return requestJson<{ ok: true; revision: number; updatedAt: string; updatedBy: string }>("/api/admin/audio-config", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ config })
  });
}

export async function saveAdminAudioProviderSettings(session: AdminSession, settings: AudioProviderSettings, options: { clearApiKey?: boolean } = {}): Promise<RemoteAudioProviderSettingsResponse> {
  return requestJson<RemoteAudioProviderSettingsResponse>("/api/admin/audio-provider", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ clearApiKey: options.clearApiKey === true, settings })
  });
}

export async function generateAdminAudio(session: AdminSession, settings: AudioProviderSettings, prompt: ElevenLabsGenerationPrompt): Promise<GeneratedAudioResponse> {
  return requestJson<GeneratedAudioResponse>("/api/admin/audio-provider/generate", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ prompt, settings })
  });
}

export async function loadRemoteMapRevisions(session: AdminSession): Promise<RemoteMapRevision[]> {
  const response = await requestJson<{ revisions: RemoteMapRevision[] }>("/api/admin/map-layout/revisions", {
    method: "GET",
    headers: authHeaders(session.token)
  });
  return response.revisions;
}

export async function loadRemoteAudioConfigRevisions(session: AdminSession): Promise<RemoteAudioConfigRevision[]> {
  const response = await requestJson<{ revisions: RemoteAudioConfigRevision[] }>("/api/admin/audio-config/revisions", {
    method: "GET",
    headers: authHeaders(session.token)
  });
  return response.revisions;
}

export async function restoreRemoteMapRevision(session: AdminSession, revisionId: string): Promise<RemoteMapLayoutResponse> {
  return requestJson<RemoteMapLayoutResponse>("/api/admin/map-layout/restore", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ revisionId })
  });
}

export async function restoreRemoteAudioConfigRevision(session: AdminSession, revisionId: string): Promise<RemoteAudioConfigResponse> {
  return requestJson<RemoteAudioConfigResponse>("/api/admin/audio-config/restore", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ revisionId })
  });
}

export async function loadAdminMonitoring(session: AdminSession): Promise<AdminMonitoringSnapshot> {
  return requestJson<AdminMonitoringSnapshot>("/api/admin/monitoring", {
    method: "GET",
    headers: authHeaders(session.token)
  });
}

export async function resetRemotePlayerData(session: AdminSession): Promise<PlayerDataResetResponse> {
  return requestJson<PlayerDataResetResponse>("/api/admin/player-data", {
    method: "DELETE",
    headers: authHeaders(session.token)
  });
}

export async function resetRemoteMapLayout(session: AdminSession): Promise<void> {
  const response = await fetch("/api/admin/map-layout", {
    headers: authHeaders(session.token),
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "Reset failed.");
  }
}

export async function resetRemoteAudioConfig(session: AdminSession): Promise<void> {
  const response = await fetch("/api/admin/audio-config", {
    headers: authHeaders(session.token),
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "Reset failed.");
  }
}
