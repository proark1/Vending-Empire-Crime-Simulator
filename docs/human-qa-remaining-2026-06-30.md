# Human QA Remaining - 2026-06-30

This is the remaining work that cannot be proven by reducer tests, build output,
or the checked-in Playwright browser smoke.

## Now Automated

- Clean Quick Start reaches the in-game scene.
- The WebGL canvas is populated.
- The first Storage Garage repair can be completed by holding `E` without needing a perfect camera ray.
- Ops opens without browser console errors.

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

The Story tab now exposes the run modifier, active run challenge, milestone pacing,
and export button in the same place so the tester can capture both numbers and
confusion notes.

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

Pay special attention to whether the active run challenge changes minute-to-minute
route decisions and whether the ending recap makes the next run seed/modifier
tempting enough to restart.

## Production Admin

Verify that `/admin` login works with the Railway-stored credentials, or with
the fallback `assad` / `4924` seed when `ADMIN_NAME` and `ADMIN_PIN` are not set.
