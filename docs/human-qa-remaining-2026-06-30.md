# Human QA Remaining - 2026-06-30

This is the remaining work that cannot be proven by reducer tests, build output,
or command-line smoke checks.

## Vertical Slice Timing

Run one fresh save without debug commands and export the Story tab playtest JSON
at these points:

- after the first paid contract;
- after three-machine starter control;
- after Iron Yard opens;
- after the first employee performs useful work;
- after the first law inspection is resolved;
- after the first ending direction feels clear.

Record wall-clock minutes, confusion points, and whether the next objective was
obvious without reading code or docs.

## Multiplayer Host/Guest Session

Run two real browser clients for at least 45 minutes:

- host creates room and guest joins;
- guest receives current snapshot;
- guest commands apply once and replicate back;
- direct WebRTC opens or relay remains stable;
- guest refresh and host refresh recover cleanly;
- host save ownership remains clear;
- host leaving closes the guest room state.

## Late-Game Feel

Play into Downtown, Neon, and Old Town and judge whether the new quest openings,
campaign payoffs, and ending summaries feel like authored story moments rather
than only checklist completion.

## Production Admin

Verify that `/admin` login works with the Railway-stored credentials, or with
the fallback `assad` / `4924` seed when `ADMIN_NAME` and `ADMIN_PIN` are not set.
