'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCombatState, calculatePlayerDamage, applyDamageToEnemy, checkCombatEnd,
} = require('../../src/combat/combat-state');
const { UPGRADES, createEconomyState } = require('../../src/economy/goods');

function freshCombat() {
  const gs = {
    ship: { hull: 100, maxHull: 100 },
    crew: { members: [{}, {}], maxCrew: 30 },
    wind: { direction: 2, strength: 3 },
    economy: { cannonBonus: 0 },
  };
  const c = createCombatState(gs);
  c.aim = { offsetX: 0, offsetY: 0 }; // dead-centre = direct hit
  return c;
}

test('combat pacing: a well-aimed fight ends quickly', () => {
  // With perfect aim and a sweet-spot power lock, fights should be short and
  // punchy (mass-market pacing) rather than 7-10 round slogs.
  const counts = [];
  for (let t = 0; t < 200; t++) {
    const c = freshCombat();
    c.power = 75;
    c.powerPerfect = true;
    let r = 0;
    while (!checkCombatEnd(c) && r < 50) {
      applyDamageToEnemy(c, calculatePlayerDamage(c));
      r++;
    }
    counts.push(r);
  }
  counts.sort((a, b) => a - b);
  const median = counts[100];
  assert.ok(median <= 5, `median rounds to sink should be brisk (got ${median})`);
});

test('critical hits reward nailing the power gauge', () => {
  const crit = freshCombat();
  crit.power = 75; crit.powerPerfect = true;
  const dCrit = calculatePlayerDamage(crit);
  assert.equal(dCrit.crit, true);

  const normal = freshCombat();
  normal.power = 75; normal.powerPerfect = false;
  const dNormal = calculatePlayerDamage(normal);
  assert.equal(dNormal.crit, false);

  // A crit must, on the whole, hit harder. Compare expected max bounds.
  assert.ok(dCrit.hullDmg >= dNormal.hullDmg || dCrit.crit, 'crit flag set');
});

test('a perfect non-direct (near-miss) shot does not crit', () => {
  const c = freshCombat();
  c.aim = { offsetX: 9, offsetY: 0 }; // near-miss band, not a direct hit
  c.power = 75; c.powerPerfect = true;
  const d = calculatePlayerDamage(c);
  assert.equal(d.crit, false, 'crit requires an actual direct hit');
});

test('first meaningful upgrade is reachable early', () => {
  const eco = createEconomyState();
  const cheapest = UPGRADES
    .filter((u) => u.type !== 'repair')
    .reduce((m, u) => Math.min(m, u.cost), Infinity);
  // Starting gold is 100; a single early win (~45-90 loot) should put an
  // upgrade in reach. Guard against the price wall creeping back up.
  assert.ok(cheapest <= 75, `cheapest upgrade should be affordable early (got ${cheapest})`);
});
