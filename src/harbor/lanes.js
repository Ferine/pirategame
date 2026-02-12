'use strict';

const { SPRITES, LANE_SPRITES } = require('./harbor-art');
const { getHarborDifficulty } = require('../world/factions');
const { getQuarter } = require('../world/day-night');

// Lane type configs
const LANE_CONFIGS = {
  dock:     { speed: 0,   obstW: 0, gap: 0, spawnInt: 0,   push: 0   },
  water:    { speed: 0,   obstW: 0, gap: 0, spawnInt: 0,   push: 0   },
  merchant: { speed: 2.5, obstW: 5, gap: 4, spawnInt: 3.5, push: 0   },
  fishing:  { speed: 5.0, obstW: 2, gap: 3, spawnInt: 1.8, push: 0   },
  naval:    { speed: 1.2, obstW: 8, gap: 5, spawnInt: 6.0, push: 0   },
  current:  { speed: 0,   obstW: 0, gap: 0, spawnInt: 0,   push: 3.0 },
  reef:     { speed: 0,   obstW: 3, gap: 3, spawnInt: 0,   push: 0   },
  debris:   { speed: 1.5, obstW: 1, gap: 2, spawnInt: 2.0, push: 0   },
};

// Canonical lane layout (row 0 = top/dock, row 11 = bottom/start)
const CANONICAL_LANES = [
  { type: 'dock',     group: 'goal' },
  { type: 'reef',     group: 'reef' },
  { type: 'naval',    group: 'naval', dir: 1 },
  { type: 'naval',    group: 'naval', dir: -1 },
  { type: 'water',    group: 'rest1' },
  { type: 'merchant', group: 'merchant', dir: 1 },
  { type: 'merchant', group: 'merchant', dir: -1 },
  { type: 'current',  group: 'current', dir: 1 },
  { type: 'fishing',  group: 'fishing', dir: 1 },
  { type: 'fishing',  group: 'fishing', dir: -1 },
  { type: 'debris',   group: 'debris', dir: 1 },
  { type: 'water',    group: 'start' },
];

/**
 * Build lane template adapted to screen height.
 * For taller screens, inserts extra water rows between groups.
 * For shorter screens, removes some hazard rows.
 */
function buildLaneTemplate(gridW, gridH) {
  const statusRows = 2;
  const availRows = gridH - statusRows;

  let lanes;
  if (availRows >= 16) {
    // Tall screen: insert extra water rows between groups
    lanes = [];
    const extra = availRows - CANONICAL_LANES.length;
    const insertPoints = ['reef', 'rest1', 'current', 'start'];
    let distributed = 0;
    for (const lane of CANONICAL_LANES) {
      lanes.push({ ...lane });
      if (insertPoints.includes(lane.group) && distributed < extra) {
        const count = Math.min(Math.ceil(extra / insertPoints.length), extra - distributed);
        for (let i = 0; i < count; i++) {
          lanes.push({ type: 'water', group: 'extra' });
          distributed++;
        }
      }
    }
  } else if (availRows < 10) {
    // Very short screen: remove some hazard rows
    lanes = CANONICAL_LANES.filter(l =>
      l.group !== 'debris' && !(l.group === 'naval' && l.dir === -1)
    );
  } else {
    lanes = CANONICAL_LANES.map(l => ({ ...l }));
  }

  // Trim or pad to fit available rows
  while (lanes.length > availRows) lanes.pop();
  while (lanes.length < availRows) lanes.push({ type: 'water', group: 'extra' });

  // Build lane objects with obstacle arrays
  return lanes.map((template, row) => {
    const cfg = LANE_CONFIGS[template.type];
    const lane = {
      row,
      type: template.type,
      dir: template.dir || 1,
      speed: cfg.speed,
      push: cfg.push,
      obstacles: [],
      spawnTimer: cfg.spawnInt > 0 ? Math.random() * cfg.spawnInt : 0,
      spawnInterval: cfg.spawnInt,
      wobblePhase: Math.random() * Math.PI * 2,
    };

    // Seed initial obstacles
    if (template.type === 'reef') {
      _seedReefObstacles(lane, gridW);
    } else if (cfg.speed > 0) {
      _seedMovingObstacles(lane, gridW, template.type);
    }

    return lane;
  });
}

/**
 * Seed reef with static obstacles that have guaranteed passage gaps.
 */
function _seedReefObstacles(lane, gridW) {
  const cfg = LANE_CONFIGS.reef;
  let x = 0;
  while (x < gridW) {
    // Place reef segment
    const segW = cfg.obstW + Math.floor(Math.random() * 2);
    if (x + segW < gridW) {
      lane.obstacles.push({
        x,
        width: segW,
        sprite: 'reef',
        static: true,
      });
    }
    x += segW;
    // Gap
    const gapW = cfg.gap + Math.floor(Math.random() * 3);
    x += gapW;
  }
}

