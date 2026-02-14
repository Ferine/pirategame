'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');
const { createTestGameState } = require('../helpers/game-state');

const {
  advanceCampaign, hasKeyItem, checkActFourGate, determineEnding,
} = require('../../src/story/campaign');
const {
  createCombatState, calculatePlayerDamage, applyDamageToEnemy,
  enemyFire, checkCombatEnd,
} = require('../../src/combat/combat-state');
const {
  createMeleeState, resolveRound, enemyAI,
  checkMeleeEnd, ZONE_LIST,
} = require('../../src/combat/melee-state');
const { getPrice, cargoCount, UPGRADES } = require('../../src/economy/goods');
const { applyAction } = require('../../src/world/factions');
const { onVictory, onLoss, tickMorale, payCrew, onPortVisit } = require('../../src/crew/crew');
const { addShip } = require('../../src/fleet/fleet');
const { createShip } = require('../../src/fleet/ship-types');
const { createStats, mergeStats, createNewGamePlusState } = require('../../src/meta/legacy');
const { checkAchievements } = require('../../src/meta/achievements');

// ---------------------------------------------------------------------------
// Local test helpers
// ---------------------------------------------------------------------------

/**
 * Win a ship-to-ship cannon combat. Sets perfect aim and max power,
 * loops up to 50 rounds. Writes surviving hull back to gs.ship.
 */
function winCannonCombat(gs, seed) {
  const combat = withDeterministicRandom(seed, () => createCombatState(gs));
  combat.aim = { offsetX: 0, offsetY: 0 };
  combat.power = 100;

  for (let round = 0; round < 50; round++) {
    withDeterministicRandom(seed + round + 100, () => {
      const dmg = calculatePlayerDamage(combat);
      applyDamageToEnemy(combat, dmg);
    });
    combat.round++;
    if (checkCombatEnd(combat)) break;
  }

  assert.ok(combat.resolved, 'cannon combat should resolve');
  assert.equal(combat.victor, 'player', 'player should win cannon combat');

  // Write hull back
  gs.ship.hull = combat.player.hull;
  return combat;
}

/**
 * Win a melee combat. Gives the player overwhelming stats.
 */
function winMeleeCombat(gs, context, seed) {
  const melee = withDeterministicRandom(seed, () => createMeleeState(gs, context));
  melee.player.strength = 20;
  melee.player.hp = 200;
  melee.player.maxHp = 200;

  for (let round = 0; round < 100; round++) {
    withDeterministicRandom(seed + round + 200, () => {
      enemyAI(melee);
      melee.playerMove = 'slash';
      melee.playerZone = ZONE_LIST[round % 3];
      resolveRound(melee);
    });
    if (checkMeleeEnd(melee)) break;
  }

  assert.ok(melee.victor, 'melee should resolve');
  assert.equal(melee.victor, 'player', 'player should win melee');
  return melee;
}

/**
 * Execute a buy-low / sell-high trade. Returns profit.
 */
function tradeGoods(gs, goodId, qty, buyPort, sellPort, seed) {
  const buyPrices = withDeterministicRandom(seed, () => getPrice(goodId, buyPort));
  const sellPrices = withDeterministicRandom(seed + 1, () => getPrice(goodId, sellPort));

  const cost = buyPrices.buy * qty;
  assert.ok(gs.economy.gold >= cost, `need ${cost} gold to buy ${qty} ${goodId} at ${buyPort}`);

  gs.economy.gold -= cost;
  gs.economy.cargo[goodId] = (gs.economy.cargo[goodId] || 0) + qty;

  const revenue = sellPrices.sell * qty;
  gs.economy.gold += revenue;
  gs.economy.cargo[goodId] -= qty;
  if (gs.economy.cargo[goodId] <= 0) delete gs.economy.cargo[goodId];

  const profit = revenue - cost;

  gs.stats.tradesMade += 2; // buy + sell
  gs.stats.goldEarned += Math.max(0, profit);
  applyAction(gs.reputation, 'trade_goods'); // buy
  applyAction(gs.reputation, 'trade_goods'); // sell

  return profit;
}

