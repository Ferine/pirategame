'use strict';

const { getFlagship, getEffectiveStats } = require('../fleet/fleet');

// Enemy ship templates for test combat
const ENEMY_TEMPLATES = [
  { name: 'Swedish Corvette', hull: 80, crew: 40, masts: 2 },
  { name: 'Danish Brig', hull: 60, crew: 30, masts: 2 },
  { name: 'Hanseatic Cog', hull: 100, crew: 50, masts: 3 },
  { name: 'Norwegian Sloop', hull: 50, crew: 25, masts: 1 },
  { name: 'Prussian Frigate', hull: 120, crew: 60, masts: 3 },
];

// English flagship template for Act 5 story boss
const ENGLISH_FLAGSHIP = { name: 'HMS Sovereign', hull: 200, crew: 100, masts: 4 };

// Damage tables by ammo type: [minHull, maxHull, minCrew, maxCrew, mastChance]
const AMMO_DAMAGE = {
  iron:  { hull: [15, 25], crew: [0, 3],  masts: 0 },
  chain: { hull: [5, 10],  crew: [0, 2],  masts: 1 },   // mast damage if power>60% and aim<threshold
  grape: { hull: [2, 5],   crew: [8, 15], masts: 0 },
};

const HIT_RADIUS = 6;
const NEAR_MISS_RADIUS = 12;

function createCombatState(gameState) {
  const template = ENEMY_TEMPLATES[Math.floor(Math.random() * ENEMY_TEMPLATES.length)];

  // Use real crew count if available
  const crewCount = gameState.crew ? gameState.crew.members.length : 30;
  const maxCrew = gameState.crew ? gameState.crew.maxCrew : 30;
  const cannonBonus = gameState.economy ? (gameState.economy.cannonBonus || 0) : 0;
  // Escort fire bonus: +1 cannon per surviving escort
  const escortBonus = gameState.convoy && gameState.convoy.active
    ? gameState.convoy.escorts.filter(e => e.alive).length
    : 0;
  const cannonCount = 2 + cannonBonus + escortBonus;

  // Derive masts from fleet flagship if available
  let playerMasts = 2;
  if (gameState.fleet) {
    const flagship = getFlagship(gameState.fleet);
    if (flagship) {
      const stats = getEffectiveStats(flagship);
      if (stats) playerMasts = stats.masts;
    }
  }

  return {
    player: {
      hull: gameState.ship.hull,
      maxHull: gameState.ship.maxHull,
      crew: crewCount,
      maxCrew: maxCrew,
      masts: playerMasts,
      maxMasts: playerMasts,
      cannons: cannonCount,
      maxCannons: cannonCount,
    },
    enemy: {
      name: template.name,
      hull: template.hull,
      maxHull: template.hull,
      crew: template.crew,
      maxCrew: template.crew,
      masts: template.masts,
      maxMasts: template.masts,
      distance: 350,
    },
    round: 1,
    aim: { offsetX: 0, offsetY: 0 },
    power: 0,
    ammoType: 'iron',
    ammoInventory: { iron: 20, chain: 8, grape: 8 },
    wind: {
      direction: gameState.wind.direction,
      strength: gameState.wind.strength,
    },
    lastShotResult: null,
    combatLog: [],
    resolved: false,
    victor: null,
  };
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function calculatePlayerDamage(combat) {
  const { aim, power, ammoType } = combat;
  const dist = Math.sqrt(aim.offsetX * aim.offsetX + aim.offsetY * aim.offsetY);
  const dmgTable = AMMO_DAMAGE[ammoType];

  let hitQuality;
  if (dist < HIT_RADIUS) {
    hitQuality = 1.0;
  } else if (dist < NEAR_MISS_RADIUS) {
    hitQuality = 0.4;
  } else {
    return { hit: false, hullDmg: 0, crewDmg: 0, mastDmg: 0, hitQuality: 0 };
  }

  const powerScale = power / 100;
  const cannonMult = combat.player && combat.player.cannons ? (combat.player.cannons / 2) : 1.0;
  const hullDmg = Math.round(randRange(dmgTable.hull[0], dmgTable.hull[1]) * powerScale * hitQuality * cannonMult);
  const crewDmg = Math.round(randRange(dmgTable.crew[0], dmgTable.crew[1]) * powerScale * hitQuality * cannonMult);

  let mastDmg = 0;
  if (ammoType === 'chain' && power > 60 && dist < HIT_RADIUS) {
    mastDmg = dmgTable.masts;
  }

  return { hit: true, hullDmg, crewDmg, mastDmg, hitQuality };
}

function applyDamageToEnemy(combat, dmg) {
  const e = combat.enemy;
  e.hull = Math.max(0, e.hull - dmg.hullDmg);
  e.crew = Math.max(0, e.crew - dmg.crewDmg);
  e.masts = Math.max(0, e.masts - dmg.mastDmg);

  combat.lastShotResult = {
    source: 'player',
    ...dmg,
  };

  const logMsg = dmg.hit
    ? `Round ${combat.round}: Your ${combat.ammoType} shot hits! Hull -${dmg.hullDmg}, Crew -${dmg.crewDmg}${dmg.mastDmg ? ', Mast -' + dmg.mastDmg : ''}`
    : `Round ${combat.round}: Your shot misses!`;
  combat.combatLog.push(logMsg);

  // Consume ammo
  combat.ammoInventory[combat.ammoType] = Math.max(0, combat.ammoInventory[combat.ammoType] - 1);
}

function enemyFire(combat, damageTakenMult) {
  const dmgMult = damageTakenMult || 1.0;
  const e = combat.enemy;
  const crewRatio = e.crew / e.maxCrew;
  const accuracy = 0.5 + crewRatio * 0.3;
  const hits = Math.random() < accuracy;

  if (!hits) {
    combat.lastShotResult = { source: 'enemy', hit: false, hullDmg: 0, crewDmg: 0, mastDmg: 0 };
    combat.combatLog.push(`Round ${combat.round}: The ${e.name} fires and misses!`);
    return combat.lastShotResult;
  }

  const hullDmg = Math.round(randRange(8, 20) * dmgMult);
  const crewDmg = Math.round(randRange(0, 4) * dmgMult);
  const mastDmg = Math.random() < 0.1 ? 1 : 0;

  const p = combat.player;
  p.hull = Math.max(0, p.hull - hullDmg);
  p.crew = Math.max(0, p.crew - crewDmg);
  p.masts = Math.max(0, p.masts - mastDmg);

  combat.lastShotResult = { source: 'enemy', hit: true, hullDmg, crewDmg, mastDmg };
  combat.combatLog.push(`Round ${combat.round}: The ${e.name} hits! Hull -${hullDmg}, Crew -${crewDmg}${mastDmg ? ', Mast -' + mastDmg : ''}`);
  return combat.lastShotResult;
}

function checkCombatEnd(combat) {
  if (combat.enemy.hull <= 0 || combat.enemy.crew <= 0) {
    combat.resolved = true;
    combat.victor = 'player';
    return true;
  }
  if (combat.player.hull <= 0 || combat.player.crew <= 0) {
    combat.resolved = true;
    combat.victor = 'enemy';
    return true;
  }
  return false;
}

module.exports = {
  createCombatState,
  calculatePlayerDamage,
  applyDamageToEnemy,
  enemyFire,
  checkCombatEnd,
  HIT_RADIUS,
  NEAR_MISS_RADIUS,
  ENGLISH_FLAGSHIP,
};
