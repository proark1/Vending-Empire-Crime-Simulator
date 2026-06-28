// Multiplayer room/peer state machine, extracted from server.js so it can be
// unit-tested without standing up a real WebSocket server or Postgres.
//
// It is transport-agnostic: each peer carries an injected `send(message)` that
// the host wires to its socket (with the readyState/serialization concerns). The
// manager only owns rooms, peers, and the signaling/relay routing between them.
import { randomBytes, randomUUID } from "node:crypto";

export const MULTIPLAYER_PROTOCOL_VERSION = 1;

// Excludes easily-confused glyphs (0/O, 1/I) so spoken/typed room codes are robust.
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function defaultRoomCode(rooms) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    const bytes = randomBytes(5);
    for (const byte of bytes) {
      code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  return randomUUID().slice(0, 6).toUpperCase();
}

/**
 * @param {object} [options]
 * @param {number} [options.maxPeers] Max peers per room (floored at 2).
 * @param {number} [options.maxMessageBytes] Reject larger client frames.
 * @param {() => string} [options.now] Timestamp source (ISO string).
 * @param {() => string} [options.makeRoomCode] Room-code generator (testing).
 * @param {(level: string, type: string, message: string, details?: object) => void} [options.log]
 * @param {() => void} [options.onRoomCreated] Fired when a room is created (metrics).
 */
