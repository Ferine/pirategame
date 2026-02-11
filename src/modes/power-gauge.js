'use strict';

const { sattr } = require('../render/tiles');

const CANNON_ART = [
  '      ___________      ',
  '     /           \\     ',
  '  ==|  KATTEGAT  |=====>',
  '     \\___________/     ',
  '        |__|__|        ',
];

const FUSE_CHARS = ['*', 'o', '.', '*'];

class PowerGaugeMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.time = 0;
    this.gaugeValue = 0;  // 0..100
    this.direction = 1;   // 1 = rising, -1 = falling
    this.locked = false;
    this.lockFlashTimer = 0;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.time = 0;
    this.gaugeValue = 0;
    this.direction = 1;
    this.locked = false;
    this.lockFlashTimer = 0;
  }

  exit() {}

  update(dt) {
    this.time += dt;

    if (this.locked) {
      this.lockFlashTimer -= dt;
      if (this.lockFlashTimer <= 0) {
        // Write power and transition
        this.gameState.combat.power = this.gaugeValue;
        this.stateMachine.transition('DRONE_CAM', this.gameState);
      }
      return;
    }

    // Oscillate gauge
    const speed = 80 + this.gameState.combat.wind.strength * 15;
    this.gaugeValue += this.direction * speed * dt;

    if (this.gaugeValue >= 100) {
      this.gaugeValue = 100;
      this.direction = -1;
    } else if (this.gaugeValue <= 0) {
      this.gaugeValue = 0;
      this.direction = 1;
    }
  }

  render(screen) {
    const w = screen.width;
    const h = screen.height;
    const combat = this.gameState.combat;

    // Clear screen to dark
    const bgAttr = sattr(232, 233);
    for (let sy = 0; sy < h; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;
      for (let sx = 0; sx < w && sx < row.length; sx++) {
        row[sx][0] = bgAttr;
        row[sx][1] = ' ';
      }
      row.dirty = true;
    }

    // Title: "FIRE THE CANNON!" (rows 1-2)
    this._drawCentered(screen, 1, 'F I R E   T H E   C A N N O N !', sattr(196, 233));

    // Ammo type + aim quality (rows 3-4)
    const aimDist = Math.sqrt(combat.aim.offsetX ** 2 + combat.aim.offsetY ** 2);
    let aimQuality;
    if (aimDist < 6) aimQuality = 'EXCELLENT';
    else if (aimDist < 12) aimQuality = 'FAIR';
    else aimQuality = 'POOR';

    this._drawCentered(screen, 3, `Ammo: ${combat.ammoType.toUpperCase()}    Aim: ${aimQuality}`, sattr(178, 233));

    // Power bar (rows 6-8)
    const barWidth = Math.floor(w * 0.7);
    const barLeft = Math.floor((w - barWidth) / 2);
    const barRow = 6;
    const filled = Math.floor((this.gaugeValue / 100) * barWidth);
    const sweetSpot = Math.floor(0.75 * barWidth);

    for (let by = 0; by < 3; by++) {
      const row = screen.lines[barRow + by];
      if (!row) continue;

      for (let bx = 0; bx < barWidth; bx++) {
        const sx = barLeft + bx;
        if (sx >= w || sx >= row.length) continue;

        // Color gradient based on position
        let fg;
        const frac = bx / barWidth;
        if (frac < 0.3) fg = 34;       // green
        else if (frac < 0.55) fg = 226; // yellow
        else if (frac < 0.8) fg = 208;  // orange
        else fg = 196;                    // red

        // Sweet spot marker
        if (bx === sweetSpot && by === 1) {
          row[sx][0] = sattr(255, 233);
          row[sx][1] = '\u2666'; // ♦
          continue;
        }

        if (bx < filled) {
          // Flash effect when locked
          if (this.locked && Math.floor(this.time * 8) % 2 === 0) {
            row[sx][0] = sattr(255, fg);
            row[sx][1] = '\u2588'; // █
          } else {
            row[sx][0] = sattr(fg, 233);
            row[sx][1] = '\u2588'; // █
          }
        } else {
          row[sx][0] = sattr(237, 233);
          row[sx][1] = '\u2591'; // ░
        }
      }
    }

    // Percentage readout (row 10)
    const pctText = `${Math.round(this.gaugeValue)}%`;
    this._drawCentered(screen, 10, pctText, sattr(255, 233));

    // Cannon art (rows 12-16)
    const fuseIdx = Math.floor(this.time * 6) % FUSE_CHARS.length;
    const cannonAttr = sattr(248, 233);
    const fuseAttr = sattr(208, 233);

    for (let i = 0; i < CANNON_ART.length; i++) {
      const artRow = 12 + i;
      if (artRow >= h) break;
      const row = screen.lines[artRow];
      if (!row) continue;

      const line = CANNON_ART[i];
      const startX = Math.floor((w - line.length) / 2);

      for (let j = 0; j < line.length; j++) {
        const sx = startX + j;
        if (sx < 0 || sx >= w || sx >= row.length) continue;
        if (line[j] === ' ') continue;
        row[sx][0] = cannonAttr;
        row[sx][1] = line[j];
      }
    }

    // Fuse spark above cannon
    if (11 < h) {
      const fuseRow = screen.lines[11];
      if (fuseRow) {
        const fuseX = Math.floor(w / 2) + 8;
        if (fuseX < w && fuseX < fuseRow.length) {
          fuseRow[fuseX][0] = fuseAttr;
          fuseRow[fuseX][1] = FUSE_CHARS[fuseIdx];
        }
      }
    }

    // "Press ENTER to fire!" (row 18)
    if (!this.locked) {
      this._drawCentered(screen, 18, 'Press ENTER to fire!', sattr(178, 233));
    } else {
      this._drawCentered(screen, 18, 'FIRE!!!', sattr(196, 233));
    }
  }

  _drawCentered(screen, row, text, attr) {
    if (row < 0 || row >= screen.height) return;
    const r = screen.lines[row];
    if (!r) return;
    const startX = Math.floor((screen.width - text.length) / 2);
    for (let i = 0; i < text.length; i++) {
      const sx = startX + i;
      if (sx >= 0 && sx < screen.width && sx < r.length) {
        r[sx][0] = attr;
        r[sx][1] = text[i];
      }
    }
  }

  handleInput(key) {
    if (this.locked) return;

    if (key === 'enter' || key === 'space') {
      this.locked = true;
      this.lockFlashTimer = 0.3;
    }
  }
}

module.exports = { PowerGaugeMode };
