'use strict';

const { FOV } = require('rot-js');
const { TILE, TILE_DEFS, getTileChar, SHIP_ATTR, DIR_CHARS,
        FOG_UNEXPLORED_ATTR, FOG_UNEXPLORED_CHAR,
        FOG_EXPLORED_ATTR, FOG_EXPLORED_CHAR, sattr } = require('../render/tiles');
const { createHUD, updateHUD, HUD_HEIGHT } = require('../render/hud');
const { MAP_WIDTH, MAP_HEIGHT } = require('../world/map-gen');
const { createCombatState } = require('../combat/combat-state');
const { createHarborState } = require('../harbor/lanes');
const { FACTION_COLORS, createNPCShips, updateNPCShips, checkEncounter } = require('../world/npc-ships');
const { tickMorale } = require('../crew/crew');
const { isPortAccessAllowed } = require('../world/factions');
const { updateWeather, getWeatherEffects, FOG_HIDE_RANGE, RAIN_CHARS, FOG_CHARS } = require('../world/weather');
const { advanceQuestTime } = require('../world/quests');
const { applyCRTFilter, triggerBell } = require('../render/crt-filter');
const { getQuarter, getSeason, getEffectiveSightRange, getWeatherBias,
        getNightDimLevel, dimColor, isInLanternGlow } = require('../world/day-night');
const { onDayAdvance, updateEventNotifications, isPortClosed } = require('../world/events');
const { syncToGameState } = require('../fleet/fleet');
const { updateConvoy, toggleFormation, checkConvoyArrival, checkConvoyFailed,
        shouldSpawnAmbush, spawnAmbushNPC, damageEscort,
        getFormationBonus, updateBlockade } = require('../convoy/convoy');
const { renderConvoyOverlay } = require('../convoy/convoy-hud');
const { createJournalState, journalHandleInput, journalRender } = require('../story/journal-ui');
const { getDifficulty } = require('../meta/legacy');
const { logEvent, flushDay } = require('../meta/captains-log');
const { createLogUIState, logUIHandleInput, logUIRender } = require('../meta/captains-log');
const { createSeaObjectsState, updateSeaObjects, checkSeaObjectCollision, resolveSeaObject, SEA_OBJECT_TYPES } = require('../world/sea-objects');
const { getCurrentAt, getCurrentSpeedMult } = require('../world/currents');
const { createHelmsmanState, engagePort, engageExplore, disengage, updateHeading, getHelmsmanHUDText } = require('../world/helmsman');
const { createHelmsmanUI, helmsmanHandleInput, helmsmanRender } = require('../world/helmsman-ui');

// Movement direction vectors: N, NE, E, SE, S, SW, W, NW
const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

// Key to direction mapping
const KEY_DIR = { up: 0, right: 2, down: 4, left: 6 };

// Speed multipliers by angle difference (0-4) from wind
const SPEED_MULT = [0.3, 0.5, 0.9, 1.0, 0.7];

const SIGHT_RANGE = 15;

// Visibility states
const VIS_UNEXPLORED = 0;
const VIS_EXPLORED = 1;
const VIS_VISIBLE = 2;

class OverworldMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.hudBox = null;
    this.animFrame = 0;
    this.animTimer = 0;
    this.visibility = null; // Uint8Array for FOV
    this.fov = null;
    this.camera = { x: 0, y: 0 };
    this.viewW = 0;
    this.viewH = 0;
    this.showMap = false;
    this.journalUI = null;
    this.logUI = null;
    this.helmsmanUI = null;
  }

  enter(gameState) {
    this.gameState = gameState;
    const { ship } = gameState;

    // Init visibility map — persist across mode changes on gameState
    if (!gameState.visibility) {
      gameState.visibility = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    }
    this.visibility = gameState.visibility;

    // Create FOV calculator
    const self = this;
    this.fov = new FOV.RecursiveShadowcasting(
      (x, y) => {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
        const t = gameState.map.tiles[y * MAP_WIDTH + x];
        return TILE_DEFS[t] ? TILE_DEFS[t].transparent : false;
      },
      { topology: 8 }
    );

    // Do initial FOV compute
    this._computeFOV();

    // Initialize NPC ships if not already present
    if (!gameState.npcShips) {
      gameState.npcShips = createNPCShips(gameState);
    }

    // Initialize sea objects if not present
    if (!gameState.seaObjects) {
      gameState.seaObjects = createSeaObjectsState();
    }

    // Sync fleet flagship stats into ship/economy
    if (gameState.fleet) {
      syncToGameState(gameState.fleet, gameState);
    }

    // Initialize helmsman if absent
    if (!gameState.helmsman) {
      gameState.helmsman = createHelmsmanState();
    }

    // Reset overlays
    this.journalUI = null;
    this.logUI = null;
    this.helmsmanUI = null;

    // Cooldown to prevent re-triggering encounters immediately
    this.encounterCooldown = 1.0;

    // Day timer for morale ticks (30 real seconds = 1 game day)
    this.dayTimer = 30;
    this.moraleMessage = '';
    this.moraleMessageTimer = 0;
  }

  exit() {
    this.gameState.hudMessage = '';
    if (this.hudBox) {
      this.hudBox.detach();
      this.hudBox = null;
    }
  }

  update(dt) {
    const { wind, ship } = this.gameState;

    // Track play time
    if (this.gameState.stats) {
      this.gameState.stats.playTimeSeconds += dt;
      this.gameState.stats.playTimeMinutes = Math.floor(this.gameState.stats.playTimeSeconds / 60);
    }

    // Process achievement toasts
    if (this.gameState.achievementToasts && this.gameState.achievementToasts.length > 0) {
      this.gameState.achievementToasts[0].timer -= dt;
      if (this.gameState.achievementToasts[0].timer <= 0) {
        this.gameState.achievementToasts.shift();
      }
    }

    // Animation timer
    this.animTimer += dt;
    if (this.animTimer >= 0.5) {
      this.animTimer -= 0.5;
      this.animFrame = (this.animFrame + 1) % 4;
    }

    // Update wind
    this._updateWind(dt);

    // Update weather with day/night + seasonal bias
    if (this.gameState.weather) {
      let weatherBias = undefined;
      if (this.gameState.quests) {
        const quarter = getQuarter(this.gameState.quests.clockAccum);
        const season = getSeason(this.gameState.quests.day || 1);
        weatherBias = getWeatherBias(quarter, season);
      }
      updateWeather(this.gameState.weather, dt, weatherBias);

      // Storm hull damage every 5 seconds
      const wx = this.gameState.weather;
      if (wx.type === 'storm' && wx.damageTimer >= 5.0) {
        wx.damageTimer -= 5.0;
        const effects = getWeatherEffects(wx);
        if (effects.hullDmg > 0) {
          const dmgMult = getDifficulty(this.gameState).damageTakenMult;
          const dmg = Math.round(effects.hullDmg * dmgMult);
          ship.hull = Math.max(1, ship.hull - dmg);
          this._pushNotice('The storm batters your hull!', 3.0);
          logEvent(this.gameState.captainsLog, 'storm', {});
        }
      }
    }

    // Helmsman autopilot steering
    if (this.gameState.helmsman && this.gameState.helmsman.active) {
      const helmsman = this.gameState.helmsman;
      const newDir = updateHeading(helmsman, ship, wind, this.gameState.map, dt);
      if (newDir !== null) {
        ship.direction = newDir;
      }
      if (!helmsman.active) {
        // Helmsman disengaged itself
        const reason = helmsman.stoppedReason;
        if (reason === 'arrived') {
          this._pushNotice(`Arrived near ${helmsman.targetPort ? helmsman.targetPort.name : 'destination'}.`, 3.0);
          logEvent(this.gameState.captainsLog, 'helmsman_arrival',
            { name: helmsman.targetPort ? helmsman.targetPort.name : 'unknown' });
        } else if (reason === 'explored') {
          this._pushNotice('Helmsman: No more uncharted waters nearby.', 3.0);
          logEvent(this.gameState.captainsLog, 'helmsman_explore', {});
        } else if (reason === 'stuck') {
          this._pushNotice('Helmsman: Cannot find a clear heading!', 3.0);
        }
      }
    }

    // Update ship movement
    this._updateShip(dt);

    // Update NPC ships
    if (this.gameState.npcShips) {
      updateNPCShips(this.gameState.npcShips, this.gameState, dt);
    }

    // Update sea objects
    if (this.gameState.seaObjects && this.gameState.map) {
      updateSeaObjects(this.gameState.seaObjects, ship.x, ship.y, this.gameState.map, dt);
      const found = checkSeaObjectCollision(this.gameState.seaObjects, ship.x, ship.y);
      if (found) {
        const result = resolveSeaObject(found);
        this._applySeaObjectEffects(result.effects, this.gameState);
        this._pushNotice(result.text, 4.0);
        logEvent(this.gameState.captainsLog, 'sea_discovery', { type: found.type });
      }
    }

    // Update convoy escorts
    if (this.gameState.convoy && this.gameState.convoy.active) {
      const convoy = this.gameState.convoy;

      updateConvoy(convoy, this.gameState.ship, this.gameState.wind, this.gameState.map, dt);

      // Position escorts near player if they're at (0,0) — just activated
      for (const escort of convoy.escorts) {
        if (escort.alive && escort.x === 0 && escort.y === 0) {
          escort.x = ship.x - DIR_DX[ship.direction] * 2;
          escort.y = ship.y - DIR_DY[ship.direction] * 2;
        }
      }

      // Check ambush spawning
      if (shouldSpawnAmbush(convoy, dt)) {
        const ambush = spawnAmbushNPC(convoy, ship.x, ship.y, this.gameState.map);
        if (ambush) this.gameState.npcShips.push(ambush);
      }

      // Check convoy failure (all escorts dead or timer expired)
      if (checkConvoyFailed(convoy)) {
        convoy.active = false;
        this._pushNotice('The convoy has been lost!', 5.0);
      }
    }

    // Update blockade runner
    if (this.gameState.blockade && this.gameState.blockade.active) {
      updateBlockade(this.gameState.blockade, this.gameState.ship, dt);
      if (this.gameState.blockade.detected) {
        this._pushNotice('You have been spotted by English patrols!', 4.0);
        this.gameState.blockade.active = false;
      }
    }

    // Day timer — morale tick + world events
    if (this.gameState.quests) {
      const daysAdvanced = advanceQuestTime(this.gameState.quests, dt);
      // Fire world events on day boundaries
      if (daysAdvanced > 0 && this.gameState.events) {
        for (let d = 0; d < daysAdvanced; d++) {
          const day = this.gameState.quests.day - daysAdvanced + d + 1;
          onDayAdvance(this.gameState, day);
          // Flush captain's log for previous day and start new day
          if (this.gameState.captainsLog) {
            flushDay(this.gameState.captainsLog, day - 1);
            logEvent(this.gameState.captainsLog, 'new_day', { day });
          }
        }
      }
    }

    // Tick event notification timers
    if (this.gameState.events) {
      updateEventNotifications(this.gameState.events, dt);
    }

    if (this.gameState.crew && this.gameState.crew.members.length > 0) {
      this.dayTimer -= dt;
      if (this.dayTimer <= 0) {
        this.dayTimer = 30;
        const events = tickMorale(this.gameState.crew, this.gameState.economy);
        for (const ev of events) {
          if (ev.type === 'desertion') {
            this._pushNotice(`${ev.member.name} has deserted!`, 4.0);
          } else if (ev.type === 'mutiny') {
            this._pushNotice('The crew threatens mutiny!', 5.0);
          }
        }
      }
    }
    if (this.moraleMessageTimer > 0) {
      this.moraleMessageTimer -= dt;
      if (this.moraleMessageTimer <= 0) {
        this.moraleMessage = '';
        this.moraleMessageTimer = 0;
      }
    }

    // Process queued notices if no message is currently displayed
    if (this.moraleMessageTimer <= 0) {
      if (this.gameState.noticeQueue && this.gameState.noticeQueue.length >0) {
        const next = this.gameState.noticeQueue.shift();
        this._pushNotice(next.message, next.duration);
      } else if (Array.isArray(this.gameState.questNotices) && this.gameState.questNotices.length > 0) {
        this._pushNotice(this.gameState.questNotices.shift(), 5.0);
      }
    }

    // Act 5: Spawn English flagship near Helsingor
    if (this.gameState.campaign && this.gameState.campaign.act === 5
        && !this.gameState.campaign.flags.flagshipSpawned) {
      const helsingor = this._findPortByName('Helsingor');
      if (helsingor) {
        const dist = Math.sqrt((ship.x - helsingor.actualX) ** 2 + (ship.y - helsingor.actualY) ** 2);
        if (dist < 20) {
          const flagship = {
            id: 'flagship', name: 'HMS Sovereign', faction: 'english',
            x: helsingor.actualX + 5, y: helsingor.actualY + 3,
            hull: 200, maxHull: 200, crew: 100, maxCrew: 100, masts: 4,
            speed: 1.5, aggression: 1.0, moveAccum: 0,
            aiTarget: { x: ship.x, y: ship.y }, aiTimer: 5,
            direction: 0, storyBoss: true,
          };
          if (!this.gameState.npcShips) this.gameState.npcShips = [];
          this.gameState.npcShips.push(flagship);
          this.gameState.campaign.flags.flagshipSpawned = true;
          this._pushNotice('The English fleet appears at the narrows!', 5.0);
        }
      }
    }

    // Encounter cooldown
    if (this.encounterCooldown > 0) {
      this.encounterCooldown -= dt;
    } else if (this.gameState.npcShips) {
      const result = checkEncounter(this.gameState.npcShips, ship.x, ship.y, this.gameState.convoy);
      if (result) {
        if (result.target === 'escort' && result.escortId) {
          // Ambush NPC reached an escort — deal damage and remove NPC
          damageEscort(this.gameState.convoy, result.escortId, 20 + Math.floor(Math.random() * 15));
          const escort = this.gameState.convoy.escorts.find(e => e.id === result.escortId);
          if (escort && !escort.alive) {
            this._pushNotice(`The ${escort.name} has been sunk!`, 4.0);
          } else if (escort) {
            this._pushNotice(`The ${escort.name} is under attack! Hull: ${escort.hull}`, 3.0);
          }
          // Remove the ambush NPC
          const npcIdx = this.gameState.npcShips.indexOf(result.npc);
          if (npcIdx >= 0) this.gameState.npcShips.splice(npcIdx, 1);
          this.encounterCooldown = 2.0;
        } else {
          // Normal player encounter
          const npc = result.npc || result;
          this.gameState.encounter = npc;
          this.encounterCooldown = 3.0;
          // Disengage helmsman on encounter
          if (this.gameState.helmsman && this.gameState.helmsman.active) {
            disengage(this.gameState.helmsman, 'encounter');
          }
          this.stateMachine.transition('ENCOUNTER', this.gameState);
          return;
        }
      }
    }
  }

  render(screen) {
    // Ensure HUD is created
    if (!this.hudBox) {
      this.hudBox = createHUD(screen);
    }

    // Calculate view dimensions (screen minus HUD)
    this.viewW = screen.width;
    this.viewH = screen.height - HUD_HEIGHT;

    // Update camera to center on ship
    this._updateCamera();

    // Render map tiles directly to screen buffer
    this._renderMap(screen);

    // Weather overlay
    this._renderWeatherOverlay(screen);

    // CRT post-processing
    applyCRTFilter(screen, this.gameState.crtEnabled);

    // Render port/island labels
    this._renderLabels(screen);

    // Render sea objects
    this._renderSeaObjects(screen);

    // Render NPC ships
    this._renderNPCShips(screen);

    // Render convoy escort ships overlay
    if (this.gameState.convoy && this.gameState.convoy.active) {
      renderConvoyOverlay(screen, this.gameState.convoy, this.camera, this.viewW, this.viewH);
    }

    // Render player ship on top
    this._renderShip(screen);

    // Event notification banners at top
    this._renderEventBanners(screen);

    this.gameState.hudMessage = this.moraleMessageTimer > 0 ? this.moraleMessage : '';

    // Update HUD content
    updateHUD(this.hudBox, this.gameState);

    // Map overlay
    if (this.showMap) {
      this._renderMapOverlay(screen);
    }

    // Journal overlay
    if (this.journalUI) {
      journalRender(screen, this.journalUI, this.gameState.campaign);
    }

    // Captain's log overlay
    if (this.logUI) {
      logUIRender(screen, this.logUI, this.gameState.captainsLog);
    }

    // Helmsman menu overlay
    if (this.helmsmanUI) {
      helmsmanRender(screen, this.helmsmanUI);
    }

    // Helmsman status bar (when active, no menu)
    if (!this.helmsmanUI && this.gameState.helmsman && this.gameState.helmsman.active) {
      this._renderHelmsmanBar(screen);
    }

    // Achievement toast (top-right corner)
    this._renderAchievementToast(screen);
  }

  handleInput(key) {
    // Helmsman menu overlay takes priority
    if (this.helmsmanUI) {
      const result = helmsmanHandleInput(key, this.helmsmanUI);
      if (result) {
        if (result.action === 'port') {
          engagePort(this.gameState.helmsman, result.data);
          this._pushNotice(`Helmsman set course for ${result.data.name}.`, 3.0);
          logEvent(this.gameState.captainsLog, 'helmsman_engage', { name: result.data.name });
        } else if (result.action === 'explore') {
          engageExplore(this.gameState.helmsman, this.gameState.ship.x, this.gameState.ship.y,
            this.visibility, MAP_WIDTH, MAP_HEIGHT);
          if (this.gameState.helmsman.active) {
            this._pushNotice('Helmsman: Charting unexplored waters.', 3.0);
            logEvent(this.gameState.captainsLog, 'helmsman_explore', {});
          }
        }
        // Cancel or selection: close menu
        this.helmsmanUI = null;
      }
      return;
    }

    // Captain's log overlay takes priority
    if (this.logUI) {
      const consumed = logUIHandleInput(key, this.logUI, this.gameState.captainsLog);
      if (!consumed) {
        this.logUI = null;
      }
      return;
    }

    // Journal overlay takes priority
    if (this.journalUI) {
      const consumed = journalHandleInput(key, this.journalUI, this.gameState.campaign);
      if (!consumed) {
        this.journalUI = null;
      }
      return;
    }

    if (key === 'l' && this.gameState.captainsLog) {
      this.logUI = createLogUIState();
      return;
    }

    if (key === 'j' && this.gameState.campaign) {
      this.journalUI = createJournalState(this.gameState.campaign);
      return;
    }

    if (key === 'v') {
      this.gameState.combat = createCombatState(this.gameState);
      this.stateMachine.transition('SPYGLASS', this.gameState);
      return;
    }

    if (key === 'p') {
      // Find nearest port for testing
      const port = this._findNearestPort();
      if (port) {
        this.gameState.portInfo = { name: port.name, desc: port.desc };
        this.stateMachine.transition('PORT', this.gameState);
      }
      return;
    }

    // Map toggle
    if (key === 'm') {
      this.showMap = !this.showMap;
      return;
    }

    // Reputation notice
    if (key === 'r') {
      this._pushNotice('Visit the Harbor Master for full standings.', 3.0);
      return;
    }

    // Fleet roster notice
    if (key === 'f') {
      this._pushNotice('Visit a port to manage your fleet.', 3.0);
      return;
    }

    // Toggle convoy formation
    if (key === 'tab') {
      if (this.gameState.convoy && this.gameState.convoy.active) {
        toggleFormation(this.gameState.convoy);
        const f = this.gameState.convoy.formation;
        this._pushNotice(`Formation: ${f.toUpperCase()}`, 2.0);
      }
      return;
    }

    // Helmsman navigation
    if (key === 'n') {
      if (this.gameState.helmsman && this.gameState.helmsman.active) {
        disengage(this.gameState.helmsman, 'cancel');
        this._pushNotice('You take the helm.', 2.0);
      } else {
        this.helmsmanUI = createHelmsmanUI(this.gameState);
      }
      return;
    }

    // Toggle CRT filter
    if (key === 'c') {
      this.gameState.crtEnabled = !this.gameState.crtEnabled;
      return;
    }

    const dir = KEY_DIR[key];
    if (dir !== undefined) {
      // Cancel helmsman on manual steering
      if (this.gameState.helmsman && this.gameState.helmsman.active) {
        disengage(this.gameState.helmsman, 'cancel');
        this._pushNotice('You take the helm.', 2.0);
      }
      this.gameState.ship.direction = dir;
    }
  }

  // --- Private methods ---

  _updateWind(dt) {
    const { wind } = this.gameState;
    wind.changeTimer -= dt;

    if (wind.changeTimer <= 0) {
      // Shift direction by -1, 0, or +1
      const dirShift = Math.floor(Math.random() * 3) - 1;
      wind.direction = ((wind.direction + dirShift) % 8 + 8) % 8;

      // Shift strength by -1, 0, or +1
      const strShift = Math.floor(Math.random() * 3) - 1;
      wind.strength = Math.max(1, Math.min(5, wind.strength + strShift));

      // Next change in 20-40 seconds
      wind.changeTimer = 20 + Math.random() * 20;
    }

    // Wind gust system
    if (!wind.gustCooldown) wind.gustCooldown = 15 + Math.random() * 20;
    if (!wind.gustActive) {
      wind.gustCooldown -= dt;
      if (wind.gustCooldown <= 0) {
        // Start a gust
        wind.gustActive = true;
        wind.gustTimer = 3 + Math.random() * 2; // 3-5s duration
        wind.preGustDir = wind.direction;
        // Sharp direction shift: 2-4 directions clockwise or counter
        const shift = (2 + Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? 1 : -1);
        wind.gustDir = ((wind.direction + shift) % 8 + 8) % 8;
        wind.direction = wind.gustDir;
        this._pushNotice('A sudden gust! Adjust your heading!', 2.5);
      }
    } else {
      wind.gustTimer -= dt;
      if (wind.gustTimer <= 0) {
        // End gust, revert wind
        wind.gustActive = false;
        wind.direction = wind.preGustDir;
        wind.gustCooldown = 15 + Math.random() * 20;
      }
    }
  }

  _updateShip(dt) {
    const { ship, wind, map } = this.gameState;

    // Calculate angle difference between ship direction and wind
    let diff = Math.abs(ship.direction - wind.direction);
    if (diff > 4) diff = 8 - diff;

    // Speed = multiplier * windStrength * weather modifier
    const weatherFx = this.gameState.weather ? getWeatherEffects(this.gameState.weather) : null;
    const weatherSpeedMult = weatherFx ? weatherFx.speedMult : 1.0;
    const eco = this.gameState.economy;
    const speedBonus = eco ? (eco.speedBonus || 0) : 0;
    const speedMult = 1 + speedBonus;

    // Gust modifier: aligned with gust = +50%, misaligned = -30%
    let gustMult = 1.0;
    if (wind.gustActive && wind.gustDir !== undefined) {
      let gustDiff = Math.abs(ship.direction - wind.gustDir);
      if (gustDiff > 4) gustDiff = 8 - gustDiff;
      gustMult = gustDiff <= 1 ? 1.5 : 0.7;
    }

    // Ocean current modifier
    const current = getCurrentAt(ship.x, ship.y);
    const currentMult = getCurrentSpeedMult(current, ship.direction);

    const speed = SPEED_MULT[diff] * wind.strength * weatherSpeedMult * speedMult * gustMult * currentMult;
    this.gameState.currentSpeed = speed;

    // Accumulate fractional movement
    ship.moveAccum = (ship.moveAccum || 0) + speed * dt;

    // Move in whole-tile steps
    while (ship.moveAccum >= 1.0) {
      ship.moveAccum -= 1.0;

      const nx = ship.x + DIR_DX[ship.direction];
      const ny = ship.y + DIR_DY[ship.direction];

      // Bounds check
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) {
        ship.moveAccum = 0;
        break;
      }

      // Passability check
      const tile = map.tiles[ny * MAP_WIDTH + nx];
      if (TILE_DEFS[tile] && TILE_DEFS[tile].passable) {
        ship.x = nx;
        ship.y = ny;
        if (this.gameState.stats) this.gameState.stats.distanceSailed++;
        this._computeFOV();

        // Check for port tile → harbor approach
        if (tile === TILE.PORT) {
          const port = this._findPort(nx, ny);
          if (port) {
            // Check convoy arrival
            if (this.gameState.convoy && this.gameState.convoy.active) {
              if (checkConvoyArrival(this.gameState.convoy, port.name)) {
                this._pushNotice(`Convoy delivered safely to ${port.name}!`, 5.0);
                // Quest resolution happens in port mode via resolvePortArrivalQuests
              }
            }
            // Check plague closure
            if (this.gameState.events && isPortClosed(this.gameState.events, port.name)) {
              this._pushNotice(`${port.name} is under plague quarantine!`, 4.0);
              ship.x -= DIR_DX[ship.direction];
              ship.y -= DIR_DY[ship.direction];
              ship.moveAccum = 0;
              break;
            }
            // Check Crown reputation for port access
            if (this.gameState.reputation && !isPortAccessAllowed(this.gameState.reputation, port.name)) {
              this._pushNotice(`The ${port.name} harbor master refuses you entry!`, 4.0);
              // Push ship back
              ship.x -= DIR_DX[ship.direction];
              ship.y -= DIR_DY[ship.direction];
              ship.moveAccum = 0;
              break;
            }
            this.gameState.harbor = createHarborState(this.gameState, port);
            this.stateMachine.transition('HARBOR', this.gameState);
            return;
          }
        }

        // Check for island tile → island exploration
        if (tile === TILE.ISLAND) {
          const island = this._findIsland(nx, ny);
          if (island) {
            this.gameState.islandInfo = island;
            this.stateMachine.transition('ISLAND', this.gameState);
            return;
          }
        }
      } else {
        ship.moveAccum = 0;
        break;
      }
    }
  }

  _computeFOV() {
    const { ship } = this.gameState;

    // Reset visible -> explored
    for (let i = 0; i < this.visibility.length; i++) {
      if (this.visibility[i] === VIS_VISIBLE) {
        this.visibility[i] = VIS_EXPLORED;
      }
    }

    // Dynamic sight range from weather + day/night
    const weatherEffects = this.gameState.weather ? getWeatherEffects(this.gameState.weather) : null;
    const sightRange = getEffectiveSightRange(this.gameState.quests, weatherEffects);

    // Compute new FOV
    this.fov.compute(ship.x, ship.y, sightRange, (x, y, r, visibility) => {
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        this.visibility[y * MAP_WIDTH + x] = VIS_VISIBLE;
      }
    });
  }

  _updateCamera() {
    const { ship } = this.gameState;

    // Center camera on ship
    this.camera.x = Math.floor(ship.x - this.viewW / 2);
    this.camera.y = Math.floor(ship.y - this.viewH / 2);

    // Clamp to map bounds
    this.camera.x = Math.max(0, Math.min(MAP_WIDTH - this.viewW, this.camera.x));
    this.camera.y = Math.max(0, Math.min(MAP_HEIGHT - this.viewH, this.camera.y));
  }

  _renderMap(screen) {
    const { map } = this.gameState;

    // Compute night dim level once per frame
    const quests = this.gameState.quests;
    const quarter = quests ? getQuarter(quests.clockAccum) : 1;
    const dimLevel = getNightDimLevel(quarter);
    const ports = map.ports || [];

    for (let sy = 0; sy < this.viewH; sy++) {
      const my = this.camera.y + sy;
      if (my < 0 || my >= MAP_HEIGHT) continue;

      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < this.viewW; sx++) {
        const mx = this.camera.x + sx;
        if (mx < 0 || mx >= MAP_WIDTH) continue;
        if (sx >= row.length) continue;

        const idx = my * MAP_WIDTH + mx;
        const vis = this.visibility[idx];

        let ch, attr;

        if (vis === VIS_UNEXPLORED) {
          ch = FOG_UNEXPLORED_CHAR;
          attr = FOG_UNEXPLORED_ATTR;
        } else if (vis === VIS_EXPLORED) {
          const tileType = map.tiles[idx];
          ch = getTileChar(tileType, mx, my, 0); // no animation for explored
          attr = FOG_EXPLORED_ATTR;
        } else {
          // VIS_VISIBLE — full color
          const tileType = map.tiles[idx];
          const def = TILE_DEFS[tileType];
          ch = getTileChar(tileType, mx, my, this.animFrame);
          attr = def ? def.attr : 0;

          // Apply night dimming (skip tiles in lantern glow near ports)
          if (dimLevel > 0 && !isInLanternGlow(mx, my, ports)) {
            const fg = (attr >> 9) & 0x1FF;
            const bg = attr & 0x1FF;
            attr = (dimColor(fg, dimLevel) << 9) | dimColor(bg, dimLevel);
          }
        }

        // Write directly to blessed's screen buffer
        row[sx][0] = attr;
        row[sx][1] = ch;
      }
    }

    // Mark lines dirty so blessed knows to redraw them
    for (let sy = 0; sy < this.viewH; sy++) {
      const line = screen.lines[sy];
      if (line) line.dirty = true;
    }
  }

  _renderLabels(screen) {
    const { map } = this.gameState;
    if (!map.ports) return;

    for (const port of map.ports) {
      // Check if port is in view and visible
      const sx = port.actualX - this.camera.x;
      const sy = port.actualY - this.camera.y;

      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const vis = this.visibility[port.actualY * MAP_WIDTH + port.actualX];
      if (vis !== VIS_VISIBLE) continue;

      // Write port name label above the port marker (if room)
      const labelY = sy - 1;
      if (labelY >= 0 && labelY < this.viewH) {
        const label = port.name;
        const labelX = Math.max(0, sx - Math.floor(label.length / 2));
        const row = screen.lines[labelY];
        if (row) {
          const labelAttr = sattr(178, 17); // amber on navy
          for (let i = 0; i < label.length && (labelX + i) < this.viewW; i++) {
            if (row[labelX + i]) {
              row[labelX + i][0] = labelAttr;
              row[labelX + i][1] = label[i];
            }
          }
        }
      }
    }

    // Island labels
    if (!map.islands) return;
    for (const island of map.islands) {
      const sx = island.actualX - this.camera.x;
      const sy = island.actualY - this.camera.y;

      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const vis = this.visibility[island.actualY * MAP_WIDTH + island.actualX];
      if (vis !== VIS_VISIBLE) continue;

      const labelY = sy - 1;
      if (labelY >= 0 && labelY < this.viewH) {
        const label = island.name;
        const labelX = Math.max(0, sx - Math.floor(label.length / 2));
        const row = screen.lines[labelY];
        if (row) {
          // Gold label if player has a treasure map for this island, else green
          let labelAttr = sattr(34, 17); // green on navy
          if (this.gameState.treasureMaps) {
            for (const tm of this.gameState.treasureMaps) {
              if (tm.islandId === island.id && !tm.found) {
                labelAttr = sattr(226, 17); // gold on navy
                break;
              }
            }
          }
          for (let i = 0; i < label.length && (labelX + i) < this.viewW; i++) {
            if (row[labelX + i]) {
              row[labelX + i][0] = labelAttr;
              row[labelX + i][1] = label[i];
            }
          }
        }
      }
    }
  }

  _findPort(x, y) {
    const ports = this.gameState.map.ports;
    if (!ports) return null;
    for (const port of ports) {
      if (port.actualX === x && port.actualY === y) return port;
    }
    return null;
  }

  _findIsland(x, y) {
    const islands = this.gameState.map.islands;
    if (!islands) return null;
    for (const island of islands) {
      if (island.actualX === x && island.actualY === y) return island;
    }
    return null;
  }

  _findPortByName(name) {
    const ports = this.gameState.map.ports;
    if (!ports) return null;
    for (const port of ports) {
      if (port.name === name) return port;
    }
    return null;
  }

  _findNearestPort() {
    const ports = this.gameState.map.ports;
    if (!ports || !ports.length) return null;
    const { x, y } = this.gameState.ship;
    let best = null;
    let bestDist = Infinity;
    for (const port of ports) {
      const dx = port.actualX - x;
      const dy = port.actualY - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = port;
      }
    }
    return best;
  }

  _renderNPCShips(screen) {
    const ships = this.gameState.npcShips;
    if (!ships) return;

    // In fog, hide NPCs beyond fog visibility range
    const isFoggy = this.gameState.weather && this.gameState.weather.type === 'fog';
    const playerX = this.gameState.ship.x;
    const playerY = this.gameState.ship.y;

    for (const npc of ships) {
      const sx = npc.x - this.camera.x;
      const sy = npc.y - this.camera.y;

      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      // Only render if tile is visible
      const vis = this.visibility[npc.y * MAP_WIDTH + npc.x];
      if (vis !== VIS_VISIBLE) continue;

      // Fog hides ships beyond close range
      if (isFoggy) {
        const dx = npc.x - playerX;
        const dy = npc.y - playerY;
        if (dx * dx + dy * dy > FOG_HIDE_RANGE * FOG_HIDE_RANGE) continue;
      }

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;

      const fColor = FACTION_COLORS[npc.faction] || 255;
      row[sx][0] = sattr(fColor, 17);
      row[sx][1] = DIR_CHARS[npc.direction];
    }
  }

  _renderWeatherOverlay(screen) {
    const weather = this.gameState.weather;
    if (!weather || weather.type === 'clear') return;

    const frame = this.animFrame;

    if (weather.type === 'fog') {
      // Dim all visible tiles slightly for fog effect
      for (let sy = 0; sy < this.viewH; sy++) {
        const row = screen.lines[sy];
        if (!row) continue;
        for (let sx = 0; sx < this.viewW; sx++) {
          if (sx >= row.length) continue;
          // Scatter fog particles
          if (((sx + sy * 7 + frame * 3) % 11) === 0) {
            const fogCh = FOG_CHARS[(sx + sy) % FOG_CHARS.length];
            row[sx][0] = sattr(245, 17);
            row[sx][1] = fogCh;
          }
        }
      }
    } else if (weather.type === 'rain') {
      // Scatter rain particles
      for (let sy = 0; sy < this.viewH; sy++) {
        const row = screen.lines[sy];
        if (!row) continue;
        for (let sx = 0; sx < this.viewW; sx++) {
          if (sx >= row.length) continue;
          if (((sx * 3 + sy * 5 + frame * 7) % 13) === 0) {
            const rainCh = RAIN_CHARS[(sx + frame) % RAIN_CHARS.length];
            row[sx][0] = sattr(39, 17);
            row[sx][1] = rainCh;
          }
        }
      }
    } else if (weather.type === 'storm') {
      // Rain particles (denser)
      for (let sy = 0; sy < this.viewH; sy++) {
        const row = screen.lines[sy];
        if (!row) continue;
        for (let sx = 0; sx < this.viewW; sx++) {
          if (sx >= row.length) continue;
          if (((sx * 3 + sy * 5 + frame * 7) % 7) === 0) {
            const rainCh = RAIN_CHARS[(sx + frame) % RAIN_CHARS.length];
            row[sx][0] = sattr(33, 17);
            row[sx][1] = rainCh;
          }
        }
      }
      // Lightning flash: occasional frame
      if (frame === 0 && Math.random() < 0.3) {
        const lx = Math.floor(Math.random() * this.viewW);
        const ly = Math.floor(Math.random() * Math.floor(this.viewH / 2));
        const row = screen.lines[ly];
        if (row && lx < row.length) {
          row[lx][0] = sattr(226, 17);
          row[lx][1] = '*';
        }
      }
    }
  }

  _renderShip(screen) {
    const { ship } = this.gameState;

    const sx = ship.x - this.camera.x;
    const sy = ship.y - this.camera.y;

    if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) return;

    const row = screen.lines[sy];
    if (!row || sx >= row.length) return;

    row[sx][0] = SHIP_ATTR;
    row[sx][1] = DIR_CHARS[ship.direction];
    if (screen.lines[sy]) screen.lines[sy].dirty = true;
  }

  _renderEventBanners(screen) {
    const events = this.gameState.events;
    if (!events || !events.notifications || events.notifications.length === 0) return;

    // Show up to 2 banners at top of screen
    const maxBanners = Math.min(2, events.notifications.length);
    for (let i = 0; i < maxBanners; i++) {
      const notif = events.notifications[i];
      const row = screen.lines[i];
      if (!row) continue;

      // Fade from amber (178) to dim grey based on timer ratio
      const fade = Math.max(0, Math.min(1, notif.timer / 5.0));
      const colorIdx = fade > 0.5 ? 178 : (fade > 0.2 ? 136 : 240);
      const attr = sattr(colorIdx, 233);

      const text = notif.text;
      const startX = Math.max(0, Math.floor((this.viewW - text.length) / 2));
      for (let c = 0; c < text.length; c++) {
        const x = startX + c;
        if (x >= 0 && x < row.length) {
          row[x][0] = attr;
          row[x][1] = text[c];
        }
      }
      row.dirty = true;
    }
  }

  _pushNotice(message, duration) {
    if (this.moraleMessageTimer > 0) {
      if (!this.gameState.noticeQueue) {
        this.gameState.noticeQueue = [];
      }
      this.gameState.noticeQueue.push({ message, duration: duration || 3.0 });
    } else {
      this.moraleMessage = message || '';
      this.moraleMessageTimer = Math.max(0.1, duration || 3.0);
    }
  }

  _renderAchievementToast(screen) {
    const toasts = this.gameState.achievementToasts;
    if (!toasts || toasts.length === 0) return;

    const toast = toasts[0];
    const text = ` ${toast.icon} ${toast.title} `;
    const w = text.length + 2;
    const sx = screen.width - w - 1;
    const sy = 1;

    const bgAttr = sattr(233, 178); // dark on gold
    const textAttr = sattr(233, 178);

    for (let x = sx; x < sx + w && x < screen.width; x++) {
      const row = screen.lines[sy];
      if (row && x >= 0 && x < row.length) {
        row[x][0] = bgAttr;
        row[x][1] = ' ';
      }
    }

    const row = screen.lines[sy];
    if (row) {
      for (let i = 0; i < text.length; i++) {
        const x = sx + 1 + i;
        if (x >= 0 && x < row.length) {
          row[x][0] = textAttr;
          row[x][1] = text[i];
        }
      }
      row.dirty = true;
    }
  }

  _renderHelmsmanBar(screen) {
    const text = ` ${getHelmsmanHUDText(this.gameState.helmsman)}  [N to cancel] `;
    const startX = Math.max(0, Math.floor((this.viewW - text.length) / 2));
    const sy = 0;
    const row = screen.lines[sy];
    if (!row) return;
    const attr = sattr(233, 178); // dark on gold
    for (let i = 0; i < text.length; i++) {
      const x = startX + i;
      if (x >= 0 && x < row.length) {
        row[x][0] = attr;
        row[x][1] = text[i];
      }
    }
    row.dirty = true;
  }

  _applySeaObjectEffects(effects, gameState) {
    if (!effects) return;
    if (effects.gold && gameState.economy) {
      gameState.economy.gold += effects.gold;
    }
    if (effects.cargo && gameState.economy) {
      for (const [good, qty] of Object.entries(effects.cargo)) {
        gameState.economy.cargo[good] = (gameState.economy.cargo[good] || 0) + qty;
      }
    }
    if (effects.hull) {
      gameState.ship.hull = Math.max(1, gameState.ship.hull + effects.hull);
    }
    if (effects.spawnHostile && gameState.npcShips && gameState.map) {
      // Spawn a pirate nearby
      const { FACTION: F } = require('../world/npc-ships');
      const pirate = {
        id: Math.random().toString(36).slice(2, 8),
        name: 'Ambush Pirate',
        faction: F.PIRATE,
        x: gameState.ship.x + (Math.random() < 0.5 ? 3 : -3),
        y: gameState.ship.y + (Math.random() < 0.5 ? 3 : -3),
        hull: 70, maxHull: 70, crew: 40, maxCrew: 40, masts: 2,
        speed: 2.5, aggression: 1.0, moveAccum: 0,
        desperate: false, cargo: {}, gold: 30,
        aiTarget: { x: gameState.ship.x, y: gameState.ship.y },
        aiTimer: 5, direction: 0,
        tradeRoute: null, tradeRouteIdx: 0,
      };
      gameState.npcShips.push(pirate);
    }
  }

  _renderSeaObjects(screen) {
    const state = this.gameState.seaObjects;
    if (!state || !state.objects) return;

    const isFoggy = this.gameState.weather && this.gameState.weather.type === 'fog';
    const playerX = this.gameState.ship.x;
    const playerY = this.gameState.ship.y;

    for (const obj of state.objects) {
      const sx = obj.x - this.camera.x;
      const sy = obj.y - this.camera.y;

      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const vis = this.visibility[obj.y * MAP_WIDTH + obj.x];
      if (vis !== VIS_VISIBLE) continue;

      if (isFoggy) {
        const dx = obj.x - playerX;
        const dy = obj.y - playerY;
        if (dx * dx + dy * dy > FOG_HIDE_RANGE * FOG_HIDE_RANGE) continue;
      }

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;

      const typeDef = SEA_OBJECT_TYPES[obj.type];
      if (typeDef) {
        row[sx][0] = sattr(typeDef.color, 17);
        row[sx][1] = typeDef.char;
      }
    }
  }

  _renderMapOverlay(screen) {
    const { map, ship } = this.gameState;
    const sw = screen.width;
    const sh = screen.height;

    // Dimensions of the map UI (center of screen)
    const mapW = Math.min(sw - 10, 100);
    const mapH = Math.min(sh - 8, 50);
    const px = Math.floor((sw - mapW) / 2);
    const py = Math.floor((sh - mapH) / 2);

    // Clear background for map area
    for (let y = py; y < py + mapH; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = px; x < px + mapW; x++) {
        if (x < row.length) {
          row[x][0] = sattr(232, 232); // dark grey
          row[x][1] = ' ';
        }
      }
      row.dirty = true;
    }

    // Border
    const borderAttr = sattr(94, 232);
    const drawLine = (y, x1, x2, ch) => {
      const row = screen.lines[y];
      if (!row) return;
      for (let x = x1; x <= x2; x++) {
        if (x < row.length) {
          row[x][0] = borderAttr;
          row[x][1] = ch;
        }
      }
    };

    drawLine(py, px, px + mapW - 1, '\u2500');
    drawLine(py + mapH - 1, px, px + mapW - 1, '\u2500');
    for (let y = py + 1; y < py + mapH - 1; y++) {
      const row = screen.lines[y];
      if (row) {
        if (px < row.length) { row[px][0] = borderAttr; row[px][1] = '\u2502'; }
        if (px + mapW - 1 < row.length) { row[px + mapW - 1][0] = borderAttr; row[px + mapW - 1][1] = '\u2502'; }
      }
    }

    // Title
    const title = ' WORLD MAP ';
    const tx = px + Math.floor((mapW - title.length) / 2);
    for (let i = 0; i < title.length; i++) {
      const row = screen.lines[py];
      if (row && tx + i < row.length) {
        row[tx + i][0] = sattr(178, 232);
        row[tx + i][1] = title[i];
      }
    }

    // Scaling
    const scaleX = map.width / (mapW - 2);
    const scaleY = map.height / (mapH - 2);

    for (let my = 0; my < mapH - 2; my++) {
      const row = screen.lines[py + 1 + my];
      if (!row) continue;
      for (let mx = 0; mx < mapW - 2; mx++) {
        const mapX = Math.floor(mx * scaleX);
        const mapY = Math.floor(my * scaleY);
        if (mapX >= map.width || mapY >= map.height) continue;

        const idx = mapY * map.width + mapX;
        const vis = this.visibility[idx];
        const tile = map.tiles[idx];
        const def = TILE_DEFS[tile];

        let attr = 0;
        let ch = ' ';

        if (vis === VIS_UNEXPLORED) {
          attr = sattr(232, 232);
          ch = ' ';
        } else {
          attr = def ? def.attr : 0;
          ch = getTileChar(tile, mapX, mapY, 0);

          if (vis === VIS_EXPLORED) {
            // Dim the color for explored but not visible
            const fg = (attr >> 9) & 0x1FF;
            const bg = attr & 0x1FF;
            attr = (dimColor(fg, 1) << 9) | dimColor(bg, 1);
          }
        }

        // Show player position as blinking or distinct char
        const playerMatch = Math.abs(mapX - ship.x) < scaleX && Math.abs(mapY - ship.y) < scaleY;
        if (playerMatch) {
          attr = sattr(208, 232); // amber
          ch = '@';
        }

        const sx = px + 1 + mx;
        if (sx < row.length) {
          row[sx][0] = attr;
          row[sx][1] = ch;
        }
      }
    }
  }
}

module.exports = { OverworldMode };
