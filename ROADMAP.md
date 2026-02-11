# Kattegat Kaper — Roadmap & Progress

A modern terminal pirate game — spiritual successor to **Kaptajn Kaper i Kattegat** (1985).

---

## Development Milestones

> Checkboxes track implementation status. Update this file when completing work.

### Phase 1: Core Engine — COMPLETE

- [x] Neo-blessed screen setup with Unicode support
- [x] 12 FPS delta-time game loop (setTimeout, MAX_DT cap)
- [x] State machine for mode transitions (register, enter/exit, update/render/handleInput)
- [x] Input handler with key abstraction (arrows, WASD, Enter, Space, Q, Ctrl-C)

**Files:** `engine/screen.js`, `engine/game-loop.js`, `engine/state.js`, `engine/input.js`

### Phase 2: Overworld Sailing — COMPLETE

- [x] Simplex noise procedural map (300x200, 3 octaves, channel mask at Helsingør)
- [x] 9 tile types: DEEP_OCEAN → OCEAN → SHALLOW → BEACH → GRASS → FOREST → HILL → MOUNTAIN → PORT
- [x] 9 real Kattegat ports with spiral-search placement on nearest coast tile
- [x] Viewport scrolling centered on player ship
- [x] 8-directional movement with fractional position accumulation
- [x] Wind system: 8 directions, strength 1-5, changes every 20-40s
- [x] Speed modifiers based on wind angle (0.3–1.0 multiplier)
- [x] FOV via rot-js RecursiveShadowcasting (15-tile range)
- [x] 3 visibility states: unexplored (black), explored (dark), visible (full color)
- [x] Animated water tiles (4-frame cycle, 0.5s interval)
- [x] Port name labels rendered when visible
- [x] HUD bar: wind direction/strength, ship position, hull, speed
- [x] Direct buffer writing (`screen.lines[y][x] = [attr, ch]`)

**Files:** `world/map-gen.js`, `world/ports.js`, `modes/overworld.js`, `render/tiles.js`, `render/hud.js`

### Phase 3: Cannon Combat — COMPLETE

- [x] **Spyglass aiming**: circular vignette, brass ring gradient (6 xterm colors), animated ocean bg
- [x] Hand sway (sinusoidal, wind-affected), parallax scene movement
- [x] Crosshair reticle with tick marks, distance estimation text
- [x] Ammo type cycling (iron / chain / grape) via Space
- [x] **Power gauge**: oscillating 0-100%, speed scales with wind
- [x] Bar gradient (green→yellow→orange→red), sweet spot marker at 75%
- [x] Aim quality indicator (EXCELLENT / FAIR / POOR)
- [x] Cannon ASCII art with animated fuse spark
- [x] **Drone camera**: pseudo-3D perspective (Space Harrier style)
- [x] Sky gradient, perspective-scaled ocean waves
- [x] 4 ship art scales (tiny→small→medium→large) growing as ball approaches
- [x] Cannonball with smoke trail, wind drift visualization
- [x] Parabolic trajectory physics (gravity -4.0, wind lateral offset)
- [x] Hit detection: 6-unit direct hit, 12-unit near-miss radius
- [x] Explosion particles (16, yellow→orange→red) and splash particles (10, cyan)
- [x] Damage calculation: power-based scaling, ammo type modifiers
- [x] Enemy return fire (accuracy based on crew ratio)
- [x] Multi-round combat with round tracking and combat log
- [x] 5 enemy ship templates

**Files:** `modes/spyglass.js`, `modes/power-gauge.js`, `modes/drone-cam.js`, `combat/combat-state.js`, `combat/trajectory.js`, `combat/ship-art.js`, `combat/effects.js`

### Phase 4: Harbor Frogger — COMPLETE

