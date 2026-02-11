'use strict';

const { sattr } = require('../render/tiles');

// Stealth tile types
const ST = {
  WATER:       0,
  STONE_FLOOR: 1,
  WALL:        2,
  DOOR:        3,
  CRATE:       4,
  BARREL:      5,
  OBJECTIVE:   6,
  EXIT:        7,
  ENTRY:       8,
  WINDOW:      9,
  TORCH:       10,
};

// Tile definitions
const STEALTH_TILES = [
  // 0: WATER
  { ch: '\u2248', attr: sattr(24, 17),  passable: false, transparent: true,  cover: false, name: 'water' },
  // 1: STONE_FLOOR
  { ch: '.',      attr: sattr(240, 236), passable: true,  transparent: true,  cover: false, name: 'stone' },
  // 2: WALL
  { ch: '\u2588', attr: sattr(239, 236), passable: false, transparent: false, cover: true,  name: 'wall' },
  // 3: DOOR
  { ch: '\u2590', attr: sattr(130, 58),  passable: true,  transparent: true,  cover: false, name: 'door' },
  // 4: CRATE
  { ch: '\u229E', attr: sattr(94, 58),   passable: false, transparent: false, cover: true,  name: 'crate' },
  // 5: BARREL
  { ch: 'o',      attr: sattr(94, 58),   passable: false, transparent: false, cover: true,  name: 'barrel' },
  // 6: OBJECTIVE
  { ch: '!',      attr: sattr(226, 233), passable: true,  transparent: true,  cover: false, name: 'objective' },
  // 7: EXIT
  { ch: '\u25B2', attr: sattr(34, 233),  passable: true,  transparent: true,  cover: false, name: 'exit' },
  // 8: ENTRY
  { ch: '\u25BC', attr: sattr(178, 233), passable: true,  transparent: true,  cover: false, name: 'entry' },
  // 9: WINDOW
  { ch: '\u2592', attr: sattr(39, 17),   passable: false, transparent: true,  cover: false, name: 'window' },
  // 10: TORCH
  { ch: '\u263C', attr: sattr(178, 236), passable: false, transparent: true,  cover: false, name: 'torch' },
];

const STEALTH_W = 40;
const STEALTH_H = 25;

// --- Templates ---

// Legend: # = wall, . = floor, D = door, C = crate, B = barrel,
//         ! = objective, E = exit, S = entry, W = window, T = torch
// G = guard spawn marker (not a tile, parsed separately)

const FORT_TEMPLATE = [
  '########################################',
  '#......T..........#......T..........#..#',
  '#.................D.................D..#',
  '#..S..............#.................#..#',
  '#......#####..####.####..#####.....#..#',
  '#......#...#..#.......#..#...#.....#..#',
  '#......#.!.#..#..G....#..#.!.#.....#..#',
  '#......#...#..#.......#..#...#..T..#..#',
  '#......#####..#.......#..#####.....#..#',
  '#..T..........#..D..D.#............#..#',
  '#.............#.......#...G........#..#',
  '####D#########.........########D####..#',
  '#..............G...................#...#',
  '#....CB..CB......CB..CB............T..#',
  '#....................................D.#',
  '#..T.........####D####............#...#',
  '#............#.......#............#...#',
  '#....G.......#...!...#..CB..CB...#...#',
  '#............#.......#...........#...#',
  '#............#########...........#...#',
  '#..CB..CB..........................T.#',
  '#..................................#..#',
  '######D#############################.#',
  '#.....E.............T................##',
  '########################################',
];

const SHIP_TEMPLATE = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~####################################~~',
  '~~#....T....#......#........T........#~~',
  '~~#.........D......D................E#~~',
  '~~#..S......#......#.................#~~',
  '~~#.........#..G...#..CB..CB........#~~',
  '~~#...####D##......#................W~~',
  '~~#...#.!...#......#..CB..CB..T.....#~~',
  '~~#...#.....#......#................#~~',
  '~~#...######...D...####D############~~',
  '~~#..T........#........#............#~~',
  '~~#...........#..G.....#....T.......#~~',
  '~~#...........#........D............#~~',
  '~~#..CB..CB...#........#..CB..CB....#~~',
  '~~#...........#...G....#............#~~',
  '~~#...........#........#............#~~',
  '~~#..T........####D#####............#~~',
  '~~#.....................#.....!......#~~',
  '~~#.....................D............#~~',
  '~~#..............T....#.............#~~',
  '~~#....CB..CB.........#..CB..CB..T..#~~',
  '~~#.....................#............#~~',
  '~~####################################~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

