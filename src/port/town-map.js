'use strict';

const { sattr } = require('../render/tiles');
const { getProfile } = require('./port-profiles');

// Town tile types
const T = {
  WATER:     0,
  DOCK:      1,
  ROAD:      2,
  WALL:      3,
  FLOOR:     4,
  DOOR:      5,
  GRASS:     6,
  MARKET:    7,  // market stall floor
  TAVERN:    8,  // tavern floor
  SHIPWRIGHT: 9,
  HARBOR_MASTER: 10,
  CHURCH:    11,
  LANTERN:   12,
  CRATE:     13,
  BARREL:    14,
  SHIP_TILE: 15, // player's ship at dock — exit to overworld
  FISH_RACK: 16,
  WELL:      17,
  CARGO_PILE: 18,
  FOUNTAIN:  19,
};

// Tile rendering definitions
const TOWN_TILES = [
  // 0: WATER
  { ch: '\u2248', attr: sattr(24, 17),  passable: false, transparent: true,  name: 'water' },
  // 1: DOCK
  { ch: '=',      attr: sattr(94, 58),  passable: true,  transparent: true,  name: 'dock' },
  // 2: ROAD
  { ch: '\u00B7', attr: sattr(240, 236), passable: true,  transparent: true,  name: 'road' },
  // 3: WALL
  { ch: '\u2588', attr: sattr(239, 236), passable: false, transparent: false, name: 'wall' },
  // 4: FLOOR (generic interior)
  { ch: '.',      attr: sattr(95, 58),   passable: true,  transparent: true,  name: 'floor' },
  // 5: DOOR
  { ch: '\u2590', attr: sattr(130, 58),  passable: true,  transparent: true,  name: 'door' },
  // 6: GRASS
  { ch: '\u2592', attr: sattr(22, 22),   passable: true,  transparent: true,  name: 'grass' },
  // 7: MARKET (floor)
  { ch: '.',      attr: sattr(178, 94),  passable: true,  transparent: true,  name: 'market' },
  // 8: TAVERN (floor)
  { ch: '.',      attr: sattr(130, 52),  passable: true,  transparent: true,  name: 'tavern' },
  // 9: SHIPWRIGHT
  { ch: '.',      attr: sattr(94, 52),   passable: true,  transparent: true,  name: 'shipwright' },
  // 10: HARBOR MASTER
  { ch: '.',      attr: sattr(31, 17),   passable: true,  transparent: true,  name: 'harbor_master' },
  // 11: CHURCH
  { ch: '.',      attr: sattr(255, 236), passable: true,  transparent: true,  name: 'church' },
  // 12: LANTERN
  { ch: '\u263C', attr: sattr(178, 236), passable: false, transparent: true,  name: 'lantern' },
  // 13: CRATE
  { ch: '\u229E', attr: sattr(94, 58),   passable: false, transparent: false, name: 'crate' },
  // 14: BARREL
  { ch: 'o',      attr: sattr(94, 58),   passable: false, transparent: false, name: 'barrel' },
  // 15: SHIP_TILE
  { ch: '\u2302', attr: sattr(208, 17),  passable: true,  transparent: true,  name: 'ship' },
  // 16: FISH_RACK
  { ch: '\u256B', attr: sattr(94, 22),   passable: false, transparent: true,  name: 'fish_rack' },
  // 17: WELL
  { ch: 'U',      attr: sattr(255, 240), passable: false, transparent: true,  name: 'well' },
  // 18: CARGO_PILE
  { ch: '\u25A3', attr: sattr(94, 180),  passable: false, transparent: true,  name: 'cargo_pile' },
  // 19: FOUNTAIN
  { ch: '\u25CE', attr: sattr(33, 240),  passable: false, transparent: true,  name: 'fountain' },
];

const TOWN_W = 60;
const TOWN_H = 40;

// Base building dimensions (before scaling)
const BASE_BUILDING_DIMS = {
  Tavern:          { w: 12, h: 8 },
  Market:          { w: 14, h: 6 },
  Shipwright:      { w: 10, h: 6 },
  'Harbor Master': { w: 10, h: 6 },
  Church:          { w: 10, h: 8 },
};

// Building name → floor tile type
const BUILDING_FLOOR = {
  Tavern:          T.TAVERN,
  Market:          T.MARKET,
  Shipwright:      T.SHIPWRIGHT,
  'Harbor Master': T.HARBOR_MASTER,
  Church:          T.CHURCH,
};

