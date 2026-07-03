# Full-Game Audit — Vendetta Vending: Empire Crime Simulator

**Datum:** 2026-07-03 · **Branch:** `main` @ `ee0d535` · **Methode:** 12-Agenten-Audit (6 Dimensionen parallel → adversariale Verifikation der High/Critical-Findings → Lücken-Kritiker), plus unabhängige Toolchain-Checks.

Dies ist der **Report** (Bestandsaufnahme). Umsetzung folgt separat und priorisiert nach der Roadmap unten.

---

## 0. Objektive Health-Signale (unabhängig gemessen)

| Check | Ergebnis |
|---|---|
| `npm run typecheck` (tsc -b) | ✅ sauber |
| `npm test` (vitest) | ✅ **608 / 608** in 21 Dateien |
| `npm run lint` (eslint) | ✅ sauber |

Der Code ist technisch grün. Die Probleme unten sind **keine** Compile-/Test-Fehler, sondern Design-, Sicherheits-, Erlebnis- und Wachstumslücken, die Tests nicht abfangen.

---

## 1. Scorecard

| Dimension | Score | Kernaussage |
|---|---:|---|
| 🔒 Security | **62** | Solide Basis (parametrisierte SQL, gehashte PINs/Tokens, host-autoritatives MP), aber **1 kritischer Admin-Takeover** + fehlendes Login-Rate-Limiting. |
| 🎮 UI/UX | **71** | Desktop-Onboarding & Feedback-Loop überdurchschnittlich gut. **Auf Touch-Geräten faktisch unspielbar** trotz Mobile-CSS. |
| 🕹️ Game-Design | **58** | Starker Einstieg, aber **kein Verlust-Zustand**, degenerate Preis-Strategie, Automatisierung höhlt den Kern aus → Mid/Late-Game ohne Spannung. |
| 👥 Multiplayer | **42** | Sauber engineered, aber dünn: **nur geteiltes Ein-Imperium-Koop**, keine Rivalität/PvP — genau die Fantasie, die das Spiel verkauft. |
| 🚀 Virality/Retention | **18** | **Der eigentliche Engpass.** Kein Share-Artefakt, keine Identität, kein Leaderboard, keine Daily/Streak. Fertige Hooks liegen ungenutzt. |
| 🎨 Asset/Audio-Vollständigkeit | **88** | Deine Kernsorge ist weitgehend mit **„Ja"** beantwortet: alle Synth-Sounds/Musik/Visuals haben Generatoren. Ein echtes Loch: 6 designte Sounds werden nie ausgelöst. |

**Gesamteindruck:** Ein technisch reifer, inhaltlich reicher Vertical Slice mit ausgezeichnetem Asset-Pipeline und Desktop-Polish — der an **drei Fronten hart gated** ist: Sicherheit (1 Blocker), Fun-Tiefe (kein Risiko/keine Stakes) und Wachstum (praktisch kein virales Loop).

**Findings gesamt:** 42 dimensionsspezifische + 10 querschnittliche Lücken. Davon **1 Critical**, **11 High** (nach Verifikation), Rest Medium/Low.

---

## 2. Top-Risiken (dimensionsübergreifend)

