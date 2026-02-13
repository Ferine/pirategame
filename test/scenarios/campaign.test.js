'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createCampaignState,
  checkActOneTrigger,
  addKeyItem,
  hasKeyItem,
  advanceCampaign,
  getCurrentObjective,
  shouldStoryNPCAppear,
  checkActFourGate,
  determineEnding,
} = require('../../src/story/campaign');

describe('campaign', () => {
  describe('createCampaignState', () => {
    it('returns correct initial state', () => {
      const state = createCampaignState();
      assert.equal(state.act, 0);
      assert.equal(state.phase, 'idle');
      assert.deepEqual(state.keyItems, []);
      assert.deepEqual(state.journalEntries, []);
      assert.deepEqual(state.flags, {});
      assert.equal(state.ending, null);
      assert.deepEqual(state.npcStates, {});
    });
  });

  describe('checkActOneTrigger', () => {
    it('returns true when act is 0', () => {
      const state = createCampaignState();
      assert.equal(checkActOneTrigger(state), true);
    });

    it('returns false when act is > 0', () => {
      const state = createCampaignState();
      state.act = 1;
      assert.equal(checkActOneTrigger(state), false);
    });
  });

  describe('addKeyItem / hasKeyItem', () => {
    it('adds and checks key items', () => {
      const state = createCampaignState();
      assert.equal(hasKeyItem(state, 'letter'), false);
      addKeyItem(state, 'letter');
      assert.equal(hasKeyItem(state, 'letter'), true);
    });

    it('does not duplicate items', () => {
      const state = createCampaignState();
      addKeyItem(state, 'letter');
      addKeyItem(state, 'letter');
      assert.equal(state.keyItems.length, 1);
    });
  });

  describe('getCurrentObjective', () => {
    it('returns idle text for act 0', () => {
      const state = createCampaignState();
      assert.ok(getCurrentObjective(state).includes('Sail'));
    });

    it('returns letter text for act 1', () => {
      const state = createCampaignState();
      state.act = 1;
      assert.ok(getCurrentObjective(state).includes('Copenhagen'));
    });

    it('returns informant text for act 2', () => {
      const state = createCampaignState();
      state.act = 2;
      assert.ok(getCurrentObjective(state).includes('Henrik'));
    });

    it('returns dispatch text for act 3 dispatch_hunt', () => {
      const state = createCampaignState();
      state.act = 3;
      state.phase = 'dispatch_hunt';
      assert.ok(getCurrentObjective(state).includes('dispatch'));
    });

    it('returns fort text for act 3 fort_infiltration', () => {
      const state = createCampaignState();
      state.act = 3;
      state.phase = 'fort_infiltration';
      assert.ok(getCurrentObjective(state).includes('fort'));
    });

    it('returns Crown rep text for act 4', () => {
      const state = createCampaignState();
      state.act = 4;
      assert.ok(getCurrentObjective(state).includes('Crown'));
    });

    it('returns flagship text for act 5', () => {
      const state = createCampaignState();
      state.act = 5;
      assert.ok(getCurrentObjective(state).includes('Sovereign'));
    });

    it('returns resolved text for completed campaign', () => {
      const state = createCampaignState();
      state.act = 5;
      state.ending = 'hero';
      assert.ok(getCurrentObjective(state).includes('resolved'));
    });
  });

  describe('shouldStoryNPCAppear', () => {
    it('informant appears in Copenhagen during act 2', () => {
      const state = createCampaignState();
      state.act = 2;
      assert.equal(shouldStoryNPCAppear(state, 'Copenhagen', 'informant'), true);
    });

    it('informant does not appear in wrong port', () => {
      const state = createCampaignState();
      state.act = 2;
      assert.equal(shouldStoryNPCAppear(state, 'Aalborg', 'informant'), false);
    });

    it('informant does not appear in wrong act', () => {
      const state = createCampaignState();
      state.act = 1;
      assert.equal(shouldStoryNPCAppear(state, 'Copenhagen', 'informant'), false);
    });

    it('admiral appears in Helsingor during act 4', () => {
      const state = createCampaignState();
      state.act = 4;
      assert.equal(shouldStoryNPCAppear(state, 'Helsingor', 'admiral'), true);
    });

    it('english_captain never appears at port', () => {
      const state = createCampaignState();
      state.act = 5;
      assert.equal(shouldStoryNPCAppear(state, 'Copenhagen', 'english_captain'), false);
    });

    it('unknown NPC returns false', () => {
      const state = createCampaignState();
      state.act = 2;
      assert.equal(shouldStoryNPCAppear(state, 'Copenhagen', 'nonexistent'), false);
    });
  });

  describe('checkActFourGate', () => {
    it('returns true when crown >= 55', () => {
      assert.equal(checkActFourGate({ crown: 55 }), true);
      assert.equal(checkActFourGate({ crown: 80 }), true);
    });

    it('returns false when crown < 55', () => {
      assert.equal(checkActFourGate({ crown: 54 }), false);
      assert.equal(checkActFourGate({ crown: 0 }), false);
    });

    it('returns false for null reputation', () => {
      assert.equal(checkActFourGate(null), false);
    });
  });

  describe('determineEnding', () => {
    it('returns hero for high crown, low pirate', () => {
      assert.equal(determineEnding({ crown: 70, pirate: 30, smuggler: 20 }), 'hero');
    });

    it('returns pirate_king for high pirate + smuggler', () => {
      assert.equal(determineEnding({ crown: 40, pirate: 60, smuggler: 50 }), 'pirate_king');
    });

    it('returns outlaw as fallback', () => {
      assert.equal(determineEnding({ crown: 40, pirate: 30, smuggler: 20 }), 'outlaw');
    });

    it('returns outlaw for null reputation', () => {
      assert.equal(determineEnding(null), 'outlaw');
    });
  });

  describe('advanceCampaign', () => {
    it('act 0 -> 1 on combat_victory', () => {
      const state = createCampaignState();
      const effects = advanceCampaign(state, 'combat_victory', {}, {});
      assert.equal(state.act, 1);
      assert.equal(state.flags.letterFound, true);
      assert.ok(effects.length > 0);
      assert.ok(effects.some(e => e.type === 'notice'));
      assert.equal(state.journalEntries.length, 1);
    });

    it('act 1 -> 2 on port_enter Copenhagen', () => {
      const state = createCampaignState();
      state.act = 1;
      const effects = advanceCampaign(state, 'port_enter', { portName: 'Copenhagen' }, {});
      assert.equal(state.act, 2);
      assert.ok(effects.some(e => e.type === 'notice'));
    });

    it('act 1 does not advance on wrong port', () => {
      const state = createCampaignState();
      state.act = 1;
      const effects = advanceCampaign(state, 'port_enter', { portName: 'Aalborg' }, {});
      assert.equal(state.act, 1);
      assert.equal(effects.length, 0);
    });

    it('act 2 -> 3 on informant dialog', () => {
      const state = createCampaignState();
      state.act = 2;
      const effects = advanceCampaign(state, 'npc_dialog_complete', { npcId: 'informant' }, {});
      assert.equal(state.act, 3);
      assert.equal(state.phase, 'dispatch_hunt');
      assert.equal(state.flags.informantMet, true);
    });

    it('act 3 dispatch_hunt -> fort_infiltration on English combat victory', () => {
      const state = createCampaignState();
      state.act = 3;
      state.phase = 'dispatch_hunt';
      const effects = advanceCampaign(state, 'combat_victory', { faction: 'english' }, {});
      assert.equal(state.phase, 'fort_infiltration');
      assert.equal(state.flags.dispatchTaken, true);
    });

    it('act 3 -> 4 on stealth_complete during fort_infiltration', () => {
      const state = createCampaignState();
      state.act = 3;
      state.phase = 'fort_infiltration';
      const effects = advanceCampaign(state, 'stealth_complete', {}, {});
      assert.equal(state.act, 4);
      assert.equal(state.flags.fortComplete, true);
    });

    it('act 4 -> 5 on Helsingor port_enter with crown >= 55', () => {
      const state = createCampaignState();
      state.act = 4;
      const rep = { crown: 55, pirate: 20, smuggler: 10 };
      const effects = advanceCampaign(state, 'port_enter', { portName: 'Helsingor' }, rep);
      assert.equal(state.act, 5);
      assert.ok(hasKeyItem(state, 'signal_flags'));
    });

    it('act 4 does not advance without reputation', () => {
      const state = createCampaignState();
      state.act = 4;
      const rep = { crown: 30, pirate: 20 };
      const effects = advanceCampaign(state, 'port_enter', { portName: 'Helsingor' }, rep);
      assert.equal(state.act, 4);
    });

    it('act 5 -> ending on combat_victory', () => {
      const state = createCampaignState();
      state.act = 5;
      const rep = { crown: 80, pirate: 20, smuggler: 10 };
      const effects = advanceCampaign(state, 'combat_victory', {}, rep);
      assert.equal(state.ending, 'hero');
      assert.equal(state.phase, 'complete');
    });
  });
});
