'use strict';

const { sattr } = require('../render/tiles');

// Island tile types
const IT = {
  WATER:          0,
  BEACH:          1,
  JUNGLE:         2,
  ROCK:           3,
  CAVE_FLOOR:     4,
  CAVE_WALL:      5,
  CAVE_ENTRY:     6,
  RUINS_FLOOR:    7,
  RUINS_WALL:     8,
  BOULDER:        9,
  LOCKED_DOOR:   10,
  KEY_SPOT:      11,
  TORCH_HOLDER:  12,
  TREASURE_X:    13,
  BOAT:          14,
  PRESSURE_PLATE:15,
};

// Tile rendering definitions (mirrors TOWN_TILES pattern)
const ISLAND_TILES = [
  // 0: WATER
  { ch: '\u2248', attr: sattr(24, 17),  passable: false, transparent: true,  name: 'water' },
  // 1: BEACH
  { ch: '.',      attr: sattr(186, 58), passable: true,  transparent: true,  name: 'beach' },
  // 2: JUNGLE
  { ch: '\u2663', attr: sattr(28, 22),  passable: true,  transparent: false, name: 'jungle' },
  // 3: ROCK
  { ch: '#',      attr: sattr(240, 236),passable: false, transparent: false, name: 'rock' },
  // 4: CAVE_FLOOR
  { ch: '\u00B7', attr: sattr(240, 234),passable: true,  transparent: true,  name: 'cave floor' },
  // 5: CAVE_WALL
  { ch: '\u2588', attr: sattr(237, 234),passable: false, transparent: false, name: 'cave wall' },
  // 6: CAVE_ENTRY
  { ch: '\u2593', attr: sattr(240, 234),passable: true,  transparent: true,  name: 'cave entrance' },
  // 7: RUINS_FLOOR
  { ch: '\u00B7', attr: sattr(101, 58), passable: true,  transparent: true,  name: 'ruins floor' },
  // 8: RUINS_WALL
  { ch: '\u2593', attr: sattr(101, 236),passable: false, transparent: false, name: 'ruins wall' },
  // 9: BOULDER
  { ch: 'O',      attr: sattr(244, 236),passable: false, transparent: false, name: 'boulder' },
  // 10: LOCKED_DOOR
  { ch: '\u256C', attr: sattr(130, 236),passable: false, transparent: false, name: 'locked door' },
  // 11: KEY_SPOT
  { ch: '\u2667', attr: sattr(226, 22), passable: true,  transparent: true,  name: 'key' },
  // 12: TORCH_HOLDER
  { ch: '\u2020', attr: sattr(208, 236),passable: false, transparent: true,  name: 'torch' },
  // 13: TREASURE_X
  { ch: 'X',      attr: sattr(226, 58), passable: true,  transparent: true,  name: 'treasure' },
  // 14: BOAT
  { ch: '\u2302', attr: sattr(208, 17), passable: true,  transparent: true,  name: 'boat' },
  // 15: PRESSURE_PLATE
  { ch: '\u25A1', attr: sattr(250, 234),passable: true,  transparent: true,  name: 'pressure plate' },
];

const ISLAND_W = 50;
const ISLAND_H = 35;

/**
 * Generate an island map from a seed.
 * @param {string} seed - Deterministic seed for alea PRNG
 * @param {boolean} hasTreasureMap - Whether to place a TREASURE_X tile
 * @returns {{ tiles, width, height, spawn, puzzleState }}
 */
