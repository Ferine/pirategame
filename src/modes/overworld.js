'use strict';

const { FOV } = require('rot-js');
const { TILE, TILE_DEFS, getTileChar, SHIP_ATTR, DIR_CHARS,
        FOG_UNEXPLORED_ATTR, FOG_UNEXPLORED_CHAR,
        FOG_EXPLORED_ATTR, FOG_EXPLORED_CHAR, sattr } = require('../render/tiles');
const { createHUD, updateHUD, HUD_HEIGHT } = require('../render/hud');
const { MAP_WIDTH, MAP_HEIGHT } = require('../world/map-gen');
const { createCombatState } = require('../combat/combat-state');
const { createHarborState } = require('../harbor/lanes');
const { FACTION_COLORS, createNPCShips, updateNPCShips, checkEncounter } = require('../world/npc-ships');
const { tickMorale } = require('../crew/crew');
const { isPortAccessAllowed } = require('../world/factions');
const { updateWeather, getWeatherEffects, FOG_HIDE_RANGE, RAIN_CHARS, FOG_CHARS } = require('../world/weather');
const { applyCRTFilter, triggerBell } = require('../render/crt-filter');

// Movement direction vectors: N, NE, E, SE, S, SW, W, NW
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

// Key to direction mapping
const KEY_DIR = { up: 0, right: 2, down: 4, left: 6 };

// Speed multipliers by angle difference (0-4) from wind
const SPEED_MULT = [0.3, 0.5, 0.9, 1.0, 0.7];

const SIGHT_RANGE = 15;

// Visibility states
const VIS_UNEXPLORED = 0;
const VIS_EXPLORED = 1;
const VIS_VISIBLE = 2;

class OverworldMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.hudBox = null;
    this.animFrame = 0;
    this.animTimer = 0;
    this.visibility = null; // Uint8Array for FOV
    this.fov = null;
    this.camera = { x: 0, y: 0 };
    this.viewW = 0;
    this.viewH = 0;
  }

  enter(gameState) {
    this.gameState = gameState;
    const { ship } = gameState;

    // Init visibility map
    this.visibility = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

    // Create FOV calculator
    const self = this;
    this.fov = new FOV.RecursiveShadowcasting(
      (x, y) => {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
        const t = gameState.map.tiles[y * MAP_WIDTH + x];
        return TILE_DEFS[t] ? TILE_DEFS[t].transparent : false;
      },
      { topology: 8 }
    );

    // Do initial FOV compute
    this._computeFOV();

    // Initialize NPC ships if not already present
    if (!gameState.npcShips) {
      gameState.npcShips = createNPCShips(gameState);
    }

    // Cooldown to prevent re-triggering encounters immediately
    this.encounterCooldown = 1.0;

    // Day timer for morale ticks (30 real seconds = 1 game day)
    this.dayTimer = 30;
    this.moraleMessage = '';
    this.moraleMessageTimer = 0;
  }

  exit() {
    if (this.hudBox) {
      this.hudBox.detach();
      this.hudBox = null;
    }
  }

  update(dt) {
    const { wind, ship } = this.gameState;

    // Animation timer
    this.animTimer += dt;
    if (this.animTimer >= 0.5) {
      this.animTimer -= 0.5;
      this.animFrame = (this.animFrame + 1) % 4;
    }

    // Update wind
    this._updateWind(dt);

    // Update weather
    if (this.gameState.weather) {
      updateWeather(this.gameState.weather, dt);

      // Storm hull damage every 5 seconds
      const wx = this.gameState.weather;
      if (wx.type === 'storm' && wx.damageTimer >= 5.0) {
        wx.damageTimer -= 5.0;
        const effects = getWeatherEffects(wx);
        if (effects.hullDmg > 0) {
          ship.hull = Math.max(1, ship.hull - effects.hullDmg);
          this.moraleMessage = 'The storm batters your hull!';
          this.moraleMessageTimer = 3.0;
        }
      }
    }

    // Update ship movement
    this._updateShip(dt);

    // Update NPC ships
    if (this.gameState.npcShips) {
      updateNPCShips(this.gameState.npcShips, this.gameState, dt);
    }

    // Day timer — morale tick
    if (this.gameState.crew && this.gameState.crew.members.length > 0) {
      this.dayTimer -= dt;
      if (this.dayTimer <= 0) {
        this.dayTimer = 30;
        const events = tickMorale(this.gameState.crew, this.gameState.economy);
        for (const ev of events) {
          if (ev.type === 'desertion') {
            this.moraleMessage = `${ev.member.name} has deserted!`;
            this.moraleMessageTimer = 4.0;
          } else if (ev.type === 'mutiny') {
            this.moraleMessage = 'The crew threatens mutiny!';
            this.moraleMessageTimer = 5.0;
          }
        }
      }
    }
    if (this.moraleMessageTimer > 0) {
      this.moraleMessageTimer -= dt;
    }

    // Encounter cooldown
    if (this.encounterCooldown > 0) {
      this.encounterCooldown -= dt;
    } else if (this.gameState.npcShips) {
      const npc = checkEncounter(this.gameState.npcShips, ship.x, ship.y);
      if (npc) {
        this.gameState.encounter = npc;
        this.encounterCooldown = 3.0;
        this.stateMachine.transition('ENCOUNTER', this.gameState);
        return;
      }
    }
  }

  render(screen) {
    // Ensure HUD is created
    if (!this.hudBox) {
      this.hudBox = createHUD(screen);
    }

    // Calculate view dimensions (screen minus HUD)
    this.viewW = screen.width;
    this.viewH = screen.height - HUD_HEIGHT;

    // Update camera to center on ship
    this._updateCamera();

    // Render map tiles directly to screen buffer
    this._renderMap(screen);

    // Weather overlay
    this._renderWeatherOverlay(screen);

    // CRT post-processing
    applyCRTFilter(screen, this.gameState.crtEnabled);

    // Render port labels
    this._renderPortLabels(screen);

    // Render NPC ships
    this._renderNPCShips(screen);

    // Render player ship on top
    this._renderShip(screen);

    // Update HUD content
    updateHUD(this.hudBox, this.gameState);
  }

  handleInput(key) {
    if (key === 'combat_test') {
      this.gameState.combat = createCombatState(this.gameState);
      this.stateMachine.transition('SPYGLASS', this.gameState);
      return;
    }

    if (key === 'port_test') {
      // Find nearest port for testing
      const port = this._findNearestPort();
      if (port) {
        this.gameState.portInfo = { name: port.name, desc: port.desc };
        this.stateMachine.transition('PORT', this.gameState);
      }
      return;
    }

    // Toggle CRT filter
    if (key === 'c') {
      this.gameState.crtEnabled = !this.gameState.crtEnabled;
      return;
    }

    const dir = KEY_DIR[key];
    if (dir !== undefined) {
      this.gameState.ship.direction = dir;
    }
  }

  // --- Private methods ---

  _updateWind(dt) {
    const { wind } = this.gameState;
    wind.changeTimer -= dt;

    if (wind.changeTimer <= 0) {
      // Shift direction by -1, 0, or +1
      const dirShift = Math.floor(Math.random() * 3) - 1;
      wind.direction = ((wind.direction + dirShift) % 8 + 8) % 8;

      // Shift strength by -1, 0, or +1
      const strShift = Math.floor(Math.random() * 3) - 1;
      wind.strength = Math.max(1, Math.min(5, wind.strength + strShift));

      // Next change in 20-40 seconds
      wind.changeTimer = 20 + Math.random() * 20;
    }
  }

  _updateShip(dt) {
    const { ship, wind, map } = this.gameState;

    // Calculate angle difference between ship direction and wind
    let diff = Math.abs(ship.direction - wind.direction);
    if (diff > 4) diff = 8 - diff;

    // Speed = multiplier * windStrength * weather modifier
    const weatherFx = this.gameState.weather ? getWeatherEffects(this.gameState.weather) : null;
    const weatherSpeedMult = weatherFx ? weatherFx.speedMult : 1.0;
    const eco = this.gameState.economy;
    const speedBonus = eco ? (eco.speedBonus || 0) : 0;
    const speedMult = 1 + speedBonus;
    const speed = SPEED_MULT[diff] * wind.strength * weatherSpeedMult * speedMult;
    this.gameState.currentSpeed = speed;

    // Accumulate fractional movement
    ship.moveAccum = (ship.moveAccum || 0) + speed * dt;

    // Move in whole-tile steps
    while (ship.moveAccum >= 1.0) {
      ship.moveAccum -= 1.0;

      const nx = ship.x + DIR_DX[ship.direction];
      const ny = ship.y + DIR_DY[ship.direction];

      // Bounds check
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) {
        ship.moveAccum = 0;
        break;
      }

      // Passability check
      const tile = map.tiles[ny * MAP_WIDTH + nx];
      if (TILE_DEFS[tile] && TILE_DEFS[tile].passable) {
        ship.x = nx;
        ship.y = ny;
        this._computeFOV();

        // Check for port tile → harbor approach
        if (tile === TILE.PORT) {
          const port = this._findPort(nx, ny);
          if (port) {
            // Check Crown reputation for port access
            if (this.gameState.reputation && !isPortAccessAllowed(this.gameState.reputation, port.name)) {
              this.moraleMessage = `The ${port.name} harbor master refuses you entry!`;
              this.moraleMessageTimer = 4.0;
              // Push ship back
              ship.x -= DIR_DX[ship.direction];
              ship.y -= DIR_DY[ship.direction];
              ship.moveAccum = 0;
              break;
            }
            this.gameState.harbor = createHarborState(this.gameState, port);
            this.stateMachine.transition('HARBOR', this.gameState);
            return;
          }
        }

        // Check for island tile → island exploration
        if (tile === TILE.ISLAND) {
          const island = this._findIsland(nx, ny);
          if (island) {
            this.gameState.islandInfo = island;
            this.stateMachine.transition('ISLAND', this.gameState);
            return;
          }
        }
      } else {
        ship.moveAccum = 0;
        break;
      }
    }
  }

  _computeFOV() {
    const { ship } = this.gameState;

    // Reset visible -> explored
    for (let i = 0; i < this.visibility.length; i++) {
      if (this.visibility[i] === VIS_VISIBLE) {
        this.visibility[i] = VIS_EXPLORED;
      }
    }

    // Dynamic sight range from weather
    const weatherEffects = this.gameState.weather ? getWeatherEffects(this.gameState.weather) : null;
    const sightRange = weatherEffects ? weatherEffects.sightRange : SIGHT_RANGE;

    // Compute new FOV
    this.fov.compute(ship.x, ship.y, sightRange, (x, y, r, visibility) => {
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        this.visibility[y * MAP_WIDTH + x] = VIS_VISIBLE;
      }
    });
  }

  _updateCamera() {
    const { ship } = this.gameState;

    // Center camera on ship
    this.camera.x = Math.floor(ship.x - this.viewW / 2);
    this.camera.y = Math.floor(ship.y - this.viewH / 2);

    // Clamp to map bounds
    this.camera.x = Math.max(0, Math.min(MAP_WIDTH - this.viewW, this.camera.x));
    this.camera.y = Math.max(0, Math.min(MAP_HEIGHT - this.viewH, this.camera.y));
  }

  _renderMap(screen) {
    const { map } = this.gameState;

    for (let sy = 0; sy < this.viewH; sy++) {
      const my = this.camera.y + sy;
      if (my < 0 || my >= MAP_HEIGHT) continue;

      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < this.viewW; sx++) {
        const mx = this.camera.x + sx;
        if (mx < 0 || mx >= MAP_WIDTH) continue;
        if (sx >= row.length) continue;

        const idx = my * MAP_WIDTH + mx;
        const vis = this.visibility[idx];

        let ch, attr;

        if (vis === VIS_UNEXPLORED) {
          ch = FOG_UNEXPLORED_CHAR;
          attr = FOG_UNEXPLORED_ATTR;
        } else if (vis === VIS_EXPLORED) {
          const tileType = map.tiles[idx];
          ch = getTileChar(tileType, mx, my, 0); // no animation for explored
          attr = FOG_EXPLORED_ATTR;
        } else {
          // VIS_VISIBLE — full color
          const tileType = map.tiles[idx];
          const def = TILE_DEFS[tileType];
          ch = getTileChar(tileType, mx, my, this.animFrame);
          attr = def ? def.attr : 0;
        }

        // Write directly to blessed's screen buffer
        // row[sx] = [attr, ch]
        row[sx][0] = attr;
        row[sx][1] = ch;
      }
    }

    // Mark lines dirty so blessed knows to redraw them
    for (let sy = 0; sy < this.viewH; sy++) {
      screen.lines[sy].dirty = true;
    }
  }

  _renderPortLabels(screen) {
    const { map } = this.gameState;
    if (!map.ports) return;

    for (const port of map.ports) {
      // Check if port is in view and visible
      const sx = port.actualX - this.camera.x;
      const sy = port.actualY - this.camera.y;

      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const vis = this.visibility[port.actualY * MAP_WIDTH + port.actualX];
      if (vis !== VIS_VISIBLE) continue;

      // Write port name label above the port marker (if room)
      const labelY = sy - 1;
      if (labelY >= 0 && labelY < this.viewH) {
        const label = port.name;
        const labelX = Math.max(0, sx - Math.floor(label.length / 2));
        const row = screen.lines[labelY];
        if (row) {
          const labelAttr = sattr(178, 17); // amber on navy
          for (let i = 0; i < label.length && (labelX + i) < this.viewW; i++) {
            if (row[labelX + i]) {
              row[labelX + i][0] = labelAttr;
              row[labelX + i][1] = label[i];
            }
          }
        }
      }
    }

    // Island labels
    if (!map.islands) return;
    for (const island of map.islands) {
      const sx = island.actualX - this.camera.x;
      const sy = island.actualY - this.camera.y;

      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const vis = this.visibility[island.actualY * MAP_WIDTH + island.actualX];
      if (vis !== VIS_VISIBLE) continue;

      const labelY = sy - 1;
      if (labelY >= 0 && labelY < this.viewH) {
        const label = island.name;
        const labelX = Math.max(0, sx - Math.floor(label.length / 2));
        const row = screen.lines[labelY];
        if (row) {
          // Gold label if player has a treasure map for this island, else green
          let labelAttr = sattr(34, 17); // green on navy
          if (this.gameState.treasureMaps) {
            for (const tm of this.gameState.treasureMaps) {
              if (tm.islandId === island.id && !tm.found) {
                labelAttr = sattr(226, 17); // gold on navy
                break;
              }
            }
          }
          for (let i = 0; i < label.length && (labelX + i) < this.viewW; i++) {
            if (row[labelX + i]) {
              row[labelX + i][0] = labelAttr;
              row[labelX + i][1] = label[i];
            }
          }
        }
      }
    }
  }

  _findPort(x, y) {
    const ports = this.gameState.map.ports;
    if (!ports) return null;
    for (const port of ports) {
      if (port.actualX === x && port.actualY === y) return port;
    }
    return null;
  }

  _findIsland(x, y) {
    const islands = this.gameState.map.islands;
    if (!islands) return null;
    for (const island of islands) {
      if (island.actualX === x && island.actualY === y) return island;
    }
    return null;
  }

  _findNearestPort() {
    const ports = this.gameState.map.ports;
    if (!ports || !ports.length) return null;
    const { x, y } = this.gameState.ship;
    let best = null;
    let bestDist = Infinity;
    for (const port of ports) {
      const dx = port.actualX - x;
      const dy = port.actualY - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = port;
      }
    }
    return best;
  }

  _renderNPCShips(screen) {
    const ships = this.gameState.npcShips;
    if (!ships) return;

    // In fog, hide NPCs beyond fog visibility range
    const isFoggy = this.gameState.weather && this.gameState.weather.type === 'fog';
    const playerX = this.gameState.ship.x;
    const playerY = this.gameState.ship.y;

    for (const npc of ships) {
      const sx = npc.x - this.camera.x;
      const sy = npc.y - this.camera.y;

      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      // Only render if tile is visible
      const vis = this.visibility[npc.y * MAP_WIDTH + npc.x];
      if (vis !== VIS_VISIBLE) continue;

      // Fog hides ships beyond close range
      if (isFoggy) {
        const dx = npc.x - playerX;
        const dy = npc.y - playerY;
        if (dx * dx + dy * dy > FOG_HIDE_RANGE * FOG_HIDE_RANGE) continue;
      }

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;

      const fColor = FACTION_COLORS[npc.faction] || 255;
      row[sx][0] = sattr(fColor, 17);
      row[sx][1] = DIR_CHARS[npc.direction];
    }
  }

  _renderWeatherOverlay(screen) {
    const weather = this.gameState.weather;
    if (!weather || weather.type === 'clear') return;

    const frame = this.animFrame;

    if (weather.type === 'fog') {
      // Dim all visible tiles slightly for fog effect
      for (let sy = 0; sy < this.viewH; sy++) {
        const row = screen.lines[sy];
        if (!row) continue;
        for (let sx = 0; sx < this.viewW; sx++) {
          if (sx >= row.length) continue;
          // Scatter fog particles
          if (((sx + sy * 7 + frame * 3) % 11) === 0) {
            const fogCh = FOG_CHARS[(sx + sy) % FOG_CHARS.length];
            row[sx][0] = sattr(245, 17);
            row[sx][1] = fogCh;
          }
        }
      }
    } else if (weather.type === 'rain') {
      // Scatter rain particles
      for (let sy = 0; sy < this.viewH; sy++) {
        const row = screen.lines[sy];
        if (!row) continue;
        for (let sx = 0; sx < this.viewW; sx++) {
          if (sx >= row.length) continue;
          if (((sx * 3 + sy * 5 + frame * 7) % 13) === 0) {
            const rainCh = RAIN_CHARS[(sx + frame) % RAIN_CHARS.length];
            row[sx][0] = sattr(39, 17);
            row[sx][1] = rainCh;
          }
        }
      }
    } else if (weather.type === 'storm') {
      // Rain particles (denser)
      for (let sy = 0; sy < this.viewH; sy++) {
        const row = screen.lines[sy];
        if (!row) continue;
        for (let sx = 0; sx < this.viewW; sx++) {
          if (sx >= row.length) continue;
          if (((sx * 3 + sy * 5 + frame * 7) % 7) === 0) {
            const rainCh = RAIN_CHARS[(sx + frame) % RAIN_CHARS.length];
            row[sx][0] = sattr(33, 17);
            row[sx][1] = rainCh;
          }
        }
      }
      // Lightning flash: occasional frame
      if (frame === 0 && Math.random() < 0.3) {
        const lx = Math.floor(Math.random() * this.viewW);
        const ly = Math.floor(Math.random() * Math.floor(this.viewH / 2));
        const row = screen.lines[ly];
        if (row && lx < row.length) {
          row[lx][0] = sattr(226, 17);
          row[lx][1] = '*';
        }
      }
    }
  }

  _renderShip(screen) {
    const { ship } = this.gameState;

    const sx = ship.x - this.camera.x;
    const sy = ship.y - this.camera.y;

    if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) return;

    const row = screen.lines[sy];
    if (!row || sx >= row.length) return;

    row[sx][0] = SHIP_ATTR;
    row[sx][1] = DIR_CHARS[ship.direction];
    screen.lines[sy].dirty = true;
  }
}

module.exports = { OverworldMode };
