'use strict';

const { sattr } = require('../render/tiles');
const { GOODS, UPGRADES, generatePriceTable, cargoCount } = require('./goods');
const { getTradePriceModifier, applyAction } = require('../world/factions');

// Colors
const BG = sattr(233, 233);
const BORDER = sattr(94, 233);
const TITLE = sattr(178, 233);
const HEADER = sattr(250, 233);
const ROW_NORMAL = sattr(252, 233);
const ROW_SELECTED = sattr(233, 178);  // dark on amber (highlighted)
const GOLD_COLOR = sattr(178, 233);
const GOOD_COLOR = sattr(252, 233);
const CANT_AFFORD = sattr(239, 233);
const HELP_COLOR = sattr(240, 233);
const TAB_ACTIVE = sattr(233, 94);
const TAB_INACTIVE = sattr(94, 233);

/**
 * Shop overlay state. Created when player opens market or shipwright.
 */
function createShopState(type, portName, gameState) {
  const state = {
    type,          // 'market' or 'shipwright'
    portName,
    cursor: 0,
    tab: 'buy',    // 'buy' or 'sell' for market
    prices: null,
    message: '',
    messageTimer: 0,
  };

  if (type === 'market') {
    state.prices = generatePriceTable(portName);

    // Apply reputation-based price modifier
    if (gameState.reputation) {
      const mod = getTradePriceModifier(gameState.reputation);
      for (const goodId of Object.keys(state.prices)) {
        state.prices[goodId].buy = Math.round(state.prices[goodId].buy * mod.buyMult);
        state.prices[goodId].sell = Math.round(state.prices[goodId].sell * mod.sellMult);
      }
    }
  }

  return state;
}

/**
 * Handle input for shop overlay.
 * Returns true if input was consumed, false if shop should close.
 */
function shopHandleInput(key, shop, gameState) {
  const eco = gameState.economy;
  if (!eco) return false;

  if (key === 'q' || key === 'enter') {
    // Close shop
    return false;
  }

  if (key === 'up') {
    shop.cursor = Math.max(0, shop.cursor - 1);
    return true;
  }

  if (key === 'down') {
    const maxItems = shop.type === 'market' ? GOODS.length : UPGRADES.length;
    shop.cursor = Math.min(maxItems - 1, shop.cursor + 1);
    return true;
  }

  if (shop.type === 'market') {
    // Tab switch
    if (key === 'left' || key === 'right') {
      shop.tab = shop.tab === 'buy' ? 'sell' : 'buy';
      shop.cursor = 0;
      return true;
    }

    // Space to buy/sell
    if (key === 'space') {
      const good = GOODS[shop.cursor];
      if (!good) return true;

      if (shop.tab === 'buy') {
        const price = shop.prices[good.id].buy;
        if (eco.gold < price) {
          shop.message = 'Not enough rigsdaler.';
          shop.messageTimer = 2.0;
        } else if (cargoCount(eco) >= eco.cargoMax) {
          shop.message = 'Cargo hold is full.';
          shop.messageTimer = 2.0;
        } else {
          eco.gold -= price;
          eco.cargo[good.id] = (eco.cargo[good.id] || 0) + 1;
          shop.message = `Bought 1 ${good.unit} of ${good.name} for ${price} rds.`;
          shop.messageTimer = 2.0;
          // Small reputation boost with Merchant Guild
          if (gameState.reputation) applyAction(gameState.reputation, 'trade_goods');
        }
      } else {
        // Sell
        if (!eco.cargo[good.id] || eco.cargo[good.id] <= 0) {
          shop.message = `You have no ${good.name} to sell.`;
          shop.messageTimer = 2.0;
        } else {
          const price = shop.prices[good.id].sell;
          eco.gold += price;
          eco.cargo[good.id] -= 1;
          if (eco.cargo[good.id] <= 0) delete eco.cargo[good.id];
          shop.message = `Sold 1 ${good.unit} of ${good.name} for ${price} rds.`;
          shop.messageTimer = 2.0;
          // Small reputation boost with Merchant Guild
          if (gameState.reputation) applyAction(gameState.reputation, 'trade_goods');
        }
      }
      return true;
    }
  }

  if (shop.type === 'shipwright') {
    // Space to purchase upgrade
    if (key === 'space') {
      const upgrade = UPGRADES[shop.cursor];
      if (!upgrade) return true;

      if (eco.gold < upgrade.cost) {
        shop.message = 'Not enough rigsdaler.';
        shop.messageTimer = 2.0;
        return true;
      }

      // Apply upgrade
      eco.gold -= upgrade.cost;
      const ship = gameState.ship;

      switch (upgrade.type) {
        case 'repair':
          ship.hull = ship.maxHull;
          shop.message = 'Hull fully repaired.';
          break;
        case 'hull':
          ship.maxHull += upgrade.bonus;
          ship.hull += upgrade.bonus;
          shop.message = `Max hull increased to ${ship.maxHull}.`;
          break;
        case 'cargo':
          eco.cargoMax += upgrade.bonus;
          shop.message = `Cargo hold expanded to ${eco.cargoMax}.`;
          break;
        case 'speed':
          eco.speedBonus += upgrade.bonus;
          shop.message = `Sails upgraded. Speed +${Math.round(upgrade.bonus * 100)}%.`;
          break;
        case 'cannon':
          eco.cannonBonus += upgrade.bonus;
          shop.message = `Extra cannon installed. Total bonus: ${eco.cannonBonus}.`;
          break;
      }
      shop.messageTimer = 2.5;
      return true;
    }
  }

  return true;
}