1. **🔴 SHIP-BLOCKER — Admin-Takeover per Default-Credentials.** `assad`/`4924` sind im Repo (`.env.example`, `README.md`) committet und seeden ein **live Admin-Konto**, wenn `ADMIN_NAME`/`ADMIN_PIN` fehlen. Das erlaubt nicht nur Daten-Wipe aller Saves, sondern auch **Massen-Auslesen aller Spieler-PII** über das Monitoring-Endpoint. Vor jeder öffentlichen Exposition zwingend zu fixen. *(sec-1, verifiziert CONFIRMED)*
2. **🟠 FUN/RETENTION-BLOCKER — White-Screen bei Reducer-Throw.** Kein React `ErrorBoundary`, kein `try/catch` um `reduceGameState`, das **jeden World-Tick** läuft. Ein einziger unbehandelter Fehler in 6187 Zeilen Reducer = weißer Bildschirm ohne Recovery. *(Lücken-Kritiker)*
3. **🟠 VIRAL-DECKEL — Score 18/100.** Selbst ein perfektes Spiel verbreitet sich nicht ohne teilbares Artefakt. Ending-Screen und deterministische Seeds sind **fertige Share-Hooks, die brachliegen**.
4. **🟡 SHIPPABILITY-GATES ohne Owner.** Keine `LICENSE`, keine Alters-/Content-Einstufung (Krimi/Contraband!), kein Datenschutz-Hinweis trotz kontinuierlichem Upload benannter Spieler-States, kein Dependency-Audit in CI. Jedes einzelne kann einen Store-/Public-Launch blocken.
5. **🟡 MP: Fun + Integrität.** Koop ist Ein-Imperium (keine Rivalität), und der Guest↔Host-Save-Übergang riskiert, das **eigene Imperium eines Spielers still zu überschreiben**.

---

## 3. Security — 62/100

**Stärken (real, kein Theater):** Durchgängig parametrisierte `pg`-Queries (keine SQL-Injection), gesalzene SHA-256-PINs mit `timingSafeEqual`, gehashte Session-Tokens mit Ablauf, Path-Traversal-Schutz bei Static/Audio, host-autoritatives MP mit Guest-Command-Allowlist & Snapshot-Herkunftsprüfung, mehrschichtige DoS-Limits (Socket-Cap, `maxPayload`, Token-Buckets), redigierter ElevenLabs-Key, **keine XSS-Fläche** (0× `innerHTML`/`dangerouslySetInnerHTML`).

| ID | Sev | Finding | Datei | Fix | Aufwand |
|---|---|---|---|---|---|
| sec-1 | 🔴 **Crit** | Hardcodierte Admin-Creds `assad`/`4924` seeden live Admin (CONFIRMED) | `server.js:19-20,350` | Prod-Gate wiederherstellen, bei fehlenden Env-Vars nicht seeden; Creds rotieren; Platzhalter in `.env.example`/README | S |
| sec-2 | 🟠 High | Kein Rate-Limit auf `/api/admin/login` & `/api/game/login` → Brute-Force (CONFIRMED) | `server.js:674,497` | Per-IP/Account-Throttle + Lockout; längere Mindest-PIN | M |
| sec-3 | 🟡 Med | WS-Origin-Check nur in Prod, fehlender `Origin`-Header wird erlaubt (CSWSH) | `server.js:1981,2002` | Allowlist in allen Envs; Null-Origin ablehnen | S |
| sec-4 | 🟡 Med | Postgres-TLS default `rejectUnauthorized:false` auch in Prod | `server.js:175,185` | In Prod fail-closed ohne `PGSSL_CA`/`PGSSL_VERIFY` | S |
| sec-5 | 🔵 Low | Admin-Login ohne Format-Validierung der PIN | `server.js:674` | Gleiche Validierung wie Spieler-Creds | S |
| sec-6 | 🔵 Low | Admin-Sessions 14 Tage, keine Revocation | `server.js:468,21` | Kurze Admin-Session, Logout/Revoke-Endpoint, Re-Auth für destruktive Aktionen | M |
| sec-7 | 🔵 Low | save-beacon nimmt Token im Body (Logging/CSRF-Kanal) | `server.js:464`, `api.ts:287` | keepalive-fetch mit Auth-Header bevorzugen | S |

---

## 4. UI/UX — 71/100

**Stärken:** First-Run-Controls-Legende (self-dismiss + über „?" abrufbar), Bewegungs-Coach der erst nach echtem Laufen verschwindet, `MissionTracker` + live `GuidanceArrow` („was tue ich als Nächstes" ist stark gelöst), Ein-Verb-„E"-Interaktion mit Payoff/Risk-Anzeige, reduziertes HUD, globaler `prefers-reduced-motion`-Reset, konsistente `:focus-visible`-Outlines, immer sichtbare Voice-Untertitel, 21-Tab-Dashboard aktiv gruppiert (5 Gruppen + Advanced-Gate).

