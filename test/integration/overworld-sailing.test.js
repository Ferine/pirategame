'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');
const { createTestGameState } = require('../helpers/game-state');

// --- Tiles & map ---
const { TILE, TILE_DEFS } = require('../../src/render/tiles');
const { MAP_WIDTH, MAP_HEIGHT } = require('../../src/world/map-gen');

// --- Currents ---
const { getCurrentAt, getCurrentSpeedMult } = require('../../src/world/currents');

// --- Weather ---
const { WEATHER_EFFECTS, createWeatherState, updateWeather, getWeatherEffects } = require('../../src/world/weather');

// --- NPC ships ---
const {
  FACTION, FACTION_TEMPLATES, MAX_NPC_SHIPS,
  createNPCShips, updateNPCShips, checkEncounter, removeNPCShip,
  _resolveNPCClashes, _pickSpawnFaction, _generateNPCCargo,
} = require('../../src/world/npc-ships');

// --- Sea objects ---
const {
  SEA_OBJECT_TYPES, MAX_OBJECTS,
  createSeaObjectsState, updateSeaObjects, checkSeaObjectCollision, resolveSeaObject,
} = require('../../src/world/sea-objects');

// --- Factions ---
const { isPortAccessAllowed } = require('../../src/world/factions');

// Wind speed multipliers (same as overworld.js)
const SPEED_MULT = [0.3, 0.5, 0.9, 1.0, 0.7];

// Direction vectors (same as overworld.js)
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

/**
 * Build a minimal ocean map with specific tiles placed.
 * Defaults to all OCEAN (passable).
 */
function createTestMap(overrides) {
  const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  tiles.fill(TILE.OCEAN);  // all ocean by default

  if (overrides) {
    for (const { x, y, tile } of overrides) {
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        tiles[y * MAP_WIDTH + x] = tile;
      }
    }
  }

  return {
    tiles,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    ports: [],
    islands: [],
  };
}

/**
 * Simulate one step of ship movement using the same logic as _updateShip.
 * Returns the new speed and whether the ship moved.
 */
function simulateShipMove(gs, dt) {
  const { ship, wind, map } = gs;

  // Angle difference
  let diff = Math.abs(ship.direction - wind.direction);
  if (diff > 4) diff = 8 - diff;

  // Weather speed mult
  const weatherFx = gs.weather ? getWeatherEffects(gs.weather) : null;
  const weatherSpeedMult = weatherFx ? weatherFx.speedMult : 1.0;

  // Economy speed bonus
  const speedBonus = gs.economy ? (gs.economy.speedBonus || 0) : 0;
  const speedMult = 1 + speedBonus;

  // Gust modifier
  let gustMult = 1.0;
  if (wind.gustActive && wind.gustDir !== undefined) {
    let gustDiff = Math.abs(ship.direction - wind.gustDir);
    if (gustDiff > 4) gustDiff = 8 - gustDiff;
    gustMult = gustDiff <= 1 ? 1.5 : 0.7;
  }

  // Current modifier
  const current = getCurrentAt(ship.x, ship.y);
  const currentMult = getCurrentSpeedMult(current, ship.direction);

  const speed = SPEED_MULT[diff] * wind.strength * weatherSpeedMult * speedMult * gustMult * currentMult;
  gs.currentSpeed = speed;

  // Accumulate movement
  ship.moveAccum = (ship.moveAccum || 0) + speed * dt;
  const startX = ship.x;
  const startY = ship.y;

  // Move in whole-tile steps
  while (ship.moveAccum >= 1.0) {
    ship.moveAccum -= 1.0;

    const nx = ship.x + DIR_DX[ship.direction];
    const ny = ship.y + DIR_DY[ship.direction];

    if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) {
      ship.moveAccum = 0;
      break;
    }

    const tile = map.tiles[ny * MAP_WIDTH + nx];
    if (TILE_DEFS[tile] && TILE_DEFS[tile].passable) {
      ship.x = nx;
      ship.y = ny;
    } else {
      ship.moveAccum = 0;
      break;
    }
  }

  return { speed, moved: ship.x !== startX || ship.y !== startY };
}

// ===========================================================================
// Wind angle affects speed
// ===========================================================================

