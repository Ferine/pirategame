'use strict';

const { sattr } = require('../render/tiles');
const { MOVES, MOVE_LIST, ZONE_LIST, resolveRound, enemyAI, checkMeleeEnd, canAffordMove } = require('../combat/melee-state');
const { getStanceArt, getClashFrame, PLAYER_COLOR, ENEMY_COLOR, SWORD_COLOR, ZONE_LABEL } = require('../combat/melee-art');
const { getNpcShipType, createShip } = require('../fleet/ship-types');
const { addShip, MAX_FLEET_SIZE } = require('../fleet/fleet');

// Colors
const BG = sattr(233, 233);
const BORDER = sattr(94, 233);
const TITLE_ATTR = sattr(178, 233);
const TEXT_ATTR = sattr(252, 233);
const SELECTED = sattr(233, 178);
const UNSELECTED = sattr(250, 233);
const DISABLED = sattr(239, 233);
const HP_GOOD = sattr(34, 233);
const HP_WARN = sattr(178, 233);
const HP_BAD = sattr(160, 233);
const STAM_ATTR = sattr(33, 233);
const LOG_ATTR = sattr(248, 233);
const VICTORY_ATTR = sattr(226, 233);
const DEFEAT_ATTR = sattr(160, 233);
const HELP_ATTR = sattr(240, 233);

class MeleeMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.melee = null;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.melee = gameState.melee;
    if (!this.melee) return;
    this.melee.phase = 'choose_move';
    this.melee.cursor = 0;
  }

  exit() {
    this.gameState.melee = null;
  }

  update(dt) {
    if (!this.melee) return;

    if (this.melee.phase === 'animate') {
      this.melee.animTimer += dt;

      if (this.melee.animTimer >= 2.0) {
        // Animation done — check end or return to choose
        if (checkMeleeEnd(this.melee)) {
          this.melee.phase = 'result';
          this.melee.resultTimer = 4.0;
          this._applyResult();
        } else {
          this.melee.phase = 'choose_move';
          this.melee.cursor = 0;
        }
      }
    }

    if (this.melee.phase === 'result') {
      this.melee.resultTimer -= dt;
      if (this.melee.resultTimer <= 0) {
        this._exitCombat();
      }
    }
  }

  render(screen) {
    if (!this.melee) return;

    const sw = screen.width;
    const sh = screen.height;

    // Full screen dark background
    for (let y = 0; y < sh; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < sw && x < row.length; x++) {
        row[x][0] = BG;
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Draw border
    _drawBorder(screen, 0, 0, sw, sh);

    // Title
    const ctxLabel = this.melee.context === 'boarding' ? 'BOARDING COMBAT'
                   : this.melee.context === 'barfight' ? 'BAR FIGHT'
                   : 'DUEL';
    const title = ` ${ctxLabel} - Round ${this.melee.round} `;
    _writeText(screen, 0, Math.floor((sw - title.length) / 2), title, TITLE_ATTR);

    // Fighter area (top portion)
    const fighterY = 2;
    this._renderFighters(screen, fighterY, sw);

    // Zone indicators next to fighters
    this._renderZoneIndicators(screen, fighterY, sw);

    // HP and stamina bars
    const barY = fighterY + 8;
    this._renderBars(screen, barY, sw);

    // Phase-specific content
    const contentY = barY + 3;

    if (this.melee.phase === 'choose_move') {
      this._renderMoveChoice(screen, contentY, sw);
    } else if (this.melee.phase === 'choose_zone') {
      this._renderZoneChoice(screen, contentY, sw);
    } else if (this.melee.phase === 'animate') {
      this._renderAnimation(screen, contentY, sw);
    } else if (this.melee.phase === 'result') {
      this._renderResult(screen, contentY, sw, sh);
    }

    // Combat log at bottom (skip during result and selection — would overlap)
    if (this.melee.phase === 'animate') {
      const logY = sh - 6;
      this._renderLog(screen, logY, sw);
    }

    // Controls help
    const help = this.melee.phase === 'result' ? '' : ' Up/Down: Select   Enter/Space: Confirm ';
    _writeText(screen, sh - 2, Math.floor((sw - help.length) / 2), help, HELP_ATTR);
  }

  handleInput(key) {
    if (!this.melee) return;

    if (this.melee.phase === 'result') {
      if (key === 'enter' || key === 'space' || key === 'q') {
        this._exitCombat();
      }
      return;
    }

    if (this.melee.phase === 'animate') return;

    if (this.melee.phase === 'choose_move') {
      if (key === 'up') {
        this.melee.cursor = Math.max(0, this.melee.cursor - 1);
      } else if (key === 'down') {
        this.melee.cursor = Math.min(MOVE_LIST.length - 1, this.melee.cursor + 1);
      } else if (key === 'enter' || key === 'space') {
        const moveId = MOVE_LIST[this.melee.cursor];
        if (canAffordMove(this.melee, moveId)) {
          this.melee.playerMove = moveId;
          this.melee.phase = 'choose_zone';
          this.melee.cursor = 1; // default to mid
        }
      }
      return;
    }

    if (this.melee.phase === 'choose_zone') {
      if (key === 'up') {
        this.melee.cursor = Math.max(0, this.melee.cursor - 1);
      } else if (key === 'down') {
        this.melee.cursor = Math.min(ZONE_LIST.length - 1, this.melee.cursor + 1);
      } else if (key === 'enter' || key === 'space') {
        this.melee.playerZone = ZONE_LIST[this.melee.cursor];
        // Enemy picks
        enemyAI(this.melee);
        // Resolve
        resolveRound(this.melee);
        // Start animation
        this.melee.phase = 'animate';
        this.melee.animTimer = 0;
      } else if (key === 'q') {
        // Go back to move choice
        this.melee.phase = 'choose_move';
        this.melee.cursor = MOVE_LIST.indexOf(this.melee.playerMove) || 0;
      }
      return;
    }
  }

  // --- Private rendering ---

  _renderFighters(screen, startY, sw) {
    const pZone = this.melee.playerZone || 'mid';
    const eZone = this.melee.enemyZone || 'mid';

    if (this.melee.phase === 'animate') {
      // Show clash animation
      const { lines, attr } = getClashFrame(this.melee.animTimer, this.melee.playerMove, this.melee.enemyMove);
      const cx = Math.floor(sw / 2) - 4;
      for (let i = 0; i < lines.length && (startY + i) < screen.height; i++) {
        _writeText(screen, startY + i, cx, lines[i], attr);
      }
    } else {
      // Show stance
      const leftArt = getStanceArt('left', pZone);
      const rightArt = getStanceArt('right', eZone);
      const leftX = Math.floor(sw / 2) - 14;
      const rightX = Math.floor(sw / 2) + 6;

      for (let i = 0; i < leftArt.length && (startY + i) < screen.height; i++) {
        _writeText(screen, startY + i, leftX, leftArt[i], PLAYER_COLOR);
      }
      for (let i = 0; i < rightArt.length && (startY + i) < screen.height; i++) {
        _writeText(screen, startY + i, rightX, rightArt[i], ENEMY_COLOR);
      }

      // Names above fighters
      const pName = 'You';
      const eName = this.melee.enemy.name;
      _writeText(screen, startY - 1, leftX, pName, PLAYER_COLOR);
      _writeText(screen, startY - 1, rightX, eName.slice(0, 12), ENEMY_COLOR);
    }
  }

  _renderZoneIndicators(screen, startY, sw) {
    if (this.melee.phase === 'animate') return;

    const zones = ['HIGH', 'MID', 'LOW'];
    const zoneY = [startY, startY + 2, startY + 4];
    const cx = Math.floor(sw / 2);

    for (let i = 0; i < 3; i++) {
      _writeText(screen, zoneY[i], cx - 2, zones[i], ZONE_LABEL);
    }
  }

  _renderBars(screen, startY, sw) {
    const m = this.melee;
    const barW = Math.min(20, Math.floor(sw / 4));

    // Player HP
    const pHpRatio = m.player.hp / m.player.maxHp;
    const pHpAttr = pHpRatio > 0.5 ? HP_GOOD : pHpRatio > 0.25 ? HP_WARN : HP_BAD;
    _writeText(screen, startY, 2, `HP: ${m.player.hp}/${m.player.maxHp}`, pHpAttr);
    _renderBar(screen, startY, 2 + 14, barW, pHpRatio, pHpAttr);

    // Player stamina
    const pStamRatio = m.player.stamina / m.player.maxStamina;
    _writeText(screen, startY + 1, 2, `ST: ${m.player.stamina}/${m.player.maxStamina}`, STAM_ATTR);
    _renderBar(screen, startY + 1, 2 + 14, barW, pStamRatio, STAM_ATTR);

    // Enemy HP
    const eHpRatio = m.enemy.hp / m.enemy.maxHp;
    const eHpAttr = eHpRatio > 0.5 ? HP_GOOD : eHpRatio > 0.25 ? HP_WARN : HP_BAD;
    const rightX = sw - barW - 16;
    _writeText(screen, startY, rightX, `HP: ${m.enemy.hp}/${m.enemy.maxHp}`, eHpAttr);
    _renderBar(screen, startY, rightX + 14, barW, eHpRatio, eHpAttr);

    // Enemy stamina
    const eStamRatio = m.enemy.stamina / m.enemy.maxStamina;
    _writeText(screen, startY + 1, rightX, `ST: ${m.enemy.stamina}/${m.enemy.maxStamina}`, STAM_ATTR);
    _renderBar(screen, startY + 1, rightX + 14, barW, eStamRatio, STAM_ATTR);
  }

  _renderMoveChoice(screen, startY, sw) {
    _writeText(screen, startY, 4, 'Choose your move:', TITLE_ATTR);

    for (let i = 0; i < MOVE_LIST.length; i++) {
      const moveId = MOVE_LIST[i];
      const moveDef = MOVES[moveId];
      const isSel = i === this.melee.cursor;
      const affordable = canAffordMove(this.melee, moveId);
      const attr = !affordable ? DISABLED : isSel ? SELECTED : UNSELECTED;

      if (isSel && affordable) {
        _highlightRow(screen, startY + 2 + i, 3, Math.min(50, sw - 6), SELECTED);
      }

      const ptr = isSel ? '\u25B6 ' : '  ';
      const dmgStr = moveDef.dmg[0] > 0 ? `${moveDef.dmg[0]}-${moveDef.dmg[1]} dmg` :
                     moveDef.riposte ? `${moveDef.riposteDmg[0]}-${moveDef.riposteDmg[1]} riposte` :
                     'no damage';
      const label = `${ptr}${moveDef.label}  (${moveDef.stam} stam, ${dmgStr})`;
      _writeText(screen, startY + 2 + i, 4, label, attr);
    }
  }

  _renderZoneChoice(screen, startY, sw) {
    const moveDef = MOVES[this.melee.playerMove];
    _writeText(screen, startY, 4, `${moveDef.label} - Choose zone:`, TITLE_ATTR);

    const labels = ['High', 'Mid', 'Low'];
    for (let i = 0; i < ZONE_LIST.length; i++) {
      const isSel = i === this.melee.cursor;
      const attr = isSel ? SELECTED : UNSELECTED;

      if (isSel) {
        _highlightRow(screen, startY + 2 + i, 3, Math.min(30, sw - 6), SELECTED);
      }

      const ptr = isSel ? '\u25B6 ' : '  ';
      _writeText(screen, startY + 2 + i, 4, `${ptr}${labels[i]}`, attr);
    }

    _writeText(screen, startY + 6, 4, 'Q: Back to move selection', HELP_ATTR);
  }

  _renderAnimation(screen, startY, sw) {
    // Show action summary during animation
    const pm = MOVES[this.melee.playerMove];
    const em = MOVES[this.melee.enemyMove];
    const pz = this.melee.playerZone;
    const ez = this.melee.enemyZone;

    if (this.melee.animTimer >= 0.5) {
      _writeText(screen, startY, 4, `You: ${pm.label} ${pz}`, PLAYER_COLOR);
      _writeText(screen, startY + 1, 4, `${this.melee.enemy.name}: ${em.label} ${ez}`, ENEMY_COLOR);
    } else {
      _writeText(screen, startY, 4, 'Steel clashes...', SWORD_COLOR);
    }
  }

  _renderResult(screen, contentY, sw, sh) {
    const isVictory = this.melee.victor === 'player';
    const panelW = Math.min(44, sw - 4);
    const panelH = Math.min(10, sh - contentY - 2);
    const px = Math.floor((sw - panelW) / 2);
    const py = contentY;

    // Clear panel
    for (let y = py; y < py + panelH && y < sh; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = px; x < px + panelW && x < row.length; x++) {
        row[x][0] = BG;
        row[x][1] = ' ';
      }
    }

    _drawBorder(screen, px, py, panelW, panelH);

    if (isVictory) {
      const vtitle = ' VICTORY! ';
      _writeText(screen, py, px + Math.floor((panelW - vtitle.length) / 2), vtitle, VICTORY_ATTR);

      if (this.melee.context === 'boarding' && this.melee.loot) {
        _writeText(screen, py + 2, px + 3, `Plundered: ${this.melee.loot.gold} rigsdaler`, TITLE_ATTR);
        if (this.melee.loot.cargo) {
          _writeText(screen, py + 3, px + 3, `Cargo: ${this.melee.loot.cargoQty} ${this.melee.loot.cargo}`, TEXT_ATTR);
        }
        if (this.melee.loot.capturedShip) {
          _writeText(screen, py + 4, px + 3, `Ship captured: ${this.melee.loot.capturedShip}!`, VICTORY_ATTR);
        }
      } else if (this.melee.context === 'barfight') {
        _writeText(screen, py + 2, px + 3, 'You win the brawl!', TEXT_ATTR);
        _writeText(screen, py + 3, px + 3, '+30 gold, crew morale up', TITLE_ATTR);
      } else {
        _writeText(screen, py + 2, px + 3, 'Your rival falls!', TEXT_ATTR);
      }
    } else {
      const dtitle = ' DEFEATED ';
      _writeText(screen, py, px + Math.floor((panelW - dtitle.length) / 2), dtitle, DEFEAT_ATTR);

      if (this.melee.context === 'boarding') {
        _writeText(screen, py + 2, px + 3, 'Boarding repelled! Hull -30', DEFEAT_ATTR);
      } else if (this.melee.context === 'barfight') {
        _writeText(screen, py + 2, px + 3, 'Knocked out cold.', TEXT_ATTR);
        _writeText(screen, py + 3, px + 3, '-20 gold, crew morale down', DEFEAT_ATTR);
      } else {
        _writeText(screen, py + 2, px + 3, 'Your rival bests you! Hull -30', DEFEAT_ATTR);
      }
    }

    _writeText(screen, py + panelH - 2, px + Math.floor((panelW - 18) / 2), ' Enter: Continue ', HELP_ATTR);
  }

  _renderLog(screen, startY, sw) {
    _writeText(screen, startY, 2, 'Combat Log:', TITLE_ATTR);
    for (let i = 0; i < this.melee.log.length && i < 4; i++) {
      _writeText(screen, startY + 1 + i, 3, this.melee.log[i].slice(0, sw - 6), LOG_ATTR);
    }
  }

  // --- Result handling ---

  _applyResult() {
    const m = this.melee;
    const gs = this.gameState;

    if (m.victor === 'player') {
      if (m.context === 'boarding') {
        // Extra loot
        const gold = 50 + Math.floor(Math.random() * 100);
        const cargoTypes = ['cod', 'herring', 'grain', 'timber', 'iron', 'silk'];
        const cargo = cargoTypes[Math.floor(Math.random() * cargoTypes.length)];
        const cargoQty = 2 + Math.floor(Math.random() * 4);
        m.loot = { gold, cargo, cargoQty, capturedShip: null };

        if (gs.economy) {
          gs.economy.gold += gold;
          gs.economy.cargo[cargo] = (gs.economy.cargo[cargo] || 0) + cargoQty;
        }

        // 50% chance to capture the boarded ship
        if (gs.fleet && Math.random() < 0.5 && gs.fleet.ships.length < MAX_FLEET_SIZE) {
          // Look up the NPC we boarded (encounter is already null, use boardingNpcId)
          let npc = null;
          if (gs.boardingNpcId && gs.npcShips) {
            npc = gs.npcShips.find(s => s.id === gs.boardingNpcId) || null;
          }
          const faction = npc ? npc.faction : 'pirate';
          const typeId = getNpcShipType(faction);
          const shipName = npc ? npc.name : 'Captured Ship';
          const captured = createShip(typeId, shipName);
          if (captured) {
            // Captured at 30% hull
            captured.hull = Math.floor(captured.maxHull * 0.3);
            if (addShip(gs.fleet, captured)) {
              m.loot.capturedShip = captured.name;
            }
          }
        }

        // Victory morale
        if (gs.crew) {
          const { onVictory } = require('../crew/crew');
          onVictory(gs.crew);
        }
      } else if (m.context === 'barfight') {
        if (gs.economy) gs.economy.gold += 30;
        if (gs.crew) {
          for (const mem of gs.crew.members) {
            mem.morale = Math.min(10, mem.morale + 2);
          }
          const { calcAvgMorale } = require('../crew/crew');
          calcAvgMorale(gs.crew);
        }
      } else if (m.context === 'stealth_fight') {
        gs.meleeResult = { context: 'stealth_fight', victor: 'player' };
      } else if (m.context === 'duel') {
        // Rival dies — mark in gameState
        gs.meleeResult = { context: 'duel', victor: 'player' };
      }
    } else {
      // Player lost
      if (m.context === 'boarding') {
        gs.ship.hull = Math.max(1, gs.ship.hull - 30);
        if (gs.crew) {
          const { onLoss } = require('../crew/crew');
          onLoss(gs.crew);
        }
      } else if (m.context === 'barfight') {
        if (gs.economy) gs.economy.gold = Math.max(0, gs.economy.gold - 20);
        if (gs.crew) {
          for (const mem of gs.crew.members) {
            mem.morale = Math.max(1, mem.morale - 1);
          }
          const { calcAvgMorale } = require('../crew/crew');
          calcAvgMorale(gs.crew);
        }
      } else if (m.context === 'stealth_fight') {
        gs.meleeResult = { context: 'stealth_fight', victor: 'enemy' };
      } else if (m.context === 'duel') {
        gs.ship.hull = Math.max(1, gs.ship.hull - 30);
        gs.meleeResult = { context: 'duel', victor: 'enemy' };
      }
    }
  }

  _exitCombat() {
    const returnMode = this.melee.returnMode;

    // Remove NPC ship if boarding
    if (this.melee.context === 'boarding' && this.melee.victor === 'player') {
      const { removeNPCShip } = require('../world/npc-ships');
      if (this.gameState.npcShips && this.gameState.boardingNpcId) {
        removeNPCShip(this.gameState.npcShips, this.gameState.boardingNpcId);
        this.gameState.boardingNpcId = null;
      }
    }

    this.stateMachine.transition(returnMode, this.gameState);
  }
}

