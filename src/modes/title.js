'use strict';

const blessed = require('neo-blessed');
const { listSaves, loadGame, deserializeGameState } = require('../engine/save-load');

const MENU_ITEMS = ['Continue', 'New Game', 'Load Game', 'Quit'];

class TitleMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.box = null;
    this.cursor = 1;       // default to "New Game"
    this.saves = [];
    this.hasAutoSave = false;
    this.phase = 'menu';   // 'menu' or 'load'
    this.saveCursor = 0;
  }

  enter() {
    // Check for saves
    this.saves = listSaves();
    this.hasAutoSave = this.saves.some(s => s.slot === 'auto');
    this.cursor = this.hasAutoSave ? 0 : 1;
    this.phase = 'menu';
    this.saveCursor = 0;

    this.box = blessed.box({
      top: 'center',
      left: 'center',
      width: 60,
      height: 22,
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

  update() {}

  render(screen) {
    if (this.box && !this.box.screen) {
      screen.append(this.box);
    }
  }

  handleInput(key) {
    if (this.phase === 'load') {
      return this._handleLoadInput(key);
    }

    if (key === 'up') {
      this.cursor = Math.max(0, this.cursor - 1);
      // Skip "Continue" if no auto-save
      if (this.cursor === 0 && !this.hasAutoSave) this.cursor = 1;
      this._updateContent();
    } else if (key === 'down') {
      this.cursor = Math.min(MENU_ITEMS.length - 1, this.cursor + 1);
      this._updateContent();
    } else if (key === 'enter') {
      this._selectMenuItem();
    } else if (key === 'q') {
      process.exit(0);
    }
  }

  _selectMenuItem() {
    const item = MENU_ITEMS[this.cursor];

    switch (item) {
      case 'Continue':
        this._loadAutoSave();
        break;
      case 'New Game':
        this.stateMachine.transition('OVERWORLD', this.gameState);
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

  _loadAutoSave() {
    const data = loadGame('auto');
    if (data) {
      const json = JSON.stringify(data);
      deserializeGameState(json, this.gameState);
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
          deserializeGameState(json, this.gameState);
        }
        this.stateMachine.transition('OVERWORLD', this.gameState);
      }
    } else if (key === 'q') {
      this.phase = 'menu';
      this._updateContent();
    }
  }

  _updateContent() {
    if (!this.box) return;

    if (this.phase === 'load') {
      const lines = [
        '',
        '{bold}{#d4a030-fg}        Load Game{/}',
        '',
      ];

      for (let i = 0; i < this.saves.length; i++) {
        const s = this.saves[i];
        const ptr = i === this.saveCursor ? '{bold}{#c4a060-fg}> ' : '  {#6a7a8a-fg}';
        const dateStr = s.date ? s.date.slice(0, 10) : '';
        lines.push(`${ptr}${s.slot}: ${s.captain} - ${s.gold} rds (${dateStr}){/}`);
      }

      lines.push('');
      lines.push('{#6a7a8a-fg}        Q: Back{/}');

      this.box.setContent(lines.join('\n'));
      return;
    }

    const art = [
      '',
      '{bold}{#d4a030-fg}',
      '    ~  K A T T E G A T   K A P E R  ~',
      '{/}',
      '',
      '{#4a6a8a-fg}',
      '          ~~~\\___/~~~',
      '     ~~~~~~~~|  |~~~~~~~~',
      '    ~~~~~~~~~| \\| ~~~~~~~~~',
      '     ~~~~~~~~|  |~~~~~~~~',
      '          ~~~/ \\ \\~~~',
      '{/}',
      '',
      '{#8a9ab5-fg}    A Pirate Game of the Northern Seas{/}',
      '',
    ];

    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const item = MENU_ITEMS[i];
      const isSel = i === this.cursor;

      // Grey out "Continue" if no auto-save
      if (item === 'Continue' && !this.hasAutoSave) {
        art.push(`  {#3a3a4a-fg}    ${item}{/}`);
        continue;
      }

      if (isSel) {
        art.push(`{bold}{#c4a060-fg}     > ${item}{/}`);
      } else {
        art.push(`{#6a7a8a-fg}       ${item}{/}`);
      }
    }

    this.box.setContent(art.join('\n'));
  }
}

module.exports = { TitleMode };
