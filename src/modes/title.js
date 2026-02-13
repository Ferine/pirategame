'use strict';

const blessed = require('neo-blessed');
const { listSaves, loadGame, deserializeGameState } = require('../engine/save-load');
const { loadHallOfFame, createNewGamePlusState, DIFFICULTY, getUnlockedCosmetics, createStats, loadPersistent } = require('../meta/legacy');
const { createEconomyState } = require('../economy/goods');
const { createCrewState } = require('../crew/crew');
const { createReputationState } = require('../world/factions');
const { createWeatherState } = require('../world/weather');
const { createQuestState } = require('../world/quests');
const { createEventsState } = require('../world/events');
const { createFleetState } = require('../fleet/fleet');
const { createCampaignState } = require('../story/campaign');
const { createLogState } = require('../meta/captains-log');

const BASE_MENU = ['Continue', 'New Game', 'Load Game', 'Quit'];
const DIFFICULTY_OPTIONS = ['easy', 'normal', 'hard'];

class TitleMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.box = null;
    this.cursor = 1;       // default to "New Game"
    this.saves = [];
    this.hasAutoSave = false;
    this.phase = 'menu';   // 'menu', 'load', or 'difficulty'
    this.saveCursor = 0;
    this.menuItems = BASE_MENU;
    this.difficultyCursor = 1; // default Normal
    this.pendingAction = null; // 'new' or 'ngplus'
    this.hallOfFame = [];
    this.waveFrame = 0;
    this.waveTimer = 0;
  }

  enter() {
    // Check for saves
    this.saves = listSaves();
    this.hasAutoSave = this.saves.some(s => s.slot === 'auto');

    // Build menu items dynamically
    this.menuItems = [...BASE_MENU];
    const persistent = this.gameState.persistent;
    if (persistent && persistent.stats && persistent.stats.campaignsCompleted > 0) {
      // Insert New Game+ after New Game
      const idx = this.menuItems.indexOf('New Game');
      this.menuItems.splice(idx + 1, 0, 'New Game+');
    }

    this.cursor = this.hasAutoSave ? 0 : 1;
    this.phase = 'menu';
    this.saveCursor = 0;
    this.difficultyCursor = 1;
    this.pendingAction = null;
    this.hallOfFame = loadHallOfFame();

    this.box = blessed.box({
      top: 'center',
      left: 'center',
      width: 62,
      height: 24,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: '#b08550',
        bg: '#0a1628',
        border: {
          fg: '#b08550',
        },
      },
    });

    this._updateContent();
  }

  exit() {
    if (this.box) {
      this.box.detach();
      this.box = null;
    }
  }

  update(dt) {
    this.waveTimer += dt;
    if (this.waveTimer >= 0.3) {
      this.waveTimer -= 0.3;
      this.waveFrame = (this.waveFrame + 1) % 8;
      if (this.phase === 'menu') {
        this._updateContent();
      }
    }
  }

  _waveStr(len, offset) {
    const pattern = '~  ~~~  ';
    let s = '';
    for (let i = 0; i < len; i++) {
      s += pattern[(i + this.waveFrame + offset) % 8];
    }
    return s;
  }

  render(screen) {
    if (this.box && !this.box.screen) {
      screen.append(this.box);
    }
  }

  handleInput(key) {
    if (this.phase === 'load') {
      return this._handleLoadInput(key);
    }
    if (this.phase === 'difficulty') {
      return this._handleDifficultyInput(key);
    }

    if (key === 'up') {
      this.cursor = Math.max(0, this.cursor - 1);
      // Skip "Continue" if no auto-save
      if (this.cursor === 0 && !this.hasAutoSave) this.cursor = 1;
      this._updateContent();
    } else if (key === 'down') {
      this.cursor = Math.min(this.menuItems.length - 1, this.cursor + 1);
      this._updateContent();
    } else if (key === 'enter') {
      this._selectMenuItem();
    } else if (key === 'q') {
      process.exit(0);
    }
  }

  _selectMenuItem() {
    const item = this.menuItems[this.cursor];

    switch (item) {
      case 'Continue':
        this._loadAutoSave();
        break;
      case 'New Game':
        this.pendingAction = 'new';
        this.phase = 'difficulty';
        this.difficultyCursor = 1; // default Normal
        this._updateContent();
        break;
      case 'New Game+':
        this.pendingAction = 'ngplus';
        this.phase = 'difficulty';
        this.difficultyCursor = 1;
        this._updateContent();
        break;
      case 'Load Game':
        if (this.saves.length > 0) {
          this.phase = 'load';
          this.saveCursor = 0;
          this._updateContent();
        }
        break;
      case 'Quit':
        process.exit(0);
        break;
    }
  }

  _handleDifficultyInput(key) {
    if (key === 'up') {
      this.difficultyCursor = Math.max(0, this.difficultyCursor - 1);
      this._updateContent();
    } else if (key === 'down') {
      this.difficultyCursor = Math.min(DIFFICULTY_OPTIONS.length - 1, this.difficultyCursor + 1);
      this._updateContent();
    } else if (key === 'enter') {
      const diff = DIFFICULTY_OPTIONS[this.difficultyCursor];
      if (this.pendingAction === 'ngplus') {
        const ngState = createNewGamePlusState(this.gameState);
        Object.assign(this.gameState, ngState);
      } else {
        this._resetForNewGame();
      }
      this.gameState.difficulty = diff;
      this.stateMachine.transition('OVERWORLD', this.gameState);
    } else if (key === 'q') {
      this.phase = 'menu';
      this._updateContent();
    }
  }

  _loadAutoSave() {
    const data = loadGame('auto');
    if (data) {
      const json = JSON.stringify(data);
      if (!deserializeGameState(json, this.gameState)) {
        this._showLoadError();
        return;
      }
    }
    this.stateMachine.transition('OVERWORLD', this.gameState);
  }

  _handleLoadInput(key) {
    if (key === 'up') {
      this.saveCursor = Math.max(0, this.saveCursor - 1);
      this._updateContent();
    } else if (key === 'down') {
      this.saveCursor = Math.min(this.saves.length - 1, this.saveCursor + 1);
      this._updateContent();
    } else if (key === 'enter') {
      const save = this.saves[this.saveCursor];
      if (save) {
        const data = loadGame(save.slot);
        if (data) {
          const json = JSON.stringify(data);
          if (!deserializeGameState(json, this.gameState)) {
            this._showLoadError();
            return;
          }
        }
        this.stateMachine.transition('OVERWORLD', this.gameState);
      }
    } else if (key === 'q') {
      this.phase = 'menu';
      this._updateContent();
    }
  }

  _resetForNewGame() {
    const gs = this.gameState;
    gs.ship = {
      x: 150,
      y: 100,
      direction: 0,
      hull: 100,
      maxHull: 100,
      name: 'Drakar',
      moveAccum: 0,
    };
    gs.wind = { direction: 2, strength: 3, changeTimer: 30 };
    gs.currentSpeed = 0;
    gs.economy = createEconomyState();
    gs.crew = createCrewState();
    gs.reputation = createReputationState();
    gs.weather = createWeatherState();
    gs.quests = createQuestState();
    gs.events = createEventsState();
    gs.fleet = createFleetState('Drakar');
    gs.questNotices = [];
    gs.treasureMaps = [];
    gs.campaign = createCampaignState();
    gs.convoy = null;
    gs.blockade = null;
    gs.melee = null;
    gs.meleeResult = null;
    gs.boardingNpcId = null;
    gs.stealthInfo = null;
    gs.crtEnabled = false;
    gs.stats = createStats();
    gs.captainsLog = createLogState();
    gs.achievementToasts = [];
    gs.ngPlus = false;
    // Preserve: gs.map, gs.persistent
  }

  _showLoadError() {
    if (this.box) {
      this.box.setContent(
        '\n\n{bold}{red-fg}  Save file corrupted or incompatible.{/}\n\n' +
        '  {#6a7a8a-fg}Press any key to return to menu.{/}'
      );
    }
    this.phase = 'menu';
  }

  _updateContent() {
    if (!this.box) return;

    if (this.phase === 'load') {
      const lines = [
        '',
        '{bold}{#d4a030-fg}           Load Game{/}',
        '',
        '{#6a7a8a-fg}    Slot   Captain         Gold    Date{/}',
        '{#3a5a7a-fg}    ──────────────────────────────────────{/}',
      ];

      for (let i = 0; i < this.saves.length; i++) {
        const s = this.saves[i];
        const ptr = i === this.saveCursor ? '{bold}{#c4a060-fg} >  ' : '    {#6a7a8a-fg}';
        const dateStr = s.date ? s.date.slice(0, 10) : '';
        lines.push(`${ptr}${s.slot}: ${s.captain} - ${s.gold} rds (${dateStr}){/}`);
      }

      lines.push('');
      lines.push('{#3a4a5a-fg}     Arrow keys: Navigate  Enter: Load  Q: Back{/}');

      this.box.height = lines.length + 2;
      this.box.setContent(lines.join('\n'));
      return;
    }

    if (this.phase === 'difficulty') {
      const label = this.pendingAction === 'ngplus' ? 'New Game+' : 'New Game';
      const waveHdr = this._waveStr(38, 3);
      const lines = [
        '',
        `{bold}{#d4a030-fg}      ${label} - Select Difficulty{/}`,
        `{#3a5a7a-fg}     ${waveHdr}{/}`,
        '',
      ];

      for (let i = 0; i < DIFFICULTY_OPTIONS.length; i++) {
        const key = DIFFICULTY_OPTIONS[i];
        const info = DIFFICULTY[key];
        const isSel = i === this.difficultyCursor;
        const desc = key === 'easy' ? '(More gold, less damage)'
          : key === 'hard' ? '(Less gold, more damage, faster guards)'
          : '(Balanced challenge)';
        if (isSel) {
          lines.push(`{bold}{#c4a060-fg}      > ${info.label}  {#8a9ab5-fg}${desc}{/}`);
        } else {
          lines.push(`{#6a7a8a-fg}        ${info.label}  ${desc}{/}`);
        }
      }

      lines.push('');
      lines.push('{#3a4a5a-fg}      Arrow keys: Navigate  Enter: Select  Q: Back{/}');

      this.box.height = lines.length + 2;
      this.box.setContent(lines.join('\n'));
      return;
    }

    // Apply cosmetic color scheme from persistent data
    const persistent = this.gameState.persistent;
    let titleColor = '#d4a030';
    if (persistent && persistent.cosmetics && persistent.cosmetics.activeColorScheme) {
      if (persistent.cosmetics.activeColorScheme === 'midnight') {
        titleColor = '#6a8abf';
      } else if (persistent.cosmetics.activeColorScheme === 'gold') {
        titleColor = '#ffd700';
      }
    }

    const w1 = this._waveStr(7, 0);
    const w2 = this._waveStr(7, 4);
    const w3 = this._waveStr(28, 2);
    const w4 = this._waveStr(34, 6);

    const art = [
      '',
      `{bold}{${titleColor}-fg}      ~  K A T T E G A T   K A P E R  ~{/}`,
      '',
      '{#c8b898-fg}                      |{/}',
      '{#c8b898-fg}                     /|\\{/}',
      '{#c8b898-fg}                    / | \\{/}',
      '{#c8b898-fg}                   /  |  \\{/}',
      `{#8a6a3a-fg}            .----'   {#c8b898-fg}|{#8a6a3a-fg}   '----.{/}`,
      `{#8a6a3a-fg}       _,--'  {#4a7a9a-fg}${w1}{#8a6a3a-fg}|{#4a7a9a-fg}${w2}{#8a6a3a-fg}  '--,_{/}`,
      '{#b08550-fg}      |_____|________|________|_____|{/}',
      `{#4a7a9a-fg}       ${w3}{/}`,
      '{#6a4a2a-fg}         \'-._____________________.-\'{/}',
      '',
      '{#8a9ab5-fg}      A Pirate Game of the Northern Seas{/}',
      `{#3a5a7a-fg}       ${w4}{/}`,
      '',
    ];

    for (let i = 0; i < this.menuItems.length; i++) {
      const item = this.menuItems[i];
      const isSel = i === this.cursor;

      // Grey out "Continue" if no auto-save
      if (item === 'Continue' && !this.hasAutoSave) {
        art.push(`    {#3a3a4a-fg}  ${item}{/}`);
        continue;
      }

      if (isSel) {
        art.push(`{bold}{#c4a060-fg}       > ${item}{/}`);
      } else {
        art.push(`{#6a7a8a-fg}         ${item}{/}`);
      }
    }

    // Hall of Fame
    if (this.hallOfFame.length > 0) {
      art.push('');
      art.push('{#d4a030-fg}      --- Hall of Fame ---{/}');
      for (const entry of this.hallOfFame) {
        const ending = entry.ending ? entry.ending.replace('_', ' ') : '?';
        art.push(`{#6a7a8a-fg}      ${entry.name || '?'} - ${entry.gold} gold - ${ending} (${entry.difficulty || 'normal'}){/}`);
      }
    }

    art.push('');
    art.push('{#3a4a5a-fg}       Arrow keys: Navigate  Enter: Select{/}');

    this.box.height = art.length + 2;
    this.box.setContent(art.join('\n'));
  }
}

module.exports = { TitleMode };
