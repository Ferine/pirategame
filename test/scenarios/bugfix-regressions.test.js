'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCombatState, calculatePlayerDamage, applyDamageToEnemy,
} = require('../../src/combat/combat-state');
const { checkMeleeEnd } = require('../../src/combat/melee-state');
const { _resolveNPCClashes, FACTION } = require('../../src/world/npc-ships');
const { createCrewState, tickMorale, generateCrewMember } = require('../../src/crew/crew');

function combatFixture() {
  const gs = {
    ship: { hull: 100, maxHull: 100 },
    crew: { members: [], maxCrew: 30 },
    wind: { direction: 2, strength: 3 },
  };
  const c = createCombatState(gs);
  c.aim = { offsetX: 0, offsetY: 0 };
  c.power = 80;
  return c;
}

test('ammo limits are enforced', async (t) => {
  await t.test('selecting a depleted special ammo falls back to iron', () => {
    const c = combatFixture();
    c.ammoType = 'grape';
    c.ammoInventory = { iron: 20, chain: 0, grape: 0 };
    calculatePlayerDamage(c);
    assert.equal(c.ammoType, 'iron');
  });

  await t.test('special ammo is consumed and then forced to iron when empty', () => {
    const c = combatFixture();
    c.ammoType = 'chain';
    c.ammoInventory = { iron: 20, chain: 1, grape: 8 };
    calculatePlayerDamage(c);
    assert.equal(c.ammoType, 'chain', 'one round left, still chain');
    applyDamageToEnemy(c, { hit: true, hullDmg: 5, crewDmg: 1, mastDmg: 0 });
    assert.equal(c.ammoInventory.chain, 0);
    calculatePlayerDamage(c);
    assert.equal(c.ammoType, 'iron', 'depleted chain -> iron');
  });

  await t.test('iron is always available even at zero', () => {
    const c = combatFixture();
    c.ammoType = 'iron';
    c.ammoInventory = { iron: 0, chain: 0, grape: 0 };
    const d = calculatePlayerDamage(c);
    assert.equal(c.ammoType, 'iron');
    assert.ok(d.hit, 'a centered shot with iron still fires');
  });
});

test('melee always terminates (no infinite-dodge stall)', () => {
  const melee = {
    player: { hp: 100, maxHp: 100 },
    enemy: { hp: 100, maxHp: 100 },
    round: 0,
  };
  // Simulate a pure-dodge stall: neither side ever takes damage.
  let ended = false;
  for (let r = 0; r < 1000; r++) {
    melee.round++;
    if (checkMeleeEnd(melee)) { ended = true; break; }
  }
  assert.ok(ended, 'fight must end via the round cap');
  assert.ok(melee.victor === 'player' || melee.victor === 'enemy');
});

test('NPC clash never removes more ships than exist / a sunk ship stops fighting', () => {
  // Three mutually-hostile ships clustered together. At most all-but-one can be
  // removed in a tick, and the loop must not double-process a removed ship.
  const ships = [
    { id: 1, faction: FACTION.PIRATE, name: 'A', x: 10, y: 10, hull: 30 },
    { id: 2, faction: FACTION.MERCHANT, name: 'B', x: 11, y: 10, hull: 50 },
    { id: 3, faction: FACTION.ENGLISH, name: 'C', x: 10, y: 11, hull: 40 },
  ];
  const before = ships.length;
  const reports = _resolveNPCClashes(ships);
  assert.ok(ships.length >= 1, 'at least one ship survives');
  assert.ok(ships.length <= before, 'cannot grow');
  assert.ok(reports.length <= before - 1, 'cannot report more sinkings than removals');
});

test('mutiny has a real consequence (seizes gold, vents morale)', () => {
  const crew = createCrewState();
  while (crew.members.length < 4) crew.members.push(generateCrewMember());
  for (const m of crew.members) { m.morale = 1; m.loyalty = 5; } // low morale, high enough loyalty to avoid desertion
  const economy = { gold: 1000 };

  // Run days until a mutiny fires (20% chance/day at avgMorale < 3).
  let goldLost = 0, fired = false;
  for (let d = 0; d < 200 && !fired; d++) {
    for (const m of crew.members) m.morale = 1; // keep morale pinned low
    const events = tickMorale(crew, economy);
    const mutiny = events.find((e) => e.type === 'mutiny');
    if (mutiny) { fired = true; goldLost = mutiny.goldLost; }
  }
  assert.ok(fired, 'a mutiny should eventually fire');
  assert.ok(goldLost > 0, 'mutiny should seize gold from the hold');
  assert.ok(economy.gold < 1000, 'gold should be reduced');
  assert.ok(crew.avgMorale >= 3, 'morale vents above the mutiny threshold afterward');
});
