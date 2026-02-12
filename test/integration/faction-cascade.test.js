'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createTestGameState } = require('../helpers/game-state');

const {
  applyAction, isPortAccessAllowed, getTradePriceModifier,
} = require('../../src/world/factions');

describe('integration: faction cascade', () => {
  it('attacking Danish ships repeatedly → lose port access → pirate rep soars', () => {
    const gs = createTestGameState();
    const rep = gs.reputation;

    // Initial state
    assert.equal(rep.crown, 50);
    assert.ok(isPortAccessAllowed(rep, 'Copenhagen'));

    // Attack Danish vessels 3 times (crown: -15 each = -45 total)
    applyAction(rep, 'attack_danish');
    applyAction(rep, 'attack_danish');
    applyAction(rep, 'attack_danish');

    // Crown should drop to ~5 (50 - 45)
    assert.equal(rep.crown, 5);

    // Copenhagen should now be blocked (requires crown >= 20)
    assert.ok(!isPortAccessAllowed(rep, 'Copenhagen'), 'Copenhagen should be blocked');
    assert.ok(!isPortAccessAllowed(rep, 'Aarhus'), 'Aarhus should be blocked');
    assert.ok(!isPortAccessAllowed(rep, 'Aalborg'), 'Aalborg should be blocked');

    // Minor ports still accessible
    assert.ok(isPortAccessAllowed(rep, 'Skagen'));
    assert.ok(isPortAccessAllowed(rep, 'Gothenburg'));

    // Pirate rep should have increased (3 * +3 = +9)
    assert.equal(rep.pirate, 44); // 35 + 9

    // Merchant rep should have decreased (3 * -5 = -15)
    assert.equal(rep.merchant, 35); // 50 - 15

    // Trade prices should be worse due to low merchant rep
    const priceMod = getTradePriceModifier(rep);
    assert.ok(priceMod.buyMult > 1.0, 'buy prices should be worse');
    assert.ok(priceMod.sellMult < 1.0, 'sell prices should be worse');
  });

  it('attacking merchants boosts pirate rep', () => {
    const gs = createTestGameState();
    const rep = gs.reputation;

    const startPirate = rep.pirate;
    applyAction(rep, 'attack_merchant');
    assert.ok(rep.pirate > startPirate);
    assert.ok(rep.merchant < 50);
  });

  it('trading goods slowly builds merchant rep', () => {
    const gs = createTestGameState();
    const rep = gs.reputation;

    for (let i = 0; i < 10; i++) {
      applyAction(rep, 'trade_goods');
    }
    assert.equal(rep.merchant, 60); // 50 + 10*1
  });
});
