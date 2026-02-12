'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');
const { createTestGameState } = require('../helpers/game-state');

const {
  createCombatState, calculatePlayerDamage, applyDamageToEnemy,
  enemyFire, checkCombatEnd, HIT_RADIUS, NEAR_MISS_RADIUS,
} = require('../../src/combat/combat-state');

describe('combat', () => {
  function makeCombat(overrides) {
    return withDeterministicRandom(42, () => {
      const gs = createTestGameState();
      const combat = createCombatState(gs);
      if (overrides) Object.assign(combat, overrides);
      return combat;
    });
  }

  describe('createCombatState', () => {
    it('creates valid combat state from gameState', () => {
      const combat = makeCombat();
      assert.ok(combat.player);
      assert.ok(combat.enemy);
      assert.equal(combat.round, 1);
      assert.equal(combat.ammoType, 'iron');
      assert.equal(combat.ammoInventory.iron, 20);
      assert.equal(combat.resolved, false);
    });
  });

  describe('calculatePlayerDamage', () => {
    it('direct hit (distance < HIT_RADIUS) deals full damage', () => {
      const combat = makeCombat();
      combat.aim = { offsetX: 0, offsetY: 0 };
      combat.power = 80;
      combat.ammoType = 'iron';

      const dmg = withDeterministicRandom(10, () => calculatePlayerDamage(combat));
      assert.ok(dmg.hit);
      assert.ok(dmg.hullDmg > 0);
      assert.equal(dmg.hitQuality, 1.0);
    });

    it('near-miss (HIT_RADIUS < dist < NEAR_MISS_RADIUS) deals reduced damage', () => {
      const combat = makeCombat();
      combat.aim = { offsetX: 8, offsetY: 0 }; // distance = 8, between 6 and 12
      combat.power = 80;

      const dmg = withDeterministicRandom(10, () => calculatePlayerDamage(combat));
      assert.ok(dmg.hit);
      assert.equal(dmg.hitQuality, 0.4);
    });

    it('complete miss (dist >= NEAR_MISS_RADIUS) deals zero', () => {
      const combat = makeCombat();
      combat.aim = { offsetX: 20, offsetY: 0 };
      combat.power = 80;

      const dmg = calculatePlayerDamage(combat);
      assert.ok(!dmg.hit);
      assert.equal(dmg.hullDmg, 0);
    });

    it('chain shot deals mast damage on direct hit with power > 60', () => {
      const combat = makeCombat();
      combat.aim = { offsetX: 0, offsetY: 0 };
      combat.power = 80;
      combat.ammoType = 'chain';

      const dmg = withDeterministicRandom(10, () => calculatePlayerDamage(combat));
      assert.equal(dmg.mastDmg, 1);
    });

    it('chain shot no mast damage at low power', () => {
      const combat = makeCombat();
      combat.aim = { offsetX: 0, offsetY: 0 };
      combat.power = 40;
      combat.ammoType = 'chain';

      const dmg = withDeterministicRandom(10, () => calculatePlayerDamage(combat));
      assert.equal(dmg.mastDmg, 0);
    });
  });

  describe('applyDamageToEnemy', () => {
    it('reduces enemy hull and crew', () => {
      const combat = makeCombat();
      const startHull = combat.enemy.hull;
      const dmg = { hit: true, hullDmg: 15, crewDmg: 3, mastDmg: 0, hitQuality: 1.0 };
      applyDamageToEnemy(combat, dmg);
      assert.equal(combat.enemy.hull, startHull - 15);
    });

    it('consumes ammo', () => {
      const combat = makeCombat();
      const startAmmo = combat.ammoInventory.iron;
      applyDamageToEnemy(combat, { hit: true, hullDmg: 10, crewDmg: 0, mastDmg: 0, hitQuality: 1.0 });
      assert.equal(combat.ammoInventory.iron, startAmmo - 1);
    });

    it('adds to combat log', () => {
      const combat = makeCombat();
      assert.equal(combat.combatLog.length, 0);
      applyDamageToEnemy(combat, { hit: true, hullDmg: 10, crewDmg: 0, mastDmg: 0, hitQuality: 1.0 });
      assert.equal(combat.combatLog.length, 1);
    });
  });

  describe('enemyFire', () => {
    it('sometimes hits and deals damage', () => {
      let hitOnce = false;
      for (let seed = 1; seed <= 20; seed++) {
        const combat = makeCombat();
        const startHull = combat.player.hull;
        withDeterministicRandom(seed, () => enemyFire(combat));
        if (combat.player.hull < startHull) hitOnce = true;
      }
      assert.ok(hitOnce, 'enemy should hit at least once in 20 attempts');
    });
  });

  describe('checkCombatEnd', () => {
    it('player wins when enemy hull reaches 0', () => {
      const combat = makeCombat();
      combat.enemy.hull = 0;
      assert.ok(checkCombatEnd(combat));
      assert.equal(combat.victor, 'player');
    });

    it('enemy wins when player hull reaches 0', () => {
      const combat = makeCombat();
      combat.player.hull = 0;
      assert.ok(checkCombatEnd(combat));
      assert.equal(combat.victor, 'enemy');
    });

    it('enemy wins when player crew reaches 0', () => {
      const combat = makeCombat();
      combat.player.crew = 0;
      assert.ok(checkCombatEnd(combat));
      assert.equal(combat.victor, 'enemy');
    });

    it('combat continues when both sides alive', () => {
      const combat = makeCombat();
      assert.ok(!checkCombatEnd(combat));
    });
  });

  describe('multi-round to resolution', () => {
    it('combat resolves within 50 rounds of direct hits', () => {
      const combat = makeCombat();
      combat.aim = { offsetX: 0, offsetY: 0 };
      combat.power = 100;

      for (let round = 0; round < 50; round++) {
        withDeterministicRandom(round + 1, () => {
          const dmg = calculatePlayerDamage(combat);
          applyDamageToEnemy(combat, dmg);
          enemyFire(combat);
        });
        combat.round++;
        if (checkCombatEnd(combat)) break;
      }
      assert.ok(combat.resolved, 'combat should resolve within 50 rounds');
    });
  });
});
