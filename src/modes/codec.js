'use strict';

const { sattr } = require('../render/tiles');
const { getMarkedShipById, resolveScene } = require('../world/codec-ships');

// Codec uses a tarnished/cooler brass than the combat spyglass so the player
// has an immediate visual cue that this isn't the targeting view.
const LENS_RING = [59, 95, 101, 137, 144, 180];
const LENS_CHARS = '▓▒░';

const TEXT_REVEAL_CPS = 38;          // base type-on speed (chars/sec)
const PUNCT_PAUSE = {                // extra time held on these characters
  '.': 0.18, '!': 0.20, '?': 0.20,
  ',': 0.08, ';': 0.10, ':': 0.10,
  '—': 0.14, '…': 0.30,
};

class CodecMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.def = null;
    this.lines = [];                  // [[speakerKey, text], ...]
    this.lineIdx = 0;
    this.charsShown = 0;
    this.pauseLeft = 0;               // remaining punctuation hold time
    this.time = 0;                    // total time in mode
    this.fadeIn = 0;                  // 0..1 enter transition
    this.fadeOut = 0;                 // 0..1 exit transition
    this.exiting = false;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.time = 0;
    this.fadeIn = 0;
    this.fadeOut = 0;
    this.exiting = false;
    this.lineIdx = 0;
    this.charsShown = 0;
    this.pauseLeft = 0;

    const codec = gameState.codec;
    const runtime = (gameState.codecShips || []).find(s => s.id === codec.activeShipId);
    if (!runtime) {
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
    this.fadeIn = Math.min(1, this.fadeIn + dt * 3.5);

    if (this.exiting) {
      this.fadeOut = Math.min(1, this.fadeOut + dt * 4);
      if (this.fadeOut >= 1) {
        this.stateMachine.transition('OVERWORLD', this.gameState);
      }
      return;
    }

    if (this.lineIdx < this.lines.length) {
      const text = this.lines[this.lineIdx][1];
      let remainingDt = dt;
      // Burn through any pause first, then advance characters.
      if (this.pauseLeft > 0) {
        const used = Math.min(this.pauseLeft, remainingDt);
        this.pauseLeft -= used;
        remainingDt -= used;
      }
      while (remainingDt > 0 && this.charsShown < text.length) {
        const charsPerSec = TEXT_REVEAL_CPS;
        const dtPerChar = 1 / charsPerSec;
        if (remainingDt < dtPerChar) {
          this.charsShown = Math.min(text.length, this.charsShown + remainingDt * charsPerSec);
          remainingDt = 0;
        } else {
          this.charsShown = Math.floor(this.charsShown) + 1;
          remainingDt -= dtPerChar;
          // After advancing, check if we just revealed a punctuation char
          const justRevealed = text[Math.floor(this.charsShown) - 1];
          const pause = PUNCT_PAUSE[justRevealed];
          // Only pause when there's more text after, otherwise it just delays the ▼
          if (pause && this.charsShown < text.length) {
            this.pauseLeft = pause;
            const used = Math.min(this.pauseLeft, remainingDt);
            this.pauseLeft -= used;
            remainingDt -= used;
          }
        }
      }
    }
  }

  render(screen) {
    const w = screen.width;
    const h = screen.height;
    const boxH = 7;                           // dialog panel height
    const lensH = h - boxH;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(lensH / 2);
    const radius = Math.min(cx - 4, (cy - 1) * 2);

    const t = this.time;
    const swayX = Math.sin(t * 0.9) * 1.6 + Math.sin(t * 2.7) * 0.5;
    const swayY = Math.sin(t * 0.6 + 0.5) * 0.8 + Math.sin(t * 2.3 + 1.1) * 0.3;

    const blackAttr = sattr(232, 232);
    const oceanAttr = sattr(17, 16);          // deeper, cooler than spyglass
    const distantAttr = sattr(238, 16);
    const distantSailAttr = sattr(244, 16);

    const waveChars = ['~', '≈', '∼', '~'];
    const fade = this.fadeIn * (1 - this.fadeOut);

    for (let sy = 0; sy < lensH; sy++) {
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
          // Tarnished lens ring — cooler palette than combat spyglass
          const angle = Math.atan2(dy, dx);
          const ringIdx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * LENS_RING.length) % LENS_RING.length;
          const charIdx = Math.floor(((dist - (radius - 1)) / 3) * LENS_CHARS.length);
          const bChar = LENS_CHARS[Math.min(charIdx, LENS_CHARS.length - 1)] || '▒';
          row[sx][0] = sattr(LENS_RING[ringIdx], 232);
          row[sx][1] = bChar;
        } else {
          // Inside lens: subtle ocean motion + occasional speckle (atmospheric noise)
          const wIdx = ((sx + Math.floor(t * 1.6)) % waveChars.length + waveChars.length) % waveChars.length;
          // Pseudo-random speckle: dim dot here and there
          const speckle = ((sx * 13 + sy * 7 + Math.floor(t * 2)) % 47) === 0;
          row[sx][0] = oceanAttr;
          row[sx][1] = speckle ? '·' : waveChars[wIdx];
        }
      }
      row.dirty = true;
    }

    // Distant ship silhouette inside the lens
    const sx0 = Math.round(cx + swayX);
    const sy0 = Math.round(cy + swayY) - 1;
    this._drawSilhouette(screen, sx0, sy0, cx, cy, radius, distantAttr, distantSailAttr);

    // Modal title sliver above the panel — "you are eavesdropping" cue
    if (lensH >= 2) {
      const titleY = lensH - 1;
      const titleText = this.def ? `  overheard from the ${this.def.name}  ` : '';
      const titleAttr = sattr(180, 232);
      // Faint dim rule across the whole row
      const ruleAttr = sattr(238, 232);
      const ruleRow = screen.lines[titleY];
      if (ruleRow) {
        for (let x = 0; x < w && x < ruleRow.length; x++) {
          ruleRow[x][0] = ruleAttr;
          ruleRow[x][1] = '·';
        }
        // Center the title band
        const startX = Math.max(0, Math.floor((w - titleText.length) / 2));
        for (let i = 0; i < titleText.length && startX + i < ruleRow.length; i++) {
          ruleRow[startX + i][0] = titleAttr;
          ruleRow[startX + i][1] = titleText[i];
        }
        ruleRow.dirty = true;
      }
    }

    this._drawDialogPanel(screen, w, h, boxH, fade);
  }

  _drawSilhouette(screen, ex, ey, cx, cy, radius, hullAttr, sailAttr) {
    // A more characterful tiny ship: sail-mast-hull
    const shape = [
      '   ▲   ',
      '   |   ',
      '  ╱|╲  ',
      ' ┌───┐ ',
      '~~~~~~~',
    ];
    const halfW = Math.floor(shape[0].length / 2);
    for (let ly = 0; ly < shape.length; ly++) {
      const row = screen.lines[ey + ly];
      if (!row) continue;
      const line = shape[ly];
      for (let lx = 0; lx < line.length; lx++) {
        const colX = ex - halfW + lx;
        if (colX < 0 || colX >= screen.width || colX >= row.length) continue;
        const ddx = colX - cx;
        const ddy = (ey + ly - cy) * 2.0;
        if (Math.sqrt(ddx * ddx + ddy * ddy) >= radius - 1) continue;
        const ch = line[lx];
        if (ch === ' ') continue;
        const isSail = ch === '▲' || ch === '|' || ch === '╱' || ch === '╲';
        row[colX][0] = isSail ? sailAttr : hullAttr;
        row[colX][1] = ch;
      }
    }
  }

  _drawDialogPanel(screen, w, h, boxH, fade) {
    const top = h - boxH;
    const bgAttr = sattr(232, 233);

    // Clear panel
    for (let y = top; y < h; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < w && x < row.length; x++) {
        row[x][0] = bgAttr;
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // End-of-scene state
    if (this.lineIdx >= this.lines.length) {
      const dimAttr = sattr(244, 233);
      const fadeAttr = sattr(238, 233);
      const lines = [
        'their voices fade beneath the wind…',
        '',
        '— press any key to lower the spyglass —',
      ];
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        if (!text) continue;
        const x = Math.max(0, Math.floor((w - text.length) / 2));
        const attr = i === 0 ? dimAttr : fadeAttr;
        this._writeText(screen, top + 1 + i * 2, x, text, attr);
      }
      return;
    }

    const [speakerKey, fullText] = this.lines[this.lineIdx];
    const speakerName = (this.def && this.def.speakers && this.def.speakers[speakerKey]) || '';
    const speakerColor = (this.def && this.def.speakerColors && this.def.speakerColors[speakerKey]) || 250;
    const isSilentSpeaker = !speakerName;

    // Layout:
    //   row 0: padding
    //   row 1: speaker bar:  ▎ Jens
    //   row 2: dialog line 1
    //   row 3: dialog line 2 (wrap)
    //   row 4: padding
    //   row 5: ▼ continue indicator + help
    //   row 6: ── closing rule

    const speakerRow = top + 1;
    const dialog1 = top + 2;
    const dialog2 = top + 3;
    const helpRow = top + 5;
    const closeRow = top + 6;

    const innerLeft = 4;
    const innerRight = w - 4;
    const innerWidth = Math.max(20, innerRight - innerLeft);

    // Speaker plate: a colored vertical bar followed by the name in their color.
    const barAttr = sattr(speakerColor, 233);
    const nameAttr = sattr(speakerColor, 233);
    if (!isSilentSpeaker) {
      this._writeText(screen, speakerRow, innerLeft - 2, '▎', barAttr);
      this._writeText(screen, speakerRow, innerLeft, speakerName, nameAttr);
    } else {
      // Speakerless line (e.g. Wendel's silent partner): a soft glyph hints
      // someone else is in the room without naming them.
      this._writeText(screen, speakerRow, innerLeft - 2, '▎', sattr(240, 233));
      this._writeText(screen, speakerRow, innerLeft, '(scratching of a quill)', sattr(240, 233));
    }

    // Word-wrap the revealed text into two visible rows.
    const shownChars = Math.floor(this.charsShown);
    const shown = fullText.slice(0, shownChars);
    const wrapped = _wordWrap(shown, innerWidth, 2);
    const dialogAttr = sattr(252, 233);
    if (wrapped[0]) this._writeText(screen, dialog1, innerLeft, wrapped[0], dialogAttr);
    if (wrapped[1]) this._writeText(screen, dialog2, innerLeft, wrapped[1], dialogAttr);

    // Typing cursor (block) right after current text, only while still revealing
    if (shownChars < fullText.length) {
      const cursorBlink = (Math.sin(this.time * 8) + 1) * 0.5; // 0..1
      const cursorOn = cursorBlink > 0.4;
      if (cursorOn) {
        // Find where to place it
        const usedRow = wrapped[1] ? dialog2 : dialog1;
        const usedLen = wrapped[1] ? wrapped[1].length : (wrapped[0] || '').length;
        this._writeText(screen, usedRow, innerLeft + usedLen, '▌', sattr(180, 233));
      }
    } else {
      // Smooth pulsing continuation arrow centered-right
      const pulse = (Math.sin(this.time * 3.2) + 1) * 0.5; // 0..1
      const pulseColors = [240, 244, 250, 178, 214, 178, 250, 244];
      const idx = Math.min(pulseColors.length - 1, Math.floor(pulse * pulseColors.length));
      this._writeText(screen, helpRow, innerRight - 1, '▼', sattr(pulseColors[idx], 233));
    }

    // Help text — readable mid-grey, generous spacing
    const helpAttr = sattr(244, 233);
    const helpText = ' SPACE / ENTER  next      Q  lower spyglass ';
    this._writeText(screen, helpRow, innerLeft, helpText, helpAttr);

    // Closing rule
    const ruleAttr = sattr(238, 233);
    const closeRowRow = screen.lines[closeRow];
    if (closeRowRow) {
      for (let x = 2; x < w - 2 && x < closeRowRow.length; x++) {
        closeRowRow[x][0] = ruleAttr;
        closeRowRow[x][1] = '─';
      }
    }

    // Suppress fade-out flicker if active
    if (fade < 1) {
      // Quick brightness bias by overwriting dialog with a dimmer color when
      // mid-transition. Approximation: skip — fade is fast enough.
    }
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
    if (this.exiting) return;
    if (key === 'q' || key === 'escape') {
      this.exiting = true;
      return;
    }
    if (this.lineIdx >= this.lines.length) {
      this.exiting = true;
      return;
    }
    const fullText = this.lines[this.lineIdx][1];
    if (Math.floor(this.charsShown) < fullText.length) {
      this.charsShown = fullText.length;
      this.pauseLeft = 0;
      return;
    }
    this.lineIdx++;
    this.charsShown = 0;
    this.pauseLeft = 0;
  }
}