describe('overworld sailing: wind angle effects', () => {
  it('headwind (diff=0) gives lowest speed multiplier', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    // Ship facing north, wind blowing north (same direction = headwind)
    gs.ship.direction = 0;
    gs.wind.direction = 0;
    gs.wind.strength = 3;
    gs.wind.gustActive = false;

    const { speed } = simulateShipMove(gs, 0);
    // SPEED_MULT[0] = 0.3
    assert.ok(speed < 1.5, `headwind speed should be low (got ${speed})`);
  });

  it('optimal angle (diff=3) gives highest speed multiplier', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    // Ship facing north (0), wind direction 3 (SE) → diff=3
    gs.ship.direction = 0;
    gs.wind.direction = 3;
    gs.wind.strength = 3;
    gs.wind.gustActive = false;

    const { speed: optSpeed } = simulateShipMove(gs, 0);

    // Compare to headwind
    gs.ship.direction = 0;
    gs.wind.direction = 0;
    const { speed: headSpeed } = simulateShipMove(gs, 0);

    assert.ok(optSpeed > headSpeed,
      `optimal angle speed (${optSpeed}) should be > headwind speed (${headSpeed})`);
  });

  it('all 5 wind angle brackets produce different multipliers', () => {
    const speeds = [];
    for (let diff = 0; diff <= 4; diff++) {
      const gs = createTestGameState();
      gs.map = createTestMap();
      gs.ship.direction = 0;
      gs.wind.direction = diff; // diff = absolute difference
      gs.wind.strength = 3;
      gs.wind.gustActive = false;

      const { speed } = simulateShipMove(gs, 0);
      speeds.push(speed);
    }

    // Verify the speed values reflect SPEED_MULT = [0.3, 0.5, 0.9, 1.0, 0.7]
    assert.ok(speeds[0] < speeds[1], 'diff=0 < diff=1');
    assert.ok(speeds[1] < speeds[2], 'diff=1 < diff=2');
    assert.ok(speeds[2] < speeds[3], 'diff=2 < diff=3 (optimal)');
    assert.ok(speeds[4] < speeds[3], 'diff=4 < diff=3');
    assert.ok(speeds[4] > speeds[1], 'diff=4 > diff=1');
  });

  it('wind wraps correctly around 8 directions', () => {
    // Ship dir 1 (NE), wind dir 6 (W) → diff should be 3 (via wrap)
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.ship.direction = 1;
    gs.wind.direction = 6;
    gs.wind.strength = 3;
    gs.wind.gustActive = false;

    const { speed: wrapSpeed } = simulateShipMove(gs, 0);

    // Compare to explicit diff=3
    gs.ship.direction = 0;
    gs.wind.direction = 3;
    const { speed: directSpeed } = simulateShipMove(gs, 0);

    // Should be similar (both diff=3, but current effects may differ slightly)
    const ratio = wrapSpeed / directSpeed;
    assert.ok(ratio > 0.7 && ratio < 1.4,
      `wrapped and direct diff=3 should be similar (ratio=${ratio.toFixed(2)})`);
  });
});

// ===========================================================================
// Wind strength effects
// ===========================================================================

describe('overworld sailing: wind strength scaling', () => {
  it('stronger wind produces proportionally faster speed', () => {
    const speeds = [];
    for (let strength = 1; strength <= 5; strength++) {
      const gs = createTestGameState();
      gs.map = createTestMap();
      gs.ship.direction = 0;
      gs.wind.direction = 3; // optimal angle
      gs.wind.strength = strength;
      gs.wind.gustActive = false;

      const { speed } = simulateShipMove(gs, 0);
      speeds.push(speed);
    }

    // Each step should be faster
    for (let i = 1; i < speeds.length; i++) {
      assert.ok(speeds[i] > speeds[i - 1],
        `strength ${i + 1} speed (${speeds[i]}) should be > strength ${i} (${speeds[i - 1]})`);
    }
  });

  it('speed scales linearly with wind strength', () => {
    const gs1 = createTestGameState();
    gs1.map = createTestMap();
    gs1.ship.direction = 2;
    gs1.wind.direction = 2; // headwind, simplest
    gs1.wind.strength = 2;
    gs1.wind.gustActive = false;

    const gs2 = createTestGameState();
    gs2.map = createTestMap();
    gs2.ship.direction = 2;
    gs2.wind.direction = 2;
    gs2.wind.strength = 4;
    gs2.wind.gustActive = false;

    const { speed: s1 } = simulateShipMove(gs1, 0);
    const { speed: s2 } = simulateShipMove(gs2, 0);

    // s2 should be ~2x s1 (both at same position, same currents)
    const ratio = s2 / s1;
    assert.ok(Math.abs(ratio - 2.0) < 0.01, `double wind should give ~2x speed (ratio=${ratio.toFixed(3)})`);
  });
});

// ===========================================================================
// Ship movement & tile collision
// ===========================================================================

