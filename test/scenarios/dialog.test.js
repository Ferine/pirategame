'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getDialog, DIALOG_TREES } = require('../../src/story/dialog');
const { getPortStoryNPCs } = require('../../src/story/npcs');

describe('dialog', () => {
  describe('getDialog', () => {
    it('returns dialog tree for informant act 2', () => {
      const tree = getDialog('informant', 2);
      assert.ok(tree);
      assert.ok(Array.isArray(tree));
      assert.ok(tree.length > 0);
      assert.equal(tree[0].id, 'greet');
    });

    it('returns dialog tree for admiral act 4', () => {
      const tree = getDialog('admiral', 4);
      assert.ok(tree);
      assert.ok(tree.length > 0);
    });

    it('returns null for unknown NPC', () => {
      assert.equal(getDialog('nonexistent', 2), null);
    });

    it('returns null for wrong act', () => {
      assert.equal(getDialog('informant', 1), null);
    });
  });

  describe('dialog node validity', () => {
    it('all choices have valid next references', () => {
      for (const [npcId, trees] of Object.entries(DIALOG_TREES)) {
        for (const [act, nodes] of Object.entries(trees)) {
          const nodeIds = new Set(nodes.map(n => n.id));
          for (const node of nodes) {
            if (!node.choices) continue;
            for (const choice of node.choices) {
              if (choice.next) {
                assert.ok(nodeIds.has(choice.next),
                  `${npcId} act ${act}: choice next '${choice.next}' not found in node ids`);
              }
            }
          }
        }
      }
    });

    it('all dialog nodes have required fields', () => {
      for (const [npcId, trees] of Object.entries(DIALOG_TREES)) {
        for (const [act, nodes] of Object.entries(trees)) {
          for (const node of nodes) {
            assert.ok(node.id, `${npcId} act ${act}: node missing id`);
            assert.ok(node.speaker, `${npcId} act ${act}: node ${node.id} missing speaker`);
            assert.ok(typeof node.text === 'string', `${npcId} act ${act}: node ${node.id} missing text`);
            assert.ok(Array.isArray(node.choices), `${npcId} act ${act}: node ${node.id} missing choices`);
          }
        }
      }
    });
  });

  describe('getPortStoryNPCs', () => {
    it('returns informant for Copenhagen act 2', () => {
      const npcs = getPortStoryNPCs('Copenhagen', 2, null);
      assert.ok(npcs.length > 0);
      const informant = npcs.find(n => n.storyNpcId === 'informant');
      assert.ok(informant);
      assert.equal(informant.name, 'Henrik Madsen');
    });

    it('returns empty for Copenhagen act 1', () => {
      const npcs = getPortStoryNPCs('Copenhagen', 1, null);
      assert.equal(npcs.length, 0);
    });

    it('returns admiral for Helsingor act 4', () => {
      const npcs = getPortStoryNPCs('Helsingor', 4, null);
      const admiral = npcs.find(n => n.storyNpcId === 'admiral');
      assert.ok(admiral);
    });

    it('returns spy for Gothenburg act 2', () => {
      const npcs = getPortStoryNPCs('Gothenburg', 2, null);
      const spy = npcs.find(n => n.storyNpcId === 'spy');
      assert.ok(spy);
    });

    it('returns smuggler_chief for Aalborg act 3', () => {
      const npcs = getPortStoryNPCs('Aalborg', 3, null);
      const smuggler = npcs.find(n => n.storyNpcId === 'smuggler_chief');
      assert.ok(smuggler);
    });

    it('does not return english_captain at any port', () => {
      const ports = ['Copenhagen', 'Helsingor', 'Gothenburg', 'Aalborg'];
      for (const port of ports) {
        for (let act = 0; act <= 5; act++) {
          const npcs = getPortStoryNPCs(port, act, null);
          const captain = npcs.find(n => n.storyNpcId === 'english_captain');
          assert.equal(captain, undefined, `english_captain should not appear at ${port} act ${act}`);
        }
      }
    });
  });
});
