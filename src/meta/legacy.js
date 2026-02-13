'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { checkAchievements, getAchievement } = require('./achievements');

const SAVE_DIR = path.join(os.homedir(), '.kattegat-kaper');

// --- Stats model ---

function createStats() {
  return {
    shipsSunk: 0,
    goldEarned: 0,
    treasuresFound: 0,
    uniquePortsVisited: 0,
    portsVisitedSet: [],
    barrelsHidden: 0,
    meleeWins: 0,
    stealthPerfect: 0,
    convoysCompleted: 0,
    tradesMade: 0,
    maxFleetSize: 1,
    distanceSailed: 0,
    playTimeSeconds: 0,
    playTimeMinutes: 0,
    crownHonored: 0,
    campaignsCompleted: 0,
    ngPlusStarted: 0,
  };
}

// --- Persistent model ---

function createPersistent() {
  return {
    version: 1,
    stats: createStats(),
    unlocked: [],
    cosmetics: { activeShipArt: null, activeColorScheme: null },
  };
}

function _ensureDir() {
  if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
  }
}

function loadPersistent() {
  _ensureDir();
  const filePath = path.join(SAVE_DIR, 'persistent.json');
  try {
    if (!fs.existsSync(filePath)) return createPersistent();
    const json = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(json);
    // Merge with defaults for forward compat
    const base = createPersistent();
    return {
      version: data.version || base.version,
      stats: { ...base.stats, ...(data.stats || {}) },
      unlocked: Array.isArray(data.unlocked) ? data.unlocked : [],
      cosmetics: { ...base.cosmetics, ...(data.cosmetics || {}) },
    };
  } catch (e) {
    return createPersistent();
  }
}

