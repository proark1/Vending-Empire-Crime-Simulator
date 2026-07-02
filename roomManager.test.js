import { describe, it, expect, vi } from "vitest";
import { createRoomManager, MULTIPLAYER_PROTOCOL_VERSION, sweepDeadConnections } from "./roomManager.js";

// A test harness around the manager: each "connection" captures the messages the
// manager sends to that peer, and `send` feeds a JSON frame in as a client would.
function setup(opts = {}) {
  let codeSeq = 0;
  const manager = createRoomManager({
    now: () => "2026-01-01T00:00:00.000Z",
    makeRoomCode: () => `ROOM${++codeSeq}`,
    maxPeers: opts.maxPeers,
    maxMessageBytes: opts.maxMessageBytes,
    onRoomCreated: opts.onRoomCreated,
    log: opts.log
  });
  const inboxes = new Map();
  const connect = (id) => {
    const inbox = [];
    inboxes.set(id, inbox);
    manager.addPeer({ id, profile: { id: `prof_${id}`, name: id }, send: (m) => inbox.push(m) });
    return inbox;
  };
  const send = (id, message) => manager.handleMessage(id, JSON.stringify(message));
  const sendRaw = (id, raw) => manager.handleMessage(id, raw);
  const last = (inbox) => inbox[inbox.length - 1];
  const types = (inbox) => inbox.map((m) => m.type);
  const clearAll = () => inboxes.forEach((inbox) => (inbox.length = 0));
  // Create a room hosted by `hostId` and return its code.
  const createRoom = (hostId) => {
    send(hostId, { type: "room:create" });
    return last(inboxes.get(hostId)).room.code;
  };
  return { manager, connect, send, sendRaw, inboxes, last, types, clearAll, createRoom };
}

describe("roomManager: handshake", () => {
  it("greets a new peer with server:hello carrying the protocol version", () => {
    const t = setup();
    const inbox = t.connect("a");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      type: "server:hello",
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      peer: { id: "a", role: "idle", profile: { id: "prof_a", name: "a" } }
    });
    expect(t.manager.peerCount).toBe(1);
  });
});

describe("roomManager: rooms", () => {
  it("creates a room and makes the creator the host", () => {
    const onRoomCreated = vi.fn();
    const t = setup({ onRoomCreated });
    t.connect("a");
    const type = t.send("a", { type: "room:create" });
    expect(type).toBe("room:create");
    const msg = t.last(t.inboxes.get("a"));
    expect(msg).toMatchObject({ type: "room:created", peerId: "a" });
    expect(msg.room).toMatchObject({ code: "ROOM1", hostPeerId: "a", peers: [{ id: "a", role: "host" }] });
    expect(t.manager.roomCount).toBe(1);
    expect(onRoomCreated).toHaveBeenCalledTimes(1);
  });

  it("lets a second peer join as guest and notifies the host (excluding the joiner)", () => {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host");
    t.clearAll();

    t.send("guest", { type: "room:join", roomCode: code });

    const guestMsgs = t.inboxes.get("guest");
    expect(t.last(guestMsgs)).toMatchObject({ type: "room:joined", peerId: "guest" });
    expect(t.last(guestMsgs).room.peers.map((p) => p.id)).toEqual(["host", "guest"]);
    expect(t.last(guestMsgs).room.peers.find((p) => p.id === "guest").role).toBe("guest");

    const hostMsgs = t.inboxes.get("host");
    expect(t.types(hostMsgs)).toContain("peer:joined");
    expect(t.last(hostMsgs)).toMatchObject({ type: "peer:joined", peer: { id: "guest", role: "guest" } });
    // The joiner must not receive its own peer:joined broadcast.
    expect(t.types(guestMsgs)).not.toContain("peer:joined");
  });

  it("normalizes the room code (trim + uppercase) on join", () => {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host"); // "ROOM1"
    t.clearAll();
    t.send("guest", { type: "room:join", roomCode: `  ${code.toLowerCase()}  ` });
    expect(t.last(t.inboxes.get("guest")).type).toBe("room:joined");
  });

  it("rejects joining an unknown room", () => {
    const t = setup();
    t.connect("a");
    t.send("a", { type: "room:join", roomCode: "NOPE" });
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "error", code: "ROOM_NOT_FOUND" });
  });

  it("rejects joining a full room", () => {
    const t = setup({ maxPeers: 2 });
    t.connect("host");
    t.connect("g1");
    t.connect("g2");
    const code = t.createRoom("host");
    t.send("g1", { type: "room:join", roomCode: code });
    t.clearAll();
    t.send("g2", { type: "room:join", roomCode: code });
    expect(t.last(t.inboxes.get("g2"))).toMatchObject({ type: "error", code: "ROOM_FULL" });
    expect(t.manager.rooms.get(code).peers.size).toBe(2);
  });

  it("floors maxPeers at 2 even if configured lower", () => {
    const t = setup({ maxPeers: 1 });
    t.connect("host");
    t.connect("g1");
    const code = t.createRoom("host");
    t.send("g1", { type: "room:join", roomCode: code });
    expect(t.last(t.inboxes.get("g1")).type).toBe("room:joined");
    expect(t.manager.rooms.get(code).maxPeers).toBe(2);
  });
});

