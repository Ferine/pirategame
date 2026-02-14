'use strict';

const { TILE_DEFS } = require('../render/tiles');
const { MAP_WIDTH, MAP_HEIGHT } = require('./map-gen');
const { getEncounterAggression } = require('./factions');

// Faction definitions
const FACTION = {
  ENGLISH:  'english',
  DANISH:   'danish',
  MERCHANT: 'merchant',
  PIRATE:   'pirate',
};

// Faction colors (xterm 256)
const FACTION_COLORS = {
  english:  160,  // red
  danish:   33,   // blue
  merchant: 178,  // yellow/amber
  pirate:   255,  // white
};

// Faction ship names
const FACTION_NAMES = {
  english:  ['HMS Resolute', 'HMS Dreadnought', 'HMS Victory', 'HMS Vanguard', 'HMS Interceptor'],
  danish:   ['KDM Niels Juel', 'KDM Peder Skram', 'KDM Herluf Trolle', 'KDM Holger Danske'],
  merchant: ['Nordstjernen', 'Havfruen', 'Den Gyldne Hjort', 'Fortuna', 'Tre Kroner', 'Svanen'],
  pirate:   ['Black Ravn', 'Havets Ulv', 'Stormfuglen', 'Djævlens Datter'],
};

// Ship templates per faction
const FACTION_TEMPLATES = {
  english:  { hull: 100, crew: 50, masts: 3, speed: 1.8, aggression: 0.7 },
  danish:   { hull: 70,  crew: 35, masts: 2, speed: 2.0, aggression: 0.3 },
  merchant: { hull: 60,  crew: 20, masts: 2, speed: 1.5, aggression: 0.0 },
  pirate:   { hull: 80,  crew: 45, masts: 2, speed: 2.5, aggression: 0.8 },
};

// Direction vectors (same as overworld)
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

const MAX_NPC_SHIPS = 16;
const SPAWN_DISTANCE = 30;     // min distance from player to spawn
const DESPAWN_DISTANCE = 80;   // remove ships this far from player
const MOVE_INTERVAL = 0.4;     // seconds between NPC move ticks

/**
 * Create initial NPC ship list on game start.
 */
function createNPCShips(gameState) {
  const ships = [];
  const map = gameState.map;

  // Spawn initial fleet
  _spawnShips(ships, map, gameState.ship.x, gameState.ship.y, 8, gameState);

  return ships;
}

/**
 * Spawn ships at water tiles within a ring around the player.
 */
function _pickSpawnFaction() {
  const roll = Math.random();
  if (roll < 0.50) return FACTION.MERCHANT;
  if (roll < 0.70) return FACTION.ENGLISH;
  if (roll < 0.85) return FACTION.PIRATE;
  return FACTION.DANISH;
}

function _spawnShips(ships, map, px, py, count, gameState) {
  for (let i = 0; i < count && ships.length < MAX_NPC_SHIPS; i++) {
    const faction = _pickSpawnFaction();
    const ship = _spawnOneShip(map, px, py, faction, gameState);
    if (ship) ships.push(ship);
  }
}

// Goods IDs for NPC cargo generation
const CARGO_GOODS = ['cod', 'herring', 'grain', 'timber', 'iron', 'gunpowder', 'silk', 'spices'];

function _generateNPCCargo(faction) {
  const cargo = {};
  let gold = 0;
  if (faction === FACTION.MERCHANT) {
    // 2-4 random goods
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const good = CARGO_GOODS[Math.floor(Math.random() * CARGO_GOODS.length)];
      cargo[good] = (cargo[good] || 0) + 1 + Math.floor(Math.random() * 3);
    }
    gold = 20 + Math.floor(Math.random() * 21);
  } else if (faction === FACTION.PIRATE) {
    // 1-2 goods
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const good = CARGO_GOODS[Math.floor(Math.random() * CARGO_GOODS.length)];
      cargo[good] = (cargo[good] || 0) + 1 + Math.floor(Math.random() * 2);
    }
    gold = 30 + Math.floor(Math.random() * 31);
  }
  return { cargo, gold };
}