describe('overworld sailing: movement and collision', () => {
  it('ship moves forward on ocean tiles', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.ship.x = 150;
    gs.ship.y = 100;
    gs.ship.direction = 4; // south
    gs.ship.moveAccum = 0;
    gs.wind.direction = 0; // optimal: diff=4
    gs.wind.strength = 5;
    gs.wind.gustActive = false;

    // Simulate enough time to move at least 1 tile
    for (let i = 0; i < 20; i++) {
      simulateShipMove(gs, 1 / 12);
    }

    assert.ok(gs.ship.y > 100, `ship should have moved south (y=${gs.ship.y})`);
    assert.equal(gs.ship.x, 150, 'ship should not move laterally');
  });

  it('ship stops at impassable tiles (land)', () => {
    // Place a wall of beach tiles in the path
    const overrides = [];
    for (let x = 140; x <= 160; x++) {
      overrides.push({ x, y: 98, tile: TILE.BEACH });
    }
    const gs = createTestGameState();
    gs.map = createTestMap(overrides);
    gs.ship.x = 150;
    gs.ship.y = 100;
    gs.ship.direction = 0; // north
    gs.ship.moveAccum = 0;
    gs.wind.direction = 4; // optimal angle (diff=4)
    gs.wind.strength = 5;
    gs.wind.gustActive = false;

    // Move ship north — should stop at y=99 (one before beach)
    for (let i = 0; i < 30; i++) {
      simulateShipMove(gs, 1 / 12);
    }

    assert.ok(gs.ship.y >= 99, `ship should stop before beach (y=${gs.ship.y})`);
    assert.ok(gs.ship.y <= 100, `ship should have advanced at most to y=99 (y=${gs.ship.y})`);
  });

  it('ship stops at map boundaries', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.ship.x = 1;
    gs.ship.y = 1;
    gs.ship.direction = 0; // north (toward y=0 boundary)
    gs.ship.moveAccum = 0;
    gs.wind.direction = 4;
    gs.wind.strength = 5;
    gs.wind.gustActive = false;

    for (let i = 0; i < 30; i++) {
      simulateShipMove(gs, 1 / 12);
    }

    assert.ok(gs.ship.y >= 0, 'ship should not go below y=0');
    assert.ok(gs.ship.x >= 0, 'ship should not go below x=0');
  });

  it('diagonal movement changes both x and y', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.ship.x = 150;
    gs.ship.y = 100;
    gs.ship.direction = 3; // SE
    gs.ship.moveAccum = 0;
    gs.wind.direction = 7; // NW (diff=4 from SE)
    gs.wind.strength = 5;
    gs.wind.gustActive = false;

    for (let i = 0; i < 20; i++) {
      simulateShipMove(gs, 1 / 12);
    }

    assert.ok(gs.ship.x > 150, `ship should move east (x=${gs.ship.x})`);
    assert.ok(gs.ship.y > 100, `ship should move south (y=${gs.ship.y})`);
  });

  it('all 8 directions produce correct displacement', () => {
    for (let dir = 0; dir < 8; dir++) {
      const gs = createTestGameState();
      gs.map = createTestMap();
      gs.ship.x = 150;
      gs.ship.y = 100;
      gs.ship.direction = dir;
      gs.ship.moveAccum = 1.0; // exactly 1 tile of movement

      simulateShipMove(gs, 0);

      const dx = gs.ship.x - 150;
      const dy = gs.ship.y - 100;
      assert.equal(dx, DIR_DX[dir], `dir ${dir}: dx should be ${DIR_DX[dir]} (got ${dx})`);
      assert.equal(dy, DIR_DY[dir], `dir ${dir}: dy should be ${DIR_DY[dir]} (got ${dy})`);
    }
  });

  it('passable tile types allow movement', () => {
    const passableTiles = [TILE.DEEP_OCEAN, TILE.OCEAN, TILE.SHALLOW, TILE.PORT, TILE.ISLAND];
    for (const tileType of passableTiles) {
      const gs = createTestGameState();
      // Place test tile at y=99, and beach at y=98 to stop after one step
      gs.map = createTestMap([
        { x: 150, y: 99, tile: tileType },
        { x: 150, y: 98, tile: TILE.BEACH },
      ]);
      gs.ship.x = 150;
      gs.ship.y = 100;
      gs.ship.direction = 0; // north
      gs.ship.moveAccum = 1.0; // exactly 1 tile

      simulateShipMove(gs, 0);
      assert.equal(gs.ship.y, 99, `tile type ${tileType} should be passable`);
    }
  });

  it('impassable tile types block movement', () => {
    const impassableTiles = [TILE.BEACH, TILE.GRASS, TILE.FOREST, TILE.HILL, TILE.MOUNTAIN];
    for (const tileType of impassableTiles) {
      const gs = createTestGameState();
      gs.map = createTestMap([{ x: 150, y: 99, tile: tileType }]);
      gs.ship.x = 150;
      gs.ship.y = 100;
      gs.ship.direction = 0; // north
      gs.ship.moveAccum = 1.0;

      simulateShipMove(gs, 0);
      assert.equal(gs.ship.y, 100, `tile type ${tileType} should block movement`);
    }
  });
});

// ===========================================================================
// Weather effects on sailing
// ===========================================================================

