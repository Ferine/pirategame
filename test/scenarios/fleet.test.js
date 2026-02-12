'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_FLEET_SIZE, createFleetState, getFlagship,
  addShip, removeShip, setFlagship,
  syncToGameState, syncFromGameState, getEffectiveStats,
} = require('../../src/fleet/fleet');
const { createShip } = require('../../src/fleet/ship-types');
const { createTestGameState } = require('../helpers/game-state');

describe('fleet', () => {
  describe('createFleetState', () => {
    it('starts with one sloop as flagship', () => {
      const fleet = createFleetState('TestShip');
      assert.equal(fleet.ships.length, 1);
      assert.equal(fleet.ships[0].name, 'TestShip');
      assert.equal(fleet.ships[0].typeId, 'sloop');
      assert.equal(fleet.flagshipId, fleet.ships[0].id);
    });
  });

  describe('addShip', () => {
    it('adds ships up to MAX_FLEET_SIZE', () => {
      const fleet = createFleetState('Flag');
      for (let i = 1; i < MAX_FLEET_SIZE; i++) {
        const ship = createShip('brigantine', `Ship${i}`);
        assert.ok(addShip(fleet, ship));
      }
      assert.equal(fleet.ships.length, MAX_FLEET_SIZE);
    });

    it('rejects 5th ship', () => {
      const fleet = createFleetState('Flag');
      for (let i = 1; i < MAX_FLEET_SIZE; i++) {
        addShip(fleet, createShip('sloop', `S${i}`));
      }
      const extra = createShip('sloop', 'TooMany');
      assert.ok(!addShip(fleet, extra));
      assert.equal(fleet.ships.length, MAX_FLEET_SIZE);
    });
  });

  describe('removeShip', () => {
    it('cannot remove the flagship', () => {
      const fleet = createFleetState('Flag');
      const result = removeShip(fleet, fleet.flagshipId);
      assert.equal(result, null);
      assert.equal(fleet.ships.length, 1);
    });

    it('removes a non-flagship ship', () => {
      const fleet = createFleetState('Flag');
      const second = createShip('brigantine', 'Second');
      addShip(fleet, second);
      const removed = removeShip(fleet, second.id);
      assert.equal(removed.name, 'Second');
      assert.equal(fleet.ships.length, 1);
    });
  });

  describe('setFlagship', () => {
    it('switches flagship to another ship', () => {
      const fleet = createFleetState('Flag');
      const second = createShip('frigate', 'NewFlag');
      addShip(fleet, second);
      assert.ok(setFlagship(fleet, second.id));
      assert.equal(fleet.flagshipId, second.id);
    });

    it('returns false for unknown ship id', () => {
      const fleet = createFleetState('Flag');
      assert.ok(!setFlagship(fleet, 'nonexistent'));
    });
  });

  describe('syncToGameState / syncFromGameState round-trip', () => {
    it('pushes flagship stats into gameState and back', () => {
      const gs = createTestGameState();
      const fleet = gs.fleet;

      // Modify flagship hull via game state
      gs.ship.hull = 80;
      gs.ship.maxHull = 125;
      gs.economy.cargoMax = 30;

      // Sync into fleet
      syncFromGameState(fleet, gs);
      const flagship = getFlagship(fleet);
      assert.equal(flagship.hull, 80);

      // Reset game state values
      gs.ship.hull = 999;
      gs.ship.maxHull = 999;

      // Sync back from fleet
      syncToGameState(fleet, gs);
      assert.equal(gs.ship.hull, 80);
      assert.equal(gs.ship.name, 'Drakar');
    });
  });

  describe('getEffectiveStats', () => {
    it('returns base stats plus bonuses', () => {
      const ship = createShip('sloop', 'Test');
      ship.hullBonus = 25;
      ship.cannonBonus = 1;
      const stats = getEffectiveStats(ship);
      assert.equal(stats.maxHull, 125);  // 100 + 25
      assert.equal(stats.cannons, 3);    // 2 + 1
      assert.equal(stats.masts, 2);
    });
  });
});
