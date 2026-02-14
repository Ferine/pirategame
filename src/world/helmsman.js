'use strict';

const { TILE_DEFS } = require('../render/tiles');
const { MAP_WIDTH, MAP_HEIGHT } = require('./map-gen');

// Direction vectors: N, NE, E, SE, S, SW, W, NW
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

// Visibility states (match overworld.js)
const VIS_UNEXPLORED = 0;

// Tack timer range
const TACK_MIN = 8;
const TACK_MAX = 15;

/**
 * Create default helmsman state.
 */
function createHelmsmanState() {
  return {
    active: false,
    mode: null,           // 'port' | 'explore'
    targetPort: null,     // port object reference
    targetX: 0,
    targetY: 0,
    tackTimer: 0,
    tackSide: 1,          // +1 or -1
    stoppedReason: null,
    distanceRemaining: 0,
    stuckTimer: 0,
    lastX: -1,
    lastY: -1,
  };
}

/**
 * Engage helmsman to steer toward a port.
 */
function engagePort(state, port) {
  state.active = true;
  state.mode = 'port';
  state.targetPort = port;
  state.targetX = port.actualX;
  state.targetY = port.actualY;
  state.tackTimer = TACK_MIN + Math.random() * (TACK_MAX - TACK_MIN);
  state.tackSide = Math.random() < 0.5 ? 1 : -1;
  state.stoppedReason = null;
  state.stuckTimer = 0;
  state.lastX = -1;
  state.lastY = -1;
}

/**
 * Engage helmsman to explore unexplored areas.
 */
function engageExplore(state, shipX, shipY, visibility, mapWidth, mapHeight) {
  state.active = true;
  state.mode = 'explore';
  state.targetPort = null;
  state.tackTimer = TACK_MIN + Math.random() * (TACK_MAX - TACK_MIN);
  state.tackSide = Math.random() < 0.5 ? 1 : -1;
  state.stoppedReason = null;
  state.stuckTimer = 0;
  state.lastX = -1;
  state.lastY = -1;

  _pickExploreWaypoint(state, shipX, shipY, visibility, mapWidth, mapHeight);
}

/**
 * Find the nearest cluster of unexplored tiles and set as waypoint.
 */
function _pickExploreWaypoint(state, shipX, shipY, visibility, mapWidth, mapHeight) {
  const step = 20;
  let bestX = -1, bestY = -1;
  let bestScore = -1;
  let bestDist = Infinity;

  for (let gy = step; gy < mapHeight - step; gy += step) {
    for (let gx = step; gx < mapWidth - step; gx += step) {
      // Count unexplored tiles in a 10-tile radius
      let unexplored = 0;
      const radius = 10;
      for (let dy = -radius; dy <= radius; dy += 3) {
        for (let dx = -radius; dx <= radius; dx += 3) {
          const mx = gx + dx;
          const my = gy + dy;
          if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) continue;
          if (visibility[my * mapWidth + mx] === VIS_UNEXPLORED) {
            unexplored++;
          }
        }
      }

      if (unexplored <= 0) continue;

      const dx = gx - shipX;
      const dy = gy - shipY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Score: more unexplored is better, closer is better
      const score = unexplored / (1 + dist * 0.1);
      if (score > bestScore) {
        bestScore = score;
        bestX = gx;
        bestY = gy;
        bestDist = dist;
      }
    }
  }

  if (bestX >= 0) {
    state.targetX = bestX;
    state.targetY = bestY;
    state.distanceRemaining = Math.round(bestDist);
  } else {
    // Nothing to explore
    disengage(state, 'explored');
  }
}

/**
 * Disengage the helmsman.
 */
function disengage(state, reason) {
  state.active = false;
  state.stoppedReason = reason || 'cancel';
}

/**
 * Convert dx/dy to 8-direction index. Same logic as npc-ships._vecToDir.
 */
function _vecToDir(dx, dy) {
  const a = ((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2));
  const dir = Math.round(a / (Math.PI / 4)) % 8;
  const lookup = [2, 3, 4, 5, 6, 7, 0, 1];
  return lookup[dir] || 0;
}

/**
 * Check if a tile is passable water (not land, not port).
 */