- [x] Player ship at bottom, dock goal at top
- [x] 12-row lane layout: dock, reef, naval, merchant, fishing, current, debris, water
- [x] Moving obstacles with per-type speed, width, gap, spawn interval
- [x] Static reef obstacles with guaranteed passage gaps
- [x] Current lanes push player sideways (force 2)
- [x] Collision detection with invulnerability window (1.5s, 0.15s flash)
- [x] Dynamic lane adaptation for screen height
- [x] Obstacle sprites: merchant ships (L/R), fishing boats, naval ships, debris types
- [x] Lane background colors and animations (wave chars, dock pattern, current arrows)
- [x] Success/failure overlay (2.5s), returns to overworld
- [x] Q to retreat

**Files:** `modes/harbor.js`, `harbor/lanes.js`, `harbor/harbor-art.js`

### Phase 5: On-Foot Port Exploration — COMPLETE

- [x] Port mode registered in state machine, entered after harbor success
- [x] Town tile map (buildings, streets, docks, water) — 60x40 procedural generation
- [x] Player `@` character with 4-directional walking
- [x] FOV lighting (rot-js RecursiveShadowcasting, range 12)
- [x] Building interiors (tavern, market, shipwright, harbor master, church)
- [x] Door tiles to enter/exit buildings with interaction messages
- [x] Return to ship (ship tile + Enter, or Q shortcut)
- [x] Basic NPC placement — 5 types (Bartender, Fishwife, Sailor, Priest, Guard) in building interiors

**Files:** `port/town-map.js`, `port/town-npcs.js`

### Phase 6: Trading Economy — COMPLETE

- [x] Goods data (cod, herring, grain, timber, iron, gunpowder, silk, spices) — 8 goods with base prices
- [x] Port price tables with supply/demand variation — per-port multipliers + ±10% jitter
- [x] Player cargo inventory with hold capacity — starts at 20, expandable
- [x] Buy/sell UI in market buildings — tabbed overlay with cursor selection, Space to trade
- [x] Currency system (rigsdaler) — starts with 100 rds, shown in HUD
- [x] Ship upgrade purchasing at shipwright (hull repair, hull plating, cargo ext, fast sails, extra cannon)

**Files:** `economy/goods.js`, `economy/shop-ui.js`

### Phase 7: Encounters & NPC Ships — COMPLETE

- [x] NPC ships on overworld map (English, Danish, merchant, pirate) — up to 12 ships
- [x] Ship AI: waypoint-based movement, English/pirates hunt player when close, merchants wander
- [x] Encounter trigger on adjacency (1-tile range) with cooldown
- [x] Encounter dialog: hail / flee / attack with faction-specific flavor text and hints
- [x] Faction-colored ship rendering (red=English, blue=Danish, amber=merchant, white=pirate)
- [x] Loot from defeated ships (gold + cargo, merchants carry more)
- [x] Spawn/despawn system: ships spawn in ring around player, despawn when far
- [x] Flee damage from hostile factions (English, pirates fire parting shots)

**Files:** `world/npc-ships.js`, `modes/encounter.js`

### Phase 8: Crew System — COMPLETE

- [x] Crew member stats (strength, sailing, gunnery, loyalty, morale) — 5 stats, 1-10 scale
- [x] Crew roster UI — tabbed overlay with Roster/Recruit/Pay tabs
- [x] Morale system (time at sea drains, unpaid crew lose loyalty, port visits restore)
- [x] Tavern recruitment — 4 random candidates with traits, stats, hire cost
- [x] Role assignment (gunnery, sailing, boarding) — sub-menu on roster tab
- [x] Mutiny event trigger at avg morale < 3 (20% chance per day)
- [x] Desertion at morale ≤ 2 + loyalty ≤ 3 (30% chance per day)
- [x] Victory/loss morale effects, pay crew wages system
- [x] Combat uses real crew count, crew affects gunnery accuracy
- [x] 2 starter crew members (Bjorn Eriksson, Lars Petersen)
- [x] 10 personality traits with stat bonuses

**Files:** `crew/crew.js`, `crew/crew-ui.js`

### Phase 9: Reputation & Factions — COMPLETE

