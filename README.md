# Kattegat Kaper

A terminal pirate game set in the Kattegat strait — spiritual successor to **Kaptajn Kaper i Kattegat** (1985). Built with [neo-blessed](https://github.com/embarklabs/neo-blessed).

```
    ~  K A T T E G A T   K A P E R  ~

          ~~~\___/~~~
     ~~~~~~~~|  |~~~~~~~~
    ~~~~~~~~~| \| ~~~~~~~~~
     ~~~~~~~~|  |~~~~~~~~
          ~~~/ \ \~~~

    A Pirate Game of the Northern Seas
```

## Features

- **Open-world sailing** across a procedurally generated 300x200 tile Kattegat strait with 9 real Danish/Swedish ports
- **Cannon combat** — spyglass aiming, power gauge, drone-cam cannonball follow with pseudo-3D perspective
- **Sword combat** — side-view melee with 3-zone attack/defend, 4 move types, stamina, and ASCII fighter art
- **Stealth infiltration** — sneak into forts, ships, and warehouses with guard AI, vision cones, and cover mechanics
- **Harbor approach** — Frogger-style obstacle dodging to reach port
- **Port exploration** — walk through procedural towns, visit taverns, markets, shipwrights, churches
- **Trading economy** — 8 trade goods with per-port supply/demand pricing, ship upgrades
- **Crew management** — recruit sailors, manage morale, assign roles, pay wages
- **Faction reputation** — 5 factions with cross-faction ripple effects, gated port access, price modifiers
- **Island exploration** — puzzles (Sokoban boulders, keys, torches), treasure maps, wildlife, rival pirates
- **Dynamic weather** — fog, rain, storms affecting visibility, speed, hull damage, and combat sway
- **Save/load system** — auto-save at ports, manual save slots
- **CRT aesthetic** — optional scanline + vignette filter

## Requirements

- Node.js 18+
- A terminal with 256-color support (most modern terminals)

## Install

```bash
git clone https://github.com/YOUR_USERNAME/pirategame.git
cd pirategame
npm install
```

## Play

```bash
npm start
```

## Controls

| Context    | Key              | Action                    |
|------------|------------------|---------------------------|
| Title      | Up/Down          | Navigate menu             |
| Title      | Enter            | Select                    |
| Sailing    | Arrow keys       | Set ship direction        |
| Sailing    | C                | Toggle CRT filter         |
| Port/Island| Arrow keys       | Walk                      |
| Port/Island| Enter            | Interact                  |
| Port/Island| Q                | Return to ship            |
| Combat     | Arrow keys       | Aim / select              |
| Combat     | Space            | Cycle ammo / confirm      |
| Combat     | Enter            | Lock aim / confirm        |
| Stealth    | Arrow keys       | Sneak                     |
| Stealth    | Enter            | Interact with objectives  |
| Anywhere   | Ctrl-C           | Quit                      |

## Architecture

- **CommonJS** throughout (neo-blessed is CJS; simplex-noise v4 loaded via dynamic `import()`)
- **Direct buffer writing** — tiles written into `screen.lines[y][x] = [attr, ch]` for performance
- **256-color palette** — blessed attr format: `(fg << 9) | bg`
- **~12 FPS game loop** via `setTimeout` with delta timing
- **State machine** — each game mode implements `enter()`, `exit()`, `update(dt)`, `render(screen)`, `handleInput(key)`

## Dependencies

- [neo-blessed](https://github.com/embarklabs/neo-blessed) — terminal UI
- [rot-js](https://ondras.github.io/rot.js/) — FOV (recursive shadowcasting)
- [simplex-noise](https://github.com/jwagner/simplex-noise.js) — procedural terrain
- [alea](https://github.com/coverslide/node-alea) — seeded PRNG

## License

MIT