describe("roomManager: leaving", () => {
  it("closes the room for everyone when the host disconnects", () => {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host");
    t.send("guest", { type: "room:join", roomCode: code });
    t.clearAll();

    t.manager.removePeer("host", "disconnected");

    expect(t.last(t.inboxes.get("guest"))).toMatchObject({ type: "room:closed", reason: "disconnected" });
    expect(t.manager.roomCount).toBe(0);
    expect(t.manager.peers.has("host")).toBe(false);
    // The guest is still connected, just back to idle.
    expect(t.manager.peers.get("guest").role).toBe("idle");
    expect(t.manager.peers.get("guest").roomCode).toBeNull();
  });

  it("keeps the room and tells the host when a guest disconnects", () => {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host");
    t.send("guest", { type: "room:join", roomCode: code });
    t.clearAll();

    t.manager.removePeer("guest", "disconnected");

    expect(t.last(t.inboxes.get("host"))).toMatchObject({ type: "peer:left", peerId: "guest", reason: "disconnected" });
    expect(t.manager.roomCount).toBe(1);
    expect(t.manager.rooms.get(code).peers.has("guest")).toBe(false);
  });

  it("handles an explicit room:leave (sender gets room:left, others peer:left)", () => {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host");
    t.send("guest", { type: "room:join", roomCode: code });
    t.clearAll();

    const type = t.send("guest", { type: "room:leave" });

    expect(type).toBe("room:leave");
    expect(t.last(t.inboxes.get("guest"))).toMatchObject({ type: "room:left" });
    expect(t.last(t.inboxes.get("host"))).toMatchObject({ type: "peer:left", peerId: "guest", reason: "left" });
    // Guest stays connected but idle, room persists for the host.
    expect(t.manager.peers.get("guest").roomCode).toBeNull();
    expect(t.manager.roomCount).toBe(1);
  });

  it("deletes an empty room when its last non-host peer leaves", () => {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host");
    t.send("guest", { type: "room:join", roomCode: code });
    // Host leaves the room via message (not disconnect): host is the host, so the
    // room closes. Use a guest-only path instead: host disconnects already covered.
    // Here verify removePeer of host then guest empties cleanly.
    t.manager.removePeer("guest");
    t.manager.removePeer("host");
    expect(t.manager.roomCount).toBe(0);
  });
});

