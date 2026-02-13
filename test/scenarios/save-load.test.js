'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');
const { createTestGameState } = require('../helpers/game-state');

const {
  serializeGameState, deserializeGameState,
} = require('../../src/engine/save-load');

describe('save-load', () => {
  describe('round-trip', () => {
    it('serializes and deserializes all fields', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      original.economy.gold = 500;
      original.economy.cargo = { cod: 5, iron: 3 };
      original.ship.hull = 75;
      original.reputation.crown = 80;
      original.crtEnabled = true;

      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      const ok = deserializeGameState(json, restored);

      assert.ok(ok);
      assert.equal(restored.ship.hull, 75);
      assert.equal(restored.economy.gold, 500);
      assert.equal(restored.economy.cargo.cod, 5);
      assert.equal(restored.reputation.crown, 80);
      assert.equal(restored.crtEnabled, true);
    });

    it('preserves crew members', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      deserializeGameState(json, restored);

      assert.equal(restored.crew.members.length, original.crew.members.length);
      assert.equal(restored.crew.members[0].name, original.crew.members[0].name);
    });

    it('preserves fleet state', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      deserializeGameState(json, restored);

      assert.equal(restored.fleet.ships.length, original.fleet.ships.length);
      assert.equal(restored.fleet.flagshipId, original.fleet.flagshipId);
    });

    it('preserves quests state', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      original.quests.day = 15;
      original.quests.active.push({
        id: 'Q1', type: 'delivery', title: 'test quest',
      });

      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      deserializeGameState(json, restored);

      assert.equal(restored.quests.day, 15);
      assert.equal(restored.quests.active.length, 1);
    });
  });

  describe('invalid JSON', () => {
    it('returns false for garbage input', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      assert.equal(deserializeGameState('not valid json', gs), false);
    });

    it('returns false for null data', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      assert.equal(deserializeGameState('null', gs), false);
    });
  });

  describe('missing ship', () => {
    it('returns false when ship is missing', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      assert.equal(deserializeGameState('{"version":1}', gs), false);
    });
  });

  describe('corrupt save does not modify state', () => {
    it('returns false and preserves original hull on corrupt data', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      const originalHull = gs.ship.hull;
      const originalGold = gs.economy.gold;

      // Corrupt JSON: valid JSON but missing ship field
      const ok = deserializeGameState('{"version":1,"economy":{"gold":9999}}', gs);
      assert.equal(ok, false);
      assert.equal(gs.ship.hull, originalHull);
      assert.equal(gs.economy.gold, originalGold);
    });

    it('returns false for truncated save data', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      const ok = deserializeGameState('{"version":1,"ship":{"x":50', gs);
      assert.equal(ok, false);
    });
  });

  describe('campaign round-trip', () => {
    it('preserves campaign state with act and key items', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      const { createCampaignState, addKeyItem } = require('../../src/story/campaign');
      original.campaign = createCampaignState();
      original.campaign.act = 3;
      original.campaign.phase = 'fort_infiltration';
      addKeyItem(original.campaign, 'letter');
      addKeyItem(original.campaign, 'dispatches');
      original.campaign.flags.letterFound = true;
      original.campaign.flags.informantMet = true;
      original.campaign.journalEntries.push({ act: 1, title: 'Test', text: 'Test entry', day: 5 });

      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      const ok = deserializeGameState(json, restored);

      assert.ok(ok);
      assert.ok(restored.campaign);
      assert.equal(restored.campaign.act, 3);
      assert.equal(restored.campaign.phase, 'fort_infiltration');
      assert.deepEqual(restored.campaign.keyItems, ['letter', 'dispatches']);
      assert.equal(restored.campaign.flags.letterFound, true);
      assert.equal(restored.campaign.flags.informantMet, true);
      assert.equal(restored.campaign.journalEntries.length, 1);
    });

    it('handles old saves without campaign by creating fresh state', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      const oldSave = JSON.stringify({
        version: 1,
        ship: { x: 100, y: 50, hull: 80, maxHull: 100, name: 'OldShip' },
        wind: { direction: 1, strength: 2, changeTimer: 20 },
      });
      const ok = deserializeGameState(oldSave, gs);
      assert.ok(ok);
      assert.ok(gs.campaign);
      assert.equal(gs.campaign.act, 0);
      assert.deepEqual(gs.campaign.keyItems, []);
    });
  });

  describe('old save compatibility', () => {
    it('creates fleet when missing from save', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      const oldSave = JSON.stringify({
        version: 1,
        ship: { x: 100, y: 50, hull: 80, maxHull: 100, name: 'OldShip' },
        wind: { direction: 1, strength: 2, changeTimer: 20 },
      });
      const ok = deserializeGameState(oldSave, gs);
      assert.ok(ok);
      assert.ok(gs.fleet);
      assert.ok(gs.fleet.ships.length > 0);
    });

    it('clears stale event notifications on load', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      const save = JSON.stringify({
        version: 1,
        ship: { x: 100, y: 50, hull: 100, maxHull: 100, name: 'Test' },
        events: {
          active: [],
          notifications: [{ text: 'stale', timer: 3 }],
        },
      });
      deserializeGameState(save, gs);
      assert.equal(gs.events.notifications.length, 0);
    });

    it('creates campaign from old save without campaign field', () => {
      const gs = withDeterministicRandom(1, () => createTestGameState());
      const oldSave = JSON.stringify({
        version: 1,
        ship: { x: 100, y: 50, hull: 80, maxHull: 100, name: 'OldShip' },
        wind: { direction: 1, strength: 2, changeTimer: 20 },
      });
      const ok = deserializeGameState(oldSave, gs);
      assert.ok(ok);
      assert.ok(gs.campaign);
      assert.equal(gs.campaign.act, 0);
      assert.equal(gs.campaign.ending, null);
      assert.deepEqual(gs.campaign.keyItems, []);
      assert.deepEqual(gs.campaign.flags, {});
    });
  });

  describe('Phase 20 fields round-trip', () => {
    it('preserves stats through serialize/deserialize', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      original.stats.shipsDefeated = 7;
      original.stats.goldEarned = 1500;
      original.stats.stealthPerfect = 2;

      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      const ok = deserializeGameState(json, restored);

      assert.ok(ok);
      assert.equal(restored.stats.shipsDefeated, 7);
      assert.equal(restored.stats.goldEarned, 1500);
      assert.equal(restored.stats.stealthPerfect, 2);
    });

    it('preserves captainsLog through serialize/deserialize', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      original.captainsLog.entries.push({ type: 'port_visit', text: 'Visited Helsingor', day: 3 });
      original.captainsLog.entries.push({ type: 'combat', text: 'Sank a frigate', day: 5 });

      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      const ok = deserializeGameState(json, restored);

      assert.ok(ok);
      assert.equal(restored.captainsLog.entries.length, 2);
      assert.equal(restored.captainsLog.entries[0].text, 'Visited Helsingor');
    });

    it('preserves difficulty and ngPlus through serialize/deserialize', () => {
      const original = withDeterministicRandom(1, () => createTestGameState());
      original.difficulty = 'hard';
      original.ngPlus = true;

      const json = serializeGameState(original);
      const restored = withDeterministicRandom(2, () => createTestGameState());
      const ok = deserializeGameState(json, restored);

      assert.ok(ok);
      assert.equal(restored.difficulty, 'hard');
      assert.equal(restored.ngPlus, true);
    });
  });
});
