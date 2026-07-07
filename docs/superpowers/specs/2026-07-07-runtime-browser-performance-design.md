# Runtime Browser Performance Smoke Design

Date: 2026-07-07
Project: Vendetta Vending
Package: 1 of the engineering-efficiency implementation program

## Goal

Add an automated browser-level smoke and performance check that proves the built game can render, enter play, expose live runtime metrics, open core UI, and capture a screenshot. This closes the gap between the current green unit/build checks and the player-visible runtime failures those checks cannot catch.

## Non-Goals

- Do not refactor `ThreeScene`, `Dashboard`, multiplayer, or server modules in this package.
- Do not tune performance budgets aggressively on the first pass.
- Do not upgrade major dependencies as part of this package.
- Do not require a real database, admin account, external audio service, or network multiplayer session.

## Current State

The repo already has strong logic coverage and build checks:

- `npm run verify` runs typecheck, unit tests, build, bundle budgets, production server smoke, and lint.
- `src/game/core/performance.ts` records runtime metrics.
- `src/App.tsx` has a `?perf` overlay that displays a snapshot of those metrics.
- `scripts/check-performance-budgets.mjs` enforces built asset size budgets.
- `scripts/smoke-production-server.mjs` verifies that the production server can serve `/api/health` and `/`.

The missing layer is a browser smoke that loads the actual app, checks that WebGL and UI work, and reads runtime metrics from the page.

## Recommended Approach

Use Playwright as a separate browser smoke layer, driven by a Node script and run against a built production server.

Reasons:

- It tests the same browser surface players use.
- It can inspect console errors, DOM state, canvas pixels, downloads, and viewport behavior.
- It can run independently from Vitest so unit tests stay fast.
- It can be wired into CI after build and production-server smoke.

## Scripts And Commands

Add these commands:

- `npm run smoke:browser`: builds nothing by itself; starts `server.js` against the existing `dist`, opens Chromium with `?perf`, runs the smoke checks, then stops the server.
- `npm run verify`: append `npm run smoke:browser` after `npm run smoke:server` once the local check is stable.

CI should install Playwright's Chromium browser before running `npm run verify`. The browser install should be explicit in `.github/workflows/ci.yml` so a fresh runner behaves the same way every time.

## Browser Harness

Create `scripts/smoke-browser.mjs`.

Responsibilities:

- Allocate a free localhost port.
- Start `node server.js` with `NODE_ENV=production` and `PORT=<free port>`.
- Wait for `/api/health`.
- Launch Chromium headless through Playwright.
- Fail on unexpected page errors and severe console errors.
- Run desktop and touch/coarse-pointer checks.
- Kill the server process in `finally`.

The script should print concise pass/fail output and include the last server log tail on failure.

## App Test Hook

Expose a read-only browser test hook only when `?perf` or `?debug` is present.

Shape:

```ts
window.__vendettaPerf = {
  getSnapshot: () => getPerfSnapshot()
};
```

This avoids scraping overlay text and keeps the hook unavailable during normal play. The hook should not allow mutation of game state.

If TypeScript needs global typing, add a small declaration near the code that installs the hook rather than a broad ambient file.

## Smoke Checks

### Desktop Runtime Check

Load `/?perf`.

Verify:

- The page has no fatal console/page errors during startup.
- The landing screen appears.
- Quick Start enters the game without requiring a database.
- A `.scene-mount canvas` appears.
- The canvas has nonblank pixels after a short render wait.
- The perf overlay appears.
- `window.__vendettaPerf.getSnapshot()` eventually includes `scene.frame.avg` and `scene.frame.max`.
- The dashboard opens and renders without page errors.
- The screenshot button produces either a download event or the visible success toast.

### Touch Gate Check

Open the page in a mobile/coarse-pointer browser context.

Verify:

- The touch gate is visible.
- The game does not present the touch-only user with a playable-looking keyboard/mouse scene as the primary experience.

### Budget Checks

First-pass budgets should be intentionally coarse to avoid false failures on CI hardware:

- `scene.frame.avg.max` under 80 ms after warmup.
- `scene.frame.max.last` under 180 ms after warmup.
- `scene.dynamic.rebuild.max` under 250 ms if present.
- `save.local.bytes.last` under the existing server save cap if present.

These are guardrails, not tuning targets. Tighten them only after several CI samples establish a stable baseline.

## Error Handling

- If Playwright is missing, fail with a message that points to `npm install` and the CI browser-install step.
- If Chromium cannot launch, fail with the browser error and keep the server log tail.
- If WebGL is unavailable in the CI environment, fail with a clear diagnostic instead of silently skipping. This project depends on WebGL rendering.
- If a download is blocked by browser policy, accept a success toast as the screenshot assertion.

## Integration Points

Files expected to change in this package:

- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `scripts/smoke-browser.mjs`
- `src/App.tsx` or a nearby perf/test-hook module
- possibly `src/game/core/performance.ts` if a small export helper is cleaner

Files not expected to change:

- `src/render/three/ThreeScene.tsx`
- `src/ui/Dashboard.tsx`
- `src/hooks/useGame.ts`
- `server.js`
- multiplayer protocol files

## Validation Plan

Run locally:

```bash
npm run build
npm run smoke:browser
npm run verify
```

Expected result:

- Browser smoke passes locally.
- Existing typecheck, unit tests, build, bundle budgets, production smoke, and lint still pass.
- CI has the same browser install and smoke step.

## Follow-Up Packages

After this lands, proceed in this order:

1. Dashboard selector and panel recompute reduction.
2. Entry-chunk trimming and lazy boundary cleanup.
3. Multiplayer room reclaim, command ack/reject, and delta/keyframe design.
4. Admin monitoring scalar summaries.
5. Large-file extraction by runtime boundary.
6. Staged dependency upgrades, starting with patch/minor updates.

