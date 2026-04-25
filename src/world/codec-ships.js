'use strict';

const { TILE_DEFS } = require('../render/tiles');
const { MAP_WIDTH, MAP_HEIGHT } = require('./map-gen');
const { getRepTier } = require('./factions');

// Direction vectors (match overworld convention: 0=N, 1=NE, 2=E, ...)
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

const SPAWN_DISTANCE_MIN = 18;
const SPAWN_DISTANCE_MAX = 28;
const DESPAWN_DISTANCE = 60;
const LIFETIME_SECONDS = 240;        // ~4 real minutes max
const SPAWN_COOLDOWN_DAYS = 1;       // try once per in-game day
const SIGHT_RANGE = 14;              // tiles within which spyglass triggers codec
const MOVE_TICK = 0.6;

// Marked-ship definitions. Each ship has a unique id, visible name,
// two crew speakers, and a list of scenes (4-8 short lines each).
// Lines may use {tokens} resolved at scene-start time from game state.
const MARKED_SHIPS = [
  {
    id: 'stille_vand',
    name: 'Stille Vand',
    char: '?',
    color: 244,                      // dim grey
    speakers: { a: 'Jens', b: 'Bo' },
    speakerColors: { a: 178, b: 137 },
    scenes: [
      [
        ['a', 'See that ship to the {playerBearing}? The {playerShip}.'],
        ['b', "I've heard the name. Reputation's {repTier}."],
        ['a', 'Hull at {hullPct}%. Sloppy.'],
        ['b', 'Sloppy or unlucky.'],
        ['a', "I don't believe in luck."],
        ['b', 'No. You believe in the wind.'],
      ],
      [
        ['b', "He's looking at us, you know."],
        ['a', "He's looking through us. Captains are always looking past."],
        ['b', "Past what?"],
        ['a', 'The next port. The next purse. {playerGold} rigsdaler is never enough.'],
        ['b', 'How do you know what he carries?'],
        ['a', 'Bo. Please.'],
      ],
      [
        ['a', "Day {gameDay}. He's still alive, then."],
        ['b', "We had wagers."],
        ['a', "Yes. I owe you."],
        ['b', "You always owe me."],
        ['a', "And yet you keep sailing with me."],
        ['b', "Where else."],
      ],
      [
        ['b', 'He sailed from {lastPort} this morning, didn\'t he.'],
        ['a', 'I think so.'],
        ['b', 'Bound for?'],
        ['a', 'Bound for whatever the wind says. Look at his trim.'],
        ['b', 'The wind says north today.'],
        ['a', 'The wind says nothing. We listen, and we name what we hear.'],
      ],
    ],
  },
  {
    id: 'maage',
    name: 'Måge',
    char: '?',
    color: 244,
    speakers: { a: 'Ingrid', b: 'Sigrid' },
    speakerColors: { a: 213, b: 219 },
    scenes: [
      [
        ['a', "Sister, the {playerShip} is in our waters again."],
        ['b', 'Score so far this run?'],
        ['a', '{shipsSunk} sunk, {boardings} boarded.'],
        ['b', 'Above average for a {repTier} captain.'],
        ['a', 'Below average for the dead ones.'],
        ['b', 'Dark, Ingrid.'],
        ['a', "Honest, Sigrid."],
      ],
      [
        ['b', 'The hull tells the story. {hullPct}% means {hullStory}.'],
        ['a', 'Or it means he ran from something bigger.'],
        ['b', 'There\'s nothing bigger in the Kattegat.'],
        ['a', 'Yet.'],
        ['b', '...yet.'],
      ],
      [
        ['a', "He's heading {playerHeading}. What's {playerHeading} of here?"],
        ['b', "Nothing he hasn't already taken."],
        ['a', 'Then he\'s going home.'],
        ['b', 'Pirates don\'t go home.'],
        ['a', 'Then he\'s going to make one.'],
      ],
      [
        ['b', 'Day {gameDay}. He\'s lasted longer than the last three.'],
        ['a', 'The last three didn\'t have his wind.'],
        ['b', 'The last three had better gunners.'],
        ['a', "Then how come they're at the bottom and he isn't."],
        ['b', "...fair."],
      ],
    ],
  },
  {
    id: 'tor_ven',
    name: 'Den Tørre Ven',
    char: '?',
    color: 244,
    speakers: { a: 'Wendel', b: '' },     // b never speaks
    speakerColors: { a: 250, b: 240 },
    scenes: [
      [
        ['a', "Are you writing this down?"],
        ['a', "Good."],
        ['a', "{playerShip}. Hull {hullPct}. {repTier}. {playerGold} rigsdaler. Day {gameDay}."],
        ['a', "He doesn't know."],
        ['a', "He never knows."],
        ['a', "Write that he was warned."],
      ],
      [
        ['a', "Has he done the {clockHour} thing yet?"],
        ['a', "..."],
        ['a', "No, not that one. The other one."],
        ['a', "..."],
        ['a', "Good. Strike it from the ledger, then."],
        ['a', "He has time."],
      ],
      [
        ['a', "How many saves does he have now?"],
        ['a', "..."],
        ['a', "{saveCount}. Hm."],
        ['a', "He's still trying."],
        ['a', "We don't have to be patient. We have to be present."],
        ['a', "Write that down too."],
      ],
      [
        ['a', "He's looking at us. Don't move."],
        ['a', "..."],
        ['a', "He's lowering the spyglass."],
        ['a', "..."],
        ['a', "He's raising it again."],
        ['a', "He suspects."],
        ['a', "Good."],
      ],
    ],
  },
];

