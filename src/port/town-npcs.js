'use strict';

const { sattr } = require('../render/tiles');
const { getProfile } = require('./port-profiles');
const { T } = require('./town-map');

// NPC type definitions — expanded with greeting pools + port-specific greetings
const NPC_TYPES = {
  bartender: {
    ch: 'B', attr: sattr(178, 52),
    greetings: [
      'What\'ll it be, captain? Ale or mead?',
      'A round for the crew? That\'ll cost ye.',
      'You look like you need a stiff drink.',
      'We\'ve got herring stew if yer hungry.',
    ],
    portGreetings: {
      Skagen: ['Skagen ale — brewed with North Sea salt!'],
      Copenhagen: ['The finest mead in all Denmark, right here.', 'The king himself has drunk at this bar.'],
      Gothenburg: ['Swedish aquavit? Strongest in the Kattegat.'],
    },
  },
  fishwife: {
    ch: 'F', attr: sattr(44, 236),
    greetings: [
      'Fresh herring! Caught this very morn!',
      'Cod, mackerel, eel — what\'ll you have?',
      'Best prices on the strait, I promise ye!',
    ],
    portGreetings: {
      Skagen: ['Skagen fish — none finer in all the north!', 'The currents here bring the fattest herring.'],
      Aarhus: ['Aarhus market gets first pick of the catch.'],
    },
  },
  sailor: {
    ch: 'S', attr: sattr(255, 236),
    greetings: [
      'I\'ve sailed these waters for thirty years.',
      'Watch the currents near the narrows, friend.',
      'A fair wind today — good for heading north.',
      'Lost three men to a storm last month.',
    ],
    portGreetings: {
      Helsingor: ['Kronborg\'s guns keep the peace here — mostly.'],
      Frederikshavn: ['Navy ships drill day and night in this harbor.'],
      Gothenburg: ['The Dutch built these canals. Fine work, I say.'],
    },
  },
  priest: {
    ch: 'P', attr: sattr(226, 236),
    greetings: [
      'May God and the saints watch over your voyage.',
      'The church offers refuge to all seafarers.',
      'Pray before you sail — the sea is merciless.',
    ],
    portGreetings: {
      Helsingor: ['Even Hamlet\'s ghost finds peace in prayer.'],
      Copenhagen: ['The cathedral bells ring for all of Denmark.'],
    },
  },
  guard: {
    ch: 'G', attr: sattr(160, 236),
    greetings: [
      'Move along. No trouble in this town.',
      'Keep your weapons sheathed within the walls.',
      'Papers, captain. Let me see your cargo manifest.',
    ],
    portGreetings: {
      Frederikshavn: ['This is a naval port. Mind your conduct.', 'The admiral won\'t tolerate piracy here.'],
      Copenhagen: ['The crown\'s law rules this city. Remember that.'],
      Helsingborg: ['Swedish law here, Dane. Behave yourself.'],
    },
  },
};

// Ambient (outdoor) NPC types
const AMBIENT_NPC_TYPES = {
  dockworker: {
    ch: 'D', attr: sattr(94, 236),
    greetings: [
      'Heave! Ho! Mind your step on the planks.',
      'Another cargo to unload...',
      'These crates won\'t move themselves.',
    ],
    spawnTile: T.DOCK,
  },
  townsperson: {
    ch: 'T', attr: sattr(250, 236),
    greetings: [
      'Good day to you, sailor.',
      'Fine weather for the market.',
      'Have you news from abroad?',
    ],
    spawnTile: T.ROAD,
  },
  urchin: {
    ch: 'u', attr: sattr(208, 236),
    greetings: [
      'Spare a coin, captain?',
      'I can show you around town — for a price!',
      'Watch yer pockets around here!',
    ],
    spawnTile: T.ROAD,
  },
};

// Which building type gets which NPC
const BUILDING_NPC_MAP = {
  8:  'bartender',   // T.TAVERN
  7:  'fishwife',    // T.MARKET
  9:  'sailor',      // T.SHIPWRIGHT
  11: 'priest',      // T.CHURCH
  10: 'guard',       // T.HARBOR_MASTER
};

/**
 * Pick a random greeting from generic + port-specific pools.
 */
function _pickGreeting(def, portName) {
  const pool = [...def.greetings];
  if (def.portGreetings && def.portGreetings[portName]) {
    pool.push(...def.portGreetings[portName]);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Spawn NPCs inside town buildings + ambient outdoor NPCs.
 * @param {object} townMap - from generateTownMap()
 * @param {string} portName - name of the port
 * @returns {Array} array of NPC objects
 */
function spawnTownNPCs(townMap, portName) {
  const npcs = [];
  const profile = getProfile(portName);

  if (!townMap.buildings) return npcs;

  // Building NPCs
  for (const bld of townMap.buildings) {
    const npcType = BUILDING_NPC_MAP[bld.floorType];
    if (!npcType) continue;

    const def = NPC_TYPES[npcType];
    if (!def) continue;

    npcs.push({
      type: npcType,
      ch: def.ch,
      attr: def.attr,
      x: bld.interiorX,
      y: bld.interiorY,
      greeting: _pickGreeting(def, portName),
      homeX: bld.interiorX,
      homeY: bld.interiorY,
      wanderRadius: 2,
      moveTimer: 2 + Math.random() * 3,
      moveInterval: 2 + Math.random() * 3,
      isBuilding: true,
    });
  }

  // Ambient outdoor NPCs
  const ambientCount = profile.ambientNPCCount || 0;
  if (ambientCount > 0) {
    _spawnAmbientNPCs(npcs, townMap, portName, ambientCount);
  }

  return npcs;
}

/**
 * Spawn ambient NPCs on valid outdoor tiles.
 */
function _spawnAmbientNPCs(npcs, townMap, portName, count) {
  const { tiles, width, height } = townMap;
  const ambientTypes = ['dockworker', 'townsperson', 'urchin'];

  for (let i = 0; i < count; i++) {
    const typeKey = ambientTypes[i % ambientTypes.length];
    const def = AMBIENT_NPC_TYPES[typeKey];
    if (!def) continue;

    // Find a valid spawn tile
    const pos = _findSpawnTile(tiles, width, height, def.spawnTile, npcs);
    if (!pos) continue;

    npcs.push({
      type: typeKey,
      ch: def.ch,
      attr: def.attr,
      x: pos.x,
      y: pos.y,
      greeting: _pickGreeting(def, portName),
      homeX: pos.x,
      homeY: pos.y,
      wanderRadius: 3,
      moveTimer: 2 + Math.random() * 3,
      moveInterval: 2 + Math.random() * 3,
      isBuilding: false,
    });
  }
}

/**
 * Find a random valid tile of the given type, avoiding occupied positions.
 */
function _findSpawnTile(tiles, w, h, tileType, existingNPCs) {
  const candidates = [];
  for (let y = 2; y < h - 4; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (tiles[y * w + x] === tileType) {
        const occupied = existingNPCs.some(n => n.x === x && n.y === y);
        if (!occupied) candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

module.exports = { NPC_TYPES, AMBIENT_NPC_TYPES, spawnTownNPCs };
