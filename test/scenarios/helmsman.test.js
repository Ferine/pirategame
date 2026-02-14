'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createHelmsmanState,
  engagePort,
  engageExplore,
  disengage,
  updateHeading,
  getHelmsmanHUDText,
  _vecToDir,
  _isWater,
  _lookahead,
  _windDiff,
} = require('../../src/world/helmsman');
const { TILE } = require('../../src/render/tiles');

// Helper: create a simple water map
function makeMap(width, height, fillTile) {
  const tiles = new Uint8Array(width * height);
  if (fillTile !== undefined) tiles.fill(fillTile);
  return { tiles, width, height };
}

// Helper: create a port object
function makePort(name, x, y) {
  return { name, actualX: x, actualY: y, desc: 'Test port' };
}

describe('helmsman', () => {
  describe('createHelmsmanState', () => {
    it('creates inactive state', () => {
      const s = createHelmsmanState();
      assert.equal(s.active, false);
      assert.equal(s.mode, null);
      assert.equal(s.targetPort, null);
      assert.equal(s.tackSide, 1);
      assert.equal(s.stuckTimer, 0);
    });
  });

  describe('engagePort', () => {
    it('activates with port target', () => {
      const s = createHelmsmanState();
      const port = makePort('Copenhagen', 140, 120);
      engagePort(s, port);
      assert.equal(s.active, true);
      assert.equal(s.mode, 'port');
      assert.equal(s.targetPort, port);
      assert.equal(s.targetX, 140);
      assert.equal(s.targetY, 120);
      assert.equal(s.stoppedReason, null);
    });
  });

  describe('disengage', () => {
    it('deactivates with reason', () => {
      const s = createHelmsmanState();
      s.active = true;
      s.mode = 'port';
      disengage(s, 'cancel');
      assert.equal(s.active, false);
      assert.equal(s.stoppedReason, 'cancel');
    });

    it('defaults reason to cancel', () => {
      const s = createHelmsmanState();
      s.active = true;
      disengage(s);
      assert.equal(s.stoppedReason, 'cancel');
    });
  });

  describe('_vecToDir', () => {
    it('computes cardinal directions', () => {
      assert.equal(_vecToDir(0, -1), 0);  // N
      assert.equal(_vecToDir(1, 0), 2);   // E
      assert.equal(_vecToDir(0, 1), 4);   // S
      assert.equal(_vecToDir(-1, 0), 6);  // W
    });

    it('computes diagonal directions', () => {
      assert.equal(_vecToDir(1, -1), 1);  // NE
      assert.equal(_vecToDir(1, 1), 3);   // SE
      assert.equal(_vecToDir(-1, 1), 5);  // SW
      assert.equal(_vecToDir(-1, -1), 7); // NW
    });
  });

  describe('_windDiff', () => {
    it('returns 0 for same direction', () => {
      assert.equal(_windDiff(3, 3), 0);
    });

    it('returns correct diff wrapping around', () => {
      assert.equal(_windDiff(0, 7), 1);
      assert.equal(_windDiff(7, 0), 1);
      assert.equal(_windDiff(0, 4), 4);
    });

    it('returns diff for adjacent directions', () => {
      assert.equal(_windDiff(2, 3), 1);
      assert.equal(_windDiff(2, 4), 2);
    });
  });

  describe('_isWater', () => {
    it('returns true for ocean tiles', () => {
      const map = makeMap(300, 200, TILE.OCEAN);
      assert.equal(_isWater(map, 50, 50), true);
    });

    it('returns false for land tiles', () => {
      const map = makeMap(300, 200, TILE.GRASS);
      assert.equal(_isWater(map, 50, 50), false);
    });

    it('returns false for port tiles', () => {
      const map = makeMap(300, 200, TILE.OCEAN);
      map.tiles[50 * 300 + 50] = TILE.PORT;
      assert.equal(_isWater(map, 50, 50), false);
    });

    it('returns false for out of bounds', () => {
      const map = makeMap(300, 200, TILE.OCEAN);
      assert.equal(_isWater(map, -1, 0), false);
      assert.equal(_isWater(map, 300, 0), false);
    });
  });

  describe('_lookahead', () => {
    it('returns true if all tiles ahead are water', () => {
      const map = makeMap(300, 200, TILE.OCEAN);
      assert.equal(_lookahead(map, 50, 50, 2, 3), true); // East
    });

    it('returns false if land ahead', () => {
      const map = makeMap(300, 200, TILE.OCEAN);
      map.tiles[50 * 300 + 52] = TILE.GRASS; // 2 tiles east
      assert.equal(_lookahead(map, 50, 50, 2, 3), false);
    });
  });

  describe('updateHeading — direct heading', () => {
    it('returns direct direction when trim is good', () => {
      const s = createHelmsmanState();
      const port = makePort('Skagen', 60, 50);
      engagePort(s, port);

      const ship = { x: 50, y: 50, direction: 2 };
      const wind = { direction: 2, strength: 3 }; // Wind E, heading E → diff 0 → would tack
      // Change wind so trim is good: target is east (dir 2), wind from S (dir 4) → diff 2
      wind.direction = 4;
      const map = makeMap(300, 200, TILE.OCEAN);

      const dir = updateHeading(s, ship, wind, map, 0.1);
      assert.equal(dir, 2); // East toward target
    });
  });

  describe('updateHeading — tacking', () => {
    it('offsets heading when sailing into wind', () => {
      const s = createHelmsmanState();
      const port = makePort('Skagen', 50, 20); // North of ship
      engagePort(s, port);

      const ship = { x: 50, y: 50, direction: 0 };
      // Wind from N (dir 0), heading N → diff 0 → into wind → should tack
      const wind = { direction: 0, strength: 3 };
      const map = makeMap(300, 200, TILE.OCEAN);

      const dir = updateHeading(s, ship, wind, map, 0.1);
      // Should NOT be 0 (direct into wind), should be offset
      assert.notEqual(dir, 0, 'Should tack away from headwind');
      // Should be an adjacent direction with better trim
      const newDiff = _windDiff(dir, wind.direction);
      assert.ok(newDiff > 0, 'Tacked heading should have better trim than headwind');
    });
  });

  describe('updateHeading — obstacle avoidance', () => {
    it('avoids land by scanning adjacent directions', () => {
      const s = createHelmsmanState();
      const port = makePort('Skagen', 60, 50); // East
      engagePort(s, port);

      const ship = { x: 50, y: 50, direction: 2 };
      const wind = { direction: 4, strength: 3 }; // Wind S, trim good for E
      const map = makeMap(300, 200, TILE.OCEAN);

      // Block 3 tiles east with land
      map.tiles[50 * 300 + 51] = TILE.GRASS;
      map.tiles[50 * 300 + 52] = TILE.GRASS;
      map.tiles[50 * 300 + 53] = TILE.GRASS;

      const dir = updateHeading(s, ship, wind, map, 0.1);
      // Should pick an alternative direction (not E=2)
      assert.notEqual(dir, 2, 'Should avoid blocked direction');
      assert.ok(dir >= 0 && dir <= 7, 'Should return valid direction');
    });
  });

  describe('updateHeading — arrival detection', () => {
    it('disengages within 2 tiles of port', () => {
      const s = createHelmsmanState();
      const port = makePort('Copenhagen', 52, 50);
      engagePort(s, port);

      const ship = { x: 51, y: 50, direction: 2 };
      const wind = { direction: 4, strength: 3 };
      const map = makeMap(300, 200, TILE.OCEAN);

      const dir = updateHeading(s, ship, wind, map, 0.1);
      assert.equal(dir, null);
      assert.equal(s.active, false);
      assert.equal(s.stoppedReason, 'arrived');
    });
  });

  describe('updateHeading — stuck detection', () => {
    it('disengages after 3 seconds without movement', () => {
      const s = createHelmsmanState();
      const port = makePort('Skagen', 120, 10);
      engagePort(s, port);

      const ship = { x: 50, y: 50, direction: 0 };
      const wind = { direction: 4, strength: 3 };
      const map = makeMap(300, 200, TILE.OCEAN);

      // Simulate 3 seconds at the same position
      s.lastX = 50;
      s.lastY = 50;

      updateHeading(s, ship, wind, map, 1.0);
      assert.equal(s.active, true, 'Still active after 1s');

      updateHeading(s, ship, wind, map, 1.0);
      assert.equal(s.active, true, 'Still active after 2s');

      updateHeading(s, ship, wind, map, 1.1);
      assert.equal(s.active, false, 'Should disengage after 3s');
      assert.equal(s.stoppedReason, 'stuck');
    });
  });

  describe('engageExplore', () => {
    it('finds unexplored waypoint', () => {
      const s = createHelmsmanState();
      // Create visibility with some explored and some unexplored
      const vis = new Uint8Array(300 * 200); // All unexplored (0)
      // Mark area around ship as explored
      for (let y = 90; y < 110; y++) {
        for (let x = 140; x < 160; x++) {
          vis[y * 300 + x] = 2; // VIS_VISIBLE
        }
      }

      engageExplore(s, 150, 100, vis, 300, 200);
      assert.equal(s.active, true);
      assert.equal(s.mode, 'explore');
      assert.ok(s.targetX > 0, 'Should have target X');
      assert.ok(s.targetY > 0, 'Should have target Y');
    });

    it('disengages when nothing to explore', () => {
      const s = createHelmsmanState();
      // All tiles explored
      const vis = new Uint8Array(300 * 200);
      vis.fill(2); // All visible

      engageExplore(s, 150, 100, vis, 300, 200);
      assert.equal(s.active, false);
      assert.equal(s.stoppedReason, 'explored');
    });
  });

  describe('getHelmsmanHUDText', () => {
    it('returns empty string when inactive', () => {
      const s = createHelmsmanState();
      assert.equal(getHelmsmanHUDText(s), '');
    });

    it('returns port name and distance', () => {
      const s = createHelmsmanState();
      const port = makePort('Copenhagen', 140, 120);
      engagePort(s, port);
      s.distanceRemaining = 45;
      const text = getHelmsmanHUDText(s);
      assert.ok(text.includes('Copenhagen'), 'Should include port name');
      assert.ok(text.includes('45'), 'Should include distance');
      assert.ok(text.includes('HELM:'), 'Should have HELM prefix');
    });

    it('returns exploring text', () => {
      const s = createHelmsmanState();
      s.active = true;
      s.mode = 'explore';
      s.distanceRemaining = 23;
      const text = getHelmsmanHUDText(s);
      assert.ok(text.includes('Exploring'), 'Should include Exploring');
      assert.ok(text.includes('23'), 'Should include distance');
    });
  });
});
