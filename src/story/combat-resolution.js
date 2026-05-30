'use strict';

/**
 * Shared campaign resolution for when the player defeats an enemy SHIP — by any
 * method: cannon combat (drone-cam), boarding (melee), or infiltration (stealth).
 *
 * Keeping the Act 0 / Act 3 / Act 5 triggers identical across every win path is
 * what prevents campaign soft-locks: previously the story only advanced on cannon
 * victories, so a player who boarded or infiltrated could never start the campaign
 * (Act 0→1), never seize dispatches (Act 3), or — worst — consume the unique,
 * non-respawning HMS Sovereign without triggering the ending (Act 5).
 */

/**
 * Advance the campaign for a ship defeated by the player.
 * Mutates gameState.campaign; returns an array of notice strings to surface.
 *
 * @param {object} gameState
 * @param {string} faction - faction of the defeated ship (e.g. 'english')
 * @returns {string[]} notices
 */
function applyShipVictoryToCampaign(gameState, faction) {
  const notices = [];
  const camp = gameState.campaign;
  if (!camp) return notices;

  const { checkActOneTrigger, advanceCampaign, addKeyItem } = require('./campaign');
  const collect = (effects) => {
    for (const e of effects) {
      if (e.type === 'notice') notices.push(e.message);
    }
  };

  // Act 0 -> 1: first ship defeated yields the mysterious letter.
  if (checkActOneTrigger(camp)) {
    addKeyItem(camp, 'letter');
    collect(advanceCampaign(camp, 'combat_victory', {}, gameState.reputation));
  }

  // Act 3: defeating an English ship during the dispatch hunt seizes the dispatches.
  if (camp.act === 3 && camp.phase === 'dispatch_hunt' && faction === 'english') {
    addKeyItem(camp, 'dispatches');
    collect(advanceCampaign(camp, 'combat_victory', { faction: 'english' }, gameState.reputation));
  }

  // Act 5: the final battle.
  if (camp.act === 5) {
    collect(advanceCampaign(camp, 'combat_victory', { faction }, gameState.reputation));
  }

  return notices;
}

/**
 * If the campaign just reached an ending, record the Hall of Fame entry and
 * persistent completion stats. Returns true if the campaign is complete (caller
 * should transition to the credits sequence).
 *
 * @param {object} gameState
 * @returns {boolean} completed
 */
function finalizeCampaignCompletion(gameState) {
  const camp = gameState.campaign;
  if (!camp || !camp.ending) return false;

  const { addHallOfFameEntry, savePersistent } = require('../meta/legacy');
  addHallOfFameEntry({
    name: gameState.ship.name,
    ending: camp.ending,
    gold: gameState.economy ? gameState.economy.gold : 0,
    shipsSunk: gameState.stats ? gameState.stats.shipsSunk : 0,
    day: gameState.quests ? gameState.quests.day : 0,
    playTimeMinutes: gameState.stats ? gameState.stats.playTimeMinutes : 0,
    difficulty: gameState.difficulty || 'normal',
  });
  if (gameState.stats) gameState.stats.campaignsCompleted++;
  if (gameState.persistent) {
    gameState.persistent.stats.campaignsCompleted =
      Math.max(gameState.persistent.stats.campaignsCompleted || 0, 1);
    savePersistent(gameState.persistent);
  }
  return true;
}

module.exports = { applyShipVictoryToCampaign, finalizeCampaignCompletion };
