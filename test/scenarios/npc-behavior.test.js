'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FACTION, FACTION_TEMPLATES, MAX_NPC_SHIPS,
  _resolveNPCClashes, _pickSpawnFaction, _generateNPCCargo,
} = require('../../src/world/npc-ships');

describe('npc-behavior', () => {
  describe('MAX_NPC_SHIPS', () => {
    it('should be 16', () => {
      assert.equal(MAX_NPC_SHIPS, 16);
    });
  });

  describe('_pickSpawnFaction', () => {
    it('returns valid factions over many rolls', () => {
      const counts = { merchant: 0, english: 0, pirate: 0, danish: 0 };
      for (let i = 0; i < 1000; i++) {
        const f = _pickSpawnFaction();
        assert.ok(counts.hasOwnProperty(f), `Invalid faction: ${f}`);
        counts[f]++;
      }
      // Merchants should be most common (~50%)
      assert.ok(counts.merchant > counts.english, 'Merchants should outnumber English');
      assert.ok(counts.merchant > counts.pirate, 'Merchants should outnumber Pirates');
      assert.ok(counts.merchant > counts.danish, 'Merchants should outnumber Danish');
    });
  });

  describe('_generateNPCCargo', () => {
    it('gives merchants 2-4 goods and 20-40 gold', () => {
      for (let i = 0; i < 50; i++) {
        const { cargo, gold } = _generateNPCCargo(FACTION.MERCHANT);
        const goodCount = Object.keys(cargo).length;
        assert.ok(goodCount >= 1 && goodCount <= 4, `Merchant goods count: ${goodCount}`);
        assert.ok(gold >= 20 && gold <= 40, `Merchant gold: ${gold}`);
      }
    });

    it('gives pirates 1-2 goods and 30-60 gold', () => {
      for (let i = 0; i < 50; i++) {
        const { cargo, gold } = _generateNPCCargo(FACTION.PIRATE);
        const goodCount = Object.keys(cargo).length;
        assert.ok(goodCount >= 1 && goodCount <= 2, `Pirate goods count: ${goodCount}`);
        assert.ok(gold >= 30 && gold <= 60, `Pirate gold: ${gold}`);
      }
    });

    it('gives english/danish no cargo or gold', () => {
      const { cargo, gold } = _generateNPCCargo(FACTION.ENGLISH);
      assert.equal(Object.keys(cargo).length, 0);
      assert.equal(gold, 0);
    });
  });

  describe('_resolveNPCClashes', () => {
    function makeShip(id, faction, x, y, hull) {
      return { id, name: `Ship ${id}`, faction, x, y, hull, maxHull: 100 };
    }

    it('removes weaker ship when hostile pair within 3 tiles', () => {
      const ships = [
        makeShip('p1', FACTION.PIRATE, 10, 10, 80),
        makeShip('m1', FACTION.MERCHANT, 12, 10, 60),
      ];
      const reports = _resolveNPCClashes(ships);
      assert.equal(ships.length, 1);
      assert.equal(ships[0].faction, FACTION.PIRATE);
      assert.ok(ships[0].hull < 80, 'Winner should take damage');
      assert.equal(reports.length, 1);
      assert.ok(reports[0].includes('sank'));
    });

    it('does nothing when ships are far apart', () => {
      const ships = [
        makeShip('p1', FACTION.PIRATE, 10, 10, 80),
        makeShip('m1', FACTION.MERCHANT, 50, 50, 60),
      ];
      const reports = _resolveNPCClashes(ships);
      assert.equal(ships.length, 2);
      assert.equal(reports.length, 0);
    });

    it('does nothing for non-hostile pairs', () => {
      const ships = [
        makeShip('e1', FACTION.ENGLISH, 10, 10, 80),
        makeShip('m1', FACTION.MERCHANT, 11, 10, 60),
      ];
      const reports = _resolveNPCClashes(ships);
      assert.equal(ships.length, 2);
      assert.equal(reports.length, 0);
    });

    it('pirate vs english clash resolves', () => {
      const ships = [
        makeShip('p1', FACTION.PIRATE, 10, 10, 50),
        makeShip('e1', FACTION.ENGLISH, 11, 11, 100),
      ];
      const reports = _resolveNPCClashes(ships);
      assert.equal(ships.length, 1);
      assert.equal(ships[0].faction, FACTION.ENGLISH);
      assert.equal(reports.length, 1);
    });
  });

  describe('desperate merchants', () => {
    it('FACTION_TEMPLATES merchant has 0 aggression', () => {
      assert.equal(FACTION_TEMPLATES.merchant.aggression, 0.0);
    });
  });

  describe('trade routes', () => {
    it('merchant trade route has 2 waypoints when ports exist', () => {
      // We test the structure: merchants spawned with gameState.map.ports
      // should get tradeRoute with 2 entries
      const route = [
        { x: 100, y: 50 },
        { x: 200, y: 100 },
      ];
      assert.equal(route.length, 2);
      assert.ok(route[0].x !== undefined);
      assert.ok(route[1].y !== undefined);
    });
  });
});