/**
 * Apply a ship upgrade, deducting gold and applying bonuses.
 */
function applyUpgrade(gs, upgradeId) {
  const upg = UPGRADES.find(u => u.id === upgradeId);
  assert.ok(upg, `upgrade ${upgradeId} should exist`);
  assert.ok(gs.economy.gold >= upg.cost, `need ${upg.cost} gold for ${upgradeId}`);

  gs.economy.gold -= upg.cost;

  switch (upg.type) {
    case 'repair':
      gs.ship.hull = gs.ship.maxHull;
      break;
    case 'hull':
      gs.ship.maxHull += upg.bonus;
      gs.ship.hull = gs.ship.maxHull;
      break;
    case 'cargo':
      gs.economy.cargoMax += upg.bonus;
      break;
    case 'speed':
      gs.economy.speedBonus += upg.bonus;
      break;
    case 'cannon':
      gs.economy.cannonBonus += upg.bonus;
      break;
  }
}

/**
 * Speed-run through campaign acts to a desired ending.
 */
function speedRunCampaign(gs, targetEnding, seed) {
  // Act 0 → 1: first combat victory
  let effects = advanceCampaign(gs.campaign, 'combat_victory', { day: 1 }, gs.reputation);
  assert.equal(gs.campaign.act, 1, 'should advance to act 1');

  // Act 1 → 2: enter Copenhagen
  effects = advanceCampaign(gs.campaign, 'port_enter', { portName: 'Copenhagen', day: 2 }, gs.reputation);
  assert.equal(gs.campaign.act, 2, 'should advance to act 2');

  // Act 2 → 3: talk to informant
  effects = advanceCampaign(gs.campaign, 'npc_dialog_complete', { npcId: 'informant', day: 3 }, gs.reputation);
  assert.equal(gs.campaign.act, 3, 'should advance to act 3');
  assert.equal(gs.campaign.phase, 'dispatch_hunt');

  // Act 3: defeat English dispatch
  effects = advanceCampaign(gs.campaign, 'combat_victory', { faction: 'english', day: 4 }, gs.reputation);
  assert.equal(gs.campaign.phase, 'fort_infiltration');

  // Act 3 → 4: stealth complete
  effects = advanceCampaign(gs.campaign, 'stealth_complete', { day: 5 }, gs.reputation);
  assert.equal(gs.campaign.act, 4, 'should advance to act 4');

  // Build crown rep for Act 4 gate (need >= 55)
  // Crown starts at 50. Need +5 minimum.
  for (let i = 0; i < 10; i++) {
    applyAction(gs.reputation, 'trade_goods');   // merchant +1 each
    applyAction(gs.reputation, 'hail_danish');    // crown +1 each
    applyAction(gs.reputation, 'pay_crown_tax');  // crown +3 each
  }
  assert.ok(gs.reputation.crown >= 55, `crown rep should be >= 55 (got ${gs.reputation.crown})`);

  // Set reputation for desired ending before final battle
  if (targetEnding === 'hero') {
    gs.reputation.crown = Math.max(gs.reputation.crown, 75);
    gs.reputation.pirate = Math.min(gs.reputation.pirate, 30);
  } else if (targetEnding === 'pirate_king') {
    gs.reputation.pirate = 65;
    gs.reputation.smuggler = 55;
  } else {
    // outlaw: ensure neither hero nor pirate_king conditions met
    // Crown must stay >= 55 (gate) but < 70 (hero threshold)
    gs.reputation.crown = 60;
    gs.reputation.pirate = 40;
    gs.reputation.smuggler = 30;
  }

  // Act 4 → 5: enter Helsingor with crown >= 55
  effects = advanceCampaign(gs.campaign, 'port_enter', { portName: 'Helsingor', day: 6 }, gs.reputation);
  assert.equal(gs.campaign.act, 5, 'should advance to act 5');

  // Act 5: final combat victory
  effects = advanceCampaign(gs.campaign, 'combat_victory', { day: 7 }, gs.reputation);
  assert.equal(gs.campaign.ending, targetEnding, `ending should be ${targetEnding}`);

  return effects;
}

