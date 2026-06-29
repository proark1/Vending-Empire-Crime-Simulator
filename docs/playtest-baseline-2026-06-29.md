# Vertical Slice Playtest Baseline - 2026-06-29

Scope: automated reducer baseline plus one browser smoke pass. This proves the
slice is mechanically reachable without debug commands; it is not a substitute
for a real human timing pass.

## Automated Result

| Gate | Result | Notes |
| --- | --- | --- |
| Starter machine repaired and placed | Pass | Covered by reducer commands from a fresh save. |
| First supplier crate bought and stocked | Pass | Soda stock completes the opening Foam & Fold contract. |
| First paid contract | Pass | `contract_1` completes without debug commands. |
| Rival pressure response | Pass | Redline undercut now waits for a route-time delay, then is confronted. |
| Three starter machines | Pass | Foam & Fold, Gym, and Arcade are placed and stocked. |
| Iron Yard opened | Pass | Scout and unlock commands satisfy district access. |
| First Iron Yard machine | Pass | Freight Depot receives a player-owned machine. |
| Crew value | Pass | A guard is hired and assigned to the Iron Yard machine. |
| Supplier deal | Pass | Backdoor Wholesale bulk discount can be negotiated. |
| Law inspection | Pass | An inspection is triggered and resolved through a fine. |

## Pacing Change From This Pass

The first Redline undercut was too immediate: it could appear as soon as the
opening contract paid. Fresh runs now store `starterMachinePlacedHour` and wait
14 active game hours before the first undercut can trigger. With the current app
clock of `0.04` game hours every `1500ms`, that is about 8.75 active minutes
after placement. Existing saves without the timestamp keep their old behavior.

## Manual Timing Still Open

The next human run should record real elapsed minutes for the balance targets in
`docs/vertical-slice-checklist.md`. The automated baseline is only a guardrail:
it can catch broken progression and obvious pacing regressions, but it cannot
measure reading time, walking mistakes, UI hesitation, or whether a player
understands why each next step matters.