function savePersistent(persistent) {
  _ensureDir();
  const filePath = path.join(SAVE_DIR, 'persistent.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(persistent, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Merge session stats into persistent stats (take max / sum as appropriate).
 */
function mergeStats(persistent, sessionStats) {
  const p = persistent.stats;
  const s = sessionStats;
  p.shipsSunk = Math.max(p.shipsSunk, s.shipsSunk);
  p.goldEarned = Math.max(p.goldEarned, s.goldEarned);
  p.treasuresFound = Math.max(p.treasuresFound, s.treasuresFound);
  p.barrelsHidden = Math.max(p.barrelsHidden, s.barrelsHidden);
  p.meleeWins = Math.max(p.meleeWins, s.meleeWins);
  p.stealthPerfect = Math.max(p.stealthPerfect, s.stealthPerfect);
  p.convoysCompleted = Math.max(p.convoysCompleted, s.convoysCompleted);
  p.tradesMade = Math.max(p.tradesMade, s.tradesMade);
  p.maxFleetSize = Math.max(p.maxFleetSize, s.maxFleetSize);
  p.distanceSailed = Math.max(p.distanceSailed, s.distanceSailed);
  p.playTimeMinutes = Math.max(p.playTimeMinutes, s.playTimeMinutes);
  p.playTimeSeconds = Math.max(p.playTimeSeconds, s.playTimeSeconds);
  p.crownHonored = Math.max(p.crownHonored, s.crownHonored);
  p.campaignsCompleted = Math.max(p.campaignsCompleted, s.campaignsCompleted);
  p.ngPlusStarted = Math.max(p.ngPlusStarted, s.ngPlusStarted);
  // Merge port visited sets
  if (Array.isArray(s.portsVisitedSet)) {
    for (const port of s.portsVisitedSet) {
      if (!p.portsVisitedSet.includes(port)) {
        p.portsVisitedSet.push(port);
      }
    }
  }
  p.uniquePortsVisited = p.portsVisitedSet.length;
}

// --- Difficulty ---

const DIFFICULTY = {
  easy:   { goldMult: 1.5, damageTakenMult: 0.7, guardSpeedMult: 1.0, label: 'Easy' },
  normal: { goldMult: 1.0, damageTakenMult: 1.0, guardSpeedMult: 1.0, label: 'Normal' },
  hard:   { goldMult: 0.7, damageTakenMult: 1.3, guardSpeedMult: 1.4, label: 'Hard' },
};

function getDifficulty(gameState) {
  return DIFFICULTY[gameState.difficulty] || DIFFICULTY.normal;
}

// --- Hall of Fame ---

function loadHallOfFame() {
  _ensureDir();
  const filePath = path.join(SAVE_DIR, 'hall-of-fame.json');
  try {
    if (!fs.existsSync(filePath)) return [];
    const json = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(json);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function addHallOfFameEntry(entry) {
  const hall = loadHallOfFame();
  hall.push({
    name: entry.name || 'Unknown',
    ending: entry.ending || 'outlaw',
    gold: entry.gold || 0,
    shipsSunk: entry.shipsSunk || 0,
    day: entry.day || 0,
    playTimeMinutes: entry.playTimeMinutes || 0,
    date: new Date().toISOString(),
    difficulty: entry.difficulty || 'normal',
  });
  // Sort by gold descending, keep top 5
  hall.sort((a, b) => b.gold - a.gold);
  const top5 = hall.slice(0, 5);
  _ensureDir();
  const filePath = path.join(SAVE_DIR, 'hall-of-fame.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(top5, null, 2), 'utf8');
  } catch (e) {
    // silently fail
  }
  return top5;
}

// --- New Game+ ---

function createNewGamePlusState(oldGameState) {
  const { createEconomyState } = require('../economy/goods');
  const { createCrewState } = require('../crew/crew');
  const { createReputationState } = require('../world/factions');
  const { createWeatherState } = require('../world/weather');
  const { createQuestState } = require('../world/quests');
  const { createEventsState } = require('../world/events');
  const { createFleetState } = require('../fleet/fleet');
  const { createCampaignState } = require('../story/campaign');
  const { createLogState } = require('./captains-log');

  const carryGold = Math.floor((oldGameState.economy ? oldGameState.economy.gold : 0) * 0.5);
  // Keep best ship stats
  const oldShip = oldGameState.ship || {};

  const gs = {
    ship: {
      x: 150,
      y: 100,
      direction: 0,
      hull: oldShip.maxHull || 100,
      maxHull: oldShip.maxHull || 100,
      name: oldShip.name || 'Drakar',
      moveAccum: 0,
    },
    wind: { direction: 2, strength: 3, changeTimer: 30 },
    currentSpeed: 0,
    economy: createEconomyState(),
    crew: createCrewState(),
    reputation: createReputationState(),
    weather: createWeatherState(),
    quests: createQuestState(),
    events: createEventsState(),
    fleet: createFleetState(oldShip.name || 'Drakar'),
    questNotices: [],
    treasureMaps: [],
    campaign: createCampaignState(),
    convoy: null,
    blockade: null,
    melee: null,
    meleeResult: null,
    boardingNpcId: null,
    stealthInfo: null,
    crtEnabled: false,
    stats: createStats(),
    difficulty: oldGameState.difficulty || 'normal',
    captainsLog: createLogState(),
    persistent: oldGameState.persistent || loadPersistent(),
    achievementToasts: [],
    ngPlus: true,
  };

  // Apply carry-over gold
  gs.economy.gold += carryGold;

  // Increment NG+ stat
  gs.stats.ngPlusStarted = 1;

  return gs;
}

// --- Cosmetic unlocks ---

const COSMETIC_UNLOCKS = [
  { achievementId: 'sea_wolf',       type: 'shipArt',     id: 'viking',     label: 'Viking Ship Art' },
  { achievementId: 'world_traveler', type: 'colorScheme', id: 'midnight',   label: 'Midnight Colors' },
  { achievementId: 'conspiracy',     type: 'shipArt',     id: 'warship',    label: 'Warship Art' },
  { achievementId: 'gold_hoarder',   type: 'colorScheme', id: 'gold',       label: 'Gold Colors' },
];

function getUnlockedCosmetics(unlockedIds) {
  return COSMETIC_UNLOCKS.filter(c => unlockedIds.includes(c.achievementId));
}

// --- Sync + check achievements ---

/**
 * Merge session stats into persistent, check for new achievements,
 * push toasts, and save persistent data.
 */
function syncAndCheckAchievements(gameState) {
  if (!gameState.persistent) return;
  if (!gameState.stats) return;

  // Check crown honored stat from reputation
  if (gameState.reputation && gameState.reputation.crown >= 85) {
    gameState.stats.crownHonored = 1;
  }

  mergeStats(gameState.persistent, gameState.stats);

  const newIds = checkAchievements(gameState.persistent.stats, gameState.persistent.unlocked);
  for (const id of newIds) {
    gameState.persistent.unlocked.push(id);
    const ach = getAchievement(id);
    if (ach && gameState.achievementToasts) {
      gameState.achievementToasts.push({
        title: ach.title,
        icon: ach.icon,
        timer: 5.0,
      });
    }
  }

  savePersistent(gameState.persistent);
}

module.exports = {
  createStats,
  createPersistent,
  loadPersistent,
  savePersistent,
  mergeStats,
  DIFFICULTY,
  getDifficulty,
  loadHallOfFame,
  addHallOfFameEntry,
  createNewGamePlusState,
  COSMETIC_UNLOCKS,
  getUnlockedCosmetics,
  syncAndCheckAchievements,
};
