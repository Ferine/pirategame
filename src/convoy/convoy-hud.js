'use strict';

const { sattr } = require('../render/tiles');

const ESCORT_ALIVE_ATTR = sattr(46, 17);   // green on navy
const ESCORT_DEAD_ATTR = sattr(160, 17);    // red on navy
const ESCORT_CHAR = '=';

const INFO_BG = sattr(178, 233);            // amber on dark
const TIMER_WARN_ATTR = sattr(160, 233);    // red on dark

/**
 * Render convoy escort ships on the overworld screen.
 * Also renders formation indicator and timer in top-right corner.
 */
function renderConvoyOverlay(screen, convoy, camera, viewW, viewH) {
  if (!convoy || !convoy.active) return;

  // Render escort ship positions
  for (const escort of convoy.escorts) {
    const sx = escort.x - camera.x;
    const sy = escort.y - camera.y;

    if (sx < 0 || sx >= viewW || sy < 0 || sy >= viewH) continue;

    const row = screen.lines[sy];
    if (!row || sx >= row.length) continue;

    row[sx][0] = escort.alive ? ESCORT_ALIVE_ATTR : ESCORT_DEAD_ATTR;
    row[sx][1] = ESCORT_CHAR;
  }

  // Render formation + timer info in top-right corner
  const alive = convoy.escorts.filter(e => e.alive).length;
  const total = convoy.escorts.length;
  const timer = Math.ceil(convoy.timer);
  const formation = convoy.formation.toUpperCase();
  const text = `CONVOY ${alive}/${total} ${formation} ${timer}s`;

  const startX = viewW - text.length - 2;
  const infoY = 1;
  const row = screen.lines[infoY];
  if (!row) return;

  const timerAttr = timer <= 15 ? TIMER_WARN_ATTR : INFO_BG;

  for (let i = 0; i < text.length; i++) {
    const x = startX + i;
    if (x >= 0 && x < row.length) {
      row[x][0] = timerAttr;
      row[x][1] = text[i];
    }
  }
  row.dirty = true;
}

module.exports = { renderConvoyOverlay };
