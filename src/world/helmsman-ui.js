'use strict';

const { sattr } = require('../render/tiles');

// Colors (match journal-ui.js pattern)
const BG = sattr(233, 233);
const BORDER = sattr(94, 233);
const TITLE_ATTR = sattr(178, 233);
const TEXT_ATTR = sattr(252, 233);
const DIM_ATTR = sattr(240, 233);
const SELECTED_ATTR = sattr(233, 178); // dark on gold
const HELP_ATTR = sattr(240, 233);

/**
 * Create helmsman navigation menu state.
 * Builds a list of ports sorted by distance + an explore option.
 */
function createHelmsmanUI(gameState) {
  const ports = gameState.map && gameState.map.ports ? gameState.map.ports : [];
  const shipX = gameState.ship.x;
  const shipY = gameState.ship.y;

  // Build items: ports sorted by distance
  const items = ports
    .map(port => {
      const dx = port.actualX - shipX;
      const dy = port.actualY - shipY;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      return { type: 'port', port, dist, label: port.name };
    })
    .sort((a, b) => a.dist - b.dist);

  // Add explore option at end
  items.push({ type: 'explore', port: null, dist: 0, label: 'Explore uncharted waters' });

  return {
    items,
    cursor: 0,
  };
}

/**
 * Handle input for helmsman menu.
 * Returns { action, data } on selection, or null if consumed without action.
 * Returns { action: 'cancel' } to close menu.
 */
function helmsmanHandleInput(key, ui) {
  if (key === 'n' || key === 'q' || key === 'enter' && ui.cursor === -1) {
    return { action: 'cancel' };
  }

  if (key === 'up') {
    ui.cursor = Math.max(0, ui.cursor - 1);
    return null;
  }

  if (key === 'down') {
    ui.cursor = Math.min(ui.items.length - 1, ui.cursor + 1);
    return null;
  }

  if (key === 'enter') {
    const item = ui.items[ui.cursor];
    if (item.type === 'port') {
      return { action: 'port', data: item.port };
    } else if (item.type === 'explore') {
      return { action: 'explore' };
    }
  }

  return null; // consume all other keys while open
}

/**
 * Render helmsman navigation menu overlay.
 */
function helmsmanRender(screen, ui) {
  const sw = screen.width;
  const sh = screen.height;

  const panelW = Math.min(45, sw - 4);
  const panelH = Math.min(ui.items.length + 7, sh - 4);
  const px = Math.floor((sw - panelW) / 2);
  const py = Math.floor((sh - panelH) / 2);

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
  _writeChar(screen, py, px, '\u250C', BORDER);
  for (let x = px + 1; x < px + panelW - 1; x++) _writeChar(screen, py, x, '\u2500', BORDER);
  _writeChar(screen, py, px + panelW - 1, '\u2510', BORDER);
  _writeChar(screen, py + panelH - 1, px, '\u2514', BORDER);
  for (let x = px + 1; x < px + panelW - 1; x++) _writeChar(screen, py + panelH - 1, x, '\u2500', BORDER);
  _writeChar(screen, py + panelH - 1, px + panelW - 1, '\u2518', BORDER);
  for (let y = py + 1; y < py + panelH - 1; y++) {
    _writeChar(screen, y, px, '\u2502', BORDER);
    _writeChar(screen, y, px + panelW - 1, '\u2502', BORDER);
  }

  // Title
  const title = ' Set Course ';
  _writeText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE_ATTR);

  // Port list
  const contentTop = py + 2;
  for (let i = 0; i < ui.items.length; i++) {
    const item = ui.items[i];
    const lineY = contentTop + i;
    if (lineY >= py + panelH - 2) break;

    const isSelected = i === ui.cursor;
    const attr = isSelected ? SELECTED_ATTR : TEXT_ATTR;
    const pointer = isSelected ? '> ' : '  ';

    let text;
    if (item.type === 'port') {
      const distStr = String(item.dist).padStart(3);
      text = `${pointer}${item.label.padEnd(20)} ${distStr} nm`;
    } else {
      text = `${pointer}${item.label}`;
    }

    _writeText(screen, lineY, px + 2, text.slice(0, panelW - 4), attr);
  }

  // Help
  const help = ' Up/Down: Select  Enter: Go  N/Q: Cancel ';
  const helpY = py + panelH - 2;
  _writeText(screen, helpY, px + Math.floor((panelW - help.length) / 2), help, HELP_ATTR);
}

// --- Helpers ---

function _writeChar(screen, y, x, ch, attr) {
  const row = screen.lines[y];
  if (row && x >= 0 && x < row.length) {
    row[x][0] = attr;
    row[x][1] = ch;
  }
}

function _writeText(screen, y, startX, text, attr) {
  const row = screen.lines[y];
  if (!row) return;
  for (let i = 0; i < text.length; i++) {
    const x = startX + i;
    if (x >= 0 && x < row.length) {
      row[x][0] = attr;
      row[x][1] = text[i];
    }
  }
}

module.exports = {
  createHelmsmanUI,
  helmsmanHandleInput,
  helmsmanRender,
};
