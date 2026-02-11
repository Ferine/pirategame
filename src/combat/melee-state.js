'use strict';

const { getRoleBonus } = require('../crew/crew');

// --- Move definitions ---

const MOVES = {
  slash:  { dmg: [15, 25], stam: 20, label: 'Slash',  riposte: false },
  thrust: { dmg: [25, 40], stam: 35, label: 'Thrust', riposte: false },
  parry:  { dmg: [0, 0],   stam: 15, label: 'Parry',  riposte: true, riposteDmg: [20, 30] },
  dodge:  { dmg: [0, 0],   stam: 10, label: 'Dodge',  riposte: false },
};

const MOVE_LIST = ['slash', 'thrust', 'parry', 'dodge'];
const ZONE_LIST = ['high', 'mid', 'low'];

// --- Opponent templates ---

const OPPONENT_TEMPLATES = {
  pirate_crew:     { name: 'Pirate Captain', hp: 100, strength: 12, agility: 8, aiStyle: 'aggressive' },
  merchant_crew:   { name: 'Merchant Guard', hp: 70,  strength: 8,  agility: 6, aiStyle: 'defensive' },
  tavern_brawler:  { name: 'Surly Sailor',   hp: 60,  strength: 7,  agility: 5, aiStyle: 'drunk' },
  island_rival:    { name: 'Rival Pirate',    hp: 90,  strength: 11, agility: 7, aiStyle: 'balanced' },
  fort_guard:      { name: 'Fort Guard',      hp: 70,  strength: 9,  agility: 7, aiStyle: 'defensive' },
};

/**
 * Create melee combat state.
 * @param {object} gameState
 * @param {'boarding'|'barfight'|'duel'} context
 * @param {object} [opponentOverride] - optional { name, hp, strength, agility, aiStyle }
 * @returns {object} melee state
 */
