'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  QUARTER_SECONDS, QUARTER_NAMES, SEASON_LENGTH, SEASON_NAMES,
  MOON_CYCLE, MOON_PHASES,
  getQuarter, getQuarterName, getSeason, getMoonPhase, getMoonFOV,
  getEffectiveSightRange, getWeatherBias,
} = require('../../src/world/day-night');

describe('day-night', () => {
  describe('getQuarter', () => {
    it('0s = dawn (quarter 0)', () => {
      assert.equal(getQuarter(0), 0);
      assert.equal(getQuarterName(0), 'dawn');
    });

    it('7.5s = day (quarter 1)', () => {
      assert.equal(getQuarter(QUARTER_SECONDS), 1);
      assert.equal(getQuarterName(QUARTER_SECONDS), 'day');
    });

    it('15s = dusk (quarter 2)', () => {
      assert.equal(getQuarter(QUARTER_SECONDS * 2), 2);
      assert.equal(getQuarterName(QUARTER_SECONDS * 2), 'dusk');
    });

    it('22.5s = night (quarter 3)', () => {
      assert.equal(getQuarter(QUARTER_SECONDS * 3), 3);
      assert.equal(getQuarterName(QUARTER_SECONDS * 3), 'night');
    });

    it('clamps to max 3', () => {
      assert.equal(getQuarter(999), 3);
    });
  });

  describe('getSeason', () => {
    it('day 1 = spring', () => {
      assert.equal(getSeason(1).name, 'spring');
      assert.equal(getSeason(1).index, 0);
    });

    it('day 31 = summer', () => {
      assert.equal(getSeason(31).name, 'summer');
    });

    it('day 61 = autumn', () => {
      assert.equal(getSeason(61).name, 'autumn');
    });

    it('day 91 = winter', () => {
      assert.equal(getSeason(91).name, 'winter');
    });

    it('day 121 = spring again (cycles)', () => {
      assert.equal(getSeason(121).name, 'spring');
    });
  });

  describe('getMoonPhase', () => {
    it('day 1 = new moon', () => {
      assert.equal(getMoonPhase(1).phase, 'new');
      assert.equal(getMoonPhase(1).index, 0);
    });

    it('day 5 = full moon', () => {
      assert.equal(getMoonPhase(5).phase, 'full');
    });

    it('cycles every 8 days', () => {
      assert.equal(getMoonPhase(1).phase, getMoonPhase(9).phase);
    });
  });

  describe('getMoonFOV', () => {
    it('new moon (day 1) = 4 (darkest)', () => {
      assert.equal(getMoonFOV(1), 4);
    });

    it('full moon (day 5) = 8 (brightest)', () => {
      assert.equal(getMoonFOV(5), 8);
    });

    it('other phases = 6', () => {
      assert.equal(getMoonFOV(2), 6);
      assert.equal(getMoonFOV(3), 6);
    });
  });

  describe('getEffectiveSightRange', () => {
    it('daytime returns weather range only', () => {
      const quests = { day: 1, clockAccum: QUARTER_SECONDS }; // day quarter
      const range = getEffectiveSightRange(quests, { sightRange: 15 });
      assert.equal(range, 15);
    });

    it('night + new moon = minimum sight (4)', () => {
      const quests = { day: 1, clockAccum: QUARTER_SECONDS * 3 }; // night, day 1 = new moon
      const range = getEffectiveSightRange(quests, { sightRange: 15 });
      assert.equal(range, 4); // min(moonFOV=4, weatherRange=15)
    });

    it('night + full moon = 8', () => {
      const quests = { day: 5, clockAccum: QUARTER_SECONDS * 3 }; // night, day 5 = full moon
      const range = getEffectiveSightRange(quests, { sightRange: 15 });
      assert.equal(range, 8);
    });

    it('dawn/dusk is midpoint', () => {
      const quests = { day: 5, clockAccum: 0 }; // dawn, full moon
      const range = getEffectiveSightRange(quests, { sightRange: 15 });
      // midpoint of weatherRange(15) and min(moonFOV=8, 15) = (15+8)/2 = 11.5 → 12
      assert.equal(range, 12);
    });
  });

  describe('getWeatherBias', () => {
    it('dawn/dusk increases fog bias', () => {
      const bias = getWeatherBias(0); // dawn
      assert.ok(bias.fog > 1.0);
    });

    it('night increases storm bias', () => {
      const bias = getWeatherBias(3); // night
      assert.ok(bias.storm > 1.0);
    });

    it('summer favors clear, reduces storms', () => {
      const bias = getWeatherBias(1, { index: 1 }); // day, summer
      assert.ok(bias.clear > 1.0);
      assert.ok(bias.storm < 1.0);
    });

    it('winter increases storms heavily', () => {
      const bias = getWeatherBias(1, { index: 3 }); // day, winter
      assert.ok(bias.storm > 2.0);
      assert.ok(bias.clear < 1.0);
    });
  });
});
