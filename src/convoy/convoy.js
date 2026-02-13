'use strict';

const { TILE_DEFS } = require('../render/tiles');
const { MAP_WIDTH, MAP_HEIGHT } = require('../world/map-gen');

// Direction vectors (same as overworld)
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

const MERCHANT_NAMES = [
  'Nordstjernen', 'Havfruen', 'Den Gyldne Hjort', 'Fortuna',
  'Tre Kroner', 'Svanen', 'Lykkens Gave', 'Solvognen',
];

/**
 * Create convoy state from an accepted escort quest.
 */
function createConvoyState(quest, portName) {
  const escorts = [];
  const count = quest.escortCount || 1;

  for (let i = 0; i < count; i++) {
    escorts.push({
      id: `escort-${i}-${Date.now().toString(36)}`,
      name: MERCHANT_NAMES[i % MERCHANT_NAMES.length],
      x: 0, // will be positioned when entering overworld
      y: 0,
      hull: 60,
      maxHull: 60,
      direction: 0,
      moveAccum: 0,
      alive: true,
    });
  }

  return {
    questId: quest.id,
    escorts,
    formation: 'tight',
    timer: quest.timeLimit || 75,
    targetPort: quest.targetPort,
    originPort: portName,
    ambushCooldown: 15, // initial delay before first ambush
    ambushesSpawned: 0,
    maxAmbushes: 3,
    active: true,
  };
}

/**
 * Update convoy escorts: move toward player, maintain formation, tick timer.
 */
function updateConvoy(convoy, playerShip, wind, map, dt) {
  if (!convoy || !convoy.active) return;

  // Decrement timer
  convoy.timer -= dt;

  // Decrement ambush cooldown
  if (convoy.ambushCooldown > 0) {
    convoy.ambushCooldown -= dt;
  }

  const isTight = convoy.formation === 'tight';
  const followDist = isTight ? 2 : 4;
  const escortSpeed = 0.8; // relative to 1.0 player speed base

  for (const escort of convoy.escorts) {
    if (!escort.alive) continue;

    // Calculate target position (behind player based on formation)
    const behindX = playerShip.x - DIR_DX[playerShip.direction] * followDist;
    const behindY = playerShip.y - DIR_DY[playerShip.direction] * followDist;

    // Spread escorts laterally in spread formation
    let targetX = behindX;
    let targetY = behindY;
    if (!isTight && convoy.escorts.indexOf(escort) > 0) {
      // Second escort offsets perpendicular
      const perpDir = (playerShip.direction + 2) % 8;
      targetX += DIR_DX[perpDir] * 3;
      targetY += DIR_DY[perpDir] * 3;
    }

    const dx = targetX - escort.x;
    const dy = targetY - escort.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.5) continue; // close enough

    // Compute direction toward target
    const angle = Math.atan2(dy, dx);
    const a = ((angle + Math.PI * 2) % (Math.PI * 2));
    const dirIdx = Math.round(a / (Math.PI / 4)) % 8;
    const lookup = [2, 3, 4, 5, 6, 7, 0, 1];
    escort.direction = lookup[dirIdx] || 0;

    // Wind speed calculation (simplified)
    let windDiff = Math.abs(escort.direction - wind.direction);
    if (windDiff > 4) windDiff = 8 - windDiff;
    const windMult = [0.3, 0.5, 0.9, 1.0, 0.7];
    const speed = escortSpeed * windMult[windDiff] * wind.strength * 0.6;

    escort.moveAccum += speed * dt;

    while (escort.moveAccum >= 1.0) {
      escort.moveAccum -= 1.0;

      const nx = escort.x + DIR_DX[escort.direction];
      const ny = escort.y + DIR_DY[escort.direction];

      if (nx < 1 || nx >= MAP_WIDTH - 1 || ny < 1 || ny >= MAP_HEIGHT - 1) {
        escort.moveAccum = 0;
        break;
      }

      const tile = map.tiles[ny * MAP_WIDTH + nx];
      if (TILE_DEFS[tile] && TILE_DEFS[tile].passable) {
        escort.x = nx;
        escort.y = ny;
      } else {
        escort.moveAccum = 0;
        break;
      }
    }
  }
}

/**
 * Toggle formation between tight and spread.
 */
function toggleFormation(convoy) {
  if (!convoy) return;
  convoy.formation = convoy.formation === 'tight' ? 'spread' : 'tight';
}

/**
 * Get formation bonus multipliers.
 */
function getFormationBonus(convoy) {
  if (!convoy) return { speedMult: 1.0, defenseMult: 1.0 };
  if (convoy.formation === 'tight') {
    return { speedMult: 0.85, defenseMult: 1.3 };
  }
  return { speedMult: 1.0, defenseMult: 0.8 };
}

/**
 * Check if convoy has arrived at the target port.
 */