/**
 * Generate a town map for a given port.
 * Returns { tiles: Uint8Array, width, height, spawn: {x,y}, buildings: [...], profile }
 */
function generateTownMap(portName) {
  const profile = getProfile(portName);
  const w = profile.w;
  const h = profile.h;
  const tiles = new Uint8Array(w * h);

  // Fill with grass
  tiles.fill(T.GRASS);

  // Water along bottom edge (harbor front) — 3 rows
  for (let y = h - 3; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles[y * w + x] = T.WATER;
    }
  }

  // Dock strip — row h-4
  const dockY = h - 4;
  for (let x = 8; x < w - 8; x++) {
    tiles[dockY * w + x] = T.DOCK;
  }

  // Ship tile at center of dock
  const shipX = Math.floor(w / 2);
  const shipY = dockY;
  tiles[shipY * w + shipX] = T.SHIP_TILE;

  // Lay streets based on profile pattern
  const mainStreetX = Math.floor(w / 2);
  _layoutStreets(tiles, w, h, profile.streetPattern, dockY);

  // Place buildings using profile zones
  const buildings = [];
  const buildingOrder = ['Tavern', 'Market', 'Shipwright', 'Harbor Master', 'Church'];
  for (const name of buildingOrder) {
    const zone = profile.buildingZones[name];
    if (!zone) continue;
    const baseDims = BASE_BUILDING_DIMS[name];
    if (!baseDims) continue;
    const scale = (profile.buildingScale && profile.buildingScale[name]) || {};
    const bw = Math.round(baseDims.w * (scale.w || 1));
    const bh = Math.round(baseDims.h * (scale.h || 1));
    const bx = Math.round(zone.xFrac * w);
    const by = Math.round(zone.yFrac * h);
    const floorType = BUILDING_FLOOR[name];
    const bld = _placeBuilding(tiles, w, h, bx, by, bw, bh, floorType, name);
    if (bld) buildings.push(bld);
  }

  // Scatter lanterns along streets
  _placeLanterns(tiles, w, h, mainStreetX, dockY);

  // Scatter crates/barrels near dock, scaled by clutterDensity
  _placeDockClutter(tiles, w, h, dockY, profile.clutterDensity);

  // Place decorations
  _placeDecorations(tiles, w, h, profile);

  // Player spawn: on dock, near ship
  const spawn = { x: shipX, y: shipY - 1 };
  // Make sure spawn is walkable
  tiles[spawn.y * w + spawn.x] = T.DOCK;

  return { tiles, width: w, height: h, spawn, buildings, shipX, shipY, profile };
}

/**
 * Lay streets based on the pattern type.
 */
function _layoutStreets(tiles, w, h, pattern, dockY) {
  const mainX = Math.floor(w / 2);

  // Main street — always present: vertical road from top area to dock
  for (let y = 4; y < dockY; y++) {
    tiles[y * w + mainX] = T.ROAD;
    if (mainX - 1 >= 0) tiles[y * w + mainX - 1] = T.ROAD;
    if (mainX + 1 < w) tiles[y * w + mainX + 1] = T.ROAD;
  }

  if (pattern === 'single') {
    // Just the main street — one cross at ~40% height
    const crossY = Math.round(h * 0.40);
    for (let x = 5; x < w - 5; x++) {
      tiles[crossY * w + x] = T.ROAD;
    }
  } else if (pattern === 'cross') {
    // Two horizontal cross streets
    const cross1Y = Math.round(h * 0.38);
    const cross2Y = Math.round(h * 0.65);
    for (let x = 5; x < w - 5; x++) {
      tiles[cross1Y * w + x] = T.ROAD;
      if (cross1Y - 1 >= 0) tiles[(cross1Y - 1) * w + x] = T.ROAD;
    }
    for (let x = 5; x < w - 5; x++) {
      tiles[cross2Y * w + x] = T.ROAD;
    }
  } else if (pattern === 'grid') {
    // Two horizontal + two vertical streets
    const cross1Y = Math.round(h * 0.33);
    const cross2Y = Math.round(h * 0.58);
    for (let x = 5; x < w - 5; x++) {
      tiles[cross1Y * w + x] = T.ROAD;
      if (cross1Y - 1 >= 0) tiles[(cross1Y - 1) * w + x] = T.ROAD;
    }
    for (let x = 5; x < w - 5; x++) {
      tiles[cross2Y * w + x] = T.ROAD;
    }
    // Two vertical side streets
    const sideX1 = Math.round(w * 0.25);
    const sideX2 = Math.round(w * 0.75);
    for (let y = 4; y < dockY; y++) {
      tiles[y * w + sideX1] = T.ROAD;
      tiles[y * w + sideX2] = T.ROAD;
    }
  }
}

