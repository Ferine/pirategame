'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createConvoyState,
  updateConvoy,
  toggleFormation,
  getFormationBonus,
  checkConvoyArrival,
  damageEscort,
  checkConvoyFailed,
  getEscortCombatBonus,
  shouldSpawnAmbush,
  spawnAmbushNPC,
  createBlockadeState,
  updateBlockade,
  checkBlockadeSuccess,
} = require('../../src/convoy/convoy');

// Minimal quest for testing
function makeEscortQuest(overrides = {}) {
  return {
    id: 'Q1',
    type: 'escort',
    title: 'Escort convoy to Copenhagen',
    targetPort: 'Copenhagen',
    escortCount: 1,
    timeLimit: 75,
    rewardGold: 200,
    rewardRep: { merchant: 8, crown: 3 },
    ...overrides,
  };
}

function makeBlockadeQuest(overrides = {}) {
  return {
    id: 'Q2',
    type: 'blockade',
    title: 'Smuggle cargo to Malmo',
    targetPort: 'Malmo',
    rewardGold: 250,
    rewardRep: { smuggler: 10, merchant: 3, crown: -2 },
    ...overrides,
  };
}

// Minimal map for testing
function makeTestMap() {
  const tiles = new Uint8Array(300 * 200);
  tiles.fill(1); // all ocean (passable)
  return { tiles, width: 300, height: 200 };
}

describe('convoy', () => {
  describe('createConvoyState', () => {
    it('creates valid state with 1 escort', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      assert.equal(convoy.questId, 'Q1');
      assert.equal(convoy.escorts.length, 1);
      assert.equal(convoy.escorts[0].alive, true);
      assert.equal(convoy.formation, 'tight');
      assert.equal(convoy.timer, 75);
      assert.equal(convoy.targetPort, 'Copenhagen');
      assert.equal(convoy.originPort, 'Skagen');
      assert.equal(convoy.active, true);
      assert.equal(convoy.ambushesSpawned, 0);
      assert.equal(convoy.maxAmbushes, 3);
    });

    it('creates state with 2 escorts when escortCount is 2', () => {
      const convoy = createConvoyState(makeEscortQuest({ escortCount: 2 }), 'Skagen');
      assert.equal(convoy.escorts.length, 2);
      assert.ok(convoy.escorts[0].id !== convoy.escorts[1].id);
    });

    it('uses quest timeLimit for timer', () => {
      const convoy = createConvoyState(makeEscortQuest({ timeLimit: 90 }), 'Skagen');
      assert.equal(convoy.timer, 90);
    });
  });

  describe('updateConvoy', () => {
    it('decrements timer', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      const ship = { x: 100, y: 100, direction: 0 };
      const wind = { direction: 2, strength: 3 };
      const map = makeTestMap();

      updateConvoy(convoy, ship, wind, map, 5.0);
      assert.ok(convoy.timer < 75);
      assert.ok(Math.abs(convoy.timer - 70) < 0.01);
    });

    it('moves escorts toward player position', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.escorts[0].x = 90;
      convoy.escorts[0].y = 90;
      const ship = { x: 100, y: 100, direction: 4 }; // heading south
      const wind = { direction: 2, strength: 3 };
      const map = makeTestMap();

      const startX = convoy.escorts[0].x;
      const startY = convoy.escorts[0].y;

      // Run several ticks to allow movement
      for (let i = 0; i < 20; i++) {
        updateConvoy(convoy, ship, wind, map, 0.5);
      }

      const dx = convoy.escorts[0].x - startX;
      const dy = convoy.escorts[0].y - startY;
      // Should have moved closer to the player
      assert.ok(Math.abs(dx) > 0 || Math.abs(dy) > 0, 'Escort should have moved');
    });

    it('does not update dead escorts', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.escorts[0].alive = false;
      convoy.escorts[0].x = 50;
      convoy.escorts[0].y = 50;
      const ship = { x: 100, y: 100, direction: 0 };
      const wind = { direction: 2, strength: 3 };
      const map = makeTestMap();

      updateConvoy(convoy, ship, wind, map, 1.0);
      assert.equal(convoy.escorts[0].x, 50);
      assert.equal(convoy.escorts[0].y, 50);
    });
  });

  describe('toggleFormation', () => {
    it('switches tight to spread', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      assert.equal(convoy.formation, 'tight');
      toggleFormation(convoy);
      assert.equal(convoy.formation, 'spread');
    });

    it('switches spread back to tight', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      toggleFormation(convoy);
      toggleFormation(convoy);
      assert.equal(convoy.formation, 'tight');
    });
  });

  describe('getFormationBonus', () => {
    it('returns tight bonuses', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      const bonus = getFormationBonus(convoy);
      assert.equal(bonus.speedMult, 0.85);
      assert.equal(bonus.defenseMult, 1.3);
    });

    it('returns spread bonuses', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      toggleFormation(convoy);
      const bonus = getFormationBonus(convoy);
      assert.equal(bonus.speedMult, 1.0);
      assert.equal(bonus.defenseMult, 0.8);
    });

    it('returns neutral for null convoy', () => {
      const bonus = getFormationBonus(null);
      assert.equal(bonus.speedMult, 1.0);
      assert.equal(bonus.defenseMult, 1.0);
    });
  });

  describe('checkConvoyArrival', () => {
    it('returns true when port matches target', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      assert.ok(checkConvoyArrival(convoy, 'Copenhagen'));
    });

    it('returns false for wrong port', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      assert.ok(!checkConvoyArrival(convoy, 'Malmo'));
    });

    it('returns false when inactive', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.active = false;
      assert.ok(!checkConvoyArrival(convoy, 'Copenhagen'));
    });
  });

  describe('damageEscort', () => {
    it('reduces escort hull', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      const escortId = convoy.escorts[0].id;
      damageEscort(convoy, escortId, 20);
      assert.equal(convoy.escorts[0].hull, 40);
    });

    it('kills escort at hull 0', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      const escortId = convoy.escorts[0].id;
      damageEscort(convoy, escortId, 100);
      assert.equal(convoy.escorts[0].hull, 0);
      assert.equal(convoy.escorts[0].alive, false);
    });

    it('does nothing for invalid escort id', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      damageEscort(convoy, 'nonexistent', 50);
      assert.equal(convoy.escorts[0].hull, 60);
    });
  });

  describe('checkConvoyFailed', () => {
    it('returns true when all escorts dead', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.escorts[0].alive = false;
      assert.ok(checkConvoyFailed(convoy));
    });

    it('returns true when timer expired', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.timer = -1;
      assert.ok(checkConvoyFailed(convoy));
    });

    it('returns false when escort alive and time remains', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      assert.ok(!checkConvoyFailed(convoy));
    });

    it('returns false for null convoy', () => {
      assert.ok(!checkConvoyFailed(null));
    });
  });

  describe('getEscortCombatBonus', () => {
    it('returns +1 per alive escort', () => {
      const convoy = createConvoyState(makeEscortQuest({ escortCount: 2 }), 'Skagen');
      assert.equal(getEscortCombatBonus(convoy), 2);
    });

    it('excludes dead escorts', () => {
      const convoy = createConvoyState(makeEscortQuest({ escortCount: 2 }), 'Skagen');
      convoy.escorts[0].alive = false;
      assert.equal(getEscortCombatBonus(convoy), 1);
    });

    it('returns 0 for inactive convoy', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.active = false;
      assert.equal(getEscortCombatBonus(convoy), 0);
    });

    it('returns 0 for null convoy', () => {
      assert.equal(getEscortCombatBonus(null), 0);
    });
  });

  describe('shouldSpawnAmbush', () => {
    it('returns false while on cooldown', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      assert.ok(!shouldSpawnAmbush(convoy, 0.1));
    });

    it('returns true when cooldown expired and under max', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.ambushCooldown = 0;
      assert.ok(shouldSpawnAmbush(convoy, 0.1));
    });

    it('returns false when max ambushes reached', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.ambushCooldown = 0;
      convoy.ambushesSpawned = 3;
      assert.ok(!shouldSpawnAmbush(convoy, 0.1));
    });

    it('returns false for inactive convoy', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.active = false;
      convoy.ambushCooldown = 0;
      assert.ok(!shouldSpawnAmbush(convoy, 0.1));
    });
  });

  describe('spawnAmbushNPC', () => {
    it('creates hostile NPC near convoy', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.escorts[0].x = 100;
      convoy.escorts[0].y = 100;
      const map = makeTestMap();

      const npc = spawnAmbushNPC(convoy, 100, 100, map);
      assert.ok(npc);
      assert.ok(npc.id.startsWith('ambush-'));
      assert.ok(['pirate', 'english'].includes(npc.faction));
      assert.ok(npc.aggression >= 0.9);
      assert.ok(npc.ambushTarget);
      assert.equal(convoy.ambushesSpawned, 1);
      assert.ok(convoy.ambushCooldown >= 20);
    });

    it('returns null if no alive escort to target', () => {
      const convoy = createConvoyState(makeEscortQuest(), 'Skagen');
      convoy.escorts[0].alive = false;
      const map = makeTestMap();

      const npc = spawnAmbushNPC(convoy, 100, 100, map);
      assert.equal(npc, null);
    });
  });
});

