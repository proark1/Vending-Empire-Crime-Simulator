# Visual Polish QA - 2026-06-30

## Scope

- Vending machine silhouettes now vary by machine model.
- Stock crates include generated labels, tape, handles, and corner guards.
- Existing storefront, prop, and landing cinematic polish should remain visible across low, medium, and high graphics settings.

## Automated Checks

Run before shipping another visual pass:

```sh
npm run typecheck
npm run test
npm run build
```

The `procedural visual assets` tests instantiate representative machines and crates under the Node test runner. They catch regressions where model-specific machine detail or crate labeling disappears during refactors.

## Manual Render Smoke

1. Start the app with `npm run dev -- --port 5173`.
2. Open `http://127.0.0.1:5173/`.
3. Use `Quick Start: Cause Problems`.
4. Confirm the WebGL scene is not blank and browser console has no errors.
5. Inspect at least one installed machine for these model reads:
   - Armored units have side armor, rivets, and a crash bar.
   - Smart vendors have telemetry and signal detail.
   - Luxury vendors have chrome/glow accents.
   - Hidden or black-market machines have louvers and a false service panel.
   - Mobile vendors have wheels and a tow handle.
6. Inspect garage/storage crates for labels, tape, handles, and corner guards.
7. Toggle low, medium, and high graphics settings; low should remain readable while medium/high keep the extra polish.

## Performance Notes

- The model identity pass is additive mesh detail on medium/high only; low quality keeps cabinet silhouettes lightweight.
- If frame time regresses in dense districts, first reduce high-frequency detail counts on machine identity overlays and street props before reducing world chunk radius.
- Browser smoke should include a nonblank canvas screenshot after Quick Start. A visible HUD over a populated scene is enough for this pass; detailed per-pixel baselines can be added later if a browser test harness is introduced.
