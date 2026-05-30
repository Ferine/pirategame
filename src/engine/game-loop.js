'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const TARGET_FPS = 12;
const FRAME_MS = Math.floor(1000 / TARGET_FPS);
const MAX_DT = 0.25; // cap to prevent spiral of death

// Below this the UI (HUD, encounter/port panels, map viewport) cannot lay out
// cleanly, so we show a "resize me" notice instead of rendering garbage.
const MIN_COLS = 80;
const MIN_ROWS = 24;

function recordCrash(err) {
  try {
    const dir = path.join(os.homedir(), '.kattegat-kaper');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(path.join(dir, 'crash.log'), line, 'utf8');
  } catch (e) {
    // last resort — never let crash logging itself crash the game
  }
}

class GameLoop {
  constructor(stateMachine, screen) {
    this.stateMachine = stateMachine;
    this.screen = screen;
    this.running = false;
    this.lastTime = 0;
    this._timer = null;
  }

  start() {
    this.running = true;
    this.lastTime = Date.now();
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _renderTooSmall() {
    const screen = this.screen;
    const w = screen.width, h = screen.height;
    const lines = [
      'Kattegat Kaper',
      '',
      'Please enlarge your terminal window.',
      `Current: ${w}x${h}   Minimum: ${MIN_COLS}x${MIN_ROWS}`,
    ];
    for (let y = 0; y < h; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < w && x < row.length; x++) {
        row[x][0] = (250 << 9) | 233; // pale grey on near-black
        row[x][1] = ' ';
      }
      row.dirty = true;
    }
    const startY = Math.max(0, Math.floor(h / 2) - 2);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const y = startY + i;
      const row = screen.lines[y];
      if (!row) continue;
      const startX = Math.max(0, Math.floor((w - text.length) / 2));
      for (let j = 0; j < text.length; j++) {
        const x = startX + j;
        if (x >= 0 && x < w && x < row.length) {
          row[x][1] = text[j];
        }
      }
    }
  }

  _tick() {
    if (!this.running) return;

    const now = Date.now();
    let dt = (now - this.lastTime) / 1000;
    dt = Math.min(dt, MAX_DT);
    this.lastTime = now;

    try {
      if (this.screen.width < MIN_COLS || this.screen.height < MIN_ROWS) {
        // Don't advance simulation while unrenderable — just show the notice.
        this._renderTooSmall();
      } else {
        this.stateMachine.update(dt);
        this.stateMachine.render(this.screen);
      }
      this.screen.render();
    } catch (err) {
      // A shipped game should survive an unexpected render/update error (e.g. an
      // odd terminal state) rather than hard-crash the player's session. Log it
      // for diagnosis and keep running. Under KK_DEBUG, fail fast so tests and
      // development surface the bug immediately.
      recordCrash(err);
      if (process.env.KK_DEBUG) {
        this.stop();
        throw err;
      }
    }

    const elapsed = Date.now() - now;
    const delay = Math.max(0, FRAME_MS - elapsed);
    this._timer = setTimeout(() => this._tick(), delay);
  }
}

module.exports = { GameLoop, MIN_COLS, MIN_ROWS };
