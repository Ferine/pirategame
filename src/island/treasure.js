'use strict';

// Treasure loot tiers with weights
const TREASURE_TIERS = [
  { weight: 40, minGold: 50,  maxGold: 100, cargo: null,       label: 'Small Chest' },
  { weight: 30, minGold: 100, maxGold: 250, cargo: null,       label: 'Iron Strongbox' },
  { weight: 20, minGold: 200, maxGold: 500, cargo: 'silk',     label: 'Merchant Cache' },
  { weight: 10, minGold: 500, maxGold: 1000,cargo: 'spices',   label: 'Captain\'s Hoard' },
];

/**
 * Roll treasure loot from weighted tiers.
 * @returns {{ gold: number, cargo: string|null, cargoQty: number, label: string }}
 */
function rollTreasureLoot() {
  const totalWeight = TREASURE_TIERS.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * totalWeight;
  let tier = TREASURE_TIERS[0];

  for (const t of TREASURE_TIERS) {
    roll -= t.weight;
    if (roll <= 0) { tier = t; break; }
  }

  const gold = tier.minGold + Math.floor(Math.random() * (tier.maxGold - tier.minGold + 1));
  const cargoQty = tier.cargo ? 1 + Math.floor(Math.random() * 3) : 0;

  return {
    gold,
    cargo: tier.cargo,
    cargoQty,
    label: tier.label,
  };
}

/**
 * Create a treasure map pointing to a specific island.
 * @param {number} islandId
 * @param {string} islandName
 * @returns {{ islandId, islandName, found: boolean }}
 */
function createTreasureMap(islandId, islandName) {
  return { islandId, islandName, found: false };
}

module.exports = {
  TREASURE_TIERS,
  rollTreasureLoot,
  createTreasureMap,
};
