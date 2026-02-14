'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HAIL_OUTCOMES,
  resolveHailOutcome,
  applyHailEffect,
  getWeatherEncounterPrefix,
} = require('../../src/world/encounter-outcomes');
const { createTestGameState } = require('../helpers/game-state');

describe('encounter-outcomes', () => {
  describe('HAIL_OUTCOMES', () => {
    it('has outcomes for all 4 factions', () => {
      assert.ok(HAIL_OUTCOMES.merchant);
      assert.ok(HAIL_OUTCOMES.english);
      assert.ok(HAIL_OUTCOMES.danish);
      assert.ok(HAIL_OUTCOMES.pirate);
    });

    it('each faction has at least 4 outcomes', () => {
      for (const [faction, outcomes] of Object.entries(HAIL_OUTCOMES)) {
        assert.ok(outcomes.length >= 4, `${faction} has ${outcomes.length} outcomes`);
      }
    });

    it('each outcome has id, weight, text', () => {
      for (const [faction, outcomes] of Object.entries(HAIL_OUTCOMES)) {
        for (const o of outcomes) {
          assert.ok(o.id, `${faction} outcome missing id`);
          assert.ok(o.weight > 0, `${faction}/${o.id} missing weight`);
          assert.ok(o.text, `${faction}/${o.id} missing text`);
        }
      }
    });
  });

  describe('resolveHailOutcome', () => {
    it('returns valid outcome for merchant', () => {
      const result = resolveHailOutcome('merchant');
      assert.ok(result.id);
      assert.ok(result.text);
    });

    it('returns valid outcome for english', () => {
      const result = resolveHailOutcome('english');
      assert.ok(result.id);
      assert.ok(result.text);
    });

    it('returns valid outcome for pirate', () => {
      const result = resolveHailOutcome('pirate');
      assert.ok(result.id);
      assert.ok(result.text);
    });

    it('returns valid outcome for danish', () => {
      const result = resolveHailOutcome('danish');
      assert.ok(result.id);
      assert.ok(result.text);
    });

    it('fills placeholders in text', () => {
      // Run many times to catch placeholder filling
      for (let i = 0; i < 50; i++) {
        const result = resolveHailOutcome('merchant');
        assert.ok(!result.text.includes('{port}'), 'Unfilled {port} placeholder');
        assert.ok(!result.text.includes('{good}'), 'Unfilled {good} placeholder');
      }
    });

    it('returns fallback for unknown faction', () => {
      const result = resolveHailOutcome('alien');
      assert.equal(result.id, 'nothing');
    });
  });

  describe('applyHailEffect', () => {
    it('gold effect adds gold', () => {
      const gs = createTestGameState();
      const initialGold = gs.economy.gold;
      const result = applyHailEffect({ type: 'gold', amount: 10 }, null, gs);
      assert.equal(gs.economy.gold, initialGold + 10);
      assert.ok(result.text.includes('10'));
    });

    it('cargo effect adds cargo', () => {
      const gs = createTestGameState();
      const result = applyHailEffect({ type: 'cargo', good: 'silk' }, null, gs);
      assert.equal(gs.economy.cargo.silk, 2);
      assert.ok(result.text.includes('silk'));
    });

    it('trade_offer accept costs gold and gives cargo', () => {
      const gs = createTestGameState();
      const initialGold = gs.economy.gold;
      const result = applyHailEffect({ type: 'trade_offer' }, 'accept', gs);
      assert.ok(gs.economy.gold < initialGold);
      assert.ok(result.repChanges.length > 0);
    });

    it('demand_cargo comply removes cargo', () => {
      const gs = createTestGameState();
      gs.economy.cargo = { cod: 5 };
      const result = applyHailEffect({ type: 'demand_cargo' }, 'comply', gs);
      assert.ok(gs.economy.cargo.cod < 5);
      assert.ok(result.text.includes('cod'));
    });

    it('papers_check with bribe costs gold', () => {
      const gs = createTestGameState();
      const initialGold = gs.economy.gold;
      applyHailEffect({ type: 'papers_check' }, 'bribe', gs);
      assert.ok(gs.economy.gold < initialGold);
    });

    it('null effect returns empty', () => {
      const gs = createTestGameState();
      const result = applyHailEffect(null, null, gs);
      assert.equal(result.text, '');
      assert.deepStrictEqual(result.repChanges, []);
    });
  });

  describe('getWeatherEncounterPrefix', () => {
    it('returns fog prefix', () => {
      assert.ok(getWeatherEncounterPrefix('fog').includes('fog'));
    });

    it('returns rain prefix', () => {
      assert.ok(getWeatherEncounterPrefix('rain').includes('rain'));
    });

    it('returns storm prefix', () => {
      assert.ok(getWeatherEncounterPrefix('storm').includes('Lightning'));
    });

    it('returns empty for clear', () => {
      assert.equal(getWeatherEncounterPrefix('clear'), '');
    });
  });
});