function checkConvoyArrival(convoy, portName) {
  if (!convoy || !convoy.active) return false;
  return convoy.targetPort === portName;
}

/**
 * Apply damage to a specific escort ship.
 */
function damageEscort(convoy, escortId, dmg) {
  if (!convoy) return;
  const escort = convoy.escorts.find(e => e.id === escortId);
  if (!escort || !escort.alive) return;
  escort.hull = Math.max(0, escort.hull - dmg);
  if (escort.hull <= 0) {
    escort.alive = false;
  }
}

/**
 * Check if the convoy mission has failed (all dead or timer expired).
 */
function checkConvoyFailed(convoy) {
  if (!convoy) return false;
  if (convoy.timer <= 0) return true;
  const allDead = convoy.escorts.every(e => !e.alive);
  return allDead;
}

/**
 * Get combat cannon bonus from surviving escorts.
 */
function getEscortCombatBonus(convoy) {
  if (!convoy || !convoy.active) return 0;
  return convoy.escorts.filter(e => e.alive).length;
}

/**
 * Check if an ambush should spawn this tick.
 */
function shouldSpawnAmbush(convoy, dt) {
  if (!convoy || !convoy.active) return false;
  if (convoy.ambushesSpawned >= convoy.maxAmbushes) return false;
  if (convoy.ambushCooldown > 0) return false;
  return true;
}

/**
 * Spawn an ambush NPC targeting the nearest alive escort.
 */
function spawnAmbushNPC(convoy, playerX, playerY, map) {
  if (!convoy) return null;

  // Find an alive escort to target
  const target = convoy.escorts.find(e => e.alive);
  if (!target) return null;

  // Try to spawn at a distance from player
  for (let attempt = 0; attempt < 50; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 15;
    const x = Math.round(playerX + Math.cos(angle) * dist);
    const y = Math.round(playerY + Math.sin(angle) * dist);

    if (x < 1 || x >= MAP_WIDTH - 1 || y < 1 || y >= MAP_HEIGHT - 1) continue;

    const tile = map.tiles[y * MAP_WIDTH + x];
    if (!TILE_DEFS[tile] || !TILE_DEFS[tile].passable || tile === 8) continue;

    // Set ambush cooldown for next spawn (20-30s)
    convoy.ambushCooldown = 20 + Math.random() * 10;
    convoy.ambushesSpawned++;

    const isPirate = Math.random() < 0.6;
    return {
      id: `ambush-${convoy.ambushesSpawned}-${Date.now().toString(36)}`,
      name: isPirate ? 'Pirate Raider' : 'HMS Interceptor',
      faction: isPirate ? 'pirate' : 'english',
      x, y,
      direction: Math.floor(Math.random() * 8),
      hull: isPirate ? 80 : 100,
      maxHull: isPirate ? 80 : 100,
      crew: isPirate ? 45 : 50,
      maxCrew: isPirate ? 45 : 50,
      masts: 2,
      speed: isPirate ? 2.5 : 1.8,
      aggression: 0.9,
      moveAccum: 0,
      aiTarget: { x: target.x, y: target.y },
      aiTimer: 3,
      ambushTarget: target,
    };
  }

  return null;
}

// --- Blockade runner ---

/**
 * Create blockade runner state from an accepted blockade quest.
 */
function createBlockadeState(quest, portName) {
  const patrolShips = [];
  const count = 2 + Math.floor(Math.random() * 2); // 2-3 patrol ships
  for (let i = 0; i < count; i++) {
    patrolShips.push({
      x: 100 + Math.floor(Math.random() * 100),
      y: 50 + Math.floor(Math.random() * 100),
      radius: 8 + Math.floor(Math.random() * 5),
    });
  }

  return {
    questId: quest.id,
    detectionRadius: 15,
    patrolShips,
    detected: false,
    targetPort: quest.targetPort,
    originPort: portName,
    active: true,
  };
}

/**
 * Update blockade state: check player proximity to patrols.
 */
function updateBlockade(blockade, playerShip, dt) {
  if (!blockade || !blockade.active || blockade.detected) return;

  for (const patrol of blockade.patrolShips) {
    const dx = playerShip.x - patrol.x;
    const dy = playerShip.y - patrol.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < blockade.detectionRadius) {
      blockade.detected = true;
      return;
    }
  }
}

/**
 * Check if blockade run succeeded (arrived at target port undetected).
 */
function checkBlockadeSuccess(blockade, portName) {
  if (!blockade || !blockade.active) return false;
  if (blockade.targetPort !== portName) return false;
  return !blockade.detected;
}

module.exports = {
  createConvoyState,
  updateConvoy,
  toggleFormation,
  getFormationBonus,
  checkConvoyArrival,
  damageEscort,
  checkConvoyFailed,
  getEscortCombatBonus,
  shouldSpawnAmbush,
  spawnAmbushNPC,
  createBlockadeState,
  updateBlockade,
  checkBlockadeSuccess,
};