export function createRoomManager(options = {}) {
  const maxPeers = Math.max(2, options.maxPeers ?? 4);
  const maxMessageBytes = options.maxMessageBytes ?? 8 * 1024 * 1024;
  const now = options.now ?? (() => new Date().toISOString());
  const log = options.log ?? (() => {});
  const onRoomCreated = options.onRoomCreated ?? (() => {});

  const rooms = new Map(); // code -> { code, createdAt, hostPeerId, maxPeers, peers: Map<id, peer> }
  const peers = new Map(); // id -> { id, profile, role, roomCode, send, connectedAt }

  const makeRoomCode = options.makeRoomCode ?? (() => defaultRoomCode(rooms));

  function peerPayload(peer) {
    return {
      connectedAt: peer.connectedAt,
      id: peer.id,
      profile: peer.profile,
      role: peer.role
    };
  }

  function roomPayload(room) {
    return {
      code: room.code,
      createdAt: room.createdAt,
      hostPeerId: room.hostPeerId,
      maxPeers: room.maxPeers,
      peers: [...room.peers.values()].map(peerPayload)
    };
  }

  function send(peer, message) {
    if (peer) {
      peer.send(message);
    }
  }

  function sendError(peer, code, message) {
    send(peer, { code, message, type: "error" });
  }

  function broadcast(room, message, excludedPeerId = null) {
    for (const target of room.peers.values()) {
      if (target.id !== excludedPeerId) {
        send(target, message);
      }
    }
  }

  function leaveRoom(peer, reason = "left") {
    if (!peer.roomCode) {
      return;
    }

    const room = rooms.get(peer.roomCode);
    peer.roomCode = null;
    peer.role = "idle";

    if (!room) {
      return;
    }

    room.peers.delete(peer.id);

    // When the host leaves, the room dissolves: every remaining guest is told the
    // room closed and dropped back to idle.
    if (room.hostPeerId === peer.id) {
      for (const remainingPeer of room.peers.values()) {
        remainingPeer.roomCode = null;
        remainingPeer.role = "idle";
      }
      broadcast(room, { reason, type: "room:closed" });
      rooms.delete(room.code);
      log("info", "multiplayer_room_closed", "Multiplayer room closed.", {
        reason,
        roomCode: room.code
      });
      return;
    }

    if (room.peers.size === 0) {
      rooms.delete(room.code);
      return;
    }

    broadcast(room, { peerId: peer.id, reason, type: "peer:left" });
  }

  function createRoom(peer) {
    leaveRoom(peer, "switch_room");
    const code = makeRoomCode();
    const room = {
      code,
      createdAt: now(),
      hostPeerId: peer.id,
      maxPeers,
      peers: new Map([[peer.id, peer]])
    };

    peer.roomCode = code;
    peer.role = "host";
    rooms.set(code, room);
    onRoomCreated();
    log("info", "multiplayer_room_created", "Multiplayer room created.", {
      hostProfileId: peer.profile.id,
      roomCode: code
    });
    send(peer, {
      peerId: peer.id,
      room: roomPayload(room),
      type: "room:created"
    });
  }

  function joinRoom(peer, roomCode) {
    const code = String(roomCode ?? "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      sendError(peer, "ROOM_NOT_FOUND", "Room not found.");
      return;
    }

    if (room.peers.size >= room.maxPeers && !room.peers.has(peer.id)) {
      sendError(peer, "ROOM_FULL", "Room is full.");
      return;
    }

    leaveRoom(peer, "switch_room");
    peer.roomCode = room.code;
    peer.role = room.hostPeerId === peer.id ? "host" : "guest";
    room.peers.set(peer.id, peer);

    send(peer, {
      peerId: peer.id,
      room: roomPayload(room),
      type: "room:joined"
    });
    broadcast(
      room,
      {
        peer: peerPayload(peer),
        room: roomPayload(room),
        type: "peer:joined"
      },
      peer.id
    );
    log("info", "multiplayer_room_joined", "Player joined multiplayer room.", {
      peerId: peer.id,
      profileId: peer.profile.id,
      roomCode: room.code
    });
  }

  function forwardSignal(peer, message) {
    const room = peer.roomCode ? rooms.get(peer.roomCode) : null;
    const target = room?.peers.get(message.targetPeerId);
    if (!room || !target || target.id === peer.id) {
      sendError(peer, "PEER_NOT_FOUND", "Peer is not available.");
      return;
    }

    send(target, {
      data: message.data,
      fromPeerId: peer.id,
      type: "signal"
    });
  }

  function relayGameMessage(peer, message) {
    const room = peer.roomCode ? rooms.get(peer.roomCode) : null;
    if (!room) {
      sendError(peer, "ROOM_REQUIRED", "Join a room before sending game messages.");
      return;
    }

    // Directed relay (host -> a specific guest, or guest -> host fallback path).
    if (message.targetPeerId) {
      const target = room.peers.get(message.targetPeerId);
      if (!target || target.id === peer.id) {
        sendError(peer, "PEER_NOT_FOUND", "Peer is not available.");
        return;
      }

      send(target, {
        data: message.data,
        fromPeerId: peer.id,
        relayed: true,
        type: "game:relay"
      });
      return;
    }

    // Undirected: the host fans out to all guests; a guest routes to the host.
    if (room.hostPeerId === peer.id) {
      broadcast(
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
      sendError(peer, "HOST_MISSING", "Room host is not connected.");
      return;
    }

    send(host, {
      data: message.data,
      fromPeerId: peer.id,
      relayed: true,
      type: "game:relay"
    });
  }

  /**
   * Register a freshly-connected socket as a peer and greet it.
   * @param {{ id: string, profile: { id: string, name: string }, send: (message: unknown) => void }} init
   * @returns {object} the peer record
   */
  function addPeer(init) {
    const peer = {
      connectedAt: now(),
      id: init.id,
      profile: init.profile,
      role: "idle",
      roomCode: null,
      send: init.send
    };
    peers.set(peer.id, peer);
    send(peer, {
      peer: peerPayload(peer),
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      type: "server:hello"
    });
    return peer;
  }

  /** Drop a peer entirely (socket closed / timed out): leaves its room, forgets it. */
  function removePeer(peerId, reason = "disconnected") {
    const peer = peers.get(peerId);
    if (!peer) {
      return;
    }
    leaveRoom(peer, reason);
    peers.delete(peerId);
  }

  /**
   * Parse + route one inbound client frame.
   * @returns {string|null} the handled message type (for metrics), or null if the
   *   frame was rejected before routing (too large / unparseable / typeless).
   */
  function handleMessage(peerId, rawMessage) {
    const peer = peers.get(peerId);
    if (!peer) {
      return null;
    }

    const raw = Buffer.isBuffer(rawMessage) ? rawMessage.toString("utf8") : String(rawMessage);
    if (Buffer.byteLength(raw, "utf8") > maxMessageBytes) {
      sendError(peer, "PAYLOAD_TOO_LARGE", "Multiplayer message is too large.");
      return null;
    }

    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      sendError(peer, "INVALID_JSON", "Invalid multiplayer message.");
      return null;
    }

    if (!message || typeof message.type !== "string") {
      sendError(peer, "INVALID_MESSAGE", "Invalid multiplayer message.");
      return null;
    }

    switch (message.type) {
      case "room:create":
        createRoom(peer);
        break;
      case "room:join":
        joinRoom(peer, message.roomCode);
        break;
      case "room:leave":
        leaveRoom(peer, "left");
        send(peer, { type: "room:left" });
        break;
      case "signal":
        forwardSignal(peer, message);
        break;
      case "game:relay":
        relayGameMessage(peer, message);
        break;
      case "ping":
        send(peer, { at: now(), type: "pong" });
        break;
      default:
        sendError(peer, "UNKNOWN_MESSAGE", "Unknown multiplayer message.");
        break;
    }

    return message.type;
  }

  return {
    addPeer,
    removePeer,
    handleMessage,
    peerPayload,
    roomPayload,
    rooms,
    peers,
    get roomCount() {
      return rooms.size;
    },
    get peerCount() {
      return peers.size;
    }
  };
}

/**
 * One heartbeat sweep over a set of live sockets. Any socket that has not marked
 * itself alive (via a pong) since the previous sweep is terminated — this is the
 * only way to detect a half-open TCP connection (laptop sleep, network drop, crash)
 * that never sent a clean close frame. Survivors are marked not-alive and pinged;
 * the browser auto-replies with a pong, which re-arms `isAlive` before the next sweep.
 *
 * Pure over an injected client collection so it can be unit-tested without real sockets.
 * @param {Iterable<{ isAlive?: boolean, terminate: () => void, ping: () => void }>} clients
 * @returns {number} how many dead sockets were terminated this sweep
 */
export function sweepDeadConnections(clients) {
  let terminated = 0;
  for (const ws of clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      terminated += 1;
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // Socket is already tearing down; the next sweep (or its close event) reaps it.
    }
  }
  return terminated;
}
