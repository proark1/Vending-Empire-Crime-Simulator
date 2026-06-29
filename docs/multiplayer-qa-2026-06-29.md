# Multiplayer QA - 2026-06-29

## Automated Coverage

- `roomManager.test.js`: room creation, joins, full-room rejection, host leave cleanup,
  relay routing, message limits, peer removal, and stale connection sweeping.
- `src/game/network/multiplayerClient.test.ts`: WebSocket endpoint selection,
  room status updates, command/snapshot messaging, relay fallback, and invalid
  server-message handling.

Command run:

```bash
npx vitest run --config vitest.config.ts src/game/network/multiplayerClient.test.ts roomManager.test.js
```

Result: 2 files passed, 42 tests passed.

## Manual QA Still Required

The automated tests prove the protocol state machines, not a real session. Before
calling multiplayer production-ready, run a host/guest browser session for at
least 45 minutes and record:

- host creates a room, guest joins, and the guest receives the current snapshot;
- guest commands apply once on the host and replicate back;
- direct WebRTC data channel opens, or server relay remains stable if it does not;
- host save ownership remains clear, and guest does not write over the host save;
- reconnect after guest refresh and host refresh;
- host leaving closes the room cleanly for guests;
- long-session route actions do not drift between host and guest.
