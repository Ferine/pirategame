'use strict';

const { sattr } = require('../render/tiles');
const { getMarkedShipById, resolveScene } = require('../world/codec-ships');

const BRASS_COLORS = [94, 130, 136, 172, 178, 214];
const BRASS_CHARS = '▓▒░';

class CodecMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.def = null;
    this.lines = [];
    this.lineIdx = 0;
    this.charsShown = 0;
    this.time = 0;
    this.blink = 0;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.time = 0;
    this.blink = 0;
    this.lineIdx = 0;
    this.charsShown = 0;

    const codec = gameState.codec;
    const runtime = (gameState.codecShips || []).find(s => s.id === codec.activeShipId);
    if (!runtime) {
      // Nothing to eavesdrop on — bounce back.
      this.stateMachine.transition('OVERWORLD', gameState);
      return;
    }

    const resolved = resolveScene(gameState, runtime);
    if (!resolved || resolved.lines.length === 0) {
      this.stateMachine.transition('OVERWORLD', gameState);
      return;
    }
    this.def = resolved.def;
    this.lines = resolved.lines;
  }

  exit() {
    if (this.gameState && this.gameState.codec) {
      this.gameState.codec.activeShipId = null;
    }
    this.def = null;
    this.lines = [];
  }

  update(dt) {
    this.time += dt;
    this.blink += dt;
    // Reveal text at ~40 chars/sec
    if (this.lineIdx < this.lines.length) {
      const text = this.lines[this.lineIdx][1];
      this.charsShown = Math.min(text.length, this.charsShown + dt * 40);
    }
  }

  render(screen) {
    const w = screen.width;
    const h = screen.height;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const radius = Math.min(cx - 4, (cy - 2) * 2);

    const t = this.time;
    const swayX = Math.sin(t * 1.0) * 2 + Math.sin(t * 3.1) * 0.7;
    const swayY = Math.sin(t * 0.7 + 0.5) * 1.2 + Math.sin(t * 2.6 + 1.1) * 0.4;

    const blackAttr = sattr(232, 232);
    const oceanAttr = sattr(24, 17);
    const distantAttr = sattr(238, 17);

    const waveChars = ['~', '≈', '∼', '~'];

    for (let sy = 0; sy < h - 4; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;
      for (let sx = 0; sx < w; sx++) {
        if (sx >= row.length) continue;
        const dx = sx - cx;
        const dy = (sy - cy) * 2.0;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > radius + 2) {
          row[sx][0] = blackAttr;
          row[sx][1] = ' ';
        } else if (dist >= radius - 1) {
          const angle = Math.atan2(dy, dx);
          const ringIdx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * BRASS_COLORS.length) % BRASS_COLORS.length;
          const charIdx = Math.floor(((dist - (radius - 1)) / 3) * BRASS_CHARS.length);
          const bChar = BRASS_CHARS[Math.min(charIdx, BRASS_CHARS.length - 1)] || '▒';
          row[sx][0] = sattr(BRASS_COLORS[ringIdx], 232);
          row[sx][1] = bChar;
        } else {
          const wIdx = ((sx + Math.floor(t * 2)) % waveChars.length + waveChars.length) % waveChars.length;
          row[sx][0] = oceanAttr;
          row[sx][1] = waveChars[wIdx];
        }
      }
      row.dirty = true;
    }

    // Render the marked ship as a tiny silhouette inside the lens
    const enemyCX = Math.round(cx + swayX);
    const enemyCY = Math.round(cy + swayY) - 1;
    this._drawSilhouette(screen, enemyCX, enemyCY, cx, cy, radius, distantAttr);

    // Subtitle box at bottom
    this._drawSubtitleBox(screen, w, h);
  }

  _drawSilhouette(screen, ex, ey, cx, cy, radius, attr) {
    const lines = ['  |  ', ' /=\\ ', '~~~~~'];
    for (let ly = 0; ly < lines.length; ly++) {
      const row = screen.lines[ey + ly];
      if (!row) continue;
      const line = lines[ly];
      for (let lx = 0; lx < line.length; lx++) {
        const colX = ex - Math.floor(line.length / 2) + lx;
        if (colX < 0 || colX >= screen.width || colX >= row.length) continue;
        const dx = colX - cx;
        const dy = (ey + ly - cy) * 2.0;
        if (Math.sqrt(dx * dx + dy * dy) >= radius - 1) continue;
        const ch = line[lx];
        if (ch === ' ') continue;
        row[colX][0] = attr;
        row[colX][1] = ch;
      }
    }
  }

  _drawSubtitleBox(screen, w, h) {
    const boxH = 4;
    const top = h - boxH;
    const bgAttr = sattr(232, 233);
    const borderAttr = sattr(94, 233);

    // Clear three rows of bottom box
    for (let y = top; y < h; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < w && x < row.length; x++) {
        row[x][0] = bgAttr;
        row[x][1] = ' ';
      }
      row.dirty = true;
    }
    // Top border line
    const borderRow = screen.lines[top];
    if (borderRow) {
      for (let x = 0; x < w && x < borderRow.length; x++) {
        borderRow[x][0] = borderAttr;
        borderRow[x][1] = '─';
      }
    }

    if (this.lineIdx >= this.lines.length) {
      // End-of-scene prompt
      const msg = '   [Conversation fades. Press any key to lower the spyglass.]';
      this._writeText(screen, top + 1, 1, msg, sattr(244, 233));
      return;
    }

    const [speakerKey, fullText] = this.lines[this.lineIdx];
    const speakerName = (this.def && this.def.speakers && this.def.speakers[speakerKey]) || '';
    const speakerColor = (this.def && this.def.speakerColors && this.def.speakerColors[speakerKey]) || 250;
    const shown = fullText.slice(0, Math.floor(this.charsShown));

    const label = speakerName ? `${speakerName}: ` : '';
    if (label) {
      this._writeText(screen, top + 1, 2, label, sattr(speakerColor, 233));
    }
    this._writeText(screen, top + 1, 2 + label.length, shown, sattr(250, 233));

    // Wrap remainder onto line 2 if needed
    const firstLineMax = Math.max(0, w - (3 + label.length));
    if (shown.length > firstLineMax) {
      const second = shown.slice(firstLineMax);
      this._writeText(screen, top + 2, 2, second, sattr(250, 233));
    }

    // Continuation indicator
    if (Math.floor(this.charsShown) >= fullText.length) {
      const blinkOn = Math.floor(this.blink * 2) % 2 === 0;
      if (blinkOn) {
        this._writeText(screen, top + 2, w - 4, '▼', sattr(178, 233));
      }
    }

    // Help in bottom row
    this._writeText(screen, top + 3, 2, ' Space/Enter: next   Q: lower spyglass ', sattr(94, 233));
  }

  _writeText(screen, y, x, text, attr) {
    const row = screen.lines[y];
    if (!row) return;
    for (let i = 0; i < text.length; i++) {
      const cx = x + i;
      if (cx < 0 || cx >= screen.width || cx >= row.length) break;
      row[cx][0] = attr;
      row[cx][1] = text[i];
    }
    row.dirty = true;
  }

  handleInput(key) {
    if (key === 'q' || key === 'escape') {
      this.stateMachine.transition('OVERWORLD', this.gameState);
      return;
    }
    if (this.lineIdx >= this.lines.length) {
      this.stateMachine.transition('OVERWORLD', this.gameState);
      return;
    }
    const fullText = this.lines[this.lineIdx][1];
    if (Math.floor(this.charsShown) < fullText.length) {
      // Snap to full line on first keypress
      this.charsShown = fullText.length;
      return;
    }
    // Advance to next line
    this.lineIdx++;
    this.charsShown = 0;
  }
}

module.exports = { CodecMode };
