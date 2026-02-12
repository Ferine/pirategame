'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');

const {
  WEATHER_TYPES, WEATHER_EFFECTS,
  createWeatherState, updateWeather, getWeatherEffects,
} = require('../../src/world/weather');

describe('weather', () => {
  describe('createWeatherState', () => {
    it('starts clear with timer', () => {
      const w = createWeatherState();
      assert.equal(w.type, 'clear');
      assert.equal(w.intensity, 0);
      assert.equal(w.changeTimer, 40);
      assert.equal(w.damageTimer, 0);
    });
  });

  describe('updateWeather', () => {
    it('decrements timer by dt', () => {
      const w = createWeatherState();
      updateWeather(w, 5);
      assert.equal(w.changeTimer, 35);
    });

    it('transitions when timer expires', () => {
      const w = createWeatherState();
      w.changeTimer = 1;
      withDeterministicRandom(42, () => updateWeather(w, 2));
      assert.ok(WEATHER_TYPES.includes(w.type));
      assert.ok(w.changeTimer > 0, 'timer should be reset');
    });

    it('applies bias to transition weights', () => {
      // Heavily bias toward storm
      const w = createWeatherState();
      w.changeTimer = 0;
      const bias = { clear: 0, fog: 0, rain: 0, storm: 100 };
      withDeterministicRandom(1, () => updateWeather(w, 1, bias));
      assert.equal(w.type, 'storm');
    });

    it('increments damageTimer during storm', () => {
      const w = { type: 'storm', intensity: 0.8, changeTimer: 50, damageTimer: 0 };
      updateWeather(w, 3);
      assert.equal(w.damageTimer, 3);
    });

    it('resets damageTimer when not storm', () => {
      const w = { type: 'clear', intensity: 0.5, changeTimer: 50, damageTimer: 5 };
      updateWeather(w, 1);
      assert.equal(w.damageTimer, 0);
    });
  });

  describe('getWeatherEffects', () => {
    it('returns correct effects for each type', () => {
      for (const type of WEATHER_TYPES) {
        const effects = getWeatherEffects({ type });
        assert.equal(effects, WEATHER_EFFECTS[type]);
        assert.ok(effects.sightRange > 0);
        assert.ok(effects.speedMult > 0);
      }
    });

    it('clear has full sight range and speed', () => {
      const effects = getWeatherEffects({ type: 'clear' });
      assert.equal(effects.sightRange, 15);
      assert.equal(effects.speedMult, 1.0);
    });

    it('storm reduces speed and sight', () => {
      const effects = getWeatherEffects({ type: 'storm' });
      assert.ok(effects.speedMult < 1.0);
      assert.ok(effects.sightRange < 15);
      assert.ok(effects.hullDmg > 0);
    });
  });
});