function _spawnOneShip(map, px, py, faction, gameState) {
  // Try random positions in a ring around player
  for (let attempt = 0; attempt < 50; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_DISTANCE + Math.random() * 30;
    const x = Math.round(px + Math.cos(angle) * dist);
    const y = Math.round(py + Math.sin(angle) * dist);

    if (x < 1 || x >= MAP_WIDTH - 1 || y < 1 || y >= MAP_HEIGHT - 1) continue;

    const tile = map.tiles[y * MAP_WIDTH + x];
    if (!TILE_DEFS[tile] || !TILE_DEFS[tile].passable) continue;
    // Don't spawn on port tiles
    if (tile === 8) continue;

    const template = FACTION_TEMPLATES[faction];
    const names = FACTION_NAMES[faction];

    // Desperate merchant: 15% chance, battered hull, will fight back
    let name = names[Math.floor(Math.random() * names.length)];
    let hull = template.hull;
    let aggression = template.aggression;
    let desperate = false;
    if (faction === FACTION.MERCHANT && Math.random() < 0.15) {
      desperate = true;
      hull = Math.round(template.hull * 0.6);
      aggression = 0.4;
      name = 'Battered ' + name;
    }

    // NPC cargo
    const { cargo, gold } = _generateNPCCargo(faction);

    // Merchant trade routes: pick 2 random ports as waypoints
    let tradeRoute = null;
    let tradeRouteIdx = 0;
    if (faction === FACTION.MERCHANT && gameState && gameState.map && gameState.map.ports) {
      const ports = gameState.map.ports;
      if (ports.length >= 2) {
        const a = Math.floor(Math.random() * ports.length);
        let b = Math.floor(Math.random() * (ports.length - 1));
        if (b >= a) b++;
        tradeRoute = [
          { x: ports[a].actualX, y: ports[a].actualY },
          { x: ports[b].actualX, y: ports[b].actualY },
        ];
        tradeRouteIdx = 0;
      }
    }

    return {
      id: Math.random().toString(36).slice(2, 8),
      name,
      faction,
      x, y,
      direction: Math.floor(Math.random() * 8),
      hull,
      maxHull: template.hull,
      crew: template.crew,
      maxCrew: template.crew,
      masts: template.masts,
      speed: template.speed,
      aggression,
      moveAccum: 0,
      desperate,
      cargo,
      gold,
      // AI state
      aiTarget: null,     // {x,y} waypoint
      aiTimer: 0,         // seconds until next waypoint change
      // Trade route (merchants)
      tradeRoute,
      tradeRouteIdx,
    };
  }
  return null;
}

/**
 * Update all NPC ships: move AI, despawn far ships, spawn replacements.
 */
function updateNPCShips(ships, gameState, dt) {
  const { ship: player, map, wind } = gameState;

  // Move NPCs
  const reputation = gameState.reputation || null;
  for (const npc of ships) {
    _updateNPCAI(npc, player, wind, dt, reputation);
    _moveNPC(npc, map, wind, dt);
  }

  // Despawn far ships
  for (let i = ships.length - 1; i >= 0; i--) {
    const dx = ships[i].x - player.x;
    const dy = ships[i].y - player.y;
    if (dx * dx + dy * dy > DESPAWN_DISTANCE * DESPAWN_DISTANCE) {
      ships.splice(i, 1);
    }
  }

  // NPC-to-NPC clashes
  const clashReports = _resolveNPCClashes(ships);
  if (clashReports.length > 0 && gameState.noticeQueue) {
    for (const report of clashReports) {
      gameState.noticeQueue.push({ message: report, duration: 4.0 });
    }
  }

  // Spawn replacements
  if (ships.length < MAX_NPC_SHIPS) {
    const needed = Math.min(2, MAX_NPC_SHIPS - ships.length);

    // Check for active naval blockade event
    const hasBlockade = gameState.events && gameState.events.active &&
      gameState.events.active.some(e => e.type === 'naval_blockade');

    for (let i = 0; i < needed; i++) {
      let faction;
      if (hasBlockade && Math.random() < 0.6) {
        faction = FACTION.ENGLISH;
      } else {
        faction = _pickSpawnFaction();
      }
      const newShip = _spawnOneShip(map, player.x, player.y, faction, gameState);
      if (newShip) ships.push(newShip);
    }
  }
}

