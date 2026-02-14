'use strict';

const { createEconomyState } = require('../../src/economy/goods');
const { createCrewState } = require('../../src/crew/crew');
const { createReputationState } = require('../../src/world/factions');
const { createWeatherState } = require('../../src/world/weather');
const { createQuestState } = require('../../src/world/quests');
const { createEventsState } = require('../../src/world/events');
const { createFleetState } = require('../../src/fleet/fleet');
const { createStats, createPersistent } = require('../../src/meta/legacy');
const { createLogState } = require('../../src/meta/captains-log');
const { createCampaignState } = require('../../src/story/campaign');
const { createHelmsmanState } = require('../../src/world/helmsman');

/**
 * Build a fresh gameState with all subsystems initialised.
 * Identical to src/index.js but without map/screen.
 * Pass `overrides` to replace any top-level key.
 */
function createTestGameState(overrides = {}) {
  const base = {
    map: null,
    ship: {
      x: 150, y: 100,
      direction: 0,
      hull: 100,
      maxHull: 100,
      name: 'Drakar',
      moveAccum: 0,
    },
    wind: {
      direction: 2,
      strength: 3,
      changeTimer: 30,
      gustActive: false,
      gustTimer: 0,
      gustCooldown: 20,
      preGustDir: 2,
      gustDir: undefined,
    },
    currentSpeed: 0,
    economy: createEconomyState(),
    crew: createCrewState(),
    reputation: createReputationState(),
    weather: createWeatherState(),
    quests: createQuestState(),
    events: createEventsState(),
    fleet: createFleetState('Drakar'),
    questNotices: [],
    treasureMaps: [],
    seaObjects: null,
    convoy: null,
    blockade: null,
    helmsman: createHelmsmanState(),
    melee: null,
    meleeResult: null,
    boardingNpcId: null,
    stealthInfo: null,
    visibility: null,
    campaign: createCampaignState(),
    crtEnabled: false,
    stats: createStats(),
    difficulty: 'normal',
    captainsLog: createLogState(),
    persistent: createPersistent(),
    achievementToasts: [],
    ngPlus: false,
  };

  // Shallow-merge overrides
  for (const [key, val] of Object.entries(overrides)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && base[key] && typeof base[key] === 'object') {
      base[key] = { ...base[key], ...val };
    } else {
      base[key] = val;
    }
  }

  return base;
}

module.exports = { createTestGameState };
