'use strict';

/**
 * Reputation & Faction system for Kattegat Kaper.
 *
 * Five faction tracks, each 0-100 (50 = neutral).
 * Actions ripple across factions — attacking one helps or hurts others.
 */

const FACTIONS = {
  CROWN:    'crown',     // Danish Crown — loyalty, letters of marque
  SMUGGLER: 'smuggler',  // Smuggler Network — black market, contraband
  NAVY:     'navy',      // English Navy — your notoriety/threat level
  MERCHANT: 'merchant',  // Merchant Guild — trade prices, access
  PIRATE:   'pirate',    // Pirate Brotherhood — alliance, intel
};

const FACTION_INFO = {
  crown:    { name: 'Danish Crown',      icon: '\u2655', desc: 'Royal favor and letters of marque' },
  smuggler: { name: 'Smuggler Network',  icon: '\u2620', desc: 'Black market access and secret coves' },
  navy:     { name: 'English Navy',      icon: '\u2693', desc: 'Your notoriety among the English' },
  merchant: { name: 'Merchant Guild',    icon: '\u2696', desc: 'Trade prices and cargo availability' },
  pirate:   { name: 'Pirate Brotherhood', icon: '\u2694', desc: 'Alliance with fellow privateers' },
};

// Reputation tier thresholds and labels
const REP_TIERS = [
  { min: 0,  label: 'Hated',     color: 'bad' },
  { min: 15, label: 'Hostile',   color: 'bad' },
  { min: 30, label: 'Unfriendly', color: 'warn' },
  { min: 40, label: 'Neutral',   color: 'neutral' },
  { min: 55, label: 'Friendly',  color: 'good' },
  { min: 70, label: 'Respected', color: 'good' },
  { min: 85, label: 'Honored',   color: 'great' },
];

/**
 * Create initial reputation state.
 */
function createReputationState() {
  return {
    crown:    50,  // neutral with Denmark
    smuggler: 30,  // don't know the smugglers yet
    navy:     40,  // English don't know you yet
    merchant: 50,  // neutral with merchants
    pirate:   35,  // pirates don't trust you yet
  };
}

/**
 * Get the reputation tier label for a value.
 */
function getRepTier(value) {
  let tier = REP_TIERS[0];
  for (const t of REP_TIERS) {
    if (value >= t.min) tier = t;
  }
  return tier;
}

/**
 * Clamp reputation to 0-100.
 */
function clampRep(val) {
  return Math.max(0, Math.min(100, Math.round(val)));
}

/**
 * Apply reputation changes from an action.
 * `changes` is an object like { crown: +10, navy: -5, merchant: -3 }
 */
function applyRepChanges(rep, changes) {
  const results = [];
  for (const [faction, delta] of Object.entries(changes)) {
    if (rep[faction] === undefined) continue;
    const old = rep[faction];
    rep[faction] = clampRep(rep[faction] + delta);
    if (delta !== 0) {
      const info = FACTION_INFO[faction];
      const dir = delta > 0 ? '+' : '';
      results.push(`${info.name} ${dir}${delta}`);
    }
  }
  return results;
}

// --- Predefined action effects ---

const ACTIONS = {
  // Combat encounters
  attack_english: {
    crown: 8, smuggler: 2, navy: 10, merchant: -2, pirate: 5,
    desc: 'Attacked an English vessel',
  },
  defeat_english: {
    crown: 5, smuggler: 3, navy: 5, merchant: 0, pirate: 3,
    desc: 'Defeated an English vessel',
  },
  attack_danish: {
    crown: -15, smuggler: 2, navy: -2, merchant: -5, pirate: 3,
    desc: 'Attacked a Danish vessel',
  },
  attack_merchant: {
    crown: -3, smuggler: 3, navy: 2, merchant: -10, pirate: 5,
    desc: 'Attacked a merchant ship',
  },
  defeat_merchant: {
    crown: -2, smuggler: 2, navy: 2, merchant: -5, pirate: 3,
    desc: 'Plundered a merchant vessel',
  },
  attack_pirate: {
    crown: 3, smuggler: -5, navy: -3, merchant: 3, pirate: -10,
    desc: 'Attacked a pirate ship',
  },

  // Peaceful encounters
  hail_english: {
    crown: 0, smuggler: 0, navy: -1, merchant: 0, pirate: 0,
    desc: 'Hailed an English ship peacefully',
  },
  hail_danish: {
    crown: 1, smuggler: 0, navy: 0, merchant: 0, pirate: 0,
    desc: 'Hailed a Danish vessel',
  },
  hail_merchant: {
    crown: 0, smuggler: 0, navy: 0, merchant: 1, pirate: 0,
    desc: 'Hailed a merchant ship',
  },

  // Trading
  trade_goods: {
    crown: 0, smuggler: 0, navy: 0, merchant: 1, pirate: 0,
    desc: 'Traded goods at market',
  },

  // Port actions
  pay_crown_tax: {
    crown: 3, smuggler: -1, navy: 0, merchant: 0, pirate: -1,
    desc: 'Paid taxes to the Crown',
  },
};