/**
 * Update shop state (timers).
 */
function shopUpdate(dt, shop) {
  if (shop.messageTimer > 0) {
    shop.messageTimer -= dt;
    if (shop.messageTimer <= 0) {
      shop.message = '';
    }
  }
}

/**
 * Render shop overlay onto screen buffer.
 */
function shopRender(screen, shop, gameState) {
  const eco = gameState.economy;
  if (!eco) return;

  const sw = screen.width;
  const sh = screen.height;

  // Panel dimensions — centered box
  const panelW = Math.min(60, sw - 4);
  const panelH = Math.min(24, sh - 4);
  const px = Math.floor((sw - panelW) / 2);
  const py = Math.floor((sh - panelH) / 2);

  // Clear panel area
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
  const title = shop.type === 'market'
    ? ` Market - ${shop.portName} `
    : ` Shipwright - ${shop.portName} `;
  _writeText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

  // Gold display
  const goldStr = ` ${eco.gold} rigsdaler `;
  _writeText(screen, py + 1, px + panelW - goldStr.length - 1, goldStr, GOLD_COLOR);

  // Cargo display
  const cargoStr = ` Cargo: ${cargoCount(eco)}/${eco.cargoMax} `;
  _writeText(screen, py + 1, px + 2, cargoStr, HEADER);

  if (shop.type === 'market') {
    _renderMarket(screen, shop, eco, px, py, panelW, panelH);
  } else {
    _renderShipwright(screen, shop, eco, gameState, px, py, panelW, panelH);
  }

  // Message
  if (shop.message) {
    _writeText(screen, py + panelH - 3, px + 3, shop.message, TITLE);
  }

  // Help line
  const help = shop.type === 'market'
    ? ' \u2190\u2192:Buy/Sell  \u2191\u2193:Select  Space:Confirm  Enter/Q:Close '
    : ' \u2191\u2193:Select  Space:Purchase  Enter/Q:Close ';
  _writeText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP_COLOR);
}

