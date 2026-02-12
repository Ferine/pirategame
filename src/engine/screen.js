'use strict';

function _normalizeTermForBlessed() {
  const term = (process.env.TERM || '').toLowerCase();
  // Ghostty's terminfo capabilities can trip neo-blessed parsing.
  if (term === 'xterm-ghostty' || term === 'ghostty') {
    process.env.TERM = 'xterm-256color';
  }
}

function createScreen() {
  _normalizeTermForBlessed();
  const blessed = require('neo-blessed');

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
