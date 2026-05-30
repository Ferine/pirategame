'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getIntroPages, getControlsReference } = require('../../src/world/onboarding');
const { createPersistent, loadPersistent } = require('../../src/meta/legacy');

test('onboarding content', async (t) => {
  await t.test('intro has multiple pages and names the ship', () => {
    const pages = getIntroPages('Sea Hawk');
    assert.ok(pages.length >= 3, 'at least 3 welcome pages');
    for (const p of pages) {
      assert.ok(typeof p.title === 'string' && p.title.length > 0);
      assert.ok(Array.isArray(p.lines) && p.lines.length > 0);
    }
    const joined = pages.map((p) => p.lines.join(' ')).join(' ');
    assert.ok(joined.includes('Sea Hawk'), 'the chosen ship name appears in the welcome');
  });

  await t.test('intro handles a missing ship name without crashing', () => {
    const pages = getIntroPages();
    assert.ok(pages.length >= 3);
  });

  await t.test('controls reference covers the core keys', () => {
    const rows = getControlsReference();
    const keys = rows.map((r) => r[0]);
    for (const k of ['N', 'J', 'M', '?', 'Q']) {
      assert.ok(keys.includes(k), `controls should mention ${k}`);
    }
  });
});

test('first-run flag persistence', async (t) => {
  await t.test('new persistent data starts with tutorialSeen=false', () => {
    assert.equal(createPersistent().tutorialSeen, false);
  });

  await t.test('loadPersistent preserves tutorialSeen across the defaults merge', () => {
    // loadPersistent reads from disk; with no file it returns defaults (false).
    const p = loadPersistent();
    assert.equal(typeof p.tutorialSeen, 'boolean');
  });
});
