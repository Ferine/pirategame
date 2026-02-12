'use strict';

/**
 * Replace Math.random with a seeded LCG for the duration of `fn`.
 * Restores original Math.random afterwards (even on throw).
 */
function withDeterministicRandom(seed, fn) {
  const original = Math.random;
  let s = seed >>> 0;
  if (s === 0) s = 1;

  Math.random = function lcg() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

module.exports = { withDeterministicRandom };
