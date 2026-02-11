'use strict';

const { ST, STEALTH_TILES } = require('./stealth-map');

// Alert states
const ALERT = {
  PATROL:     'patrol',
  SUSPICIOUS: 'suspicious',
  ALERT:      'alert',
  COMBAT:     'combat',
};

// Direction vectors (8-way: N NE E SE S SW W NW)
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

// Vision parameters
const VISION_RANGE = 7;
const VISION_HALF_WIDTH = 3; // vision cone width at max range
const DETECT_ADJACENT = 1;   // always detect at distance 1

// Alert timers
const SUSPICION_BUILD = 1.5;   // seconds of sight to go from patrol → suspicious
const SUSPICIOUS_DECAY = 3.0;  // seconds to return from suspicious → patrol
const ALERT_BUILD = 3.0;       // seconds to go from suspicious → alert
const ALERT_DECAY = 8.0;       // seconds to return from alert → patrol
const CASCADE_RANGE = 10;      // Manhattan distance for alert cascade

/**
 * Create a guard entity from a spawn definition.
 */
function createGuard(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    facing: spawn.facing || 4,
    ch: 'G',
    patrol: spawn.waypoints || [],
    patrolIndex: 0,
    moveTimer: 0,
    moveInterval: 0.5,
    alertState: ALERT.PATROL,
    suspicionTimer: 0,
    alertTimer: 0,
    lastKnownPlayerX: -1,
    lastKnownPlayerY: -1,
    visionRange: VISION_RANGE,
    alive: true,
  };
}

/**
 * Update a single guard.
 * Returns 'combat' if guard reaches combat state, null otherwise.
 */
function updateGuard(guard, playerX, playerY, map, dt, allGuards) {
  if (!guard.alive) return null;

  const canSee = canGuardSeePlayer(guard, playerX, playerY, map);

  // Update alert state
  switch (guard.alertState) {
    case ALERT.PATROL:
      if (canSee) {
        guard.suspicionTimer += dt;
        guard.lastKnownPlayerX = playerX;
        guard.lastKnownPlayerY = playerY;
        if (guard.suspicionTimer >= SUSPICION_BUILD) {
          guard.alertState = ALERT.SUSPICIOUS;
          guard.suspicionTimer = 0;
          guard.alertTimer = 0;
        }
      } else {
        guard.suspicionTimer = Math.max(0, guard.suspicionTimer - dt * 0.5);
      }
      break;

    case ALERT.SUSPICIOUS:
      if (canSee) {
        guard.alertTimer += dt;
        guard.lastKnownPlayerX = playerX;
        guard.lastKnownPlayerY = playerY;
        if (guard.alertTimer >= ALERT_BUILD) {
          guard.alertState = ALERT.ALERT;
          guard.alertTimer = 0;
          cascadeAlert(guard, allGuards);
        }
      } else {
        guard.suspicionTimer += dt;
        if (guard.suspicionTimer >= SUSPICIOUS_DECAY) {
          guard.alertState = ALERT.PATROL;
          guard.suspicionTimer = 0;
          guard.alertTimer = 0;
        }
      }
      break;

    case ALERT.ALERT:
      if (canSee) {
        guard.lastKnownPlayerX = playerX;
        guard.lastKnownPlayerY = playerY;
        guard.alertTimer = 0; // reset decay
      } else {
        guard.alertTimer += dt;
        if (guard.alertTimer >= ALERT_DECAY) {
          guard.alertState = ALERT.PATROL;
          guard.suspicionTimer = 0;
          guard.alertTimer = 0;
        }
      }
      // Check adjacency for combat
      if (Math.abs(guard.x - playerX) <= 1 && Math.abs(guard.y - playerY) <= 1) {
        guard.alertState = ALERT.COMBAT;
        return 'combat';
      }
      break;

    case ALERT.COMBAT:
      return 'combat';
  }

  // Movement
  guard.moveTimer += dt;
  if (guard.moveTimer >= guard.moveInterval) {
    guard.moveTimer -= guard.moveInterval;

    if (guard.alertState === ALERT.PATROL) {
      _patrolMove(guard, map);
    } else if (guard.alertState === ALERT.SUSPICIOUS) {
      // Face toward last known position
      _faceToward(guard, guard.lastKnownPlayerX, guard.lastKnownPlayerY);
    } else if (guard.alertState === ALERT.ALERT) {
      // Greedy pathfind toward last known player position
      _moveToward(guard, guard.lastKnownPlayerX, guard.lastKnownPlayerY, map);
    }
  }

  return null;
}

/**
 * Can guard see the player? Uses vision cone + LOS raycast.
 */
function canGuardSeePlayer(guard, px, py, map) {
  const dx = px - guard.x;
  const dy = py - guard.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Always detect adjacent
  if (dist <= DETECT_ADJACENT) return true;

  // Out of range
  if (dist > guard.visionRange) return false;

  // Check if player is hiding behind cover
  if (isPlayerHiding(px, py, guard.x, guard.y, map)) return false;

  // Vision cone check using dot product
  const faceDx = DIR_DX[guard.facing];
  const faceDy = DIR_DY[guard.facing];
  const faceLen = Math.sqrt(faceDx * faceDx + faceDy * faceDy) || 1;
  const ndx = dx / dist;
  const ndy = dy / dist;
  const nfx = faceDx / faceLen;
  const nfy = faceDy / faceLen;

  const dot = ndx * nfx + ndy * nfy;
  // Cone angle: ~60 degrees each side = cos(60°) ≈ 0.5
  if (dot < 0.4) return false;

  // Bresenham LOS check
  return hasLineOfSight(guard.x, guard.y, px, py, map);
}

