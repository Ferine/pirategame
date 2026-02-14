'use strict';

const { sattr } = require('../render/tiles');
const { MAX_FLEET_SIZE, getFlagship, removeShip, setFlagship, getEffectiveStats,
        syncFromGameState, syncToGameState } = require('./fleet');
const { SHIP_TYPES } = require('./ship-types');
const { cargoCount } = require('../economy/goods');

// Colors
const BG = sattr(233, 233);
const BORDER = sattr(94, 233);
const TITLE = sattr(178, 233);
const HEADER = sattr(250, 233);
const ROW_NORMAL = sattr(252, 233);
const ROW_SELECTED = sattr(233, 178);
const FLAGSHIP_ATTR = sattr(226, 233);
const HELP = sattr(240, 233);
const MSG_ATTR = sattr(34, 233);
const WARN_ATTR = sattr(160, 233);

/**
 * Create fleet UI overlay state.
 */
function createFleetUIState(atPort, portName) {
  return {
    cursor: 0,
    atPort: !!atPort,
    portName: portName || '',
    message: '',
    messageTimer: 0,
  };
}

/**
 * Handle input for fleet overlay.
 * Returns true if consumed, false to close.
 */
function fleetHandleInput(key, ui, gameState) {
  const fleet = gameState.fleet;
  if (!fleet) return false;

  if (key === 'q' || key === 'f' || key === 'enter') {
    return false; // close
  }

  if (key === 'up') {
    ui.cursor = Math.max(0, ui.cursor - 1);
    return true;
  }

  if (key === 'down') {
    ui.cursor = Math.min(fleet.ships.length - 1, ui.cursor + 1);
    return true;
  }

  if (!ui.atPort) return true; // read-only when not at port

  // Space = set flagship
  if (key === 'space') {
    const ship = fleet.ships[ui.cursor];
    if (!ship) return true;

    if (ship.id === fleet.flagshipId) {
      ui.message = 'Already your flagship.';
      ui.messageTimer = 2.0;
      return true;
    }

    // Check if current cargo fits in the new ship's hold
    const newStats = getEffectiveStats(ship);
    const eco = gameState.economy;
    if (eco && newStats) {
      const currentCargo = cargoCount(eco);
      if (currentCargo > newStats.cargoMax) {
        ui.message = `Too much cargo (${currentCargo}/${newStats.cargoMax}). Sell goods first.`;
        ui.messageTimer = 3.0;
        return true;
      }
    }

    // Sync current runtime state back to old flagship
    syncFromGameState(fleet, gameState);
    // Switch flagship
    setFlagship(fleet, ship.id);
    // Load new flagship into runtime
    syncToGameState(fleet, gameState);

    // Trim excess crew if new ship has smaller capacity
    let crewDismissed = 0;
    if (gameState.crew && newStats) {
      while (gameState.crew.members.length > newStats.crewMax) {
        gameState.crew.members.pop();
        crewDismissed++;
      }
      if (gameState.crew.members.length > 0) {
        const { calcAvgMorale } = require('../crew/crew');
        calcAvgMorale(gameState.crew);
      }
    }

    let msg = `${ship.name} is now your flagship.`;
    if (crewDismissed > 0) {
      msg += ` ${crewDismissed} crew dismissed (no room).`;
    }
    ui.message = msg;
    ui.messageTimer = 3.5;
    return true;
  }

  // X = sell ship
  if (key === 'x') {
    const ship = fleet.ships[ui.cursor];
    if (!ship) return true;

    if (ship.id === fleet.flagshipId) {
      ui.message = "Can't sell your flagship.";
      ui.messageTimer = 2.0;
      return true;
    }

    const type = SHIP_TYPES[ship.typeId];
    const salePrice = Math.max(50, Math.floor((type ? type.cost : 0) * 0.4));
    const removed = removeShip(fleet, ship.id);
    if (removed) {
      if (gameState.economy) gameState.economy.gold += salePrice;
      ui.message = `Sold ${removed.name} for ${salePrice} rds.`;
      ui.messageTimer = 3.0;
      ui.cursor = Math.min(ui.cursor, fleet.ships.length - 1);
    }
    return true;
  }

  return true;
}

/**
 * Update fleet UI (timers).
 */
function fleetUpdate(dt, ui) {
  if (ui.messageTimer > 0) {
    ui.messageTimer -= dt;
    if (ui.messageTimer <= 0) ui.message = '';
  }
}

/**
 * Render fleet roster overlay.
 */
