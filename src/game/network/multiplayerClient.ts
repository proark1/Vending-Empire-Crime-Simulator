import type {
  MultiplayerGameMessage,
  MultiplayerPeer,
  MultiplayerRoom,
  MultiplayerServerMessage,
  MultiplayerStatus,
  WebRtcSignal
} from "./protocol";

interface PeerConnectionEntry {
  channel: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  peerId: string;
  pc: RTCPeerConnection;
}

type StatusHandler = (status: MultiplayerStatus) => void;
type GameMessageHandler = (message: MultiplayerGameMessage, fromPeerId: string) => void;

const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function multiplayerSocketUrl(token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL("/api/multiplayer/ws", `${protocol}//${window.location.host}`);
  url.searchParams.set("token", token);
  return url.toString();
}

function emptyStatus(): MultiplayerStatus {
  return {
    connection: "idle",
    directConnections: 0,
    localPeer: null,
    relayAvailable: false,
    room: null,
    role: "idle"
  };
}

export class MultiplayerClient {
  private readonly gameHandlers = new Set<GameMessageHandler>();
  private readonly peerConnections = new Map<string, PeerConnectionEntry>();
  private readonly pendingServerMessages: unknown[] = [];
  private readonly statusHandlers = new Set<StatusHandler>();
  private status: MultiplayerStatus = emptyStatus();
  private socket: WebSocket | null = null;

  constructor(private readonly token: string) {}

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    this.updateStatus({
      connection: "connecting",
      message: undefined,
      relayAvailable: false
    });