| ID | Sev | Finding | Datei | Fix | Aufwand |
|---|---|---|---|---|---|
| ux-1 | 🟠 High | **Keinerlei Touch-Input**, aber Mobile-CSS → auf Handy/Tablet unbewegliche, fertig gerenderte Welt (CONFIRMED) | `ThreeScene.tsx:6288`, `App.tsx:1301`, `styles.css:6423` | Kurzfristig: `pointer:coarse`-Gate „Desktop erforderlich". Mittelfristig: On-Screen-Stick + Drag-Look + E-Button | L (Gate: S) |
| ux-2 | 🟡 Med | Welt-Interaktion nur Tastatur-„E", kein Klick-to-Interact | `App.tsx:1301`, `InteractionPanel.tsx:80` | Maustaste bei Pointer-Lock an `handlePrimaryInteraction` binden; Prompt „E / Klick" | M |
| ux-3 | 🟡 Med | Untertitel nicht abschaltbar, keine A11y-Settings | `App.tsx:1419`, `audio.ts:820` | Accessibility-Panel: Captions on/off + Textgröße, persistiert | M |
| ux-4 | 🟡 Med | Bis zu 21 Dashboard-Tabs — hohe Last trotz Gruppierung | `Dashboard.tsx:74,341` | Nah-Duplikate mergen (Jobs/Route→Plan; Law/Heat/Conflict→Pressure); Default auf ~6-8 | M |
| ux-5 | 🔵 Low | Kein Key-Rebinding; feste Single-Letter-Binds | `App.tsx:1444`, `ThreeScene.tsx:6288` | Rebinding-Panel, alternatives Bewegungs-Cluster | L |
| ux-6 | 🔵 Low | Reticle-Status nur über Farbe (teal/amber) | `styles.css:1564` | „Blocked"-Reticle zusätzlich per Form differenzieren | S |

---

## 5. Game-Design — 58/100

**Stärken:** Einstiegs-Loop (fix→stock→collect→expand) tight und exzellent geführt (`mission.ts` 10-Schritt-Funnel mit adaptiven Cash-Gates), echte laufende Geld-Senken (Löhne, Miete, Versicherung, Laundering), archetyp-differenzierte & erinnerungsfähige Rival-AI, Produkt-Roster mit echten Tradeoffs (legal↔grau↔Contraband), durchdachtes Anti-Frust-Pacing.

**Größter Fun-Limiter:** Sobald der geskriptete Einstieg endet, wird das Spiel ein spannungsfreier Idle-Incrementer.

| ID | Sev | Finding | Datei | Fix | Aufwand |
|---|---|---|---|---|---|
| gd-1 | 🟠 High | **Kein Verlust-Zustand** — Geld ist überall auf 0 gefloort, man kann nicht verlieren (CONFIRMED) | `reducer.ts:1309,3471,2112` | Echte Druck-Spirale: Schulden/Beschlagnahmung, Raid confisziert Distrikt, Soft-Game-Over | L |
| gd-2 | 🟠 High | Degenerate High-Pricing: roher Preis-Multiplikator schlägt jede Balance (CONFIRMED) | `machineStats.ts:75`, `economy.ts:185`, `reducer.ts:1110` | 0.35-Floor durch exponentiellen Abfall ersetzen; Zufriedenheits-Gate auch im Continuous-Pfad | M |
| gd-3 | 🟠 High | Billige Voll-Automatisierung höhlt den Kern-Loop aus (CONFIRMED) | `employees.ts:18`, `reducer.ts:5246,3170` | Skim/Diebstahl-Chance bei Auto-Collect, manueller Nachschub, Löhne skalieren mit Maschinenzahl | M |
| gd-4 | 🟡 Med | Late-Game-Herausforderung skaliert nicht (Gefahr strikt seriell) | `reducer.ts:254,245`, `rivalAi.ts:87` | Parallele Danger-Beats proportional zur Imperiumsgröße | M |
| gd-5 | 🟡 Med | Distrikt-Freischaltkosten trivial billig ggü. Einkommen | `world.ts:496`, `empire.ts:49` | Kosten steilen/skalieren, Distrikt-Upkeep/Heat | M |
| gd-6 | 🟡 Med | New Game Plus mechanisch flach (nur $150 + 1 Groll) | `replayability.ts:306,44` | Persistente Rival-Imperien, Regel-ändernde Modifier, Loadouts | L |
| gd-7 | 🟡 Med | Quest-Entscheidungen sind reine Flavour, kein divergenter Payoff | `quests.ts:60,156` | Faction/Main-Quests echt verzweigen (Folge-Steps/Rewards/Ending gaten) | M |
| gd-8 | 🔵 Low | Contraband-Risiko unterbestraft → „laut spielen" fast strikt besser | `products.ts:212`, `economy.ts:138` | Continuous-Sales-Heat an Legalität koppeln; Heat-Decay bei Contraband bremsen | M |

