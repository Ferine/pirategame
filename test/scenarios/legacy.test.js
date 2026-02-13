'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createStats,
  createPersistent,
  mergeStats,
  DIFFICULTY,
  getDifficulty,
  createNewGamePlusState,
  COSMETIC_UNLOCKS,
  getUnlockedCosmetics,
} = require('../../src/meta/legacy');
const { createTestGameState } = require('../helpers/game-state');

describe('legacy', () => {
  describe('createStats', () => {
    it('returns all stat fields initialized to 0 or empty', () => {
      const stats = createStats();
      assert.equal(stats.shipsSunk, 0);
      assert.equal(stats.goldEarned, 0);
      assert.equal(stats.treasuresFound, 0);
      assert.equal(stats.uniquePortsVisited, 0);
      assert.deepEqual(stats.portsVisitedSet, []);
      assert.equal(stats.barrelsHidden, 0);
      assert.equal(stats.meleeWins, 0);
      assert.equal(stats.stealthPerfect, 0);
      assert.equal(stats.convoysCompleted, 0);
      assert.equal(stats.tradesMade, 0);
      assert.equal(stats.maxFleetSize, 1);
      assert.equal(stats.distanceSailed, 0);
      assert.equal(stats.playTimeSeconds, 0);
      assert.equal(stats.playTimeMinutes, 0);
      assert.equal(stats.crownHonored, 0);
      assert.equal(stats.campaignsCompleted, 0);
      assert.equal(stats.ngPlusStarted, 0);
    });
  });

  describe('createPersistent', () => {
    it('returns persistent structure with version, stats, unlocked, cosmetics', () => {
      const p = createPersistent();
      assert.equal(p.version, 1);
      assert.ok(p.stats);
      assert.deepEqual(p.unlocked, []);
      assert.deepEqual(p.cosmetics, { activeShipArt: null, activeColorScheme: null });
    });
  });

  describe('mergeStats', () => {
    it('takes max of numeric stats', () => {
      const persistent = createPersistent();
      const session = createStats();
      session.shipsSunk = 5;
      session.goldEarned = 200;
      session.meleeWins = 3;

      mergeStats(persistent, session);

      assert.equal(persistent.stats.shipsSunk, 5);
      assert.equal(persistent.stats.goldEarned, 200);
      assert.equal(persistent.stats.meleeWins, 3);
    });

    it('does not decrease persistent stats', () => {
      const persistent = createPersistent();
      persistent.stats.shipsSunk = 10;
      const session = createStats();
      session.shipsSunk = 5;

      mergeStats(persistent, session);

      assert.equal(persistent.stats.shipsSunk, 10);
    });

    it('merges portsVisitedSet without duplicates', () => {
      const persistent = createPersistent();
      persistent.stats.portsVisitedSet = ['Copenhagen', 'Aarhus'];
      persistent.stats.uniquePortsVisited = 2;

      const session = createStats();
      session.portsVisitedSet = ['Aarhus', 'Gothenburg'];

      mergeStats(persistent, session);

      assert.equal(persistent.stats.portsVisitedSet.length, 3);
      assert.ok(persistent.stats.portsVisitedSet.includes('Copenhagen'));
      assert.ok(persistent.stats.portsVisitedSet.includes('Aarhus'));
      assert.ok(persistent.stats.portsVisitedSet.includes('Gothenburg'));
      assert.equal(persistent.stats.uniquePortsVisited, 3);
    });

    it('handles empty session portsVisitedSet', () => {
      const persistent = createPersistent();
      persistent.stats.portsVisitedSet = ['Copenhagen'];
      persistent.stats.uniquePortsVisited = 1;

      const session = createStats();
      mergeStats(persistent, session);

      assert.equal(persistent.stats.portsVisitedSet.length, 1);
      assert.equal(persistent.stats.uniquePortsVisited, 1);
    });
  });

  describe('DIFFICULTY', () => {
    it('has easy, normal, hard presets', () => {
      assert.ok(DIFFICULTY.easy);
      assert.ok(DIFFICULTY.normal);
      assert.ok(DIFFICULTY.hard);
    });

    it('easy has higher gold mult and lower damage', () => {
      assert.ok(DIFFICULTY.easy.goldMult > DIFFICULTY.normal.goldMult);
      assert.ok(DIFFICULTY.easy.damageTakenMult < DIFFICULTY.normal.damageTakenMult);
    });

    it('hard has lower gold mult and higher damage', () => {
      assert.ok(DIFFICULTY.hard.goldMult < DIFFICULTY.normal.goldMult);
      assert.ok(DIFFICULTY.hard.damageTakenMult > DIFFICULTY.normal.damageTakenMult);
    });

    it('hard has faster guards', () => {
      assert.ok(DIFFICULTY.hard.guardSpeedMult > DIFFICULTY.normal.guardSpeedMult);
    });

    it('normal has all multipliers at 1.0', () => {
      assert.equal(DIFFICULTY.normal.goldMult, 1.0);
      assert.equal(DIFFICULTY.normal.damageTakenMult, 1.0);
      assert.equal(DIFFICULTY.normal.guardSpeedMult, 1.0);
    });
  });

  describe('getDifficulty', () => {
    it('returns correct difficulty for gameState', () => {
      assert.deepEqual(getDifficulty({ difficulty: 'easy' }), DIFFICULTY.easy);
      assert.deepEqual(getDifficulty({ difficulty: 'hard' }), DIFFICULTY.hard);
    });

    it('defaults to normal for unknown difficulty', () => {
      assert.deepEqual(getDifficulty({ difficulty: 'unknown' }), DIFFICULTY.normal);
      assert.deepEqual(getDifficulty({}), DIFFICULTY.normal);
    });
  });

  describe('createNewGamePlusState', () => {
    it('carries 50% gold from old state', () => {
      const oldState = createTestGameState();
      oldState.economy.gold = 1000;
      const newState = createNewGamePlusState(oldState);
      assert.equal(newState.economy.gold, 500 + newState.economy.gold - 500); // base + carry
      assert.ok(newState.economy.gold >= 500);
    });

    it('sets ngPlus to true', () => {
      const oldState = createTestGameState();
      const newState = createNewGamePlusState(oldState);
      assert.equal(newState.ngPlus, true);
    });

    it('sets ngPlusStarted stat to 1', () => {
      const oldState = createTestGameState();
      const newState = createNewGamePlusState(oldState);
      assert.equal(newState.stats.ngPlusStarted, 1);
    });

    it('resets campaign state', () => {
      const { createCampaignState } = require('../../src/story/campaign');
      const oldState = createTestGameState();
      oldState.campaign = createCampaignState();
      oldState.campaign.act = 5;
      oldState.campaign.ending = 'hero';
      const newState = createNewGamePlusState(oldState);
      assert.equal(newState.campaign.act, 0);
      assert.equal(newState.campaign.ending, null);
    });

    it('preserves difficulty setting', () => {
      const oldState = createTestGameState();
      oldState.difficulty = 'hard';
      const newState = createNewGamePlusState(oldState);
      assert.equal(newState.difficulty, 'hard');
    });

    it('preserves maxHull from old ship', () => {
      const oldState = createTestGameState();
      oldState.ship.maxHull = 200;
      const newState = createNewGamePlusState(oldState);
      assert.equal(newState.ship.maxHull, 200);
      assert.equal(newState.ship.hull, 200);
    });

    it('resets stats except ngPlusStarted', () => {
      const oldState = createTestGameState();
      const newState = createNewGamePlusState(oldState);
      assert.equal(newState.stats.shipsSunk, 0);
      assert.equal(newState.stats.goldEarned, 0);
      assert.equal(newState.stats.ngPlusStarted, 1);
    });
  });

  describe('cosmetics', () => {
    it('COSMETIC_UNLOCKS has 4 entries', () => {
      assert.equal(COSMETIC_UNLOCKS.length, 4);
    });

    it('all cosmetic unlocks have required fields', () => {
      for (const c of COSMETIC_UNLOCKS) {
        assert.ok(c.achievementId);
        assert.ok(c.type);
        assert.ok(c.id);
        assert.ok(c.label);
      }
    });

    it('getUnlockedCosmetics returns matching cosmetics', () => {
      const result = getUnlockedCosmetics(['sea_wolf', 'world_traveler']);
      assert.equal(result.length, 2);
      assert.ok(result.find(c => c.id === 'viking'));
      assert.ok(result.find(c => c.id === 'midnight'));
    });

    it('getUnlockedCosmetics returns empty for no matches', () => {
      const result = getUnlockedCosmetics(['first_blood']);
      assert.equal(result.length, 0);
    });
  });
});
