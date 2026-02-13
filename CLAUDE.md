# Kattegat Kaper

A terminal pirate game set in the Kattegat strait, built with neo-blessed.

## Running

```bash
npm start        # or: node src/index.js
```

## Architecture

- **CommonJS** throughout — neo-blessed is CJS; simplex-noise v4 (ESM) loaded via dynamic `import()`
- **Direct buffer writing** — map tiles written into `screen.lines[y][x] = [attr, ch]` for performance
- **256-color palette** — blessed attr format: `(fg << 9) | bg`
- **setTimeout game loop** at ~12 FPS

## File Structure

```
src/
  index.js              — Entry point: creates screen, generates map, starts loop
  engine/
    screen.js           — neo-blessed screen creation
    state.js            — State machine for game modes
    game-loop.js        — setTimeout loop with delta timing
    input.js            — Key event dispatch to active mode
    save-load.js        — Save/load system (JSON, auto-save, slot management)
  render/
    tiles.js            — Tile type definitions (chars, colors, flags)
    hud.js              — Bottom HUD bar (wind, position, hull, speed, weather)
    crt-filter.js       — CRT visual filter (scanlines, vignette) and terminal bell
  world/
    map-gen.js          — Simplex noise + channel mask procedural generation
    ports.js            — 9 real Kattegat port locations
    npc-ships.js        — NPC ship spawning, AI movement, faction system
    factions.js         — Reputation & faction system (5 factions, tiers, ripple effects)
    weather.js          — Weather state machine (clear/fog/rain/storm, effects)
  modes/
    title.js            — Title screen mode (save/load menu)
    overworld.js        — Main sailing mode (movement, wind, FOV, weather, CRT)
    spyglass.js         — Telescope aiming phase (brass ring, weather sway)
    power-gauge.js      — Oscillating power bar firing phase
    drone-cam.js        — Cannonball follow camera (pseudo-3D, 4 phases)
    harbor.js           — Frogger-style harbor approach
    port.js             — On-foot town exploration mode (NPCs, auto-save)
    island.js           — Island exploration (puzzles, dig, wildlife, rival)
    encounter.js        — Encounter dialog (hail/flee/attack/board/infiltrate)
    melee.js            — Melee sword combat (boarding, bar fight, duel, stealth)
    stealth.js          — Stealth infiltration mode (guards, vision cones, objectives)
    credits.js          — Auto-scroll credits sequence after campaign completion
  combat/
    combat-state.js     — Damage calculations, enemy templates, combat logic
    melee-state.js      — Melee combat state, moves, resolution, enemy AI
    melee-art.js        — ASCII fighter stances, clash frames, color defs
    trajectory.js       — Parabolic cannonball physics
    ship-art.js         — 4 ASCII ship art scales
    effects.js          — Explosion and splash particle systems
  harbor/
    lanes.js            — Frogger lane generation, obstacles, collision
    harbor-art.js       — Obstacle sprites, lane colors, animations
  port/
    town-map.js         — Procedural town layout generator (60x40, 16 tile types)
    town-npcs.js        — Town NPC definitions and spawning (5 types)
  stealth/
    stealth-map.js      — Stealth map tiles and template generation (3 templates)
    guard-ai.js         — Guard AI, vision cones, alert cascade, hiding
  island/
    island-map.js       — Procedural island generation (caves, ruins, puzzles)
    wildlife.js         — Wildlife entities (crab, snake, boar)
    rival.js            — Rival pirate NPC (greedy pathfind, timer, chase)
    treasure.js         — Treasure map data, loot tiers, dig rewards
  economy/
    goods.js            — Trade goods, port prices, upgrades, economy state
    shop-ui.js          — Market and shipwright overlay UI (buy/sell/upgrade)
  crew/
    crew.js             — Crew data model, morale, recruitment, roles, events
    crew-ui.js          — Tavern overlay: roster, recruit, pay wages
  convoy/
    convoy.js           — Convoy & blockade data model, formation, ambush spawning
    convoy-hud.js       — Convoy HUD overlay (escort dots, formation, timer)
  story/
    campaign.js         — Campaign state model, 5-act progression, key items, endings
    npcs.js             — 6 story NPC definitions, ASCII portraits, port placement
    dialog.js           — Dialog trees (~25 nodes) for story NPCs across acts
    journal-ui.js       — Campaign journal overlay (J key): objective, entries, items
  meta/
    achievements.js     — 20 achievements with stat-based thresholds and check logic
    legacy.js           — Persistent stats, difficulty, Hall of Fame, New Game+, cosmetics
    captains-log.js     — Event-driven prose generation, captain's log UI overlay (L key)
```

## Mode Interface

Every game mode implements: `enter(gameState)`, `exit()`, `update(dt)`, `render(screen)`, `handleInput(key)`

## Map

300x200 Uint8Array. Tile types: DEEP_OCEAN(0), OCEAN(1), SHALLOW(2), BEACH(3), GRASS(4), FOREST(5), HILL(6), MOUNTAIN(7), PORT(8).

## Controls

- Arrow keys / WASD: Set ship direction
- Enter: Start game / interact / confirm
- C: Toggle CRT filter (overworld)
- L: Captain's log (overworld/port)
- Q: Quit from title / return from modes
- Ctrl-C: Exit anytime

## Roadmap

See `ROADMAP.md` for full progress tracking with checkboxes. **Always update ROADMAP.md** when implementing new features — check off completed items, add new files to the file structure, and update phase status labels.