    const socket = new WebSocket(multiplayerSocketUrl(this.token));
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.updateStatus({
        connection: "connected",
        relayAvailable: true
      });
      while (this.pendingServerMessages.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(this.pendingServerMessages.shift()));
      }
    });

    socket.addEventListener("message", (event) => {
      this.handleServerMessage(event.data);
    });

    socket.addEventListener("close", () => {
      this.closePeerConnections();
      this.socket = null;
      this.updateStatus({
        connection: "idle",
        directConnections: 0,
        localPeer: null,
        relayAvailable: false,
        room: null,
        role: "idle"
      });
    });

    socket.addEventListener("error", () => {
      this.updateStatus({
        connection: "error",
        message: "Multiplayer connection failed.",
        relayAvailable: false
      });
    });
  }

  disconnect(): void {
    this.sendServer({ type: "room:leave" });
    this.socket?.close();
    this.closePeerConnections();
    this.pendingServerMessages.length = 0;
  }

  createRoom(): void {
    this.connect();
    this.sendServer({ type: "room:create" });
  }

  joinRoom(roomCode: string): void {
    this.connect();
    this.sendServer({ roomCode, type: "room:join" });
  }

  leaveRoom(): void {
    this.sendServer({ type: "room:leave" });
    this.closePeerConnections();
    this.updateStatus({
      directConnections: 0,
      room: null,
      role: "idle"
    });
  }

  sendGameMessage(message: MultiplayerGameMessage): void {
    const room = this.status.room;
    const localPeer = this.status.localPeer;
    if (!room || !localPeer) {
      return;
    }

    if (this.status.role === "host") {
      for (const peer of room.peers) {
        if (peer.id === localPeer.id) {
          continue;
        }

        if (!this.sendDataChannel(peer.id, message)) {
          this.sendServer({ data: message, targetPeerId: peer.id, type: "game:relay" });
        }
      }
      return;
    }

    const hostPeerId = room.hostPeerId;
    if (hostPeerId === localPeer.id) {
      return;
    }

    if (!this.sendDataChannel(hostPeerId, message)) {
      this.sendServer({ data: message, targetPeerId: hostPeerId, type: "game:relay" });
    }
  }

  getStatus(): MultiplayerStatus {
    return this.status;
  }

  isHost(): boolean {
    return this.status.role === "host";
  }

  isGuest(): boolean {
    return this.status.role === "guest";
  }

  onGameMessage(handler: GameMessageHandler): () => void {
    this.gameHandlers.add(handler);
    return () => this.gameHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  private emitGameMessage(message: MultiplayerGameMessage, fromPeerId: string): void {
    for (const handler of this.gameHandlers) {
      handler(message, fromPeerId);
    }
  }

  private handleServerMessage(raw: unknown): void {
    let message: MultiplayerServerMessage;
    try {
      message = JSON.parse(String(raw)) as MultiplayerServerMessage;
    } catch {
      this.updateStatus({ message: "Invalid multiplayer server message." });
      return;
    }

    switch (message.type) {
      case "server:hello":
        this.updateStatus({
          localPeer: message.peer,
          role: message.peer.role
        });
        break;
      case "room:created":
      case "room:joined":
        this.updateRoom(message.room, message.peerId);
        break;
      case "room:left":
        this.closePeerConnections();
        this.updateStatus({
          directConnections: 0,
          message: "Left multiplayer room.",
          room: null,
          role: "idle"
        });
        break;
      case "room:closed":
        this.closePeerConnections();
        this.updateStatus({
          directConnections: 0,
          message: `Room closed: ${message.reason}.`,
          room: null,
          role: "idle"
        });
        break;
      case "peer:joined":
        this.updateRoom(message.room);
        break;
      case "peer:left":
        this.closePeerConnection(message.peerId);
        this.updateRoomPeers((peers) => peers.filter((peer) => peer.id !== message.peerId));
        break;
      case "signal":
        void this.handleSignal(message.fromPeerId, message.data);
        break;
      case "game:relay":
        this.emitGameMessage(message.data, message.fromPeerId);
        break;
      case "error":
        this.updateStatus({ message: message.message });
        break;
      case "pong":
        break;
      default:
        break;
    }
  }

  private updateRoom(room: MultiplayerRoom, localPeerId = this.status.localPeer?.id): void {
    const localPeer = room.peers.find((peer) => peer.id === localPeerId) ?? this.status.localPeer;
    this.updateStatus({
      localPeer,
      message: undefined,
      room,
      role: localPeer?.role ?? "idle"
    });
    this.syncPeerConnections();
  }

  private updateRoomPeers(updater: (peers: MultiplayerPeer[]) => MultiplayerPeer[]): void {
    const room = this.status.room;
    if (!room) {
      return;
    }

    this.updateRoom({
      ...room,
      peers: updater(room.peers)
    });
  }

  private syncPeerConnections(): void {
    const room = this.status.room;
    const localPeer = this.status.localPeer;
    if (!room || !localPeer) {
      return;
    }

    for (const peerId of this.peerConnections.keys()) {
      if (!room.peers.some((peer) => peer.id === peerId)) {
        this.closePeerConnection(peerId);
      }
    }

    if (this.status.role === "guest" && room.hostPeerId !== localPeer.id) {
      void this.startPeerConnection(room.hostPeerId);
    }
  }

  private async startPeerConnection(peerId: string): Promise<void> {
    const entry = this.getOrCreatePeerConnection(peerId, true);
    if (entry.pc.signalingState !== "stable") {
      return;
    }

    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    this.sendSignal(peerId, {
      description: offer,
      kind: "description"
    });
  }

  private getOrCreatePeerConnection(peerId: string, initiator: boolean): PeerConnectionEntry {
    const existing = this.peerConnections.get(peerId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers });
    const entry: PeerConnectionEntry = {
      channel: null,
      pendingIce: [],
      pc,
      peerId
    };
    this.peerConnections.set(peerId, entry);

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, {
          candidate: event.candidate.toJSON(),
          kind: "ice"
        });
      }
    });

    pc.addEventListener("connectionstatechange", () => this.refreshDirectConnectionCount());
    pc.addEventListener("iceconnectionstatechange", () => this.refreshDirectConnectionCount());
    pc.addEventListener("datachannel", (event) => {
      this.attachDataChannel(peerId, event.channel);
    });

    if (initiator) {
      this.attachDataChannel(peerId, pc.createDataChannel("vendetta-game", { ordered: true }));
    }

    this.refreshDirectConnectionCount();
    return entry;
  }

  private attachDataChannel(peerId: string, channel: RTCDataChannel): void {
    const entry = this.peerConnections.get(peerId);
    if (!entry) {
      channel.close();
      return;
    }

    entry.channel = channel;
    channel.addEventListener("open", () => this.refreshDirectConnectionCount());
    channel.addEventListener("close", () => this.refreshDirectConnectionCount());
    channel.addEventListener("error", () => this.refreshDirectConnectionCount());
    channel.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { data?: MultiplayerGameMessage; type?: string };
        if (payload.type === "game" && payload.data) {
          this.emitGameMessage(payload.data, peerId);
        }
      } catch {
        this.updateStatus({ message: "Invalid peer message." });
      }
    });
  }

  private async handleSignal(peerId: string, signal: WebRtcSignal): Promise<void> {
    const entry = this.getOrCreatePeerConnection(peerId, false);

    if (signal.kind === "description") {
      await entry.pc.setRemoteDescription(signal.description);
      await this.flushPendingIce(entry);

      if (signal.description.type === "offer") {
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        this.sendSignal(peerId, {
          description: answer,
          kind: "description"
        });
      }
      return;
    }

    if (!entry.pc.remoteDescription) {
      entry.pendingIce.push(signal.candidate);
      return;
    }

    await entry.pc.addIceCandidate(signal.candidate);
  }

  private async flushPendingIce(entry: PeerConnectionEntry): Promise<void> {
    while (entry.pendingIce.length > 0) {
      await entry.pc.addIceCandidate(entry.pendingIce.shift());
    }
  }

  private sendSignal(targetPeerId: string, data: WebRtcSignal): void {
    this.sendServer({
      data,
      targetPeerId,
      type: "signal"
    });
  }

  private sendDataChannel(peerId: string, data: MultiplayerGameMessage): boolean {
    const channel = this.peerConnections.get(peerId)?.channel;
    if (!channel || channel.readyState !== "open") {
      return false;
    }

    channel.send(JSON.stringify({ data, type: "game" }));
    return true;
  }

  private sendServer(message: unknown): void {
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }

    this.pendingServerMessages.push(message);
  }

  private closePeerConnection(peerId: string): void {
    const entry = this.peerConnections.get(peerId);
    if (!entry) {
      return;
    }

    entry.channel?.close();
    entry.pc.close();
    this.peerConnections.delete(peerId);
    this.refreshDirectConnectionCount();
  }

  private closePeerConnections(): void {
    for (const peerId of [...this.peerConnections.keys()]) {
      this.closePeerConnection(peerId);
    }
  }

  private refreshDirectConnectionCount(): void {
    let directConnections = 0;
    for (const entry of this.peerConnections.values()) {
      if (entry.channel?.readyState === "open") {
        directConnections += 1;
      }
    }
    this.updateStatus({ directConnections });
  }

  private updateStatus(next: Partial<MultiplayerStatus>): void {
    this.status = {
      ...this.status,
      ...next
    };
    for (const handler of this.statusHandlers) {
      handler(this.status);
    }
  }
}
