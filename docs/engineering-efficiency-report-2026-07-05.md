# Engineering Efficiency Report - 2026-07-05

Branch: `main` @ `3b31ae5`  
Scope: local repo health, CI/deploy status, runtime smoke, bundle shape, React/render performance, multiplayer/save efficiency, backend/dependency posture, and product efficiency.

## Executive Summary

The project is in good technical health. TypeScript, tests, build, lint, production dependency audit, production-server smoke, latest CI, and Railway deploy status are all green. Since the July 3 full-game audit, many prior blockers have been addressed: production admin seeding is gated, login throttling exists, security headers are present, WebSocket origin checks are stricter, reducer crashes are contained, license exists, CI audits production dependencies, and several growth hooks are now implemented.

Follow-up implementation pass completed:

- Added enforced bundle/performance budgets via `npm run check:perf`, wired into CI.
- Added `npm run smoke:server` production-server smoke coverage, wired into CI.
- Added `npm run verify` for local full-stack verification.
- Aligned Node metadata to CI/runtime expectations with `engines.node` and `@types/node@20`.
- Removed the landing cinematic's dependency on the gameplay `ThreeScene` module by using lightweight local preview meshes.
- Reduced low-power renderer overhead by disabling `preserveDrawingBuffer` on low-power graphics profiles.
- Added compact save-summary columns for leaderboard/live-ops reads and updated save/restore writes to maintain them.
- Switched the public leaderboard to prefer indexed scalar save summaries, with a JSON fallback for older rows.
- Added multiplayer snapshot byte instrumentation (`multiplayer.snapshot.bytes`) as the measurement step before a delta protocol rollout.

The next meaningful improvements are not "fix broken basics." They are efficiency and scale projects:

1. Make performance budgets measurable and enforced.
2. Keep the landing experience from pulling gameplay renderer code too early.
3. Reduce always-on renderer cost, especially `preserveDrawingBuffer`.
4. Split large files along real runtime boundaries.
5. Reduce dashboard recomputation on every whole-state change.
6. Replace full multiplayer state snapshots with delta/keyframe sync.
7. Plan major dependency upgrades.

Items 1, 2, 3, and the leaderboard portion of 8 now have first-pass fixes. Items 4, 5, and the full multiplayer delta/keyframe protocol remain larger migration work because they touch broad runtime architecture and need staged rollout.

## Verified Health

| Area | Result |
| --- | --- |
| Working tree | Clean, `main...origin/main` |
| Current head | `3b31ae5` |
| TypeScript | `npm run typecheck` passed |
| Tests | `npm test` passed: 22 files, 615 tests |
| Build | `npm run build` passed |
| Lint | `npm run lint` passed |
| Production dependency audit | `npm audit --omit=dev --audit-level=high` passed, 0 vulnerabilities |
| Production server smoke | `node server.js` on port 3001 served `/api/health` and `/` with HTTP 200 |
| Latest CI on main | CI #88 passed for `3b31ae5` |
| Railway/GitHub deploy status | `success` for `3b31ae5` |

Fresh implementation-pass verification:

| Area | Result |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| Tests | `npm test` passed: 22 files, 615 tests |
| Build | `npm run build` passed |
| Performance budgets | `npm run check:perf` passed |
| Production server smoke | `npm run smoke:server` passed |
| Lint | `npm run lint` passed |

Fresh build's largest raw chunks:

| Chunk | Raw size |
| --- | ---: |
| `vendor-three` | 517.33 kB |
| `game-systems` | 178.59 kB |
| `index` | 178.31 kB |
| `game-content` | 147.22 kB |
| `vendor-react` | 142.93 kB |
| `ThreeScene` | 118.61 kB |
| CSS | 111.00 kB |
| `Dashboard` | 77.74 kB |

## Retired Findings From The July 3 Audit

These older findings appear fixed or substantially mitigated in the current code:

- Production default admin takeover: fixed by production-empty admin seed defaults and `.env.example` placeholders.
- Login brute force: fixed by per-IP and per-account in-memory throttling.
- Missing security headers: fixed by CSP, frame, content-type, referrer, and production HSTS headers.
- WebSocket origin handling: stricter same-host check, missing origin rejected in production.
- Server crash behavior: uncaught exception now logs and exits for supervisor restart by default.
- Reducer white-screen risk: `ErrorBoundary` exists and `useGame` catches reducer throws.
- Missing license: proprietary `LICENSE` exists.
- CI missing dependency audit: CI runs `npm audit --omit=dev --audit-level=high`.
- Dead generic alert audio differentiation: alert cue behavior now varies by trigger.
- Voice regex drift: representative voice-event test exists.
- Several growth gaps: empire name, daily streak, leaderboard, seed sharing, invite URLs, screenshot capture, and ending share text are now present.

