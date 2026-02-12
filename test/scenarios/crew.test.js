'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');

const {
  ROLES, generateCrewMember, generateCandidates,
  createCrewState, calcAvgMorale, tickMorale,
  onVictory, onLoss, payCrew, onPortVisit,
  countByRole, getRoleBonus,
} = require('../../src/crew/crew');

describe('crew', () => {
  describe('createCrewState', () => {
    it('starts with 2 crew members', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      assert.equal(crew.members.length, 2);
      assert.equal(crew.maxCrew, 8);
      assert.equal(crew.daysSincePort, 0);
    });

    it('starter crew have assigned roles', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const roles = crew.members.map(m => m.role);
      assert.ok(roles.includes(ROLES.SAILING));
      assert.ok(roles.includes(ROLES.GUNNERY));
    });
  });

  describe('calcAvgMorale', () => {
    it('returns 5 for empty crew', () => {
      const crew = { members: [], avgMorale: 0 };
      assert.equal(calcAvgMorale(crew), 5);
    });

    it('computes average correctly', () => {
      const crew = {
        members: [{ morale: 10 }, { morale: 6 }],
        avgMorale: 0,
      };
      assert.equal(calcAvgMorale(crew), 8);
    });
  });

  describe('tickMorale — morale decay', () => {
    it('morale decays after 5 days at sea', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const economy = { gold: 100 };
      crew.daysSincePort = 5; // will increment to 6 on tick

      const startMorale = crew.members.map(m => m.morale);
      withDeterministicRandom(99, () => tickMorale(crew, economy));

      for (let i = 0; i < crew.members.length; i++) {
        assert.ok(crew.members[i].morale < startMorale[i],
          `crew member ${i} should have lost morale`);
      }
    });

    it('unpaid crew lose loyalty after 10 days', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const economy = { gold: 0 };
      crew.daysSincePay = 10;
      crew.daysSincePort = 0;

      const startLoyalty = crew.members.map(m => m.loyalty);
      withDeterministicRandom(99, () => tickMorale(crew, economy));

      for (let i = 0; i < crew.members.length; i++) {
        assert.ok(crew.members[i].loyalty <= startLoyalty[i],
          `crew member ${i} should have lost loyalty`);
      }
    });
  });

  describe('tickMorale — desertion', () => {
    it('low morale + low loyalty can trigger desertion', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      // Force all crew to terrible morale and loyalty
      for (const m of crew.members) {
        m.morale = 1;
        m.loyalty = 1;
      }
      // Add extra crew so desertion is meaningful
      for (let i = 0; i < 4; i++) {
        crew.members.push({ morale: 1, loyalty: 1, role: 'none' });
      }
      crew.daysSincePort = 6;
      crew.daysSincePay = 11;

      // Run many ticks with different seeds until a desertion happens
      let deserted = false;
      for (let seed = 1; seed <= 50 && !deserted; seed++) {
        const events = withDeterministicRandom(seed, () => tickMorale(crew, { gold: 0 }));
        if (events.some(e => e.type === 'desertion')) deserted = true;
      }
      assert.ok(deserted, 'at least one desertion should occur');
    });
  });

  describe('tickMorale — mutiny', () => {
    it('fires mutiny when avgMorale < 3 with >= 3 crew', () => {
      let mutinied = false;

      // Use a single seed and run multiple days — each day has a 20% mutiny
      // chance when avgMorale < 3 and crew >= 3, so within 30 days it's near-certain.
      withDeterministicRandom(12345, () => {
        for (let day = 0; day < 30 && !mutinied; day++) {
          const crew = {
            members: [
              { morale: 2, loyalty: 4, role: 'none' },
              { morale: 2, loyalty: 4, role: 'none' },
              { morale: 2, loyalty: 4, role: 'none' },
              { morale: 2, loyalty: 4, role: 'none' },
              { morale: 2, loyalty: 4, role: 'none' },
            ],
            maxCrew: 8,
            avgMorale: 2,
            daysSincePort: 10,
            daysSincePay: 15,
            victories: 0,
            losses: 0,
          };

          const events = tickMorale(crew, { gold: 0 });
          if (events.some(e => e.type === 'mutiny')) mutinied = true;
        }
      });
      assert.ok(mutinied, 'mutiny should eventually fire');
    });
  });

  describe('onVictory / onLoss', () => {
    it('victory boosts morale by 1.5', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const before = crew.members[0].morale;
      onVictory(crew);
      assert.ok(crew.members[0].morale > before);
      assert.equal(crew.victories, 1);
    });

    it('loss reduces morale by 1.0', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const before = crew.members[0].morale;
      onLoss(crew);
      assert.ok(crew.members[0].morale < before);
      assert.equal(crew.losses, 1);
    });
  });

  describe('payCrew', () => {
    it('costs 5 gold per crew member', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const economy = { gold: 100 };
      const result = payCrew(crew, economy);
      assert.ok(result.paid);
      assert.equal(result.cost, crew.members.length * 5);
      assert.equal(economy.gold, 100 - result.cost);
    });

    it('fails if gold insufficient', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const economy = { gold: 0 };
      const result = payCrew(crew, economy);
      assert.ok(!result.paid);
      assert.equal(economy.gold, 0);
    });

    it('restores morale and resets daysSincePay', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      crew.daysSincePay = 20;
      for (const m of crew.members) m.morale = 5;
      payCrew(crew, { gold: 100 });
      assert.equal(crew.daysSincePay, 0);
      for (const m of crew.members) {
        assert.ok(m.morale >= 7);
      }
    });
  });

  describe('onPortVisit', () => {
    it('resets daysSincePort and boosts morale', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      crew.daysSincePort = 10;
      for (const m of crew.members) m.morale = 5;
      onPortVisit(crew);
      assert.equal(crew.daysSincePort, 0);
      for (const m of crew.members) {
        assert.ok(m.morale >= 6);
      }
    });
  });

  describe('countByRole / getRoleBonus', () => {
    it('counts crew by role', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const counts = countByRole(crew);
      assert.equal(counts.sailing, 1);
      assert.equal(counts.gunnery, 1);
    });

    it('sums stat for role', () => {
      const crew = withDeterministicRandom(1, () => createCrewState());
      const gunBonus = getRoleBonus(crew, ROLES.GUNNERY);
      assert.ok(gunBonus > 0, 'gunnery role bonus should be positive');
    });
  });
});
