# Replayability Pass - 2026-06-30

## Shipped

- Fresh runs now get a deterministic run modifier from the run seed. Current modifiers change inspection risk, supplier costs, service contract rewards, grey-stock demand, student demand, or Redline's first undercut timing.
- Machine history and machine traits now grow from normal play: placements, grey-stock stocking, strong collections, crew assignment, contract completions, alarms, and rival pressure.
- Rival memory now tracks undercuts, sabotage, expansions, negotiations, exposures, disruptions, and answered alarms per faction.
- Ending summaries include the run modifier, legal/risky machine mix, trait count, loudest rivalry, and recent strategy unlocks.
- The dashboard now surfaces run identity, recent strategy unlocks, machine traits/history, and rival memory.
- Legacy saves migrate with replay state defaults.

## Tuning Knobs

- `src/game/content/replayability.ts` owns modifier definitions, trait definitions, trait multipliers, and ending summary text.
- Reducer hooks in `src/game/systems/reducer.ts` decide which actions award traits or strategy unlocks.
- Economy effects currently stay small so traits add memory without breaking balance.

## Suggested Next Iteration

- Add a run-end recap modal with "play again" seed/modifier preview.
- Add a few rare trait evolutions that replace weaker traits after repeated behavior.
- Let rival memory alter boss taunts and operation selection more directly.
- Add one or two visible route challenges per modifier so the run condition changes minute-to-minute decisions, not only multipliers.