## Priority Recommendations

### P0 - Make Performance A Managed System

The code records useful metrics (`scene.frame.avg`, `scene.frame.max`, `scene.dynamic.rebuild`, `scene.collision.query`, save sizes, multiplayer snapshot counts), but those numbers are currently mostly observational. Add an automated perf smoke that loads the built app with `?perf`, drives a short scripted route, exports metrics, and fails only on coarse budgets.

Suggested first budgets:

- Landing first interactive time under a chosen local baseline.
- `scene.frame.avg` under 16.7 ms on desktop high, under 33 ms on low.
- `scene.dynamic.rebuild.max` budget.
- `save.local.bytes` budget.
- Multiplayer snapshot byte budget.

Why it matters: the game is now large enough that green tests can still hide "feels slower this week" regressions.

### P0 - Align Node Versions

CI runs Node 20 (`.github/workflows/ci.yml:27`), this machine is running Node 24, and `package.json` uses `@types/node` 26 (`package.json:26`). That mismatch can let code typecheck against APIs newer than CI/runtime.

Pick one target:

- Conservative: Node 20 everywhere, `@types/node@20`, add `engines.node`.
- Modern: Node 24 everywhere, update GitHub Actions and Railway runtime together.

This is low effort and removes a sneaky class of environment bugs.

### P1 - Fix The Landing/Gameplay Renderer Dependency Boundary

`LandingCinematicScene` is lazy-loaded, but it imports helpers from `ThreeScene`:

- `src/ui/LandingCinematicScene.tsx:6`

That can make the landing cinematic depend on the gameplay renderer chunk. Move shared mesh factories (`createMachineMesh`, `createStockCrateMesh`, `createVehicleMesh`, `applyModelTransformById`) out of `ThreeScene` into a renderer utility module, then import from both scenes. This keeps the landing chunk honest and makes the first screen cheaper.

Impact: better perceived startup and cleaner bundle boundaries.

### P1 - Revisit Always-On `preserveDrawingBuffer`

`ThreeScene` creates the main WebGL renderer with `preserveDrawingBuffer: true` for photo mode (`src/render/three/ThreeScene.tsx:5543-5545`). That makes screenshots reliable, but it can cost GPU memory and frame throughput on the always-on renderer.

Options:

- Keep it only on high/medium and disable for low power mode.
- Add a dedicated screenshot path using an offscreen render or temporary capture renderer.
- Keep current behavior but measure the cost with the perf smoke before deciding.

This is worth measuring because the renderer is the user's whole game feel.

### P1 - Reduce Dashboard Whole-State Recompute

`Dashboard` is memoized, but many expensive selectors still depend on the entire `state` object:

- `src/ui/Dashboard.tsx:237-320`

Because the reducer produces a new `GameState` on each command/tick, these `useMemo([state])` calls invalidate together. Some work is gated by tab/group, which is good, but several always-active selectors still scan machines, factions, districts, route tasks, heat, recovery, jobs, and tradeoffs.

Better shape:

- Split the dashboard into memoized panel components.
- Pass narrow slices or precomputed view models rather than whole `state`.
- Gate route/finance/story/pressure selectors by visible tab whenever possible.
- Promote selector caches keyed by stable collection signatures where the same whole-state churn happens.

Impact: smoother dashboard open/close, lower CPU on each world tick, easier panel testing.

### P1 - Replace Full Multiplayer Snapshots

The host sends full `GameState` snapshots every roughly 500 ms while hosting:

- `src/hooks/useGame.ts:103-117`
- `src/hooks/useGame.ts:388-409`
- `src/game/network/protocol.ts:38`

That is simple and reliable, but it will scale poorly as saves grow. Move to:

- Command stream plus periodic keyframes.
- Delta snapshots for changed machines, player, events, vehicles, and world clock.
- Snapshot byte instrumentation.
- Guest ack/reconcile so rejected commands have visible feedback.
- Exclude or compact transient/derived fields such as recent event text where possible.

Impact: lower bandwidth, lower serialization cost, better multiplayer smoothness.

### P1 - Materialize Leaderboard And Live-Ops Fields