function createMeleeState(gameState, context, opponentOverride) {
  // Determine opponent template
  let template;
  if (opponentOverride) {
    template = opponentOverride;
  } else if (context === 'boarding') {
    template = { ...OPPONENT_TEMPLATES.pirate_crew };
  } else if (context === 'barfight') {
    template = { ...OPPONENT_TEMPLATES.tavern_brawler };
  } else if (context === 'stealth_fight') {
    template = { ...OPPONENT_TEMPLATES.fort_guard };
  } else {
    template = { ...OPPONENT_TEMPLATES.island_rival };
  }

  // Player stats
  let playerStrength = 10;
  let playerHp = 100;

  // Crew boarding bonus
  if (context === 'boarding' && gameState.crew) {
    const bonus = getRoleBonus(gameState.crew, 'boarding');
    playerStrength += Math.floor(bonus / 2);
    playerHp += bonus * 3;
  }

  // Bar fight: reduced HP pools
  if (context === 'barfight') {
    playerHp = 60;
  }

  // Determine return mode
  let returnMode = 'OVERWORLD';
  if (context === 'barfight') returnMode = 'PORT';
  else if (context === 'duel') returnMode = 'ISLAND';
  else if (context === 'stealth_fight') returnMode = 'STEALTH';

  return {
    player: {
      hp: playerHp,
      maxHp: playerHp,
      stamina: 100,
      maxStamina: 100,
      strength: playerStrength,
    },
    enemy: {
      hp: template.hp,
      maxHp: template.hp,
      stamina: 100,
      maxStamina: 100,
      strength: template.strength,
      agility: template.agility,
      name: template.name,
      aiStyle: template.aiStyle,
    },
    phase: 'choose_move',   // choose_move, choose_zone, animate, result
    playerMove: null,
    playerZone: null,
    enemyMove: null,
    enemyZone: null,
    round: 0,
    log: [],
    animTimer: 0,
    animFrame: 0,
    resultTimer: 0,
    victor: null,
    context,
    returnMode,
    loot: null,
    cursor: 0,
    lastPlayerZone: 'mid',
  };
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Resolve a round of melee combat (simultaneous).
 */
function resolveRound(melee) {
  melee.round++;

  const pm = melee.playerMove;
  const pz = melee.playerZone;
  const em = melee.enemyMove;
  const ez = melee.enemyZone;

  let playerDmg = 0;  // damage dealt TO enemy
  let enemyDmg = 0;   // damage dealt TO player

  const pDef = MOVES[pm];
  const eDef = MOVES[em];

  // --- Player's attack on enemy ---
  if (pm === 'dodge') {
    // Player dodges: takes no damage, deals none
  } else if (pm === 'parry') {
    // Player parries: blocks enemy attack if zones match
    if (em !== 'dodge' && em !== 'parry' && pz === ez) {
      // Successful parry + riposte
      playerDmg = Math.round(randRange(pDef.riposteDmg[0], pDef.riposteDmg[1]) * (melee.player.strength / 10));
    }
    // If zones don't match, parry whiffs — enemy attack still hits
  } else {
    // Slash or thrust — deals damage unless enemy dodges or parries the zone
    if (em === 'dodge') {
      // Enemy dodged — no damage
    } else if (em === 'parry' && pz === ez) {
      // Enemy parried our attack zone — blocked
    } else {
      // Attack lands
      const variance = 0.8 + Math.random() * 0.4; // ±20%
      playerDmg = Math.round(randRange(pDef.dmg[0], pDef.dmg[1]) * (melee.player.strength / 10) * variance);
    }
  }

  // --- Enemy's attack on player ---
  if (em === 'dodge') {
    // Enemy dodges
  } else if (em === 'parry') {
    if (pm !== 'dodge' && pm !== 'parry' && ez === pz) {
      enemyDmg = Math.round(randRange(eDef.riposteDmg[0], eDef.riposteDmg[1]) * (melee.enemy.strength / 10));
    }
  } else {
    if (pm === 'dodge') {
      // Player dodged
    } else if (pm === 'parry' && pz === ez) {
      // Player parried
    } else {
      const variance = 0.8 + Math.random() * 0.4;
      enemyDmg = Math.round(randRange(eDef.dmg[0], eDef.dmg[1]) * (melee.enemy.strength / 10) * variance);
    }
  }

  // Apply damage
  melee.enemy.hp = Math.max(0, melee.enemy.hp - playerDmg);
  melee.player.hp = Math.max(0, melee.player.hp - enemyDmg);

  // Stamina costs and regen
  melee.player.stamina = Math.max(0, melee.player.stamina - pDef.stam);
  melee.enemy.stamina = Math.max(0, melee.enemy.stamina - eDef.stam);
  melee.player.stamina = Math.min(melee.player.maxStamina, melee.player.stamina + 15);
  melee.enemy.stamina = Math.min(melee.enemy.maxStamina, melee.enemy.stamina + 15);

  // Build log messages
  const logs = [];

  // Player action
  if (pm === 'dodge') {
    logs.push('You dodge aside.');
  } else if (pm === 'parry') {
    if (playerDmg > 0) {
      logs.push(`You parry and riposte! ${playerDmg} dmg!`);
    } else if (em !== 'dodge' && em !== 'parry' && pz !== ez) {
      logs.push('Your parry misses the mark.');
    } else {
      logs.push('You raise your guard.');
    }
  } else {
    if (playerDmg > 0) {
      logs.push(`Your ${pDef.label.toLowerCase()} hits ${pz}! ${playerDmg} dmg!`);
    } else {
      logs.push(`Your ${pDef.label.toLowerCase()} is ${em === 'dodge' ? 'dodged' : 'blocked'}!`);
    }
  }

  // Enemy action
  if (em === 'dodge') {
    logs.push(`${melee.enemy.name} dodges.`);
  } else if (em === 'parry') {
    if (enemyDmg > 0) {
      logs.push(`${melee.enemy.name} ripostes! ${enemyDmg} dmg!`);
    } else {
      logs.push(`${melee.enemy.name} guards.`);
    }
  } else {
    if (enemyDmg > 0) {
      logs.push(`${melee.enemy.name} ${eDef.label.toLowerCase()}s ${ez}! ${enemyDmg} dmg!`);
    } else {
      logs.push(`${melee.enemy.name}'s ${eDef.label.toLowerCase()} misses!`);
    }
  }

  // Keep last 4 log entries
  melee.log.push(...logs);
  if (melee.log.length > 4) {
    melee.log = melee.log.slice(-4);
  }

  melee.lastPlayerZone = pz;
}

/**
 * Enemy AI: picks move and zone.
 */
function enemyAI(melee) {
  const style = melee.enemy.aiStyle;
  const stam = melee.enemy.stamina;

  let move, zone;

  // Can't pick move if insufficient stamina
  const affordable = MOVE_LIST.filter(m => MOVES[m].stam <= stam);
  if (affordable.length === 0) {
    // Force dodge (cheapest)
    move = 'dodge';
  } else if (style === 'aggressive') {
    const r = Math.random();
    if (r < 0.4 && affordable.includes('thrust')) move = 'thrust';
    else if (r < 0.75 && affordable.includes('slash')) move = 'slash';
    else if (r < 0.9 && affordable.includes('parry')) move = 'parry';
    else move = affordable.includes('dodge') ? 'dodge' : affordable[0];
  } else if (style === 'defensive') {
    const r = Math.random();
    if (r < 0.4 && affordable.includes('parry')) move = 'parry';
    else if (r < 0.65 && affordable.includes('slash')) move = 'slash';
    else if (r < 0.8 && affordable.includes('dodge')) move = 'dodge';
    else move = affordable.includes('thrust') ? 'thrust' : affordable[0];
  } else if (style === 'drunk') {
    const r = Math.random();
    if (r < 0.55 && affordable.includes('slash')) move = 'slash';
    else if (r < 0.7 && affordable.includes('thrust')) move = 'thrust';
    else if (r < 0.85 && affordable.includes('dodge')) move = 'dodge';
    else move = affordable.includes('parry') ? 'parry' : affordable[0];
  } else {
    // balanced — adapt slightly to player pattern
    const r = Math.random();
    if (r < 0.3 && affordable.includes('slash')) move = 'slash';
    else if (r < 0.5 && affordable.includes('parry')) move = 'parry';
    else if (r < 0.7 && affordable.includes('thrust')) move = 'thrust';
    else move = affordable.includes('dodge') ? 'dodge' : affordable[0];
  }

  // Zone selection
  if (style === 'defensive' && melee.lastPlayerZone) {
    // Mirror player's last zone
    zone = melee.lastPlayerZone;
  } else if (style === 'drunk') {
    zone = ZONE_LIST[Math.floor(Math.random() * 3)];
  } else {
    // Weighted: slight tendency away from last player zone
    const zones = [...ZONE_LIST];
    const idx = Math.floor(Math.random() * 3);
    zone = zones[idx];
  }

  melee.enemyMove = move;
  melee.enemyZone = zone;
}

/**
 * Check if melee combat is over.
 */
function checkMeleeEnd(melee) {
  if (melee.enemy.hp <= 0) {
    melee.victor = 'player';
    return true;
  }
  if (melee.player.hp <= 0) {
    melee.victor = 'enemy';
    return true;
  }
  return false;
}

/**
 * Check if player can afford a move.
 */
function canAffordMove(melee, moveId) {
  return melee.player.stamina >= MOVES[moveId].stam;
}

module.exports = {
  MOVES,
  MOVE_LIST,
  ZONE_LIST,
  OPPONENT_TEMPLATES,
  createMeleeState,
  resolveRound,
  enemyAI,
  checkMeleeEnd,
  canAffordMove,
};
