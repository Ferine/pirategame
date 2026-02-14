'use strict';

const { sattr } = require('../render/tiles');
const { FACTION, FACTION_COLORS, removeNPCShip } = require('../world/npc-ships');
const { createCombatState } = require('../combat/combat-state');
const { createMeleeState } = require('../combat/melee-state');
const { GOODS, cargoCount } = require('../economy/goods');
const { applyAction, getAttackAction, getHailAction } = require('../world/factions');
const { resolveHailOutcome, applyHailEffect, getWeatherEncounterPrefix } = require('../world/encounter-outcomes');

// Colors
const BG = sattr(233, 233);
const BORDER = sattr(94, 233);
const TITLE_ATTR = sattr(178, 233);
const TEXT_ATTR = sattr(252, 233);
const SELECTED = sattr(233, 178);
const UNSELECTED = sattr(250, 233);
const DANGER = sattr(160, 233);
const SAFE = sattr(34, 233);
const FACTION_MSG = sattr(240, 233);

// Encounter flavor text by faction
const ENCOUNTER_TEXT = {
  english:  'An English warship draws near. Their cannons gleam with intent.',
  danish:   'A Danish vessel hails you. The flag of the realm flutters in the wind.',
  merchant: 'A merchant ship sits heavy in the water, laden with cargo.',
  pirate:   'A ship with no colors approaches. The crew look well-armed and hungry.',
};

const HAIL_TEXT = {
  english:  '"Stand to and identify yourself!" the English captain demands.',
  danish:   '"God dag, kaptajn! Fine weather for sailing." They wave and move on.',
  merchant: '"We seek no trouble. Fair winds to you, captain."',
  pirate:   '"Share your cargo, and we share the sea. Refuse, and..." They grin.',
};

const FLEE_TEXT = {
  english:  'You tack hard and the English ship fires a warning shot. You escape.',
  danish:   'The Danish vessel watches you sail away with mild confusion.',
  merchant: 'The merchant ship seems relieved as you change course.',
  pirate:   'The pirates give chase briefly, but your seamanship prevails.',
};

// Choices (base set — infiltrate added dynamically for English ships)
const BASE_CHOICES = [
  { id: 'hail',       label: 'Hail them' },
  { id: 'flee',       label: 'Flee' },
  { id: 'attack',     label: 'Attack!' },
  { id: 'board',      label: 'Board!' },
  { id: 'infiltrate', label: 'Infiltrate' },
];

class EncounterMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.npc = null;
    this.cursor = 0;
    this.phase = 'choose';  // 'choose', 'hail_choose', 'result'
    this.resultText = '';
    this.resultTimer = 0;
    this.loot = null;
    this.choices = [];
    // Hail outcome state
    this.hailOutcome = null;
    this.hailCursor = 0;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.npc = gameState.encounter;
    this.cursor = 0;
    this.phase = 'choose';
    this.resultText = '';
    this.resultTimer = 0;
    this.loot = null;
    this.hailOutcome = null;
    this.hailCursor = 0;

    // Build active choices — infiltrate only for English
    this.choices = BASE_CHOICES.filter(c => {
      if (c.id === 'infiltrate') return this.npc && this.npc.faction === FACTION.ENGLISH;
      return true;
    });

    // Weather-based encounter flavor prefix
    this.weatherPrefix = '';
    if (gameState.weather && gameState.weather.type !== 'clear') {
      this.weatherPrefix = getWeatherEncounterPrefix(gameState.weather.type);
    }

    // Story encounter flavor text for Act 5 boss
    this.storyFlavorText = null;
    if (this.gameState.campaign && this.gameState.campaign.act === 5
        && this.npc && this.npc.storyBoss) {
      this.storyFlavorText = 'The HMS Sovereign looms before you. This is the moment the Kattegat has waited for.';
    }
  }

  exit() {
    this.gameState.encounter = null;
  }

  update(dt) {
    if (this.phase === 'result') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this._returnToOverworld();
      }
    }
  }

  render(screen) {
    const sw = screen.width;
    const sh = screen.height;

    // Draw a centered panel
    const panelW = Math.min(56, sw - 4);
    const panelH = Math.min(20, sh - 4);
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    // Clear
    for (let y = py; y < py + panelH; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = px; x < px + panelW && x < row.length; x++) {
        row[x][0] = BG;
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Border
    _drawBorder(screen, px, py, panelW, panelH);

    if (!this.npc) return;

    // Title — ship name with faction color
    const fColor = FACTION_COLORS[this.npc.faction] || 255;
    const fAttr = sattr(fColor, 233);
    const title = ` ${this.npc.name} `;
    _writeText(screen, py, px + Math.floor((panelW - title.length) / 2), title, fAttr);

    // Faction label
    const fLabel = `  ${this.npc.faction.charAt(0).toUpperCase() + this.npc.faction.slice(1)} vessel`;
    _writeText(screen, py + 2, px + 3, fLabel, FACTION_MSG);

    // Ship stats
    const stats = `  Hull: ${this.npc.hull}  Crew: ${this.npc.crew}  Masts: ${this.npc.masts}`;
    _writeText(screen, py + 3, px + 3, stats, TEXT_ATTR);

    // NPC cargo display for merchants/pirates
    if (this.npc.cargo && Object.keys(this.npc.cargo).length > 0) {
      const cargoStr = Object.entries(this.npc.cargo).map(([g, q]) => `${q} ${g}`).join(', ');
      _writeText(screen, py + 4, px + 3, `  Cargo: ${cargoStr}`, sattr(178, 233));
      if (this.npc.gold) {
        _writeText(screen, py + 4, px + 3 + cargoStr.length + 12, `  Gold: ${this.npc.gold}`, sattr(226, 233));
      }
    }

    // Encounter text with weather prefix
    const baseFlavorText = this.storyFlavorText || ENCOUNTER_TEXT[this.npc.faction] || 'A ship approaches.';
    const flavorText = this.weatherPrefix + baseFlavorText;
    _writeWrapped(screen, py + 5, px + 3, panelW - 6, flavorText, TEXT_ATTR);

    if (this.phase === 'choose') {
      // Choices
      const choiceY = py + 9;
      for (let i = 0; i < this.choices.length; i++) {
        const choice = this.choices[i];
        const isSelected = i === this.cursor;
        const attr = isSelected ? SELECTED : UNSELECTED;
        const pointer = isSelected ? '\u25B6 ' : '  ';

        let label = choice.label;
        // Color "Attack!", "Board!", "Infiltrate" in red/special
        let labelAttr = attr;
        if ((choice.id === 'attack' || choice.id === 'board') && !isSelected) labelAttr = DANGER;
        if (choice.id === 'infiltrate' && !isSelected) labelAttr = SAFE;

        // Highlight row
        if (isSelected) {
          const row = screen.lines[choiceY + i];
          if (row) {
            for (let x = px + 2; x < px + panelW - 2 && x < row.length; x++) {
              row[x][0] = SELECTED;
              row[x][1] = ' ';
            }
          }
        }

        _writeText(screen, choiceY + i, px + 6, pointer + label, labelAttr);
      }

      // Hint based on selection
      const hintY = py + panelH - 3;
      let hint = '';
      const selId = this.choices[this.cursor].id;
      if (selId === 'infiltrate') {
        hint = 'Sneak aboard and sabotage from within.';
      } else if (selId === 'board') {
        hint = 'Boarding risks your crew but yields greater plunder.';
      } else if (this.npc.faction === FACTION.ENGLISH) {
        hint = 'The English are hostile. Attack is patriotic duty.';
      } else if (this.npc.faction === FACTION.DANISH) {
        hint = 'Attacking Danes is a crime against the Crown.';
      } else if (this.npc.faction === FACTION.MERCHANT) {
        hint = 'Merchants carry valuable cargo but have few cannons.';
      } else if (this.npc.faction === FACTION.PIRATE) {
        hint = 'Pirates are dangerous but carry plundered goods.';
      }
      _writeText(screen, hintY, px + 3, hint, FACTION_MSG);

      // Controls
      _writeText(screen, py + panelH - 2, px + 3,
        ' \u2191\u2193: Choose   Enter/Space: Confirm ', sattr(240, 233));

    } else if (this.phase === 'hail_choose') {
      // Hail outcome text
      if (this.hailOutcome) {
        _writeWrapped(screen, py + 9, px + 3, panelW - 6, this.hailOutcome.text, TEXT_ATTR);

        // Show inline choices
        if (this.hailOutcome.choices) {
          const choiceY = py + 12;
          for (let i = 0; i < this.hailOutcome.choices.length; i++) {
            const c = this.hailOutcome.choices[i];
            const isSelected = i === this.hailCursor;
            const attr = isSelected ? SELECTED : UNSELECTED;
            const pointer = isSelected ? '\u25B6 ' : '  ';

            if (isSelected) {
              const row = screen.lines[choiceY + i];
              if (row) {
                for (let x = px + 2; x < px + panelW - 2 && x < row.length; x++) {
                  row[x][0] = SELECTED;
                  row[x][1] = ' ';
                }
              }
            }
            _writeText(screen, choiceY + i, px + 6, pointer + c.label, attr);
          }
        }
      }

      _writeText(screen, py + panelH - 2, px + 3,
        ' \u2191\u2193: Choose   Enter/Space: Confirm ', sattr(240, 233));

    } else if (this.phase === 'result') {
      // Result text
      _writeWrapped(screen, py + 9, px + 3, panelW - 6, this.resultText, TEXT_ATTR);

      // Loot info
      if (this.loot) {
        const lootY = py + 12;
        _writeText(screen, lootY, px + 3, `Plundered: ${this.loot.gold} rigsdaler`, TITLE_ATTR);
        if (this.loot.goods) {
          let goodsStr = Object.entries(this.loot.goods)
            .map(([id, qty]) => `${qty} ${id}`)
            .join(', ');
          _writeText(screen, lootY + 1, px + 3, `Cargo: ${goodsStr}`, TEXT_ATTR);
        }
      }
    }
  }

  handleInput(key) {
    if (this.phase === 'result') return;

    if (this.phase === 'hail_choose') {
      if (key === 'up') {
        this.hailCursor = Math.max(0, this.hailCursor - 1);
        return;
      }
      if (key === 'down' && this.hailOutcome && this.hailOutcome.choices) {
        this.hailCursor = Math.min(this.hailOutcome.choices.length - 1, this.hailCursor + 1);
        return;
      }
      if (key === 'enter' || key === 'space') {
        this._resolveHailChoice();
        return;
      }
      return;
    }

    if (key === 'up') {
      this.cursor = Math.max(0, this.cursor - 1);
      return;
    }
    if (key === 'down') {
      this.cursor = Math.min(this.choices.length - 1, this.cursor + 1);
      return;
    }

    if (key === 'enter' || key === 'space') {
      this._executeChoice(this.choices[this.cursor].id);
      return;
    }

    // Q to flee immediately
    if (key === 'q') {
      this._executeChoice('flee');
    }
  }

  // --- Private ---

  _executeChoice(choice) {
    switch (choice) {
      case 'hail':
        this._doHail();
        break;
      case 'flee':
        this._doFlee();
        break;
      case 'attack':
        this._doAttack();
        break;
      case 'board':
        this._doBoard();
        break;
      case 'infiltrate':
        this._doInfiltrate();
        break;
    }
  }

  _doHail() {
    // Use new varied outcome system
    const outcome = resolveHailOutcome(this.npc.faction);
    this.hailOutcome = outcome;

    // Reputation effect for hailing
    if (this.gameState.reputation) {
      const actionId = getHailAction(this.npc.faction);
      if (actionId) {
        applyAction(this.gameState.reputation, actionId);
      }
    }

    if (outcome.choices) {
      // Show inline choices
      this.phase = 'hail_choose';
      this.hailCursor = 0;
    } else {
      // No choices — apply effect and show result
      const applied = applyHailEffect(outcome.effect, null, this.gameState);
      this.phase = 'result';
      this.resultText = outcome.text;
      if (applied.text) this.resultText += ' ' + applied.text;
      if (applied.repChanges.length) {
        this.resultText += ' (' + applied.repChanges.join(', ') + ')';
      }
      this.resultTimer = 3.5;

      // Check for forced combat
      if (outcome.effect && outcome.effect.type === 'forced_combat') {
        this._doAttack();
        return;
      }

      // Remove from overworld
      if (this.gameState.npcShips) {
        removeNPCShip(this.gameState.npcShips, this.npc.id);
      }
    }
  }

  _resolveHailChoice() {
    if (!this.hailOutcome) return;
    const choiceId = this.hailOutcome.choices[this.hailCursor].id;
    const applied = applyHailEffect(this.hailOutcome.effect, choiceId, this.gameState);

    this.phase = 'result';
    this.resultText = applied.text;
    if (applied.repChanges.length) {
      this.resultText += ' (' + applied.repChanges.join(', ') + ')';
    }
    this.resultTimer = 3.5;

    // Remove from overworld
    if (this.gameState.npcShips) {
      removeNPCShip(this.gameState.npcShips, this.npc.id);
    }
  }

  _doFlee() {
    this.phase = 'result';
    this.resultText = FLEE_TEXT[this.npc.faction] || 'You sail away quickly.';
    this.resultTimer = 2.5;

    // Pirates and English might damage on flee
    if (this.npc.faction === FACTION.ENGLISH || this.npc.faction === FACTION.PIRATE) {
      const fleeDmg = 5 + Math.floor(Math.random() * 10);
      this.gameState.ship.hull = Math.max(1, this.gameState.ship.hull - fleeDmg);
      this.resultText += ` Hull takes ${fleeDmg} damage from parting shots.`;
    }
  }

  _doAttack() {
    // Reputation effect for initiating attack
    if (this.gameState.reputation) {
      const actionId = getAttackAction(this.npc.faction);
      if (actionId) {
        applyAction(this.gameState.reputation, actionId);
      }
    }

    // Transition to cannon combat with this NPC as enemy
    this.gameState.combat = createCombatState(this.gameState);
    // Override enemy with this NPC's stats
    const c = this.gameState.combat;
    c.enemy.name = this.npc.name;
    c.enemy.hull = this.npc.hull;
    c.enemy.maxHull = this.npc.maxHull;
    c.enemy.crew = this.npc.crew;
    c.enemy.maxCrew = this.npc.maxCrew;
    c.enemy.masts = this.npc.masts;

    // Store NPC id so we can remove after combat
    c.npcId = this.npc.id;
    c.npcFaction = this.npc.faction;

    this.gameState.encounter = null;
    this.stateMachine.transition('SPYGLASS', this.gameState);
  }

  _doBoard() {
    // Reputation effect for boarding (same as attack)
    if (this.gameState.reputation) {
      const actionId = getAttackAction(this.npc.faction);
      if (actionId) {
        applyAction(this.gameState.reputation, actionId);
      }
    }

    // Create melee state for boarding
    const enemyStrength = 8 + Math.floor((this.npc.crew || 30) / 10);
    const enemyHp = 60 + (this.npc.crew || 30);
    const override = {
      name: `${this.npc.name} Captain`,
      hp: enemyHp,
      strength: enemyStrength,
      agility: 7,
      aiStyle: this.npc.faction === FACTION.PIRATE ? 'aggressive' : 'balanced',
    };

    this.gameState.melee = createMeleeState(this.gameState, 'boarding', override);
    this.gameState.boardingNpcId = this.npc.id;
    this.gameState.encounter = null;
    this.stateMachine.transition('MELEE', this.gameState);
  }

  _doInfiltrate() {
    // Set up stealth info and transition
    this.gameState.stealthInfo = {
      templateId: 'ship',
      seed: Date.now(),
      faction: this.npc.faction,
      name: this.npc.name,
    };

    // Remove NPC ship from overworld
    if (this.gameState.npcShips) {
      removeNPCShip(this.gameState.npcShips, this.npc.id);
    }

    this.gameState.encounter = null;
    this.stateMachine.transition('STEALTH', this.gameState);
  }

  _returnToOverworld() {
    this.stateMachine.transition('OVERWORLD', this.gameState);
  }
}

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

function _writeWrapped(screen, startY, startX, maxW, text, attr) {
  const words = text.split(' ');
  let line = '';
  let y = startY;

  for (const word of words) {
    if (line.length + word.length + 1 > maxW) {
      _writeText(screen, y, startX, line, attr);
      y++;
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) _writeText(screen, y, startX, line, attr);
}

module.exports = { EncounterMode };