describe("roomManager: game relay routing", () => {
  function room2() {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host");
    t.send("guest", { type: "room:join", roomCode: code });
    t.clearAll();
    return t;
  }

  it("routes a guest's undirected relay to the host only", () => {
    const t = room2();
    t.send("guest", { type: "game:relay", data: { type: "command", commandId: "c1", command: { kind: "noop" } } });
    expect(t.last(t.inboxes.get("host"))).toMatchObject({
      type: "game:relay",
      relayed: true,
      fromPeerId: "guest",
      data: { type: "command", commandId: "c1" }
    });
    expect(t.inboxes.get("guest")).toHaveLength(0);
  });

  it("fans out a host's undirected relay to guests but not back to the host", () => {
    const t = setup();
    t.connect("host");
    t.connect("g1");
    t.connect("g2");
    const code = t.createRoom("host");
    t.send("g1", { type: "room:join", roomCode: code });
    t.send("g2", { type: "room:join", roomCode: code });
    t.clearAll();

    t.send("host", { type: "game:relay", data: { type: "snapshot", sequence: 1, state: {} } });

    expect(t.last(t.inboxes.get("g1"))).toMatchObject({ type: "game:relay", fromPeerId: "host" });
    expect(t.last(t.inboxes.get("g2"))).toMatchObject({ type: "game:relay", fromPeerId: "host" });
    expect(t.inboxes.get("host")).toHaveLength(0);
  });

  it("delivers a directed relay only to the named peer", () => {
    const t = room2();
    t.send("host", { type: "game:relay", targetPeerId: "guest", data: { type: "snapshot", sequence: 2, state: {} } });
    expect(t.last(t.inboxes.get("guest"))).toMatchObject({ type: "game:relay", fromPeerId: "host" });
    expect(t.inboxes.get("host")).toHaveLength(0);
  });

  it("forbids a guest addressing another guest directly (no snapshot hijack)", () => {
    const t = setup();
    t.connect("host");
    t.connect("g1");
    t.connect("g2");
    const code = t.createRoom("host");
    t.send("g1", { type: "room:join", roomCode: code });
    t.send("g2", { type: "room:join", roomCode: code });
    t.clearAll();

    t.send("g1", { type: "game:relay", targetPeerId: "g2", data: { type: "snapshot", sequence: 999, state: {} } });
    expect(t.last(t.inboxes.get("g1"))).toMatchObject({ type: "error", code: "RELAY_FORBIDDEN" });
    expect(t.inboxes.get("g2")).toHaveLength(0);
  });

  it("still lets a guest address the host directly", () => {
    const t = room2();
    t.send("guest", { type: "game:relay", targetPeerId: "host", data: { type: "command", commandId: "c9", command: {} } });
    expect(t.last(t.inboxes.get("host"))).toMatchObject({ type: "game:relay", fromPeerId: "guest", data: { commandId: "c9" } });
  });

  it("rejects a relay before joining a room", () => {
    const t = setup();
    t.connect("a");
    t.send("a", { type: "game:relay", data: { type: "snapshot", sequence: 1, state: {} } });
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "error", code: "ROOM_REQUIRED" });
  });

  it("rejects a directed relay to a peer outside the room (no cross-room leak)", () => {
    const t = setup();
    t.connect("hostA");
    t.connect("hostB");
    t.createRoom("hostA");
    t.createRoom("hostB");
    t.clearAll();
    t.send("hostA", { type: "game:relay", targetPeerId: "hostB", data: { type: "snapshot", sequence: 1, state: {} } });
    expect(t.last(t.inboxes.get("hostA"))).toMatchObject({ type: "error", code: "PEER_NOT_FOUND" });
    expect(t.inboxes.get("hostB")).toHaveLength(0);
  });
});

describe("roomManager: signaling relay", () => {
  it("forwards a signal to the target peer tagged with the sender", () => {
    const t = setup();
    t.connect("host");
    t.connect("guest");
    const code = t.createRoom("host");
    t.send("guest", { type: "room:join", roomCode: code });
    t.clearAll();

    t.send("guest", { type: "signal", targetPeerId: "host", data: { kind: "ice", candidate: {} } });
    expect(t.last(t.inboxes.get("host"))).toMatchObject({ type: "signal", fromPeerId: "guest", data: { kind: "ice" } });
  });

  it("errors when signaling a peer that is not in the room", () => {
    const t = setup();
    t.connect("a");
    t.createRoom("a");
    t.clearAll();
    t.send("a", { type: "signal", targetPeerId: "ghost", data: { kind: "ice", candidate: {} } });
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "error", code: "PEER_NOT_FOUND" });
  });
});

describe("roomManager: protocol robustness", () => {
  it("answers ping with pong", () => {
    const t = setup();
    t.connect("a");
    t.clearAll();
    expect(t.send("a", { type: "ping" })).toBe("ping");
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "pong", at: "2026-01-01T00:00:00.000Z" });
  });

  it("rejects invalid JSON without throwing", () => {
    const t = setup();
    t.connect("a");
    t.clearAll();
    expect(t.sendRaw("a", "{not json")).toBeNull();
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "error", code: "INVALID_JSON" });
  });

  it("rejects a message with no string type", () => {
    const t = setup();
    t.connect("a");
    t.clearAll();
    expect(t.send("a", { foo: 1 })).toBeNull();
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
  });

  it("rejects an unknown message type but counts it as handled", () => {
    const t = setup();
    t.connect("a");
    t.clearAll();
    expect(t.send("a", { type: "bogus" })).toBe("bogus");
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "error", code: "UNKNOWN_MESSAGE" });
  });

  it("rejects an over-sized frame", () => {
    const t = setup({ maxMessageBytes: 64 });
    t.connect("a");
    t.clearAll();
    const big = JSON.stringify({ type: "game:relay", data: { blob: "x".repeat(200) } });
    expect(t.sendRaw("a", big)).toBeNull();
    expect(t.last(t.inboxes.get("a"))).toMatchObject({ type: "error", code: "PAYLOAD_TOO_LARGE" });
  });

  it("ignores messages from an unknown peer id", () => {
    const t = setup();
    expect(t.send("ghost", { type: "room:create" })).toBeNull();
    expect(t.manager.roomCount).toBe(0);
  });
});