function fleetRender(screen, ui, gameState) {
  const fleet = gameState.fleet;
  if (!fleet) return;

  const sw = screen.width;
  const sh = screen.height;
  const panelW = Math.min(68, sw - 4);
  const panelH = Math.min(18, sh - 4);
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
  _drawBorder(screen, px, py, panelW, panelH);

  // Title
  const title = ' Fleet Roster ';
  _writeText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

  // Fleet count
  const countStr = `${fleet.ships.length}/${MAX_FLEET_SIZE} ships`;
  _writeText(screen, py + 1, px + panelW - countStr.length - 2, countStr, HEADER);

  // Gold
  const eco = gameState.economy;
  if (eco) {
    const goldStr = `${eco.gold} rds`;
    _writeText(screen, py + 1, px + 2, goldStr, TITLE);
  }

  // Column headers
  const headerY = py + 2;
  _writeText(screen, headerY, px + 3, 'Ship', HEADER);
  _writeText(screen, headerY, px + 26, 'Type', HEADER);
  _writeText(screen, headerY, px + 38, 'Hull', HEADER);
  _writeText(screen, headerY, px + 48, 'Spd', HEADER);
  _writeText(screen, headerY, px + 53, 'Cargo', HEADER);
  _writeText(screen, headerY, px + 60, 'Guns', HEADER);

  // Separator
  const sepY = headerY + 1;
  const sepRow = screen.lines[sepY];
  if (sepRow) {
    for (let x = px + 2; x < px + panelW - 2 && x < sepRow.length; x++) {
      sepRow[x][0] = BORDER;
      sepRow[x][1] = '\u2500';
    }
  }

  // Ship list
  for (let i = 0; i < fleet.ships.length; i++) {
    const rowY = headerY + 2 + i;
    if (rowY >= py + panelH - 4) break;

    const ship = fleet.ships[i];
    const stats = getEffectiveStats(ship);
    const isFlagship = ship.id === fleet.flagshipId;
    const isSelected = i === ui.cursor;
    const rowAttr = isSelected ? ROW_SELECTED : ROW_NORMAL;

    if (isSelected) {
      const row = screen.lines[rowY];
      if (row) {
        for (let x = px + 2; x < px + panelW - 2 && x < row.length; x++) {
          row[x][0] = ROW_SELECTED;
          row[x][1] = ' ';
        }
      }
    }

    const ptr = isSelected ? '\u25B6 ' : '  ';
    const flagLabel = isFlagship ? '\u2605' : ' '; // ★
    _writeText(screen, rowY, px + 1, ptr, rowAttr);
    _writeText(screen, rowY, px + 3, flagLabel, isFlagship ? FLAGSHIP_ATTR : rowAttr);
    _writeText(screen, rowY, px + 5, ship.name.slice(0, 20), rowAttr);
    _writeText(screen, rowY, px + 26, (SHIP_TYPES[ship.typeId] || {}).name || '?', rowAttr);

    if (stats) {
      // Show live hull for flagship, stored hull for others
      const displayHull = isFlagship ? gameState.ship.hull : ship.hull;
      _writeText(screen, rowY, px + 38, `${displayHull}/${stats.maxHull}`, rowAttr);
      _writeText(screen, rowY, px + 48, `${stats.speed.toFixed(1)}`, rowAttr);
      _writeText(screen, rowY, px + 53, `${stats.cargoMax}`, rowAttr);
      _writeText(screen, rowY, px + 60, `${stats.cannons}`, rowAttr);
    }
  }

  // Message
  if (ui.message) {
    const msgAttr = ui.message.includes("Can't") || ui.message.includes('Already') ? WARN_ATTR : MSG_ATTR;
    _writeText(screen, py + panelH - 3, px + 3, ui.message.slice(0, panelW - 6), msgAttr);
  }

  // Help line
  const help = ui.atPort
    ? ' Up/Down:Select  Space:Set Flagship  X:Sell  Q/Enter:Close '
    : ' Up/Down:Select  Q/Enter:Close ';
  _writeText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP);
}

// --- Drawing helpers ---

function _drawBorder(screen, px, py, w, h) {
  _writeChar(screen, py, px, '\u250C', BORDER);
  for (let x = px + 1; x < px + w - 1; x++) _writeChar(screen, py, x, '\u2500', BORDER);
  _writeChar(screen, py, px + w - 1, '\u2510', BORDER);
  _writeChar(screen, py + h - 1, px, '\u2514', BORDER);
  for (let x = px + 1; x < px + w - 1; x++) _writeChar(screen, py + h - 1, x, '\u2500', BORDER);
  _writeChar(screen, py + h - 1, px + w - 1, '\u2518', BORDER);
  for (let y = py + 1; y < py + h - 1; y++) {
    _writeChar(screen, y, px, '\u2502', BORDER);
    _writeChar(screen, y, px + w - 1, '\u2502', BORDER);
  }
}

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
  createFleetUIState,
  fleetHandleInput,
  fleetUpdate,
  fleetRender,
};