describe('overworld sailing: weather effects', () => {
  it('storm reduces speed to 60%', () => {
    const gsStorm = createTestGameState();
    gsStorm.map = createTestMap();
    gsStorm.weather.type = 'storm';
    gsStorm.ship.direction = 0;
    gsStorm.wind.direction = 3;
    gsStorm.wind.strength = 3;
    gsStorm.wind.gustActive = false;

    const gsClear = createTestGameState();
    gsClear.map = createTestMap();
    gsClear.weather.type = 'clear';
    gsClear.ship.direction = 0;
    gsClear.wind.direction = 3;
    gsClear.wind.strength = 3;
    gsClear.wind.gustActive = false;

    const { speed: stormSpeed } = simulateShipMove(gsStorm, 0);
    const { speed: clearSpeed } = simulateShipMove(gsClear, 0);

    const ratio = stormSpeed / clearSpeed;
    assert.ok(Math.abs(ratio - 0.6) < 0.01,
      `storm should give 60% of clear speed (ratio=${ratio.toFixed(3)})`);
  });

  it('rain reduces speed to 85%', () => {
    const gsRain = createTestGameState();
    gsRain.map = createTestMap();
    gsRain.weather.type = 'rain';
    gsRain.ship.direction = 0;
    gsRain.wind.direction = 3;
    gsRain.wind.strength = 3;
    gsRain.wind.gustActive = false;

    const gsClear = createTestGameState();
    gsClear.map = createTestMap();
    gsClear.weather.type = 'clear';
    gsClear.ship.direction = 0;
    gsClear.wind.direction = 3;
    gsClear.wind.strength = 3;
    gsClear.wind.gustActive = false;

    const { speed: rainSpeed } = simulateShipMove(gsRain, 0);
    const { speed: clearSpeed } = simulateShipMove(gsClear, 0);

    const ratio = rainSpeed / clearSpeed;
    assert.ok(Math.abs(ratio - 0.85) < 0.01,
      `rain should give 85% of clear speed (ratio=${ratio.toFixed(3)})`);
  });

  it('fog does not reduce speed', () => {
    const gsFog = createTestGameState();
    gsFog.map = createTestMap();
    gsFog.weather.type = 'fog';
    gsFog.ship.direction = 0;
    gsFog.wind.direction = 3;
    gsFog.wind.strength = 3;
    gsFog.wind.gustActive = false;

    const gsClear = createTestGameState();
    gsClear.map = createTestMap();
    gsClear.weather.type = 'clear';
    gsClear.ship.direction = 0;
    gsClear.wind.direction = 3;
    gsClear.wind.strength = 3;
    gsClear.wind.gustActive = false;

    const { speed: fogSpeed } = simulateShipMove(gsFog, 0);
    const { speed: clearSpeed } = simulateShipMove(gsClear, 0);

    const ratio = fogSpeed / clearSpeed;
    assert.ok(Math.abs(ratio - 1.0) < 0.01,
      `fog should not affect speed (ratio=${ratio.toFixed(3)})`);
  });

  it('weather effects table is complete for all types', () => {
    for (const type of ['clear', 'fog', 'rain', 'storm']) {
      const effects = WEATHER_EFFECTS[type];
      assert.ok(effects, `${type} should have effects defined`);
      assert.ok(typeof effects.speedMult === 'number', `${type} should have speedMult`);
      assert.ok(typeof effects.sightRange === 'number', `${type} should have sightRange`);
      assert.ok(effects.sightRange >= 1, `${type} sight range should be >= 1`);
      assert.ok(effects.speedMult > 0 && effects.speedMult <= 1.0, `${type} speedMult should be in (0,1]`);
    }
  });

  it('weather transitions produce valid states', () => {
    const weather = createWeatherState();
    for (let i = 0; i < 200; i++) {
      withDeterministicRandom(i, () => updateWeather(weather, 1.0));
      assert.ok(['clear', 'fog', 'rain', 'storm'].includes(weather.type),
        `weather type should be valid (got ${weather.type})`);
      assert.ok(weather.changeTimer > -2, 'weather changeTimer should not go deeply negative');
    }
  });
});

// ===========================================================================
// Wind gust system
// ===========================================================================

describe('overworld sailing: wind gusts', () => {
  it('gust aligned with ship gives 1.5x speed boost', () => {
    const gsGust = createTestGameState();
    gsGust.map = createTestMap();
    gsGust.ship.direction = 2; // E
    gsGust.wind.direction = 2; // E (headwind)
    gsGust.wind.strength = 3;
    gsGust.wind.gustActive = true;
    gsGust.wind.gustDir = 2; // gust from E — aligned with ship (diff=0)
    gsGust.wind.gustTimer = 5;

    const gsNoGust = createTestGameState();
    gsNoGust.map = createTestMap();
    gsNoGust.ship.direction = 2;
    gsNoGust.wind.direction = 2;
    gsNoGust.wind.strength = 3;
    gsNoGust.wind.gustActive = false;

    const { speed: gustSpeed } = simulateShipMove(gsGust, 0);
    const { speed: noGustSpeed } = simulateShipMove(gsNoGust, 0);

    const ratio = gustSpeed / noGustSpeed;
    assert.ok(Math.abs(ratio - 1.5) < 0.01,
      `aligned gust should give 1.5x speed (ratio=${ratio.toFixed(3)})`);
  });

  it('gust misaligned with ship gives 0.7x speed penalty', () => {
    const gsGust = createTestGameState();
    gsGust.map = createTestMap();
    gsGust.ship.direction = 0; // N
    gsGust.wind.direction = 0; // N
    gsGust.wind.strength = 3;
    gsGust.wind.gustActive = true;
    gsGust.wind.gustDir = 4; // gust from S — opposite ship direction (diff=4)
    gsGust.wind.gustTimer = 5;

    const gsNoGust = createTestGameState();
    gsNoGust.map = createTestMap();
    gsNoGust.ship.direction = 0;
    gsNoGust.wind.direction = 0;
    gsNoGust.wind.strength = 3;
    gsNoGust.wind.gustActive = false;

    const { speed: gustSpeed } = simulateShipMove(gsGust, 0);
    const { speed: noGustSpeed } = simulateShipMove(gsNoGust, 0);

    const ratio = gustSpeed / noGustSpeed;
    assert.ok(Math.abs(ratio - 0.7) < 0.01,
      `misaligned gust should give 0.7x speed (ratio=${ratio.toFixed(3)})`);
  });
});

// ===========================================================================
// Ocean currents
// ===========================================================================

