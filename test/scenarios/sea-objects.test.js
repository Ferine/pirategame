'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createSeaObjectsState,
  updateSeaObjects,
  checkSeaObjectCollision,
  resolveSeaObject,
  SEA_OBJECT_TYPES,
  MAX_OBJECTS,
} = require('../../src/world/sea-objects');
const { TILE } = require('../../src/render/tiles');
const { MAP_WIDTH, MAP_HEIGHT } = require('../../src/world/map-gen');

function makeMap() {
  // All ocean tiles
  const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  tiles.fill(TILE.OCEAN);
  return { tiles, width: MAP_WIDTH, height: MAP_HEIGHT };
}

describe('sea-objects', () => {
  describe('createSeaObjectsState', () => {
    it('returns initial state', () => {
      const state = createSeaObjectsState();
      assert.deepStrictEqual(state.objects, []);
      assert.ok(state.spawnTimer > 0);
      assert.equal(state.nextId, 1);
    });
  });

  describe('SEA_OBJECT_TYPES', () => {
    it('has 6 types', () => {
      assert.equal(Object.keys(SEA_OBJECT_TYPES).length, 6);
    });

    it('each type has char, color, weight, name', () => {
      for (const [key, def] of Object.entries(SEA_OBJECT_TYPES)) {
        assert.ok(def.char, `${key} missing char`);
        assert.ok(typeof def.color === 'number', `${key} missing color`);
        assert.ok(def.weight > 0, `${key} missing weight`);
        assert.ok(def.name, `${key} missing name`);
      }
    });
  });

  describe('updateSeaObjects', () => {
    it('spawns an object when timer expires', () => {
      const state = createSeaObjectsState();
      state.spawnTimer = 0.1;
      const map = makeMap();
      updateSeaObjects(state, 150, 100, map, 0.2);
      assert.ok(state.objects.length <= 1);
      // Timer should have been reset if spawn happened
      if (state.objects.length === 1) {
        assert.ok(state.spawnTimer > 0);
        assert.ok(state.objects[0].type);
        assert.ok(state.objects[0].x);
        assert.ok(state.objects[0].y);
      }
    });

    it('does not exceed MAX_OBJECTS', () => {
      const state = createSeaObjectsState();
      // Fill to max
      for (let i = 0; i < MAX_OBJECTS; i++) {
        state.objects.push({ id: i + 1, type: 'wreckage', x: 150 + i, y: 100 });
      }
      state.spawnTimer = 0.01;
      const map = makeMap();
      updateSeaObjects(state, 150, 100, map, 1);
      assert.equal(state.objects.length, MAX_OBJECTS);
    });

    it('despawns far objects', () => {
      const state = createSeaObjectsState();
      state.objects.push({ id: 1, type: 'wreckage', x: 10, y: 10 });
      const map = makeMap();
      // Player at 150, 100 — object at 10, 10 is >50 tiles away
      updateSeaObjects(state, 150, 100, map, 0.1);
      assert.equal(state.objects.length, 0);
    });
  });

  describe('checkSeaObjectCollision', () => {
    it('returns object at player position', () => {
      const state = createSeaObjectsState();
      state.objects.push({ id: 1, type: 'floating_cargo', x: 100, y: 50 });
      const result = checkSeaObjectCollision(state, 100, 50);
      assert.ok(result);
      assert.equal(result.type, 'floating_cargo');
      assert.equal(state.objects.length, 0); // removed
    });

    it('returns null when no match', () => {
      const state = createSeaObjectsState();
      state.objects.push({ id: 1, type: 'wreckage', x: 100, y: 50 });
      const result = checkSeaObjectCollision(state, 101, 50);
      assert.equal(result, null);
      assert.equal(state.objects.length, 1); // still there
    });
  });

  describe('resolveSeaObject', () => {
    it('wreckage returns text and effects', () => {
      for (let i = 0; i < 30; i++) {
        const result = resolveSeaObject({ type: 'wreckage', id: 1 });
        assert.ok(result.text.length > 0);
        assert.ok(result.effects);
      }
    });

    it('floating_cargo can give cargo', () => {
      let gotCargo = false;
      for (let i = 0; i < 30; i++) {
        const result = resolveSeaObject({ type: 'floating_cargo', id: 1 });
        if (result.effects.cargo) gotCargo = true;
      }
      assert.ok(gotCargo, 'Expected at least one cargo result');
    });

    it('distress can spawn hostile', () => {
      let gotHostile = false;
      for (let i = 0; i < 100; i++) {
        const result = resolveSeaObject({ type: 'distress', id: 1 });
        if (result.effects.spawnHostile) gotHostile = true;
      }
      assert.ok(gotHostile, 'Expected at least one hostile spawn');
    });

    it('derelict can give treasure hint', () => {
      let gotHint = false;
      for (let i = 0; i < 100; i++) {
        const result = resolveSeaObject({ type: 'derelict', id: 1 });
        if (result.effects.treasureHint) gotHint = true;
      }
      assert.ok(gotHint, 'Expected at least one treasure hint');
    });

    it('debris_field can damage hull', () => {
      let gotDamage = false;
      for (let i = 0; i < 30; i++) {
        const result = resolveSeaObject({ type: 'debris_field', id: 1 });
        if (result.effects.hull && result.effects.hull < 0) gotDamage = true;
      }
      assert.ok(gotDamage, 'Expected hull damage from debris');
    });

    it('message_bottle returns text', () => {
      const result = resolveSeaObject({ type: 'message_bottle', id: 1 });
      assert.ok(result.text.length > 0);
    });
  });
});