function getMarkedShipById(id) {
  return MARKED_SHIPS.find(s => s.id === id) || null;
}

/**
 * Create initial codec state. Saved across sessions.
 */
function createCodecState() {
  const perShip = {};
  for (const m of MARKED_SHIPS) {
    perShip[m.id] = { sceneIdx: 0 };
  }
  return {
    perShip,
    lastSpawnDay: 0,
    activeShipId: null,
  };
}

/**
 * After loading a save, ensure codec state is well-formed (e.g. new ships
 * added in a later version get their entry).
 */
function reconcileCodecState(codec) {
  if (!codec || typeof codec !== 'object') return createCodecState();
  if (!codec.perShip) codec.perShip = {};
  for (const m of MARKED_SHIPS) {
    if (!codec.perShip[m.id]) codec.perShip[m.id] = { sceneIdx: 0 };
  }
  if (typeof codec.lastSpawnDay !== 'number') codec.lastSpawnDay = 0;
  codec.activeShipId = null;
  return codec;
}

/**
 * Try to spawn a marked ship near the player. Called from overworld update
 * when no codec ship is currently active and the per-day cooldown is up.
 * Returns the spawned ship object or null.
 */
function trySpawnCodecShip(gameState) {
  const map = gameState.map;
  const px = gameState.ship.x;
  const py = gameState.ship.y;

  // Pick which marked ship to spawn — round-robin by scene progression
  // so the player meets all three over time.
  const codec = gameState.codec;
  const sorted = MARKED_SHIPS.slice().sort((a, b) => {
    return (codec.perShip[a.id].sceneIdx || 0) - (codec.perShip[b.id].sceneIdx || 0);
  });
  const def = sorted[0];

  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
    const x = Math.round(px + Math.cos(angle) * dist);
    const y = Math.round(py + Math.sin(angle) * dist);
    if (x < 1 || x >= MAP_WIDTH - 1 || y < 1 || y >= MAP_HEIGHT - 1) continue;
    const tile = map.tiles[y * MAP_WIDTH + x];
    if (!TILE_DEFS[tile] || !TILE_DEFS[tile].passable) continue;
    if (tile === 8) continue;

    return {
      id: def.id,                  // shared with definition; runtime instance
      defId: def.id,
      name: def.name,
      x, y,
      direction: Math.floor(Math.random() * 8),
      moveAccum: 0,
      moveTimer: 0,
      lifetime: LIFETIME_SECONDS,
      isCodec: true,
    };
  }
  return null;
}

/**
 * Update all codec ships (drift, lifetime, despawn). Spawn at most one
 * per in-game day when the field is empty.
 */
function updateCodecShips(gameState, dt) {
  if (!gameState.codecShips) gameState.codecShips = [];
  const ships = gameState.codecShips;
  const map = gameState.map;
  const px = gameState.ship.x;
  const py = gameState.ship.y;
  const day = (gameState.quests && gameState.quests.day) || 1;

  // Drift / despawn
  for (let i = ships.length - 1; i >= 0; i--) {
    const s = ships[i];
    s.lifetime -= dt;
    s.moveTimer += dt;
    while (s.moveTimer >= MOVE_TICK) {
      s.moveTimer -= MOVE_TICK;
      const nx = s.x + DIR_DX[s.direction];
      const ny = s.y + DIR_DY[s.direction];
      if (nx < 1 || nx >= MAP_WIDTH - 1 || ny < 1 || ny >= MAP_HEIGHT - 1) {
        s.direction = (s.direction + 4) % 8;
        continue;
      }
      const tile = map.tiles[ny * MAP_WIDTH + nx];
      if (TILE_DEFS[tile] && TILE_DEFS[tile].passable && tile !== 8) {
        s.x = nx;
        s.y = ny;
      } else {
        s.direction = (s.direction + (Math.random() < 0.5 ? 1 : -1) + 8) % 8;
      }
    }
    const dx = s.x - px;
    const dy = s.y - py;
    if (s.lifetime <= 0 || dx * dx + dy * dy > DESPAWN_DISTANCE * DESPAWN_DISTANCE) {
      ships.splice(i, 1);
    }
  }

  // Spawn
  if (ships.length === 0 && gameState.codec) {
    const sinceLast = day - gameState.codec.lastSpawnDay;
    if (sinceLast >= SPAWN_COOLDOWN_DAYS) {
      const spawned = trySpawnCodecShip(gameState);
      if (spawned) {
        ships.push(spawned);
        gameState.codec.lastSpawnDay = day;
      }
    }
  }
}

