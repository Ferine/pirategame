'use strict';

const { sattr } = require('../render/tiles');

// --- Color attributes ---

const PLAYER_COLOR = sattr(178, 233);   // amber
const ENEMY_COLOR = sattr(160, 233);    // red
const SWORD_COLOR = sattr(250, 233);    // bright silver
const HIT_FLASH = sattr(226, 124);      // yellow on red
const BLOCK_FLASH = sattr(250, 240);    // white on grey
const DODGE_FLASH = sattr(240, 233);    // dim grey
const ZONE_LABEL = sattr(240, 233);     // dim

// --- Fighter stances (7 lines tall) ---
// Left fighter (player) — faces right

const FIGHTER_LEFT = {
  high: [
    '    _/ ',
    '  O/   ',
    ' /|    ',
    '  |    ',
    ' / \\   ',
    '/   \\  ',
    '       ',
  ],
  mid: [
    '       ',
    '  O    ',
    ' /|--/ ',
    '  |    ',
    ' / \\   ',
    '/   \\  ',
    '       ',
  ],
  low: [
    '       ',
    '  O    ',
    ' /|    ',
    '  |    ',
    ' / \\-/ ',
    '/   \\  ',
    '       ',
  ],
};

// Right fighter (enemy) — faces left

const FIGHTER_RIGHT = {
  high: [
    ' \\_    ',
    '   \\O  ',
    '    |\\.',
    '    |  ',
    '   / \\ ',
    '  /   \\',
    '       ',
  ],
  mid: [
    '       ',
    '    O  ',
    ' \\--|\\.',
    '    |  ',
    '   / \\ ',
    '  /   \\',
    '       ',
  ],
  low: [
    '       ',
    '    O  ',
    '    |\\.',
    '    |  ',
    ' \\-/ \\ ',
    '  /   \\',
    '       ',
  ],
};

// --- Clash animation frames ---
// 3 frames over 1.5s: approach, clash, recoil

const CLASH_FRAMES = {
  // Frame 0: approach (fighters closer)
  approach: [
    '       ',
    '  O  O ',
    ' /|  |\\',
    '  |XX|.',
    ' / \\/ \\',
    '/  /\\  \\',
    '       ',
  ],
  // Frame 1: impact
  clash: [
    '   **  ',
    '  O**O ',
    ' /|><|\\',
    '  |  |.',
    ' / \\/ \\',
    '/  /\\  \\',
    '       ',
  ],
  // Frame 2: recoil
  recoil: [
    '       ',
    ' O    O',
    '/|    |\\',
    ' |    |.',
    '/ \\  / \\',
    '  /  \\  ',
    '       ',
  ],
};

// Dodge frames (one side dodges back)
const DODGE_LEFT = [
  '       ',
  'O    O ',
  '|\\   |\\',
  ' |   |.',
  '/ \\ / \\',
  '    /   ',
  '       ',
];

const DODGE_RIGHT = [
  '       ',
  ' O    O',
  '/|   /|',
  ' |   | ',
  '/ \\ / \\',
  '   \\   ',
  '       ',
];

// Block frame (parry)
const BLOCK_FRAME = [
  '       ',
  '  O  O ',
  ' /|##|\\',
  '  |  |.',
  ' / \\/ \\',
  '/  /\\  \\',
  '       ',
];

/**
 * Get fighter stance art lines for a side and zone.
 */
function getStanceArt(side, zone) {
  if (side === 'left') return FIGHTER_LEFT[zone] || FIGHTER_LEFT.mid;
  return FIGHTER_RIGHT[zone] || FIGHTER_RIGHT.mid;
}

/**
 * Get clash animation frame based on timer, moves, and zones.
 * @param {number} timer - 0 to 2.0
 * @param {string} playerMove
 * @param {string} enemyMove
 * @returns {{ lines: string[], attr: number }}
 */
function getClashFrame(timer, playerMove, enemyMove) {
  // Determine which frame
  let lines;
  let attr = SWORD_COLOR;

  if (timer < 0.5) {
    // Approach
    if (playerMove === 'dodge') {
      lines = DODGE_LEFT;
      attr = DODGE_FLASH;
    } else if (enemyMove === 'dodge') {
      lines = DODGE_RIGHT;
      attr = DODGE_FLASH;
    } else {
      lines = CLASH_FRAMES.approach;
    }
  } else if (timer < 1.2) {
    // Impact
    if (playerMove === 'dodge' || enemyMove === 'dodge') {
      lines = playerMove === 'dodge' ? DODGE_LEFT : DODGE_RIGHT;
      attr = DODGE_FLASH;
    } else if (playerMove === 'parry' || enemyMove === 'parry') {
      lines = BLOCK_FRAME;
      attr = BLOCK_FLASH;
    } else {
      lines = CLASH_FRAMES.clash;
      attr = HIT_FLASH;
    }
  } else {
    // Recoil
    lines = CLASH_FRAMES.recoil;
  }

  return { lines, attr };
}

module.exports = {
  PLAYER_COLOR,
  ENEMY_COLOR,
  SWORD_COLOR,
  HIT_FLASH,
  BLOCK_FLASH,
  DODGE_FLASH,
  ZONE_LABEL,
  getStanceArt,
  getClashFrame,
  FIGHTER_LEFT,
  FIGHTER_RIGHT,
};
