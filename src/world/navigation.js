'use strict';

const { TILE, TILE_DEFS } = require('../render/tiles');

const NEIGHBORS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
];

function _isSafeWaterTile(map, x, y) {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
  const tile = map.tiles[y * map.width + x];
  const def = TILE_DEFS[tile];
  if (!def || !def.passable) return false;
  if (tile === TILE.PORT || tile === TILE.ISLAND) return false;

  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
    const ntile = map.tiles[ny * map.width + nx];
    const ndef = TILE_DEFS[ntile];
    if (ndef && ndef.passable && ntile !== TILE.PORT && ntile !== TILE.ISLAND) {
      return true;
    }
  }

  return false;
}

function _setShipPos(ship, map, x, y) {
  ship.x = Math.max(0, Math.min(map.width - 1, x));
  ship.y = Math.max(0, Math.min(map.height - 1, y));
  ship.moveAccum = 0;
}

function relocateShipToSafeWater(gameState, offsetY) {
  if (!gameState || !gameState.map || !gameState.ship) return false;

  const map = gameState.map;
  const ship = gameState.ship;
  const preferredX = Math.max(0, Math.min(map.width - 1, ship.x));
  const preferredY = Math.max(0, Math.min(map.height - 1, ship.y + (offsetY || 0)));

  if (_isSafeWaterTile(map, preferredX, preferredY)) {
    _setShipPos(ship, map, preferredX, preferredY);
    return true;
  }

  const maxRadius = Math.max(map.width, map.height);
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = preferredX + dx;
        const y = preferredY + dy;
        if (_isSafeWaterTile(map, x, y)) {
          _setShipPos(ship, map, x, y);
          return true;
        }
      }
    }
  }

  // Last resort: keep original position clamped.
  _setShipPos(ship, map, preferredX, preferredY);
  return false;
}

module.exports = { relocateShipToSafeWater };
