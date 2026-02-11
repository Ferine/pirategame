'use strict';

const { sattr } = require('../render/tiles');

// Water background color (dark navy)
const WATER_BG = 17;

// Obstacle sprites — single-row, keyed by type and direction
// Each sprite: { chars: string, attr: number, width: number }

const SPRITES = {
  merchant_large_r: {
    chars: '<\u2588\u2588|\\|\u2588\u2588>',  // <██|\|██>
    attr: sattr(94, WATER_BG),
    width: 8,
  },
  merchant_large_l: {
    chars: '<\u2588\u2588|/|\u2588\u2588>',  // <██|/|██>
    attr: sattr(94, WATER_BG),
    width: 8,
  },
  merchant_small_r: {
    chars: '<\u2588|\\>\u2588>',  // <█|\>█>
    attr: sattr(130, WATER_BG),
    width: 6,
  },
  merchant_small_l: {
    chars: '<\u2588</|\u2588>',  // <█</|█>
    attr: sattr(130, WATER_BG),
    width: 6,
  },
  fishing_r: {
    chars: '\\>',
    attr: sattr(255, WATER_BG),
    width: 2,
  },
  fishing_l: {
    chars: '</',
    attr: sattr(255, WATER_BG),
    width: 2,
  },
  naval_r: {
    chars: '<=\u2588\u2588\u2550\u2550\u2588\u2588=>',  // <=██══██=>
    attr: sattr(248, WATER_BG),
    width: 10,
  },
  naval_l: {
    chars: '<=\u2588\u2588\u2550\u2550\u2588\u2588=>',  // <=██══██=>
    attr: sattr(248, WATER_BG),
    width: 10,
  },
  barrel: {
    chars: 'o',
    attr: sattr(130, WATER_BG),
    width: 1,
  },
  wreckage: {
    chars: '%',
    attr: sattr(94, WATER_BG),
    width: 1,
  },
  crate: {
    chars: '\u25A1',  // □
    attr: sattr(178, WATER_BG),
    width: 1,
  },
  reef: {
    chars: '\u2592',  // ▒ (single char, repeated to fill)
    attr: sattr(186, 58),
    width: 1,
  },
};

// Lookup tables for sprite selection by lane type and direction
const LANE_SPRITES = {
  merchant: {
    r: ['merchant_large_r', 'merchant_small_r'],
    l: ['merchant_large_l', 'merchant_small_l'],
  },
  fishing: {
    r: ['fishing_r'],
    l: ['fishing_l'],
  },
  naval: {
    r: ['naval_r'],
    l: ['naval_l'],
  },
  debris: {
    r: ['barrel', 'wreckage', 'crate'],
    l: ['barrel', 'wreckage', 'crate'],
  },
};

// Colors for lane backgrounds
const LANE_COLORS = {
  water:   sattr(24, WATER_BG),
  dock:    sattr(130, 94),
  current: sattr(45, WATER_BG),
  reef:    sattr(186, 58),
};

// Water wave chars for background animation
const WATER_CHARS = ['~', '\u2248', '\u223C', '~'];  // ~ ≈ ∼ ~

// Dock plank chars
const DOCK_CHARS = ['#', '=', '#', '='];

// Current arrow chars
const CURRENT_CHARS_R = ['\u2192', '\u2192', '-', '\u2192'];  // → → - →
const CURRENT_CHARS_L = ['\u2190', '\u2190', '-', '\u2190'];  // ← ← - ←

// Player ship char
const PLAYER_CHAR = '\u25B2';  // ▲
const PLAYER_ATTR = sattr(208, WATER_BG);
const PLAYER_ATTR_BLINK = sattr(WATER_BG, WATER_BG);  // invisible during blink

// Status bar colors
const STATUS_ATTR = sattr(178, 233);
const STATUS_LABEL_ATTR = sattr(248, 233);

// Result overlay colors
const RESULT_WIN_ATTR = sattr(178, 17);   // amber on navy
const RESULT_FAIL_ATTR = sattr(196, 17);  // red on navy

module.exports = {
  SPRITES,
  LANE_SPRITES,
  LANE_COLORS,
  WATER_BG,
  WATER_CHARS,
  DOCK_CHARS,
  CURRENT_CHARS_R,
  CURRENT_CHARS_L,
  PLAYER_CHAR,
  PLAYER_ATTR,
  PLAYER_ATTR_BLINK,
  STATUS_ATTR,
  STATUS_LABEL_ATTR,
  RESULT_WIN_ATTR,
  RESULT_FAIL_ATTR,
};
