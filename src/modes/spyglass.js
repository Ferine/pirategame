'use strict';

const { sattr } = require('../render/tiles');
const { getWeatherEffects } = require('../world/weather');

// Brass ring gradient colors (xterm 256)
const BRASS_COLORS = [94, 130, 136, 172, 178, 214];
const BRASS_CHARS = '\u2593\u2592\u2591'; // ▓▒░

// Enemy silhouette (small, seen through spyglass)
const ENEMY_SHIP = [' .|. ', '/===\\', '~~~~~'];

const AMMO_CYCLE = ['iron', 'chain', 'grape'];

class SpyglassMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.time = 0;
    this.sceneOffsetX = 0;
    this.sceneOffsetY = 0;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.time = 0;
    this.sceneOffsetX = 0;
    this.sceneOffsetY = 0;
  }

  exit() {}

  update(dt) {
    this.time += dt;
  }

  render(screen) {
    const w = screen.width;
    const h = screen.height;
    const combat = this.gameState.combat;
    const wind = combat.wind;

    // Lens center
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    // Radius with aspect correction
    const radius = Math.min(cx - 4, (cy - 2) * 2);

    // Sway — amplified by weather
    const t = this.time;
    const weatherFx = this.gameState.weather ? getWeatherEffects(this.gameState.weather) : null;
    const swayMult = weatherFx ? weatherFx.swayMult : 1.0;
    const swayX = (Math.sin(t * 1.2) * (3 + wind.strength * 0.5) + Math.sin(t * 3.5) * 1.0) * swayMult;
    const swayY = (Math.sin(t * 0.8 + 0.7) * (3 + wind.strength * 0.5) * 0.6 + Math.sin(t * 2.8 + 1.3) * 0.5) * swayMult;

    // Scene position (enemy ship center, moves with sway + player offset)
    const sceneX = swayX + this.sceneOffsetX;
    const sceneY = swayY + this.sceneOffsetY;

    // Wave animation
    const waveChars = ['~', '\u2248', '\u223C', '~']; // ~ ≈ ∼ ~
    const waveFrame = Math.floor(this.time * 3) % waveChars.length;

    const blackAttr = sattr(232, 232);
    const oceanAttr = sattr(24, 17);
    const crosshairAttr = sattr(196, 17); // bright red on navy
    const enemyHullAttr = sattr(94, 17);
    const enemySailAttr = sattr(255, 17);

    for (let sy = 0; sy < h - 1; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < w; sx++) {
        if (sx >= row.length) continue;

        // Distance from center (aspect-corrected)
        const dx = sx - cx;
        const dy = (sy - cy) * 2.0;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > radius + 2) {
          // Outside lens - black
          row[sx][0] = blackAttr;
          row[sx][1] = ' ';
        } else if (dist >= radius - 1) {
          // Brass ring
          const angle = Math.atan2(dy, dx);
          const ringIdx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * BRASS_COLORS.length) % BRASS_COLORS.length;
          const charIdx = Math.floor(((dist - (radius - 1)) / 3) * BRASS_CHARS.length);
          const bChar = BRASS_CHARS[Math.min(charIdx, BRASS_CHARS.length - 1)] || '\u2592';
          row[sx][0] = sattr(BRASS_COLORS[ringIdx], 232);
          row[sx][1] = bChar;
        } else {
          // Inside lens - ocean scene
          const wIdx = ((sx + Math.floor(t * 2)) % waveChars.length + waveChars.length) % waveChars.length;
          row[sx][0] = oceanAttr;
          row[sx][1] = waveChars[wIdx];
        }
      }

      row.dirty = true;
    }

    // Render enemy ship silhouette inside the lens
    const enemyCX = Math.round(cx + sceneX);
    const enemyCY = Math.round(cy + sceneY) - 2;
    for (let ey = 0; ey < ENEMY_SHIP.length; ey++) {
      const line = ENEMY_SHIP[ey];
      const rowY = enemyCY + ey;
      if (rowY < 0 || rowY >= h - 1) continue;
      const row = screen.lines[rowY];
      if (!row) continue;

      for (let ex = 0; ex < line.length; ex++) {
        const colX = enemyCX - Math.floor(line.length / 2) + ex;
        if (colX < 0 || colX >= w || colX >= row.length) continue;

        // Only draw inside the lens
        const dx = colX - cx;
        const dy2 = (rowY - cy) * 2.0;
        const d = Math.sqrt(dx * dx + dy2 * dy2);
        if (d >= radius - 1) continue;

        const ch = line[ex];
        if (ch === ' ') continue;

        if (ch === '~') {
          row[colX][0] = sattr(31, 17);
        } else if (ch === '|' || ch === '.') {
          row[colX][0] = enemySailAttr;
        } else {
          row[colX][0] = enemyHullAttr;
        }
        row[colX][1] = ch;
      }
    }

    // Render crosshair at screen center (fixed)
    this._drawCrosshair(screen, cx, cy, radius, crosshairAttr);

    // Status bar at bottom
    this._drawStatusBar(screen, w, h, combat);
  }

  _drawCrosshair(screen, cx, cy, radius, attr) {
    const h = screen.height;
    const w = screen.width;

    // Center +
    if (cy >= 0 && cy < h - 1 && cx >= 0 && cx < w) {
      const row = screen.lines[cy];
      if (row && cx < row.length) {
        row[cx][0] = attr;
        row[cx][1] = '+';
      }
    }

    // Vertical line
    const vLen = Math.floor(radius / 4);
    for (let i = 1; i <= vLen; i++) {
      for (const dy of [-i, i]) {
        const ry = cy + dy;
        if (ry < 0 || ry >= h - 1) continue;
        const row = screen.lines[ry];
        if (row && cx < row.length) {
          row[cx][0] = attr;
          row[cx][1] = '|';
        }
      }
    }

    // Horizontal line
    const hLen = Math.floor(radius / 2);
    for (let i = 1; i <= hLen; i++) {
      for (const dx of [-i, i]) {
        const rx = cx + dx;
        if (rx < 0 || rx >= w) continue;
        const row = screen.lines[cy];
        if (row && rx < row.length) {
          row[rx][0] = attr;
          row[rx][1] = '-';
        }
      }
    }

    // Tick marks at 1/3 and 2/3 radius
    for (const frac of [1 / 3, 2 / 3]) {
      const tickH = Math.round(frac * hLen);
      const tickV = Math.round(frac * vLen);

      // Horizontal ticks
      for (const dx of [-tickH, tickH]) {
        const rx = cx + dx;
        if (rx >= 0 && rx < w && cy - 1 >= 0) {
          const row = screen.lines[cy - 1];
          if (row && rx < row.length) {
            row[rx][0] = attr;
            row[rx][1] = '|';
          }
        }
        if (rx >= 0 && rx < w && cy + 1 < screen.height - 1) {
          const row = screen.lines[cy + 1];
          if (row && rx < row.length) {
            row[rx][0] = attr;
            row[rx][1] = '|';
          }
        }
      }

      // Vertical ticks
      for (const dy of [-tickV, tickV]) {
        const ry = cy + dy;
        if (ry >= 0 && ry < screen.height - 1) {
          for (const ddx of [-1, 1]) {
            const rx = cx + ddx;
            if (rx >= 0 && rx < w) {
              const row = screen.lines[ry];
              if (row && rx < row.length) {
                row[rx][0] = attr;
                row[rx][1] = '-';
              }
            }
          }
        }
      }
    }
  }

  _drawStatusBar(screen, w, h, combat) {
    const row = screen.lines[h - 1];
    if (!row) return;

    const ammo = combat.ammoType;
    const count = combat.ammoInventory[ammo];
    const text = ` Ammo: ${ammo.toUpperCase()} (${count})  |  Arrows: aim  |  Space: cycle ammo  |  ENTER: lock aim `;

    const barAttr = sattr(178, 233);
    for (let i = 0; i < w && i < row.length; i++) {
      row[i][0] = barAttr;
      row[i][1] = i < text.length ? text[i] : ' ';
    }
    row.dirty = true;
  }

  handleInput(key) {
    const combat = this.gameState.combat;

    if (key === 'up') {
      this.sceneOffsetY += 1.5;
    } else if (key === 'down') {
      this.sceneOffsetY -= 1.5;
    } else if (key === 'left') {
      this.sceneOffsetX += 2;
    } else if (key === 'right') {
      this.sceneOffsetX -= 2;
    } else if (key === 'space') {
      // Cycle ammo
      const idx = AMMO_CYCLE.indexOf(combat.ammoType);
      combat.ammoType = AMMO_CYCLE[(idx + 1) % AMMO_CYCLE.length];
    } else if (key === 'enter') {
      // Lock aim - compute offset from crosshair center (0,0) to scene enemy position
      const wind = combat.wind;
      const t = this.time;
      const weatherFx2 = this.gameState.weather ? getWeatherEffects(this.gameState.weather) : null;
      const swayMult2 = weatherFx2 ? weatherFx2.swayMult : 1.0;
      const swayX = (Math.sin(t * 1.2) * (3 + wind.strength * 0.5) + Math.sin(t * 3.5) * 1.0) * swayMult2;
      const swayY = (Math.sin(t * 0.8 + 0.7) * (3 + wind.strength * 0.5) * 0.6 + Math.sin(t * 2.8 + 1.3) * 0.5) * swayMult2;

      combat.aim.offsetX = swayX + this.sceneOffsetX;
      combat.aim.offsetY = swayY + this.sceneOffsetY;

      this.stateMachine.transition('POWER_GAUGE', this.gameState);
    }
  }
}

module.exports = { SpyglassMode };
