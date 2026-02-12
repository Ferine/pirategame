'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');
const { createTestGameState } = require('../helpers/game-state');

const { tickMorale, generateCrewMember } = require('../../src/crew/crew');

describe('integration: crew mutiny', () => {
  it('days at sea → morale decay → desertions → mutiny', () => {
    const gs = withDeterministicRandom(1, () => createTestGameState());
    const crew = gs.crew;

    // Add more crew for mutiny threshold (needs >= 3)
    for (let i = 0; i < 4; i++) {
      const member = withDeterministicRandom(i + 10, () => generateCrewMember('Skagen'));
      member.morale = 5;
      member.loyalty = 3;
      crew.members.push(member);
    }

    const startCount = crew.members.length;
    assert.ok(startCount >= 6);

    const allEvents = [];

    // Simulate 25 days at sea with no pay
    crew.daysSincePort = 0;
    crew.daysSincePay = 0;

    for (let day = 0; day < 25; day++) {
      const events = withDeterministicRandom(day * 7 + 1, () =>
        tickMorale(crew, { gold: 0 })
      );
      allEvents.push(...events);
    }

    // Check morale decayed
    for (const m of crew.members) {
      assert.ok(m.morale < 5, 'morale should have decayed significantly');
    }

    // Check for desertions or mutiny events
    const desertions = allEvents.filter(e => e.type === 'desertion');
    const mutinies = allEvents.filter(e => e.type === 'mutiny');

    // At least some negative events should have occurred
    assert.ok(desertions.length > 0 || mutinies.length > 0,
      'desertions or mutiny should occur after 25 days');

    if (desertions.length > 0) {
      assert.ok(crew.members.length < startCount,
        'crew size should decrease from desertions');
    }
  });
});
