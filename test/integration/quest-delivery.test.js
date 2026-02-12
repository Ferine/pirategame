'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createTestGameState } = require('../helpers/game-state');

const {
  getPortOffers, acceptPortOffer, resolvePortArrivalQuests,
} = require('../../src/world/quests');

const PORT_NAMES = ['Skagen', 'Frederikshavn', 'Aalborg', 'Aarhus',
  'Helsingor', 'Helsingborg', 'Copenhagen', 'Malmo', 'Gothenburg'];

describe('integration: quest delivery', () => {
  it('accept delivery quest → stock cargo → arrive at target → reward', () => {
    const gs = createTestGameState();
    const startGold = gs.economy.gold;

    // Step 1: Get offers at Skagen
    const offers = getPortOffers(gs.quests, 'Skagen', PORT_NAMES);
    assert.ok(offers.length > 0);

    // Find a delivery quest
    const delivery = offers.find(o => o.type === 'delivery');
    assert.ok(delivery, 'should have a delivery quest');

    // Step 2: Accept the quest
    const result = acceptPortOffer(gs.quests, 'Skagen', delivery.id);
    assert.ok(result.ok);
    assert.equal(gs.quests.active.length, 1);

    const quest = gs.quests.active[0];
    const { targetPort, goodId, qty, rewardGold } = quest;

    // Step 3: Stock the required cargo
    gs.economy.cargo[goodId] = qty;

    // Step 4: Arrive at the target port (before deadline)
    const events = resolvePortArrivalQuests(gs, targetPort);

    // Step 5: Assert quest completed
    assert.ok(events.some(e => e.includes('fulfilled')), `should fulfill quest: ${events}`);
    assert.equal(gs.quests.active.length, 0, 'quest should be removed from active');
    assert.equal(gs.quests.history.length, 1);
    assert.equal(gs.quests.history[0].status, 'success');

    // Gold should increase by reward amount
    assert.equal(gs.economy.gold, startGold + rewardGold);

    // Cargo should be consumed
    assert.ok(!gs.economy.cargo[goodId] || gs.economy.cargo[goodId] === 0,
      'cargo should be consumed');
  });

  it('arrival at wrong port does not complete quest', () => {
    const gs = createTestGameState();

    const offers = getPortOffers(gs.quests, 'Skagen', PORT_NAMES);
    const delivery = offers.find(o => o.type === 'delivery');
    acceptPortOffer(gs.quests, 'Skagen', delivery.id);

    const quest = gs.quests.active[0];
    gs.economy.cargo[quest.goodId] = quest.qty;

    // Arrive at a different port
    const wrongPort = PORT_NAMES.find(p => p !== quest.targetPort);
    const events = resolvePortArrivalQuests(gs, wrongPort);

    assert.equal(gs.quests.active.length, 1, 'quest should still be active');
    assert.ok(!events.some(e => e.includes('fulfilled')));
  });

  it('insufficient cargo does not complete quest', () => {
    const gs = createTestGameState();

    const offers = getPortOffers(gs.quests, 'Skagen', PORT_NAMES);
    const delivery = offers.find(o => o.type === 'delivery');
    acceptPortOffer(gs.quests, 'Skagen', delivery.id);

    const quest = gs.quests.active[0];
    gs.economy.cargo[quest.goodId] = quest.qty - 1; // one short

    const events = resolvePortArrivalQuests(gs, quest.targetPort);
    assert.equal(gs.quests.active.length, 1, 'quest should still be active');
  });
});
