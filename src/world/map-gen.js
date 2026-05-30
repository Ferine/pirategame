'use strict';

const { TILE } = require('../render/tiles');
const { PORTS } = require('./ports');

const MAP_WIDTH = 300;
const MAP_HEIGHT = 200;

function channelMask(nx, ny) {
  // S-curve center of channel
  const centerX = 0.5 + 0.05 * Math.sin(ny * Math.PI);

  // Narrow at Helsingor (ny ≈ 0.45)
  const narrowWidth = 0.06;
  const wideWidth = 0.28;
  const narrowFactor = Math.exp(-Math.pow((ny - 0.45) / 0.15, 2));
  const halfWidth = wideWidth - (wideWidth - narrowWidth) * narrowFactor;

  const distFromCenter = Math.abs(nx - centerX) / halfWidth;

  if (distFromCenter >= 1.0) return 0.0;
  return 1.0 - distFromCenter * distFromCenter;
}

function classify(elevation) {
  if (elevation < 0.12) return TILE.DEEP_OCEAN;
  if (elevation < 0.22) return TILE.OCEAN;
  if (elevation < 0.30) return TILE.SHALLOW;
  if (elevation < 0.35) return TILE.BEACH;
  if (elevation < 0.55) return TILE.GRASS;
  if (elevation < 0.70) return TILE.FOREST;
  if (elevation < 0.85) return TILE.HILL;
  return TILE.MOUNTAIN;
}

// Tiles a ship can sail through.
const PASSABLE_TILES = new Set([
  TILE.DEEP_OCEAN, TILE.OCEAN, TILE.SHALLOW, TILE.PORT, TILE.ISLAND,
]);
const LAND_TILES = new Set([
  TILE.BEACH, TILE.GRASS, TILE.FOREST, TILE.HILL, TILE.MOUNTAIN,
]);

// Player always spawns here (see src/index.js); reachability is defined as
// "can the player's ship sail here from the spawn."
const SPAWN_X = 150;
const SPAWN_Y = 100;

// 8-connected flood fill over passable water from the spawn basin.
function computeReachable(tiles) {
  const seen = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  const start = SPAWN_Y * MAP_WIDTH + SPAWN_X;
  const queue = [];
  if (PASSABLE_TILES.has(tiles[start])) { seen[start] = 1; queue.push(start); }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % MAP_WIDTH;
    const y = (i / MAP_WIDTH) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
        const j = ny * MAP_WIDTH + nx;
        if (!seen[j] && PASSABLE_TILES.has(tiles[j])) { seen[j] = 1; queue.push(j); }
      }
    }
  }
  return seen;
}

// Nearest already-reachable passable-water tile to (sx, sy), spiral search.
function nearestReachableWater(tiles, seen, sx, sy, maxRadius) {
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = sx + dx, y = sy + dy;
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;
        const i = y * MAP_WIDTH + x;
        if (seen[i] && PASSABLE_TILES.has(tiles[i])) return { x, y };
      }
    }
  }
  return null;
}

// Carve a 1-tile SHALLOW channel along a straight line, converting land to
// water so an enclosed port/island connects to the open sea. Existing water
// (and PORT/ISLAND markers) are left untouched.
function carveChannel(tiles, x0, y0, x1, y1) {
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (guard++ < MAP_WIDTH + MAP_HEIGHT) {
    const i = y * MAP_WIDTH + x;
    if (LAND_TILES.has(tiles[i])) tiles[i] = TILE.SHALLOW;
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function stampPorts(tiles) {
  const placed = [];

  for (const port of PORTS) {
    let bestX = port.x;
    let bestY = port.y;
    let found = false;

    // Spiral search for nearest BEACH or SHALLOW tile near the intended spot.
    for (let radius = 0; radius <= 15 && !found; radius++) {
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const px = port.x + dx;
          const py = port.y + dy;
          if (px < 0 || px >= MAP_WIDTH || py < 0 || py >= MAP_HEIGHT) continue;
          const t = tiles[py * MAP_WIDTH + px];
          if (t === TILE.BEACH || t === TILE.SHALLOW) {
            bestX = px;
            bestY = py;
            found = true;
          }
        }
      }
    }

    tiles[bestY * MAP_WIDTH + bestX] = TILE.PORT;

    // Guarantee the port is reachable by ship. If it landed in an enclosed
    // pocket (e.g. a fjord, or the pinched Helsingor narrows), carve a channel
    // to the nearest reachable water so the player — and the campaign, which
    // gates Act 4 on reaching Helsingor — can always get there.
    let seen = computeReachable(tiles);
    if (!seen[bestY * MAP_WIDTH + bestX]) {
      const target = nearestReachableWater(tiles, seen, bestX, bestY, 60);
      if (target) carveChannel(tiles, bestX, bestY, target.x, target.y);
    }

    placed.push({ ...port, actualX: bestX, actualY: bestY });
  }

  return placed;
}