// ===========================================================================
// Test Suites
// ===========================================================================

describe('playthrough: full campaign — hero ending', () => {
  it('progresses through all 5 acts to hero ending', () => {
    const gs = withDeterministicRandom(1, () => createTestGameState());

    // --- Act 0 → 1: First combat victory (find letter) ---
    withDeterministicRandom(10, () => winCannonCombat(gs, 10));
    gs.stats.shipsSunk++;
    onVictory(gs.crew);

    let effects = advanceCampaign(gs.campaign, 'combat_victory', { day: 1 }, gs.reputation);
    assert.equal(gs.campaign.act, 1);
    assert.equal(gs.campaign.phase, 'letter_found');
    assert.ok(gs.campaign.flags.letterFound);
    assert.ok(gs.campaign.journalEntries.length >= 1);

    // --- Trade for gold ---
    gs.economy.gold = 200;
    withDeterministicRandom(20, () => tradeGoods(gs, 'cod', 5, 'Skagen', 'Copenhagen', 20));

    // --- Act 1 → 2: Enter Copenhagen ---
    effects = advanceCampaign(gs.campaign, 'port_enter', { portName: 'Copenhagen', day: 3 }, gs.reputation);
    assert.equal(gs.campaign.act, 2);
    assert.equal(gs.campaign.phase, 'seek_informant');

    // --- Act 2 → 3: Talk to informant ---
    effects = advanceCampaign(gs.campaign, 'npc_dialog_complete', { npcId: 'informant', day: 5 }, gs.reputation);
    assert.equal(gs.campaign.act, 3);
    assert.equal(gs.campaign.phase, 'dispatch_hunt');
    assert.ok(gs.campaign.flags.informantMet);

    // --- Act 3: Defeat English dispatch ship ---
    withDeterministicRandom(30, () => winCannonCombat(gs, 30));
    gs.stats.shipsSunk++;
    onVictory(gs.crew);

    effects = advanceCampaign(gs.campaign, 'combat_victory', { faction: 'english', day: 8 }, gs.reputation);
    assert.equal(gs.campaign.phase, 'fort_infiltration');
    assert.ok(gs.campaign.flags.dispatchTaken);

    // --- Act 3 → 4: Stealth complete at fort ---
    effects = advanceCampaign(gs.campaign, 'stealth_complete', { day: 10 }, gs.reputation);
    assert.equal(gs.campaign.act, 4);
    assert.equal(gs.campaign.phase, 'rally_allies');
    assert.ok(gs.campaign.flags.fortComplete);

    // --- Build crown reputation for Act 4 gate ---
    for (let i = 0; i < 10; i++) {
      applyAction(gs.reputation, 'hail_danish');
      applyAction(gs.reputation, 'pay_crown_tax');
    }
    // Ensure hero ending: crown >= 70, pirate < 50
    gs.reputation.crown = Math.max(gs.reputation.crown, 75);
    gs.reputation.pirate = Math.min(gs.reputation.pirate, 30);

    assert.ok(checkActFourGate(gs.reputation));

    // --- Act 4 → 5: Enter Helsingor ---
    effects = advanceCampaign(gs.campaign, 'port_enter', { portName: 'Helsingor', day: 15 }, gs.reputation);
    assert.equal(gs.campaign.act, 5);
    assert.equal(gs.campaign.phase, 'final_battle');
    assert.ok(gs.campaign.flags.alliesRallied);
    assert.ok(hasKeyItem(gs.campaign, 'signal_flags'));

    // --- Act 5: Final combat victory ---
    withDeterministicRandom(50, () => winCannonCombat(gs, 50));
    gs.stats.shipsSunk++;
    onVictory(gs.crew);

    effects = advanceCampaign(gs.campaign, 'combat_victory', { day: 20 }, gs.reputation);
    assert.equal(gs.campaign.ending, 'hero');
    assert.equal(gs.campaign.phase, 'complete');
    assert.equal(determineEnding(gs.reputation), 'hero');

    // --- Verify journal and achievements ---
    assert.ok(gs.campaign.journalEntries.length >= 7, `expected >= 7 journal entries, got ${gs.campaign.journalEntries.length}`);

    gs.stats.campaignsCompleted = 1;
    const newAch = checkAchievements(gs.stats, []);
    assert.ok(newAch.includes('first_blood'), 'should unlock first_blood');
    assert.ok(newAch.includes('conspiracy'), 'should unlock conspiracy');
  });
});

