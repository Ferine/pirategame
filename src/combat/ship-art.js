'use strict';

// 4 scales of ship ASCII art for drone cam approach effect
// Each scale: { lines: string[], width: number, height: number }

const SHIP_TINY = {
  lines: ['_|_'],
  width: 3,
  height: 1,
};

const SHIP_SMALL = {
  lines: [
    '  .|.  ',
    ' /| |\\ ',
    '<=====>'
  ],
  width: 7,
  height: 3,
};

const SHIP_MEDIUM = {
  lines: [
    '      |      ',
    '     /|\\     ',
    '    / | \\    ',
    ' __/__|__\\__ ',
    '<============>',
    '  ~~~~~~~~~~  ',
  ],
  width: 14,
  height: 6,
};

const SHIP_LARGE = {
  lines: [
    '         |         ',
    '        /|\\        ',
    '       /_|_\\       ',
    '      /  |  \\      ',
    '     /   |   \\     ',
    '  __/____|____\\__  ',
    ' /                \\ ',
    '<==================>',
    '   ~~~~~~~~~~~~~~   ',
  ],
  width: 20,
  height: 9,
};

const SCALES = [SHIP_TINY, SHIP_SMALL, SHIP_MEDIUM, SHIP_LARGE];

// Colors for ship parts (xterm 256)
const HULL_COLOR = 94;   // brown
const SAIL_COLOR = 255;  // white
const WATER_COLOR = 31;  // blue

function getShipScale(progress) {
  // progress 0..1, map to scale index 0..3
  if (progress < 0.25) return 0;
  if (progress < 0.50) return 1;
  if (progress < 0.75) return 2;
  return 3;
}

function getShipArt(scaleIndex) {
  return SCALES[Math.min(scaleIndex, SCALES.length - 1)];
}

module.exports = {
  SCALES,
  SHIP_TINY,
  SHIP_SMALL,
  SHIP_MEDIUM,
  SHIP_LARGE,
  HULL_COLOR,
  SAIL_COLOR,
  WATER_COLOR,
  getShipScale,
  getShipArt,
};
