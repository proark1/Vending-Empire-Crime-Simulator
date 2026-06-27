# Vendetta Vending — Empire Crime Simulator

[![CI](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/proark1/Vending-Empire-Crime-Simulator/actions/workflows/ci.yml)

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
npm run build      # tsc -b && vite build
```

CI runs all three on every push and PR to `main`.

## Run the server

```bash
npm run build
npm start          # node server.js — serves dist/ + multiplayer WS
```

Environment (see `.env.example`): `DATABASE_URL` enables Postgres persistence;
without it the game falls back to local saves.

## Deploy

Production runs on [Railway](https://railway.app). Two paths:

- **Native Railway integration** — connect the repo in Railway and it
  auto-deploys on push to `main` (no GitHub secret needed).
- **Manual GitHub Action** — run the **Deploy** workflow from the Actions tab
  (or `gh workflow run deploy.yml`). Requires a `RAILWAY_TOKEN` repo secret
  (Railway → project → Settings → Tokens), and optionally a `RAILWAY_SERVICE`
  repo variable. Use one path or the other, not both, to avoid double deploys.
