'use strict';

const { sattr } = require('../render/tiles');
const { getCurrentObjective, KEY_ITEM_INFO } = require('./campaign');

// Colors
const BG = sattr(233, 233);
const BORDER = sattr(94, 233);
const TITLE = sattr(178, 233);
const HEADER = sattr(250, 233);
const TEXT = sattr(252, 233);
const DIM = sattr(240, 233);
const SELECTED_TAB = sattr(233, 178);
const ITEM_NAME = sattr(226, 233);
const HELP = sattr(240, 233);

/**
 * Create journal UI overlay state.
 */
function createJournalState(campaign) {
  return {
    tab: 'objective',   // 'objective', 'journal', 'items'
    cursor: 0,
    scrollOffset: 0,
  };
}

/**
 * Handle input for journal overlay.
 * Returns true if consumed, false to close.
 */
function journalHandleInput(key, ui, campaign) {
  if (key === 'q' || key === 'j') {
    return false; // close
  }

  const tabs = ['objective', 'journal', 'items'];

  if (key === 'left') {
    const idx = tabs.indexOf(ui.tab);
    ui.tab = tabs[(idx + tabs.length - 1) % tabs.length];
    ui.cursor = 0;
    ui.scrollOffset = 0;
    return true;
  }

  if (key === 'right') {
    const idx = tabs.indexOf(ui.tab);
    ui.tab = tabs[(idx + 1) % tabs.length];
    ui.cursor = 0;
    ui.scrollOffset = 0;
    return true;
  }

  if (key === 'up') {
    if (ui.tab === 'journal') {
      ui.scrollOffset = Math.max(0, ui.scrollOffset - 1);
    } else if (ui.tab === 'items') {
      ui.cursor = Math.max(0, ui.cursor - 1);
    }
    return true;
  }

  if (key === 'down') {
    if (ui.tab === 'journal') {
      ui.scrollOffset++;
    } else if (ui.tab === 'items' && campaign) {
      ui.cursor = Math.min(Math.max(0, campaign.keyItems.length - 1), ui.cursor + 1);
    }
    return true;
  }

  return true; // consume all other keys while open
}

/**
 * Render journal overlay.
 */
function journalRender(screen, ui, campaign) {
  if (!campaign) return;

  const sw = screen.width;
  const sh = screen.height;
  const panelW = Math.min(60, sw - 4);
  const panelH = Math.min(22, sh - 4);
  const px = Math.floor((sw - panelW) / 2);
  const py = Math.floor((sh - panelH) / 2);

  // Clear panel
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

  // Title
  const actLabel = campaign.act > 0 ? ` Act ${campaign.act}` : '';
  const title = ` Campaign Journal${actLabel} `;
  _writeText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

  // Tabs
  const tabs = [
    ui.tab === 'objective' ? '[Objective]' : ' Objective ',
    ui.tab === 'journal' ? '[Journal]' : ' Journal ',
    ui.tab === 'items' ? '[Items]' : ' Items ',
  ];
  const tabStr = tabs.join('  ');
  _writeText(screen, py + 2, px + 3, tabStr, HEADER);

  // Highlight selected tab
  let tabX = px + 3;
  for (let t = 0; t < tabs.length; t++) {
    if (tabs[t].startsWith('[')) {
      _writeText(screen, py + 2, tabX, tabs[t], SELECTED_TAB);
    }
    tabX += tabs[t].length + 2;
  }

  // Content area
  const contentTop = py + 4;
  const contentH = panelH - 7;

  if (ui.tab === 'objective') {
    _renderObjective(screen, contentTop, px, panelW, contentH, campaign);
  } else if (ui.tab === 'journal') {
    _renderJournalEntries(screen, contentTop, px, panelW, contentH, campaign, ui);
  } else if (ui.tab === 'items') {
    _renderItems(screen, contentTop, px, panelW, contentH, campaign, ui);
  }

  // Help
  const help = ' Left/Right: Tabs  Up/Down: Scroll  J/Q: Close ';
  _writeText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP);
}

function _renderObjective(screen, top, px, panelW, contentH, campaign) {
  const objective = getCurrentObjective(campaign);
  _writeText(screen, top, px + 3, 'Current Objective:', HEADER);
  _writeWrapped(screen, top + 2, px + 3, panelW - 6, objective, TEXT);

  if (campaign.ending) {
    const endStr = `Ending: ${campaign.ending.replace('_', ' ').toUpperCase()}`;
    _writeText(screen, top + contentH - 1, px + 3, endStr, ITEM_NAME);
  }
}

function _renderJournalEntries(screen, top, px, panelW, contentH, campaign, ui) {
  const entries = campaign.journalEntries;
  if (!entries.length) {
    _writeText(screen, top + 1, px + 3, 'No journal entries yet.', DIM);
    return;
  }

  // Each entry takes 3 lines (title + 1 line text + blank)
  const maxVisible = Math.floor(contentH / 3);
  const maxOffset = Math.max(0, entries.length - maxVisible);
  if (ui.scrollOffset > maxOffset) ui.scrollOffset = maxOffset;

  let lineY = top;
  for (let i = ui.scrollOffset; i < entries.length && lineY < top + contentH - 1; i++) {
    const entry = entries[i];
    const header = `Act ${entry.act}: ${entry.title}`;
    _writeText(screen, lineY, px + 3, header.slice(0, panelW - 6), HEADER);
    lineY++;

    // Show first ~panelW chars of text
    const preview = entry.text.slice(0, panelW - 8);
    _writeText(screen, lineY, px + 4, preview, DIM);
    lineY += 2;
  }
}

function _renderItems(screen, top, px, panelW, contentH, campaign, ui) {
  if (!campaign.keyItems.length) {
    _writeText(screen, top + 1, px + 3, 'No key items collected.', DIM);
    return;
  }

  for (let i = 0; i < campaign.keyItems.length && i < contentH; i++) {
    const itemId = campaign.keyItems[i];
    const info = KEY_ITEM_INFO[itemId] || { name: itemId, desc: '' };
    const lineY = top + i * 2;
    const isSelected = i === ui.cursor;
    const nameAttr = isSelected ? SELECTED_TAB : ITEM_NAME;
    const pointer = isSelected ? '> ' : '  ';

    _writeText(screen, lineY, px + 3, pointer + info.name, nameAttr);
    if (info.desc) {
      _writeText(screen, lineY + 1, px + 5, info.desc.slice(0, panelW - 8), DIM);
    }
  }
}

// --- Helpers ---

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

module.exports = {
  createJournalState,
  journalHandleInput,
  journalRender,
};