- [x] 5 faction tracks: Danish Crown, Smuggler Network, English Navy, Merchant Guild, Pirate Brotherhood
- [x] Action→reputation ripple effects (attack, defeat, hail, trade, tax — cross-faction ripple)
- [x] Reputation-gated port access (Crown rep < 20 blocks major ports) and trade prices (Merchant Guild rep modifies buy/sell)
- [x] Notoriety affects harbor patrol density (Navy rep scales obstacle speed) and encounter frequency (aggression/detection range)
- [x] Harbor Master building shows faction standings UI with tier labels and bars
- [x] 7 reputation tiers: Hated → Hostile → Unfriendly → Neutral → Friendly → Respected → Honored

**Files:** `world/factions.js`

### Phase 10: Island Exploration — COMPLETE

- [x] Procedural island generation (beach, jungle, rocks, caves, ruins) — radial falloff, deterministic seed
- [x] Treasure map items — 15% drop from combat victories, target specific islands
- [x] Dig mechanic at X-marks-the-spot — loot overlay with 4 treasure tiers (50-1000 gold + rare cargo)
- [x] Environmental puzzles (Sokoban boulders, pressure plates, keys, locked doors, torches)
- [x] Wildlife encounters (crabs, snakes, boar) — 3 behaviors: wander, aggressive, charge
- [x] Rival pirates racing for treasure — 120s countdown, greedy pathfinding, angry chase
- [x] 6 islands stamped on overworld map with green/gold labels
- [x] Island mode with FOV (10 surface, 6/12 cave), camera, HUD
- [x] Boat tile to return to overworld

**Files:** `island/island-map.js`, `island/wildlife.js`, `island/rival.js`, `island/treasure.js`, `modes/island.js`

### Phase 11: Sword Combat — COMPLETE

- [x] Side-view melee mode with ASCII fighters (7-line tall, 3 stances per side)
- [x] 3-zone attack/defend (high/mid/low) with simultaneous resolution
- [x] 4 moves: slash (15-25 dmg), thrust (25-40 dmg), parry (riposte 20-30), dodge (avoid all)
- [x] Clash animation (approach, impact, recoil frames over 2s)
- [x] Stamina system (100 max, 15 regen/round, per-move costs)
- [x] Boarding combat from encounters (4th choice "Board!") with crew strength bonus
- [x] Bar fight variant (25% chance in tavern, reduced HP, gold/morale stakes)
- [x] Island duel (angry rival triggers melee instead of flat damage)
- [x] 4 enemy AI styles: aggressive, defensive, balanced, drunk
- [x] HP/stamina bars, combat log, result overlay with loot display

**Files:** `combat/melee-state.js`, `combat/melee-art.js`, `modes/melee.js`

### Phase 12: Stealth Infiltration — COMPLETE

- [x] Fort/ship/warehouse infiltration maps — 3 ASCII templates (40x25)
- [x] 11 stealth tile types (water, stone, wall, door, crate, barrel, objective, exit, entry, window, torch)
- [x] Guard AI with patrol routes and vision cones (range 7, 60° cone)
- [x] 4 alert states: patrol → suspicious (1.5s) → alert (3s) → combat (adjacent)
- [x] Hiding behind cover (walls, barrels, crates) — dot product check
- [x] Alert cascade: nearby guards (Manhattan 10) go suspicious
- [x] Objectives: steal, sabotage, free prisoners — interact with Enter
- [x] Detection → fight or flee choice overlay
- [x] Fight triggers melee with Fort Guard template, flee uses distance roll
- [x] Rewards: gold (50-200) + reputation changes
- [x] Vision cone overlay rendering (olive/amber/red by alert state)
- [x] Encounter "Infiltrate" choice for English faction ships

**Files:** `stealth/stealth-map.js`, `stealth/guard-ai.js`, `modes/stealth.js`

### Phase 13: Weather System — COMPLETE