/**
 * Wrap text into up to maxLines lines, each at most width chars, breaking on
 * spaces. Returns an array of strings (length 0..maxLines). The last line is
 * truncated with an ellipsis if there's overflow.
 */
function _wordWrap(text, width, maxLines) {
  if (!text) return [];
  if (text.length <= width) return [text];
  const words = text.split(' ');
  const out = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!current.length) {
      // First word on this line — even if it overruns, we have to start somewhere.
      current = w;
    } else if (current.length + 1 + w.length <= width) {
      current += ' ' + w;
    } else {
      out.push(current);
      current = w;
      if (out.length >= maxLines) break;
    }
  }
  if (out.length < maxLines && current.length) out.push(current);

  // Truncate each line that exceeds width (handles oversized single words)
  for (let i = 0; i < out.length; i++) {
    if (out[i].length > width) out[i] = out[i].slice(0, Math.max(0, width - 1)) + '…';
  }
  // If we broke early, mark the last visible line with an ellipsis.
  if (out.length === maxLines && words.length > 0) {
    // Recompute: did we consume all words?
    const consumed = out.join(' ').replace(/…$/, '').split(' ').length;
    if (consumed < words.length) {
      const last = out[maxLines - 1];
      out[maxLines - 1] = (last.length > width - 1 ? last.slice(0, width - 1) : last) + '…';
    }
  }
  return out;
}

module.exports = { CodecMode };
