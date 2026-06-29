# Vertical Slice Completion Checklist

Baseline plan: a first-person vending-machine crime sim where route logistics,
territory control, crime tradeoffs, and rival escalation all appear in one
coherent playthrough.

## Slice Goal

A new save should reach the first meaningful expansion without debug commands:

- Repair Rusty Starter at the garage.
- Place it at Foam & Fold.
- Buy and stock the first supplier crate.
- Complete the first service contract.
- Own and stock three starter-district machines.
- Trigger and answer the first rival pressure beat.
- Scout and open Iron Yard.
- Place the first Iron Yard machine.
- Hire one route crew member and assign them to a machine.
- Close one supplier deal.
- Trigger and resolve one law inspection.

## Balance Targets

These targets are intentionally ranges, not exact timers. They are here to make
playtests falsifiable.

| Milestone | Target Window | Evidence |
| --- | --- | --- |
| First repaired starter machine | 2-4 minutes | Player has spent starter cash and placed Rusty Starter. |
| First paid contract | 5-8 minutes | Foam & Fold soda promise completes without debug commands. |
| Three-machine starter control | 15-25 minutes | Starter mission completes and expansion bonus pays. |
| First rival pressure response | 12-22 minutes | Alarm, undercut, or rival operation produces an actionable route task. |
| Iron Yard open | 25-40 minutes | District is scouted, requirements are visible, setup is paid. |
| First employee value | 30-45 minutes | Crew performs at least one restock, collection, guard, scout, or repair job. |
| First inspection resolution | 35-55 minutes | Player chooses permit, fine, or bribe and sees the consequence. |
| First empire/ending direction | 60-90 minutes | Endgame scoring points clearly toward one path. |

## Release Gates

- Full verification passes: typecheck, tests, lint, build.
- A scripted reducer test covers the slice without `debug_*` commands.
- The ending execution creates a visible summary, not only a log entry.
- The largest production chunk is reviewed after code splitting.
- Any failed target above produces either a balance change or a documented reason.

## Known Follow-Up

- Long-session multiplayer QA still needs real host/guest testing.
- Late-game story scenes need more authored payoff beyond objective completion.
- Economic tuning should use save telemetry or at least repeated manual playthroughs.