describe('playthrough: full campaign — pirate king ending', () => {
  it('progresses through all 5 acts to pirate king ending', () => {
    const gs = withDeterministicRandom(2, () => createTestGameState());

    // --- Act 0 → 1: First combat ---
    withDeterministicRandom(10, () => winCannonCombat(gs, 10));
    gs.stats.shipsSunk++;
    advanceCampaign(gs.campaign, 'combat_victory', { day: 1 }, gs.reputation);
    assert.equal(gs.campaign.act, 1);

    // --- Build pirate/smuggler rep by attacking merchants ---
    for (let i = 0; i < 5; i++) {
      applyAction(gs.reputation, 'attack_merchant');
      applyAction(gs.reputation, 'defeat_merchant');
    }
    assert.ok(gs.reputation.pirate > 35, 'pirate rep should grow from merchant attacks');
    assert.ok(gs.reputation.smuggler > 30, 'smuggler rep should grow');

    // --- Act 1 → 2: Copenhagen ---
    advanceCampaign(gs.campaign, 'port_enter', { portName: 'Copenhagen', day: 5 }, gs.reputation);
    assert.equal(gs.campaign.act, 2);

    // --- Act 2 → 3: Informant ---
    advanceCampaign(gs.campaign, 'npc_dialog_complete', { npcId: 'informant', day: 7 }, gs.reputation);
    assert.equal(gs.campaign.act, 3);

    // --- Act 3: Defeat English, stealth ---
    withDeterministicRandom(30, () => winCannonCombat(gs, 30));
    gs.stats.shipsSunk++;
    advanceCampaign(gs.campaign, 'combat_victory', { faction: 'english', day: 10 }, gs.reputation);
    advanceCampaign(gs.campaign, 'stealth_complete', { day: 12 }, gs.reputation);
    assert.equal(gs.campaign.act, 4);

    // --- Must hit crown >= 55 for Act 4 gate despite pirate playstyle ---
    // Crown may have dropped from merchant attacks. Rebuild it.
    while (gs.reputation.crown < 60) {
      applyAction(gs.reputation, 'pay_crown_tax');
      applyAction(gs.reputation, 'hail_danish');
    }
    assert.ok(checkActFourGate(gs.reputation), 'crown gate should pass');

    // --- Set pirate king thresholds: pirate >= 60, smuggler >= 50 ---
    gs.reputation.pirate = Math.max(gs.reputation.pirate, 65);
    gs.reputation.smuggler = Math.max(gs.reputation.smuggler, 55);

    // --- Act 4 → 5: Helsingor ---
    advanceCampaign(gs.campaign, 'port_enter', { portName: 'Helsingor', day: 18 }, gs.reputation);
    assert.equal(gs.campaign.act, 5);

    // --- Final battle ---
    withDeterministicRandom(50, () => winCannonCombat(gs, 50));
    gs.stats.shipsSunk++;
    advanceCampaign(gs.campaign, 'combat_victory', { day: 22 }, gs.reputation);

    assert.equal(gs.campaign.ending, 'pirate_king');
    assert.equal(determineEnding(gs.reputation), 'pirate_king');
  });
});