describe('blockade', () => {
  describe('createBlockadeState', () => {
    it('creates valid blockade state', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      assert.equal(blockade.questId, 'Q2');
      assert.equal(blockade.targetPort, 'Malmo');
      assert.equal(blockade.detected, false);
      assert.equal(blockade.active, true);
      assert.equal(blockade.detectionRadius, 15);
      assert.ok(blockade.patrolShips.length >= 2);
    });
  });

  describe('updateBlockade', () => {
    it('detects player near patrol ship', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      // Place a patrol ship right next to player
      blockade.patrolShips = [{ x: 100, y: 100, radius: 10 }];
      const ship = { x: 105, y: 100 }; // within detectionRadius of 15

      updateBlockade(blockade, ship, 1.0);
      assert.ok(blockade.detected);
    });

    it('does not detect player far from patrols', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      blockade.patrolShips = [{ x: 100, y: 100, radius: 10 }];
      const ship = { x: 200, y: 200 }; // far away

      updateBlockade(blockade, ship, 1.0);
      assert.ok(!blockade.detected);
    });

    it('does nothing if already detected', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      blockade.detected = true;
      blockade.patrolShips = [{ x: 100, y: 100, radius: 10 }];
      const ship = { x: 200, y: 200 };

      // Should not throw or change state
      updateBlockade(blockade, ship, 1.0);
      assert.ok(blockade.detected);
    });
  });

  describe('checkBlockadeSuccess', () => {
    it('succeeds when arriving undetected at target port', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      assert.ok(checkBlockadeSuccess(blockade, 'Malmo'));
    });

    it('fails when detected', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      blockade.detected = true;
      assert.ok(!checkBlockadeSuccess(blockade, 'Malmo'));
    });

    it('fails at wrong port', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      assert.ok(!checkBlockadeSuccess(blockade, 'Copenhagen'));
    });

    it('fails when inactive', () => {
      const blockade = createBlockadeState(makeBlockadeQuest(), 'Skagen');
      blockade.active = false;
      assert.ok(!checkBlockadeSuccess(blockade, 'Malmo'));
    });
  });
});