The server currently reads/parses full save JSON for leaderboard/live-ops style views. The current limits are bounded, which is good, but this will become inefficient as real usage grows.

Add a small derived table or columns updated on save:

- profile id
- empire name
- cash
- heat
- machine count
- districts unlocked
- last save time
- run seed

Then leaderboard and admin monitoring can query indexed scalar columns instead of scanning JSON payloads.

Impact: faster admin views, cheaper public leaderboard, less DB and Node memory pressure.

### P1 - Split The Giant Runtime Files By Responsibility

Largest files today:

- `src/render/three/ThreeScene.tsx`
- `src/game/systems/reducer.ts`
- `src/App.tsx`
- `src/ui/Dashboard.tsx`
- `src/ui/AdminMapEditor.tsx`
- `server.js`

This is not just aesthetic. These files are where change risk concentrates. Split by runtime boundary:

- `ThreeScene`: renderer setup, input/controller, static world building, dynamic objects, traffic/NPC animation, screenshots.
- `reducer`: economy, law/heat, rival conflict, empire/endgame, routing, replayability.
- `Dashboard`: now/actions, assets, city, pressure, story, admin/debug panels.
- `server.js`: auth/sessions, saves, admin config, audio generation, multiplayer, static serving.

Impact: faster reviews, smaller edits, better targeted tests, less accidental coupling.

### P2 - Add Browser-Level Smoke Coverage

Current tests are strong in pure logic, but runtime UI/render coverage is thin. Add Playwright smoke checks:

- First screen renders without console errors.
- Enter game, canvas is nonblank.
- `?perf` overlay appears and emits frame metrics.
- Desktop touch gate is absent on desktop and present on emulated coarse pointer.
- Dashboard opens without layout overflow.
- Screenshot button produces a download path or visible success toast.

Impact: catches the class of issues typecheck/unit tests cannot see.

### P2 - Bundle And Dependency Modernization

`npm outdated` shows major-version drift:

- React 18 -> 19
- Vite 6 -> 8
- Three 0.171 -> 0.185
- ESLint 9 -> 10
- lucide-react 0.468 -> 1.x

Do not batch all of these blindly. Suggested order:

1. Patch/minor safe updates (`immer`, `typescript-eslint`, `@types/node` after Node target decision).
2. Vite/plugin-react upgrade with build and server smoke.
3. Three upgrade with screenshot/canvas visual QA.
4. React 19 only after interaction and effect behavior smoke coverage exists.

Impact: keeps the toolchain fresh without turning the project into dependency roulette.

### P2 - Make Mobile A Real Product Decision

The touch-only gate is honest and good. The next decision is product strategy:

- Desktop-first: keep the gate, improve copy, maybe add "email me a desktop link."
- Touch-supported: add on-screen movement stick, drag-look, interact button, vehicle controls, and mobile-specific performance budget.

Do not half-build this. First-person movement on touch is either a real feature or a clear unsupported path.

## Good Things To Keep

- Manual Vite chunks are working and keep first-party systems separated.
- Admin editors are lazy-loaded.
- Error handling around reducer and top-level UI is much safer than the previous audit baseline.
- Security posture is much stronger than the old report suggested.
- Save conflict handling and visible save status are good user trust signals.
- `useGame` already debounces local/remote saves by change type.
- Perf metric primitives are simple and useful.
- The project has meaningful tests in reducer, world generation, multiplayer client, save migration, model config, graphics quality, and UI helpers.

## Suggested Next Three Work Packages

1. Performance budget package
   - Add browser smoke harness.
   - Export perf snapshot after scripted route.
   - Add baseline budgets.
   - Measure `preserveDrawingBuffer` on/off or quality-gated.

2. Startup/bundle package
   - Move shared scene mesh factories out of `ThreeScene`.
   - Verify landing cinematic no longer depends on gameplay scene chunk.
   - Rebuild and compare chunk graph.

3. Multiplayer efficiency package
   - Add snapshot byte metrics.
   - Implement keyframe + delta protocol.
   - Add guest command ack/reject.
   - Keep full snapshot as fallback during rollout.

## Bottom Line

This codebase is no longer struggling with basic correctness. It is ready for the next layer: measured performance, cleaner runtime boundaries, and scaling paths for renderer, dashboard, multiplayer, and live-ops data. The fastest win is the landing/ThreeScene dependency cleanup; the highest-leverage long-term win is automated performance budgets.