describe('playthrough: trade and upgrade loop', () => {
  it('accumulates gold through repeated trades and buys all upgrades', () => {
    const gs = withDeterministicRandom(3, () => createTestGameState());
    gs.economy.gold = 100;

    const goldHistory = [gs.economy.gold];

    // --- Trade loop: buy cod at Skagen (0.6x), sell at Copenhagen (1.3x) ---
    for (let round = 0; round < 10; round++) {
      const maxQty = Math.min(
        Math.floor(gs.economy.gold / 10), // conservative budget per unit
        gs.economy.cargoMax,
      );
      const qty = Math.max(1, Math.min(maxQty, 5));

      withDeterministicRandom(100 + round * 7, () => {
        tradeGoods(gs, 'cod', qty, 'Skagen', 'Copenhagen', 100 + round * 7);
      });

      goldHistory.push(gs.economy.gold);
    }

    // Verify profit is generally positive (gold grows)
    assert.ok(gs.economy.gold > 100, `gold should grow from trading (got ${gs.economy.gold})`);

    // --- Buy upgrades ---
    // Hull plating: cost 120, maxHull +25
    assert.ok(gs.economy.gold >= 120, 'should afford hull plating');
    applyUpgrade(gs, 'hull_plate');
    assert.equal(gs.ship.maxHull, 125);

    // Trade more rounds to fund remaining upgrades
    for (let round = 10; round < 20; round++) {
      const qty = Math.max(1, Math.min(5, Math.floor(gs.economy.gold / 10)));
      withDeterministicRandom(200 + round * 7, () => {
        tradeGoods(gs, 'cod', qty, 'Skagen', 'Copenhagen', 200 + round * 7);
      });
    }

    // Cargo extension: cost 80, cargoMax +10
    if (gs.economy.gold >= 80) {
      applyUpgrade(gs, 'cargo_ext');
      assert.equal(gs.economy.cargoMax, 30);
    }

    // Extra cannon: cost 100, cannonBonus +1
    if (gs.economy.gold >= 100) {
      applyUpgrade(gs, 'extra_cannon');
      assert.equal(gs.economy.cannonBonus, 1);
    }

    // --- Verify trading stats ---
    assert.ok(gs.stats.tradesMade >= 20, `should have >= 20 tradesMade (got ${gs.stats.tradesMade})`);

    // Check trader achievement
    const newAch = checkAchievements(gs.stats, []);
    assert.ok(newAch.includes('trader'), 'should unlock trader achievement');
  });
});