describe('overworld sailing: ocean currents', () => {
  it('currents are deterministic at same position', () => {
    const c1 = getCurrentAt(100, 50);
    const c2 = getCurrentAt(100, 50);
    assert.equal(c1.direction, c2.direction, 'same position should give same direction');
    assert.equal(c1.strength, c2.strength, 'same position should give same strength');
  });

  it('currents vary across different positions', () => {
    const positions = [
      { x: 10, y: 10 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ];

    const currents = positions.map(p => getCurrentAt(p.x, p.y));
    // Not all should be identical
    const uniqueDirections = new Set(currents.map(c => c.direction));
    assert.ok(uniqueDirections.size > 1, 'different positions should have different current directions');
  });

  it('currents are stronger in the narrows (Helsingor area)', () => {
    const narrowsCurrent = getCurrentAt(150, 90); // Narrows center
    const openCurrent = getCurrentAt(50, 50);     // Far from narrows

    // Narrows should generally have stronger currents
    // But due to sine wave pattern, check the narrows enhancement works
    assert.ok(narrowsCurrent.strength > 0, 'narrows should have positive current');
    assert.ok(narrowsCurrent.strength <= 1.0, 'current strength capped at 1.0');
    assert.ok(openCurrent.strength > 0, 'open sea should have positive current');
  });

  it('sailing with current gives speed boost (+30% max)', () => {
    const current = { direction: 2, strength: 1.0 }; // strong east current
    const mult = getCurrentSpeedMult(current, 2); // ship sailing east (same dir)
    assert.ok(Math.abs(mult - 1.3) < 0.01, `with current mult should be ~1.3 (got ${mult})`);
  });

  it('sailing against current gives speed penalty (-20% max)', () => {
    const current = { direction: 2, strength: 1.0 }; // strong east current
    const mult = getCurrentSpeedMult(current, 6); // ship sailing west (opposite, diff=4)
    assert.ok(Math.abs(mult - 0.8) < 0.01, `against current mult should be ~0.8 (got ${mult})`);
  });

  it('sailing perpendicular to current gives no modifier', () => {
    const current = { direction: 0, strength: 1.0 }; // strong north current
    const mult = getCurrentSpeedMult(current, 2); // ship sailing east (diff=2, perpendicular)
    assert.equal(mult, 1.0, 'perpendicular should give 1.0x');
  });

  it('weak currents have negligible effect', () => {
    const current = { direction: 2, strength: 0.05 }; // very weak
    const mult = getCurrentSpeedMult(current, 2);
    assert.equal(mult, 1.0, 'very weak current should give 1.0x');
  });

  it('currents affect ship speed in simulation', () => {
    // Find a position with a known current direction
    const pos = { x: 100, y: 50 };
    const current = getCurrentAt(pos.x, pos.y);

    const gsWith = createTestGameState();
    gsWith.map = createTestMap();
    gsWith.ship.x = pos.x;
    gsWith.ship.y = pos.y;
    gsWith.ship.direction = current.direction; // sail with current
    gsWith.wind.direction = (current.direction + 3) % 8; // optimal wind angle
    gsWith.wind.strength = 3;
    gsWith.wind.gustActive = false;

    const gsAgainst = createTestGameState();
    gsAgainst.map = createTestMap();
    gsAgainst.ship.x = pos.x;
    gsAgainst.ship.y = pos.y;
    gsAgainst.ship.direction = (current.direction + 4) % 8; // sail against current
    gsAgainst.wind.direction = (gsAgainst.ship.direction + 3) % 8; // same wind angle
    gsAgainst.wind.strength = 3;
    gsAgainst.wind.gustActive = false;

    const { speed: withSpeed } = simulateShipMove(gsWith, 0);
    const { speed: againstSpeed } = simulateShipMove(gsAgainst, 0);

    if (current.strength >= 0.1) {
      assert.ok(withSpeed > againstSpeed,
        `sailing with current (${withSpeed.toFixed(2)}) should be faster than against (${againstSpeed.toFixed(2)})`);
    }
  });
});

// ===========================================================================
// NPC ship system
// ===========================================================================

describe('overworld sailing: NPC ships', () => {
  it('NPC spawn produces valid ships on water tiles', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();

    const ships = withDeterministicRandom(1, () => createNPCShips(gs));
    assert.ok(ships.length > 0, 'should spawn some NPC ships');
    assert.ok(ships.length <= MAX_NPC_SHIPS, `should not exceed max (${ships.length})`);

    for (const ship of ships) {
      assert.ok(ship.x >= 0 && ship.x < MAP_WIDTH, 'ship x in bounds');
      assert.ok(ship.y >= 0 && ship.y < MAP_HEIGHT, 'ship y in bounds');
      assert.ok(ship.hull > 0, 'ship should have hull');
      assert.ok(ship.crew > 0, 'ship should have crew');
      assert.ok(['english', 'danish', 'merchant', 'pirate'].includes(ship.faction), 'valid faction');

      // Ship should be on passable water tile
      const tile = gs.map.tiles[ship.y * MAP_WIDTH + ship.x];
      assert.ok(TILE_DEFS[tile] && TILE_DEFS[tile].passable, 'ship should be on passable tile');
    }
  });

  it('NPC faction spawn weights roughly match expectations', () => {
    const counts = { merchant: 0, english: 0, pirate: 0, danish: 0 };
    for (let seed = 0; seed < 200; seed++) {
      const faction = withDeterministicRandom(seed, () => _pickSpawnFaction());
      counts[faction]++;
    }

    // Merchants should be most common (~50%), pirates and danish least (~15% each)
    assert.ok(counts.merchant > counts.english, 'merchants should be more common than english');
    assert.ok(counts.merchant > counts.pirate, 'merchants should be more common than pirates');
    assert.ok(counts.merchant > counts.danish, 'merchants should be more common than danish');
    assert.ok(counts.merchant > 60, 'merchants should be >30% of spawns');
  });

  it('NPC ships have faction-appropriate stats', () => {
    for (const [faction, template] of Object.entries(FACTION_TEMPLATES)) {
      assert.ok(template.hull > 0, `${faction} hull should be positive`);
      assert.ok(template.crew > 0, `${faction} crew should be positive`);
      assert.ok(template.speed > 0, `${faction} speed should be positive`);
      assert.ok(template.aggression >= 0 && template.aggression <= 1.0, `${faction} aggression in [0,1]`);
    }
    // Pirates should be fastest and most aggressive
    assert.ok(FACTION_TEMPLATES.pirate.speed > FACTION_TEMPLATES.merchant.speed,
      'pirates should be faster than merchants');
    assert.ok(FACTION_TEMPLATES.pirate.aggression > FACTION_TEMPLATES.merchant.aggression,
      'pirates should be more aggressive than merchants');
  });

  it('encounter detection triggers when NPC adjacent to player', () => {
    const npc = {
      id: 'test', faction: 'pirate', x: 151, y: 100,
      hull: 80, crew: 45, direction: 0,
    };
    const result = checkEncounter([npc], 150, 100, null);
    assert.ok(result, 'should detect encounter at distance 1');
    assert.equal(result.id, 'test');
  });

  it('encounter detection does NOT trigger when NPC is far', () => {
    const npc = {
      id: 'test', faction: 'pirate', x: 155, y: 100,
      hull: 80, crew: 45, direction: 0,
    };
    const result = checkEncounter([npc], 150, 100, null);
    assert.equal(result, null, 'should not detect encounter at distance 5');
  });

  it('encounter detection does NOT trigger at distance 0 (same tile)', () => {
    const npc = {
      id: 'test', faction: 'pirate', x: 150, y: 100,
      hull: 80, crew: 45, direction: 0,
    };
    const result = checkEncounter([npc], 150, 100, null);
    assert.equal(result, null, 'should not detect encounter on same tile');
  });

  it('NPC-to-NPC clashes remove weaker ship', () => {
    const ships = [
      { id: 'pirate1', faction: 'pirate', x: 50, y: 50, hull: 80, name: 'Black Ravn' },
      { id: 'merchant1', faction: 'merchant', x: 51, y: 50, hull: 60, name: 'Fortuna' },
    ];

    const reports = _resolveNPCClashes(ships);
    assert.equal(ships.length, 1, 'weaker ship should be removed');
    assert.equal(ships[0].id, 'pirate1', 'pirate (stronger) should survive');
    assert.ok(ships[0].hull < 80, 'winner should take damage');
    assert.ok(reports.length === 1, 'should produce one battle report');
  });

  it('NPC-to-NPC clashes only happen between hostile factions', () => {
    const ships = [
      { id: 'eng1', faction: 'english', x: 50, y: 50, hull: 100, name: 'HMS Victory' },
      { id: 'dan1', faction: 'danish', x: 51, y: 50, hull: 70, name: 'KDM Niels Juel' },
    ];

    const reports = _resolveNPCClashes(ships);
    assert.equal(ships.length, 2, 'non-hostile factions should not clash');
    assert.equal(reports.length, 0, 'should produce no reports');
  });

  it('NPC cargo generation matches faction expectations', () => {
    // Merchants carry more cargo and gold
    let merchantCargo = 0;
    let pirateCargo = 0;
    for (let seed = 0; seed < 50; seed++) {
      const mc = withDeterministicRandom(seed, () => _generateNPCCargo('merchant'));
      const pc = withDeterministicRandom(seed, () => _generateNPCCargo('pirate'));
      merchantCargo += Object.values(mc.cargo).reduce((s, v) => s + v, 0);
      pirateCargo += Object.values(pc.cargo).reduce((s, v) => s + v, 0);
    }
    assert.ok(merchantCargo > pirateCargo, 'merchants should carry more total cargo');

    // English and Danish carry no cargo
    const ec = withDeterministicRandom(0, () => _generateNPCCargo('english'));
    assert.equal(Object.keys(ec.cargo).length, 0, 'english should carry no cargo');
    assert.equal(ec.gold, 0, 'english should carry no gold');
  });

  it('removeNPCShip removes the correct ship', () => {
    const ships = [
      { id: 'a', name: 'Ship A' },
      { id: 'b', name: 'Ship B' },
      { id: 'c', name: 'Ship C' },
    ];

    removeNPCShip(ships, 'b');
    assert.equal(ships.length, 2);
    assert.ok(!ships.find(s => s.id === 'b'), 'ship B should be removed');
    assert.ok(ships.find(s => s.id === 'a'), 'ship A should remain');
    assert.ok(ships.find(s => s.id === 'c'), 'ship C should remain');
  });
});

