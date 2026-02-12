'use strict';

const { createShip, getShipType } = require('./ship-types');

const MAX_FLEET_SIZE = 4;

/**
 * Create initial fleet state with one sloop.
 */
function createFleetState(starterName) {
  const ship = createShip('sloop', starterName || 'Drakar');
  return {
    ships: [ship],
    flagshipId: ship.id,
  };
}

/**
 * Get the current flagship object.
 */
function getFlagship(fleet) {
  return fleet.ships.find(s => s.id === fleet.flagshipId) || fleet.ships[0] || null;
}

/**
 * Add a ship to the fleet. Returns false if fleet is full.
 */
function addShip(fleet, ship) {
  if (fleet.ships.length >= MAX_FLEET_SIZE) return false;
  fleet.ships.push(ship);
  return true;
}

/**
 * Remove a ship from the fleet. Cannot remove the flagship.
 * Returns the removed ship or null.
 */
function removeShip(fleet, shipId) {
  if (shipId === fleet.flagshipId) return null;
  const idx = fleet.ships.findIndex(s => s.id === shipId);
  if (idx < 0) return null;
  return fleet.ships.splice(idx, 1)[0];
}

/**
 * Set a new flagship. Returns false if shipId not found.
 */
function setFlagship(fleet, shipId) {
  const ship = fleet.ships.find(s => s.id === shipId);
  if (!ship) return false;
  fleet.flagshipId = shipId;
  return true;
}

/**
 * Push flagship stats into gameState.ship and gameState.economy.
 * Call on overworld enter / after flagship switch.
 */
function syncToGameState(fleet, gameState) {
  const flagship = getFlagship(fleet);
  if (!flagship) return;

  const type = getShipType(flagship.typeId);
  if (!type) return;

  const ship = gameState.ship;
  ship.name = flagship.name;
  ship.hull = flagship.hull;
  ship.maxHull = type.hull + flagship.hullBonus;

  const eco = gameState.economy;
  if (eco) {
    eco.speedBonus = type.speed - 1.0 + flagship.speedBonus;
    eco.cannonBonus = type.cannons - 2 + flagship.cannonBonus;
    eco.cargoMax = type.cargoMax + flagship.cargoBonus;
  }

  if (gameState.crew) {
    gameState.crew.maxCrew = type.crewMax;
  }
}

/**
 * Pull runtime stats back into the fleet flagship entry.
 * Call before switching flagships or saving.
 */
function syncFromGameState(fleet, gameState) {
  const flagship = getFlagship(fleet);
  if (!flagship) return;

  const type = getShipType(flagship.typeId);
  if (!type) return;

  const ship = gameState.ship;
  flagship.name = ship.name;
  flagship.hull = ship.hull;
  flagship.maxHull = ship.maxHull;

  const eco = gameState.economy;
  if (eco) {
    flagship.hullBonus = ship.maxHull - type.hull;
    flagship.speedBonus = eco.speedBonus - (type.speed - 1.0);
    flagship.cannonBonus = eco.cannonBonus - (type.cannons - 2);
    flagship.cargoBonus = eco.cargoMax - type.cargoMax;
  }
}

/**
 * Get effective stats for a ship (base + bonuses).
 */
function getEffectiveStats(ship) {
  const type = getShipType(ship.typeId);
  if (!type) return null;

  return {
    maxHull: type.hull + ship.hullBonus,
    speed: type.speed + ship.speedBonus,
    cargoMax: type.cargoMax + ship.cargoBonus,
    cannons: type.cannons + ship.cannonBonus,
    masts: type.masts,
    crewMax: type.crewMax,
  };
}

module.exports = {
  MAX_FLEET_SIZE,
  createFleetState,
  getFlagship,
  addShip,
  removeShip,
  setFlagship,
  syncToGameState,
  syncFromGameState,
  getEffectiveStats,
};
