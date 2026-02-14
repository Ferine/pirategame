'use strict';

const { TILE_DEFS } = require('../render/tiles');
const { MAP_WIDTH, MAP_HEIGHT } = require('./map-gen');

// Sea object types with char, color (xterm 256), and spawn weight
const SEA_OBJECT_TYPES = {
  wreckage:       { char: '%', color: 94,  weight: 25, name: 'Wreckage' },
  floating_cargo: { char: '#', color: 178, weight: 25, name: 'Floating Cargo' },
  distress:       { char: '!', color: 196, weight: 15, name: 'Distress Signal' },
  derelict:       { char: '&', color: 240, weight: 10, name: 'Derelict Ship' },
  debris_field:   { char: '~', color: 130, weight: 15, name: 'Debris Field' },
  message_bottle: { char: '?', color: 226, weight: 10, name: 'Message in a Bottle' },
};

const TYPE_KEYS = Object.keys(SEA_OBJECT_TYPES);
const TOTAL_WEIGHT = TYPE_KEYS.reduce((sum, k) => sum + SEA_OBJECT_TYPES[k].weight, 0);

const MAX_OBJECTS = 6;
const SPAWN_MIN_DIST = 10;
const SPAWN_MAX_DIST = 25;
const DESPAWN_DIST = 50;
const SPAWN_INTERVAL_MIN = 15;
const SPAWN_INTERVAL_MAX = 25;

// Goods for random cargo drops
const CARGO_GOODS = ['cod', 'herring', 'grain', 'timber', 'iron', 'gunpowder', 'silk', 'spices'];

function _pickType() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const key of TYPE_KEYS) {
    roll -= SEA_OBJECT_TYPES[key].weight;
    if (roll <= 0) return key;
  }
  return TYPE_KEYS[0];
}

function _randomGood() {
  return CARGO_GOODS[Math.floor(Math.random() * CARGO_GOODS.length)];
}

/**
 * Create sea objects state.
 */
function createSeaObjectsState() {
  return {
    objects: [],
    spawnTimer: SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN),
    nextId: 1,
  };
}

/**
 * Update: spawn new objects, despawn far ones.
 */
function updateSeaObjects(state, playerX, playerY, map, dt) {
  if (!state) return;

  // Despawn far objects
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];
    const dx = obj.x - playerX;
    const dy = obj.y - playerY;
    if (dx * dx + dy * dy > DESPAWN_DIST * DESPAWN_DIST) {
      state.objects.splice(i, 1);
    }
  }

  // Spawn timer
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.objects.length < MAX_OBJECTS) {
    state.spawnTimer = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);

    // Try to place an object on water within ring around player
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = SPAWN_MIN_DIST + Math.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
      const x = Math.round(playerX + Math.cos(angle) * dist);
      const y = Math.round(playerY + Math.sin(angle) * dist);

      if (x < 1 || x >= MAP_WIDTH - 1 || y < 1 || y >= MAP_HEIGHT - 1) continue;

      const tile = map.tiles[y * MAP_WIDTH + x];
      if (!TILE_DEFS[tile] || !TILE_DEFS[tile].passable) continue;
      if (tile === 8) continue; // not on port tiles

      const type = _pickType();
      state.objects.push({
        id: state.nextId++,
        type,
        x,
        y,
      });
      break;
    }
  }
}

/**
 * Check if player is on same tile as a sea object.
 */
function checkSeaObjectCollision(state, playerX, playerY) {
  if (!state) return null;
  for (let i = 0; i < state.objects.length; i++) {
    const obj = state.objects[i];
    if (obj.x === playerX && obj.y === playerY) {
      state.objects.splice(i, 1);
      return obj;
    }
  }
  return null;
}

/**
 * Resolve a sea object encounter. Returns { text, effects }.
 * effects: { gold?, cargo?, hull?, treasureHint?, spawnHostile? }
 */
function resolveSeaObject(object) {
  const effects = {};
  let text = '';

  switch (object.type) {
    case 'wreckage': {
      const roll = Math.random();
      if (roll < 0.60) {
        effects.gold = 5 + Math.floor(Math.random() * 11);
        const good = _randomGood();
        effects.cargo = { [good]: 1 + Math.floor(Math.random() * 2) };
        text = `You salvage ${effects.gold} rigsdaler and some ${good} from the wreckage.`;
      } else if (roll < 0.85) {
        effects.hull = -(3 + Math.floor(Math.random() * 3));
        text = 'Sharp timbers scrape your hull as you investigate the wreckage.';
      } else {
        text = 'The wreckage yields nothing of value.';
      }
      break;
    }
    case 'floating_cargo': {
      const roll = Math.random();
      if (roll < 0.80) {
        const good = _randomGood();
        const qty = 1 + Math.floor(Math.random() * 3);
        effects.cargo = { [good]: qty };
        text = `You fish out ${qty} ${good} from the floating cargo.`;
      } else {
        text = 'The cargo is waterlogged and ruined.';
      }
      break;
    }
    case 'distress': {
      const roll = Math.random();
      if (roll < 0.40) {
        text = 'You rescue a shipwrecked sailor. The crew is heartened!';
        effects.crewBuff = true;
      } else if (roll < 0.70) {
        text = 'It was a pirate trap! A hostile ship appears nearby!';
        effects.spawnHostile = true;
      } else if (roll < 0.90) {
        text = 'An empty boat drifts on the waves. No survivors.';
      } else {
        effects.gold = 10 + Math.floor(Math.random() * 16);
        text = `A grateful survivor rewards you with ${effects.gold} rigsdaler.`;
      }
      break;
    }
    case 'derelict': {
      const roll = Math.random();
      if (roll < 0.50) {
        effects.gold = 15 + Math.floor(Math.random() * 26);
        const good = _randomGood();
        effects.cargo = { [good]: 1 + Math.floor(Math.random() * 3) };
        text = `The derelict holds ${effects.gold} rigsdaler and ${good}!`;
      } else if (roll < 0.75) {
        text = 'The crew whispers of curses aboard the ghost ship. Morale sinks.';
        effects.moralePenalty = true;
      } else {
        text = 'You find a water-damaged chart hinting at buried treasure.';
        effects.treasureHint = true;
      }
      break;
    }
    case 'debris_field': {
      const roll = Math.random();
      if (roll < 0.70) {
        effects.hull = -(3 + Math.floor(Math.random() * 6));
        text = `Debris damages your hull! (${effects.hull} HP)`;
      } else {
        const good = _randomGood();
        effects.cargo = { [good]: 1 };
        text = `You carefully navigate the debris and salvage some ${good}.`;
      }
      break;
    }
    case 'message_bottle': {
      const roll = Math.random();
      if (roll < 0.60) {
        text = 'The message hints at good prices for a particular good at a nearby port.';
        effects.tradeHint = true;
      } else if (roll < 0.90) {
        text = 'A fragment of a treasure map! Could it lead somewhere?';
        effects.treasureHint = true;
      } else {
        text = '"If you read this, I have been eaten by a whale. Tell my wife I love her cod."';
      }
      break;
    }
    default:
      text = 'You find nothing of interest.';
  }

  return { text, effects };
}

module.exports = {
  SEA_OBJECT_TYPES,
  MAX_OBJECTS,
  createSeaObjectsState,
  updateSeaObjects,
  checkSeaObjectCollision,
  resolveSeaObject,
};