const ISLAND_NAMES = [
  'Raven Rock', "Serpent's Cove", 'Skull Isle', 'Driftwood Key',
  'Tempest Reef', 'Bone Strand', 'Viper Holm', 'Iron Shoal',
];

// True if converting (x,y) to an ISLAND tile would be reachable by ship —
// i.e. it borders already-reachable passable water.
function hasReachableNeighbor(tiles, seen, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
      const i = ny * MAP_WIDTH + nx;
      if (seen[i] && PASSABLE_TILES.has(tiles[i])) return true;
    }
  }
  return false;
}

function stampIslands(tiles, placedPorts, seed) {
  const alea = require('alea');
  const prng = alea(seed + '-islands');
  const seen = computeReachable(tiles);
  const islands = [];
  const minPortDist = 20;
  const minIslandDist = 25;
  let attempts = 0;

  while (islands.length < 6 && attempts < 500) {
    attempts++;
    const x = 10 + Math.floor(prng() * (MAP_WIDTH - 20));
    const y = 10 + Math.floor(prng() * (MAP_HEIGHT - 20));
    const t = tiles[y * MAP_WIDTH + x];

    // Must be on shallow or beach water
    if (t !== TILE.SHALLOW && t !== TILE.BEACH) continue;

    // Must be reachable by ship (treasure maps target these — a stranded
    // island would be a dead, uncompletable objective).
    if (!hasReachableNeighbor(tiles, seen, x, y)) continue;

    // Must be far from ports
    let tooClose = false;
    for (const port of placedPorts) {
      const dx = port.actualX - x;
      const dy = port.actualY - y;
      if (Math.sqrt(dx * dx + dy * dy) < minPortDist) { tooClose = true; break; }
    }
    if (tooClose) continue;

    // Must be far from other islands
    for (const isl of islands) {
      const dx = isl.actualX - x;
      const dy = isl.actualY - y;
      if (Math.sqrt(dx * dx + dy * dy) < minIslandDist) { tooClose = true; break; }
    }
    if (tooClose) continue;

    tiles[y * MAP_WIDTH + x] = TILE.ISLAND;
    islands.push({
      id: islands.length,
      name: ISLAND_NAMES[islands.length],
      x, y,
      actualX: x,
      actualY: y,
      seed: seed + '-island-' + islands.length,
    });
  }

  return islands;
}

async function generateMap(seed) {
  // Dynamic import for ESM simplex-noise
  const { createNoise2D } = await import('simplex-noise');
  const alea = require('alea');

  const prng = alea(seed);
  const noise2D = createNoise2D(prng);

  const prng2 = alea(seed + '-detail');
  const detailNoise = createNoise2D(prng2);

  const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const ny = y / MAP_HEIGHT;
    for (let x = 0; x < MAP_WIDTH; x++) {
      const nx = x / MAP_WIDTH;

      // Multi-octave noise (3 octaves)
      let elevation = 0;
      elevation += 1.0 * noise2D(nx * 4, ny * 4);
      elevation += 0.5 * noise2D(nx * 8, ny * 8);
      elevation += 0.25 * noise2D(nx * 16, ny * 16);
      elevation /= 1.75;

      // Shift from [-1,1] to [0,1]
      elevation = (elevation + 1) / 2;

      // Apply channel mask — pulls elevation toward water
      const mask = channelMask(nx, ny);
      elevation = elevation * (1 - mask * 0.85);

      // Coastline detail
      elevation += detailNoise(nx * 32, ny * 32) * 0.05;

      // Clamp
      elevation = Math.max(0, Math.min(1, elevation));

      tiles[y * MAP_WIDTH + x] = classify(elevation);
    }
  }

  const placedPorts = stampPorts(tiles);
  const placedIslands = stampIslands(tiles, placedPorts, seed);

  return { tiles, width: MAP_WIDTH, height: MAP_HEIGHT, ports: placedPorts, islands: placedIslands };
}

module.exports = { generateMap, MAP_WIDTH, MAP_HEIGHT };
