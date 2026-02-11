'use strict';

const { sattr } = require('../render/tiles');

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
];

const TOWN_W = 60;
const TOWN_H = 40;

/**
 * Generate a town map for a given port.
 * Returns { tiles: Uint8Array, width, height, spawn: {x,y}, buildings: [...] }
 */
function generateTownMap(portName) {
  const w = TOWN_W;
  const h = TOWN_H;
  const tiles = new Uint8Array(w * h);

  // Fill with grass
  tiles.fill(T.GRASS);

  // Water along bottom edge (harbor front) — 3 rows
  for (let y = h - 3; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles[y * w + x] = T.WATER;
    }
  }

  // Dock strip — row h-4, from x=10 to x=50
  const dockY = h - 4;
  for (let x = 8; x < w - 8; x++) {
    tiles[dockY * w + x] = T.DOCK;
  }

  // Ship tile at center of dock
  const shipX = Math.floor(w / 2);
  const shipY = dockY;
  tiles[shipY * w + shipX] = T.SHIP_TILE;

  // Main street — vertical road from dock up through town center
  const mainStreetX = Math.floor(w / 2);
  for (let y = 4; y < dockY; y++) {
    tiles[y * w + mainStreetX] = T.ROAD;
    // Road width of 3
    if (mainStreetX - 1 >= 0) tiles[y * w + mainStreetX - 1] = T.ROAD;
    if (mainStreetX + 1 < w) tiles[y * w + mainStreetX + 1] = T.ROAD;
  }

  // Cross street — horizontal at y=15
  const crossY = 15;
  for (let x = 5; x < w - 5; x++) {
    tiles[crossY * w + x] = T.ROAD;
    if (crossY - 1 >= 0) tiles[(crossY - 1) * w + x] = T.ROAD;
  }

  // Second cross street at y=26
  const cross2Y = 26;
  for (let x = 5; x < w - 5; x++) {
    tiles[cross2Y * w + x] = T.ROAD;
  }

  const buildings = [];

  // --- Place buildings ---

  // Tavern — left of main street, between cross streets
  const tavern = _placeBuilding(tiles, w, h, 8, 17, 12, 8, T.TAVERN, 'Tavern');
  if (tavern) buildings.push(tavern);

  // Market — right of main street, near first cross street
  const market = _placeBuilding(tiles, w, h, mainStreetX + 4, 17, 14, 6, T.MARKET, 'Market');
  if (market) buildings.push(market);

  // Shipwright — right side, near dock
  const shipwright = _placeBuilding(tiles, w, h, mainStreetX + 5, 28, 10, 6, T.SHIPWRIGHT, 'Shipwright');
  if (shipwright) buildings.push(shipwright);

  // Harbor master — left side, near dock
  const harborMaster = _placeBuilding(tiles, w, h, 8, 28, 10, 6, T.HARBOR_MASTER, 'Harbor Master');
  if (harborMaster) buildings.push(harborMaster);

  // Church — top of town, center
  const church = _placeBuilding(tiles, w, h, mainStreetX - 5, 5, 10, 8, T.CHURCH, 'Church');
  if (church) buildings.push(church);

  // Scatter some lanterns along streets
  _placeLanterns(tiles, w, h, mainStreetX, crossY, cross2Y, dockY);

  // Scatter crates/barrels near dock
  _placeDockClutter(tiles, w, h, dockY);

  // Player spawn: on dock, near ship
  const spawn = { x: shipX, y: shipY - 1 };
  // Make sure spawn is walkable
  tiles[spawn.y * w + spawn.x] = T.DOCK;

  return { tiles, width: w, height: h, spawn, buildings, shipX, shipY };
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

function _placeLanterns(tiles, w, h, mainX, crossY, cross2Y, dockY) {
  const spots = [
    [mainX - 2, crossY - 3],
    [mainX + 2, crossY - 3],
    [mainX - 2, crossY + 3],
    [mainX + 2, crossY + 3],
    [mainX - 2, cross2Y - 2],
    [mainX + 2, cross2Y - 2],
    [mainX,     dockY - 1],
  ];

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

function _placeDockClutter(tiles, w, h, dockY) {
  const clutterTypes = [T.CRATE, T.BARREL, T.CRATE, T.BARREL];
  // Place a few items along dock edges
  const spots = [
    [10, dockY], [11, dockY], [w - 12, dockY], [w - 11, dockY],
    [15, dockY], [w - 16, dockY],
  ];

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

module.exports = {
  T,
  TOWN_TILES,
  TOWN_W,
  TOWN_H,
  generateTownMap,
};