---

## 6. Multiplayer — 42/100

**Stärken:** Echt host-autoritatives Design mit Anti-Cheat-Absicht (Snapshots nur vom Host-Peer, Guest-Command-Allowlist, Faction-Rewrite), sauber extrahierte, getestete Room-State-Machine (42 Tests), solides Connection-Hardening (Token im Subprotocol, Origin-Allowlist, Socket-Cap, Token-Buckets, Heartbeat-Reaping), WebRTC-DataChannel mit Relay-Fallback, sorgfältiges Save-Ownership.

**Fazit:** Kein Fake-Demo, aber ein „spiel meinen Save zusammen"-Modus — nicht das kompetitive Krimi-Imperium, das die Prämisse verspricht.

| ID | Sev | Finding | Datei | Fix | Aufwand |
|---|---|---|---|---|---|
| mp-1 | 🟠 High | Koop = **ein geteiltes Imperium**, keine Rivalität/Sabotage/Territorium/Handel (CONFIRMED) | `useGame.ts:351,16` | Zweite spieler­gesteuerte Faction → Territorien-Konflikt via bestehende Rival-/Conflict-Systeme | L |
| mp-2 | 🟠 High | Host-Reconnect erzeugt **neuen** Room-Code, verwaist alle Guests still (CONFIRMED) | `multiplayerClient.ts:94`, `roomManager.js:146` | Room-Code über Grace-Window serverseitig halten, Host-Reclaim | M |
| mp-3 | 🟡 Med | Voll-GameState-Snapshots alle 500ms skalieren nicht (verifiziert: Mechanismus tw. korrigiert — Fehlermodus ist Socket-Close/Reconnect, nicht stiller Stopp) | `useGame.ts:107,385`, `types.ts:882` | Delta/Diff-Snapshots + Keyframe; `eventLog` nicht über den Draht | L |
| mp-4 | 🟡 Med | Keine Interpolation/Prediction — Guest-Welt aktualisiert mit ~2 FPS | `useGame.ts:330,385` | Interpolations-Buffer für Positionen/Weltzeit | M |
| mp-5 | 🟡 Med | Guest-Commands fire-and-forget, kein Ack/Reconcile | `useGame.ts:417` | Optimistic Apply + Reconcile, oder `command:ack/reject` | M |
| mp-6 | 🟡 Med | Pending Guest-Commands gehen über Reconnect verloren → stille Desync | `multiplayerClient.ts:186,475` | Un-acked Commands nach Rejoin replayen, Input während Reconnect blocken | M |
| mp-7 | 🟡 Med | Kein Late-Join-Catch-up über den einen Peer-Count-Snapshot hinaus | `useGame.ts:361` | Guest→Host „request keyframe", mehrere Keyframes bei Join | S |
| mp-8 | 🔵 Low | Host hat vollen Trust, kann Guests griefen (auch `execute_ending`) | `useGame.ts:335,23` | Destruktive geteilte Aktionen hinter Guest-Bestätigung | M |
| mp-9 | 🔵 Low | Kein Spectator-Modus, harter Cap 4 Sitze | `roomManager.js:41`, `protocol.ts:3` | Read-only-Spectator-Rolle über dem 4er-Cap | S |
| mp-10 | 🔵 Low | Kein Matchmaking/Discovery; echte Live-Session nie QA'd | `App.tsx:848`, `multiplayer-qa-2026-06-29.md` | Manuelle 45-Min-Session fahren; einfaches Quick-Join-Lobby | M |

