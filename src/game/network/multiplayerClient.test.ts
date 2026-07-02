import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MultiplayerClient } from "./multiplayerClient";
import type { MultiplayerGameMessage } from "./protocol";

type Listener = (event: unknown) => void;
type Frame = { type: string; [key: string]: unknown };

// Minimal WebSocket stand-in: records sent frames and lets a test drive the
// open/message/close lifecycle the client subscribes to.
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  readonly protocols: string[];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string, protocols?: string | string[]) {
    this.protocols = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols];
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: Listener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(handler);
    this.listeners.set(type, arr);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }

  emit(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  message(payload: unknown): void {
    this.emit("message", { data: JSON.stringify(payload) });
  }

  sentFrames(): Frame[] {
    return this.sent.map((raw) => JSON.parse(raw) as Frame);
  }
}

class FakeDataChannel {
  readyState = "connecting";
  constructor(readonly label: string) {}
  addEventListener(): void {}
  send(): void {}
  close(): void {
    this.readyState = "closed";
  }
}

// Enough of RTCPeerConnection for the guest path (which initiates a connection to
// the host on join). The data channel never "opens", so sends fall back to relay.
class FakeRTCPeerConnection {
  signalingState = "stable";
  remoteDescription: unknown = null;
  constructor(_config?: unknown) {}
  createDataChannel(label: string): FakeDataChannel {
    return new FakeDataChannel(label);
  }
  async createOffer(): Promise<unknown> {
    return { type: "offer", sdp: "x" };
  }
  async createAnswer(): Promise<unknown> {
    return { type: "answer", sdp: "x" };
  }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(): Promise<void> {}
  async addIceCandidate(): Promise<void> {}
  addEventListener(): void {}
  close(): void {}
}

const peer = (id: string, role: string) => ({
  id,
  role,
  profile: { id: `prof_${id}`, name: id },
  connectedAt: "t"
});

const room = (hostId: string, ids: string[]) => ({
  code: "ABC",
  createdAt: "t",
  hostPeerId: hostId,
  maxPeers: 4,
  peers: ids.map((id) => peer(id, id === hostId ? "host" : "guest"))
});

