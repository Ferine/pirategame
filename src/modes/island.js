'use strict';

const { FOV } = require('rot-js');
const { sattr } = require('../render/tiles');
const { IT, ISLAND_TILES, generateIslandMap } = require('../island/island-map');
const { spawnWildlife, updateWildlife } = require('../island/wildlife');
const { spawnRival, updateRival } = require('../island/rival');
const { rollTreasureLoot } = require('../island/treasure');
const { createMeleeState } = require('../combat/melee-state');
const { relocateShipToSafeWater } = require('../world/navigation');
const { getDifficulty } = require('../meta/legacy');
const { logEvent } = require('../meta/captains-log');

const PLAYER_CH = '@';
const PLAYER_ATTR = sattr(208, 0); // amber on black

const SIGHT_RANGE = 10;
const CAVE_SIGHT_RANGE = 6;
const CAVE_TORCH_RANGE = 12;

const HUD_ROWS = 3;

// Water animation
const WATER_CHARS = ['~', '\u2248', '\u223C', '~'];

class IslandMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.islandMap = null;
    this.playerX = 0;
    this.playerY = 0;
    this.fov = null;
    this.visible = null;
    this.explored = null;
    this.camera = { x: 0, y: 0 };
    this.viewW = 0;
    this.viewH = 0;
    this.message = '';
    this.messageTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.islandName = '';
    this.islandInfo = null;

    // Puzzle state
    this.puzzleState = null;

    // Entities
    this.wildlife = [];
    this.rival = null;
    this.rivalTimer = 120; // 120 second countdown

    // Treasure
    this.hasMap = false;
    this.treasureFound = false;
    this.digOverlay = null; // { gold, cargo, cargoQty, label }
  }

  enter(gameState) {
    this.gameState = gameState;

    // Check if returning from melee duel — restore saved state
    if (gameState.meleeResult && gameState.meleeResult.context === 'duel' && gameState._islandSave) {
      const s = gameState._islandSave;
      gameState._islandSave = null;

      this.islandInfo = s.islandInfo;
      this.islandName = s.islandName;
      this.islandMap = s.islandMap;
      this.playerX = s.playerX;
      this.playerY = s.playerY;
      this.puzzleState = s.puzzleState;
      this.visible = s.visible;
      this.explored = s.explored;
      this.wildlife = s.wildlife;
      this.rival = s.rival;
      this.rivalTimer = s.rivalTimer;
      this.hasMap = s.hasMap;
      this.treasureFound = s.treasureFound;
      this.digOverlay = null;

      // Rebuild FOV callback (can't serialize functions)
      const self = this;
      this.fov = new FOV.RecursiveShadowcasting(
        (x, y) => {
          if (x < 0 || x >= self.islandMap.width || y < 0 || y >= self.islandMap.height) return false;
          const tile = self.islandMap.tiles[y * self.islandMap.width + x];
          return ISLAND_TILES[tile] ? ISLAND_TILES[tile].transparent : false;
        },
        { topology: 8 }
      );
      this._computeFOV();

      const result = gameState.meleeResult;
      gameState.meleeResult = null;
      if (result.victor === 'player') {
        if (this.rival) this.rival.alive = false;
        this.message = `${this.rival ? this.rival.name : 'The rival'} is defeated!`;
      } else {
        if (this.rival) this.rival.alive = false;
        this.message = 'Your rival escapes while you recover.';
      }
      this.messageTimer = 4.0;
      return;
    }

    // Normal fresh entry
    this.islandInfo = gameState.islandInfo;
    this.islandName = this.islandInfo ? this.islandInfo.name : 'Unknown Island';

    // Check if player has a treasure map for this island
    this.hasMap = false;
    if (gameState.treasureMaps && this.islandInfo) {
      for (const tm of gameState.treasureMaps) {
        if (tm.islandId === this.islandInfo.id && !tm.found) {
          this.hasMap = true;
          break;
        }
      }
    }

    // Generate island from seed (deterministic)
    const seed = this.islandInfo ? this.islandInfo.seed : 'default-island';
    this.islandMap = generateIslandMap(seed, this.hasMap);
    this.playerX = this.islandMap.spawn.x;
    this.playerY = this.islandMap.spawn.y;
    this.puzzleState = this.islandMap.puzzleState;

    // Allocate visibility
    const size = this.islandMap.width * this.islandMap.height;
    this.visible = new Uint8Array(size);
    this.explored = new Uint8Array(size);

    // FOV
    const self = this;
    this.fov = new FOV.RecursiveShadowcasting(
      (x, y) => {
        if (x < 0 || x >= self.islandMap.width || y < 0 || y >= self.islandMap.height) return false;
        const tile = self.islandMap.tiles[y * self.islandMap.width + x];
        return ISLAND_TILES[tile] ? ISLAND_TILES[tile].transparent : false;
      },
      { topology: 8 }
    );

    this._computeFOV();

    // Spawn wildlife
    this.wildlife = spawnWildlife(this.islandMap);

    // Spawn rival if player has treasure map
    this.rival = null;
    this.rivalTimer = 120;
    if (this.hasMap) {
      this.rival = spawnRival(this.islandMap);
    }

    this.treasureFound = false;
    this.digOverlay = null;
    this.message = `You wade ashore at ${this.islandName}.`;
    this.messageTimer = 4.0;
  }

  exit() {
    this.islandMap = null;
    this.visible = null;
    this.explored = null;
    this.fov = null;
    this.wildlife = [];
    this.rival = null;
    this.digOverlay = null;
  }

  update(dt) {
    // Water animation
    this.animTimer += dt;
    if (this.animTimer >= 0.5) {
      this.animTimer -= 0.5;
      this.animFrame = (this.animFrame + 1) % 4;
    }

    // Message fadeout
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }

    // Don't update entities while dig overlay is showing
    if (this.digOverlay) return;

    // Wildlife updates
    for (const entity of this.wildlife) {
      const contact = updateWildlife(entity, this.islandMap, this.playerX, this.playerY, dt);
      if (contact) {
        this.gameState.ship.hull = Math.max(0, this.gameState.ship.hull - entity.damage);
        this.message = `A ${entity.type} attacks! Hull -${entity.damage}`;
        this.messageTimer = 3.0;
      }
    }

    // Rival update
    if (this.rival && this.rival.alive) {
      this.rivalTimer -= dt;

      if (this.treasureFound && !this.rival.angry) {
        this.rival.angry = true;
        this.message = `${this.rival.name} is furious you found the treasure!`;
        this.messageTimer = 4.0;
      }

      const contact = updateRival(this.rival, this.islandMap, this.playerX, this.playerY, dt, this.treasureFound);
      if (contact) {
        if (this.rival.angry) {
          // Save island state before transitioning to melee
          this.gameState._islandSave = {
            islandInfo: this.islandInfo,
            islandName: this.islandName,
            islandMap: this.islandMap,
            playerX: this.playerX,
            playerY: this.playerY,
            puzzleState: this.puzzleState,
            visible: this.visible,
            explored: this.explored,
            wildlife: this.wildlife,
            rival: this.rival,
            rivalTimer: this.rivalTimer,
            hasMap: this.hasMap,
            treasureFound: this.treasureFound,
          };

          // Trigger melee duel instead of flat damage
          const override = {
            name: this.rival.name,
            hp: 90,
            strength: 11,
            agility: 7,
            aiStyle: 'balanced',
          };
          this.gameState.melee = createMeleeState(this.gameState, 'duel', override);
          this.rival.alive = true; // keep alive until duel resolves
          this.stateMachine.transition('MELEE', this.gameState);
          return;
        }
      }

      // Check if rival reached treasure first
      if (this.rival.reachedX && !this.treasureFound) {
        // Remove the treasure
        const { tiles, width, height } = this.islandMap;
        for (let i = 0; i < tiles.length; i++) {
          if (tiles[i] === IT.TREASURE_X) tiles[i] = IT.CAVE_FLOOR;
        }
        this.message = `${this.rival.name} found the treasure first!`;
        this.messageTimer = 5.0;
        this.hasMap = false;
      }

      if (this.rivalTimer <= 0 && !this.rival.reachedX && !this.treasureFound) {
        this.rival.reachedX = true;
        const { tiles } = this.islandMap;
        for (let i = 0; i < tiles.length; i++) {
          if (tiles[i] === IT.TREASURE_X) tiles[i] = IT.CAVE_FLOOR;
        }
        this.message = 'Time ran out! The treasure is gone.';
        this.messageTimer = 5.0;
        this.hasMap = false;
      }
    }
  }

  render(screen) {
    this.viewW = screen.width;
    this.viewH = screen.height - HUD_ROWS;

    this._updateCamera();

    // Render island tiles
    for (let sy = 0; sy < this.viewH; sy++) {
      const my = this.camera.y + sy;
      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < this.viewW; sx++) {
        const mx = this.camera.x + sx;
        if (sx >= row.length) continue;

        if (mx < 0 || mx >= this.islandMap.width || my < 0 || my >= this.islandMap.height) {
          row[sx][0] = sattr(0, 0);
          row[sx][1] = ' ';
          continue;
        }

        const idx = my * this.islandMap.width + mx;
        const isVisible = this.visible[idx];
        const isExplored = this.explored[idx];
        const tileType = this.islandMap.tiles[idx];
        const def = ISLAND_TILES[tileType];

        if (isVisible) {
          let ch = def ? def.ch : '?';
          let attr = def ? def.attr : 0;

          // Animate water
          if (tileType === IT.WATER) {
            ch = WATER_CHARS[(mx + my + this.animFrame) % WATER_CHARS.length];
          }

          row[sx][0] = attr;
          row[sx][1] = ch;
        } else if (isExplored) {
          let ch = def ? def.ch : ' ';
          if (tileType === IT.WATER) ch = '~';
          row[sx][0] = sattr(237, 233);
          row[sx][1] = ch;
        } else {
          row[sx][0] = sattr(233, 233);
          row[sx][1] = ' ';
        }
      }
      row.dirty = true;
    }

    // Render wildlife
    this._renderWildlife(screen);

    // Render rival
    this._renderRival(screen);

    // Render player
    this._renderPlayer(screen);

    // Render HUD
    this._renderHUD(screen);

    // Dig overlay on top
    if (this.digOverlay) {
      this._renderDigOverlay(screen);
    }
  }

  handleInput(key) {
    // Dig overlay dismissal
    if (this.digOverlay) {
      if (key === 'enter' || key === 'space' || key === 'q') {
        this.digOverlay = null;
      }
      return;
    }

    // Movement
    const dirMap = {
      up:    { dx: 0,  dy: -1 },
      down:  { dx: 0,  dy: 1 },
      left:  { dx: -1, dy: 0 },
      right: { dx: 1,  dy: 0 },
    };

    const dir = dirMap[key];
    if (dir) {
      this._move(dir.dx, dir.dy);
      return;
    }

    // Dig at X
    if (key === 'x') {
      this._dig();
      return;
    }

    // Enter to interact (boat, torch)
    if (key === 'enter') {
      this._interact();
      return;
    }

    // Q to return to boat
    if (key === 'q') {
      this._returnToShip();
      return;
    }
  }

  // --- Private ---

  _move(dx, dy) {
    const nx = this.playerX + dx;
    const ny = this.playerY + dy;
    const { tiles, width, height } = this.islandMap;

    if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;

    const tile = tiles[ny * width + nx];
    const def = ISLAND_TILES[tile];

    // Boulder pushing
    if (tile === IT.BOULDER) {
      const behindX = nx + dx;
      const behindY = ny + dy;
      if (behindX < 0 || behindX >= width || behindY < 0 || behindY >= height) return;
      const behindTile = tiles[behindY * width + behindX];
      const behindDef = ISLAND_TILES[behindTile];
      if (!behindDef || !behindDef.passable) return;

      // Push boulder
      if (behindTile === IT.PRESSURE_PLATE) {
        // Boulder on plate — convert to cave floor (pressed)
        tiles[behindY * width + behindX] = IT.CAVE_FLOOR;
        tiles[ny * width + nx] = IT.CAVE_FLOOR;
        this.puzzleState.platesPressed++;
        this.message = `Boulder clicks into place! (${this.puzzleState.platesPressed}/${this.puzzleState.platesNeeded})`;
        this.messageTimer = 3.0;
      } else {
        // Move boulder to behind tile
        tiles[behindY * width + behindX] = IT.BOULDER;
        tiles[ny * width + nx] = IT.CAVE_FLOOR;
      }

      // Move player into where boulder was
      this.playerX = nx;
      this.playerY = ny;
      this._computeFOV();
      return;
    }

    // Key pickup
    if (tile === IT.KEY_SPOT) {
      tiles[ny * width + nx] = IT.RUINS_FLOOR;
      this.puzzleState.hasKey = true;
      this.message = 'You found a rusty key!';
      this.messageTimer = 3.0;
      this.playerX = nx;
      this.playerY = ny;
      this._computeFOV();
      return;
    }

    // Locked door
    if (tile === IT.LOCKED_DOOR) {
      if (this.puzzleState.hasKey) {
        tiles[ny * width + nx] = IT.CAVE_ENTRY;
        this.puzzleState.hasKey = false;
        this.message = 'The key turns with a grinding click.';
        this.messageTimer = 3.0;
      } else {
        this.message = 'A locked door. You need a key.';
        this.messageTimer = 3.0;
      }
      return;
    }

    // Normal movement
    if (!def || !def.passable) return;

    this.playerX = nx;
    this.playerY = ny;
    this._computeFOV();

    // Tile interactions on step
    if (tile === IT.BOAT) {
      this.message = 'Your boat. Press ENTER or Q to leave the island.';
      this.messageTimer = 4.0;
    } else if (tile === IT.TREASURE_X) {
      this.message = 'X marks the spot! Press X to dig.';
      this.messageTimer = 4.0;
    } else if (tile === IT.CAVE_ENTRY) {
      this.message = 'You enter the dark cave...';
      this.messageTimer = 3.0;
    }
  }

  _interact() {
    const { tiles, width } = this.islandMap;
    const tile = tiles[this.playerY * width + this.playerX];

    // On boat — leave island
    if (tile === IT.BOAT) {
      this._returnToShip();
      return;
    }

    // Adjacent torch interaction
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (const [dx, dy] of dirs) {
      const tx = this.playerX + dx;
      const ty = this.playerY + dy;
      if (tx < 0 || tx >= this.islandMap.width || ty < 0 || ty >= this.islandMap.height) continue;
      if (tiles[ty * width + tx] === IT.TORCH_HOLDER && !this.puzzleState.torchLit) {
        this.puzzleState.torchLit = true;
        this.message = 'The torch flickers to life! The cave brightens.';
        this.messageTimer = 4.0;
        this._computeFOV();
        return;
      }
    }

    this.message = 'Nothing of interest here.';
    this.messageTimer = 2.0;
  }

  _dig() {
    const { tiles, width } = this.islandMap;
    const tile = tiles[this.playerY * width + this.playerX];

    if (tile !== IT.TREASURE_X) {
      this.message = 'Nothing to dig here.';
      this.messageTimer = 2.0;
      return;
    }

    // Roll loot
    const loot = rollTreasureLoot();

    // Apply difficulty gold mult
    const goldMult = getDifficulty(this.gameState).goldMult;
    loot.gold = Math.round(loot.gold * goldMult);

    // Apply loot
    if (this.gameState.economy) {
      this.gameState.economy.gold += loot.gold;

      // Track stats
      if (this.gameState.stats) {
        this.gameState.stats.treasuresFound++;
        this.gameState.stats.goldEarned += loot.gold;
      }
      logEvent(this.gameState.captainsLog, 'treasure', {});
      if (loot.cargo && loot.cargoQty > 0) {
        this.gameState.economy.cargo[loot.cargo] =
          (this.gameState.economy.cargo[loot.cargo] || 0) + loot.cargoQty;
      }
    }

    // Mark treasure map as found
    if (this.gameState.treasureMaps && this.islandInfo) {
      for (const tm of this.gameState.treasureMaps) {
        if (tm.islandId === this.islandInfo.id) {
          tm.found = true;
        }
      }
    }

    // Remove treasure tile
    tiles[this.playerY * width + this.playerX] = IT.CAVE_FLOOR;
    this.treasureFound = true;

    // Show dig overlay
    this.digOverlay = loot;
    this.message = '';
  }

  _returnToShip() {
    this.gameState.islandInfo = null;
    // Move ship to nearby navigable water so we do not strand the player.
    relocateShipToSafeWater(this.gameState, 3);
    this.stateMachine.transition('OVERWORLD', this.gameState);
  }

  _computeFOV() {
    this.visible.fill(0);

    // Determine FOV range based on location
    const tile = this.islandMap.tiles[this.playerY * this.islandMap.width + this.playerX];
    let range = SIGHT_RANGE;
    if (tile === IT.CAVE_FLOOR || tile === IT.CAVE_ENTRY) {
      range = this.puzzleState.torchLit ? CAVE_TORCH_RANGE : CAVE_SIGHT_RANGE;
    }

    this.fov.compute(this.playerX, this.playerY, range, (x, y) => {
      if (x >= 0 && x < this.islandMap.width && y >= 0 && y < this.islandMap.height) {
        const idx = y * this.islandMap.width + x;
        this.visible[idx] = 1;
        this.explored[idx] = 1;
      }
    });
  }

  _updateCamera() {
    this.camera.x = Math.floor(this.playerX - this.viewW / 2);
    this.camera.y = Math.floor(this.playerY - this.viewH / 2);
    this.camera.x = Math.max(0, Math.min(this.islandMap.width - this.viewW, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.islandMap.height - this.viewH, this.camera.y));
  }

  _renderPlayer(screen) {
    const sx = this.playerX - this.camera.x;
    const sy = this.playerY - this.camera.y;
    if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) return;
    const row = screen.lines[sy];
    if (!row || sx >= row.length) return;
    row[sx][0] = PLAYER_ATTR;
    row[sx][1] = PLAYER_CH;
  }

  _renderWildlife(screen) {
    for (const entity of this.wildlife) {
      if (!entity.alive) continue;
      const sx = entity.x - this.camera.x;
      const sy = entity.y - this.camera.y;
      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const idx = entity.y * this.islandMap.width + entity.x;
      if (!this.visible[idx]) continue;

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;
      row[sx][0] = entity.attr;
      row[sx][1] = entity.ch;
    }
  }

  _renderRival(screen) {
    if (!this.rival || !this.rival.alive) return;
    const sx = this.rival.x - this.camera.x;
    const sy = this.rival.y - this.camera.y;
    if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) return;

    const idx = this.rival.y * this.islandMap.width + this.rival.x;
    if (!this.visible[idx]) return;

    const row = screen.lines[sy];
    if (!row || sx >= row.length) return;
    row[sx][0] = this.rival.attr;
    row[sx][1] = this.rival.ch;

    // Name label above when close
    const dx = Math.abs(this.rival.x - this.playerX);
    const dy = Math.abs(this.rival.y - this.playerY);
    if (dx + dy <= 8) {
      const labelY = sy - 1;
      if (labelY >= 0 && labelY < this.viewH) {
        const label = this.rival.name;
        const labelX = Math.max(0, sx - Math.floor(label.length / 2));
        const labelRow = screen.lines[labelY];
        if (labelRow) {
          const labelAttr = sattr(196, 233);
          for (let i = 0; i < label.length && (labelX + i) < this.viewW; i++) {
            if (labelRow[labelX + i]) {
              labelRow[labelX + i][0] = labelAttr;
              labelRow[labelX + i][1] = label[i];
            }
          }
        }
      }
    }
  }

  _renderHUD(screen) {
    const baseY = screen.height - HUD_ROWS;
    const hudAttr = sattr(178, 233);
    const msgAttr = sattr(186, 233);

    // Clear HUD area
    for (let y = baseY; y < screen.height; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < screen.width && x < row.length; x++) {
        row[x][0] = sattr(233, 233);
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Top border
    const borderRow = screen.lines[baseY];
    if (borderRow) {
      const borderAttr = sattr(94, 233);
      for (let x = 0; x < screen.width && x < borderRow.length; x++) {
        borderRow[x][0] = borderAttr;
        borderRow[x][1] = '\u2500'; // ─
      }
    }

    // Line 1: island name, gold, key status, controls
    const eco = this.gameState.economy;
    const goldStr = eco ? `  ${eco.gold} rds` : '';
    const keyStr = this.puzzleState && this.puzzleState.hasKey ? '  [KEY]' : '';
    const torchStr = this.puzzleState && this.puzzleState.torchLit ? '  [TORCH]' : '';
    const rivalStr = this.rival && this.rival.alive && !this.rival.reachedX
      ? `  Rival: ${Math.ceil(this.rivalTimer)}s`
      : '';
    const line1 = ` ${this.islandName}${goldStr}${keyStr}${torchStr}${rivalStr}  |  Arrows: Walk  X: Dig  Enter: Use  Q: Leave`;
    this._writeHudText(screen, baseY + 1, 0, line1, hudAttr);

    // Line 2: message
    if (this.message) {
      this._writeHudText(screen, baseY + 2, 1, this.message, msgAttr);
    }
  }

  _writeHudText(screen, y, startX, text, attr) {
    const row = screen.lines[y];
    if (!row) return;
    for (let i = 0; i < text.length; i++) {
      const x = startX + i;
      if (x >= 0 && x < screen.width && x < row.length) {
        row[x][0] = attr;
        row[x][1] = text[i];
      }
    }
  }

  _renderDigOverlay(screen) {
    const loot = this.digOverlay;
    const sw = screen.width;
    const sh = screen.height;

    const panelW = Math.min(40, sw - 4);
    const panelH = Math.min(12, sh - 4);
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    const BG = sattr(233, 233);
    const BORDER = sattr(178, 233);
    const TITLE = sattr(226, 233);
    const TEXT = sattr(250, 233);
    const GOLD = sattr(178, 233);
    const HELP = sattr(240, 233);

    // Clear panel
    for (let y = py; y < py + panelH; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = px; x < px + panelW && x < row.length; x++) {
        row[x][0] = BG;
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Border
    const _wc = (y, x, ch) => {
      const row = screen.lines[y];
      if (row && x >= 0 && x < row.length) { row[x][0] = BORDER; row[x][1] = ch; }
    };
    _wc(py, px, '\u250C');
    for (let x = px + 1; x < px + panelW - 1; x++) _wc(py, x, '\u2500');
    _wc(py, px + panelW - 1, '\u2510');
    _wc(py + panelH - 1, px, '\u2514');
    for (let x = px + 1; x < px + panelW - 1; x++) _wc(py + panelH - 1, x, '\u2500');
    _wc(py + panelH - 1, px + panelW - 1, '\u2518');
    for (let y = py + 1; y < py + panelH - 1; y++) {
      _wc(y, px, '\u2502');
      _wc(y, px + panelW - 1, '\u2502');
    }

    // Title
    const title = ' TREASURE FOUND! ';
    this._writeHudText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

    // Loot details
    this._writeHudText(screen, py + 2, px + 3, loot.label, TEXT);
    this._writeHudText(screen, py + 4, px + 3, `Gold: +${loot.gold} rigsdaler`, GOLD);

    if (loot.cargo && loot.cargoQty > 0) {
      this._writeHudText(screen, py + 5, px + 3, `Cargo: +${loot.cargoQty} ${loot.cargo}`, TEXT);
    }

    // Hull status
    const hull = this.gameState.ship;
    this._writeHudText(screen, py + 7, px + 3, `Hull: ${hull.hull}/${hull.maxHull}`, TEXT);

    // Help
    const help = ' Enter: Continue ';
    this._writeHudText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP);
  }
}

module.exports = { IslandMode };