describe('playthrough: combat gauntlet', () => {
  it('survives 3 cannon fights, 4 melees, and captures a ship', () => {
    const gs = withDeterministicRandom(4, () => createTestGameState());
    // Give extra hull and a full crew so we survive 3 fights with return fire
    gs.ship.hull = 300;
    gs.ship.maxHull = 300;
    gs.crew.maxCrew = 30;
    // Bulk up crew to 20+ so enemy crew damage doesn't end the fight early
    while (gs.crew.members.length < 20) {
      const i = gs.crew.members.length;
      gs.crew.members.push({ id: `extra_${i}`, name: `Sailor ${i}`, morale: 8, loyalty: 7, strength: 5, sailing: 5, gunnery: 5, role: 'none', trait: 'Steady hand', cost: 0 });
    }
    const startHull = gs.ship.hull;

    // --- 3 cannon combats with enemy return fire ---
    for (let fight = 0; fight < 3; fight++) {
      const combat = withDeterministicRandom(50 + fight, () => createCombatState(gs));
      combat.aim = { offsetX: 0, offsetY: 0 };
      combat.power = 100;

      for (let round = 0; round < 50; round++) {
        withDeterministicRandom(300 + fight * 100 + round, () => {
          const dmg = calculatePlayerDamage(combat);
          applyDamageToEnemy(combat, dmg);

          if (!checkCombatEnd(combat)) {
            enemyFire(combat);
          }
        });
        combat.round++;
        if (checkCombatEnd(combat)) break;
      }

      assert.ok(combat.resolved, `fight ${fight + 1} should resolve`);
      assert.equal(combat.victor, 'player', `player should win fight ${fight + 1}`);
      gs.ship.hull = combat.player.hull;
      gs.stats.shipsSunk++;
      onVictory(gs.crew);
    }

    // Hull should have degraded from enemy fire
    assert.ok(gs.ship.hull < startHull, `hull should degrade (${gs.ship.hull} < ${startHull})`);
    assert.equal(gs.stats.shipsSunk, 3);

    // --- 2 boarding melees ---
    for (let i = 0; i < 2; i++) {
      withDeterministicRandom(400 + i, () => winMeleeCombat(gs, 'boarding', 400 + i));
      gs.stats.meleeWins++;
      onVictory(gs.crew);
    }

    // --- 1 bar fight ---
    withDeterministicRandom(500, () => winMeleeCombat(gs, 'barfight', 500));
    gs.stats.meleeWins++;

    // --- 1 duel ---
    withDeterministicRandom(600, () => winMeleeCombat(gs, 'duel', 600));
    gs.stats.meleeWins++;

    // --- Capture ship → fleet grows to 2 ---
    const captured = withDeterministicRandom(700, () => createShip('brigantine', 'Prize'));
    const added = addShip(gs.fleet, captured);
    assert.ok(added);
    assert.equal(gs.fleet.ships.length, 2);
    gs.stats.maxFleetSize = gs.fleet.ships.length;

    // --- 1 more melee to reach meleeWins = 5 ---
    withDeterministicRandom(800, () => winMeleeCombat(gs, 'boarding', 800));
    gs.stats.meleeWins++;

    assert.equal(gs.stats.meleeWins, 5);

    // --- Verify crew victories tracked ---
    assert.ok(gs.crew.victories >= 5, `crew victories should be >= 5 (got ${gs.crew.victories})`);

    // --- Check achievements ---
    const newAch = checkAchievements(gs.stats, []);
    assert.ok(newAch.includes('first_blood'), 'should unlock first_blood (shipsSunk >= 1)');
    assert.ok(newAch.includes('swordsman'), 'should unlock swordsman (meleeWins >= 5)');
  });
});

describe('playthrough: new game plus cycle', () => {
  it('completes campaign, starts NG+, and progresses in new cycle', () => {
    const gs = withDeterministicRandom(5, () => createTestGameState());

    // --- Speed-run campaign to outlaw ending ---
    withDeterministicRandom(10, () => winCannonCombat(gs, 10));
    gs.stats.shipsSunk++;
    speedRunCampaign(gs, 'outlaw', 10);

    assert.equal(gs.campaign.ending, 'outlaw');
    gs.stats.campaignsCompleted = 1;

    // --- Set gold for carry-over ---
    gs.economy.gold = 500;

    // --- Create NG+ state ---
    const ng = createNewGamePlusState(gs);

    // --- Verify carry-over ---
    // Base economy gold (100) + floor(500 * 0.5) = 100 + 250 = 350
    assert.equal(ng.economy.gold, 350, `NG+ gold should be 350 (got ${ng.economy.gold})`);

    // --- Campaign reset ---
    assert.equal(ng.campaign.act, 0);
    assert.equal(ng.campaign.ending, null);
    assert.deepEqual(ng.campaign.keyItems, []);
    assert.deepEqual(ng.campaign.journalEntries, []);

    // --- NG+ flags ---
    assert.equal(ng.ngPlus, true);
    assert.equal(ng.stats.ngPlusStarted, 1);

    // --- Session stats reset ---
    assert.equal(ng.stats.shipsSunk, 0);
    assert.equal(ng.stats.meleeWins, 0);
    assert.equal(ng.stats.tradesMade, 0);

    // --- NG+ achievement ---
    const newAch = checkAchievements(ng.stats, []);
    assert.ok(newAch.includes('ng_plus'), 'should unlock ng_plus achievement');

    // --- First combat in NG+ advances campaign to Act 1 ---
    withDeterministicRandom(20, () => winCannonCombat(ng, 20));
    ng.stats.shipsSunk++;

    const effects = advanceCampaign(ng.campaign, 'combat_victory', { day: 1 }, ng.reputation);
    assert.equal(ng.campaign.act, 1, 'NG+ campaign should advance to act 1');
    assert.ok(effects.length > 0, 'should produce campaign effects');
  });
});

