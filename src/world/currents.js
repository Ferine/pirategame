'use strict';

/**
 * Deterministic ocean currents based on position.
 * Sine wave patterns, stronger through the narrows (Helsingor/Helsingborg area).
 */

// Narrows center (Helsingor/Helsingborg at ~x:150, y:90)
const NARROWS_X = 150;
const NARROWS_Y = 90;
const NARROWS_RADIUS = 30;

/**
 * Get the current direction and strength at a position.
 * Returns { direction (0-7), strength (0.0-1.0) }
 */
function getCurrentAt(x, y) {
  // Base current flows in a sine wave pattern
  const wave = Math.sin(x * 0.05) * Math.cos(y * 0.07);
  // Direction: quantize wave to 0-7
  const angle = (wave + 1) * Math.PI; // 0 to 2pi
  const direction = Math.round(angle / (Math.PI / 4)) % 8;

  // Base strength from wave amplitude
  let strength = 0.3 + Math.abs(wave) * 0.3;

  // Stronger through the narrows
  const dx = x - NARROWS_X;
  const dy = y - NARROWS_Y;
  const distToNarrows = Math.sqrt(dx * dx + dy * dy);
  if (distToNarrows < NARROWS_RADIUS) {
    const narrowsFactor = 1 + (1 - distToNarrows / NARROWS_RADIUS) * 0.5;
    strength *= narrowsFactor;
  }

  return { direction, strength: Math.min(1.0, strength) };
}

/**
 * Get speed multiplier based on ship direction vs current direction.
 * With current: +30% speed. Against: -20%.
 */
function getCurrentSpeedMult(current, shipDir) {
  if (!current || current.strength < 0.1) return 1.0;

  let diff = Math.abs(shipDir - current.direction);
  if (diff > 4) diff = 8 - diff;

  // 0 = same direction (boost), 4 = opposite (penalty)
  const factor = current.strength;
  if (diff <= 1) return 1.0 + 0.3 * factor;      // with current
  if (diff >= 3) return 1.0 - 0.2 * factor;       // against current
  return 1.0;                                       // perpendicular
}

module.exports = {
  getCurrentAt,
  getCurrentSpeedMult,
};
