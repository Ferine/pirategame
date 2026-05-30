'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyShipVictoryToCampaign,
  finalizeCampaignCompletion,
} = require('../../src/story/combat-resolution');
const { createCampaignState } = require('../../src/story/campaign');
const { createReputationState } = require('../../src/world/factions');

function gs(overrides = {}) {
  return {
    campaign: createCampaignState(),
    reputation: createReputationState(),
    ship: { name: 'Drakar' },
    economy: { gold: 100 },
    stats: { shipsSunk: 0, campaignsCompleted: 0, playTimeMinutes: 0 },
    quests: { day: 1 },
    questNotices: [],
    ...overrides,
  };
}

test('combat resolution shared across win paths', async (t) => {
  await t.test('Act 0 -> 1: defeating any ship starts the campaign (the letter)', () => {
    const g = gs();
    const notices = applyShipVictoryToCampaign(g, 'merchant');
    assert.equal(g.campaign.act, 1);
    assert.ok(g.campaign.keyItems.includes('letter'));
    assert.ok(notices.length > 0);
  });

  await t.test('Act 3 dispatch: defeating an English ship seizes dispatches', () => {
    const g = gs();
    g.campaign.act = 3;
    g.campaign.phase = 'dispatch_hunt';
    applyShipVictoryToCampaign(g, 'english');
    assert.equal(g.campaign.phase, 'fort_infiltration');
    assert.ok(g.campaign.keyItems.includes('dispatches'));
  });

  await t.test('Act 3 dispatch: a non-English ship does NOT advance', () => {
    const g = gs();
    g.campaign.act = 3;
    g.campaign.phase = 'dispatch_hunt';
    applyShipVictoryToCampaign(g, 'merchant');
    assert.equal(g.campaign.phase, 'dispatch_hunt');
    assert.ok(!g.campaign.keyItems.includes('dispatches'));
  });

  await t.test('Act 5: defeating the flagship sets an ending (no method dependency)', () => {
    const g = gs();
    g.campaign.act = 5;
    g.campaign.phase = 'final_battle';
    applyShipVictoryToCampaign(g, 'english');
    assert.ok(g.campaign.ending, 'an ending must be chosen');
  });

  await t.test('finalizeCampaignCompletion reports completion only when an ending is set', () => {
    const g = gs();
    assert.equal(finalizeCampaignCompletion(g), false);
    g.campaign.ending = 'hero';
    assert.equal(finalizeCampaignCompletion(g), true);
    assert.equal(g.stats.campaignsCompleted, 1);
  });

  await t.test('no campaign on gameState is handled gracefully', () => {
    const notices = applyShipVictoryToCampaign({ campaign: null }, 'english');
    assert.deepEqual(notices, []);
  });
});
