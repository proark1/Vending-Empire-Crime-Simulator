import type { GameCommand, GameState } from "../core/types";

export type MultiplayerRole = "guest" | "host" | "idle";
export type MultiplayerConnectionState = "idle" | "connecting" | "connected" | "error";

export interface MultiplayerPeerProfile {
  id: string;
  name: string;
}

export interface MultiplayerPeer {
  connectedAt: string;
  id: string;
  profile: MultiplayerPeerProfile;
  role: MultiplayerRole;
}

export interface MultiplayerRoom {
  code: string;
  createdAt: string;
  hostPeerId: string;
  maxPeers: number;
  peers: MultiplayerPeer[];
}

export interface MultiplayerStatus {
  connection: MultiplayerConnectionState;
  directConnections: number;
  localPeer: MultiplayerPeer | null;
  message?: string;
  relayAvailable: boolean;
  room: MultiplayerRoom | null;
  role: MultiplayerRole;
}

export type MultiplayerGameMessage =
  | { command: GameCommand; commandId: string; type: "command" }
  | { sequence: number; state: GameState; type: "snapshot" };

export type MultiplayerServerMessage =
  | { peer: MultiplayerPeer; protocolVersion: number; type: "server:hello" }
  | { peerId: string; room: MultiplayerRoom; type: "room:created" }
  | { peerId: string; room: MultiplayerRoom; type: "room:joined" }
  | { type: "room:left" }
  | { reason: string; type: "room:closed" }
  | { peer: MultiplayerPeer; room: MultiplayerRoom; type: "peer:joined" }
  | { peerId: string; reason: string; type: "peer:left" }
  | { data: WebRtcSignal; fromPeerId: string; type: "signal" }
  | { data: MultiplayerGameMessage; fromPeerId: string; relayed: true; type: "game:relay" }
  | { code?: string; message: string; type: "error" }
  | { at: string; type: "pong" };

export type WebRtcSignal =
  | { description: RTCSessionDescriptionInit; kind: "description" }
  | { candidate: RTCIceCandidateInit; kind: "ice" };