/**
 * Check if player is hiding behind cover (adjacent to cover tile between player and guard).
 */
function isPlayerHiding(px, py, gx, gy, map) {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (const [ddx, ddy] of dirs) {
    const cx = px + ddx;
    const cy = py + ddy;
    if (cx < 0 || cx >= map.width || cy < 0 || cy >= map.height) continue;

    const tile = map.tiles[cy * map.width + cx];
    const def = STEALTH_TILES[tile];
    if (!def || !def.cover) continue;

    // Check if this cover is between player and guard
    // Cover is "between" if it's on the side facing the guard
    const toGuardX = gx - px;
    const toGuardY = gy - py;
    // Dot product of cover direction and guard direction
    const coverDot = ddx * toGuardX + ddy * toGuardY;
    if (coverDot > 0) return true;
  }
  return false;
}

/**
 * Bresenham line-of-sight check. Returns true if no opaque tiles block the path.
 */
function hasLineOfSight(x0, y0, x1, y1, map) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;

  while (cx !== x1 || cy !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx)  { err += dx; cy += sy; }

    // Don't check the final tile
    if (cx === x1 && cy === y1) break;

    if (cx < 0 || cx >= map.width || cy < 0 || cy >= map.height) return false;
    const tile = map.tiles[cy * map.width + cx];
    const def = STEALTH_TILES[tile];
    if (def && !def.transparent) return false;
  }

  return true;
}

/**
 * Cascade alert to nearby guards (Manhattan distance).
 */
function cascadeAlert(guard, allGuards) {
  for (const other of allGuards) {
    if (other === guard || !other.alive) continue;
    const dist = Math.abs(other.x - guard.x) + Math.abs(other.y - guard.y);
    if (dist <= CASCADE_RANGE && other.alertState === ALERT.PATROL) {
      other.alertState = ALERT.SUSPICIOUS;
      other.lastKnownPlayerX = guard.lastKnownPlayerX;
      other.lastKnownPlayerY = guard.lastKnownPlayerY;
      other.suspicionTimer = 0;
      other.alertTimer = 0;
    }
  }
}

/**
 * Get the tiles visible in a guard's vision cone (for rendering overlay).
 */
function getVisionConeTiles(guard, map) {
  const tiles = [];
  const range = guard.visionRange;

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const tx = guard.x + dx;
      const ty = guard.y + dy;
      if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range || dist < 0.5) continue;

      // Cone check
      const faceDx = DIR_DX[guard.facing];
      const faceDy = DIR_DY[guard.facing];
      const faceLen = Math.sqrt(faceDx * faceDx + faceDy * faceDy) || 1;
      const ndx = dx / dist;
      const ndy = dy / dist;
      const dot = ndx * (faceDx / faceLen) + ndy * (faceDy / faceLen);
      if (dot < 0.4) continue;

      // LOS check
      if (!hasLineOfSight(guard.x, guard.y, tx, ty, map)) continue;

      tiles.push({ x: tx, y: ty });
    }
  }

  return tiles;
}

// --- Internal movement helpers ---

function _patrolMove(guard, map) {
  if (guard.patrol.length === 0) return;

  const wp = guard.patrol[guard.patrolIndex];
  const dx = wp.x - guard.x;
  const dy = wp.y - guard.y;

  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    // Reached waypoint
    guard.patrolIndex = (guard.patrolIndex + 1) % guard.patrol.length;
    return;
  }

  _moveToward(guard, wp.x, wp.y, map);
}

function _moveToward(guard, tx, ty, map) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;

  // Pick primary direction
  let mx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
  let my = dy === 0 ? 0 : (dy > 0 ? 1 : -1);

  // Try moving
  const nx = guard.x + mx;
  const ny = guard.y + my;

  if (_canWalk(nx, ny, map)) {
    guard.x = nx;
    guard.y = ny;
    _faceToward(guard, tx, ty);
  } else {
    // Try cardinal directions
    if (mx !== 0 && _canWalk(guard.x + mx, guard.y, map)) {
      guard.x += mx;
      _faceToward(guard, tx, ty);
    } else if (my !== 0 && _canWalk(guard.x, guard.y + my, map)) {
      guard.y += my;
      _faceToward(guard, tx, ty);
    }
  }
}

function _faceToward(guard, tx, ty) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  if (dx === 0 && dy === 0) return;

  // Convert to 8-direction
  const angle = Math.atan2(dy, dx);
  const a = ((angle + Math.PI * 2) % (Math.PI * 2));
  const dirIdx = Math.round(a / (Math.PI / 4)) % 8;
  const lookup = [2, 3, 4, 5, 6, 7, 0, 1];
  guard.facing = lookup[dirIdx] || 0;
}

function _canWalk(x, y, map) {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
  const tile = map.tiles[y * map.width + x];
  const def = STEALTH_TILES[tile];
  return def && def.passable;
}

module.exports = {
  ALERT,
  createGuard,
  updateGuard,
  canGuardSeePlayer,
  isPlayerHiding,
  cascadeAlert,
  getVisionConeTiles,
};