function _updateNPCAI(npc, player, wind, dt, reputation) {
  // Ambush targeting: head toward assigned escort ship
  if (npc.ambushTarget) {
    const escort = npc.ambushTarget;
    if (escort.alive) {
      npc.aiTarget = { x: escort.x, y: escort.y };
      npc.aiTimer = 2;
      // Set direction toward target
      if (npc.aiTarget) {
        const dx = npc.aiTarget.x - npc.x;
        const dy = npc.aiTarget.y - npc.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          npc.direction = _vecToDir(dx, dy);
        }
      }
      return;
    } else {
      npc.ambushTarget = null; // target destroyed, revert to normal AI
    }
  }

  npc.aiTimer -= dt;

  if (npc.aiTimer <= 0) {
    // Get aggression modifiers from reputation
    const aggMod = reputation ? getEncounterAggression(reputation) : { english: 0.7, pirate: 0.7 };

    // Pick new waypoint
    if (npc.faction === FACTION.MERCHANT) {
      if (npc.tradeRoute && npc.tradeRoute.length >= 2) {
        // Navigate toward current trade route waypoint
        const wp = npc.tradeRoute[npc.tradeRouteIdx];
        const dx = wp.x - npc.x;
        const dy = wp.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) {
          // Arrived at waypoint, advance to next
          npc.tradeRouteIdx = (npc.tradeRouteIdx + 1) % npc.tradeRoute.length;
        }
        const nextWp = npc.tradeRoute[npc.tradeRouteIdx];
        npc.aiTarget = { x: nextWp.x, y: nextWp.y };
        npc.aiTimer = 3 + Math.random() * 5;
      } else {
        // Fallback: wander randomly
        npc.aiTarget = {
          x: npc.x + (Math.random() * 40 - 20),
          y: npc.y + (Math.random() * 40 - 20),
        };
        npc.aiTimer = 5 + Math.random() * 10;
      }
    } else if (npc.faction === FACTION.ENGLISH || npc.faction === FACTION.PIRATE) {
      // Patrol toward player if close enough, else wander
      // Detection range scales with aggression modifier
      const factionAgg = npc.faction === FACTION.ENGLISH ? aggMod.english : aggMod.pirate;
      const detectRange = 15 + Math.floor(factionAgg * 20); // 15-35 tiles

      const dx = player.x - npc.x;
      const dy = player.y - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < detectRange && Math.random() < factionAgg) {
        npc.aiTarget = { x: player.x, y: player.y };
        npc.aiTimer = 3 + Math.random() * 4;
      } else {
        npc.aiTarget = {
          x: npc.x + (Math.random() * 30 - 15),
          y: npc.y + (Math.random() * 30 - 15),
        };
        npc.aiTimer = 6 + Math.random() * 8;
      }
    } else {
      // Danish — friendly patrol, wander
      npc.aiTarget = {
        x: npc.x + (Math.random() * 30 - 15),
        y: npc.y + (Math.random() * 30 - 15),
      };
      npc.aiTimer = 8 + Math.random() * 10;
    }
  }

  // Set direction toward target
  if (npc.aiTarget) {
    const dx = npc.aiTarget.x - npc.x;
    const dy = npc.aiTarget.y - npc.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      npc.direction = _vecToDir(dx, dy);
    }
  }
}

function _vecToDir(dx, dy) {
  const angle = Math.atan2(dy, dx);
  // Convert to 8-dir: 0=N, 1=NE, 2=E, ...
  // atan2 returns: right=0, down=pi/2, left=pi, up=-pi/2
  // Our dirs: N=0, NE=1, E=2, SE=3, S=4, SW=5, W=6, NW=7
  const idx = Math.round(angle / (Math.PI / 4));
  // atan2 mapping: 0→E(2), 1→SE(3), 2→S(4), -1→NE(1), -2→N(0), -3→NW(7), -4→W(6)
  const map = [2, 3, 4, 5, 6, -1, -1, -1, -1]; // not quite right, let me compute properly
  // Better: convert angle to our convention
  const a = ((angle + Math.PI * 2) % (Math.PI * 2)); // 0 to 2pi
  const dir = Math.round(a / (Math.PI / 4)) % 8;
  // atan2 convention: 0=right, pi/4=down-right, pi/2=down, etc.
  // Our convention: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
  // Need to rotate: atan2's "right" = our "E" = 2
  const lookup = [2, 3, 4, 5, 6, 7, 0, 1];
  return lookup[dir] || 0;
}

