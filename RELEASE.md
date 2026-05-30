# Releasing Kattegat Kaper on Steam

This document is the practical checklist and packaging plan for shipping the game
on Steam. The game logic is a Node.js terminal application (neo-blessed). Steam
expects a double-clickable executable per platform, so the core distribution
problem is **wrapping the terminal app in a self-contained launcher**.

---

## 1. Packaging approaches

### Recommended: Electron + xterm.js (windowed app)

A terminal game that "just works" when launched from Steam (no external terminal,
consistent fonts/colors/Unicode, resizable) is best delivered as an Electron app
that hosts a terminal emulator:

- **Electron** provides the window and the per-platform binary Steam launches.
- **xterm.js** renders the terminal inside the window.
- **node-pty** spawns `node src/index.js` in a pseudo-terminal and pipes its
  stdout into xterm.js and keystrokes back.

Pros: works identically on Windows/macOS/Linux; full 256-color + Unicode; the
player never sees a raw shell; you control window size, font, and icon. This is
how most terminal/ASCII roguelikes ship on Steam.

Cons: ~150 MB bundle; you maintain an Electron shell.

Build & sign per platform with `electron-builder`. Wire Steamworks via
`steamworks.js` if you want achievements/cloud saves surfaced on Steam (the game
already tracks achievements internally — see `src/meta/achievements.js`).

### Alternative: single-binary via `@yao-pkg/pkg`

`pkg` bundles Node + the source into one executable per platform. Lighter (~50 MB)
but: on Windows it opens a console window (acceptable); on macOS a bare binary has
no terminal when double-clicked, so you must ship a small `.app`/`.command`
wrapper that opens Terminal. Font/color depends on the user's terminal. Good for
an itch.io build or a quick Steam Linux/Windows depot; weaker macOS story.

### Minimum: launch script

Ship `node` + source + a platform launch script set as the Steam launch option.
Only viable if you can assume Node is present — **not recommended for Steam**.

---

## 2. Terminal / window requirements

- **Minimum size 80×24.** Below this the game shows a "please enlarge your
  terminal" notice instead of rendering (see `src/engine/game-loop.js`,
  `MIN_COLS`/`MIN_ROWS`). The Electron shell should set an initial size of at
  least ~120×40 and a minimum window size that maps to ≥ 80×24 cells.
- **Font:** a monospace font with box-drawing + block glyphs (e.g. Cascadia Mono,
  DejaVu Sans Mono). Ship the font with the Electron build so rendering is
  consistent across machines.
- **256-color:** ensure `TERM=xterm-256color`. `src/index.js` already normalizes
  Ghostty's term name; under node-pty set `TERM` explicitly.

---

## 3. Saves & data

The game writes to `~/.kattegat-kaper/`:
- `save-{slot}.json` — game saves (auto-save on port entry)
- `persistent.json` — lifetime stats, achievements, cosmetics
- `hall-of-fame.json` — top 5 completed runs
- `crash.log` — caught runtime errors (added for release resilience)

For Steam Cloud, map this directory in the Steamworks depot config. Saves are
resilient: corrupt/old JSON is handled (`src/engine/save-load.js`,
`deserializeGameState` and `loadPersistent` both fail soft).

---

## 4. Pre-release quality gate

Run before every build:

```bash
npm test     # unit/scenario/integration/playthrough suites (533 tests)
npm run fuzz # headless mode fuzzer — drives every mode for crashes
npm run smoke # PTY smoke test — launches the real game, scripts input (needs python3)
```

All three must be clean. `npm run smoke` sets `KK_DEBUG=1` so any error in the
real game loop fails fast (in shipping builds the loop logs to `crash.log` and
keeps running instead of crashing the player's session).

### Verified this pass
- All 9 ports and 6 islands are reachable by ship on the shipped map
  (`kattegat-default`) — previously 3 ports (incl. Helsingør, which gates the
  campaign) were unreachable. Regression: `test/scenarios/map-reachability.test.js`.
- The campaign can be completed via cannon **or** boarding; the Act 5 boss cannot
  be stranded by infiltration. Regression: `test/scenarios/combat-resolution.test.js`.
- Stealth ship infiltration is always fully completable.
  Regression: `test/scenarios/stealth-reachability.test.js`.
- Melee always terminates; ammo limits enforced; mutiny has consequences.
  Regression: `test/scenarios/bugfix-regressions.test.js`.

---

## 5. Debug features (must stay disabled in shipping builds)

These are gated behind the `KK_DEBUG` environment variable and must NOT be set in
the Steam build:
- `V` from open water → force a combat encounter (the codec eavesdrop use of `V`
  is always available and is a real feature).
- `P` → teleport into the nearest port (bypasses harbor approach + reputation).

Do not set `KK_DEBUG` in the Electron/pkg launch environment.

---

## 6. Known limitations / non-blocking polish backlog

- The `fort` and `warehouse` stealth templates are not currently launched by any
  game path (only `ship` is). They are inert content, not bugs.
- Lifetime stats merge with `max` per stat, so cross-run totals reflect the best
  single run rather than a cumulative sum (intentional — repeated auto-saves make
  summing unsafe). Achievements are reachable within a single run.
- The Act 4 Admiral dialogue is bypassed by the automatic port-entry advance
  (narrative beat, not a blocker).

---

## 7. Store/launch checklist

- [ ] Electron shell builds and launches the game on Win/macOS/Linux
- [ ] Window ≥ 80×24 cells; bundled monospace font; icon set
- [ ] Steam depot per platform; Steam Cloud maps `~/.kattegat-kaper/`
- [ ] `KK_DEBUG` unset in launch env
- [ ] `npm test && npm run fuzz && npm run smoke` all clean on the build commit
- [ ] Store page: screenshots, controls (the in-game `?` overlay lists them), trailer
