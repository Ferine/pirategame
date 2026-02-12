'use strict';

/**
 * Trade goods and economy system for Kattegat Kaper.
 *
 * Each good has a base price and tags indicating where it's cheap/expensive.
 * Ports have supply/demand modifiers that shift prices.
 */

const GOODS = [
  { id: 'cod',        name: 'Cod',              base: 8,   unit: 'barrel' },
  { id: 'herring',    name: 'Herring',           base: 6,   unit: 'barrel' },
  { id: 'grain',      name: 'Grain',             base: 12,  unit: 'sack'   },
  { id: 'timber',     name: 'Timber',            base: 18,  unit: 'load'   },
  { id: 'iron',       name: 'Iron',              base: 25,  unit: 'ingot'  },
  { id: 'gunpowder',  name: 'Gunpowder',         base: 40,  unit: 'keg'    },
  { id: 'silk',       name: 'Silk',              base: 55,  unit: 'bolt'   },
  { id: 'spices',     name: 'Spices',            base: 65,  unit: 'crate'  },
];

// Price modifiers per port: multiplier on base price.
// < 1.0 = cheap (supply), > 1.0 = expensive (demand)
const PORT_PRICES = {
  Skagen:        { cod: 0.6,  herring: 0.5, grain: 1.3, timber: 1.1, iron: 1.2, gunpowder: 1.4, silk: 1.5,  spices: 1.6  },
  Frederikshavn: { cod: 0.7,  herring: 0.6, grain: 1.2, timber: 0.8, iron: 1.0, gunpowder: 1.3, silk: 1.4,  spices: 1.5  },
  Aalborg:       { cod: 0.9,  herring: 0.8, grain: 0.7, timber: 0.7, iron: 0.9, gunpowder: 1.1, silk: 1.3,  spices: 1.4  },
  Aarhus:        { cod: 1.0,  herring: 0.9, grain: 0.8, timber: 0.9, iron: 0.8, gunpowder: 1.0, silk: 1.1,  spices: 1.2  },
  Helsingor:     { cod: 1.1,  herring: 1.0, grain: 1.0, timber: 1.0, iron: 1.0, gunpowder: 0.8, silk: 1.0,  spices: 1.0  },
  Helsingborg:   { cod: 1.0,  herring: 1.0, grain: 1.1, timber: 0.8, iron: 0.7, gunpowder: 1.0, silk: 1.1,  spices: 1.1  },
  Copenhagen:    { cod: 1.3,  herring: 1.2, grain: 1.1, timber: 1.2, iron: 1.1, gunpowder: 0.7, silk: 0.7,  spices: 0.7  },
  Malmo:         { cod: 1.1,  herring: 1.1, grain: 0.9, timber: 0.9, iron: 0.8, gunpowder: 1.1, silk: 1.0,  spices: 1.0  },
  Gothenburg:    { cod: 0.8,  herring: 0.7, grain: 1.0, timber: 0.6, iron: 0.6, gunpowder: 1.2, silk: 1.3,  spices: 1.3  },
};

// Ship upgrades available at shipwrights
const UPGRADES = [
  { id: 'hull_repair', name: 'Hull Repair',       desc: 'Restore hull to full',     cost: 30,  type: 'repair' },
  { id: 'hull_plate',  name: 'Hull Plating',      desc: 'Max hull +25',             cost: 120, type: 'hull',  bonus: 25 },
  { id: 'cargo_ext',   name: 'Cargo Extension',   desc: 'Cargo hold +10',           cost: 80,  type: 'cargo', bonus: 10 },
  { id: 'fast_sails',  name: 'Fast Sails',        desc: 'Speed +20%',               cost: 150, type: 'speed', bonus: 0.2 },
  { id: 'extra_cannon', name: 'Extra Cannon',      desc: 'Cannons +1',              cost: 100, type: 'cannon', bonus: 1 },
];

/**
 * Get the buy/sell price for a good at a given port.
 * Buy price has a small markup, sell price has a small markdown.
 */
function getPrice(goodId, portName, eventMult) {
  const good = GOODS.find(g => g.id === goodId);
  if (!good) return { buy: 0, sell: 0 };

  const portMods = PORT_PRICES[portName];
  const mod = (portMods && portMods[goodId]) || 1.0;

  // Add some randomness (±10%)
  const jitter = 0.9 + Math.random() * 0.2;
  const price = Math.round(good.base * mod * jitter * (eventMult || 1.0));

  return {
    buy: Math.max(1, price + Math.ceil(price * 0.1)),   // 10% markup
    sell: Math.max(1, price - Math.ceil(price * 0.1)),   // 10% markdown
  };
}

/**
 * Generate a full price table for a port (called once when entering market).
 */
function generatePriceTable(portName, eventMult) {
  const table = {};
  for (const good of GOODS) {
    table[good.id] = getPrice(good.id, portName, eventMult);
  }
  return table;
}

/**
 * Initialize player economy state (called once at game start).
 */
function createEconomyState() {
  return {
    gold: 100,           // starting rigsdaler
    cargo: {},           // { goodId: quantity }
    cargoUsed: 0,
    cargoMax: 20,        // starting hold capacity
    speedBonus: 0,       // from sail upgrades
    cannonBonus: 0,      // extra cannons
  };
}

/**
 * Count total cargo units.
 */
function cargoCount(economy) {
  let total = 0;
  for (const qty of Object.values(economy.cargo)) {
    total += qty;
  }
  return total;
}

module.exports = {
  GOODS,
  PORT_PRICES,
  UPGRADES,
  getPrice,
  generatePriceTable,
  createEconomyState,
  cargoCount,
};