const WAREHOUSE_TEMPLATE = [
  '########################################',
  '#..T...........D....................T..#',
  '#..............#.......................#',
  '#..S...........#..CB.CB.CB.CB.CB.CB..#',
  '#..............#.......................#',
  '#..............#..CB.CB.CB.CB.CB.CB..#',
  '#..####D####..#.......................#',
  '#..#.!.....#..#..CB.CB.CB.CB.CB.CB..#',
  '#..#.......#..#.......................#',
  '#..########..D.........G..............#',
  '#..T.................................T.#',
  '####D#################################',
  '#....................................G.#',
  '#..CB..CB..CB..CB......CB..CB..CB.CB..#',
  '#.....................................#',
  '#..CB..CB..CB..CB..G...CB..CB..CB.CB..#',
  '#.....................................#',
  '#..CB..CB..CB..CB......CB..CB..CB.CB..#',
  '#.....................................#',
  '#..T.......####D####.............T....#',
  '#...........#.......#.................#',
  '#...........#...!...#.................#',
  '#...........#.......#.......E.........#',
  '#..........T#########T................#',
  '########################################',
];

const TEMPLATES = {
  fort:      { lines: FORT_TEMPLATE,      name: 'Fort' },
  ship:      { lines: SHIP_TEMPLATE,      name: 'Ship Hold' },
  warehouse: { lines: WAREHOUSE_TEMPLATE, name: 'Warehouse' },
};

const CHAR_MAP = {
  '#': ST.WALL,
  '.': ST.STONE_FLOOR,
  'D': ST.DOOR,
  'C': ST.CRATE,
  'B': ST.BARREL,
  '!': ST.OBJECTIVE,
  'E': ST.EXIT,
  'S': ST.ENTRY,
  'W': ST.WINDOW,
  'T': ST.TORCH,
  '~': ST.WATER,
  ' ': ST.STONE_FLOOR,
};

// Objective labels
const OBJECTIVE_LABELS = [
  'Steal the documents',
  'Sabotage the powder stores',
  'Free the prisoner',
  'Loot the war chest',
  'Destroy supply crates',
];

// Guard patrol direction presets (based on position in map quadrant)
const PATROL_PRESETS = [
  [{ x: 0, y: -3 }, { x: 3, y: 0 }, { x: 0, y: 3 }, { x: -3, y: 0 }],
  [{ x: 4, y: 0 }, { x: 0, y: 4 }, { x: -4, y: 0 }, { x: 0, y: -4 }],
  [{ x: -3, y: -2 }, { x: 3, y: -2 }, { x: 3, y: 2 }, { x: -3, y: 2 }],
];

/**
 * Generate a stealth map from a template.
 * @param {string} templateId - 'fort', 'ship', or 'warehouse'
 * @param {number} seed - random seed (unused currently, for future variation)
 * @returns {{ tiles, width, height, spawn, exit, objectives, guardSpawns, name }}
 */
function generateStealthMap(templateId, seed) {
  const tmpl = TEMPLATES[templateId] || TEMPLATES.fort;
  const w = STEALTH_W;
  const h = STEALTH_H;
  const tiles = new Uint8Array(w * h);

  let spawn = { x: 2, y: 3 };
  let exit = { x: w - 3, y: h - 3 };
  const objectives = [];
  const guardSpawns = [];
  let objIndex = 0;

  for (let y = 0; y < h; y++) {
    const line = tmpl.lines[y] || '';
    for (let x = 0; x < w; x++) {
      const ch = x < line.length ? line[x] : ' ';

      if (ch === 'G') {
        // Guard spawn — floor underneath
        tiles[y * w + x] = ST.STONE_FLOOR;
        const patrolBase = PATROL_PRESETS[guardSpawns.length % PATROL_PRESETS.length];
        const waypoints = patrolBase.map(wp => ({
          x: Math.max(1, Math.min(w - 2, x + wp.x)),
          y: Math.max(1, Math.min(h - 2, y + wp.y)),
        }));
        guardSpawns.push({
          x, y,
          facing: 4, // south
          waypoints,
        });
      } else if (ch === 'S') {
        tiles[y * w + x] = ST.ENTRY;
        spawn = { x, y };
      } else if (ch === 'E') {
        tiles[y * w + x] = ST.EXIT;
        exit = { x, y };
      } else if (ch === '!') {
        tiles[y * w + x] = ST.OBJECTIVE;
        objectives.push({
          x, y,
          label: OBJECTIVE_LABELS[objIndex % OBJECTIVE_LABELS.length],
          completed: false,
        });
        objIndex++;
      } else {
        tiles[y * w + x] = CHAR_MAP[ch] !== undefined ? CHAR_MAP[ch] : ST.STONE_FLOOR;
      }
    }
  }

  return {
    tiles,
    width: w,
    height: h,
    spawn,
    exit,
    objectives,
    guardSpawns,
    name: tmpl.name,
  };
}

module.exports = {
  ST,
  STEALTH_TILES,
  STEALTH_W,
  STEALTH_H,
  generateStealthMap,
};