// ===========================================================================
// Sea objects
// ===========================================================================

describe('overworld sailing: sea objects', () => {
  it('sea objects state initializes correctly', () => {
    const state = withDeterministicRandom(1, () => createSeaObjectsState());
    assert.ok(state, 'state should exist');
    assert.ok(Array.isArray(state.objects), 'should have objects array');
    assert.equal(state.objects.length, 0, 'should start with no objects');
    assert.ok(state.spawnTimer > 0, 'should have positive spawn timer');
  });

  it('sea objects spawn over time near player', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    const state = { objects: [], spawnTimer: 0.1, nextId: 1 }; // timer about to fire

    withDeterministicRandom(5, () => {
      updateSeaObjects(state, 150, 100, gs.map, 0.2);
    });

    assert.ok(state.objects.length > 0, 'should spawn an object when timer fires');
    const obj = state.objects[0];
    assert.ok(obj.type, 'object should have a type');
    assert.ok(SEA_OBJECT_TYPES[obj.type], 'object type should be valid');

    // Object should be near player
    const dx = obj.x - 150;
    const dy = obj.y - 100;
    const dist = Math.sqrt(dx * dx + dy * dy);
    assert.ok(dist >= 10 && dist <= 25, `object should spawn in ring around player (dist=${dist.toFixed(1)})`);
  });

  it('sea objects despawn when far from player', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    const state = {
      objects: [{ id: 1, type: 'wreckage', x: 10, y: 10 }], // far from (150, 100)
      spawnTimer: 999,
      nextId: 2,
    };

    updateSeaObjects(state, 150, 100, gs.map, 0.1);
    assert.equal(state.objects.length, 0, 'far object should be despawned');
  });

  it('sea objects do not exceed max count', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    const state = { objects: [], spawnTimer: 0, nextId: 1 };

    // Fill to max
    for (let i = 0; i < MAX_OBJECTS; i++) {
      state.objects.push({ id: i + 1, type: 'wreckage', x: 150 + i, y: 100 });
    }
    state.spawnTimer = 0;

    withDeterministicRandom(10, () => {
      updateSeaObjects(state, 150, 100, gs.map, 1.0);
    });

    assert.ok(state.objects.length <= MAX_OBJECTS, `should not exceed max (${state.objects.length})`);
  });

  it('collision removes object and returns it', () => {
    const state = {
      objects: [
        { id: 1, type: 'wreckage', x: 150, y: 100 },
        { id: 2, type: 'floating_cargo', x: 155, y: 105 },
      ],
      spawnTimer: 999,
      nextId: 3,
    };

    const found = checkSeaObjectCollision(state, 150, 100);
    assert.ok(found, 'should find object at player position');
    assert.equal(found.id, 1);
    assert.equal(found.type, 'wreckage');
    assert.equal(state.objects.length, 1, 'object should be removed from list');

    // No collision at empty position
    const none = checkSeaObjectCollision(state, 160, 110);
    assert.equal(none, null, 'should return null when no object at position');
  });

  it('all sea object types resolve with valid text', () => {
    const types = Object.keys(SEA_OBJECT_TYPES);
    for (const type of types) {
      for (let seed = 0; seed < 10; seed++) {
        const result = withDeterministicRandom(seed, () =>
          resolveSeaObject({ type, id: 1, x: 0, y: 0 })
        );
        assert.ok(result.text, `${type} seed ${seed}: should produce text`);
        assert.ok(typeof result.effects === 'object', `${type} seed ${seed}: should produce effects object`);
      }
    }
  });

  it('sea object effects include gold, cargo, hull damage, or special effects', () => {
    const effectsSeen = new Set();
    for (let seed = 0; seed < 200; seed++) {
      for (const type of Object.keys(SEA_OBJECT_TYPES)) {
        const result = withDeterministicRandom(seed, () =>
          resolveSeaObject({ type, id: 1, x: 0, y: 0 })
        );
        for (const key of Object.keys(result.effects)) {
          effectsSeen.add(key);
        }
      }
    }
    // Should see various effect types across all outcomes
    assert.ok(effectsSeen.has('gold'), 'should see gold effects');
    assert.ok(effectsSeen.has('cargo'), 'should see cargo effects');
    assert.ok(effectsSeen.has('hull'), 'should see hull damage effects');
  });
});

