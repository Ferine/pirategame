'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');
const { createTestGameState } = require('../helpers/game-state');

const {
  MOVES, MOVE_LIST, ZONE_LIST, OPPONENT_TEMPLATES,
  createMeleeState, resolveRound, enemyAI,
  checkMeleeEnd, canAffordMove,
} = require('../../src/combat/melee-state');

describe('melee', () => {
  function makeMelee(context, opponentOverride) {
    return withDeterministicRandom(42, () => {
      const gs = createTestGameState();
      return createMeleeState(gs, context || 'duel', opponentOverride);
    });
  }

  describe('createMeleeState', () => {
    it('boarding context uses pirate_crew template', () => {
      const melee = makeMelee('boarding');
      assert.equal(melee.enemy.name, 'Pirate Captain');
      assert.equal(melee.context, 'boarding');
    });

    it('barfight reduces player HP to 60', () => {
      const melee = makeMelee('barfight');
      assert.equal(melee.player.maxHp, 60);
      assert.equal(melee.enemy.name, 'Surly Sailor');
    });

    it('duel defaults to island_rival', () => {
      const melee = makeMelee('duel');
      assert.equal(melee.enemy.name, 'Rival Pirate');
    });
  });

  describe('resolveRound — slash vs dodge', () => {
    it('dodge negates slash damage', () => {
      const melee = makeMelee();
      melee.playerMove = 'slash';
      melee.playerZone = 'mid';
      melee.enemyMove = 'dodge';
      melee.enemyZone = 'mid';

      const startHp = melee.enemy.hp;
      withDeterministicRandom(1, () => resolveRound(melee));
      assert.equal(melee.enemy.hp, startHp); // dodge blocks all damage
    });
  });

  describe('resolveRound — parry riposte', () => {
    it('parry + zone match triggers riposte damage', () => {
      const melee = makeMelee();
      melee.playerMove = 'parry';
      melee.playerZone = 'mid';
      melee.enemyMove = 'slash';
      melee.enemyZone = 'mid';

      withDeterministicRandom(5, () => resolveRound(melee));
      assert.ok(melee.enemy.hp < melee.enemy.maxHp, 'riposte should deal damage');
    });

    it('parry + zone mismatch: no riposte', () => {
      const melee = makeMelee();
      melee.playerMove = 'parry';
      melee.playerZone = 'high';
      melee.enemyMove = 'slash';
      melee.enemyZone = 'low';

      const startEnemyHp = melee.enemy.hp;
      withDeterministicRandom(5, () => resolveRound(melee));
      assert.equal(melee.enemy.hp, startEnemyHp, 'no riposte on zone mismatch');
    });
  });

  describe('stamina tracking', () => {
    it('moves consume stamina', () => {
      const melee = makeMelee();
      melee.playerMove = 'thrust';
      melee.playerZone = 'mid';
      melee.enemyMove = 'dodge';
      melee.enemyZone = 'mid';

      withDeterministicRandom(1, () => resolveRound(melee));
      // thrust costs 35 stam, +15 regen = net -20
      assert.equal(melee.player.stamina, 80);
    });
  });

  describe('canAffordMove', () => {
    it('returns true when stamina sufficient', () => {
      const melee = makeMelee();
      assert.ok(canAffordMove(melee, 'slash'));
      assert.ok(canAffordMove(melee, 'thrust'));
    });

    it('returns false when stamina insufficient', () => {
      const melee = makeMelee();
      melee.player.stamina = 10;
      assert.ok(!canAffordMove(melee, 'slash'));  // needs 20
      assert.ok(!canAffordMove(melee, 'thrust')); // needs 35
      assert.ok(canAffordMove(melee, 'dodge'));    // needs 10
    });
  });

  describe('enemyAI', () => {
    it('picks a valid move and zone', () => {
      const melee = makeMelee();
      withDeterministicRandom(1, () => enemyAI(melee));
      assert.ok(MOVE_LIST.includes(melee.enemyMove));
      assert.ok(ZONE_LIST.includes(melee.enemyZone));
    });

    it('aggressive style favors thrust/slash', () => {
      const melee = makeMelee('boarding'); // aggressive
      const moveCounts = { slash: 0, thrust: 0, parry: 0, dodge: 0 };
      for (let seed = 1; seed <= 100; seed++) {
        withDeterministicRandom(seed, () => enemyAI(melee));
        moveCounts[melee.enemyMove]++;
      }
      assert.ok(moveCounts.thrust + moveCounts.slash > moveCounts.parry + moveCounts.dodge,
        'aggressive should favor attack moves');
    });
  });

  describe('checkMeleeEnd', () => {
    it('player wins when enemy hp <= 0', () => {
      const melee = makeMelee();
      melee.enemy.hp = 0;
      assert.ok(checkMeleeEnd(melee));
      assert.equal(melee.victor, 'player');
    });

    it('enemy wins when player hp <= 0', () => {
      const melee = makeMelee();
      melee.player.hp = 0;
      assert.ok(checkMeleeEnd(melee));
      assert.equal(melee.victor, 'enemy');
    });
  });

  describe('full fight to conclusion', () => {
    it('resolves within 100 rounds', () => {
      const melee = makeMelee();

      for (let round = 0; round < 100; round++) {
        withDeterministicRandom(round + 1, () => {
          enemyAI(melee);
          melee.playerMove = 'slash';
          melee.playerZone = ZONE_LIST[round % 3];
          resolveRound(melee);
        });
        if (checkMeleeEnd(melee)) break;
      }
      assert.ok(melee.victor, 'fight should resolve within 100 rounds');
    });
  });
});
