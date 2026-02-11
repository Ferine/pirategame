'use strict';

const { sattr } = require('../render/tiles');
const { buildLaneTemplate, updateLanes, checkCollision } = require('../harbor/lanes');
const {
  SPRITES, LANE_COLORS, WATER_BG, WATER_CHARS, DOCK_CHARS,
  CURRENT_CHARS_R, CURRENT_CHARS_L,
  PLAYER_CHAR, PLAYER_ATTR, PLAYER_ATTR_BLINK,
  STATUS_ATTR, STATUS_LABEL_ATTR,
  RESULT_WIN_ATTR, RESULT_FAIL_ATTR,
} = require('../harbor/harbor-art');
const { relocateShipToSafeWater } = require('../world/navigation');

const KEY_DIR = {
  up:    { dc: 0,  dr: -1 },
  down:  { dc: 0,  dr: 1 },
  left:  { dc: -1, dr: 0 },
  right: { dc: 1,  dr: 0 },
};

const STATUS_ROWS = 2;
const INVULN_DURATION = 1.5;
const FLASH_INTERVAL = 0.15;
const MOVE_COOLDOWN = 0.08;
const RESULT_DISPLAY_TIME = 2.5;
const PUSHBACK_ROWS = 2;

// Water depth gradient: darker at top, lighter at bottom
const WATER_FG_GRADIENT = [17, 17, 18, 18, 19, 19, 23, 23, 24, 24, 25, 25, 31, 31];

class HarborMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
  }

  enter(gameState) {
    this.gameState = gameState;
  }

  exit() {}

  update(dt) {
    const h = this.gameState.harbor;
    if (!h || !h.lanes.length) return;

    // Animation timer
    h.animTimer += dt;
    if (h.animTimer >= 0.5) {
      h.animTimer -= 0.5;
      h.animFrame = (h.animFrame + 1) % 4;
    }

    // Result display countdown
    if (h.result) {
      h.resultTimer -= dt;
      if (h.resultTimer <= 0) {
        this._exitHarbor();
        return;
      }
      return; // freeze gameplay during result display
    }

    // Update move cooldown
    if (h.player.moveCooldown > 0) {
      h.player.moveCooldown -= dt;
    }

    // Update invulnerability
    if (h.player.invulnTimer > 0) {
      h.player.invulnTimer -= dt;
      h.player.flashTimer += dt;
    } else {
      h.player.flashTimer = 0;
    }

    // Update lanes (move obstacles, spawn, etc.) — difficulty scales with navy notoriety
    updateLanes(h.lanes, h.gridW, dt, h.difficultyMult);

    // Apply current push
    this._applyCurrent(dt);

    // Check collision after obstacles moved
    this._checkPlayerCollision();
  }

  render(screen) {
    const h = this.gameState.harbor;
    if (!h) return;

    // Initialize grid dimensions on first render
    if (h.gridW === 0) {
      h.gridW = screen.width;
      h.gridH = screen.height;
      h.lanes = buildLaneTemplate(h.gridW, h.gridH);
      h.player.col = Math.floor(h.gridW / 2);
      h.player.row = h.lanes.length - 1; // bottom water row
    }

    const laneCount = h.lanes.length;

    // Layer 1 & 2: Water background + lane backgrounds
    for (let laneIdx = 0; laneIdx < laneCount; laneIdx++) {
      const lane = h.lanes[laneIdx];
      const sy = laneIdx;
      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < h.gridW && sx < row.length; sx++) {
        let ch, attr;

        if (lane.type === 'dock') {
          ch = DOCK_CHARS[(sx + h.animFrame) % DOCK_CHARS.length];
          attr = LANE_COLORS.dock;
        } else if (lane.type === 'reef') {
          // Sandy background, obstacles drawn on top
          ch = WATER_CHARS[(sx + laneIdx + h.animFrame) % WATER_CHARS.length];
          attr = sattr(24, WATER_BG);
        } else if (lane.type === 'current') {
          const arrows = lane.dir > 0 ? CURRENT_CHARS_R : CURRENT_CHARS_L;
          ch = arrows[(sx + h.animFrame) % arrows.length];
          attr = LANE_COLORS.current;
        } else {
          // Water with depth gradient
          const gradIdx = Math.min(
            Math.floor((laneIdx / laneCount) * WATER_FG_GRADIENT.length),
            WATER_FG_GRADIENT.length - 1
          );
          const fg = WATER_FG_GRADIENT[gradIdx];
          ch = WATER_CHARS[(sx + laneIdx + h.animFrame) % WATER_CHARS.length];
          attr = sattr(fg, WATER_BG);
        }

        row[sx][0] = attr;
        row[sx][1] = ch;
      }
      row.dirty = true;
    }

    // Layer 3: Obstacles
    for (let laneIdx = 0; laneIdx < laneCount; laneIdx++) {
      const lane = h.lanes[laneIdx];
      const sy = laneIdx;
      const row = screen.lines[sy];
      if (!row) continue;

      for (const obs of lane.obstacles) {
        const sprite = SPRITES[obs.sprite];
        if (!sprite) continue;

        const startX = Math.floor(obs.x);
        for (let i = 0; i < obs.width; i++) {
          const sx = startX + i;
          if (sx < 0 || sx >= h.gridW || sx >= row.length) continue;

          let ch;
          if (obs.sprite === 'reef') {
            ch = sprite.chars; // single char repeated
          } else {
            ch = i < sprite.chars.length ? sprite.chars[i] : ' ';
          }

          row[sx][0] = sprite.attr;
          row[sx][1] = ch;
        }
      }
    }

    // Layer 4: Player ship
    this._renderPlayer(screen, h);

    // Layer 5: Status bar (bottom 2 rows)
    this._renderStatusBar(screen, h);

    // Layer 6: Result overlay
    if (h.result) {
      this._renderResultOverlay(screen, h);
    }
  }

  handleInput(key) {
    const h = this.gameState.harbor;
    if (!h || h.result) return;

    // Q to retreat
    if (key === 'q') {
      h.result = 'retreat';
      h.resultTimer = 0; // immediate exit
      this._exitHarbor();
      return;
    }

    // Movement
    const move = KEY_DIR[key];
    if (move && h.player.moveCooldown <= 0) {
      const newCol = h.player.col + move.dc;
      const newRow = h.player.row + move.dr;

      // Clamp to screen bounds
      if (newCol < 0 || newCol >= h.gridW) return;
      if (newRow < 0 || newRow >= h.lanes.length) return;

      // Check reef blocking
      const collision = checkCollision(h.lanes, newCol, newRow);
      if (collision === 'reef') return; // blocked, no damage

      h.player.col = newCol;
      h.player.row = newRow;
      h.player.moveCooldown = MOVE_COOLDOWN;

      // Check win condition (dock row)
      if (h.lanes[newRow].type === 'dock') {
        h.result = 'docked';
        h.resultTimer = RESULT_DISPLAY_TIME;
        return;
      }

      // Check collision at new position
      this._checkPlayerCollision();
    }
  }

  // --- Private methods ---

  _applyCurrent(dt) {
    const h = this.gameState.harbor;
    const lane = h.lanes[h.player.row];
    if (!lane || lane.type !== 'current') return;

    h.player.pushAccum += lane.dir * lane.push * dt;

    // Apply whole-cell pushes
    while (h.player.pushAccum >= 1) {
      h.player.pushAccum -= 1;
      h.player.col = Math.min(h.gridW - 1, h.player.col + 1);
    }
    while (h.player.pushAccum <= -1) {
      h.player.pushAccum += 1;
      h.player.col = Math.max(0, h.player.col - 1);
    }
  }

  _checkPlayerCollision() {
    const h = this.gameState.harbor;
    if (h.player.invulnTimer > 0) return;

    const collision = checkCollision(h.lanes, h.player.col, h.player.row);
    if (collision === 'hit') {
      // Damage
      this.gameState.ship.hull -= h.damagePerHit;

      // Push player back
      const startRow = h.lanes.length - 1;
      h.player.row = Math.min(startRow, h.player.row + PUSHBACK_ROWS);

      // Invulnerability
      h.player.invulnTimer = INVULN_DURATION;
      h.player.flashTimer = 0;

      // Check death
      if (this.gameState.ship.hull <= 0) {
        this.gameState.ship.hull = 0;
        h.result = 'sunk';
        h.resultTimer = RESULT_DISPLAY_TIME;
      }
    }
  }

  _exitHarbor() {
    const h = this.gameState.harbor;

    if (h.result === 'sunk') {
      // Restore minimum hull, push away from port
      this.gameState.ship.hull = 1;
      this._pushShipFromPort();
      this.gameState.harbor = null;
      this.stateMachine.transition('OVERWORLD', this.gameState);
    } else if (h.result === 'retreat') {
      this._pushShipFromPort();
      this.gameState.harbor = null;
      this.stateMachine.transition('OVERWORLD', this.gameState);
    } else if (h.result === 'docked') {
      // Successfully docked — go ashore
      this.gameState.portInfo = {
        name: h.portName,
        desc: h.portDesc,
      };
      this.gameState.harbor = null;
      this.stateMachine.transition('PORT', this.gameState);
    } else {
      this.gameState.harbor = null;
      this.stateMachine.transition('OVERWORLD', this.gameState);
    }
  }

  _pushShipFromPort() {
    // Move ship to nearby navigable water so we do not strand the player.
    relocateShipToSafeWater(this.gameState, 3);
  }

  _renderPlayer(screen, h) {
    const sy = h.player.row;
    const sx = h.player.col;
    const row = screen.lines[sy];
    if (!row || sx >= row.length) return;

    // Blink during invulnerability
    let visible = true;
    if (h.player.invulnTimer > 0) {
      visible = Math.floor(h.player.flashTimer / FLASH_INTERVAL) % 2 === 0;
    }

    if (visible) {
      row[sx][0] = PLAYER_ATTR;
      row[sx][1] = PLAYER_CHAR;
    }
  }

  _renderStatusBar(screen, h) {
    const barY1 = screen.height - 2;
    const barY2 = screen.height - 1;

    // Clear status rows
    for (let y = barY1; y <= barY2; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < screen.width && x < row.length; x++) {
        row[x][0] = STATUS_ATTR;
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Line 1: Port name + hull
    const { ship } = this.gameState;
    const hullPct = Math.max(0, Math.round((ship.hull / ship.maxHull) * 100));
    const line1 = ` ${h.portName} - ${h.portDesc}`;
    const hullStr = `Hull: ${ship.hull}/${ship.maxHull} (${hullPct}%) `;

    this._writeStatusText(screen, barY1, 0, line1, STATUS_LABEL_ATTR);
    this._writeStatusText(screen, barY1, screen.width - hullStr.length, hullStr, STATUS_ATTR);

    // Line 2: Controls
    const line2 = ' Arrow keys: Move | Q: Retreat | Reach the dock!';
    this._writeStatusText(screen, barY2, 0, line2, STATUS_LABEL_ATTR);
  }

  _writeStatusText(screen, y, startX, text, attr) {
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

  _renderResultOverlay(screen, h) {
    let msg, attr;
    if (h.result === 'docked') {
      msg = `  DOCKED AT ${h.portName.toUpperCase()}!  `;
      attr = RESULT_WIN_ATTR;
    } else if (h.result === 'sunk') {
      msg = '  YOUR SHIP IS TAKING ON WATER!  ';
      attr = RESULT_FAIL_ATTR;
    } else {
      return;
    }

    const cy = Math.floor(screen.height / 2);
    const cx = Math.floor((screen.width - msg.length) / 2);
    const row = screen.lines[cy];
    if (!row) return;

    for (let i = 0; i < msg.length; i++) {
      const x = cx + i;
      if (x >= 0 && x < screen.width && x < row.length) {
        row[x][0] = attr;
        row[x][1] = msg[i];
      }
    }
    row.dirty = true;
  }
}

module.exports = { HarborMode };
