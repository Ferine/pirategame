'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DAY_SECONDS, MAX_ACTIVE_QUESTS,
  createQuestState, advanceQuestTime,
  getPortOffers, acceptPortOffer,
  abandonActiveQuest, recordShipDefeat,
  resolvePortArrivalQuests,
} = require('../../src/world/quests');

const PORT_NAMES = ['Skagen', 'Frederikshavn', 'Aalborg', 'Aarhus',
  'Helsingor', 'Helsingborg', 'Copenhagen', 'Malmo', 'Gothenburg'];

describe('quests', () => {
  describe('createQuestState', () => {
    it('starts at day 1 with empty lists', () => {
      const q = createQuestState();
      assert.equal(q.day, 1);
      assert.equal(q.clockAccum, 0);
      assert.deepEqual(q.active, []);
      assert.deepEqual(q.history, []);
    });
  });

  describe('advanceQuestTime', () => {
    it('accumulates sub-day seconds', () => {
      const q = createQuestState();
      const days = advanceQuestTime(q, 15);
      assert.equal(days, 0);
      assert.equal(q.clockAccum, 15);
    });

    it('advances day after 30 seconds', () => {
      const q = createQuestState();
      const days = advanceQuestTime(q, DAY_SECONDS);
      assert.equal(days, 1);
      assert.equal(q.day, 2);
    });

    it('handles multiple days at once', () => {
      const q = createQuestState();
      const days = advanceQuestTime(q, DAY_SECONDS * 3 + 10);
      assert.equal(days, 3);
      assert.equal(q.day, 4);
      assert.ok(Math.abs(q.clockAccum - 10) < 0.001);
    });
  });

  describe('getPortOffers', () => {
    it('generates 4 offers per port', () => {
      const q = createQuestState();
      const offers = getPortOffers(q, 'Skagen', PORT_NAMES);
      assert.equal(offers.length, 4);
    });

    it('last offer is a hunt quest', () => {
      const q = createQuestState();
      const offers = getPortOffers(q, 'Skagen', PORT_NAMES);
      assert.equal(offers[3].type, 'hunt');
    });

    it('first 3 offers are delivery quests', () => {
      const q = createQuestState();
      const offers = getPortOffers(q, 'Skagen', PORT_NAMES);
      for (let i = 0; i < 3; i++) {
        assert.equal(offers[i].type, 'delivery');
      }
    });

    it('caches offers for same port+day', () => {
      const q = createQuestState();
      const a = getPortOffers(q, 'Skagen', PORT_NAMES);
      const b = getPortOffers(q, 'Skagen', PORT_NAMES);
      assert.equal(a, b); // same reference
    });
  });

  describe('acceptPortOffer', () => {
    it('moves offer to active quests', () => {
      const q = createQuestState();
      const offers = getPortOffers(q, 'Skagen', PORT_NAMES);
      const questId = offers[0].id;
      const result = acceptPortOffer(q, 'Skagen', questId);
      assert.ok(result.ok);
      assert.equal(q.active.length, 1);
      assert.equal(q.active[0].id, questId);
    });

    it('rejects when at MAX_ACTIVE_QUESTS', () => {
      const q = createQuestState();
      // Fill up active quests
      for (let i = 0; i < MAX_ACTIVE_QUESTS; i++) {
        q.active.push({ id: `dummy${i}`, type: 'delivery' });
      }
      const offers = getPortOffers(q, 'Aalborg', PORT_NAMES);
      const result = acceptPortOffer(q, 'Aalborg', offers[0].id);
      assert.ok(!result.ok);
      assert.ok(result.reason.includes('5'));
    });
  });

  describe('recordShipDefeat — hunt progress', () => {
    it('increments hunt progress for matching faction', () => {
      const q = createQuestState();
      q.active.push({
        id: 'H1', type: 'hunt', targetFaction: 'pirate',
        required: 2, progress: 0, deadlineDay: 100, title: 'Hunt Pirates',
      });

      const updates = recordShipDefeat(q, 'pirate');
      assert.ok(updates.length > 0);
      assert.equal(q.active[0].progress, 1);
    });

    it('does not increment for wrong faction', () => {
      const q = createQuestState();
      q.active.push({
        id: 'H1', type: 'hunt', targetFaction: 'pirate',
        required: 2, progress: 0, deadlineDay: 100, title: 'Hunt Pirates',
      });

      const updates = recordShipDefeat(q, 'english');
      assert.equal(updates.length, 0);
      assert.equal(q.active[0].progress, 0);
    });
  });

  describe('deadline expiry', () => {
    it('expired quests fail on port arrival', () => {
      const gs = {
        quests: createQuestState(),
        economy: { gold: 0, cargo: {} },
        reputation: { crown: 50, merchant: 50 },
      };
      gs.quests.day = 100;
      gs.quests.active.push({
        id: 'D1', type: 'delivery', targetPort: 'Skagen',
        goodId: 'cod', qty: 3, deadlineDay: 5, title: 'Old Delivery',
        rewardGold: 50, rewardRep: { merchant: 5 },
      });

      const events = resolvePortArrivalQuests(gs, 'Skagen');
      assert.ok(events.some(e => e.includes('failed')));
      assert.equal(gs.quests.active.length, 0);
      assert.equal(gs.quests.history.length, 1);
      assert.equal(gs.quests.history[0].status, 'failed');
    });
  });
});