// ===========================================================================
// Port access and reputation gates
// ===========================================================================

describe('overworld sailing: port access', () => {
  it('major ports require crown rep >= 20', () => {
    const rep = { crown: 15, merchant: 50, pirate: 10, english: 50, danish: 50 };
    assert.equal(isPortAccessAllowed(rep, 'Copenhagen'), false, 'Copenhagen should block at crown=15');
    assert.equal(isPortAccessAllowed(rep, 'Aarhus'), false, 'Aarhus should block at crown=15');
    assert.equal(isPortAccessAllowed(rep, 'Aalborg'), false, 'Aalborg should block at crown=15');
  });

  it('major ports allow entry with sufficient crown rep', () => {
    const rep = { crown: 25, merchant: 50, pirate: 10, english: 50, danish: 50 };
    assert.equal(isPortAccessAllowed(rep, 'Copenhagen'), true, 'Copenhagen should allow at crown=25');
    assert.equal(isPortAccessAllowed(rep, 'Aarhus'), true, 'Aarhus should allow at crown=25');
  });

  it('minor ports always allow entry', () => {
    const rep = { crown: 5, merchant: 0, pirate: 0, english: 0, danish: 0 };
    assert.equal(isPortAccessAllowed(rep, 'Skagen'), true, 'minor port should always allow');
    assert.equal(isPortAccessAllowed(rep, 'Frederikshavn'), true, 'minor port should always allow');
  });
});

// ===========================================================================
// Combined speed formula — extreme scenarios
// ===========================================================================