const aCommand = { type: "command", commandId: "c1", command: {} } as unknown as MultiplayerGameMessage;
const socket = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
  vi.stubGlobal("window", { location: { protocol: "http:", host: "localhost:3000" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MultiplayerClient: connection", () => {
  it("connects to the multiplayer ws endpoint carrying the token as a subprotocol, not in the URL", () => {
    new MultiplayerClient("secret-tok").connect();
    expect(socket().url).toContain("/api/multiplayer/ws");
    expect(socket().url).not.toContain("secret-tok");
    expect(socket().protocols).toContain("vendetta.token.secret-tok");
    expect(socket().url.startsWith("ws://")).toBe(true);
  });

  it("does not open a second socket while one is already connecting/open", () => {
    const client = new MultiplayerClient("tok");
    client.connect();
    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    socket().open();
    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("queues server messages until the socket opens, then flushes them in order", () => {
    const client = new MultiplayerClient("tok");
    client.createRoom(); // connect() + sendServer(room:create) while still CONNECTING
    expect(socket().sent).toHaveLength(0);
    socket().open();
    expect(socket().sentFrames()).toEqual([{ type: "room:create" }]);
  });

  it("resets status to idle on an intentional disconnect", () => {
    const client = new MultiplayerClient("tok");
    client.createRoom();
    socket().open();
    socket().message({ type: "room:created", peerId: "me", room: room("me", ["me"]) });
    expect(client.getStatus().room).not.toBeNull();

    client.disconnect();
    socket().close();
    expect(client.getStatus().connection).toBe("idle");
    expect(client.getStatus().room).toBeNull();
    expect(client.getStatus().role).toBe("idle");
  });

  it("keeps trying to reconnect after an unexpected socket drop", () => {
    const client = new MultiplayerClient("tok");
    client.createRoom();
    socket().open();
    socket().message({ type: "room:created", peerId: "me", room: room("me", ["me"]) });

    socket().close(); // unexpected drop, no disconnect() first
    expect(client.getStatus().connection).toBe("connecting");
    client.disconnect(); // clear the pending reconnect timer so it doesn't leak past the test
  });
});

describe("MultiplayerClient: server messages", () => {
  it("applies server:hello (local peer + role)", () => {
    const client = new MultiplayerClient("tok");
    client.connect();
    socket().open();
    socket().message({ type: "server:hello", protocolVersion: 1, peer: peer("me", "idle") });
    expect(client.getStatus().localPeer?.id).toBe("me");
    expect(client.getStatus().role).toBe("idle");
  });

  it("becomes host on room:created", () => {
    const client = new MultiplayerClient("tok");
    client.createRoom();
    socket().open();
    socket().message({ type: "room:created", peerId: "me", room: room("me", ["me"]) });
    expect(client.isHost()).toBe(true);
    expect(client.getStatus().room?.code).toBe("ABC");
  });

  it("becomes guest on room:joined", () => {
    const client = new MultiplayerClient("tok");
    client.joinRoom("ABC");
    socket().open();
    socket().message({ type: "room:joined", peerId: "me", room: room("host", ["host", "me"]) });
    expect(client.isGuest()).toBe(true);
    expect(client.getStatus().room?.hostPeerId).toBe("host");
  });

  it("does not throw on an unparseable server frame and records a status message", () => {
    const client = new MultiplayerClient("tok");
    client.connect();
    socket().open();
    expect(() => socket().emit("message", { data: "{bad json" })).not.toThrow();
    expect(client.getStatus().message).toBe("Invalid multiplayer server message.");
  });
});

describe("MultiplayerClient: game message relay routing", () => {
  it("a host relays a game message to each guest over the server when no data channel is open", () => {
    const client = new MultiplayerClient("tok");
    client.createRoom();
    socket().open();
    socket().message({ type: "room:created", peerId: "me", room: room("me", ["me"]) });
    socket().message({ type: "peer:joined", peer: peer("guest", "guest"), room: room("me", ["me", "guest"]) });
    socket().sent.length = 0;

    client.sendGameMessage(aCommand);

    const relays = socket().sentFrames().filter((m) => m.type === "game:relay");
    expect(relays).toHaveLength(1);
    expect(relays[0]).toMatchObject({ targetPeerId: "guest", data: { type: "command", commandId: "c1" } });
  });

  it("a guest relays a game message to the host over the server", () => {
    const client = new MultiplayerClient("tok");
    client.joinRoom("ABC");
    socket().open();
    socket().message({ type: "room:joined", peerId: "me", room: room("host", ["host", "me"]) });
    socket().sent.length = 0;

    client.sendGameMessage(aCommand);

    const relays = socket().sentFrames().filter((m) => m.type === "game:relay");
    expect(relays).toHaveLength(1);
    expect(relays[0]).toMatchObject({ targetPeerId: "host" });
  });

  it("does nothing when sending a game message outside a room", () => {
    const client = new MultiplayerClient("tok");
    client.connect();
    socket().open();
    client.sendGameMessage(aCommand);
    expect(socket().sentFrames().filter((m) => m.type === "game:relay")).toHaveLength(0);
  });
});

describe("MultiplayerClient: subscriptions", () => {
  it("emits incoming relayed game messages to handlers and stops after unsubscribe", () => {
    const client = new MultiplayerClient("tok");
    const received: Array<{ message: unknown; from: string }> = [];
    const unsubscribe = client.onGameMessage((message, from) => received.push({ message, from }));
    client.connect();
    socket().open();

    socket().message({ type: "game:relay", fromPeerId: "host", data: { type: "snapshot", sequence: 1, state: {} } });
    expect(received).toHaveLength(1);
    expect(received[0].from).toBe("host");
    expect((received[0].message as { type: string }).type).toBe("snapshot");

    unsubscribe();
    socket().message({ type: "game:relay", fromPeerId: "host", data: { type: "snapshot", sequence: 2, state: {} } });
    expect(received).toHaveLength(1);
  });

  it("onStatus pushes the current status immediately and stops after unsubscribe", () => {
    const client = new MultiplayerClient("tok");
    let calls = 0;
    const unsubscribe = client.onStatus(() => {
      calls += 1;
    });
    expect(calls).toBe(1); // immediate snapshot

    unsubscribe();
    client.connect(); // would otherwise push a "connecting" status
    socket().open();
    expect(calls).toBe(1);
  });
});