---

## 7. Virality & Retention — 18/100  ← der eigentliche Engpass

**Stärken (= brachliegende Hooks):** Deterministischer, seedbarer City-Generator existiert bereits; starke Replayability-Inhalte (NG+, Traits, Rival-Memory); Ending-Overlay baut bereits eine reiche, prahlbare Run-Zusammenfassung; meme-fähige Prämisse & Voice; serverseitige LiveOps-Analytics-Backbone; Produkt-Customization (Brand/Farbe/Tagline) zeigt, dass Identität möglich ist.

**Kern:** Alles für ein virales Loop ist **im Code vorhanden, aber nicht spielerseitig verdrahtet.**

| ID | Sev | Finding | Datei | Fix | Aufwand |
|---|---|---|---|---|---|
| growth-1 | 🟠 High | **Kein teilbares Run-/Empire-Card** am Ende — der größte verpasste virale Moment (CONFIRMED) | `App.tsx:1507,1464`, `Dashboard.tsx:384` | „Empire-Card teilen"-Button: Ending-Stats auf Offscreen-Canvas + Copy-Image/Text/Download (Muster existiert) | M |
| growth-2 | 🟠 High | Deterministische Seeds nur Admin — kein „Challenge diese Stadt"-Share (CONFIRMED) | `cityLayout.ts:610`, `AdminMapEditor.tsx:1262`, `App.tsx:1004` | Aktiven Seed in Card/Pause zeigen, „Run aus Seed starten" im New-Game-Flow | M |
| growth-3 | 🟠 High | Keine Spieler-Identität (kein Imperium-Name/Logo) (CONFIRMED) | `empire.ts:23`, `ThreeScene.tsx:1784`, `App.tsx:325` | Name + Logo-Glyph/Farbe bei New Game, prozedural auf Card & In-World-`brandPuck` gerendert | M |
| growth-4 | 🟠 High | Keine Daily/Streak/Comeback-Belohnung — null Session-Return-Hooks (CONFIRMED) | `replayability.ts:306`, `liveOpsAnalyzer.js:158`, `quests.ts:8` | Daily-Goal + Streak über Save-Timestamps; kleiner streak-skalierter Bonus | L |
| growth-5 | 🟡 Med | Kein Leaderboard, obwohl Backend alle States bereits ingestiert | `liveOpsAnalyzer.js:56,137` | Read-only Weekly-Leaderboard aus vorhandenen Feldern + In-Game-Panel | L |
| growth-6 | 🟡 Med | Koop-Invite = nackter Clipboard-Code, kein Link | `App.tsx:865` | **Voll Join-URL** (`?room=CODE`) kopieren + auf Load auto-fill/join → billigster k-Faktor-Win | **S** |
| growth-7 | 🟡 Med | Reiche Per-Run-„Flex-Stats" werden nie zum postbaren Brag | `replayability.ts:271`, `App.tsx:1483` | `replayEndingSummary` als copybare Caption auf der Card | S |
| growth-8 | 🟡 Med | Kein Screenshot/Photo-Mode trotz idealem prozeduralem Renderer | `ThreeScene.tsx`, `App.tsx:464` | Foto-Taste: Canvas-Capture (`toDataURL`/`preserveDrawingBuffer`) + Download/Copy, optional Watermark | M |

---

## 8. Asset/Audio-Vollständigkeit — 88/100 (deine Kernfrage)

