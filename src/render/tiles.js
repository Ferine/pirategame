'use strict';

const TILE = {
  DEEP_OCEAN: 0,
  OCEAN: 1,
  SHALLOW: 2,
  BEACH: 3,
  GRASS: 4,
  FOREST: 5,
  HILL: 6,
  MOUNTAIN: 7,
  PORT: 8,
  ISLAND: 9,
};

// blessed sattr format: (flags << 18) | (fg << 9) | bg
function sattr(fg, bg) {
  return (fg << 9) | bg;
}

const TILE_DEFS = [
  // 0: DEEP_OCEAN
  {
    chars: ['~', '\u2248', '~', '\u223C'],  // ~ ≈ ~ ∼
    attr: sattr(17, 17),
    passable: true,
    transparent: true,
  },
  // 1: OCEAN
  {
    chars: ['~', '\u2248', '\u223C', '~'],
    attr: sattr(24, 17),
    passable: true,
    transparent: true,
  },
  // 2: SHALLOW
  {
    chars: ['~', '\u2591', '~', '\u2591'],  // ~ ░ ~ ░
    attr: sattr(31, 24),
    passable: true,
    transparent: true,
  },
  // 3: BEACH
  {
    chars: ['\u2591', '\u2592', '\u2591', '.'],  // ░ ▒ ░ .
    attr: sattr(186, 58),
    passable: false,
    transparent: true,
  },
  // 4: GRASS
  {
    chars: ['\u2592', '\u2591', '\u2663', '\u2592'],  // ▒ ░ ♣ ▒
    attr: sattr(22, 22),
    passable: false,
    transparent: false,
  },
  // 5: FOREST
  {
    chars: ['\u2660', '\u2663', '\u00A7', '\u2660'],  // ♠ ♣ § ♠
    attr: sattr(22, 233),
    passable: false,
    transparent: false,
  },
  // 6: HILL
  {
    chars: ['\u2229', '\u2227', '\u2229', '^'],  // ∩ ∧ ∩ ^
    attr: sattr(101, 58),
    passable: false,
    transparent: false,
  },
  // 7: MOUNTAIN
  {
    chars: ['\u25B2', '\u2206', '\u25B2', '^'],  // ▲ △ ▲ ^
    attr: sattr(244, 236),
    passable: false,
    transparent: false,
  },
  // 8: PORT
  {
    chars: ['\u2302', '\u2302', '\u2302', '\u2302'],  // ⌂ ⌂ ⌂ ⌂
    attr: sattr(178, 58),
    passable: true,
    transparent: true,
  },
  // 9: ISLAND
  {
    chars: ['\u2666', '\u2666', '\u2666', '\u2666'],  // ♦ ♦ ♦ ♦
    attr: sattr(34, 24),
    passable: true,
    transparent: true,
  },
];

// Fog of war attributes
const FOG_UNEXPLORED_ATTR = sattr(235, 233);
const FOG_UNEXPLORED_CHAR = ' ';
const FOG_EXPLORED_ATTR = sattr(237, 235);
const FOG_EXPLORED_CHAR = '\u2591'; // ░

// Ship rendering
const SHIP_ATTR = sattr(208, 17);
const DIR_CHARS = ['\u25B2', '\u25BA', '\u25BA', '\u25BA', '\u25BC', '\u25C4', '\u25C4', '\u25C4'];
// N=▲, NE/E/SE=►, S=▼, SW/W/NW=◄

function getTileChar(tileType, x, y, animFrame) {
  const def = TILE_DEFS[tileType];
  if (!def) return '?';
  const idx = (x + y + animFrame) % def.chars.length;
  return def.chars[idx];
}

module.exports = {
  TILE,
  TILE_DEFS,
  FOG_UNEXPLORED_ATTR,
  FOG_UNEXPLORED_CHAR,
  FOG_EXPLORED_ATTR,
  FOG_EXPLORED_CHAR,
  SHIP_ATTR,
  DIR_CHARS,
  getTileChar,
  sattr,
};
