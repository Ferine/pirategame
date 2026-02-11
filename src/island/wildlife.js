'use strict';

const { sattr } = require('../render/tiles');
const { IT, ISLAND_TILES } = require('./island-map');

// Wildlife types: char, color attr, terrain preference, behavior, damage
const WILDLIFE_TYPES = [
  {
    type: 'crab',
    ch: 'c',
    attr: sattr(160, 0),  // red
    terrain: IT.BEACH,
    behavior: 'wander',    // random walk
    aggroRange: 0,
    damage: 5,
    moveInterval: 1.2,
  },
  {
    type: 'snake',
    ch: 's',
    attr: sattr(34, 0),   // green
    terrain: IT.JUNGLE,
    behavior: 'aggressive', // chases within range
    aggroRange: 5,
    damage: 10,
    moveInterval: 0.8,
  },
  {
    type: 'boar',
    ch: 'B',
    attr: sattr(94, 0),   // brown
    terrain: IT.JUNGLE,
    behavior: 'charge',    // charges in straight lines
    aggroRange: 6,
    damage: 15,
    moveInterval: 0.6,
  },
];

/**
 * Spawn wildlife entities on the island map.
 * @param {{ tiles, width, height }} islandMap
 * @returns {Array<{ type, ch, attr, x, y, damage, moveTimer, moveInterval, behavior, aggroRange, alive }>}
 */
function spawnWildlife(islandMap) {
  const { tiles, width, height } = islandMap;
  const entities = [];
  const count = 3 + Math.floor(Math.random() * 3); // 3-5

  // Gather candidate positions by terrain
  const beachSpots = [];
  const jungleSpots = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x];
      if (t === IT.BEACH) beachSpots.push({ x, y });
      if (t === IT.JUNGLE) jungleSpots.push({ x, y });
    }
  }

  for (let i = 0; i < count; i++) {
    const def = WILDLIFE_TYPES[Math.floor(Math.random() * WILDLIFE_TYPES.length)];
    const spots = def.terrain === IT.BEACH ? beachSpots : jungleSpots;
    if (spots.length === 0) continue;

    const spot = spots[Math.floor(Math.random() * spots.length)];
    entities.push({
      type: def.type,
      ch: def.ch,
      attr: def.attr,
      x: spot.x,
      y: spot.y,
      damage: def.damage,
      moveTimer: Math.random() * def.moveInterval,
      moveInterval: def.moveInterval,
      behavior: def.behavior,
      aggroRange: def.aggroRange,
      alive: true,
      chargeDir: null,  // for boar charge
    });
  }

  return entities;
}

/**
 * Update a wildlife entity.
 * @returns {boolean} true if entity contacted the player (deal damage)
 */
function updateWildlife(entity, islandMap, playerX, playerY, dt) {
  if (!entity.alive) return false;

  entity.moveTimer -= dt;
  if (entity.moveTimer > 0) return false;
  entity.moveTimer = entity.moveInterval;

  const { tiles, width, height } = islandMap;
  const dx = playerX - entity.x;
  const dy = playerY - entity.y;
  const dist = Math.abs(dx) + Math.abs(dy);

  let nx = entity.x;
  let ny = entity.y;

  if (entity.behavior === 'wander') {
    // Random movement
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const dir = dirs[Math.floor(Math.random() * 4)];
    nx = entity.x + dir[0];
    ny = entity.y + dir[1];
  } else if (entity.behavior === 'aggressive') {
    // Chase player if within range
    if (dist <= entity.aggroRange && dist > 0) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        nx = entity.x + Math.sign(dx);
      } else {
        ny = entity.y + Math.sign(dy);
      }
    } else {
      // Wander
      const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
      const dir = dirs[Math.floor(Math.random() * 4)];
      nx = entity.x + dir[0];
      ny = entity.y + dir[1];
    }
  } else if (entity.behavior === 'charge') {
    // Boar: if sees player, charges in a straight line
    if (entity.chargeDir) {
      // Continue charge
      nx = entity.x + entity.chargeDir.dx;
      ny = entity.y + entity.chargeDir.dy;
      // Check if we can continue charging
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        entity.chargeDir = null;
        return false;
      }
      const destTile = tiles[ny * width + nx];
      if (!ISLAND_TILES[destTile] || !ISLAND_TILES[destTile].passable) {
        entity.chargeDir = null;
        return false;
      }
    } else if (dist <= entity.aggroRange && dist > 0) {
      // Start a charge in cardinal direction toward player
      if (Math.abs(dx) >= Math.abs(dy)) {
        entity.chargeDir = { dx: Math.sign(dx), dy: 0 };
      } else {
        entity.chargeDir = { dx: 0, dy: Math.sign(dy) };
      }
      nx = entity.x + entity.chargeDir.dx;
      ny = entity.y + entity.chargeDir.dy;
    } else {
      // Wander slowly
      const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
      const dir = dirs[Math.floor(Math.random() * 4)];
      nx = entity.x + dir[0];
      ny = entity.y + dir[1];
    }
  }

  // Bounds and passability check
  if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
  const destTile = tiles[ny * width + nx];
  if (!ISLAND_TILES[destTile] || !ISLAND_TILES[destTile].passable) {
    if (entity.chargeDir) entity.chargeDir = null;
    return false;
  }

  // Check if we'd step on the player
  if (nx === playerX && ny === playerY) {
    entity.alive = false;
    return true; // contact!
  }

  entity.x = nx;
  entity.y = ny;
  return false;
}

module.exports = {
  WILDLIFE_TYPES,
  spawnWildlife,
  updateWildlife,
};
