'use strict';

const { sattr } = require('./tiles');

/**
 * Apply CRT-style post-processing to the screen buffer.
 * - Scanlines: every other row gets slightly dimmer foreground
 * - Vignette: edge columns/rows get dimmer attributes
 */
function applyCRTFilter(screen, enabled) {
  if (!enabled) return;

  const w = screen.width;
  const h = screen.height;

  for (let sy = 0; sy < h; sy++) {
    const row = screen.lines[sy];
    if (!row) continue;

    // Scanline effect: odd rows get dimmed
    const isScanline = (sy % 2) === 1;

    // Vignette: darken edges
    const edgeY = Math.min(sy, h - 1 - sy);
    const yDim = edgeY < 2 ? 2 : (edgeY < 4 ? 1 : 0);

    for (let sx = 0; sx < w && sx < row.length; sx++) {
      const edgeX = Math.min(sx, w - 1 - sx);
      const xDim = edgeX < 2 ? 2 : (edgeX < 4 ? 1 : 0);
      const totalDim = isScanline ? 1 : 0;
      const vignetteDim = Math.max(xDim, yDim);

      if (totalDim > 0 || vignetteDim > 0) {
        // Get current attr — extract fg and bg
        const attr = row[sx][0];
        let fg = (attr >> 9) & 0x1FF;
        let bg = attr & 0x1FF;

        // Dim the foreground for scanlines
        if (totalDim > 0 && fg > 232) {
          fg = Math.max(232, fg - totalDim);
        }

        // Dim for vignette
        if (vignetteDim > 0) {
          if (fg > 232) fg = Math.max(232, fg - vignetteDim);
          if (bg > 232) bg = Math.max(232, bg - vignetteDim);
        }

        row[sx][0] = (fg << 9) | bg;
      }
    }
  }
}

/**
 * Trigger terminal bell (for cannon fire, alerts).
 */
function triggerBell(screen) {
  if (screen && screen.program) {
    try {
      screen.program.write('\x07');
    } catch (e) {
      // Ignore bell errors
    }
  }
}

module.exports = { applyCRTFilter, triggerBell };