function _renderMarket(screen, shop, eco, px, py, panelW, panelH) {
  // Tabs
  const buyLabel = '  BUY  ';
  const sellLabel = ' SELL  ';
  const tabY = py + 2;
  _writeText(screen, tabY, px + 3, buyLabel, shop.tab === 'buy' ? TAB_ACTIVE : TAB_INACTIVE);
  _writeText(screen, tabY, px + 3 + buyLabel.length + 1, sellLabel, shop.tab === 'sell' ? TAB_ACTIVE : TAB_INACTIVE);

  // Column headers
  const headerY = py + 4;
  const colName = px + 3;
  const colPrice = px + 22;
  const colOwned = px + 34;
  _writeText(screen, headerY, colName, 'Good', HEADER);
  _writeText(screen, headerY, colPrice, shop.tab === 'buy' ? 'Buy Price' : 'Sell Price', HEADER);
  _writeText(screen, headerY, colOwned, 'Owned', HEADER);

  // Separator
  const sepY = headerY + 1;
  for (let x = px + 2; x < px + panelW - 2; x++) {
    const row = screen.lines[sepY];
    if (row && x < row.length) {
      row[x][0] = BORDER;
      row[x][1] = '\u2500'; // ─
    }
  }

  // Goods list
  for (let i = 0; i < GOODS.length; i++) {
    const rowY = headerY + 2 + i;
    if (rowY >= py + panelH - 3) break;

    const good = GOODS[i];
    const prices = shop.prices[good.id];
    const price = shop.tab === 'buy' ? prices.buy : prices.sell;
    const owned = eco.cargo[good.id] || 0;
    const isSelected = i === shop.cursor;

    const rowAttr = isSelected ? ROW_SELECTED : ROW_NORMAL;
    const canDo = shop.tab === 'buy'
      ? (eco.gold >= price && cargoCount(eco) < eco.cargoMax)
      : (owned > 0);
    const priceAttr = isSelected ? ROW_SELECTED : (canDo ? GOOD_COLOR : CANT_AFFORD);

    // Highlight row background if selected
    if (isSelected) {
      const row = screen.lines[rowY];
      if (row) {
        for (let x = px + 2; x < px + panelW - 2 && x < row.length; x++) {
          row[x][0] = ROW_SELECTED;
          row[x][1] = ' ';
        }
      }
    }

    const pointer = isSelected ? '\u25B6 ' : '  '; // ▶
    _writeText(screen, rowY, colName - 2, pointer, rowAttr);
    _writeText(screen, rowY, colName, good.name, rowAttr);
    _writeText(screen, rowY, colPrice, `${price} rds`, priceAttr);
    _writeText(screen, rowY, colOwned, `${owned}`, rowAttr);
  }
}

function _renderShipwright(screen, shop, eco, gameState, px, py, panelW, panelH) {
  const ship = gameState.ship;

  // Ship status
  const statusY = py + 2;
  _writeText(screen, statusY, px + 3, `${ship.name}  Hull: ${ship.hull}/${ship.maxHull}`, HEADER);

  // Column headers
  const headerY = py + 4;
  const colName = px + 3;
  const colDesc = px + 22;
  const colCost = px + 44;
  _writeText(screen, headerY, colName, 'Upgrade', HEADER);
  _writeText(screen, headerY, colDesc, 'Effect', HEADER);
  _writeText(screen, headerY, colCost, 'Cost', HEADER);

  // Separator
  const sepY = headerY + 1;
  for (let x = px + 2; x < px + panelW - 2; x++) {
    const row = screen.lines[sepY];
    if (row && x < row.length) {
      row[x][0] = BORDER;
      row[x][1] = '\u2500';
    }
  }

  // Upgrades list
  for (let i = 0; i < UPGRADES.length; i++) {
    const rowY = headerY + 2 + i;
    if (rowY >= py + panelH - 3) break;

    const upg = UPGRADES[i];
    const isSelected = i === shop.cursor;
    const canAfford = eco.gold >= upg.cost;
    const rowAttr = isSelected ? ROW_SELECTED : ROW_NORMAL;
    const costAttr = isSelected ? ROW_SELECTED : (canAfford ? GOOD_COLOR : CANT_AFFORD);

    if (isSelected) {
      const row = screen.lines[rowY];
      if (row) {
        for (let x = px + 2; x < px + panelW - 2 && x < row.length; x++) {
          row[x][0] = ROW_SELECTED;
          row[x][1] = ' ';
        }
      }
    }

    const pointer = isSelected ? '\u25B6 ' : '  ';
    _writeText(screen, rowY, colName - 2, pointer, rowAttr);
    _writeText(screen, rowY, colName, upg.name, rowAttr);
    _writeText(screen, rowY, colDesc, upg.desc, rowAttr);
    _writeText(screen, rowY, colCost, `${upg.cost} rds`, costAttr);
  }
}

function _drawBorder(screen, px, py, w, h) {
  // Top
  _writeChar(screen, py, px, '\u250C', BORDER); // ┌
  for (let x = px + 1; x < px + w - 1; x++) _writeChar(screen, py, x, '\u2500', BORDER); // ─
  _writeChar(screen, py, px + w - 1, '\u2510', BORDER); // ┐

  // Bottom
  _writeChar(screen, py + h - 1, px, '\u2514', BORDER); // └
  for (let x = px + 1; x < px + w - 1; x++) _writeChar(screen, py + h - 1, x, '\u2500', BORDER);
  _writeChar(screen, py + h - 1, px + w - 1, '\u2518', BORDER); // ┘

  // Sides
  for (let y = py + 1; y < py + h - 1; y++) {
    _writeChar(screen, y, px, '\u2502', BORDER); // │
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
  createShopState,
  shopHandleInput,
  shopUpdate,
  shopRender,
};
