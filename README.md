# Vendetta Vending — Empire Crime Simulator

[![CI](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/ci.yml)
[![Lint](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/lint.yml/badge.svg)](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/lint.yml)
[![Deploy](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/deploy.yml/badge.svg)](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/deploy.yml)

A first-person vending-machine crime sim: fix busted machines, stock
questionable products, outrun rivals, and turn pocket change into territory
across six procedurally dressed city districts — now including **Greenwood
Park** north of the starter suburb.

Built with React + Vite + TypeScript and a Three.js renderer, served (with
multiplayer over WebSocket and optional Postgres persistence) by `server.js`.

## Develop

```bash
npm install
npm run dev        # Vite dev server (127.0.0.1)
```

## Verify

```bash
npm run typecheck  # tsc -b
npm test           # vitest run
npx playwright install chromium  # one-time local browser install
npm run smoke:browser
npm run build      # tsc -b && vite build
npm run lint       # eslint .
```

CI runs typecheck/test/build plus the browser smoke on every push and PR to `main`. A separate
**Lint** workflow runs ESLint on PRs, scoped to the files the PR changes, so
it flags issues in new work without failing on pre-existing code.

## Run the server

```bash
npm run build
npm start          # node server.js — serves dist/ + multiplayer WS
```

Environment (see `.env.example`): `DATABASE_URL` enables Postgres persistence;
without it the game falls back to local saves. Admin access seeds from
`ADMIN_NAME` and `ADMIN_PIN`, or falls back to `assad` / `4924` when those
variables are omitted.

## Deploy

Production runs on [Railway](https://railway.app). Two paths:

- **Native Railway integration** — connect the repo in Railway and it
  auto-deploys on push to `main` (no GitHub secret needed).
- **Manual GitHub Action** — run the **Deploy** workflow from the Actions tab
  (or `gh workflow run deploy.yml`). Requires a `RAILWAY_TOKEN` repo secret
  (Railway → project → Settings → Tokens), and optionally a `RAILWAY_SERVICE`
  repo variable. Use one path or the other, not both, to avoid double deploys.
