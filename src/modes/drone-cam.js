'use strict';

const { sattr } = require('../render/tiles');
const { trajectoryAt, flightTime } = require('../combat/trajectory');
const { getShipScale, getShipArt, HULL_COLOR, SAIL_COLOR, WATER_COLOR } = require('../combat/ship-art');
const { explosionFrame, splashFrame, renderParticles } = require('../combat/effects');
const { calculatePlayerDamage, applyDamageToEnemy, enemyFire, checkCombatEnd } = require('../combat/combat-state');
const { removeNPCShip } = require('../world/npc-ships');
const { recordShipDefeat } = require('../world/quests');
const { onVictory, onLoss } = require('../crew/crew');
const { applyAction, getDefeatAction } = require('../world/factions');
const { createTreasureMap } = require('../island/treasure');
const { syncFromGameState } = require('../fleet/fleet');
const { getDifficulty } = require('../meta/legacy');
const { logEvent } = require('../meta/captains-log');
const { triggerBell } = require('../render/crt-filter');

// Sub-phases within drone cam
const PHASE_FLIGHT = 0;
const PHASE_IMPACT = 1;
const PHASE_ENEMY_FIRE = 2;
const PHASE_RESULT = 3;

// Sky gradient (top to horizon): near-black to dark blue
const SKY_COLORS = [232, 232, 233, 233, 234, 234, 235];

// Ocean depth colors
const OCEAN_FAR_BG = 17;   // dark navy
const OCEAN_NEAR_BG = 31;  // lighter blue
const OCEAN_FAR_FG = 19;
const OCEAN_NEAR_FG = 39;

class DroneCamMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.time = 0;
    this.phase = PHASE_FLIGHT;
    this.totalFlightTime = 0;
    this.impactTimer = 0;
    this.enemyFireTimer = 0;
    this.resultTimer = 0;
    this.shotResult = null;
    this.enemyShotResult = null;
    this.smokePuffs = [];
    this.lastSmokeTime = 0;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.time = 0;
    this.phase = PHASE_FLIGHT;
    this.totalFlightTime = flightTime(gameState.combat.power);
    this.impactTimer = 0;
    this.enemyFireTimer = 0;
    this.resultTimer = 0;
    this.shotResult = null;
    this.enemyShotResult = null;
    this.smokePuffs = [];
    this.lastSmokeTime = 0;
    this.lootSummary = null;   // plunder shown on the victory screen
    this._skip = false;        // player tapped to skip a non-interactive pause
    this._pendingBell = null;  // 'hit' | 'victory' — rung on next render
  }

  exit() {}

  update(dt) {
    this.time += dt;

    if (this.phase === PHASE_FLIGHT) {
      // Spawn smoke puffs
      if (this.time - this.lastSmokeTime > 0.1 && this.time < this.totalFlightTime) {
        this._spawnSmoke();
        this.lastSmokeTime = this.time;
      }

      // Update smoke puffs (fade and drift)
      for (const puff of this.smokePuffs) {
        puff.age += dt;
        puff.y += dt * 0.5; // drift down slightly
      }
      // Remove old puffs
      this.smokePuffs = this.smokePuffs.filter(p => p.age < 1.0);

      if (this.time >= this.totalFlightTime) {
        // Calculate shot result
        this.shotResult = calculatePlayerDamage(this.gameState.combat);
        applyDamageToEnemy(this.gameState.combat, this.shotResult);
        this.phase = PHASE_IMPACT;
        this.impactTimer = 0;
        if (this.shotResult.hit) this._pendingBell = 'hit';
      }
    } else if (this.phase === PHASE_IMPACT) {
      this.impactTimer += dt;
      const impactDuration = this.shotResult.hit ? 1.2 : 0.7;
      if (this.impactTimer >= impactDuration || this._skip) {
        this._skip = false;
        // Check if combat ended
        if (checkCombatEnd(this.gameState.combat)) {
          this._toResult();
        } else {
          // Enemy fires
          this.phase = PHASE_ENEMY_FIRE;
          this.enemyFireTimer = 0;
          const dmgMult = getDifficulty(this.gameState).damageTakenMult;
          this.enemyShotResult = enemyFire(this.gameState.combat, dmgMult);
        }
      }
    } else if (this.phase === PHASE_ENEMY_FIRE) {
      this.enemyFireTimer += dt;
      if (this.enemyFireTimer >= 1.3 || this._skip) {
        this._skip = false;
        // Check if combat ended after enemy fire
        if (checkCombatEnd(this.gameState.combat)) {
          this._toResult();
        } else {
          // Next round — clear the perfect-shot flag so the next shot earns its own.
          this.gameState.combat.round++;
          this.gameState.combat.powerPerfect = false;
          this.stateMachine.transition('SPYGLASS', this.gameState);
        }
      }
    } else if (this.phase === PHASE_RESULT) {
      this.resultTimer += dt;
      if (this.resultTimer >= 3.0) {
        this._endCombat();
      }
    }
  }

  // Enter the result screen, resolving and capturing the plunder so the victory
  // screen can actually show what was won (loot was previously applied invisibly
  // after the screen had already gone).
  _toResult() {
    this.phase = PHASE_RESULT;
    this.resultTimer = 0;
    if (this.gameState.combat.victor === 'player') {
      this.lootSummary = this._resolveSpoils();
      this._pendingBell = 'victory';
    }
  }

  _resolveSpoils() {
    const combat = this.gameState.combat;
    const gs = this.gameState;
    const summary = { gold: 0, cargo: {}, treasureMap: null };
    if (combat._spoilsDone || !combat.npcId || !gs.economy) return summary;
    combat._spoilsDone = true;

    const goldMult = getDifficulty(gs).goldMult;
    const lootGold = Math.round((45 + Math.floor(Math.random() * 45)) * goldMult);
    gs.economy.gold += lootGold;
    summary.gold = lootGold;

    if (gs.stats) {
      gs.stats.shipsSunk++;
      gs.stats.goldEarned += lootGold;
    }
    logEvent(gs.captainsLog, 'combat_win', { name: combat.enemy.name });

    const isMerchant = combat.npcFaction === 'merchant';
    const cargoChance = isMerchant ? 0.7 : 0.3;
    const goodIds = ['cod', 'herring', 'grain', 'timber', 'iron', 'gunpowder', 'silk', 'spices'];
    for (const gid of goodIds) {
      if (Math.random() < cargoChance) {
        const qty = isMerchant ? 1 + Math.floor(Math.random() * 3) : 1;
        gs.economy.cargo[gid] = (gs.economy.cargo[gid] || 0) + qty;
        summary.cargo[gid] = (summary.cargo[gid] || 0) + qty;
      }
    }

    if (Math.random() < 0.15 && gs.treasureMaps && gs.map && gs.map.islands) {
      const unmapped = gs.map.islands.filter(isl =>
        !gs.treasureMaps.some(tm => tm.islandId === isl.id && !tm.found));
      if (unmapped.length > 0) {
        const target = unmapped[Math.floor(Math.random() * unmapped.length)];
        gs.treasureMaps.push(createTreasureMap(target.id, target.name));
        summary.treasureMap = target.name;
      }
    }
    return summary;
  }

  render(screen) {
    const w = screen.width;
    const h = screen.height;
    const combat = this.gameState.combat;

    // Percussive audio juice: ring the terminal bell on a hit and on victory.
    if (this._pendingBell) {
      triggerBell(screen);
      this._pendingBell = null;
    }

    if (this.phase === PHASE_FLIGHT) {
      this._renderFlightScene(screen, w, h, combat);
    } else if (this.phase === PHASE_IMPACT) {
      this._renderImpactScene(screen, w, h, combat);
    } else if (this.phase === PHASE_ENEMY_FIRE) {
      this._renderEnemyFireScene(screen, w, h, combat);
    } else if (this.phase === PHASE_RESULT) {
      this._renderResultScene(screen, w, h, combat);
    }
  }

  _renderFlightScene(screen, w, h, combat) {
    const progress = Math.min(this.time / this.totalFlightTime, 1.0);
    const traj = trajectoryAt(this.time, combat.power, combat.wind);

    // Horizon position (moves with ball arc)
    const baseHorizon = Math.floor(h * 0.4);
    const horizonY = Math.max(3, Math.min(h - 10, baseHorizon - Math.floor(traj.y * 3)));

    // Render sky
    this._renderSky(screen, w, horizonY);

    // Render ocean
    this._renderOcean(screen, w, h, horizonY, traj.z);

    // Render target ship at horizon
    const scaleIdx = getShipScale(progress);
    const ship = getShipArt(scaleIdx);
    const aimDriftX = -combat.aim.offsetX * (1 - progress); // ship drifts to correct position
    const shipCX = Math.floor(w / 2 + aimDriftX);
    const shipY = horizonY - ship.height;
    this._renderShipArt(screen, ship, shipCX, shipY, w, h);

    // Render cannonball
    if (this.time < this.totalFlightTime) {
      // Ball position on screen: starts at bottom-center, arc toward horizon
      const ballScreenX = Math.floor(w / 2 + traj.x * 0.5);
      const ballScreenY = Math.floor(h - 3 - (traj.y * 3));
      const ballY = Math.max(1, Math.min(h - 2, ballScreenY));

      if (ballScreenX >= 0 && ballScreenX < w) {
        const row = screen.lines[ballY];
        if (row && ballScreenX < row.length) {
          row[ballScreenX][0] = sattr(240, row[ballScreenX][0] & 0x1FF); // keep bg
          row[ballScreenX][1] = '\u25CF'; // ●
        }
      }

      // Smoke trail
      this._renderSmoke(screen, w, h);
    }

    // Mark all dirty
    for (let sy = 0; sy < h; sy++) {
      if (screen.lines[sy]) screen.lines[sy].dirty = true;
    }
  }

  _renderSky(screen, w, horizonY) {
    for (let sy = 0; sy < horizonY && sy < screen.height; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;

      const gradIdx = Math.floor((sy / Math.max(1, horizonY)) * SKY_COLORS.length);
      const skyColor = SKY_COLORS[Math.min(gradIdx, SKY_COLORS.length - 1)];
      const attr = sattr(skyColor, skyColor);

      for (let sx = 0; sx < w && sx < row.length; sx++) {
        row[sx][0] = attr;
        row[sx][1] = ' ';
      }
    }
  }

  _renderOcean(screen, w, h, horizonY, ballZ) {
    const waveChars = ['~', '\u2248', '\u223C', '.', ' ']; // ~ ≈ ∼ . space

    for (let sy = horizonY; sy < h; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;

      const depthRaw = sy - horizonY;
      const maxDepth = h - horizonY;
      const depthFrac = depthRaw / Math.max(1, maxDepth);

      // Interpolate colors from far (dark) to near (lighter)
      const bg = depthFrac < 0.5 ? OCEAN_FAR_BG : OCEAN_NEAR_BG;
      const fg = depthFrac < 0.5 ? OCEAN_FAR_FG : OCEAN_NEAR_FG;

      const oceanOffset = Math.floor(ballZ * 2.0 + depthRaw * 0.3);
      const windOffset = Math.floor(this.gameState.combat.wind.direction * depthRaw * 0.1);

      for (let sx = 0; sx < w && sx < row.length; sx++) {
        const wIdx = ((sx + oceanOffset + windOffset + Math.floor(this.time * 2)) % waveChars.length + waveChars.length) % waveChars.length;
        // Far rows: denser waves; near rows: sparser
        const sparseThreshold = depthFrac * 3;
        const ch = (sx % Math.max(1, Math.floor(sparseThreshold + 1))) === 0 ? waveChars[wIdx] : ' ';

        row[sx][0] = sattr(fg, bg);
        row[sx][1] = ch;
      }
    }
  }

  _renderShipArt(screen, ship, cx, topY, w, h) {
    for (let ly = 0; ly < ship.height; ly++) {
      const sy = topY + ly;
      if (sy < 0 || sy >= h) continue;
      const row = screen.lines[sy];
      if (!row) continue;

      const line = ship.lines[ly];
      const startX = cx - Math.floor(ship.width / 2);

      for (let lx = 0; lx < line.length; lx++) {
        const sx = startX + lx;
        if (sx < 0 || sx >= w || sx >= row.length) continue;
        const ch = line[lx];
        if (ch === ' ') continue;

        let fg;
        if (ch === '~') {
          fg = WATER_COLOR;
        } else if (ch === '|' || ch === '/' || ch === '\\' || ch === '.') {
          fg = SAIL_COLOR;
        } else {
          fg = HULL_COLOR;
        }

        row[sx][0] = sattr(fg, row[sx][0] & 0x1FF);
        row[sx][1] = ch;
      }
    }
  }

  _spawnSmoke() {
    this.smokePuffs.push({
      relTime: this.time,
      age: 0,
      y: 0,
    });
  }

  _renderSmoke(screen, w, h) {
    const smokeChars = '\u2588\u2593\u2592\u2591.'; // █▓▒░.
    const combat = this.gameState.combat;

    for (const puff of this.smokePuffs) {
      const ageFrac = puff.age / 1.0;
      if (ageFrac >= 1) continue;

      const charIdx = Math.min(Math.floor(ageFrac * smokeChars.length), smokeChars.length - 1);
      // Smoke starts near cannonball's past position
      const pastTraj = trajectoryAt(puff.relTime, combat.power, combat.wind);
      const sx = Math.floor(w / 2 + pastTraj.x * 0.5);
      const sy = Math.floor(h - 3 - (pastTraj.y * 3) + puff.y);

      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const row = screen.lines[sy];
        if (row && sx < row.length) {
          const gray = 240 - Math.floor(ageFrac * 8);
          row[sx][0] = sattr(gray, row[sx][0] & 0x1FF);
          row[sx][1] = smokeChars[charIdx];
        }
      }
    }
  }

  _renderImpactScene(screen, w, h, combat) {
    // Render base ocean scene (frozen at end of flight)
    const traj = trajectoryAt(this.totalFlightTime, combat.power, combat.wind);
    const baseHorizon = Math.floor(h * 0.4);
    const horizonY = Math.max(3, Math.min(h - 10, baseHorizon - Math.floor(traj.y * 3)));

    this._renderSky(screen, w, horizonY);
    this._renderOcean(screen, w, h, horizonY, traj.z);

    // Ship at full scale
    const ship = getShipArt(3); // large
    const shipCX = Math.floor(w / 2);
    const shipY = horizonY - ship.height;
    this._renderShipArt(screen, ship, shipCX, shipY, w, h);

    // Impact effects
    const impactCX = Math.floor(w / 2);
    const impactCY = horizonY - Math.floor(ship.height / 2);

    if (this.shotResult && this.shotResult.hit) {
      const particles = explosionFrame(this.impactTimer, 1.5);
      renderParticles(screen, particles, impactCX, impactCY);
    } else {
      // Splash near the ship
      const splashCX = impactCX + Math.round(combat.aim.offsetX);
      const splashCY = horizonY + 1;
      const particles = splashFrame(this.impactTimer, 1.0);
      renderParticles(screen, particles, splashCX, splashCY);
    }

    // Critical hit banner — reward for nailing the power gauge.
    if (this.shotResult.crit) {
      this._drawCentered(screen, h - 4, '✦ CRITICAL HIT! ✦', sattr(231, 233));
    }

    // Damage readout at bottom
    const dmgText = this.shotResult.hit
      ? `HIT! Hull -${this.shotResult.hullDmg}  Crew -${this.shotResult.crewDmg}${this.shotResult.mastDmg ? '  Mast -' + this.shotResult.mastDmg : ''}`
      : 'MISS! The shot splashes into the sea.';
    this._drawCentered(screen, h - 2, dmgText, this.shotResult.hit ? sattr(226, 233) : sattr(117, 233));

    for (let sy = 0; sy < h; sy++) {
      if (screen.lines[sy]) screen.lines[sy].dirty = true;
    }
  }

  _renderEnemyFireScene(screen, w, h, combat) {
    // Dark scene with text
    const bgAttr = sattr(232, 233);
    for (let sy = 0; sy < h; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;
      for (let sx = 0; sx < w && sx < row.length; sx++) {
        row[sx][0] = bgAttr;
        row[sx][1] = ' ';
      }
      row.dirty = true;
    }

    const enemyName = combat.enemy.name;
    this._drawCentered(screen, Math.floor(h / 2) - 3, `The ${enemyName} returns fire...`, sattr(208, 233));

    if (this.enemyFireTimer > 0.8) {
      // Show result
      if (this.enemyShotResult && this.enemyShotResult.hit) {
        this._drawCentered(screen, Math.floor(h / 2) - 1, 'INCOMING HIT!', sattr(196, 233));
        this._drawCentered(screen, Math.floor(h / 2) + 1,
          `Hull -${this.enemyShotResult.hullDmg}  Crew -${this.enemyShotResult.crewDmg}${this.enemyShotResult.mastDmg ? '  Mast -' + this.enemyShotResult.mastDmg : ''}`,
          sattr(226, 233));
      } else {
        this._drawCentered(screen, Math.floor(h / 2) - 1, 'Their shot misses!', sattr(34, 233));
      }

      // Show current status
      this._drawCentered(screen, Math.floor(h / 2) + 3,
        `Your Hull: ${combat.player.hull}/${combat.player.maxHull}  Crew: ${combat.player.crew}/${combat.player.maxCrew}  Masts: ${combat.player.masts}/${combat.player.maxMasts}`,
        sattr(178, 233));
      this._drawCentered(screen, Math.floor(h / 2) + 4,
        `Enemy Hull: ${combat.enemy.hull}/${combat.enemy.maxHull}  Crew: ${combat.enemy.crew}/${combat.enemy.maxCrew}  Masts: ${combat.enemy.masts}/${combat.enemy.maxMasts}`,
        sattr(167, 233));
    }
  }

  _renderResultScene(screen, w, h, combat) {
    const bgAttr = sattr(232, 233);
    for (let sy = 0; sy < h; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;
      for (let sx = 0; sx < w && sx < row.length; sx++) {
        row[sx][0] = bgAttr;
        row[sx][1] = ' ';
      }
      row.dirty = true;
    }

    const cy = Math.floor(h / 2);

    if (combat.victor === 'player') {
      this._drawCentered(screen, cy - 3, 'V I C T O R Y !', sattr(226, 233));
      this._drawCentered(screen, cy - 1, `The ${combat.enemy.name} has been defeated!`, sattr(178, 233));

      // Show the plunder — the reward the player actually earned.
      const loot = this.lootSummary;
      if (loot) {
        const parts = [];
        if (loot.gold) parts.push(`${loot.gold} rds`);
        const cargoEntries = Object.entries(loot.cargo);
        for (const [g, q] of cargoEntries) parts.push(`${q} ${g}`);
        if (parts.length) {
          this._drawCentered(screen, cy + 1, `Plundered: ${parts.join(', ')}`, sattr(220, 233));
        } else {
          this._drawCentered(screen, cy + 1, 'Plundered: nothing of worth', sattr(244, 233));
        }
        if (loot.treasureMap) {
          this._drawCentered(screen, cy + 2, `A tattered chart to ${loot.treasureMap} falls from the wreck!`, sattr(214, 233));
        }
      }
    } else {
      this._drawCentered(screen, cy - 2, 'D E F E A T', sattr(196, 233));
      this._drawCentered(screen, cy, `The ${combat.enemy.name} has bested you...`, sattr(167, 233));
    }

    this._drawCentered(screen, h - 2, 'Press ENTER to continue', sattr(248, 233));
  }

  _drawCentered(screen, row, text, attr) {
    if (row < 0 || row >= screen.height) return;
    const r = screen.lines[row];
    if (!r) return;
    const startX = Math.floor((screen.width - text.length) / 2);
    for (let i = 0; i < text.length; i++) {
      const sx = startX + i;
      if (sx >= 0 && sx < screen.width && sx < r.length) {
        r[sx][0] = attr;
        r[sx][1] = text[i];
      }
    }
  }

  _endCombat() {
    const combat = this.gameState.combat;
    // Apply combat damage back to main game state
    this.gameState.ship.hull = combat.player.hull;

    // If this was an NPC encounter, remove NPC and award loot on victory
    if (combat.npcId && this.gameState.npcShips) {
      removeNPCShip(this.gameState.npcShips, combat.npcId);

      if (combat.victor === 'player') {
        if (this.gameState.quests && combat.npcFaction) {
          const updates = recordShipDefeat(this.gameState.quests, combat.npcFaction);
          if (updates.length) {
            this.gameState.questNotices = (this.gameState.questNotices || []).concat(updates);
          }
        }

        // Reputation effect for defeating this faction
        if (this.gameState.reputation && combat.npcFaction) {
          const actionId = getDefeatAction(combat.npcFaction);
          if (actionId) {
            applyAction(this.gameState.reputation, actionId);
          }
        }
      }

      // Loot/stats/log/treasure are resolved at the result screen (_resolveSpoils)
      // so the plunder can be displayed. Fall back to resolving here in case the
      // result transition was bypassed.
      if (combat.victor === 'player' && this.gameState.economy && !combat._spoilsDone) {
        this._resolveSpoils();
      }
    }

    // Campaign triggers (shared with boarding/infiltration win paths)
    if (this.gameState.campaign && combat.victor === 'player') {
      const { applyShipVictoryToCampaign } = require('../story/combat-resolution');
      const notices = applyShipVictoryToCampaign(this.gameState, combat.npcFaction);
      if (notices.length) {
        this.gameState.questNotices = (this.gameState.questNotices || []).concat(notices);
      }
    }

    // Crew morale from combat result
    if (this.gameState.crew) {
      if (combat.victor === 'player') {
        onVictory(this.gameState.crew);
      } else if (combat.victor === 'enemy') {
        onLoss(this.gameState.crew);
        logEvent(this.gameState.captainsLog, 'combat_loss', {});
      }
    }

    // Sync hull damage back to fleet
    if (this.gameState.fleet) {
      syncFromGameState(this.gameState.fleet, this.gameState);
    }

    this.gameState.combat = null;

    // If campaign just completed (Act 5 ending set), go to credits + Hall of Fame
    const { finalizeCampaignCompletion } = require('../story/combat-resolution');
    if (finalizeCampaignCompletion(this.gameState)) {
      this.stateMachine.transition('CREDITS', this.gameState);
      return;
    }

    this.stateMachine.transition('OVERWORLD', this.gameState);
  }

  handleInput(key) {
    if (key !== 'enter' && key !== 'space') return;
    // Let the player skip the non-interactive pauses (impact / enemy fire) and
    // the result screen, so combat never feels like watching timers.
    if (this.phase === PHASE_RESULT && this.resultTimer > 0.8) {
      this._endCombat();
    } else if (this.phase === PHASE_IMPACT || this.phase === PHASE_ENEMY_FIRE) {
      this._skip = true;
    }
  }
}

module.exports = { DroneCamMode };