/**
 * Find a codec ship within sight range. Used by overworld 'v' handler.
 */
function findCodecShipInSight(gameState) {
  if (!gameState.codecShips || gameState.codecShips.length === 0) return null;
  const px = gameState.ship.x;
  const py = gameState.ship.y;
  for (const s of gameState.codecShips) {
    const dx = s.x - px;
    const dy = s.y - py;
    if (dx * dx + dy * dy <= SIGHT_RANGE * SIGHT_RANGE) return s;
  }
  return null;
}

/**
 * Resolve the next scene for a marked ship and substitute tokens from
 * current game state. Advances the per-ship sceneIdx.
 * Returns { ship: <def>, lines: [[speaker, text], ...] }.
 */
function resolveScene(gameState, runtimeShip) {
  const def = getMarkedShipById(runtimeShip.defId);
  if (!def) return null;
  const perShip = gameState.codec.perShip[def.id] || { sceneIdx: 0 };
  const sceneIdx = perShip.sceneIdx % def.scenes.length;
  const rawLines = def.scenes[sceneIdx];
  const tokens = _buildTokens(gameState, runtimeShip);
  const lines = rawLines.map(([sp, text]) => [sp, _substitute(text, tokens)]);
  perShip.sceneIdx = sceneIdx + 1;
  return { def, lines };
}

function _buildTokens(gameState, runtimeShip) {
  const ship = gameState.ship;
  const hullPct = Math.max(0, Math.round((ship.hull / ship.maxHull) * 100));
  const repTier = _formatRepTier(gameState);
  const day = (gameState.quests && gameState.quests.day) || 1;
  const stats = gameState.stats || {};
  const gold = (gameState.economy && gameState.economy.gold) || 0;
  const playerHeading = _dirName(ship.direction);
  const playerBearing = _bearingFromShipToPlayer(runtimeShip, ship);
  const lastPort = (gameState.portInfo && gameState.portInfo.name) ||
                   (gameState.persistent && gameState.persistent.lastPortName) ||
                   'somewhere';
  const clockHour = new Date().getHours();
  return {
    playerShip: ship.name || 'Drakar',
    playerGold: String(gold),
    playerHeading,
    playerBearing,
    hullPct: String(hullPct),
    hullStory: hullPct < 30 ? 'he\'s been at war' : hullPct < 70 ? 'he\'s been busy' : 'he\'s been lucky',
    repTier,
    gameDay: String(day),
    shipsSunk: String(stats.shipsSunk || 0),
    boardings: String(stats.boardings || 0),
    lastPort,
    clockHour: String(clockHour).padStart(2, '0') + ':00',
    saveCount: String(_estimateSaveCount(gameState)),
  };
}

function _substitute(text, tokens) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (tokens[k] !== undefined ? tokens[k] : '?'));
}

function _formatRepTier(gameState) {
  if (!gameState.reputation) return 'unknown';
  // Pick the faction the player is most extreme with (furthest from neutral=50)
  let best = { tier: 'unknown', mag: -1 };
  for (const f of ['crown', 'smuggler', 'navy', 'merchant', 'pirate']) {
    const v = gameState.reputation[f];
    if (typeof v !== 'number') continue;
    const tier = getRepTier(v);
    const mag = Math.abs(v - 50);
    if (mag > best.mag && tier && tier.label) {
      best = { tier: tier.label.toLowerCase(), mag };
    }
  }
  return best.mag >= 0 ? best.tier : 'unknown';
}

function _dirName(d) {
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][d % 8] || 'somewhere';
}

function _bearingFromShipToPlayer(npc, player) {
  const dx = player.x - npc.x;
  const dy = player.y - npc.y;
  const angle = Math.atan2(dy, dx);
  const a = ((angle + Math.PI * 2) % (Math.PI * 2));
  const idx = Math.round(a / (Math.PI / 4)) % 8;
  // atan2 right=0 -> our east; map similarly to npc-ships._vecToDir
  const lookup = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
  return lookup[idx] || 'somewhere';
}

function _estimateSaveCount(gameState) {
  // Best-effort: count saves on disk via persistent stats if available;
  // otherwise return a small number so the line still makes sense.
  if (gameState.persistent && gameState.persistent.stats &&
      typeof gameState.persistent.stats.gamesStarted === 'number') {
    return gameState.persistent.stats.gamesStarted;
  }
  return 1;
}

module.exports = {
  MARKED_SHIPS,
  SIGHT_RANGE,
  createCodecState,
  reconcileCodecState,
  updateCodecShips,
  findCodecShipInSight,
  resolveScene,
  getMarkedShipById,
};