/**
 * Place a rectangular building with walls, floor, and a door facing the nearest road.
 */
function _placeBuilding(tiles, mapW, mapH, bx, by, bw, bh, floorType, name) {
  // Clamp to map
  if (bx < 1 || by < 1 || bx + bw >= mapW - 1 || by + bh >= mapH - 5) return null;

  // Walls
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1) {
        tiles[y * mapW + x] = T.WALL;
      } else {
        tiles[y * mapW + x] = floorType;
      }
    }
  }

  // Door — bottom wall center
  const doorX = bx + Math.floor(bw / 2);
  const doorY = by + bh - 1;
  tiles[doorY * mapW + doorX] = T.DOOR;

  // Path from door to nearest road (down)
  for (let y = doorY + 1; y < mapH - 4; y++) {
    const idx = y * mapW + doorX;
    if (tiles[idx] === T.ROAD) break;
    if (tiles[idx] === T.GRASS || tiles[idx] === T.DOCK) {
      tiles[idx] = T.ROAD;
    }
  }

  return {
    name,
    x: bx, y: by,
    w: bw, h: bh,
    floorType,
    doorX, doorY,
    interiorX: bx + Math.floor(bw / 2),
    interiorY: by + Math.floor(bh / 2),
  };
}

function _placeLanterns(tiles, w, h, mainX, dockY) {
  // Place lanterns at street intersections and along the main road
  const spots = [];

  // Along main street every ~8 tiles
  for (let y = 6; y < dockY - 2; y += 8) {
    spots.push([mainX - 2, y]);
    spots.push([mainX + 2, y]);
  }

  // Near dock
  spots.push([mainX, dockY - 1]);

  for (const [lx, ly] of spots) {
    if (lx >= 0 && lx < w && ly >= 0 && ly < h) {
      const idx = ly * w + lx;
      // Only place on grass or road
      if (tiles[idx] === T.GRASS || tiles[idx] === T.ROAD) {
        tiles[idx] = T.LANTERN;
      }
    }
  }
}

function _placeDockClutter(tiles, w, h, dockY, density) {
  const clutterTypes = [T.CRATE, T.BARREL, T.CRATE, T.BARREL];
  // All potential clutter spots along dock
  const allSpots = [
    [10, dockY], [11, dockY], [w - 12, dockY], [w - 11, dockY],
    [15, dockY], [w - 16, dockY],
    [13, dockY], [w - 14, dockY],
  ];

  // Use density to determine how many spots to fill
  const count = Math.max(1, Math.round(allSpots.length * (density || 0.5)));
  const spots = allSpots.slice(0, count);

  for (let i = 0; i < spots.length; i++) {
    const [cx, cy] = spots[i];
    if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
      const idx = cy * w + cx;
      if (tiles[idx] === T.DOCK) {
        tiles[idx] = clutterTypes[i % clutterTypes.length];
      }
    }
  }
}

/**
 * Place decoration tiles on grass near roads.
 */
function _placeDecorations(tiles, w, h, profile) {
  const decoTypes = profile.decorations;
  if (!decoTypes || decoTypes.length === 0) return;

  // Simple seeded pseudo-random based on port character string
  let seed = 0;
  for (let i = 0; i < (profile.character || '').length; i++) {
    seed = (seed * 31 + profile.character.charCodeAt(i)) | 0;
  }
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 16) / 32768;
  };

  // Find grass tiles adjacent to roads
  const candidates = [];
  for (let y = 2; y < h - 5; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (tiles[y * w + x] !== T.GRASS) continue;
      // Check if adjacent to road
      const adj = [
        tiles[(y - 1) * w + x],
        tiles[(y + 1) * w + x],
        tiles[y * w + (x - 1)],
        tiles[y * w + (x + 1)],
      ];
      if (adj.some(t => t === T.ROAD)) {
        candidates.push([x, y]);
      }
    }
  }

  // Place 2-4 decorations
  const count = Math.min(candidates.length, 2 + Math.floor(rng() * 3));
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * candidates.length);
    const [dx, dy] = candidates.splice(idx, 1)[0];
    tiles[dy * w + dx] = decoTypes[i % decoTypes.length];
  }
}

module.exports = {
  T,
  TOWN_TILES,
  TOWN_W,
  TOWN_H,
  generateTownMap,
};