- [x] Wind direction (8-way) and strength (1-5) with periodic changes
- [x] Wind affects sailing speed and cannon trajectories
- [x] 4 weather types: clear, fog, rain, storm — timer-based transitions (30-60s)
- [x] Fog: reduces FOV to 8, hides NPC ships beyond range 5
- [x] Storms: hull damage (0.5 per 5s), speed penalty (0.6x), FOV reduced to 6, lightning flashes
- [x] Rain: speed penalty (0.85x), reduced FOV to 12, rain particle overlay
- [x] Weather overlay rendering (fog particles, rain chars, storm + lightning)
- [x] HUD weather display with label and icon
- [x] Spyglass sway multiplier affected by weather (1.0x clear to 1.8x storm)
- [x] Weighted random transitions (clear 40%, fog 25%, rain 25%, storm 10%)

**Files:** `world/weather.js`

### Phase 14: Polish — COMPLETE

- [x] Save/load system — JSON serialization to `~/.kattegat-kaper/save-{slot}.json`
- [x] Auto-save at port visits
- [x] Title menu: Continue (auto-save), New Game, Load Game (save browser), Quit
- [x] CRT aesthetic toggle (scanlines, vignette) — press C in overworld
- [x] Terminal bell wrapper for alerts
- [x] Save metadata display (ship name, gold, date)

**Files:** `engine/save-load.js`, `render/crt-filter.js`

---

## Current File Structure

```
src/
  index.js              — Entry point: screen, map gen, loop start
  engine/
    screen.js           — Neo-blessed screen creation
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
    npc-ships.js        — NPC ship spawning, AI, faction system
    factions.js         — Reputation & faction system (5 factions, tiers, ripple effects)
    weather.js          — Weather state machine (clear/fog/rain/storm, effects, transitions)
  modes/
    title.js            — Title screen mode (save/load menu)
    overworld.js        — Main sailing mode (movement, wind, FOV, weather, CRT)
    spyglass.js         — Telescope aiming phase (brass ring, weather sway)
    power-gauge.js      — Oscillating power bar firing phase
    drone-cam.js        — Cannonball follow camera (pseudo-3D, 4 phases)
    harbor.js           — Frogger-style harbor approach
    port.js             — On-foot town exploration (NPCs, shops, auto-save)
    island.js           — Island exploration (puzzles, dig, wildlife, rival)
    encounter.js        — Encounter dialog (hail/flee/attack/board/infiltrate)
    melee.js            — Melee sword combat (boarding, bar fight, duel, stealth)
    stealth.js          — Stealth infiltration mode (guards, objectives, vision cones)
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
  island/
    island-map.js       — Procedural island generation (50x35, 16 tile types, caves, ruins, puzzles)
    wildlife.js         — Wildlife entities (crab, snake, boar — wander/aggressive/charge)
    rival.js            — Rival pirate NPC (greedy pathfind, 120s timer, angry chase)
    treasure.js         — Treasure map data, loot tiers, dig rewards
  stealth/
    stealth-map.js      — Stealth map tiles and template generation (3 templates)
    guard-ai.js         — Guard AI, vision cones, alert cascade, hiding
  economy/
    goods.js            — Trade goods, port prices, upgrades, economy state
    shop-ui.js          — Market and shipwright overlay UI (buy/sell/upgrade)
  crew/
    crew.js             — Crew data model, morale, recruitment, roles
    crew-ui.js          — Tavern recruitment, roster, pay wages overlay
```

---

## Design References

See full design document in `ROADMAP.md` (this file) and architectural notes in `CLAUDE.md`.

### Tone

19th century Danish captain's journal — dry wit, understated:

- "The English frigate appears displeased with your presence."
- "You arrive in Copenhagen. It is raining. This is not news."

### Color Palette

Muted Nordic: navy→steel blue ocean, slate grey sky, moss green land, amber wood, gold UI, muted red danger, pale grey text.

### Dependencies

neo-blessed, rot-js, simplex-noise, alea
