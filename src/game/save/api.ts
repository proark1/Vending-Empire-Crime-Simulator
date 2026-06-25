import type { GameState } from "../core/types";
import type { WorldMapLayout } from "../content/world";
import { migrateGameState } from "./storage";

const GAME_SESSION_KEY = "vendetta-vending.game-session.v1";
const ADMIN_SESSION_KEY = "vendetta-vending.admin-session.v1";

export interface GameSession {
  profile: {
    id: string;
    name: string;
  };
  token: string;
}

export interface AdminSession {
  admin: {
    name: string;
  };
  token: string;
}

interface GameLoginResponse extends GameSession {
  save: {
    state: GameState;
    updatedAt: string;
  } | null;
}

interface RemoteGameSaveResponse {
  profile: GameSession["profile"];
  save: {
    state: GameState;
    updatedAt: string;
  } | null;
}

interface RemoteMapLayoutResponse {
  layout: WorldMapLayout | null;
  updatedAt: string | null;
  updatedBy: string | null;
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
    throw new Error(message);
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

export async function loginGame(name: string, pin: string): Promise<GameLoginResponse> {
  const response = await requestJson<GameLoginResponse>("/api/game/login", {
    method: "POST",
    body: JSON.stringify({ name, pin })
  });
  storeGameSession({ profile: response.profile, token: response.token });
  return response.save ? { ...response, save: { ...response.save, state: migrateGameState(response.save.state) } } : response;
}

export async function loadRemoteGame(session: GameSession): Promise<RemoteGameSaveResponse> {
  const response = await requestJson<RemoteGameSaveResponse>("/api/game/save", {
    method: "GET",
    headers: authHeaders(session.token)
  });
  return response.save ? { ...response, save: { ...response.save, state: migrateGameState(response.save.state) } } : response;
}

export async function saveRemoteGame(session: GameSession, state: GameState): Promise<void> {
  await requestJson<{ ok: true }>("/api/game/save", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ state })
  });
}

export function saveRemoteGameBeacon(session: GameSession, state: GameState): boolean {
  const payload = JSON.stringify({ token: session.token, state });

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

export async function saveRemoteMapLayout(session: AdminSession, layout: WorldMapLayout): Promise<void> {
  await requestJson<{ ok: true }>("/api/admin/map-layout", {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ layout })
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
