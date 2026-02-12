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
  });
});