function generateIslandMap(seed, hasTreasureMap) {
  const alea = require('alea');
  const prng = alea(seed);
  const w = ISLAND_W;
  const h = ISLAND_H;
  const tiles = new Uint8Array(w * h);

  // Center of island
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const maxR = Math.min(cx, cy) - 2;

  // --- Step 1: Radial falloff → water/beach/jungle/rock ---
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      // Elliptical (wider than tall)
      const dist = Math.sqrt((dx * dx) / (1.3 * 1.3) + dy * dy);
      // Add noise for organic coastline
      const noise = (prng() - 0.5) * 3;
      const r = dist + noise;

      if (r > maxR - 1) {
        tiles[y * w + x] = IT.WATER;
      } else if (r > maxR - 3) {
        tiles[y * w + x] = IT.BEACH;
      } else if (r > maxR - 10) {
        tiles[y * w + x] = IT.JUNGLE;
      } else {
        // Inner area: mix of rock and jungle
        tiles[y * w + x] = prng() < 0.4 ? IT.ROCK : IT.JUNGLE;
      }
    }
  }

  // --- Step 2: Carve cave complex in rock area ---
  // Find a cluster of rock tiles in the upper-center area
  const caveX = cx - 3 + Math.floor(prng() * 6);
  const caveY = Math.floor(cy * 0.5) + Math.floor(prng() * 4);
  const caveW = 8 + Math.floor(prng() * 4);
  const caveH = 5 + Math.floor(prng() * 3);

  // Stamp cave walls
  for (let y = caveY; y < caveY + caveH && y < h - 1; y++) {
    for (let x = caveX; x < caveX + caveW && x < w - 1; x++) {
      if (x < 1 || y < 1) continue;
      if (y === caveY || y === caveY + caveH - 1 || x === caveX || x === caveX + caveW - 1) {
        tiles[y * w + x] = IT.CAVE_WALL;
      } else {
        tiles[y * w + x] = IT.CAVE_FLOOR;
      }
    }
  }

  // Cave entry — bottom wall center
  const caveEntryX = caveX + Math.floor(caveW / 2);
  const caveEntryY = caveY + caveH - 1;
  if (caveEntryX > 0 && caveEntryX < w && caveEntryY > 0 && caveEntryY < h) {
    tiles[caveEntryY * w + caveEntryX] = IT.CAVE_ENTRY;
    // Clear path from cave entry to jungle
    for (let y = caveEntryY + 1; y < caveEntryY + 4 && y < h; y++) {
      const idx = y * w + caveEntryX;
      if (tiles[idx] === IT.ROCK) tiles[idx] = IT.JUNGLE;
    }
  }

  // --- Step 3: Carve ruins area in jungle ---
  const ruinsX = cx + 4 + Math.floor(prng() * 5);
  const ruinsY = cy + 2 + Math.floor(prng() * 4);
  const ruinsW = 6 + Math.floor(prng() * 3);
  const ruinsH = 5 + Math.floor(prng() * 2);

  for (let y = ruinsY; y < ruinsY + ruinsH && y < h - 2; y++) {
    for (let x = ruinsX; x < ruinsX + ruinsW && x < w - 2; x++) {
      if (x < 1 || y < 1) continue;
      if (y === ruinsY || y === ruinsY + ruinsH - 1 || x === ruinsX || x === ruinsX + ruinsW - 1) {
        // Crumbling walls — some missing
        if (prng() < 0.7) {
          tiles[y * w + x] = IT.RUINS_WALL;
        }
      } else {
        tiles[y * w + x] = IT.RUINS_FLOOR;
      }
    }
  }

  // --- Step 4: Puzzle elements ---
  const puzzleState = { hasKey: false, torchLit: false, platesPressed: 0, platesNeeded: 0 };

  // Place boulders and pressure plates inside cave
  const innerCaveFloor = [];
  for (let y = caveY + 1; y < caveY + caveH - 1; y++) {
    for (let x = caveX + 1; x < caveX + caveW - 1; x++) {
      if (tiles[y * w + x] === IT.CAVE_FLOOR) {
        innerCaveFloor.push({ x, y });
      }
    }
  }

  // Shuffle helper
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  shuffle(innerCaveFloor);

  // Place 1-2 boulders
  const numBoulders = 1 + Math.floor(prng() * 2);
  for (let i = 0; i < numBoulders && i < innerCaveFloor.length; i++) {
    const { x, y } = innerCaveFloor[i];
    tiles[y * w + x] = IT.BOULDER;
  }

  // Place pressure plates (same count as boulders)
  puzzleState.platesNeeded = numBoulders;
  for (let i = numBoulders; i < numBoulders * 2 && i < innerCaveFloor.length; i++) {
    const { x, y } = innerCaveFloor[i];
    tiles[y * w + x] = IT.PRESSURE_PLATE;
  }

  // Place torch holder on cave wall (inside)
  if (caveY + 1 < h && caveX + 2 < w) {
    tiles[(caveY + 1) * w + caveX + 2] = IT.TORCH_HOLDER;
  }

  // Place key in ruins
  const ruinsFloor = [];
  for (let y = ruinsY + 1; y < ruinsY + ruinsH - 1; y++) {
    for (let x = ruinsX + 1; x < ruinsX + ruinsW - 1; x++) {
      if (tiles[y * w + x] === IT.RUINS_FLOOR) {
        ruinsFloor.push({ x, y });
      }
    }
  }
  if (ruinsFloor.length > 0) {
    const keySpot = ruinsFloor[Math.floor(prng() * ruinsFloor.length)];
    tiles[keySpot.y * w + keySpot.x] = IT.KEY_SPOT;
  }

  // Place locked door at back of cave (top wall interior)
  const lockedDoorX = caveX + Math.floor(caveW / 2);
  const lockedDoorY = caveY;
  if (lockedDoorX > 0 && lockedDoorX < w && lockedDoorY > 0 && lockedDoorY < h) {
    tiles[lockedDoorY * w + lockedDoorX] = IT.LOCKED_DOOR;
    // Small treasure room behind locked door
    if (lockedDoorY - 1 >= 0) {
      tiles[(lockedDoorY - 1) * w + lockedDoorX] = IT.CAVE_FLOOR;
      if (lockedDoorX - 1 >= 0) tiles[(lockedDoorY - 1) * w + lockedDoorX - 1] = IT.CAVE_WALL;
      if (lockedDoorX + 1 < w) tiles[(lockedDoorY - 1) * w + lockedDoorX + 1] = IT.CAVE_WALL;
      if (lockedDoorY - 2 >= 0) {
        tiles[(lockedDoorY - 2) * w + lockedDoorX] = IT.CAVE_WALL;
        if (lockedDoorX - 1 >= 0) tiles[(lockedDoorY - 2) * w + lockedDoorX - 1] = IT.CAVE_WALL;
        if (lockedDoorX + 1 < w) tiles[(lockedDoorY - 2) * w + lockedDoorX + 1] = IT.CAVE_WALL;
      }

      // Place treasure behind locked door if has map
      if (hasTreasureMap) {
        tiles[(lockedDoorY - 1) * w + lockedDoorX] = IT.TREASURE_X;
      }
    }
  }

  // --- Step 5: Boat spawn on beach ---
  // Find a beach tile at the bottom half of the island
  let spawnX = cx;
  let spawnY = h - 5;
  for (let y = h - 1; y >= Math.floor(h / 2); y--) {
    for (let x = Math.floor(w / 4); x < Math.floor(3 * w / 4); x++) {
      if (tiles[y * w + x] === IT.BEACH) {
        spawnX = x;
        spawnY = y;
        y = -1; // break outer
        break;
      }
    }
  }

  tiles[spawnY * w + spawnX] = IT.BOAT;

  // Make sure adjacent tile is walkable for spawn
  const playerSpawnX = spawnX;
  const playerSpawnY = Math.max(0, spawnY - 1);
  if (tiles[playerSpawnY * w + playerSpawnX] === IT.WATER || tiles[playerSpawnY * w + playerSpawnX] === IT.ROCK) {
    tiles[playerSpawnY * w + playerSpawnX] = IT.BEACH;
  }

  return {
    tiles,
    width: w,
    height: h,
    spawn: { x: playerSpawnX, y: playerSpawnY },
    boatPos: { x: spawnX, y: spawnY },
    puzzleState,
  };
}

module.exports = {
  IT,
  ISLAND_TILES,
  ISLAND_W,
  ISLAND_H,
  generateIslandMap,
};
