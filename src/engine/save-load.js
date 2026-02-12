'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createQuestState } = require('../world/quests');
const { createFleetState, syncFromGameState: fleetSyncFrom } = require('../fleet/fleet');

const SAVE_DIR = path.join(os.homedir(), '.kattegat-kaper');

/**
 * Ensure save directory exists.
 */
function _ensureDir() {
  if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
  }
}

/**
 * Serialize gameState to JSON string.
 * Only saves persistent data — skips map, combat/melee transient state, npcShips.
 */
function serializeGameState(gameState) {
  const data = {
    version: 1,
    date: new Date().toISOString(),
    ship: { ...gameState.ship },
    wind: { ...gameState.wind },
    economy: gameState.economy ? { ...gameState.economy } : null,
    crew: gameState.crew ? {
      members: gameState.crew.members.map(m => ({ ...m })),
      avgMorale: gameState.crew.avgMorale,
    } : null,
    reputation: gameState.reputation ? { ...gameState.reputation } : null,
    weather: gameState.weather ? { ...gameState.weather } : null,
    quests: gameState.quests ? JSON.parse(JSON.stringify(gameState.quests)) : null,
    events: gameState.events ? JSON.parse(JSON.stringify(gameState.events)) : null,
    treasureMaps: gameState.treasureMaps ? gameState.treasureMaps.map(t => ({ ...t })) : [],
    fleet: gameState.fleet ? JSON.parse(JSON.stringify(gameState.fleet)) : null,
    crtEnabled: gameState.crtEnabled || false,
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Deserialize JSON back into gameState fields.
 * Merges into existing gameState (preserves map, etc).
 */
function deserializeGameState(json, gameState) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return false;
  }

  if (!data || !data.ship) return false;

  // Restore ship
  if (data.ship) {
    Object.assign(gameState.ship, data.ship);
  }

  // Restore wind
  if (data.wind) {
    Object.assign(gameState.wind, data.wind);
  }

  // Restore economy
  if (data.economy && gameState.economy) {
    Object.assign(gameState.economy, data.economy);
  }

  // Restore crew
  if (data.crew && gameState.crew) {
    gameState.crew.members = Array.isArray(data.crew.members) ? data.crew.members : [];
    gameState.crew.avgMorale = data.crew.avgMorale ?? 5;
  }

  // Restore reputation
  if (data.reputation && gameState.reputation) {
    Object.assign(gameState.reputation, data.reputation);
  }

  // Restore weather
  if (data.weather && gameState.weather) {
    Object.assign(gameState.weather, data.weather);
  }

  // Restore quests
  if (data.quests) {
    gameState.quests = data.quests;
  } else if (!gameState.quests) {
    gameState.quests = createQuestState();
  }

  // Restore events
  if (data.events) {
    gameState.events = data.events;
    // Clear stale notifications on load
    if (gameState.events.notifications) {
      gameState.events.notifications = [];
    }
  }

  // Restore treasure maps
  if (data.treasureMaps) {
    gameState.treasureMaps = data.treasureMaps;
  }

  // Restore fleet
  if (data.fleet) {
    gameState.fleet = data.fleet;
  } else {
    // Old save without fleet: create fleet from current ship state
    gameState.fleet = createFleetState(gameState.ship.name || 'Drakar');
    fleetSyncFrom(gameState.fleet, gameState);
  }

  // Restore CRT toggle
  gameState.crtEnabled = data.crtEnabled || false;

  return true;
}

/**
 * Save game to a slot file.
 */
function saveGame(gameState, slot) {
  _ensureDir();
  const filePath = path.join(SAVE_DIR, `save-${slot}.json`);
  const json = serializeGameState(gameState);
  try {
    fs.writeFileSync(filePath, json, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Load game from a slot file. Returns parsed data or null.
 */
function loadGame(slot) {
  const filePath = path.join(SAVE_DIR, `save-${slot}.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    const json = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

/**
 * List available save files with metadata.
 * Returns array of { slot, captain, date, gold }.
 */
function listSaves() {
  _ensureDir();
  const saves = [];

  try {
    const files = fs.readdirSync(SAVE_DIR);
    for (const file of files) {
      const match = file.match(/^save-(.+)\.json$/);
      if (!match) continue;

      const slot = match[1];
      const filePath = path.join(SAVE_DIR, file);
      try {
        const json = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(json);
        saves.push({
          slot,
          captain: data.ship ? data.ship.name : 'Unknown',
          date: data.date || 'Unknown',
          gold: data.economy ? data.economy.gold : 0,
        });
      } catch (e) {
        // Skip corrupt saves
      }
    }
  } catch (e) {
    // No saves directory
  }

  return saves;
}

module.exports = {
  serializeGameState,
  deserializeGameState,
  saveGame,
  loadGame,
  listSaves,
};
