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

// Guard types
const GUARD_TYPES = {
  patrol:  { ch: 'G', visionRange: 7, moveInterval: 0.5, cascadeRange: 10, melee: { name: 'Guard',   hp: 70, strength: 9,  agility: 7, aiStyle: 'defensive' } },
  scout:   { ch: 'S', visionRange: 5, moveInterval: 0.35, cascadeRange: 10, melee: { name: 'Scout',   hp: 55, strength: 8,  agility: 8, aiStyle: 'aggressive' } },
  captain: { ch: 'C', visionRange: 9, moveInterval: 0.6, cascadeRange: 15, melee: { name: 'Captain', hp: 85, strength: 10, agility: 6, aiStyle: 'balanced' } },
};

/**
 * Seeded LCG random number generator.
 */
function _createRng(seed) {
  let s = (seed >>> 0) || 1;
  return function lcg() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Generate a stealth map from a template.
 * @param {string} templateId - 'fort', 'ship', or 'warehouse'
 * @param {number} seed - random seed for per-run variation
 * @param {{ difficulty?: string }} [opts] - options (difficulty for extra guard)
 * @returns {{ tiles, width, height, spawn, exit, objectives, guardSpawns, torches, name }}
 */
function generateStealthMap(templateId, seed, opts) {
  const tmpl = TEMPLATES[templateId] || TEMPLATES.fort;
  const rng = _createRng(seed || 1);
  const w = STEALTH_W;
  const h = STEALTH_H;
  const tiles = new Uint8Array(w * h);

  let spawn = { x: 2, y: 3 };
  let exit = { x: w - 3, y: h - 3 };
  const objectives = [];
  const guardSpawns = [];
  const torches = [];
  const barrelPositions = [];
  let objIndex = 0;

  // Parse template
  for (let y = 0; y < h; y++) {
    const line = tmpl.lines[y] || '';
    for (let x = 0; x < w; x++) {
      const ch = x < line.length ? line[x] : ' ';

      if (ch === 'G') {
        tiles[y * w + x] = ST.STONE_FLOOR;
        const patrolBase = PATROL_PRESETS[guardSpawns.length % PATROL_PRESETS.length];
        const waypoints = patrolBase.map(wp => ({
          x: Math.max(1, Math.min(w - 2, x + wp.x)),
          y: Math.max(1, Math.min(h - 2, y + wp.y)),
        }));
        guardSpawns.push({
          x, y,
          facing: Math.floor(rng() * 8), // randomize initial facing
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
        objectives.push({ x, y, label: '', completed: false });
        objIndex++;
      } else if (ch === 'T') {
        tiles[y * w + x] = ST.TORCH;
        torches.push({ x, y });
      } else if (ch === 'B') {
        tiles[y * w + x] = ST.BARREL;
        barrelPositions.push({ x, y });
      } else {
        tiles[y * w + x] = CHAR_MAP[ch] !== undefined ? CHAR_MAP[ch] : ST.STONE_FLOOR;
      }
    }
  }

  // Shuffle objective labels using seed
  const shuffledLabels = OBJECTIVE_LABELS.slice();
  for (let i = shuffledLabels.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledLabels[i], shuffledLabels[j]] = [shuffledLabels[j], shuffledLabels[i]];
  }
  for (let i = 0; i < objectives.length; i++) {
    objectives[i].label = shuffledLabels[i % shuffledLabels.length];
  }

  // Randomly nudge barrel positions ±1 onto adjacent floor tiles
  for (const bp of barrelPositions) {
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (rng() < 0.4) { // 40% chance to nudge each barrel
      const off = offsets[Math.floor(rng() * offsets.length)];
      const nx = bp.x + off[0];
      const ny = bp.y + off[1];
      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1) {
        const newIdx = ny * w + nx;
        if (tiles[newIdx] === ST.STONE_FLOOR) {
          tiles[bp.y * w + bp.x] = ST.STONE_FLOOR;
          tiles[newIdx] = ST.BARREL;
          bp.x = nx;
          bp.y = ny;
        }
      }
    }
  }

  // Assign guard types: first guard is captain (when ≥3), alternate patrol/scout
  for (let i = 0; i < guardSpawns.length; i++) {
    if (i === 0 && guardSpawns.length >= 3) {
      guardSpawns[i].guardType = 'captain';
    } else {
      guardSpawns[i].guardType = (i % 2 === 1) ? 'scout' : 'patrol';
    }
  }

  // Hard difficulty: spawn 1 extra guard at a random floor tile far from spawn/exit
  if (opts && opts.difficulty === 'hard') {
    const candidates = [];
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        if (tiles[y * w + x] !== ST.STONE_FLOOR) continue;
        const dSpawn = Math.abs(x - spawn.x) + Math.abs(y - spawn.y);
        const dExit = Math.abs(x - exit.x) + Math.abs(y - exit.y);
        if (dSpawn > 8 && dExit > 6) candidates.push({ x, y });
      }
    }
    if (candidates.length > 0) {
      const pos = candidates[Math.floor(rng() * candidates.length)];
      const patrolBase = PATROL_PRESETS[guardSpawns.length % PATROL_PRESETS.length];
      const waypoints = patrolBase.map(wp => ({
        x: Math.max(1, Math.min(w - 2, pos.x + wp.x)),
        y: Math.max(1, Math.min(h - 2, pos.y + wp.y)),
      }));
      guardSpawns.push({
        x: pos.x, y: pos.y,
        facing: Math.floor(rng() * 8),
        waypoints,
        guardType: 'scout',
      });
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
    torches,
    name: tmpl.name,
  };
}

module.exports = {
  ST,
  STEALTH_TILES,
  STEALTH_W,
  STEALTH_H,
  GUARD_TYPES,
  generateStealthMap,
};
