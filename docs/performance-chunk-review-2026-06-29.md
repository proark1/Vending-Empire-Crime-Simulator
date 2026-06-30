# Performance Chunk Review - 2026-06-29

## Change

- Split first-party game code into `game-systems`, `game-content`, and
  `game-world` manual chunks.
- Lazy-loaded admin model and audio editors from the admin map editor.

## Build Result

Command:

```bash
npm run build
```

Notable chunks after the change:

| Chunk | Size | Gzip |
| --- | ---: | ---: |
| `index` | 139.97 kB | 38.82 kB |
| `game-systems` | 162.21 kB | 46.20 kB |
| `game-content` | 132.60 kB | 34.87 kB |
| `game-world` | 38.12 kB | 13.34 kB |
| `AdminMapEditor` | 46.87 kB | 14.01 kB |
| `AdminModelEditor` | 16.91 kB | 5.57 kB |
| `AdminAudioEditor` | 27.70 kB | 7.07 kB |
| `vendor-three` | 517.33 kB | 130.14 kB |

Before this pass, `index` was about 432 kB and `AdminMapEditor` was about
128 kB. The remaining largest chunk is `vendor-three`; reducing that further
would require renderer-level changes or more aggressive Three.js feature
isolation.

## 2026-06-30 Follow-Up

Rebuilt after adding late-game quest content and production hardening. The split
still holds:

| Chunk | Size | Gzip |
| --- | ---: | ---: |
| `index` | 139.97 kB | 38.82 kB |
| `game-systems` | 162.76 kB | 46.27 kB |
| `game-content` | 136.04 kB | 35.69 kB |
| `AdminMapEditor` | 46.87 kB | 14.01 kB |
| `vendor-three` | 517.33 kB | 130.14 kB |

No further low-risk manual chunking is obvious. The next meaningful reduction is
a renderer-level project: audit actual Three.js feature use, isolate optional
scene features, or defer the full renderer until after the landing/access flow.
