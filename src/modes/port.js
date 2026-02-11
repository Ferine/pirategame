'use strict';

const { FOV } = require('rot-js');
const { sattr } = require('../render/tiles');
const { T, TOWN_TILES, TOWN_W, TOWN_H, generateTownMap } = require('../port/town-map');
const { createShopState, shopHandleInput, shopUpdate, shopRender } = require('../economy/shop-ui');
const { createCrewUIState, crewHandleInput, crewUpdate, crewRender } = require('../crew/crew-ui');
const { onPortVisit } = require('../crew/crew');
const { FACTION_INFO, getRepTier } = require('../world/factions');
const { createMeleeState } = require('../combat/melee-state');
const { spawnTownNPCs } = require('../port/town-npcs');
const { saveGame } = require('../engine/save-load');
const { relocateShipToSafeWater } = require('../world/navigation');

const PLAYER_CH = '@';
const PLAYER_ATTR = sattr(208, 0); // amber on black

const SIGHT_RANGE = 12;
const LANTERN_BONUS = 4; // extra FOV range near lanterns

// HUD area at bottom
const HUD_ROWS = 3;

// Building interaction labels
const BUILDING_NAMES = {
  [T.TAVERN]:         'Tavern',
  [T.MARKET]:         'Market',
  [T.SHIPWRIGHT]:     'Shipwright',
  [T.HARBOR_MASTER]:  'Harbor Master',
  [T.CHURCH]:         'Church',
};

const BUILDING_MESSAGES = {
  [T.TAVERN]:         'The tavern smells of salt pork and dubious ale.',
  [T.MARKET]:         'Fishwives argue over the price of herring.',
  [T.SHIPWRIGHT]:     'The smell of fresh-cut timber fills the air.',
  [T.HARBOR_MASTER]:  'Charts and ledgers cover every surface.',
  [T.CHURCH]:         'A quiet refuge. Lutheran hymns echo faintly.',
};

// Water animation chars
const WATER_CHARS = ['~', '\u2248', '\u223C', '~'];

class PortMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.townMap = null;
    this.playerX = 0;
    this.playerY = 0;
    this.fov = null;
    this.visible = null;    // current frame visibility
    this.explored = null;   // persistent explored tiles
    this.camera = { x: 0, y: 0 };
    this.viewW = 0;
    this.viewH = 0;
    this.message = '';
    this.messageTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.portName = '';
    this.shop = null;    // active shop overlay (market or shipwright)
    this.crewUI = null;  // active crew/tavern overlay
    this.repUI = false;  // reputation display overlay (harbor master)
    this.npcs = [];      // town NPCs
  }

  enter(gameState) {
    this.gameState = gameState;
    const portInfo = gameState.portInfo;
    this.portName = portInfo ? portInfo.name : 'Port';

    // Generate town
    this.townMap = generateTownMap(this.portName);
    this.playerX = this.townMap.spawn.x;
    this.playerY = this.townMap.spawn.y;

    // Allocate visibility arrays
    const size = this.townMap.width * this.townMap.height;
    this.visible = new Uint8Array(size);
    this.explored = new Uint8Array(size);

    // Set up FOV
    const self = this;
    this.fov = new FOV.RecursiveShadowcasting(
      (x, y) => {
        if (x < 0 || x >= self.townMap.width || y < 0 || y >= self.townMap.height) return false;
        const tile = self.townMap.tiles[y * self.townMap.width + x];
        return TOWN_TILES[tile] ? TOWN_TILES[tile].transparent : false;
      },
      { topology: 8 }
    );

    this._computeFOV();
    this.message = `You step ashore at ${this.portName}.`;
    this.messageTimer = 4.0;

    // Spawn town NPCs
    this.npcs = spawnTownNPCs(this.townMap);

    // Auto-save on port visit
    saveGame(gameState, 'auto');

    // Crew morale boost from port visit
    if (gameState.crew) {
      onPortVisit(gameState.crew);
    }
  }

  exit() {
    this.townMap = null;
    this.visible = null;
    this.explored = null;
    this.fov = null;
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
      if (this.messageTimer <= 0) {
        this.message = '';
      }
    }

    // Shop overlay
    if (this.shop) {
      shopUpdate(dt, this.shop);
    }

    // Crew UI overlay
    if (this.crewUI) {
      crewUpdate(dt, this.crewUI);
    }
  }

  render(screen) {
    this.viewW = screen.width;
    this.viewH = screen.height - HUD_ROWS;

    this._updateCamera();

    // Render town tiles
    for (let sy = 0; sy < this.viewH; sy++) {
      const my = this.camera.y + sy;
      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < this.viewW; sx++) {
        const mx = this.camera.x + sx;
        if (sx >= row.length) continue;

        if (mx < 0 || mx >= this.townMap.width || my < 0 || my >= this.townMap.height) {
          // Out of bounds — black
          row[sx][0] = sattr(0, 0);
          row[sx][1] = ' ';
          continue;
        }

        const idx = my * this.townMap.width + mx;
        const isVisible = this.visible[idx];
        const isExplored = this.explored[idx];
        const tileType = this.townMap.tiles[idx];
        const def = TOWN_TILES[tileType];

        if (isVisible) {
          let ch = def ? def.ch : '?';
          let attr = def ? def.attr : 0;

          // Animate water
          if (tileType === T.WATER) {
            ch = WATER_CHARS[(mx + my + this.animFrame) % WATER_CHARS.length];
          }

          row[sx][0] = attr;
          row[sx][1] = ch;
        } else if (isExplored) {
          // Dark grey silhouette
          let ch = def ? def.ch : ' ';
          if (tileType === T.WATER) ch = '~';
          row[sx][0] = sattr(237, 233);
          row[sx][1] = ch;
        } else {
          // Unexplored — black
          row[sx][0] = sattr(233, 233);
          row[sx][1] = ' ';
        }
      }
      row.dirty = true;
    }

    // Render NPCs
    this._renderNPCs(screen);

    // Render player
    this._renderPlayer(screen);

    // Render building labels for visible doors
    this._renderBuildingLabels(screen);

    // Render HUD
    this._renderHUD(screen);

    // Shop overlay on top of everything
    if (this.shop) {
      shopRender(screen, this.shop, this.gameState);
    }

    // Crew/tavern overlay
    if (this.crewUI) {
      crewRender(screen, this.crewUI, this.gameState);
    }

    // Reputation overlay (harbor master)
    if (this.repUI) {
      this._renderReputationUI(screen);
    }
  }

  handleInput(key) {
    // Route to reputation display if open
    if (this.repUI) {
      if (key === 'q' || key === 'enter' || key === 'space') {
        this.repUI = false;
      }
      return;
    }

    // Route to crew UI if open
    if (this.crewUI) {
      const consumed = crewHandleInput(key, this.crewUI, this.gameState);
      if (!consumed) {
        this.crewUI = null;
      }
      return;
    }

    // Route to shop overlay if open
    if (this.shop) {
      const consumed = shopHandleInput(key, this.shop, this.gameState);
      if (!consumed) {
        this.shop = null; // close shop
      }
      return;
    }

    const dirMap = {
      up:    { dx: 0,  dy: -1 },
      down:  { dx: 0,  dy: 1 },
      left:  { dx: -1, dy: 0 },
      right: { dx: 1,  dy: 0 },
    };

    const dir = dirMap[key];
    if (dir) {
      const nx = this.playerX + dir.dx;
      const ny = this.playerY + dir.dy;

      // Bounds check
      if (nx < 0 || nx >= this.townMap.width || ny < 0 || ny >= this.townMap.height) return;

      const tile = this.townMap.tiles[ny * this.townMap.width + nx];
      const def = TOWN_TILES[tile];

      if (!def || !def.passable) return;

      this.playerX = nx;
      this.playerY = ny;
      this._computeFOV();

      // Check interactions
      this._checkTileInteraction(tile);
      return;
    }

    // Q to return to ship (from anywhere, as a shortcut)
    if (key === 'q') {
      this._returnToShip();
      return;
    }

    // Enter to interact with current tile
    if (key === 'enter') {
      const tile = this.townMap.tiles[this.playerY * this.townMap.width + this.playerX];
      this._interact(tile);
    }
  }

  // --- Private ---

  _computeFOV() {
    // Clear visible
    this.visible.fill(0);

    this.fov.compute(this.playerX, this.playerY, SIGHT_RANGE, (x, y) => {
      if (x >= 0 && x < this.townMap.width && y >= 0 && y < this.townMap.height) {
        const idx = y * this.townMap.width + x;
        this.visible[idx] = 1;
        this.explored[idx] = 1;
      }
    });
  }

  _updateCamera() {
    this.camera.x = Math.floor(this.playerX - this.viewW / 2);
    this.camera.y = Math.floor(this.playerY - this.viewH / 2);
    this.camera.x = Math.max(0, Math.min(this.townMap.width - this.viewW, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.townMap.height - this.viewH, this.camera.y));
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

  _renderNPCs(screen) {
    for (const npc of this.npcs) {
      const sx = npc.x - this.camera.x;
      const sy = npc.y - this.camera.y;
      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const idx = npc.y * this.townMap.width + npc.x;
      if (!this.visible[idx]) continue;

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;
      row[sx][0] = npc.attr;
      row[sx][1] = npc.ch;
    }
  }

  _renderBuildingLabels(screen) {
    if (!this.townMap.buildings) return;

    for (const bld of this.townMap.buildings) {
      // Show label above door if door is visible
      const doorIdx = bld.doorY * this.townMap.width + bld.doorX;
      if (!this.visible[doorIdx]) continue;

      const sx = bld.doorX - this.camera.x;
      const sy = bld.doorY - this.camera.y - 1; // one row above door

      if (sy < 0 || sy >= this.viewH) continue;

      const label = bld.name;
      const startX = sx - Math.floor(label.length / 2);
      const row = screen.lines[sy];
      if (!row) continue;

      const labelAttr = sattr(178, 236); // amber on dark
      for (let i = 0; i < label.length; i++) {
        const x = startX + i;
        if (x >= 0 && x < this.viewW && x < row.length) {
          row[x][0] = labelAttr;
          row[x][1] = label[i];
        }
      }
    }
  }

  _renderHUD(screen) {
    const baseY = screen.height - HUD_ROWS;
    const hudAttr = sattr(178, 233);   // amber on dark
    const textAttr = sattr(250, 233);   // grey on dark
    const msgAttr = sattr(186, 233);    // light amber

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

    // Line 1: port name + gold + controls
    const eco = this.gameState.economy;
    const goldStr = eco ? `  ${eco.gold} rds` : '';
    const line1 = ` ${this.portName}${goldStr}  |  Arrows: Walk  Enter: Interact  Q: Return to ship`;
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

  _checkTileInteraction(tile) {
    // Stepping onto ship tile
    if (tile === T.SHIP_TILE) {
      this.message = 'Your ship awaits. Press ENTER to set sail.';
      this.messageTimer = 5.0;
      return;
    }

    // Stepping through a door
    if (tile === T.DOOR) {
      // Find which building this door belongs to
      const bld = this._findBuildingAtDoor(this.playerX, this.playerY);
      if (bld) {
        const msg = BUILDING_MESSAGES[bld.floorType];
        this.message = msg || `You enter the ${bld.name}.`;
        this.messageTimer = 4.0;
      }
      return;
    }

    // Stepping onto building interior tiles — show hint for shops
    if (tile === T.TAVERN) {
      this.message = 'Press ENTER to recruit crew. Watch out for brawlers.';
      this.messageTimer = 3.0;
      return;
    }
    if (tile === T.MARKET) {
      this.message = 'Press ENTER to trade goods.';
      this.messageTimer = 3.0;
      return;
    }
    if (tile === T.SHIPWRIGHT) {
      this.message = 'Press ENTER to buy upgrades.';
      this.messageTimer = 3.0;
      return;
    }
    if (tile === T.HARBOR_MASTER) {
      this.message = 'Press ENTER to view your reputation.';
      this.messageTimer = 3.0;
      return;
    }
    if (BUILDING_NAMES[tile]) {
      return;
    }
  }

  _interact(tile) {
    // On ship tile — depart
    if (tile === T.SHIP_TILE) {
      this._returnToShip();
      return;
    }

    // Inside tavern — open crew/recruitment UI, chance of bar fight
    if (tile === T.TAVERN) {
      if (Math.random() < 0.25) {
        // Bar fight!
        this.gameState.melee = createMeleeState(this.gameState, 'barfight');
        this.stateMachine.transition('MELEE', this.gameState);
        return;
      }
      this.crewUI = createCrewUIState(this.portName, this.gameState);
      return;
    }

    // Inside market — open market shop
    if (tile === T.MARKET) {
      this.shop = createShopState('market', this.portName, this.gameState);
      return;
    }

    // Inside shipwright — open shipwright shop
    if (tile === T.SHIPWRIGHT) {
      this.shop = createShopState('shipwright', this.portName, this.gameState);
      return;
    }

    // Inside harbor master — open reputation display
    if (tile === T.HARBOR_MASTER) {
      if (this.gameState.reputation) {
        this.repUI = true;
      } else {
        this.message = 'Charts and ledgers cover every surface.';
        this.messageTimer = 4.0;
      }
      return;
    }

    // Inside other buildings
    const buildingName = BUILDING_NAMES[tile];
    if (buildingName) {
      const msg = BUILDING_MESSAGES[tile];
      this.message = msg || `You look around the ${buildingName}.`;
      this.messageTimer = 4.0;
      return;
    }

    // On door
    if (tile === T.DOOR) {
      const bld = this._findBuildingAtDoor(this.playerX, this.playerY);
      if (bld) {
        if (bld.floorType === T.TAVERN) {
          this.crewUI = createCrewUIState(this.portName, this.gameState);
        } else if (bld.floorType === T.MARKET) {
          this.shop = createShopState('market', this.portName, this.gameState);
        } else if (bld.floorType === T.SHIPWRIGHT) {
          this.shop = createShopState('shipwright', this.portName, this.gameState);
        } else if (bld.floorType === T.HARBOR_MASTER && this.gameState.reputation) {
          this.repUI = true;
        } else {
          this.message = BUILDING_MESSAGES[bld.floorType] || `You enter the ${bld.name}.`;
          this.messageTimer = 4.0;
        }
      }
      return;
    }

    // Check for NPC adjacency
    const npc = this._findAdjacentNPC();
    if (npc) {
      this.message = npc.greeting;
      this.messageTimer = 4.0;
      return;
    }

    // Default
    this.message = 'Nothing of interest here.';
    this.messageTimer = 2.0;
  }

  _renderReputationUI(screen) {
    const rep = this.gameState.reputation;
    if (!rep) return;

    const sw = screen.width;
    const sh = screen.height;

    const panelW = Math.min(50, sw - 4);
    const panelH = Math.min(16, sh - 4);
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    const BG = sattr(233, 233);
    const BORDER = sattr(94, 233);
    const TITLE = sattr(178, 233);
    const HEADER = sattr(250, 233);
    const HELP = sattr(240, 233);

    // Color mapping for rep tiers
    const TIER_COLORS = {
      bad:     sattr(160, 233),
      warn:    sattr(208, 233),
      neutral: sattr(250, 233),
      good:    sattr(34, 233),
      great:   sattr(226, 233),
    };

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
    const title = ' Harbor Master - Reputation ';
    this._writeHudText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

    // Header row
    this._writeHudText(screen, py + 2, px + 3, 'Faction', HEADER);
    this._writeHudText(screen, py + 2, px + 24, 'Rep', HEADER);
    this._writeHudText(screen, py + 2, px + 30, 'Standing', HEADER);

    // Separator
    const sepRow = screen.lines[py + 3];
    if (sepRow) {
      for (let x = px + 2; x < px + panelW - 2 && x < sepRow.length; x++) {
        sepRow[x][0] = BORDER;
        sepRow[x][1] = '\u2500';
      }
    }

    // Faction rows
    const factions = ['crown', 'smuggler', 'navy', 'merchant', 'pirate'];
    for (let i = 0; i < factions.length; i++) {
      const rowY = py + 4 + i;
      const fid = factions[i];
      const info = FACTION_INFO[fid];
      const val = rep[fid] || 0;
      const tier = getRepTier(val);
      const tierAttr = TIER_COLORS[tier.color] || HEADER;

      // Icon + name
      this._writeHudText(screen, rowY, px + 3, `${info.icon} ${info.name}`, HEADER);
      // Value
      this._writeHudText(screen, rowY, px + 24, `${val}`, tierAttr);
      // Tier label
      this._writeHudText(screen, rowY, px + 30, tier.label, tierAttr);

      // Mini bar (10 chars wide)
      const barStart = px + 41;
      const barLen = Math.min(6, panelW - 44);
      if (barLen > 0) {
        const filled = Math.round((val / 100) * barLen);
        for (let b = 0; b < barLen; b++) {
          const bx = barStart + b;
          const bRow = screen.lines[rowY];
          if (bRow && bx < bRow.length) {
            bRow[bx][0] = b < filled ? tierAttr : sattr(237, 233);
            bRow[bx][1] = b < filled ? '\u2588' : '\u2591';
          }
        }
      }
    }

    // Help
    const help = ' Enter/Q: Close ';
    this._writeHudText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP);
  }

  _findAdjacentNPC() {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0],[0,0]];
    for (const [dx, dy] of dirs) {
      const nx = this.playerX + dx;
      const ny = this.playerY + dy;
      for (const npc of this.npcs) {
        if (npc.x === nx && npc.y === ny) return npc;
      }
    }
    return null;
  }

  _findBuildingAtDoor(x, y) {
    if (!this.townMap.buildings) return null;
    for (const bld of this.townMap.buildings) {
      if (bld.doorX === x && bld.doorY === y) return bld;
    }
    return null;
  }

  _returnToShip() {
    this.gameState.portInfo = null;
    // Move ship to nearby navigable water so we do not strand the player.
    relocateShipToSafeWater(this.gameState, 3);
    this.stateMachine.transition('OVERWORLD', this.gameState);
  }
}

module.exports = { PortMode };
