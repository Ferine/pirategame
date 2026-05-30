'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateStealthMap, STEALTH_TILES } = require('../../src/stealth/stealth-map');

const W = 40, H = 25;
const passable = (t) => !!(STEALTH_TILES[t] && STEALTH_TILES[t].passable);

function reachableSet(map) {
  const t = map.tiles;
  const seen = new Uint8Array(W * H);
  const s = map.spawn.y * W + map.spawn.x;
  seen[s] = 1;
  const q = [s];
  let head = 0;
  while (head < q.length) {
    const i = q[head++];
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const j = ny * W + nx;
      if (!seen[j] && passable(t[j])) { seen[j] = 1; q.push(j); }
    }
  }
  return seen;
}

test('stealth ship infiltration is always completable', async (t) => {
  // The 'ship' template is the only stealth map the game actually launches
  // (encounter "Infiltrate"). The Act 3 campaign advance requires a full
  // SUCCESS (all objectives + reach the exit), so every objective and the exit
  // must be reachable from the spawn for every seed — otherwise the campaign
  // could soft-lock.
  await t.test('all objectives and the exit reachable across many seeds', () => {
    const failures = [];
    for (let seed = 1; seed <= 300; seed++) {
      const map = generateStealthMap('ship', seed, {});
      const seen = reachableSet(map);
      const objOk = map.objectives.every((o) => seen[o.y * W + o.x]);
      const exitOk = !!seen[map.exit.y * W + map.exit.x];
      if (!objOk || !exitOk) failures.push({ seed, objOk, exitOk });
    }
    assert.deepEqual(failures, [], 'ship infiltration must always be fully completable');
  });

  await t.test('ship template has at least one objective and an exit', () => {
    const map = generateStealthMap('ship', 1, {});
    assert.ok(map.objectives.length >= 1);
    assert.ok(map.exit && Number.isInteger(map.exit.x));
  });
});
