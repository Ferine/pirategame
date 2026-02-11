'use strict';

const blessed = require('neo-blessed');

function createScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'Kattegat Kaper',
    cursor: {
      artificial: true,
      shape: 'block',
      blink: false,
    },
  });

  // Hide cursor
  screen.program.hideCursor();

  return screen;
}

module.exports = { createScreen };