/**
 * Seed 2-4 initial obstacles for moving lanes, spread across width.
 */
function _seedMovingObstacles(lane, gridW, laneType) {
  const count = 2 + Math.floor(Math.random() * 3);
  const spriteList = LANE_SPRITES[laneType];
  if (!spriteList) return;

  const dirKey = lane.dir > 0 ? 'r' : 'l';
  const sprites = spriteList[dirKey];

  const spacing = gridW / count;
  for (let i = 0; i < count; i++) {
    const spriteKey = sprites[Math.floor(Math.random() * sprites.length)];
    const sprite = SPRITES[spriteKey];
    lane.obstacles.push({
      x: i * spacing + Math.random() * (spacing * 0.5),
      width: sprite.width,
      sprite: spriteKey,
      static: false,
    });
  }
}

/**
 * Update all lanes: move obstacles, remove off-screen, spawn new.
 */
function updateLanes(lanes, gridW, dt, difficultyMult) {
  const mult = difficultyMult || 1.0;

  for (const lane of lanes) {
    if (lane.type === 'reef' || lane.type === 'dock' || lane.type === 'water') continue;

    if (lane.type === 'current') continue; // current has no obstacles to move

    const baseSpeed = lane.speed * mult;

    // Move obstacles
    for (const obs of lane.obstacles) {
      let speed = baseSpeed;
      // Fishing boats wobble
      if (lane.type === 'fishing') {
        lane.wobblePhase += dt * 2;
        speed *= (0.7 + 0.3 * Math.sin(lane.wobblePhase));
      }
      obs.x += lane.dir * speed * dt;
    }

    // Remove off-screen obstacles
    lane.obstacles = lane.obstacles.filter(obs => {
      if (lane.dir > 0) return obs.x < gridW + 5;
      return obs.x + obs.width > -5;
    });

    // Spawn new obstacles
    if (lane.spawnInterval > 0) {
      lane.spawnTimer -= dt;
      if (lane.spawnTimer <= 0) {
        lane.spawnTimer = lane.spawnInterval * (0.7 + Math.random() * 0.6);
        _spawnObstacle(lane, gridW);
      }
    }
  }
}

/**
 * Spawn a new obstacle at the entry edge of a lane.
 */
function _spawnObstacle(lane, gridW) {
  const spriteList = LANE_SPRITES[lane.type];
  if (!spriteList) return;

  const dirKey = lane.dir > 0 ? 'r' : 'l';
  const sprites = spriteList[dirKey];
  const spriteKey = sprites[Math.floor(Math.random() * sprites.length)];
  const sprite = SPRITES[spriteKey];

  const x = lane.dir > 0 ? -sprite.width : gridW;

  lane.obstacles.push({
    x,
    width: sprite.width,
    sprite: spriteKey,
    static: false,
  });
}

/**
 * Check collision between player column and obstacles in the player's lane.
 * Returns: 'hit' | 'reef' | null
 */
function checkCollision(lanes, playerCol, playerRow) {
  if (playerRow < 0 || playerRow >= lanes.length) return null;
  const lane = lanes[playerRow];

  for (const obs of lane.obstacles) {
    const left = Math.floor(obs.x);
    const right = left + obs.width - 1;
    if (playerCol >= left && playerCol <= right) {
      if (lane.type === 'reef') return 'reef';
      return 'hit';
    }
  }
  return null;
}

/**
 * Create the harbor game state for a port approach.
 */
function createHarborState(gameState, port) {
  // Navy notoriety scales harbor difficulty (obstacle speed & spawn rate)
  let diffMult = gameState.reputation ? getHarborDifficulty(gameState.reputation) : 1.0;

  // Night multiplier: more dangerous harbor at night
  if (gameState.quests) {
    const quarter = getQuarter(gameState.quests.clockAccum);
    if (quarter === 3) diffMult *= 2.0;       // night
    else if (quarter === 0 || quarter === 2) diffMult *= 1.3; // dawn/dusk
  }

  return {
    portName: port.name,
    portDesc: port.desc,
    gridW: 0,
    gridH: 0,
    player: {
      col: 0,
      row: 0,
      invulnTimer: 0,
      flashTimer: 0,
      moveCooldown: 0,
      pushAccum: 0,
    },
    lanes: [],
    result: null,
    resultTimer: 0,
    damagePerHit: 15,
    animTimer: 0,
    animFrame: 0,
    difficultyMult: diffMult,
  };
}

module.exports = {
  LANE_CONFIGS,
  buildLaneTemplate,
  updateLanes,
  checkCollision,
  createHarborState,
};