// --- Drawing helpers ---

function _drawBorder(screen, px, py, w, h) {
  _writeChar(screen, py, px, '\u250C', BORDER);
  for (let x = px + 1; x < px + w - 1; x++) _writeChar(screen, py, x, '\u2500', BORDER);
  _writeChar(screen, py, px + w - 1, '\u2510', BORDER);
  _writeChar(screen, py + h - 1, px, '\u2514', BORDER);
  for (let x = px + 1; x < px + w - 1; x++) _writeChar(screen, py + h - 1, x, '\u2500', BORDER);
  _writeChar(screen, py + h - 1, px + w - 1, '\u2518', BORDER);
  for (let y = py + 1; y < py + h - 1; y++) {
    _writeChar(screen, y, px, '\u2502', BORDER);
    _writeChar(screen, y, px + w - 1, '\u2502', BORDER);
  }
}

function _writeChar(screen, y, x, ch, attr) {
  const row = screen.lines[y];
  if (row && x >= 0 && x < row.length) {
    row[x][0] = attr;
    row[x][1] = ch;
  }
}

function _writeText(screen, y, startX, text, attr) {
  const row = screen.lines[y];
  if (!row) return;
  for (let i = 0; i < text.length; i++) {
    const x = startX + i;
    if (x >= 0 && x < row.length) {
      row[x][0] = attr;
      row[x][1] = text[i];
    }
  }
}

function _highlightRow(screen, y, startX, len, attr) {
  const row = screen.lines[y];
  if (!row) return;
  for (let i = 0; i < len; i++) {
    const x = startX + i;
    if (x >= 0 && x < row.length) {
      row[x][0] = attr;
      row[x][1] = ' ';
    }
  }
}

function _renderBar(screen, y, startX, width, ratio, attr) {
  const row = screen.lines[y];
  if (!row) return;
  const filled = Math.round(ratio * width);
  const dimAttr = sattr(237, 233);
  for (let i = 0; i < width; i++) {
    const x = startX + i;
    if (x >= 0 && x < row.length) {
      row[x][0] = i < filled ? attr : dimAttr;
      row[x][1] = i < filled ? '\u2588' : '\u2591';
    }
  }
}

module.exports = { MeleeMode };
