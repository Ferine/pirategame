'use strict';

const { sattr } = require('../render/tiles');
const { shouldStoryNPCAppear } = require('./campaign');

/**
 * Story NPC definitions for "The Kattegat Conspiracy".
 * Each NPC has an ASCII portrait (8 lines), port assignment, and act visibility.
 */

const STORY_NPC_DEFS = {
  informant: {
    name: 'Henrik Madsen',
    ch: 'H',
    attr: sattr(117, 236),  // light blue on dark
    building: 'tavern',      // placed inside tavern
    greeting: 'You look like someone who\'s seen trouble. Sit. Let me buy you an ale.',
    portrait: [
      '  ___  ',
      ' /   \\ ',
      '| o o |',
      '|  >  |',
      '| \\_/ |',
      ' \\___/ ',
      '  /|\\  ',
      ' / | \\ ',
    ],
  },
  admiral: {
    name: 'Admiral Tordenskjold',
    ch: 'A',
    attr: sattr(226, 236),  // gold on dark
    building: 'harbor_master',
    greeting: 'I am Tordenskjold. If you carry proof, I will listen.',
    portrait: [
      '  _^_  ',
      ' /   \\ ',
      '| o o |',
      '|  =  |',
      '| \\_/ |',
      ' \\___/ ',
      ' [|||] ',
      ' /| |\\ ',
    ],
  },
  spy: {
    name: 'James Whitmore',
    ch: 'J',
    attr: sattr(160, 236),  // red on dark
    building: 'tavern',
    greeting: 'An interesting ship you have. I might have information... for a price.',
    portrait: [
      '  ___  ',
      ' /   \\ ',
      '| - o |',
      '|  <  |',
      '| --- |',
      ' \\___/ ',
      '  /|\\  ',
      ' / | \\ ',
    ],
  },
  smuggler_chief: {
    name: 'Svend Blackhand',
    ch: 'V',
    attr: sattr(94, 236),   // brown on dark
    building: 'tavern',
    greeting: 'The name\'s Blackhand. I move things the Crown doesn\'t want moved.',
    portrait: [
      '  ___  ',
      ' /~~~\\ ',
      '| * * |',
      '|  >  |',
      '| === |',
      ' \\___/ ',
      '  /X\\  ',
      ' / | \\ ',
    ],
  },
  royal_envoy: {
    name: 'Countess Ingrid',
    ch: 'I',
    attr: sattr(213, 236),  // pink on dark
    building: 'harbor_master',
    greeting: 'The Crown takes notice of your deeds, captain. Let us speak plainly.',
    portrait: [
      '  _*_  ',
      ' /   \\ ',
      '| o o |',
      '|  .  |',
      '| \\_/ |',
      ' \\___/ ',
      ' /| |\\ ',
      '/_| |_\\',
    ],
  },
  english_captain: {
    name: 'Captain Harwood',
    ch: 'E',
    attr: sattr(196, 236),  // bright red on dark
    building: null,          // encountered at sea only
    greeting: 'You dare challenge the might of England? So be it.',
    portrait: [
      '  _+_  ',
      ' /   \\ ',
      '| x x |',
      '|  >  |',
      '| --- |',
      ' \\___/ ',
      ' [===] ',
      ' /| |\\ ',
    ],
  },
};

// Building type to floor tile type mapping (matches town-map.js T enum)
const BUILDING_FLOOR_MAP = {
  tavern:        8,   // T.TAVERN
  market:        7,   // T.MARKET
  shipwright:    9,   // T.SHIPWRIGHT
  harbor_master: 10,  // T.HARBOR_MASTER
  church:        11,  // T.CHURCH
};

/**
 * Get story NPCs that should appear at a given port and act.
 * Returns array of NPC objects compatible with the town NPC list.
 */
function getPortStoryNPCs(portName, act, townMap) {
  const npcs = [];
  const campaign = { act };  // minimal campaign for shouldStoryNPCAppear

  for (const [npcId, def] of Object.entries(STORY_NPC_DEFS)) {
    if (!shouldStoryNPCAppear(campaign, portName, npcId)) continue;
    if (!def.building) continue;

    // Find interior position from building data
    let x = 0, y = 0;
    const floorType = BUILDING_FLOOR_MAP[def.building];
    if (townMap && townMap.buildings) {
      const bld = townMap.buildings.find(b => b.floorType === floorType);
      if (bld) {
        x = bld.interiorX;
        y = bld.interiorY;
      }
    }

    npcs.push({
      storyNpcId: npcId,
      type: 'story',
      name: def.name,
      ch: def.ch,
      attr: def.attr,
      x,
      y,
      greeting: def.greeting,
      portrait: def.portrait,
    });
  }

  return npcs;
}

/**
 * Get story NPC definition by id.
 */
function getStoryNPCDef(npcId) {
  return STORY_NPC_DEFS[npcId] || null;
}

module.exports = {
  STORY_NPC_DEFS,
  getPortStoryNPCs,
  getStoryNPCDef,
};
