'use strict';

const { sattr } = require('../render/tiles');

// NPC type definitions
const NPC_TYPES = {
  bartender: { ch: 'B', attr: sattr(178, 52),  greeting: 'What\'ll it be, captain? Ale or mead?' },
  fishwife:  { ch: 'F', attr: sattr(44, 236),  greeting: 'Fresh herring! Caught this very morn!' },
  sailor:    { ch: 'S', attr: sattr(255, 236),  greeting: 'I\'ve sailed these waters for thirty years.' },
  priest:    { ch: 'P', attr: sattr(226, 236),  greeting: 'May God and the saints watch over your voyage.' },
  guard:     { ch: 'G', attr: sattr(160, 236),  greeting: 'Move along. No trouble in this town.' },
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
 * Spawn static NPCs inside town buildings.
 * @param {object} townMap - from generateTownMap()
 * @returns {Array} array of { type, ch, attr, x, y, greeting }
 */
function spawnTownNPCs(townMap) {
  const npcs = [];

  if (!townMap.buildings) return npcs;

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
      greeting: def.greeting,
    });
  }

  return npcs;
}

module.exports = { NPC_TYPES, spawnTownNPCs };
