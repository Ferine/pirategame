'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ACHIEVEMENTS, checkAchievements, getAchievement } = require('../../src/meta/achievements');
const { createStats } = require('../../src/meta/legacy');

describe('achievements', () => {
  describe('ACHIEVEMENTS', () => {
    it('has 20 achievements defined', () => {
      assert.equal(ACHIEVEMENTS.length, 20);
    });

    it('all achievements have required fields', () => {
      for (const ach of ACHIEVEMENTS) {
        assert.ok(ach.id, `missing id`);
        assert.ok(ach.title, `${ach.id} missing title`);
        assert.ok(ach.icon, `${ach.id} missing icon`);
        assert.ok(ach.stat, `${ach.id} missing stat`);
        assert.ok(typeof ach.threshold === 'number', `${ach.id} missing threshold`);
        assert.ok(ach.threshold > 0, `${ach.id} threshold must be positive`);
      }
    });

    it('all achievement IDs are unique', () => {
      const ids = ACHIEVEMENTS.map(a => a.id);
      assert.equal(ids.length, new Set(ids).size);
    });

    it('all achievement stats exist in createStats', () => {
      const stats = createStats();
      for (const ach of ACHIEVEMENTS) {
        assert.ok(ach.stat in stats, `stat '${ach.stat}' for ${ach.id} not in createStats`);
      }
    });
  });

  describe('getAchievement', () => {
    it('returns achievement by id', () => {
      const ach = getAchievement('first_blood');
      assert.ok(ach);
      assert.equal(ach.title, 'First Blood');
      assert.equal(ach.stat, 'shipsSunk');
      assert.equal(ach.threshold, 1);
    });

    it('returns null for unknown id', () => {
      assert.equal(getAchievement('nonexistent'), null);
    });
  });

  describe('checkAchievements', () => {
    it('returns empty array when no thresholds met', () => {
      const stats = createStats();
      const result = checkAchievements(stats, []);
      assert.deepEqual(result, []);
    });

    it('unlocks first_blood when shipsSunk >= 1', () => {
      const stats = createStats();
      stats.shipsSunk = 1;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('first_blood'));
    });

    it('unlocks sea_wolf when shipsSunk >= 10', () => {
      const stats = createStats();
      stats.shipsSunk = 10;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('first_blood'));
      assert.ok(result.includes('sea_wolf'));
    });

    it('does not re-unlock already unlocked achievements', () => {
      const stats = createStats();
      stats.shipsSunk = 10;
      const result = checkAchievements(stats, ['first_blood']);
      assert.ok(!result.includes('first_blood'));
      assert.ok(result.includes('sea_wolf'));
    });

    it('unlocks explorer when uniquePortsVisited >= 5', () => {
      const stats = createStats();
      stats.uniquePortsVisited = 5;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('explorer'));
      assert.ok(!result.includes('world_traveler'));
    });

    it('unlocks gold_hoarder when goldEarned >= 1000', () => {
      const stats = createStats();
      stats.goldEarned = 1000;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('gold_hoarder'));
      assert.ok(!result.includes('merchant_prince'));
    });

    it('unlocks multiple achievements at once', () => {
      const stats = createStats();
      stats.shipsSunk = 1;
      stats.treasuresFound = 1;
      stats.barrelsHidden = 1;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('first_blood'));
      assert.ok(result.includes('treasure_hunter'));
      assert.ok(result.includes('barrel_rider'));
      assert.equal(result.length, 3);
    });

    it('unlocks crown_hero when crownHonored >= 1', () => {
      const stats = createStats();
      stats.crownHonored = 1;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('crown_hero'));
    });

    it('unlocks conspiracy when campaignsCompleted >= 1', () => {
      const stats = createStats();
      stats.campaignsCompleted = 1;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('conspiracy'));
    });

    it('unlocks ng_plus when ngPlusStarted >= 1', () => {
      const stats = createStats();
      stats.ngPlusStarted = 1;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('ng_plus'));
    });

    it('threshold boundary: value exactly at threshold unlocks', () => {
      const stats = createStats();
      stats.meleeWins = 5;
      const result = checkAchievements(stats, []);
      assert.ok(result.includes('swordsman'));
    });

    it('threshold boundary: value below threshold does not unlock', () => {
      const stats = createStats();
      stats.meleeWins = 4;
      const result = checkAchievements(stats, []);
      assert.ok(!result.includes('swordsman'));
    });
  });
});
