'use strict';

const { sattr } = require('../render/tiles');
const { IT, ISLAND_TILES } = require('./island-map');

const RIVAL_CH = 'P';
const RIVAL_ATTR = sattr(196, 0); // bright red
const RIVAL_ANGRY_ATTR = sattr(196, 52); // bright red on dark red bg

const RIVAL_NAMES = [
  'Blackbeard', 'Red Morgan', 'One-Eyed Sven', 'Iron Helga',
  'Cutlass Pete', 'Storm Ingrid', 'Dead-Eye Jan', 'Barnacle Olaf',
];

/**
 * Spawn a rival pirate on a far beach tile.
 * @param {{ tiles, width, height, spawn }} islandMap
 * @returns {{ x, y, name, moveTimer, reachedX, angry, alive, ch, attr }}
 */
function spawnRival(islandMap) {
  const { tiles, width, height, spawn } = islandMap;

  // Find beach tiles far from player spawn
  let bestX = 0;
  let bestY = 0;
  let bestDist = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y * width + x] !== IT.BEACH) continue;
      const dx = x - spawn.x;
      const dy = y - spawn.y;
      const dist = dx * dx + dy * dy;
      if (dist > bestDist) {
        bestDist = dist;
        bestX = x;
        bestY = y;
      }
    }
  }

  return {
    x: bestX,
    y: bestY,
    name: RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)],
    moveTimer: 0,
    moveInterval: 1.0,
    reachedX: false,
    angry: false,
    alive: true,
    ch: RIVAL_CH,
    attr: RIVAL_ATTR,
  };
}

/**
 * Update the rival pirate.
 * @returns {boolean} true if rival contacted the player (deal damage)
 */
function updateRival(rival, islandMap, playerX, playerY, dt, treasureFound) {
  if (!rival.alive) return false;

  rival.moveTimer -= dt;
  if (rival.moveTimer > 0) return false;
  rival.moveTimer = rival.moveInterval;

  const { tiles, width, height } = islandMap;

  let targetX, targetY;

  if (rival.angry) {
    // Chase the player
    targetX = playerX;
    targetY = playerY;
    rival.attr = RIVAL_ANGRY_ATTR;
    rival.moveInterval = 0.6; // faster when angry
  } else if (!rival.reachedX) {
    // Find the treasure X tile to path toward
    let txX = -1, txY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y * width + x] === IT.TREASURE_X) {
          txX = x; txY = y;
        }
      }
    }
    if (txX < 0) {
      // No treasure — just wander
      return false;
    }
    targetX = txX;
    targetY = txY;
  } else {
    // Already reached X — just idle
    return false;
  }

  // Greedy pathfind toward target
  const dx = targetX - rival.x;
  const dy = targetY - rival.y;

  if (dx === 0 && dy === 0) {
    if (!rival.angry) {
      rival.reachedX = true;
    }
    return false;
  }

  // Try moving in the better direction first
  const candidates = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    candidates.push({ nx: rival.x + Math.sign(dx), ny: rival.y });
    candidates.push({ nx: rival.x, ny: rival.y + Math.sign(dy || 1) });
  } else {
    candidates.push({ nx: rival.x, ny: rival.y + Math.sign(dy) });
    candidates.push({ nx: rival.x + Math.sign(dx || 1), ny: rival.y });
  }

  for (const { nx, ny } of candidates) {
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

    // Check player contact
    if (nx === playerX && ny === playerY) {
      if (rival.angry) {
        rival.alive = false;
        return true; // deal damage
      }
      continue; // don't walk onto player if not angry
    }

    const destTile = tiles[ny * width + nx];
    const def = ISLAND_TILES[destTile];
    if (def && def.passable) {
      rival.x = nx;
      rival.y = ny;

      // Check if arrived at treasure X
      if (!rival.angry && destTile === IT.TREASURE_X) {
        rival.reachedX = true;
      }
      return false;
    }
  }

  return false;
}

module.exports = {
  spawnRival,
  updateRival,
  RIVAL_CH,
  RIVAL_ATTR,
};