/**
 * Apply a named action's reputation effects.
 * Returns array of change descriptions.
 */
function applyAction(rep, actionId) {
  const action = ACTIONS[actionId];
  if (!action) return [];
  const changes = { ...action };
  delete changes.desc;
  return applyRepChanges(rep, changes);
}

/**
 * Get the action ID for attacking a given NPC faction.
 */
function getAttackAction(npcFaction) {
  const map = {
    english: 'attack_english',
    danish: 'attack_danish',
    merchant: 'attack_merchant',
    pirate: 'attack_pirate',
  };
  return map[npcFaction] || null;
}

/**
 * Get the action ID for defeating a given NPC faction.
 */
function getDefeatAction(npcFaction) {
  const map = {
    english: 'defeat_english',
    merchant: 'defeat_merchant',
  };
  return map[npcFaction] || null;
}

/**
 * Get the action ID for hailing a given NPC faction.
 */
function getHailAction(npcFaction) {
  const map = {
    english: 'hail_english',
    danish: 'hail_danish',
    merchant: 'hail_merchant',
  };
  return map[npcFaction] || null;
}

/**
 * Get a price multiplier based on Merchant Guild reputation.
 * High rep = better prices (lower buy, higher sell).
 * Returns { buyMult, sellMult }.
 */
function getTradePriceModifier(rep) {
  const merchantRep = rep.merchant || 50;
  // 0 rep = 1.2x buy, 0.8x sell (bad prices)
  // 50 rep = 1.0x (neutral)
  // 100 rep = 0.85x buy, 1.15x sell (great prices)
  const factor = (merchantRep - 50) / 50; // -1 to 1
  return {
    buyMult:  1.0 - factor * 0.15,
    sellMult: 1.0 + factor * 0.15,
  };
}

/**
 * Get harbor difficulty modifier based on English Navy notoriety.
 * Higher notoriety = more naval patrols and faster obstacles.
 * Returns a multiplier 0.5 to 2.0.
 */
function getHarborDifficulty(rep) {
  const navyRep = rep.navy || 40;
  // Low navy rep = easy (they ignore you): 0.5x
  // High navy rep = hard (heavy patrols): 2.0x
  return 0.5 + (navyRep / 100) * 1.5;
}

/**
 * Get encounter aggression modifier.
 * High navy rep = English are more aggressive.
 * High pirate rep = pirates are less aggressive.
 * Returns { english, pirate } multipliers for aggression.
 */
function getEncounterAggression(rep) {
  return {
    english: 0.3 + (rep.navy || 40) / 100 * 0.7,     // 0.3 to 1.0
    pirate:  1.0 - (rep.pirate || 35) / 100 * 0.6,    // 0.4 to 1.0
  };
}

/**
 * Check if player is welcome at a port (Danish Crown reputation).
 * Below 20 = denied entry to major ports.
 */
function isPortAccessAllowed(rep, portName) {
  const crownRep = rep.crown || 50;
  // Major ports require Crown rep >= 20
  const majorPorts = ['Copenhagen', 'Aarhus', 'Aalborg'];
  if (majorPorts.includes(portName) && crownRep < 20) {
    return false;
  }
  return true;
}

module.exports = {
  FACTIONS,
  FACTION_INFO,
  REP_TIERS,
  ACTIONS,
  createReputationState,
  getRepTier,
  applyRepChanges,
  applyAction,
  getAttackAction,
  getDefeatAction,
  getHailAction,
  getTradePriceModifier,
  getHarborDifficulty,
  getEncounterAggression,
  isPortAccessAllowed,
};
