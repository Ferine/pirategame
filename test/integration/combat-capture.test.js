'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');
const { createTestGameState } = require('../helpers/game-state');

const {
  createCombatState, calculatePlayerDamage, applyDamageToEnemy,
  checkCombatEnd,
} = require('../../src/combat/combat-state');
const {
  createMeleeState, resolveRound, enemyAI,
  checkMeleeEnd, ZONE_LIST,
} = require('../../src/combat/melee-state');
const { createShip } = require('../../src/fleet/ship-types');
const { addShip } = require('../../src/fleet/fleet');
const { onVictory } = require('../../src/crew/crew');

describe('integration: combat → boarding → ship capture', () => {
  it('cannon combat → melee boarding → fleet capture', () => {
    const gs = withDeterministicRandom(1, () => createTestGameState());

    // Phase 1: Ship-to-ship cannon combat
    const combat = withDeterministicRandom(42, () => createCombatState(gs));
    combat.aim = { offsetX: 0, offsetY: 0 }; // perfect aim
    combat.power = 100;

    for (let round = 0; round < 50; round++) {
      withDeterministicRandom(round + 100, () => {
        const dmg = calculatePlayerDamage(combat);
        applyDamageToEnemy(combat, dmg);
      });
      combat.round++;
      if (checkCombatEnd(combat)) break;
    }

    assert.ok(combat.resolved, 'cannon combat should resolve');
    assert.equal(combat.victor, 'player', 'player should win cannon combat');

    // Phase 2: Boarding melee — give player a strength advantage
    const melee = withDeterministicRandom(42, () => createMeleeState(gs, 'boarding'));
    assert.equal(melee.context, 'boarding');
    melee.player.strength = 20; // strong boarding party
    melee.player.hp = 200;
    melee.player.maxHp = 200;

    for (let round = 0; round < 100; round++) {
      withDeterministicRandom(round + 200, () => {
        enemyAI(melee);
        melee.playerMove = 'slash';
        melee.playerZone = ZONE_LIST[round % 3];
        resolveRound(melee);
      });
      if (checkMeleeEnd(melee)) break;
    }

    assert.ok(melee.victor, 'melee should resolve');
    assert.equal(melee.victor, 'player', 'player should win melee');

    // Phase 3: Capture enemy ship
    const capturedShip = createShip('brigantine', combat.enemy.name);
    assert.ok(capturedShip);
    const added = addShip(gs.fleet, capturedShip);
    assert.ok(added, 'should add captured ship to fleet');
    assert.equal(gs.fleet.ships.length, 2, 'fleet should have 2 ships');

    // Phase 4: Morale boost from victory
    onVictory(gs.crew);
    assert.equal(gs.crew.victories, 1);
    assert.ok(gs.crew.avgMorale > 0);
  });
});
