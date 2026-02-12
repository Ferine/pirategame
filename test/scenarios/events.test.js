'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');

const {
  createEventsState, onDayAdvance,
  isPortAffected, getTradePriceMult, isPortClosed,
  updateEventNotifications,
} = require('../../src/world/events');

describe('events', () => {
  describe('createEventsState', () => {
    it('starts with empty active and notifications', () => {
      const e = createEventsState();
      assert.deepEqual(e.active, []);
      assert.deepEqual(e.notifications, []);
    });
  });

  describe('onDayAdvance — event spawn', () => {
    it('can spawn an event on day advance', () => {
      let spawned = false;
      for (let seed = 1; seed <= 30 && !spawned; seed++) {
        const gs = {
          events: createEventsState(),
          reputation: { crown: 50, merchant: 50, pirate: 35 },
        };
        withDeterministicRandom(seed, () => onDayAdvance(gs, 2));
        if (gs.events.active.length > 0) spawned = true;
      }
      assert.ok(spawned, 'at least one event should spawn in 30 attempts');
    });
  });

  describe('onDayAdvance — event expiry', () => {
    it('removes events past their endDay', () => {
      const gs = {
        events: {
          active: [{ type: 'trade_boom', port: 'Skagen', startDay: 1, endDay: 4 }],
          notifications: [],
        },
        reputation: { crown: 50, merchant: 50, pirate: 35 },
      };
      withDeterministicRandom(999, () => onDayAdvance(gs, 4));
      assert.equal(gs.events.active.filter(e => e.port === 'Skagen' && e.type === 'trade_boom').length, 0);
    });
  });

  describe('getTradePriceMult', () => {
    it('returns 1.3 during trade boom', () => {
      const events = {
        active: [{ type: 'trade_boom', port: 'Skagen', startDay: 1, endDay: 4 }],
      };
      assert.equal(getTradePriceMult(events, 'Skagen'), 1.3);
    });

    it('returns 1.0 without trade boom', () => {
      const events = { active: [] };
      assert.equal(getTradePriceMult(events, 'Skagen'), 1.0);
    });

    it('returns 1.0 for unaffected port', () => {
      const events = {
        active: [{ type: 'trade_boom', port: 'Copenhagen', startDay: 1, endDay: 4 }],
      };
      assert.equal(getTradePriceMult(events, 'Skagen'), 1.0);
    });
  });

  describe('isPortClosed', () => {
    it('plague closes port', () => {
      const events = {
        active: [{ type: 'plague', port: 'Aalborg', startDay: 1, endDay: 4 }],
      };
      assert.ok(isPortClosed(events, 'Aalborg'));
    });

    it('non-plague port is open', () => {
      const events = {
        active: [{ type: 'trade_boom', port: 'Aalborg', startDay: 1, endDay: 4 }],
      };
      assert.ok(!isPortClosed(events, 'Aalborg'));
    });
  });

  describe('pirate_raid reputation shifts', () => {
    it('pirate raid boosts pirate rep and hurts merchant rep', () => {
      const gs = {
        events: createEventsState(),
        reputation: { crown: 50, merchant: 50, pirate: 35 },
      };
      // Manually inject a pirate raid
      gs.events.active.push({ type: 'pirate_raid', port: 'Skagen', startDay: 1, endDay: 3 });

      // Simulate pirate_raid spawn by calling onDayAdvance with seed that triggers raid
      // Instead, test the effect directly: the pirate_raid code modifies rep in onDayAdvance
      // so we test via a fresh call
      const gs2 = {
        events: { active: [], notifications: [] },
        reputation: { crown: 50, merchant: 50, pirate: 35 },
      };

      // Run many seeds until pirate_raid spawns
      let raidSpawned = false;
      for (let seed = 1; seed <= 200 && !raidSpawned; seed++) {
        gs2.events = { active: [], notifications: [] };
        gs2.reputation = { crown: 50, merchant: 50, pirate: 35 };
        withDeterministicRandom(seed, () => onDayAdvance(gs2, 2));
        if (gs2.events.active.some(e => e.type === 'pirate_raid')) {
          raidSpawned = true;
          assert.ok(gs2.reputation.pirate > 35, 'pirate rep should increase');
          assert.ok(gs2.reputation.merchant < 50, 'merchant rep should decrease');
        }
      }
      assert.ok(raidSpawned, 'pirate_raid should spawn within 200 attempts');
    });
  });

  describe('updateEventNotifications', () => {
    it('removes expired notifications', () => {
      const events = {
        notifications: [
          { text: 'msg1', timer: 1 },
          { text: 'msg2', timer: 5 },
        ],
      };
      updateEventNotifications(events, 2);
      assert.equal(events.notifications.length, 1);
      assert.equal(events.notifications[0].text, 'msg2');
    });
  });
});
