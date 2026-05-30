'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateMap, MAP_WIDTH, MAP_HEIGHT } = require('../../src/world/map-gen');
const { TILE } = require('../../src/render/tiles');

// Tiles a ship can sail through (mirror of map-gen's PASSABLE_TILES).
const PASSABLE = new Set([
  TILE.DEEP_OCEAN, TILE.OCEAN, TILE.SHALLOW, TILE.PORT, TILE.ISLAND,
]);

// Player spawn (see src/index.js).
const SPAWN_X = 150;
const SPAWN_Y = 100;

function reachableFromSpawn(tiles) {
  const seen = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  const start = SPAWN_Y * MAP_WIDTH + SPAWN_X;
  const queue = [];
  if (PASSABLE.has(tiles[start])) { seen[start] = 1; queue.push(start); }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % MAP_WIDTH;
    const y = (i / MAP_WIDTH) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
        const j = ny * MAP_WIDTH + nx;
        if (!seen[j] && PASSABLE.has(tiles[j])) { seen[j] = 1; queue.push(j); }
      }
    }
  }
  return seen;
}

test('map reachability', async (t) => {
  // The shipped game always uses this seed (src/index.js).
  const map = await generateMap('kattegat-default');
  const seen = reachableFromSpawn(map.tiles);

  await t.test('player spawn is on passable water', () => {
    assert.ok(PASSABLE.has(map.tiles[SPAWN_Y * MAP_WIDTH + SPAWN_X]));
  });

  await t.test('every port is reachable by ship from spawn', () => {
    const unreachable = map.ports.filter(
      (p) => !seen[p.actualY * MAP_WIDTH + p.actualX]
    );
    assert.deepEqual(
      unreachable.map((p) => p.name),
      [],
      'these ports cannot be reached by sailing (campaign Act 4 gates on Helsingor)'
    );
  });

  await t.test('every port tile is actually a PORT', () => {
    for (const p of map.ports) {
      assert.equal(map.tiles[p.actualY * MAP_WIDTH + p.actualX], TILE.PORT, p.name);
    }
  });

  await t.test('every island is reachable by ship from spawn', () => {
    // Islands are reachable if they or a passable neighbor are in the basin.
    const reachableIsland = (isl) => {
      const x = isl.actualX, y = isl.actualY;
      if (seen[y * MAP_WIDTH + x]) return true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
          if (seen[ny * MAP_WIDTH + nx]) return true;
        }
      }
      return false;
    };
    const unreachable = map.islands.filter((isl) => !reachableIsland(isl)).map((i) => i.name);
    assert.deepEqual(unreachable, [], 'these islands (treasure targets) are stranded');
  });

  await t.test('generates the expected number of ports and islands', () => {
    assert.equal(map.ports.length, 9);
    assert.equal(map.islands.length, 6);
  });
});