describe("roomManager: rate limiting", () => {
  it("rate-limits a peer that floods messages, then refills over time", () => {
    let clock = 1000;
    const manager = createRoomManager({ now: () => "t", nowMs: () => clock, maxMessagesPerSecond: 5 });
    const inbox = [];
    manager.addPeer({ id: "a", profile: { id: "pa", name: "a" }, send: (m) => inbox.push(m) });

    for (let i = 0; i < 5; i += 1) {
      expect(manager.handleMessage("a", JSON.stringify({ type: "ping" }))).toBe("ping");
    }
    // 6th message in the same instant exhausts the bucket.
    expect(manager.handleMessage("a", JSON.stringify({ type: "ping" }))).toBeNull();
    expect(inbox[inbox.length - 1]).toMatchObject({ type: "error", code: "RATE_LIMITED" });

    // A second later the bucket has refilled.
    clock += 1000;
    expect(manager.handleMessage("a", JSON.stringify({ type: "ping" }))).toBe("ping");
  });

  it("throttles repeated room:join attempts (room-code brute force)", () => {
    let clock = 1000;
    const manager = createRoomManager({ now: () => "t", nowMs: () => clock, maxJoinsPerMinute: 3 });
    const inbox = [];
    manager.addPeer({ id: "a", profile: { id: "pa", name: "a" }, send: (m) => inbox.push(m) });

    for (let i = 0; i < 3; i += 1) {
      manager.handleMessage("a", JSON.stringify({ type: "room:join", roomCode: "NOPE" }));
    }
    // The join bucket is now empty even though message tokens remain.
    manager.handleMessage("a", JSON.stringify({ type: "room:join", roomCode: "NOPE" }));
    expect(inbox[inbox.length - 1]).toMatchObject({ type: "error", code: "JOIN_RATE_LIMITED" });
  });
});

describe("sweepDeadConnections (heartbeat)", () => {
  const fakeWs = (isAlive, { pingThrows = false } = {}) => ({
    isAlive,
    terminated: false,
    pinged: false,
    terminate() {
      this.terminated = true;
    },
    ping() {
      this.pinged = true;
      if (pingThrows) {
        throw new Error("socket closing");
      }
    }
  });

  it("terminates a socket that did not pong since the last sweep", () => {
    const dead = fakeWs(false);
    expect(sweepDeadConnections([dead])).toBe(1);
    expect(dead.terminated).toBe(true);
    expect(dead.pinged).toBe(false);
  });

  it("pings and re-arms a live socket instead of terminating it", () => {
    const live = fakeWs(true);
    expect(sweepDeadConnections([live])).toBe(0);
    expect(live.terminated).toBe(false);
    expect(live.pinged).toBe(true);
    expect(live.isAlive).toBe(false); // re-armed for the next sweep; pong will flip it back
  });

  it("treats a brand-new socket (isAlive undefined) as alive on the first sweep", () => {
    const fresh = fakeWs(undefined);
    expect(sweepDeadConnections([fresh])).toBe(0);
    expect(fresh.terminated).toBe(false);
    expect(fresh.pinged).toBe(true);
  });

  it("reaps only the dead sockets in a mixed set and counts them", () => {
    const a = fakeWs(true);
    const b = fakeWs(false);
    const c = fakeWs(true);
    const d = fakeWs(false);
    expect(sweepDeadConnections([a, b, c, d])).toBe(2);
    expect([a.terminated, b.terminated, c.terminated, d.terminated]).toEqual([false, true, false, true]);
    expect([a.pinged, c.pinged]).toEqual([true, true]);
  });

  it("keeps sweeping if a ping throws on a tearing-down socket", () => {
    const flaky = fakeWs(true, { pingThrows: true });
    const next = fakeWs(false);
    expect(() => sweepDeadConnections([flaky, next])).not.toThrow();
    expect(next.terminated).toBe(true);
  });
});