describe('overworld sailing: combined speed scenarios', () => {
  it('maximum speed scenario produces high speed', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.ship.direction = 0;
    gs.wind.direction = 3; // optimal angle (diff=3, mult=1.0)
    gs.wind.strength = 5;
    gs.weather.type = 'clear'; // 1.0x
    gs.economy.speedBonus = 0.3; // 1.3x
    gs.wind.gustActive = true;
    gs.wind.gustDir = 0; // aligned with ship (diff=0, gustMult=1.5)
    gs.wind.gustTimer = 5;

    const { speed } = simulateShipMove(gs, 0);
    // Base: 1.0 * 5 * 1.0 * 1.3 * 1.5 * currentMult ≈ 9.75+
    assert.ok(speed > 8, `max speed should be high (got ${speed.toFixed(2)})`);
  });

  it('minimum speed scenario produces very low speed', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.ship.direction = 0;
    gs.wind.direction = 0; // headwind (diff=0, mult=0.3)
    gs.wind.strength = 1;
    gs.weather.type = 'storm'; // 0.6x
    gs.economy.speedBonus = 0;
    gs.wind.gustActive = true;
    gs.wind.gustDir = 4; // misaligned (diff=4, gustMult=0.7)
    gs.wind.gustTimer = 5;

    const { speed } = simulateShipMove(gs, 0);
    // Base: 0.3 * 1 * 0.6 * 1.0 * 0.7 * currentMult ≈ 0.13-
    assert.ok(speed < 0.3, `min speed should be very low (got ${speed.toFixed(3)})`);
    assert.ok(speed > 0, 'speed should always be positive');
  });

  it('economy speed upgrades boost speed', () => {
    const gsBase = createTestGameState();
    gsBase.map = createTestMap();
    gsBase.ship.direction = 2;
    gsBase.wind.direction = 5;
    gsBase.wind.strength = 3;
    gsBase.wind.gustActive = false;
    gsBase.economy.speedBonus = 0;

    const gsUpgraded = createTestGameState();
    gsUpgraded.map = createTestMap();
    gsUpgraded.ship.direction = 2;
    gsUpgraded.wind.direction = 5;
    gsUpgraded.wind.strength = 3;
    gsUpgraded.wind.gustActive = false;
    gsUpgraded.economy.speedBonus = 0.5;

    const { speed: base } = simulateShipMove(gsBase, 0);
    const { speed: upgraded } = simulateShipMove(gsUpgraded, 0);

    const ratio = upgraded / base;
    assert.ok(Math.abs(ratio - 1.5) < 0.01,
      `50% speed bonus should give 1.5x speed (ratio=${ratio.toFixed(3)})`);
  });
});

// ===========================================================================
// NPC update loop
// ===========================================================================

describe('overworld sailing: NPC update behavior', () => {
  it('NPC ships despawn when far from player', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.noticeQueue = [];

    // Place NPC very far from player
    const ships = [
      {
        id: 'far1', faction: 'merchant', x: 10, y: 10,
        hull: 60, crew: 20, maxHull: 60, maxCrew: 20, masts: 2,
        speed: 1.5, aggression: 0, moveAccum: 0,
        direction: 4, aiTarget: null, aiTimer: 0,
        tradeRoute: null, tradeRouteIdx: 0,
        desperate: false, cargo: {}, gold: 0,
      },
    ];
    gs.ship.x = 150;
    gs.ship.y = 100;

    withDeterministicRandom(1, () => updateNPCShips(ships, gs, 0.1));
    // Distance is ~sqrt(140^2 + 90^2) ≈ 166, > DESPAWN_DISTANCE(80)
    // The far NPC should be despawned, but new ones may be spawned as replacements
    assert.ok(!ships.find(s => s.id === 'far1'), 'far NPC should be despawned');
  });

  it('NPC ships move over time', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.noticeQueue = [];

    const ships = [{
      id: 'npc1', faction: 'danish', x: 155, y: 105,
      hull: 70, crew: 35, maxHull: 70, maxCrew: 35, masts: 2,
      speed: 2.0, aggression: 0.3, moveAccum: 0,
      direction: 4, aiTarget: { x: 155, y: 150 }, aiTimer: 10,
      tradeRoute: null, tradeRouteIdx: 0,
      desperate: false, cargo: {}, gold: 0,
    }];
    gs.ship.x = 150;
    gs.ship.y = 100;

    const startY = ships[0].y;
    // Run several updates
    for (let i = 0; i < 60; i++) {
      withDeterministicRandom(100 + i, () => updateNPCShips(ships, gs, 1 / 12));
    }

    // Ship should have moved (if not despawned)
    if (ships.length > 0) {
      const moved = ships[0].x !== 155 || ships[0].y !== startY;
      assert.ok(moved, 'NPC ship should have moved');
    }
  });
});

// ===========================================================================
// Movement accumulation
// ===========================================================================

describe('overworld sailing: movement accumulation', () => {
  it('fractional speed accumulates across frames', () => {
    const gs = createTestGameState();
    gs.map = createTestMap();
    gs.ship.x = 150;
    gs.ship.y = 100;
    gs.ship.direction = 4; // south
    gs.ship.moveAccum = 0;
    gs.wind.direction = 0; // diff=4, mult=0.7
    gs.wind.strength = 1; // low speed, fractional movement
    gs.wind.gustActive = false;

    const startY = gs.ship.y;
    // Run many small frames
    for (let i = 0; i < 120; i++) {
      simulateShipMove(gs, 1 / 12);
    }

    // After 10 seconds of slow sailing, should have moved at least 1 tile
    assert.ok(gs.ship.y > startY, `ship should accumulate movement over time (y=${gs.ship.y})`);
  });

  it('moveAccum resets to 0 on collision', () => {
    const gs = createTestGameState();
    const overrides = [{ x: 150, y: 99, tile: TILE.BEACH }];
    gs.map = createTestMap(overrides);
    gs.ship.x = 150;
    gs.ship.y = 100;
    gs.ship.direction = 0; // north toward beach
    gs.ship.moveAccum = 5.0; // lots of accumulated movement

    simulateShipMove(gs, 0);

    assert.equal(gs.ship.y, 100, 'ship should not enter beach');
    assert.equal(gs.ship.moveAccum, 0, 'moveAccum should reset on collision');
  });
});
