'use strict';

const { FOV } = require('rot-js');
const { sattr } = require('../render/tiles');
const { ST, STEALTH_TILES, generateStealthMap } = require('../stealth/stealth-map');
const { ALERT, createGuard, updateGuard, getVisionConeTiles } = require('../stealth/guard-ai');
const { createMeleeState } = require('../combat/melee-state');
const { applyAction } = require('../world/factions');
const { getDifficulty } = require('../meta/legacy');
const { logEvent } = require('../meta/captains-log');

const PLAYER_CH = '@';
const PLAYER_ATTR = sattr(208, 0);
const BARREL_CH = 'o';
const BARREL_ATTR = sattr(94, 58);
const SIGHT_RANGE = 10;
const HUD_ROWS = 3;

// Vision cone overlay colors by alert state
const CONE_COLORS = {
  patrol:     sattr(58, 236),   // dim olive
  suspicious: sattr(178, 236),  // amber
  alert:      sattr(160, 236),  // red
  combat:     sattr(196, 233),  // bright red
};

// Alert indicators
const ALERT_CHARS = {
  patrol:     ' ',
  suspicious: '?',
  alert:      '!',
  combat:     '!',
};

class StealthMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.map = null;
    this.playerX = 0;
    this.playerY = 0;
    this.guards = [];
    this.fov = null;
    this.visible = null;
    this.explored = null;
    this.camera = { x: 0, y: 0 };
    this.viewW = 0;
    this.viewH = 0;
    this.message = '';
    this.messageTimer = 0;
    this.phase = 'stealth'; // stealth, detected, result
    this.objectivesCompleted = 0;
    this.objectivesTotal = 0;
    this.resultType = null;  // 'success', 'partial', 'failure'
    this.resultTimer = 0;
    this.detectedGuard = null;
    this.isHiding = false;
    this.barrelMsgCooldown = 0;
  }

  enter(gameState) {
    this.gameState = gameState;

    // Check if returning from stealth melee
    if (gameState.meleeResult && gameState.meleeResult.context === 'stealth_fight' && gameState._stealthSave) {
      const s = gameState._stealthSave;
      gameState._stealthSave = null;

      this.map = s.map;
      this.playerX = s.playerX;
      this.playerY = s.playerY;
      this.guards = s.guards;
      this.objectivesCompleted = s.objectivesCompleted;
      this.objectivesTotal = s.objectivesTotal;
      this.visible = s.visible;
      this.explored = s.explored;
      this.isHiding = s.isHiding || false;
      this.phase = 'stealth';

      // Rebuild FOV
      const self = this;
      this.fov = new FOV.RecursiveShadowcasting(
        (x, y) => {
          if (x < 0 || x >= self.map.width || y < 0 || y >= self.map.height) return false;
          const tile = self.map.tiles[y * self.map.width + x];
          return STEALTH_TILES[tile] ? STEALTH_TILES[tile].transparent : false;
        },
        { topology: 8 }
      );
      this._computeFOV();

      const result = gameState.meleeResult;
      gameState.meleeResult = null;

      if (result.victor === 'player') {
        // Guard defeated — remove and alert all
        if (this.detectedGuard) {
          this.detectedGuard.alive = false;
        }
        // All remaining guards go to alert
        for (const g of this.guards) {
          if (g.alive && g.alertState !== ALERT.COMBAT) {
            g.alertState = ALERT.ALERT;
            g.lastKnownPlayerX = this.playerX;
            g.lastKnownPlayerY = this.playerY;
            g.alertTimer = 0;
          }
        }
        this.message = 'The guard falls! Others are alerted!';
        this.messageTimer = 3.0;
      } else {
        // Player lost — mission fail
        this.phase = 'result';
        this.resultType = 'failure';
        this.resultTimer = 4.0;
        this.message = 'You are captured!';
        this.messageTimer = 4.0;
        gameState.ship.hull = Math.max(1, gameState.ship.hull - 15);
      }
      this.detectedGuard = null;
      return;
    }

    // Normal fresh entry
    const info = gameState.stealthInfo;
    if (!info) {
      this.stateMachine.transition('OVERWORLD', gameState);
      return;
    }

    const templateId = info.templateId || 'fort';
    const seed = info.seed || Date.now();
    this.map = generateStealthMap(templateId, seed);

    this.playerX = this.map.spawn.x;
    this.playerY = this.map.spawn.y;

    // Create guards
    this.guards = this.map.guardSpawns.map(s => createGuard(s));

    this.objectivesCompleted = 0;
    this.objectivesTotal = this.map.objectives.length;

    // FOV
    const size = this.map.width * this.map.height;
    this.visible = new Uint8Array(size);
    this.explored = new Uint8Array(size);

    const self = this;
    this.fov = new FOV.RecursiveShadowcasting(
      (x, y) => {
        if (x < 0 || x >= self.map.width || y < 0 || y >= self.map.height) return false;
        const tile = self.map.tiles[y * self.map.width + x];
        return STEALTH_TILES[tile] ? STEALTH_TILES[tile].transparent : false;
      },
      { topology: 8 }
    );
    this._computeFOV();

    this.phase = 'stealth';
    this.resultType = null;
    this.resultTimer = 0;
    this.detectedGuard = null;
    this.isHiding = false;
    this.barrelMsgCooldown = 0;
    this.message = `Infiltrating the ${this.map.name}. Stay hidden.`;
    this.messageTimer = 4.0;
  }

  exit() {
    this.gameState.stealthInfo = null;
    this.map = null;
    this.visible = null;
    this.explored = null;
    this.fov = null;
    this.guards = [];
  }

  update(dt) {
    // Message fadeout
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }

    if (this.phase === 'result') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this._exitStealth();
      }
      return;
    }

    if (this.phase === 'detected') return;

    // Barrel message cooldown
    if (this.barrelMsgCooldown > 0) this.barrelMsgCooldown -= dt;

    // Update guards (apply difficulty speed mult)
    const moveInterval = 0.5 / getDifficulty(this.gameState).guardSpeedMult;
    for (const guard of this.guards) {
      guard.moveInterval = moveInterval;
      const result = updateGuard(guard, this.playerX, this.playerY, this.map, dt, this.guards, this.isHiding);
      if (result === 'combat') {
        this.isHiding = false;
        this.detectedGuard = guard;
        this.phase = 'detected';
        this.message = 'Spotted! Fight or flee?';
        this.messageTimer = 10.0;
        return;
      }
      if (result === 'barrel_noticed' && this.barrelMsgCooldown <= 0) {
        this.message = 'Just a barrel...';
        this.messageTimer = 2.0;
        this.barrelMsgCooldown = 4.0;
      }
    }
  }

  render(screen) {
    this.viewW = screen.width;
    this.viewH = screen.height - HUD_ROWS;

    this._updateCamera();

    // Render tiles
    this._renderTiles(screen);

    // Render guard vision cones (before guards, after tiles)
    this._renderVisionCones(screen);

    // Render objectives
    this._renderObjectives(screen);

    // Render guards
    this._renderGuards(screen);

    // Render player
    this._renderPlayer(screen);

    // Render HUD
    this._renderHUD(screen);

    // Overlays
    if (this.phase === 'detected') {
      this._renderDetectedOverlay(screen);
    } else if (this.phase === 'result') {
      this._renderResultOverlay(screen);
    }
  }

  handleInput(key) {
    if (this.phase === 'result') {
      if (key === 'enter' || key === 'space' || key === 'q') {
        this._exitStealth();
      }
      return;
    }

    if (this.phase === 'detected') {
      if (key === 'enter' || key === '1') {
        this._doFight();
      } else if (key === 'space' || key === '2') {
        this._doFlee();
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

    if (key === 'h') {
      this._toggleBarrel();
      return;
    }

    if (key === 'enter') {
      this._interact();
      return;
    }

    if (key === 'q') {
      this._abort();
      return;
    }
  }

  // --- Private ---

  _move(dx, dy) {
    const nx = this.playerX + dx;
    const ny = this.playerY + dy;

    if (nx < 0 || nx >= this.map.width || ny < 0 || ny >= this.map.height) return;

    const tile = this.map.tiles[ny * this.map.width + nx];
    const def = STEALTH_TILES[tile];
    if (!def || !def.passable) return;

    this.playerX = nx;
    this.playerY = ny;
    this._computeFOV();

    // Check for exit
    if (tile === ST.EXIT) {
      this.message = 'The exit! Press ENTER to escape.';
      this.messageTimer = 4.0;
    }

    // Check for objective
    if (tile === ST.OBJECTIVE) {
      this.message = 'An objective! Press ENTER to complete it.';
      this.messageTimer = 4.0;
    }
  }

  _toggleBarrel() {
    if (this.isHiding) {
      // Exit barrel
      this.isHiding = false;
      this.message = 'You climb out of the barrel.';
      this.messageTimer = 2.5;
      this._computeFOV();
      return;
    }

    // Enter barrel — scan 4 cardinal neighbors
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const bx = this.playerX + dx;
      const by = this.playerY + dy;
      if (bx < 0 || bx >= this.map.width || by < 0 || by >= this.map.height) continue;
      const idx = by * this.map.width + bx;
      if (this.map.tiles[idx] === ST.BARREL) {
        // Consume barrel, move player into it
        this.map.tiles[idx] = ST.STONE_FLOOR;
        this.playerX = bx;
        this.playerY = by;
        this.isHiding = true;
        this.message = 'You climb into a barrel...';
        this.messageTimer = 2.5;
        if (this.gameState.stats) this.gameState.stats.barrelsHidden++;
        logEvent(this.gameState.captainsLog, 'barrel', {});
        this._computeFOV();
        return;
      }
    }

    this.message = 'No barrel nearby.';
    this.messageTimer = 2.0;
  }

  _interact() {
    const tile = this.map.tiles[this.playerY * this.map.width + this.playerX];

    // Complete objective
    if (tile === ST.OBJECTIVE) {
      for (const obj of this.map.objectives) {
        if (obj.x === this.playerX && obj.y === this.playerY && !obj.completed) {
          obj.completed = true;
          this.objectivesCompleted++;
          this.map.tiles[this.playerY * this.map.width + this.playerX] = ST.STONE_FLOOR;
          this.message = `${obj.label} - Done! (${this.objectivesCompleted}/${this.objectivesTotal})`;
          this.messageTimer = 3.0;
          return;
        }
      }
    }

    // Exit
    if (tile === ST.EXIT) {
      if (this.objectivesCompleted > 0) {
        this.phase = 'result';
        this.resultType = this.objectivesCompleted >= this.objectivesTotal ? 'success' : 'partial';
        this.resultTimer = 4.0;
        this._applyRewards();
      } else {
        this.message = 'Complete at least one objective before leaving!';
        this.messageTimer = 3.0;
      }
      return;
    }

    this.message = 'Nothing to interact with here.';
    this.messageTimer = 2.0;
  }

  _doFight() {
    // Save stealth state
    this.gameState._stealthSave = {
      map: this.map,
      playerX: this.playerX,
      playerY: this.playerY,
      guards: this.guards,
      objectivesCompleted: this.objectivesCompleted,
      objectivesTotal: this.objectivesTotal,
      visible: this.visible,
      explored: this.explored,
      isHiding: this.isHiding,
    };

    const override = {
      name: 'Fort Guard',
      hp: 70,
      strength: 9,
      agility: 7,
      aiStyle: 'defensive',
    };

    this.gameState.melee = createMeleeState(this.gameState, 'stealth_fight', override);
    this.stateMachine.transition('MELEE', this.gameState);
  }

  _doFlee() {
    // Roll for escape: based on distance to exit + randomness
    const dx = this.map.exit.x - this.playerX;
    const dy = this.map.exit.y - this.playerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const successChance = Math.min(0.7, 0.3 + (1.0 - dist / 30) * 0.4);

    if (Math.random() < successChance) {
      // Escape success
      this.phase = 'result';
      if (this.objectivesCompleted > 0) {
        this.resultType = 'partial';
        this._applyRewards();
      } else {
        this.resultType = 'failure';
      }
      this.resultTimer = 4.0;
      this.message = 'You slip away into the shadows!';
      this.messageTimer = 4.0;
    } else {
      // Forced combat
      this._doFight();
    }
  }

  _abort() {
    this.phase = 'result';
    this.resultType = 'failure';
    this.resultTimer = 3.0;
    this.message = 'You retreat from the infiltration.';
    this.messageTimer = 3.0;
  }

  _applyRewards() {
    const goldMult = getDifficulty(this.gameState).goldMult;
    const baseGold = Math.round((50 + Math.floor(this.objectivesCompleted * 50 + Math.random() * 50)) * goldMult);
    if (this.gameState.economy) {
      this.gameState.economy.gold += baseGold;
    }
    this._rewardGold = baseGold;

    // Check if no guards were ever alerted (stealth perfect)
    if (this.resultType === 'success') {
      const noneAlerted = this.guards.every(g => !g.alive || g.alertState === 'patrol');
      if (noneAlerted && this.gameState.stats) {
        this.gameState.stats.stealthPerfect++;
        logEvent(this.gameState.captainsLog, 'stealth_success', {});
      }
    }

    // Reputation: attack_english equivalent
    if (this.gameState.reputation) {
      applyAction(this.gameState.reputation, 'attack_english');
    }

    // Campaign: Act 3 fort infiltration
    if (this.gameState.campaign && this.gameState.campaign.act === 3
        && this.gameState.campaign.phase === 'fort_infiltration'
        && this.resultType === 'success') {
      const { addKeyItem, advanceCampaign } = require('../story/campaign');
      addKeyItem(this.gameState.campaign, 'royal_seal');
      const effects = advanceCampaign(this.gameState.campaign, 'stealth_complete', {}, this.gameState.reputation);
      for (const eff of effects) {
        if (eff.type === 'notice') {
          this.gameState.questNotices = (this.gameState.questNotices || []).concat([eff.message]);
        }
      }
    }
  }

  _exitStealth() {
    this.gameState.stealthInfo = null;
    this.stateMachine.transition('OVERWORLD', this.gameState);
  }

  _computeFOV() {
    this.visible.fill(0);

    this.fov.compute(this.playerX, this.playerY, SIGHT_RANGE, (x, y) => {
      if (x >= 0 && x < this.map.width && y >= 0 && y < this.map.height) {
        const idx = y * this.map.width + x;
        this.visible[idx] = 1;
        this.explored[idx] = 1;
      }
    });
  }

  _updateCamera() {
    this.camera.x = Math.floor(this.playerX - this.viewW / 2);
    this.camera.y = Math.floor(this.playerY - this.viewH / 2);
    this.camera.x = Math.max(0, Math.min(this.map.width - this.viewW, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.map.height - this.viewH, this.camera.y));
  }

  _renderTiles(screen) {
    for (let sy = 0; sy < this.viewH; sy++) {
      const my = this.camera.y + sy;
      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < this.viewW; sx++) {
        const mx = this.camera.x + sx;
        if (sx >= row.length) continue;

        if (mx < 0 || mx >= this.map.width || my < 0 || my >= this.map.height) {
          row[sx][0] = sattr(0, 0);
          row[sx][1] = ' ';
          continue;
        }

        const idx = my * this.map.width + mx;
        const isVisible = this.visible[idx];
        const isExplored = this.explored[idx];
        const tileType = this.map.tiles[idx];
        const def = STEALTH_TILES[tileType];

        if (isVisible) {
          row[sx][0] = def ? def.attr : 0;
          row[sx][1] = def ? def.ch : '?';
        } else if (isExplored) {
          row[sx][0] = sattr(237, 233);
          row[sx][1] = def ? def.ch : ' ';
        } else {
          row[sx][0] = sattr(233, 233);
          row[sx][1] = ' ';
        }
      }
      row.dirty = true;
    }
  }

  _renderVisionCones(screen) {
    for (const guard of this.guards) {
      if (!guard.alive) continue;

      const coneTiles = getVisionConeTiles(guard, this.map);
      const coneAttr = CONE_COLORS[guard.alertState] || CONE_COLORS.patrol;

      for (const t of coneTiles) {
        const sx = t.x - this.camera.x;
        const sy = t.y - this.camera.y;
        if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

        const idx = t.y * this.map.width + t.x;
        if (!this.visible[idx]) continue;

        const row = screen.lines[sy];
        if (!row || sx >= row.length) continue;

        // Tint the tile — keep char, change attr
        row[sx][0] = coneAttr;
      }
    }
  }

  _renderObjectives(screen) {
    for (const obj of this.map.objectives) {
      if (obj.completed) continue;
      const sx = obj.x - this.camera.x;
      const sy = obj.y - this.camera.y;
      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const idx = obj.y * this.map.width + obj.x;
      if (!this.visible[idx]) continue;

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;
      row[sx][0] = sattr(226, 233);
      row[sx][1] = '!';
    }
  }

  _renderGuards(screen) {
    for (const guard of this.guards) {
      if (!guard.alive) continue;
      const sx = guard.x - this.camera.x;
      const sy = guard.y - this.camera.y;
      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const idx = guard.y * this.map.width + guard.x;
      if (!this.visible[idx]) continue;

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;

      // Guard character with alert color
      const guardAttr = guard.alertState === ALERT.ALERT || guard.alertState === ALERT.COMBAT
        ? sattr(196, 233)
        : guard.alertState === ALERT.SUSPICIOUS
        ? sattr(178, 233)
        : sattr(160, 236);

      row[sx][0] = guardAttr;
      row[sx][1] = 'G';

      // Alert indicator above
      const indicatorChar = ALERT_CHARS[guard.alertState];
      if (indicatorChar && indicatorChar !== ' ') {
        const iy = sy - 1;
        if (iy >= 0 && iy < this.viewH) {
          const irow = screen.lines[iy];
          if (irow && sx < irow.length) {
            irow[sx][0] = guardAttr;
            irow[sx][1] = indicatorChar;
          }
        }
      }
    }
  }

  _renderPlayer(screen) {
    const sx = this.playerX - this.camera.x;
    const sy = this.playerY - this.camera.y;
    if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) return;
    const row = screen.lines[sy];
    if (!row || sx >= row.length) return;
    if (this.isHiding) {
      row[sx][0] = BARREL_ATTR;
      row[sx][1] = BARREL_CH;
    } else {
      row[sx][0] = PLAYER_ATTR;
      row[sx][1] = PLAYER_CH;
    }
  }

  _renderHUD(screen) {
    const baseY = screen.height - HUD_ROWS;
    const hudAttr = sattr(178, 233);
    const msgAttr = sattr(186, 233);

    // Clear HUD
    for (let y = baseY; y < screen.height; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < screen.width && x < row.length; x++) {
        row[x][0] = sattr(233, 233);
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Border
    const borderRow = screen.lines[baseY];
    if (borderRow) {
      const borderAttr = sattr(94, 233);
      for (let x = 0; x < screen.width && x < borderRow.length; x++) {
        borderRow[x][0] = borderAttr;
        borderRow[x][1] = '\u2500';
      }
    }

    // Alert level label
    let alertLabel = 'CALM';
    let alertAttr = sattr(34, 233);
    const maxAlert = this.guards.reduce((max, g) => {
      if (!g.alive) return max;
      if (g.alertState === ALERT.COMBAT || g.alertState === ALERT.ALERT) return 2;
      if (g.alertState === ALERT.SUSPICIOUS && max < 1) return 1;
      return max;
    }, 0);
    if (maxAlert === 1) { alertLabel = 'CAUTION'; alertAttr = sattr(178, 233); }
    if (maxAlert === 2) { alertLabel = 'DANGER';  alertAttr = sattr(160, 233); }

    const objStr = `Objectives: ${this.objectivesCompleted}/${this.objectivesTotal}`;
    const barrelKey = this.isHiding ? 'H: Exit' : 'H: Barrel';
    const line1 = ` STEALTH  |  ${objStr}  |  Arrows: Move  Enter: Interact  ${barrelKey}  Q: Abort`;
    this._writeHudText(screen, baseY + 1, 0, line1, hudAttr);

    // Alert status + barrel indicator
    const barrelTag = this.isHiding ? '[BARREL] ' : '';
    const statusStr = barrelTag + alertLabel;
    this._writeHudText(screen, baseY + 1, screen.width - statusStr.length - 2, barrelTag, sattr(94, 233));
    this._writeHudText(screen, baseY + 1, screen.width - alertLabel.length - 2, alertLabel, alertAttr);

    // Message
    if (this.message) {
      this._writeHudText(screen, baseY + 2, 1, this.message, msgAttr);
    }
  }

  _renderDetectedOverlay(screen) {
    const sw = screen.width;
    const sh = screen.height;
    const panelW = Math.min(40, sw - 4);
    const panelH = 8;
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    const BG = sattr(233, 233);
    const BORDER = sattr(160, 233);
    const TITLE = sattr(196, 233);
    const TEXT = sattr(250, 233);
    const SEL = sattr(233, 178);

    // Clear
    for (let y = py; y < py + panelH; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = px; x < px + panelW && x < row.length; x++) {
        row[x][0] = BG; row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Simple border
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
    for (let y = py + 1; y < py + panelH - 1; y++) { _wc(y, px, '\u2502'); _wc(y, px + panelW - 1, '\u2502'); }

    this._writeHudText(screen, py, px + Math.floor((panelW - 10) / 2), ' SPOTTED! ', TITLE);
    this._writeHudText(screen, py + 2, px + 3, 'A guard has spotted you!', TEXT);
    this._writeHudText(screen, py + 4, px + 5, 'Enter/1: Fight', SEL);
    this._writeHudText(screen, py + 5, px + 5, 'Space/2: Flee', TEXT);
  }

  _renderResultOverlay(screen) {
    const sw = screen.width;
    const sh = screen.height;
    const panelW = Math.min(44, sw - 4);
    const panelH = 10;
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    const BG = sattr(233, 233);
    const BORDER = sattr(94, 233);
    const HELP = sattr(240, 233);

    // Clear
    for (let y = py; y < py + panelH; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = px; x < px + panelW && x < row.length; x++) {
        row[x][0] = BG; row[x][1] = ' ';
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
    for (let y = py + 1; y < py + panelH - 1; y++) { _wc(y, px, '\u2502'); _wc(y, px + panelW - 1, '\u2502'); }

    if (this.resultType === 'success') {
      const TITLE = sattr(226, 233);
      this._writeHudText(screen, py, px + Math.floor((panelW - 18) / 2), ' MISSION SUCCESS! ', TITLE);
      this._writeHudText(screen, py + 2, px + 3, 'All objectives completed!', sattr(34, 233));
      this._writeHudText(screen, py + 4, px + 3, `Gold: +${this._rewardGold || 0} rigsdaler`, sattr(178, 233));
    } else if (this.resultType === 'partial') {
      const TITLE = sattr(178, 233);
      this._writeHudText(screen, py, px + Math.floor((panelW - 18) / 2), ' PARTIAL SUCCESS  ', TITLE);
      this._writeHudText(screen, py + 2, px + 3,
        `Completed ${this.objectivesCompleted}/${this.objectivesTotal} objectives.`, sattr(250, 233));
      this._writeHudText(screen, py + 4, px + 3, `Gold: +${this._rewardGold || 0} rigsdaler`, sattr(178, 233));
    } else {
      const TITLE = sattr(160, 233);
      this._writeHudText(screen, py, px + Math.floor((panelW - 18) / 2), ' MISSION FAILED   ', TITLE);
      this._writeHudText(screen, py + 2, px + 3, 'You failed to complete any objectives.', sattr(250, 233));
    }

    this._writeHudText(screen, py + panelH - 2, px + Math.floor((panelW - 16) / 2), ' Enter: Continue ', HELP);
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
}

module.exports = { StealthMode };