**Antwort auf „sind alle Sounds/Bilder/Musik da, die generiert werden sollen?" → Weitgehend JA.** Alle 15 `synth://`-Assets haben einen Synthese-Zweig in `audio.ts`; jeder Default-Cue mappt auf ein definiertes Asset; alle 3 Musik-Betten (city_bed/heat/conflict) werden generiert **und** korrekt durch Heat/Conflict-State getriggert; alle 14 Voice-Trigger haben 3-zeilige Noir-Bänke + erreichbare Dispatch-Pfade; alle 11 Maschinen-Modelle, 4 Fahrzeugklassen, 16 Produkte und 7 Gebäudestile haben typ-erzwungene prozedurale Builder.

**Das eine echte Loch — 6 designte Sounds, die nie abgespielt werden können:**

| ID | Sev | Finding | Fix | Aufwand |
|---|---|---|---|---|
| audio-1 | 🟡 Med | **6 Cues mit Generator, aber ohne Dispatch:** `feedback.route`, `feedback.fleet`, `event.festival`, `event.weather`, `event.shortage`, `event.trend`. `SceneFeedbackKind` kennt kein `route`/`fleet`; `GameEventTone` ist nur `neutral\|good\|warning\|danger`, also `festival/weather/shortage/trend` werden nie übergeben. Festivals, Wetter & Engpässe sind reale In-Game-Events — ihr designtes Audio-Feedback fällt still weg. | Events aus dem Reducer verdrahten (Cue-Dispatch) + `route`/`fleet`-Feedback-Kinds ergänzen — **oder** ungenutzte Trigger/Assets/Prompts entfernen | M |
| audio-2 | 🔵 Low | 10/14 Voice-Cues hängen an brüchigem Event-Message-**Regex** (`/joined the route crew/i` etc.). Eine Copy-Änderung im Reducer killt still eine Voice-Line — ohne Compile-/Test-Fehler. | Voice-Cues auf strukturierte Event-Kinds/IDs umstellen, oder CI-Test der Patterns | M |
| audio-3 | 🔵 Low | Mehrere semantisch verschiedene Cues (`event.warning`, `feedback.lockdown`, `feedback.district`) fallen auf denselben generischen `alert`-Default-Ton — ein Territorien-Unlock klingt wie eine Routine-Warnung. *(unabhängig bestätigt)* | Dedizierte Preset-Zweige `alert`/`lockdown`/`district` in `playSynthAsset` | S |

**Asset-Matrix (Auszug):** 15 Audio-Assets → alle mit Generator; 3 davon (`event_crowd`, `weather_shift`, `shortage_tick`) referenziert=false wegen audio-1. Visuals: 11 Maschinen, 4 Fahrzeuge, 16 Produkte, 7 Gebäudestile, 21 Model-Katalog-Klassen, Stock-Crate, UI-Icons (lucide + Fallback) — **alle mit Builder, kein danglender Verweis, kein Crash-Risiko.**

---

## 9. Querschnittliche Lücken (von keiner Dimension besessen)

Der Lücken-Kritiker fand 10 Bereiche, die zwischen den Dimensionen durchfielen:

