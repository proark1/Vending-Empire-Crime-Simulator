# Visual Polish QA - 2026-06-30

## Scope

- Vending machine silhouettes now vary by machine model.
- Medium/high vending machines carry short model badges so the model class is readable in-world.
- Stock crates include generated labels, tape, handles, and corner guards.
- District labels now have physical landmark signs with district-specific props.
- Existing storefront, prop, and landing cinematic polish should remain visible across low, medium, and high graphics settings.

## Automated Checks

Run before shipping another visual pass:

```sh
npm run typecheck
npm run test
npm run smoke:browser
npm run build
```

The `procedural visual assets` tests instantiate representative machines and crates under the Node test runner. They catch regressions where model-specific machine detail or crate labeling disappears during refactors.

The checked-in Playwright smoke starts Vite on `127.0.0.1:5175`, quick-starts a clean local run, verifies the WebGL canvas is populated, completes the first repair by holding `E`, opens Ops, and fails on browser console errors.

## Manual Render Spot Check

1. Start the app with `npm run dev -- --port 5173`.
2. Open `http://127.0.0.1:5173/`.
3. Use `Quick Start: Cause Problems`.
4. Confirm the WebGL scene is not blank and browser console has no errors.
5. Inspect at least one installed machine for these model reads:
   - Each medium/high cabinet has a compact model badge near the controls.
   - Armored units have side armor, rivets, and a crash bar.
   - Smart vendors have telemetry and signal detail.
   - Luxury vendors have chrome/glow accents.
   - Hidden or black-market machines have louvers and a false service panel.
   - Mobile vendors have wheels and a tow handle.
6. Inspect garage/storage crates for labels, tape, handles, and corner guards.
7. Inspect district label areas for physical landmark signs and district-specific symbols.
8. Toggle low, medium, and high graphics settings; low should remain readable while medium/high keep the extra polish.

## Performance Notes

- The model identity pass is additive mesh detail on medium/high only; low quality keeps cabinet silhouettes lightweight.
- If frame time regresses in dense districts, first reduce high-frequency detail counts on machine identity overlays and street props before reducing world chunk radius.
- Browser smoke now guards the first-run canvas and first repair path. Detailed per-pixel baselines can be added later if regressions become subtle enough to justify image snapshots.
