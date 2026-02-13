'use strict';

const { sattr } = require('../render/tiles');

const SCROLL_SPEED = 0.4; // seconds per line
const FAST_MULT = 2;

class CreditsMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.lines = [];
    this.scrollY = 0;
    this.timer = 0;
    this.speedMult = 1;
  }

  enter(gameState) {
    this.gameState = gameState;
    this.scrollY = 0;
    this.timer = 0;
    this.speedMult = 1;

    // Build credits lines
    this.lines = this._buildCredits();
  }

  exit() {}

  update(dt) {
    this.timer += dt * this.speedMult;
    while (this.timer >= SCROLL_SPEED) {
      this.timer -= SCROLL_SPEED;
      this.scrollY++;
    }

    // When all lines have scrolled off, return to title
    if (this.scrollY > this.lines.length + 10) {
      this.stateMachine.transition('TITLE', this.gameState);
    }
  }

  render(screen) {
    const w = screen.width;
    const h = screen.height;
    const bgAttr = sattr(233, 233);

    // Clear
    for (let sy = 0; sy < h; sy++) {
      const row = screen.lines[sy];
      if (!row) continue;
      for (let sx = 0; sx < w && sx < row.length; sx++) {
        row[sx][0] = bgAttr;
        row[sx][1] = ' ';
      }
      row.dirty = true;
    }

    // Render scrolling lines
    for (let sy = 0; sy < h; sy++) {
      const lineIdx = this.scrollY - (h - sy);
      if (lineIdx < 0 || lineIdx >= this.lines.length) continue;

      const entry = this.lines[lineIdx];
      const row = screen.lines[sy];
      if (!row) continue;

      const startX = Math.max(0, Math.floor((w - entry.text.length) / 2));
      for (let i = 0; i < entry.text.length; i++) {
        const x = startX + i;
        if (x >= 0 && x < w && x < row.length) {
          row[x][0] = entry.attr;
          row[x][1] = entry.text[i];
        }
      }
    }

    // "Space = Fast, Enter/Q = Skip" at bottom
    const help = ' Space: Fast  Enter/Q: Skip ';
    const helpRow = screen.lines[h - 1];
    if (helpRow) {
      const helpAttr = sattr(240, 233);
      const startX = Math.floor((w - help.length) / 2);
      for (let i = 0; i < help.length; i++) {
        const x = startX + i;
        if (x >= 0 && x < w && x < helpRow.length) {
          helpRow[x][0] = helpAttr;
          helpRow[x][1] = help[i];
        }
      }
    }
  }

  handleInput(key) {
    if (key === 'enter' || key === 'q') {
      this.stateMachine.transition('TITLE', this.gameState);
      return;
    }
    if (key === 'space') {
      this.speedMult = this.speedMult === 1 ? FAST_MULT : 1;
    }
  }

  _buildCredits() {
    const GOLD = sattr(178, 233);
    const WHITE = sattr(252, 233);
    const DIM = sattr(240, 233);
    const BLUE = sattr(39, 233);
    const TITLE_ATTR = sattr(226, 233);

    const lines = [];
    const add = (text, attr) => lines.push({ text, attr: attr || WHITE });
    const blank = () => add('', DIM);

    // ASCII ship
    add('       |    |    |', BLUE);
    add('      )_)  )_)  )_)', BLUE);
    add('     )___))___))___)', BLUE);
    add('    )____)____)_____)', BLUE);
    add('  _____|____|____|______', BLUE);
    add(' \\                     /', BLUE);
    add('~~\\~~~~~~~~~~~~~~~~~~~~/~~', BLUE);
    add('~~~\\~~~~~~~~~~~~~~~~~~/~~~~', BLUE);
    blank();
    blank();

    add('T H E   K A T T E G A T   C O N S P I R A C Y', TITLE_ATTR);
    blank();
    blank();

    // Ending text
    const campaign = this.gameState.campaign;
    if (campaign && campaign.ending) {
      const endings = {
        hero: 'You are hailed as the Hero of the Kattegat.',
        pirate_king: 'The Pirate King of the Kattegat reigns supreme.',
        outlaw: 'An outlaw, but always free.',
      };
      add(endings[campaign.ending] || 'The Kattegat is saved.', GOLD);
      blank();
    }

    blank();
    add('- - - - - - - - - - -', DIM);
    blank();

    // Stats summary
    const stats = this.gameState.stats;
    if (stats) {
      add('YOUR VOYAGE', GOLD);
      blank();
      add(`Ships Sunk: ${stats.shipsSunk}`, WHITE);
      add(`Gold Earned: ${stats.goldEarned}`, WHITE);
      add(`Treasures Found: ${stats.treasuresFound}`, WHITE);
      add(`Ports Visited: ${stats.uniquePortsVisited}`, WHITE);
      add(`Melee Victories: ${stats.meleeWins}`, WHITE);
      add(`Distance Sailed: ${stats.distanceSailed}`, WHITE);
      add(`Play Time: ${stats.playTimeMinutes} minutes`, WHITE);
      blank();
    }

    blank();
    add('- - - - - - - - - - -', DIM);
    blank();
    blank();

    add('KATTEGAT KAPER', GOLD);
    blank();
    add('A terminal pirate game', WHITE);
    add('set in the Kattegat strait', WHITE);
    blank();
    blank();
    add('Built with neo-blessed', DIM);
    blank();
    blank();

    add('Inspired by', DIM);
    add('Sid Meier\'s Pirates!', WHITE);
    add('FTL: Faster Than Light', WHITE);
    add('Brogue', WHITE);
    blank();
    blank();

    add('Thank you for playing!', GOLD);
    blank();
    blank();
    blank();
    blank();
    blank();

    return lines;
  }
}

module.exports = { CreditsMode };