function _isWater(map, x, y) {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
  const tile = map.tiles[y * MAP_WIDTH + x];
  return TILE_DEFS[tile] && TILE_DEFS[tile].passable && tile !== 8 && tile !== 9;
}

/**
 * Look ahead N tiles in a direction. Returns true if all passable.
 */
function _lookahead(map, x, y, dir, steps) {
  for (let i = 1; i <= steps; i++) {
    const nx = x + DIR_DX[dir] * i;
    const ny = y + DIR_DY[dir] * i;
    if (!_isWater(map, nx, ny)) return false;
  }
  return true;
}

/**
 * Compute wind trim difference for a given direction.
 */
function _windDiff(dir, windDir) {
  let diff = Math.abs(dir - windDir);
  if (diff > 4) diff = 8 - diff;
  return diff;
}

/**
 * Per-frame helmsman update. Returns direction 0-7 or null (no change).
 * Mutates state (tack timer, stuck detection, disengage).
 */
function updateHeading(state, ship, wind, map, dt) {
  if (!state.active) return null;

  // Update distance remaining
  const dx = state.targetX - ship.x;
  const dy = state.targetY - ship.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  state.distanceRemaining = Math.round(dist);

  // Arrival check
  if (state.mode === 'port' && dist <= 2) {
    disengage(state, 'arrived');
    return null;
  }

  // Explore mode: pick new waypoint when close
  if (state.mode === 'explore' && dist <= 5) {
    // Need visibility to pick new waypoint — if not available, disengage
    disengage(state, 'explored');
    return null;
  }

  // Stuck detection: if position unchanged for 3 seconds
  if (ship.x === state.lastX && ship.y === state.lastY) {
    state.stuckTimer += dt;
    if (state.stuckTimer >= 3.0) {
      disengage(state, 'stuck');
      return null;
    }
  } else {
    state.stuckTimer = 0;
    state.lastX = ship.x;
    state.lastY = ship.y;
  }

  // Tack timer
  state.tackTimer -= dt;
  if (state.tackTimer <= 0) {
    state.tackSide *= -1;
    state.tackTimer = TACK_MIN + Math.random() * (TACK_MAX - TACK_MIN);
  }

  // Compute direct direction to target
  const directDir = _vecToDir(dx, dy);
  const directWindDiff = _windDiff(directDir, wind.direction);

  // Apply tacking if heading into wind (diff 0 or 1)
  let desiredDir = directDir;
  if (directWindDiff <= 1) {
    // Try offsetting by tackSide for better trim
    const tackDir = ((directDir + state.tackSide) % 8 + 8) % 8;
    const tackDiff = _windDiff(tackDir, wind.direction);
    if (tackDiff > directWindDiff) {
      desiredDir = tackDir;
    } else {
      // Try wider offset
      const wideDir = ((directDir + state.tackSide * 2) % 8 + 8) % 8;
      const wideDiff = _windDiff(wideDir, wind.direction);
      if (wideDiff > directWindDiff) {
        desiredDir = wideDir;
      }
    }
  }

  // Obstacle avoidance: 3-tile lookahead
  if (_lookahead(map, ship.x, ship.y, desiredDir, 3)) {
    return desiredDir;
  }

  // Scan adjacent directions ±1, ±2, ±3
  for (let offset = 1; offset <= 3; offset++) {
    for (const side of [1, -1]) {
      const altDir = ((desiredDir + side * offset) % 8 + 8) % 8;
      if (_lookahead(map, ship.x, ship.y, altDir, 3)) {
        return altDir;
      }
    }
  }

  // All directions blocked — try just 1-tile lookahead
  for (let d = 0; d < 8; d++) {
    if (_lookahead(map, ship.x, ship.y, d, 1)) {
      return d;
    }
  }

  // Truly stuck
  disengage(state, 'stuck');
  return null;
}

/**
 * Get helmsman HUD text.
 */
function getHelmsmanHUDText(state) {
  if (!state || !state.active) return '';
  if (state.mode === 'port' && state.targetPort) {
    return `HELM: ${state.targetPort.name} ${state.distanceRemaining}`;
  }
  if (state.mode === 'explore') {
    return `HELM: Exploring ${state.distanceRemaining}`;
  }
  return 'HELM: Active';
}

module.exports = {
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
};
