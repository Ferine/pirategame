'use strict';

/**
 * Ship type definitions for the fleet system.
 */

const SHIP_TYPES = {
  sloop:      { name: 'Sloop',      hull: 100, speed: 1.0, cargoMax: 20, cannons: 2, masts: 2, crewMax: 8,  cost: 0 },
  brigantine: { name: 'Brigantine', hull: 150, speed: 1.2, cargoMax: 35, cannons: 4, masts: 2, crewMax: 12, cost: 400 },
  frigate:    { name: 'Frigate',    hull: 200, speed: 0.9, cargoMax: 50, cannons: 8, masts: 3, crewMax: 20, cost: 800 },
  galleon:    { name: 'Galleon',    hull: 300, speed: 0.7, cargoMax: 80, cannons: 12, masts: 3, crewMax: 30, cost: 1500 },
};

function getShipType(typeId) {
  return SHIP_TYPES[typeId] || null;
}

let _idCounter = 0;

function createShip(typeId, name) {
  const type = SHIP_TYPES[typeId];
  if (!type) return null;

  return {
    id: 'ship_' + (++_idCounter) + '_' + Math.random().toString(36).slice(2, 6),
    typeId,
    name: name || type.name,
    hull: type.hull,
    maxHull: type.hull,
    hullBonus: 0,
    speedBonus: 0,
    cannonBonus: 0,
    cargoBonus: 0,
  };
}

/**
 * Map NPC faction to ship type.
 */
function getNpcShipType(faction) {
  const map = {
    english: 'frigate',
    danish: 'brigantine',
    merchant: 'brigantine',
    pirate: 'sloop',
  };
  return map[faction] || 'sloop';
}

/**
 * Get ships available for purchase at a given port.
 * Copenhagen: brigantine, frigate, galleon
 * Gothenburg: brigantine, frigate
 * Aarhus: brigantine
 * Others: nothing
 */
function getShipsForSale(portName) {
  const availability = {
    Copenhagen: ['brigantine', 'frigate', 'galleon'],
    Gothenburg: ['brigantine', 'frigate'],
    Aarhus:     ['brigantine'],
  };

  const typeIds = availability[portName];
  if (!typeIds) return [];

  return typeIds.map(id => ({ typeId: id, ...SHIP_TYPES[id] }));
}

module.exports = {
  SHIP_TYPES,
  getShipType,
  createShip,
  getNpcShipType,
  getShipsForSale,
};
