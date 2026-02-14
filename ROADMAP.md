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
- [x] Barrel hiding mechanic — press H to climb into barrel, shuffle around invisibly, "Just a barrel..." flavor
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

### Phase 15: Rumors & Mission Board — COMPLETE

- [x] Quest system state with day clock (30s/day), active contracts, and per-port rumor offers
- [x] Procedural mission generation per port/day: delivery contracts + hunt bounties
- [x] Mission board overlay in port mode with Available / Active / History tabs
- [x] Contract accept/abandon flow, active quest progress display, and history outcomes
- [x] Delivery auto turn-in at destination port if cargo requirement is met
- [x] Hunt quest progression from naval victories, with bounty payout on port arrival
- [x] Reputation + gold rewards from contracts, deadline expiry failures
- [x] Save/load persistence for full quest state
- [x] Input bindings for mission and reputation boards (`M` / `R`)

**Files:** `world/quests.js`, `modes/port.js`, `modes/overworld.js`, `modes/drone-cam.js`, `engine/save-load.js`, `engine/input.js`

### Phase 16: Day/Night Cycle & World Events — COMPLETE

- [x] Day/night cycle tied to game-day clock (30s real-time = 1 day, dawn/day/dusk/night quarters)
- [x] Night overlay: reduced FOV (moon-dependent 4-8), dimmed tile palette, lantern glow around ports
- [x] Port curfew: harbor patrol density doubles at night, market and shipwright close at night
- [x] Tavern activity increases at night: more recruits available (6 vs 4), higher bar fight chance (25%→40%)
- [x] Random world events on day tick: trade boom (+30% prices at random port), plague (port closed 3 days), naval blockade (English ships cluster around a port), pirate raid (faction rep shifts)
- [x] Event notification banners on overworld HUD with 5s fade (amber→dim, centered, up to 2)
- [x] Seasonal weather bias: winter increases storm weight, summer favors clear skies
- [x] Fog more common at dawn/dusk, storms more common at night
- [x] Moon phase cycle (8 phases, 8 game-days): full moon increases night FOV to 8, new moon drops to 4
- [x] Save/load persistence for day clock, active events (notifications cleared on load)

**Files:** `world/day-night.js`, `world/events.js`

### Phase 17: Ship Fleet & Captaincy — COMPLETE

