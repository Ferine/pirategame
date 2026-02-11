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

function stampPorts(tiles) {
  const placed = [];

  for (const port of PORTS) {
    let bestX = port.x;
    let bestY = port.y;
    let found = false;

    // Spiral search for nearest BEACH or SHALLOW tile
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
    placed.push({ ...port, actualX: bestX, actualY: bestY });
  }

  return placed;
}

const ISLAND_NAMES = [
  'Raven Rock', "Serpent's Cove", 'Skull Isle', 'Driftwood Key',
  'Tempest Reef', 'Bone Strand', 'Viper Holm', 'Iron Shoal',
];

function stampIslands(tiles, placedPorts, seed) {
  const alea = require('alea');
  const prng = alea(seed + '-islands');
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