1. **Client-Crash-Resilienz** — kein `ErrorBoundary` (`main.tsx`), kein `try/catch` um `reduceGameState` (`useGame.ts`), Reducer läuft jeden Tick → **ein Throw = weißer Bildschirm**. *(Top-Risiko #2)*
2. **Server `uncaughtException`-Anti-Pattern** — nur `console.error`, Prozess läuft korrupt weiter (`server.js:44`). Sollte log-then-`exit(1)` + Supervisor-Restart.
3. **Keine Security-Header** — kein CSP/`X-Frame-Options`/HSTS/`X-Content-Type-Options` → Clickjacking-fähig, null Defense-in-Depth hinter „kein XSS heute".
4. **Admin-Monitoring = PII-Massen-Exfiltration** — verschärft sec-1: Default-Admin liest jeden Profilnamen/Cash/Heat/Distrikte (`api.ts:96`).
5. **Keine `LICENSE`, keine Alters-/Content-Einstufung** für einen Krimi/Contraband-Sim.
6. **`ThreeScene.tsx` (6560 Zeilen) ohne Test-Coverage & ohne Last-/Perf-Messung** — größte, spielernächste Datei, am wenigsten getestet.
7. **CI/CD ohne Dependency-Audit/Secret-Scanning**; `deploy.yml`-Guard auf `proark1/…` ggf. stale ggü. Fork.
8. **City-Generierung auf dem Main-Thread** — der vorhandene Worker wird nur vom Admin-Editor genutzt; Spieler-Reseed würde ruckeln.
9. **Save-Datenverlust an MP-Rollenübergängen** — Guest→Non-Guest-Restore ungetestet; Risiko, eigenes Imperium still zu überschreiben.
10. **Telemetrie-Consent/Transparenz** — kontinuierlicher Upload benannter States nach Postgres ohne jeden Datenschutz-Hinweis.

---

## 10. Priorisierte Roadmap

### P0 — Ship-Blocker (vor jeder öffentlichen Exposition)
- **sec-1** Admin-Default-Creds entfernen/gaten, rotieren, Platzhalter in Repo *(S)*
- **Lücke 1** `ErrorBoundary` + `try/catch` um Reducer, Rollback-auf-letzten-guten-State *(S–M)*
- **sec-2** Login-Rate-Limiting + Lockout *(M)*
- **Lücke 4** Admin-Monitoring als PII behandeln (reitet auf sec-1) *(S)*
- **Lücke 5** `LICENSE` hinzufügen *(S)*
- **Lücke 3** Security-Header (CSP/X-Frame-Options/HSTS) *(S)*

### P1 — Fun & Wachstum (wo das Spiel wirklich schwach ist)
- **gd-1** Verlust-Zustand/Druck-Spirale einführen *(L)* — größter Fun-Gewinn
- **gd-2** Preis-Kurve entschärfen · **gd-3** Automatisierungs-Friktion *(je M)*
- **growth-6** Join-URL statt nacktem Code *(S)* — billigster k-Faktor-Win
- **growth-1 + growth-7** Teilbare Empire-Card mit Brag-Caption am Ending *(M)*
- **growth-3** Imperium-Identität (Name + Logo) *(M)*
- **growth-2** Seed-Share/„Challenge diese Stadt" *(M)*
- **ux-1** Mindestens Touch-Gate „Desktop erforderlich" *(S)*, später echte Touch-Controls *(L)*
- **audio-1** Die 6 toten Sound-Cues verdrahten *(M)*

### P2 — Tiefe & Politur
- Restliche gd- (4/5/6/7/8), mp- (3–10), ux- (2–6), growth- (4/5/8), sec- (3–7), audio- (2/3)
- Lücken 2/6/7/8/9/10 (Server-Restart, ThreeScene-Tests, CI-Audit, Worker-Threading, MP-Save-Integrationstest, Datenschutz-Hinweis)

---

## 11. Methodik & Verlässlichkeit

- 6 Dimensions-Audits parallel (je Opus 4.8), jedes evidenzbasiert mit `file:line`.
- Alle High/Critical-Findings durch **separate adversariale Verifier** gegengeprüft (Auftrag: widerlegen). Ergebnis: fast alle **CONFIRMED**; `mp-3` von High→Medium herabgestuft (Fehlermodus präzisiert); mehrere Zeilen-Nits korrigiert, ohne die Kernaussagen zu schwächen.
- Lücken-Kritiker suchte gezielt nach nicht-abgedeckten Subsystemen.
- Ergänzt um unabhängige Toolchain-Checks (typecheck/test/lint) + eigene Gegenprüfung von sec-1 und audio-3.
- Aufwand: 12 Agenten, ~839k Tokens, 296 Tool-Calls.

*Aufwands-Legende: S = klein (<½ Tag) · M = mittel (½–2 Tage) · L = groß (>2 Tage / Systemarbeit).*