function _moveNPC(npc, map, wind, dt) {
  // Wind affects NPC speed too
  let diff = Math.abs(npc.direction - wind.direction);
  if (diff > 4) diff = 8 - diff;
  const windMult = [0.3, 0.5, 0.9, 1.0, 0.7];
  const speed = npc.speed * windMult[diff] * wind.strength * 0.6; // NPCs are a bit slower

  npc.moveAccum += speed * dt;

  while (npc.moveAccum >= 1.0) {
    npc.moveAccum -= 1.0;

    const nx = npc.x + DIR_DX[npc.direction];
    const ny = npc.y + DIR_DY[npc.direction];

    if (nx < 1 || nx >= MAP_WIDTH - 1 || ny < 1 || ny >= MAP_HEIGHT - 1) {
      npc.moveAccum = 0;
      // Turn around
      npc.direction = (npc.direction + 4) % 8;
      break;
    }

    const tile = map.tiles[ny * MAP_WIDTH + nx];
    if (TILE_DEFS[tile] && TILE_DEFS[tile].passable && tile !== 8) {
      npc.x = nx;
      npc.y = ny;
    } else {
      npc.moveAccum = 0;
      // Steer away from obstacle
      npc.direction = (npc.direction + (Math.random() < 0.5 ? 1 : -1) + 8) % 8;
      break;
    }
  }
}

// Hostile faction pairs for NPC-to-NPC combat
const HOSTILE_PAIRS = [
  [FACTION.PIRATE, FACTION.MERCHANT],
  [FACTION.PIRATE, FACTION.ENGLISH],
  [FACTION.PIRATE, FACTION.DANISH],
];

function _areHostile(a, b) {
  for (const [f1, f2] of HOSTILE_PAIRS) {
    if ((a === f1 && b === f2) || (a === f2 && b === f1)) return true;
  }
  return false;
}

/**
 * Resolve NPC-to-NPC clashes: when hostile ships are within 3 tiles, the weaker is removed.
 * Returns array of report strings for notices.
 */
function _resolveNPCClashes(ships) {
  const reports = [];
  const toRemove = new Set();

  for (let i = 0; i < ships.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < ships.length; j++) {
      if (toRemove.has(j)) continue;
      const a = ships[i];
      const b = ships[j];
      if (!_areHostile(a.faction, b.faction)) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy > 9) continue; // >3 tiles apart

      // Weaker ship (lower hull) loses
      const loser = a.hull <= b.hull ? i : j;
      const winner = loser === i ? j : i;
      ships[winner].hull = Math.max(1, ships[winner].hull - 15);
      toRemove.add(loser);
      reports.push(`${ships[winner].name} sank the ${ships[loser].name}!`);
    }
  }

  // Remove losers (reverse order to preserve indices)
  const indices = [...toRemove].sort((a, b) => b - a);
  for (const idx of indices) {
    ships.splice(idx, 1);
  }

  return reports;
}

/**
 * Check if any NPC ship is adjacent to player. Returns the NPC or null.
 */
function checkEncounter(ships, playerX, playerY, convoy) {
  for (const npc of ships) {
    const dx = Math.abs(npc.x - playerX);
    const dy = Math.abs(npc.y - playerY);
    if (dx <= 1 && dy <= 1 && (dx + dy) > 0) {
      return npc;
    }
  }

  // Check NPC adjacency to convoy escort ships
  if (convoy && convoy.active) {
    for (const npc of ships) {
      if (!npc.ambushTarget) continue;
      for (const escort of convoy.escorts) {
        if (!escort.alive) continue;
        const ex = Math.abs(npc.x - escort.x);
        const ey = Math.abs(npc.y - escort.y);
        if (ex <= 1 && ey <= 1 && (ex + ey) > 0) {
          // Ambush NPC reached an escort — deal damage directly
          return { npc, target: 'escort', escortId: escort.id };
        }
      }
    }
  }

  return null;
}

/**
 * Remove a specific NPC ship (after combat/encounter).
 */
function removeNPCShip(ships, shipId) {
  const idx = ships.findIndex(s => s.id === shipId);
  if (idx >= 0) ships.splice(idx, 1);
}

module.exports = {
  FACTION,
  FACTION_COLORS,
  FACTION_TEMPLATES,
  MAX_NPC_SHIPS,
  createNPCShips,
  updateNPCShips,
  checkEncounter,
  removeNPCShip,
  _resolveNPCClashes,
  _pickSpawnFaction,
  _generateNPCCargo,
};
