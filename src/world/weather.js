'use strict';

/**
 * Weather system for Kattegat Kaper.
 *
 * Four weather types with transitions on a timer.
 * Effects modify sight range, ship speed, hull damage, and spyglass sway.
 */

const WEATHER_TYPES = ['clear', 'fog', 'rain', 'storm'];

const WEATHER_EFFECTS = {
  clear: { sightRange: 15, speedMult: 1.0, hullDmg: 0,   swayMult: 1.0, label: 'Clear',  icon: '\u2600' }, // ☀
  fog:   { sightRange: 8,  speedMult: 1.0, hullDmg: 0,   swayMult: 1.0, label: 'Fog',    icon: '\u2591' }, // ░
  rain:  { sightRange: 12, speedMult: 0.85, hullDmg: 0,  swayMult: 1.3, label: 'Rain',   icon: '/' },
  storm: { sightRange: 6,  speedMult: 0.6, hullDmg: 0.5, swayMult: 1.8, label: 'Storm',  icon: '\u26A1' }, // ⚡
};

// Fog hides NPC ships beyond this range
const FOG_HIDE_RANGE = 5;

// Transition weights: [clear, fog, rain, storm]
const TRANSITION_WEIGHTS = {
  clear: [0.0, 0.45, 0.45, 0.10],
  fog:   [0.40, 0.0, 0.40, 0.20],
  rain:  [0.35, 0.30, 0.0, 0.35],
  storm: [0.25, 0.25, 0.50, 0.0],
};

// Rain particle chars
const RAIN_CHARS = ['|', '/', '\\'];

// Fog particle chars
const FOG_CHARS = ['\u2591', '\u00B7']; // ░ ·

/**
 * Create initial weather state.
 */
function createWeatherState() {
  return {
    type: 'clear',
    intensity: 0,
    changeTimer: 40,
    damageTimer: 0,
  };
}

/**
 * Update weather: handle transitions and storm damage timer.
 */
function updateWeather(weather, dt, bias) {
  weather.changeTimer -= dt;

  if (weather.changeTimer <= 0) {
    // Transition to new weather type, optionally biased by time/season
    const baseWeights = TRANSITION_WEIGHTS[weather.type];
    const weights = baseWeights.slice();

    // Apply bias multipliers if provided
    if (bias) {
      for (let i = 0; i < WEATHER_TYPES.length; i++) {
        const key = WEATHER_TYPES[i];
        if (bias[key] !== undefined) {
          weights[i] *= bias[key];
        }
      }
    }

    // Normalize weights
    const total = weights.reduce((s, w) => s + w, 0);
    if (total > 0) {
      for (let i = 0; i < weights.length; i++) weights[i] /= total;
    }

    const roll = Math.random();
    let cumulative = 0;
    let nextType = 'clear';

    for (let i = 0; i < WEATHER_TYPES.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) {
        nextType = WEATHER_TYPES[i];
        break;
      }
    }

    weather.type = nextType;
    weather.intensity = 0.5 + Math.random() * 0.5;
    weather.changeTimer = 30 + Math.random() * 30; // 30-60s
    weather.damageTimer = 0;
  }

  // Storm damage timer
  if (weather.type === 'storm') {
    weather.damageTimer += dt;
  } else {
    weather.damageTimer = 0;
  }
}

/**
 * Get current weather effects.
 */
function getWeatherEffects(weather) {
  return WEATHER_EFFECTS[weather.type] || WEATHER_EFFECTS.clear;
}

module.exports = {
  WEATHER_TYPES,
  WEATHER_EFFECTS,
  FOG_HIDE_RANGE,
  RAIN_CHARS,
  FOG_CHARS,
  createWeatherState,
  updateWeather,
  getWeatherEffects,
};
