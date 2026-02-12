'use strict';

/**
 * Day/night cycle — pure computation module (no mutable state).
 *
 * All time state is derived from gameState.quests.day and gameState.quests.clockAccum.
 * A game day is 30 real seconds, split into 4 quarters of 7.5s each.
 */

const QUARTER_SECONDS = 7.5;
const QUARTER_NAMES = ['dawn', 'day', 'dusk', 'night'];

const SEASON_LENGTH = 30; // days per season
const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];

const MOON_CYCLE = 8; // days per full moon cycle
const MOON_PHASES = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous',
                     'full', 'waning gibbous', 'last quarter', 'waning crescent'];
const MOON_ICONS = ['\u25CF', '\u25D1', '\u25D1', '\u25D0',  // new ● , wax-c ◑, 1Q ◑, wax-g ◐
                    '\u25CB', '\u25D0', '\u25D1', '\u25D1'];  // full ○, wan-g ◐, LQ ◑, wan-c ◑

// --- Quarter ---

function getQuarter(clockAccum) {
  const q = Math.floor((clockAccum || 0) / QUARTER_SECONDS);
  return Math.min(q, 3);
}

function getQuarterName(clockAccum) {
  return QUARTER_NAMES[getQuarter(clockAccum)];
}

// --- Season ---

function getSeason(day) {
  const idx = Math.floor(((day - 1) % (SEASON_LENGTH * 4)) / SEASON_LENGTH);
  return { name: SEASON_NAMES[idx], index: idx };
}

// --- Moon ---

function getMoonPhase(day) {
  const idx = (day - 1) % MOON_CYCLE;
  return { phase: MOON_PHASES[idx], index: idx, icon: MOON_ICONS[idx] };
}

function getMoonFOV(day) {
  const idx = (day - 1) % MOON_CYCLE;
  if (idx === 0) return 4;   // new moon — darkest
  if (idx === 4) return 8;   // full moon — brightest
  return 6;                  // other phases
}

// --- Sight Range ---

function getEffectiveSightRange(quests, weatherEffects) {
  if (!quests) return weatherEffects ? weatherEffects.sightRange : 15;

  const quarter = getQuarter(quests.clockAccum);
  const weatherRange = weatherEffects ? weatherEffects.sightRange : 15;

  if (quarter === 1) {
    // day — weather range only
    return weatherRange;
  }

  const moonFov = getMoonFOV(quests.day || 1);

  if (quarter === 3) {
    // night — min of moon FOV and weather range
    return Math.min(moonFov, weatherRange);
  }

  // dawn (0) or dusk (2) — midpoint
  return Math.round((weatherRange + Math.min(moonFov, weatherRange)) / 2);
}

// --- Weather Bias ---

function getWeatherBias(quarter, season) {
  const bias = { clear: 1.0, fog: 1.0, rain: 1.0, storm: 1.0 };

  // Time-of-day bias
  if (quarter === 0 || quarter === 2) {
    // dawn/dusk: fog more common
    bias.fog *= 1.6;
  } else if (quarter === 3) {
    // night: storms more common
    bias.storm *= 1.4;
  }

  // Seasonal bias
  if (season) {
    const idx = typeof season === 'object' ? season.index : season;
    if (idx === 1) {
      // summer: clear weather favored
      bias.clear *= 1.5;
      bias.storm *= 0.5;
    } else if (idx === 3) {
      // winter: storms more frequent
      bias.storm *= 2.5;
      bias.clear *= 0.6;
      bias.rain *= 1.3;
    } else if (idx === 2) {
      // autumn: rain and fog
      bias.rain *= 1.4;
      bias.fog *= 1.3;
    }
    // spring: default multipliers (1.0)
  }

  return bias;
}

// --- Night Dimming ---

function getNightDimLevel(quarter) {
  if (quarter === 1) return 0;          // day
  if (quarter === 0 || quarter === 2) return 1; // dawn/dusk
  return 2;                              // night
}

/**
 * Dim an xterm-256 color index by `steps`.
 * Handles: grayscale 232-255, 6x6x6 cube 16-231, basic 0-15.
 */
function dimColor(color, steps) {
  if (steps <= 0) return color;

  // Grayscale ramp: 232 (darkest) to 255 (lightest)
  if (color >= 232 && color <= 255) {
    return Math.max(232, color - steps * 2);
  }

  // 6x6x6 color cube: 16-231
  if (color >= 16 && color <= 231) {
    const c = color - 16;
    let r = Math.floor(c / 36);
    let g = Math.floor((c % 36) / 6);
    let b = c % 6;
    r = Math.max(0, r - steps);
    g = Math.max(0, g - steps);
    b = Math.max(0, b - steps);
    return 16 + r * 36 + g * 6 + b;
  }

  // Basic 16 colors: 0-15
  if (color >= 8 && color <= 15) {
    // Bright variants → dark variants
    return color - 8;
  }

  // Already a dark basic color (0-7), can't dim further
  return color;
}

// --- Lantern Glow ---

function isInLanternGlow(mx, my, ports) {
  if (!ports) return false;
  for (const port of ports) {
    const px = port.actualX !== undefined ? port.actualX : port.x;
    const py = port.actualY !== undefined ? port.actualY : port.y;
    const dx = mx - px;
    const dy = my - py;
    if (dx * dx + dy * dy <= 9) return true; // within 3 tiles
  }
  return false;
}

module.exports = {
  QUARTER_SECONDS,
  QUARTER_NAMES,
  SEASON_LENGTH,
  SEASON_NAMES,
  MOON_CYCLE,
  MOON_PHASES,
  MOON_ICONS,
  getQuarter,
  getQuarterName,
  getSeason,
  getMoonPhase,
  getMoonFOV,
  getEffectiveSightRange,
  getWeatherBias,
  getNightDimLevel,
  dimColor,
  isInLanternGlow,
};
