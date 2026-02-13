'use strict';

/**
 * Achievement definitions and check logic.
 * 20 achievements, each with a stat-based threshold.
 */

const ACHIEVEMENTS = [
  { id: 'first_blood',    title: 'First Blood',         icon: '*', stat: 'shipsSunk',          threshold: 1 },
  { id: 'sea_wolf',       title: 'Sea Wolf',            icon: '#', stat: 'shipsSunk',          threshold: 10 },
  { id: 'fleet_killer',   title: 'Fleet Killer',        icon: '!', stat: 'shipsSunk',          threshold: 25 },
  { id: 'treasure_hunter',title: 'Treasure Hunter',     icon: 'X', stat: 'treasuresFound',     threshold: 1 },
  { id: 'gold_hoarder',   title: 'Gold Hoarder',        icon: '$', stat: 'goldEarned',         threshold: 1000 },
  { id: 'merchant_prince',title: 'Merchant Prince',     icon: '%', stat: 'goldEarned',         threshold: 5000 },
  { id: 'explorer',       title: 'Explorer',            icon: '~', stat: 'uniquePortsVisited', threshold: 5 },
  { id: 'world_traveler', title: 'World Traveler',      icon: '@', stat: 'uniquePortsVisited', threshold: 9 },
  { id: 'barrel_rider',   title: 'Barrel Rider',        icon: 'o', stat: 'barrelsHidden',      threshold: 1 },
  { id: 'cooper',         title: 'Master Cooper',       icon: 'O', stat: 'barrelsHidden',      threshold: 10 },
  { id: 'swordsman',      title: 'Swordsman',           icon: '/', stat: 'meleeWins',          threshold: 5 },
  { id: 'shadow',         title: 'Ghost of the Fort',   icon: '.', stat: 'stealthPerfect',     threshold: 1 },
  { id: 'convoy_master',  title: 'Convoy Master',       icon: '=', stat: 'convoysCompleted',   threshold: 3 },
  { id: 'trader',         title: 'Shrewd Trader',       icon: '&', stat: 'tradesMade',         threshold: 20 },
  { id: 'fleet_admiral',  title: 'Fleet Admiral',       icon: '^', stat: 'maxFleetSize',       threshold: 4 },
  { id: 'long_voyage',    title: 'Long Voyage',         icon: '-', stat: 'distanceSailed',     threshold: 1000 },
  { id: 'marathon',       title: 'Marathon',            icon: '+', stat: 'playTimeMinutes',    threshold: 60 },
  { id: 'crown_hero',     title: 'Crown Hero',          icon: 'K', stat: 'crownHonored',       threshold: 1 },
  { id: 'conspiracy',     title: 'Conspirator',         icon: '?', stat: 'campaignsCompleted', threshold: 1 },
  { id: 'ng_plus',        title: 'Eternal Captain',     icon: '*', stat: 'ngPlusStarted',      threshold: 1 },
];

/**
 * Check which achievements have been newly unlocked.
 * @param {object} stats - Current stats object
 * @param {string[]} unlockedIds - Already unlocked achievement IDs
 * @returns {string[]} Newly unlocked achievement IDs
 */
function checkAchievements(stats, unlockedIds) {
  const newlyUnlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (unlockedIds.includes(ach.id)) continue;
    const val = stats[ach.stat];
    if (val !== undefined && val >= ach.threshold) {
      newlyUnlocked.push(ach.id);
    }
  }
  return newlyUnlocked;
}

/**
 * Get achievement definition by ID.
 * @param {string} id
 * @returns {object|null}
 */
function getAchievement(id) {
  return ACHIEVEMENTS.find(a => a.id === id) || null;
}

module.exports = { ACHIEVEMENTS, checkAchievements, getAchievement };