describe('playthrough: survival run — hull management', () => {
  it('tracks hull degradation, repair, morale decay, and crew payment', () => {
    const gs = withDeterministicRandom(6, () => createTestGameState());
    // Give extra hull and crew to survive 3 fights with return fire
    gs.ship.hull = 300;
    gs.ship.maxHull = 300;
    gs.crew.maxCrew = 30;
    while (gs.crew.members.length < 20) {
      const i = gs.crew.members.length;
      gs.crew.members.push({ id: `extra_${i}`, name: `Sailor ${i}`, morale: 8, loyalty: 7, strength: 5, sailing: 5, gunnery: 5, role: 'none', trait: 'Steady hand', cost: 0 });
    }
    const startHull = gs.ship.hull;

    // --- 3 combats with enemy return fire (hull degrades) ---
    for (let fight = 0; fight < 3; fight++) {
      const combat = withDeterministicRandom(50 + fight, () => createCombatState(gs));
      combat.aim = { offsetX: 0, offsetY: 0 };
      combat.power = 100;

      for (let round = 0; round < 50; round++) {
        withDeterministicRandom(900 + fight * 100 + round, () => {
          const dmg = calculatePlayerDamage(combat);
          applyDamageToEnemy(combat, dmg);

          if (!checkCombatEnd(combat)) {
            enemyFire(combat);
          }
        });
        combat.round++;
        if (checkCombatEnd(combat)) break;
      }

      assert.ok(combat.resolved, `fight ${fight + 1} should resolve`);
      assert.equal(combat.victor, 'player', `player should win fight ${fight + 1}`);
      gs.ship.hull = combat.player.hull;
    }

    // Hull should have degraded
    assert.ok(gs.ship.hull < startHull, `hull should be damaged (${gs.ship.hull} < ${startHull})`);

    // --- Hull repair at port (restores to maxHull) ---
    gs.economy.gold = 200; // ensure we can afford repair
    applyUpgrade(gs, 'hull_repair');
    assert.equal(gs.ship.hull, gs.ship.maxHull, 'hull should be fully restored');

    // --- 15 days of morale decay ---
    gs.economy.gold = 500; // enough for wages later
    const startMorale = gs.crew.avgMorale;

    for (let day = 0; day < 15; day++) {
      withDeterministicRandom(1000 + day, () => {
        tickMorale(gs.crew, gs.economy);
      });
    }

    assert.equal(gs.crew.daysSincePort, 15, 'daysSincePort should be 15');
    assert.ok(gs.crew.avgMorale < startMorale, `morale should decay (${gs.crew.avgMorale} < ${startMorale})`);

    // --- Pay crew to restore morale ---
    const daysBefore = gs.crew.daysSincePay;
    const { paid, cost } = payCrew(gs.crew, gs.economy);
    assert.ok(paid, 'should be able to pay crew');
    assert.ok(cost > 0, 'pay cost should be > 0');
    assert.equal(gs.crew.daysSincePay, 0, 'daysSincePay should reset');

    const moraleAfterPay = gs.crew.avgMorale;

    // --- Port visit resets daysSincePort ---
    onPortVisit(gs.crew);
    assert.equal(gs.crew.daysSincePort, 0, 'daysSincePort should reset on port visit');
    assert.ok(gs.crew.avgMorale >= moraleAfterPay, 'port visit should boost morale');

    // --- Verify hull=0 means combat loss ---
    const lossGs = withDeterministicRandom(99, () => createTestGameState());
    const lossCombat = withDeterministicRandom(99, () => createCombatState(lossGs));
    lossCombat.player.hull = 0;
    const ended = checkCombatEnd(lossCombat);
    assert.ok(ended, 'combat should end with hull=0');
    assert.equal(lossCombat.victor, 'enemy', 'hull=0 should mean enemy victory');
  });
});