- [x] Ship types: sloop (starter), brigantine, frigate, galleon — each with distinct hull/speed/cargo/cannon stats
- [x] Capture enemy ships after boarding victory (50% chance hull survives): added to fleet roster
- [x] Purchase ships at shipwright in major ports (Copenhagen, Gothenburg, Aarhus) with port-gated availability
- [x] Fleet roster UI overlay (F key): list owned ships, stats, flagship selector
- [x] Flagship selection: determines player ship on overworld, others stored at port
- [x] Per-ship upgrade bonuses: hull/speed/cannon/cargo bonuses sync between fleet and runtime state
- [x] Ship repair and refit: per-ship hull repair at shipwright, upgrades apply to flagship and persist
- [x] Ship naming: rename ships in fleet roster via Enter key
- [x] Sell ships at fleet roster for 40% of base value (can't sell flagship)
- [x] Fleet state saved/loaded with full ship data
- [x] Combat masts derived from flagship type (sloop/brigantine=2, frigate/galleon=3)
- [x] Max fleet size: 4 ships

**Files:** `fleet/ship-types.js`, `fleet/fleet.js`, `fleet/fleet-ui.js`

### Automated Test Suite — COMPLETE

- [x] Node.js built-in `node:test` + `node:assert/strict` — zero new dependencies
- [x] `npm test` runs all 386 tests via `node --test test/**/*.test.js`
- [x] Seeded deterministic random helper for reproducible test runs
- [x] Test game-state factory (full gameState without map/screen)
- [x] **Scenario tests (22 files):** factions, economy, crew, combat, melee, fleet, quests, weather, save-load, trajectory, day-night, world events, convoy, campaign, dialog, achievements, legacy, captains-log, npc-behavior, sea-objects, encounter-outcomes, helmsman
- [x] **Integration tests (5 files):** trade voyage profit, combat→boarding→ship capture, crew mutiny cascade, quest delivery turn-in, faction cascade port lockout
- [x] **Playthrough tests (1 file, 6 suites):** full campaign hero ending, pirate king ending, trade & upgrade loop, combat gauntlet, new game plus cycle, survival run hull management

**Files:**
```
test/
  helpers/
    game-state.js          — Fresh gameState builder (no screen/map)
    deterministic.js       — Seeded LCG Math.random replacement
  scenarios/
    factions.test.js       — Rep tiers, action cascades, port access, price modifiers
    economy.test.js        — Price math, cargo counting, port price variation
    crew.test.js           — Morale decay, desertion, mutiny, pay, role bonuses
    combat.test.js         — Damage calc, ammo types, hit/miss, multi-round resolution
    melee.test.js          — Move resolution, parry/riposte, stamina, AI styles
    fleet.test.js          — Add/remove ships, flagship switch, sync, effective stats
    quests.test.js         — Day clock, offers, accept, delivery, hunt progress, expiry
    weather.test.js        — State transitions, timer, bias, effects lookup
    save-load.test.js      — Serialize/deserialize round-trip, corrupt JSON, old saves
    trajectory.test.js     — Cannonball physics: launch, flight, hit check
    day-night.test.js      — Quarter/season/moon, sight range, weather bias
    events.test.js         — Event spawn, expiry, trade boom, plague port closure
    convoy.test.js         — Convoy state, formation, ambush, blockade runner
    campaign.test.js       — Campaign state, act transitions, key items, endings
    dialog.test.js         — Dialog trees, NPC filtering, node validity
    achievements.test.js   — Achievement definitions, thresholds, check logic
    legacy.test.js         — Stats, mergeStats, difficulty, Hall of Fame, New Game+, cosmetics
    captains-log.test.js   — Log events, flushDay, prose generation, UI state
    npc-behavior.test.js   — Trade routes, NPC clashes, desperate merchants, cargo
    sea-objects.test.js    — Spawn, collision, resolve outcomes, sea discoveries
    encounter-outcomes.test.js — Hail outcomes, weather prefix, effect application
  integration/
    trade-voyage.test.js   — Buy cheap → sell dear → net profit
    combat-capture.test.js — Cannon combat → boarding → ship capture → fleet grows
    crew-mutiny.test.js    — Days at sea → morale decay → desertions → mutiny
    quest-delivery.test.js — Accept quest → stock cargo → arrive → reward
    faction-cascade.test.js— Attack repeatedly → lose port access → pirate rep soars
    playthrough.test.js    — 6 end-to-end playthrough suites (campaign, trade, combat, NG+)
```

### Phase 18: Convoy & Escort Missions — COMPLETE

- [x] Convoy travel mode: flagship + 1-2 fleet escorts moving as formation on overworld
- [x] Escort contract type on mission board: protect merchant convoy between ports, 60-90s time limit
- [x] Convoy NPC ships follow player at 0.8x speed, break formation if player moves too fast
- [x] Ambush encounters: pirate/English ships target convoy NPCs, player must engage or lose cargo
- [x] Convoy damage: escorted ships have hull HP, destroyed ships fail the contract
- [x] Successful escort: gold reward (100-300) + Merchant Guild reputation boost
- [x] Blockade runner missions: smuggle cargo past English naval line, stealth-adjacent (avoid detection radius)
- [x] Convoy HUD overlay: minimap dots showing escort ship positions and health
- [x] Formation controls: tight (slow, defensive) vs spread (fast, vulnerable) via Tab key
- [x] Escort ships provide supporting fire in cannon combat (bonus damage per surviving escort)

**Files:** `convoy/convoy.js`, `convoy/convoy-hud.js`

### Phase 19: Story Campaign — COMPLETE

- [x] 5-act main storyline: "The Kattegat Conspiracy" — uncover English plot to seize Danish straits
- [x] Act 1: Mysterious letter found in loot after first combat victory, points to Copenhagen contact
- [x] Act 2: Copenhagen informant (new NPC in tavern) sends player to intercept English dispatch ship
- [x] Act 3: Decoded dispatches reveal fleet rally point — stealth infiltration of English fort on Anholt
- [x] Act 4: Rally Danish allies — reputation gate (Crown ≥ Friendly), recruit allied ships for final battle
- [x] Act 5: Final naval battle at Helsingør narrows — multi-round combat with English flagship
- [x] Campaign journal UI (J key): quest log with act summaries, clues, and next objective
- [x] 6 story NPCs with portraits (ASCII art) and branching dialog trees
- [x] Key item inventory: letter, dispatch documents, royal seal, signal flags — used to unlock act transitions
- [x] 3 endings based on reputation balance: Danish hero, independent pirate king, infamous outlaw
- [x] Campaign progress persisted in save files, replayable with different faction paths

**Files:** `story/campaign.js`, `story/npcs.js`, `story/dialog.js`, `story/journal-ui.js`

### Phase 20: Achievements & Legacy — COMPLETE

- [x] 20 achievements tracking lifetime stats: ships sunk, gold earned, ports visited, barrels hidden in, etc.
- [x] Achievement unlock notifications: toast overlay in top-right corner with title and icon (ASCII)
- [x] Legacy screen after campaign completion: stats summary, title earned, total play time
- [x] New Game+ mode: restart with one carried-over ship, 50% gold, difficulty preserved
- [x] Difficulty settings on new game: Easy (1.5x gold, 0.7x damage taken), Normal, Hard (0.7x gold, 1.3x damage, faster guards)
- [x] Captain's log: auto-generated prose summary of key events per game-day, viewable in overworld/port (L key)
- [x] Hall of Fame: top 5 completed runs stored in `~/.kattegat-kaper/hall-of-fame.json`, shown on title screen
- [x] Persistent statistics across all saves: total ships sunk, gold earned, distance sailed, stored in `~/.kattegat-kaper/persistent.json`
- [x] Cosmetic unlocks from achievements: alternate title screen color schemes (midnight, gold)
- [x] Final credits sequence after campaign completion with ASCII ship art, stats summary, auto-scroll

**Files:** `meta/achievements.js`, `meta/legacy.js`, `meta/captains-log.js`, `modes/credits.js`

### Phase 21: Lively Seas — COMPLETE

- [x] **NPC Ship Improvements**: Merchant port-to-port trade routes, desperate battered merchants (15%, fight back), NPC cargo & gold at spawn, NPC-to-NPC clashes (pirate vs merchant/english/danish), MAX_NPC_SHIPS raised to 16, rebalanced spawn weights (50% merchant, 20% english, 15% pirate, 15% danish)
- [x] **Sea Discoveries**: 6 floating object types (wreckage, floating cargo, distress, derelict, debris field, message bottle) — spawn 10-25 tiles from player, weighted random outcomes (gold, cargo, hull damage, crew buff, pirate ambush, treasure hints, trade tips), captain's log integration
- [x] **Varied Encounter Outcomes**: Rich hail outcome tables per faction (merchant: trade offer/tip/warning/gift; english: papers check/intel/hostile/pass; danish: friendly/supply/quest hint; pirate: demand/raid offer/black market/threat/intel), inline hail_choose phase for follow-up decisions, weather-based encounter prefix text, NPC cargo display in encounter panel
- [x] **Active Sailing**: Wind gusts every 15-35s (3-5s duration, sharp direction shift, +50% aligned / -30% misaligned speed), deterministic ocean currents (sine wave pattern, stronger through Helsingor narrows, +30%/-20% speed), sail trim HUD indicator (DEAD/POOR/FAIR/GOOD/GREAT)

**Files:** `world/npc-ships.js`, `world/sea-objects.js` (new), `world/currents.js` (new), `world/encounter-outcomes.js` (new), `modes/overworld.js`, `modes/encounter.js`, `meta/captains-log.js`, `render/hud.js`

### Phase 22: Helmsman Autopilot — COMPLETE

- [x] **Helmsman navigation menu**: Press N to open "Set Course" overlay — all ports sorted by distance + "Explore uncharted waters" option
- [x] **Reactive steering**: Direct heading via atan2, 3-tile lookahead obstacle avoidance, ±3 direction scan for land
- [x] **Smart tacking**: When heading into wind (trim diff 0-1), helmsman offsets heading by tack side for better trim, alternating every 8-15s
- [x] **Explore mode**: Scans grid for nearest cluster of unexplored tiles, auto-navigates toward dark areas
- [x] **Arrival detection**: Disengages within 2 tiles of target port, pushes notice and captain's log entry
- [x] **Stuck detection**: If ship position unchanged for 3s, disengages with warning
- [x] **Manual override**: Arrow keys or N key cancel autopilot with "You take the helm." notice
- [x] **Encounter interrupt**: Helmsman disengages automatically when NPC encounter triggers
- [x] **HUD integration**: Status bar at top of screen ("HELM: PortName dist [N to cancel]") + HUD line indicator
- [x] **Captain's log**: 3 event templates (helmsman_engage, helmsman_arrival, helmsman_explore)

**Files:** `world/helmsman.js` (new), `world/helmsman-ui.js` (new), `modes/overworld.js`, `engine/input.js`, `render/hud.js`, `meta/captains-log.js`

### Phase 23: Stealth Overhaul & Fog of War Persistence — COMPLETE

- [x] **Seeded template randomization**: LCG RNG from seed — barrel positions nudged ±1, guard facing randomized, objective labels shuffled
- [x] **3 guard types**: Patrol (G, vision 7, 0.5s), Scout (S, vision 5, 0.35s), Captain (C, vision 9, 0.6s) — each with unique melee stats
- [x] **Guard type assignment**: First guard is captain (when ≥3), rest alternate patrol/scout
- [x] **Hard difficulty extra guard**: Spawns 1 additional scout at random floor tile far from spawn/exit
- [x] **Guard search behavior**: Alert guards reaching last-known position generate 3 search waypoints, patrol them for 5s before decaying
- [x] **Stone throw distraction**: Press G to throw stone (3 per mission), lands 4-6 tiles in last move direction, creates noise (Manhattan 8) alerting nearby guards
- [x] **Torch light zones**: Player within Manhattan 2 of torch gives guards +2 vision range; warm amber glow rendered on nearby floor tiles
- [x] **8-directional barrel hiding**: Barrel scan expanded from 4 cardinal to 8 directions (includes diagonals)
- [x] **Suspicion indicator**: Pulsing `?` at top of screen when any patrol guard is building suspicion
- [x] **Objective flash**: HUD objectives counter highlights gold for 1s after completing an objective
- [x] **Guard noise system**: `applyNoise()` function — all guards in range become suspicious and move toward noise location
- [x] **Fog of war persistence**: Visibility array stored on `gameState` instead of mode instance, survives mode transitions
- [x] **Visibility serialization**: RLE encode/decode in save-load.js — compact "val:count" pairs for 60K tile array

**Files:** `stealth/stealth-map.js`, `stealth/guard-ai.js`, `modes/stealth.js`, `engine/input.js`, `modes/overworld.js`, `engine/save-load.js`

### Phase 24: Lively Towns & NPCs — COMPLETE

- [x] **Port profiles**: Per-port personality data (9 ports) — size, street pattern, building zones, decorations, arrival text, ambient NPC count
- [x] **Variable town sizes**: Small (50x35), medium (60x40), large (70x45) driven by port profile
- [x] **Street patterns**: 3 layout types — single (one cross street), cross (two cross streets), grid (cross + side streets)
- [x] **Profile-driven building placement**: Building positions use fractional x/y zones per port, with per-building scale multipliers
- [x] **4 decoration tile types**: Fish rack, well, cargo pile, fountain — placed on grass near roads
- [x] **Dock clutter density**: Crate/barrel count scaled by port profile clutterDensity factor
- [x] **Expanded NPC greetings**: 3-4 generic greetings per NPC type + port-specific greetings for key ports
- [x] **3 ambient NPC types**: Dockworker (D, dock tiles), townsperson (T, road tiles), urchin (u, road tiles)
- [x] **NPC wandering**: All non-story NPCs wander within radius (2 for building, 3 for ambient) on 2-5s timer
- [x] **Rumor system**: 12 rumors (trade hints, danger warnings, tips) — 25% chance when talking to any NPC, seeded by port+day
- [x] **Port arrival text**: Each port shows unique atmospheric description on entry

**Files:** `port/port-profiles.js`, `port/town-map.js`, `port/town-npcs.js`, `modes/port.js`

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
    npc-ships.js        — NPC ship spawning, AI, faction system, trade routes, clashes
    factions.js         — Reputation & faction system (5 factions, tiers, ripple effects)
    sea-objects.js      — Floating sea discovery system (6 types, spawn/despawn, outcomes)
    currents.js         — Deterministic ocean currents (sine wave, narrows boost)
    encounter-outcomes.js — Hail outcome tables, effects, weather prefix
    helmsman.js         — Helmsman autopilot logic (reactive steering, tacking, explore)
    helmsman-ui.js      — Helmsman navigation menu overlay (port list, explore option)
    weather.js          — Weather state machine (clear/fog/rain/storm, effects, biased transitions)
    quests.js           — Contracts and rumors (generation, progression, rewards, turn-in)
    day-night.js        — Day/night cycle (quarters, seasons, moon phases, dimming, sight range)
    events.js           — World events (trade boom, plague, blockade, pirate raid)
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
    port-profiles.js    — Per-port personality data (9 ports, sizes, street patterns, decorations, rumors)
    town-map.js         — Procedural town layout generator (variable sizes, 20 tile types, profile-driven)
    town-npcs.js        — Town NPC definitions and spawning (5 building + 3 ambient types, wandering)
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
  fleet/
    ship-types.js       — Ship type definitions (sloop, brigantine, frigate, galleon)
    fleet.js            — Fleet data model, flagship sync, add/remove/switch ships
    fleet-ui.js         — Fleet roster overlay UI (view, switch, rename, sell)
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
