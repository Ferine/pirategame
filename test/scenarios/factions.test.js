'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createReputationState, getRepTier, applyRepChanges, applyAction,
  getAttackAction, getDefeatAction, getHailAction,
  getTradePriceModifier, getHarborDifficulty, getEncounterAggression,
  isPortAccessAllowed, ACTIONS,
} = require('../../src/world/factions');

describe('factions', () => {
  describe('createReputationState', () => {
    it('returns expected initial values', () => {
      const rep = createReputationState();
      assert.equal(rep.crown, 50);
      assert.equal(rep.smuggler, 30);
      assert.equal(rep.navy, 40);
      assert.equal(rep.merchant, 50);
      assert.equal(rep.pirate, 35);
    });
  });

  describe('getRepTier', () => {
    it('returns Hated at 0', () => {
      assert.equal(getRepTier(0).label, 'Hated');
    });

    it('returns Neutral at 50', () => {
      assert.equal(getRepTier(50).label, 'Neutral');
    });

    it('returns Honored at 100', () => {
      assert.equal(getRepTier(100).label, 'Honored');
    });

    it('returns correct tier at boundary 15', () => {
      assert.equal(getRepTier(15).label, 'Hostile');
    });

    it('returns correct tier at boundary 85', () => {
      assert.equal(getRepTier(85).label, 'Honored');
    });
  });

  describe('applyRepChanges', () => {
    it('applies positive and negative deltas', () => {
      const rep = createReputationState();
      applyRepChanges(rep, { crown: 10, merchant: -5 });
      assert.equal(rep.crown, 60);
      assert.equal(rep.merchant, 45);
    });

    it('clamps to 0-100', () => {
      const rep = { crown: 5, merchant: 95 };
      applyRepChanges(rep, { crown: -20, merchant: 20 });
      assert.equal(rep.crown, 0);
      assert.equal(rep.merchant, 100);
    });

    it('returns descriptions of changes', () => {
      const rep = createReputationState();
      const result = applyRepChanges(rep, { crown: 10 });
      assert.ok(result.length > 0);
      assert.ok(result[0].includes('Danish Crown'));
    });

    it('ignores unknown faction keys', () => {
      const rep = createReputationState();
      applyRepChanges(rep, { alien: 99 });
      assert.equal(rep.crown, 50); // unchanged
    });
  });

  describe('applyAction — attack_english ripple', () => {
    it('boosts crown, navy, pirate; hurts merchant', () => {
      const rep = createReputationState();
      applyAction(rep, 'attack_english');
      assert.equal(rep.crown, 58);    // +8
      assert.equal(rep.navy, 50);     // +10
      assert.equal(rep.pirate, 40);   // +5
      assert.equal(rep.merchant, 48); // -2
      assert.equal(rep.smuggler, 32); // +2
    });
  });

  describe('applyAction — attack_danish cascade', () => {
    it('drops crown significantly', () => {
      const rep = createReputationState();
      applyAction(rep, 'attack_danish');
      assert.equal(rep.crown, 35);    // -15
      assert.equal(rep.merchant, 45); // -5
      assert.equal(rep.pirate, 38);   // +3
    });
  });

  describe('tier transitions', () => {
    it('dropping crown from 50 to 5 changes tier from Neutral to Hated', () => {
      const rep = createReputationState();
      assert.equal(getRepTier(rep.crown).label, 'Neutral');
      rep.crown = 5;
      assert.equal(getRepTier(rep.crown).label, 'Hated');
    });
  });

  describe('getAttackAction / getDefeatAction / getHailAction', () => {
    it('returns correct action IDs', () => {
      assert.equal(getAttackAction('english'), 'attack_english');
      assert.equal(getAttackAction('merchant'), 'attack_merchant');
      assert.equal(getDefeatAction('english'), 'defeat_english');
      assert.equal(getHailAction('danish'), 'hail_danish');
    });

    it('returns null for unknown faction', () => {
      assert.equal(getAttackAction('alien'), null);
      assert.equal(getDefeatAction('pirate'), null);
    });
  });

  describe('getTradePriceModifier', () => {
    it('neutral merchant rep gives 1.0x multipliers', () => {
      const rep = { merchant: 50 };
      const mod = getTradePriceModifier(rep);
      assert.ok(Math.abs(mod.buyMult - 1.0) < 0.001);
      assert.ok(Math.abs(mod.sellMult - 1.0) < 0.001);
    });

    it('max merchant rep gives better prices', () => {
      const rep = { merchant: 100 };
      const mod = getTradePriceModifier(rep);
      assert.ok(mod.buyMult < 1.0);    // cheaper buys
      assert.ok(mod.sellMult > 1.0);   // better sells
    });

    it('low merchant rep gives worse prices', () => {
      const rep = { merchant: 10 };
      const mod = getTradePriceModifier(rep);
      assert.ok(mod.buyMult > 1.0);
      assert.ok(mod.sellMult < 1.0);
    });
  });

  describe('isPortAccessAllowed', () => {
    it('allows access to Copenhagen with crown >= 20', () => {
      assert.ok(isPortAccessAllowed({ crown: 50 }, 'Copenhagen'));
    });

    it('blocks Copenhagen when crown < 20', () => {
      assert.ok(!isPortAccessAllowed({ crown: 19 }, 'Copenhagen'));
    });

    it('blocks Aarhus when crown < 20', () => {
      assert.ok(!isPortAccessAllowed({ crown: 10 }, 'Aarhus'));
    });

    it('allows minor ports regardless of crown', () => {
      assert.ok(isPortAccessAllowed({ crown: 0 }, 'Skagen'));
      assert.ok(isPortAccessAllowed({ crown: 0 }, 'Gothenburg'));
    });
  });

  describe('getHarborDifficulty', () => {
    it('low navy rep gives low difficulty', () => {
      // navy: 1 to avoid || fallback; result = 0.5 + (1/100)*1.5 = 0.515
      assert.ok(getHarborDifficulty({ navy: 1 }) < 0.6);
    });

    it('returns 2.0 at navy=100', () => {
      assert.ok(Math.abs(getHarborDifficulty({ navy: 100 }) - 2.0) < 0.01);
    });
  });

  describe('getEncounterAggression', () => {
    it('high navy rep increases english aggression', () => {
      const agg = getEncounterAggression({ navy: 100, pirate: 35 });
      assert.ok(agg.english > 0.9);
    });

    it('high pirate rep decreases pirate aggression', () => {
      const agg = getEncounterAggression({ navy: 40, pirate: 100 });
      assert.ok(agg.pirate < 0.5);
    });
  });
});
