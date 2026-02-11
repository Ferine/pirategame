'use strict';

const { sattr } = require('../render/tiles');
const { ROLES, generateCandidates, calcAvgMorale, payCrew, countByRole } = require('./crew');

// Colors
const BG = sattr(233, 233);
const BORDER = sattr(94, 233);
const TITLE = sattr(178, 233);
const HEADER = sattr(250, 233);
const ROW_NORMAL = sattr(252, 233);
const ROW_SELECTED = sattr(233, 178);
const CANT_AFFORD = sattr(239, 233);
const GOOD = sattr(34, 233);
const WARN = sattr(178, 233);
const BAD = sattr(160, 233);
const HELP = sattr(240, 233);
const TAB_ACTIVE = sattr(233, 94);
const TAB_INACTIVE = sattr(94, 233);

const MORALE_LABELS = ['', 'Mutinous', 'Mutinous', 'Miserable', 'Unhappy', 'Discontent',
                        'Content', 'Satisfied', 'Happy', 'Loyal', 'Fanatical'];

function moraleColor(val) {
  if (val <= 3) return BAD;
  if (val <= 5) return WARN;
  return GOOD;
}

/**
 * Create tavern/crew overlay state.
 */
function createCrewUIState(portName, gameState) {
  return {
    portName,
    tab: 'roster',  // 'roster', 'recruit', 'pay'
    cursor: 0,
    candidates: generateCandidates(portName, 4),
    message: '',
    messageTimer: 0,
    roleMenu: false,  // true when assigning role
    roleCursor: 0,
  };
}

/**
 * Handle input for crew UI.
 * Returns true if consumed, false to close.
 */
function crewHandleInput(key, ui, gameState) {
  const crew = gameState.crew;
  if (!crew) return false;

  if (key === 'q' || (key === 'enter' && !ui.roleMenu)) {
    if (ui.roleMenu) {
      ui.roleMenu = false;
      return true;
    }
    return false; // close
  }

  // Role assignment sub-menu
  if (ui.roleMenu) {
    return _handleRoleMenu(key, ui, crew);
  }

  // Tab switching
  if (key === 'left' || key === 'right') {
    const tabs = ['roster', 'recruit', 'pay'];
    const idx = tabs.indexOf(ui.tab);
    if (key === 'right') ui.tab = tabs[(idx + 1) % tabs.length];
    else ui.tab = tabs[(idx - 1 + tabs.length) % tabs.length];
    ui.cursor = 0;
    return true;
  }

  if (key === 'up') {
    ui.cursor = Math.max(0, ui.cursor - 1);
    return true;
  }

  if (key === 'down') {
    const maxItems = ui.tab === 'roster' ? crew.members.length
                   : ui.tab === 'recruit' ? ui.candidates.length
                   : 1;
    ui.cursor = Math.min(Math.max(0, maxItems - 1), ui.cursor + 1);
    return true;
  }

  if (key === 'space') {
    if (ui.tab === 'roster') {
      // Open role assignment
      if (crew.members[ui.cursor]) {
        ui.roleMenu = true;
        ui.roleCursor = 0;
        return true;
      }
    }

    if (ui.tab === 'recruit') {
      // Hire candidate
      const cand = ui.candidates[ui.cursor];
      if (!cand) return true;

      if (crew.members.length >= crew.maxCrew) {
        ui.message = 'Crew is full.';
        ui.messageTimer = 2.0;
        return true;
      }

      const eco = gameState.economy;
      if (eco.gold < cand.cost) {
        ui.message = 'Not enough rigsdaler.';
        ui.messageTimer = 2.0;
        return true;
      }

      eco.gold -= cand.cost;
      crew.members.push(cand);
      ui.candidates.splice(ui.cursor, 1);
      ui.cursor = Math.min(ui.cursor, ui.candidates.length - 1);
      calcAvgMorale(crew);
      ui.message = `${cand.name} joins your crew.`;
      ui.messageTimer = 2.5;
      return true;
    }

    if (ui.tab === 'pay') {
      const result = payCrew(crew, gameState.economy);
      if (result.paid) {
        ui.message = `Paid ${result.cost} rds. Crew morale improves.`;
      } else {
        ui.message = `Need ${result.cost} rds to pay crew.`;
      }
      ui.messageTimer = 2.5;
      return true;
    }
  }

  return true;
}

function _handleRoleMenu(key, ui, crew) {
  const roles = [ROLES.NONE, ROLES.GUNNERY, ROLES.SAILING, ROLES.BOARDING];

  if (key === 'up') {
    ui.roleCursor = Math.max(0, ui.roleCursor - 1);
    return true;
  }
  if (key === 'down') {
    ui.roleCursor = Math.min(roles.length - 1, ui.roleCursor + 1);
    return true;
  }
  if (key === 'space' || key === 'enter') {
    const member = crew.members[ui.cursor];
    if (member) {
      member.role = roles[ui.roleCursor];
      ui.message = `${member.name} assigned to ${member.role || 'no role'}.`;
      ui.messageTimer = 2.0;
    }
    ui.roleMenu = false;
    return true;
  }
  if (key === 'q') {
    ui.roleMenu = false;
    return true;
  }
  return true;
}

/**
 * Update crew UI (timers).
 */
function crewUpdate(dt, ui) {
  if (ui.messageTimer > 0) {
    ui.messageTimer -= dt;
    if (ui.messageTimer <= 0) ui.message = '';
  }
}

/**
 * Render crew UI overlay.
 */
function crewRender(screen, ui, gameState) {
  const crew = gameState.crew;
  const eco = gameState.economy;
  if (!crew) return;

  const sw = screen.width;
  const sh = screen.height;
  const panelW = Math.min(64, sw - 4);
  const panelH = Math.min(26, sh - 4);
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

  _drawBorder(screen, px, py, panelW, panelH);

  // Title
  const title = ` Tavern - ${ui.portName} `;
  _writeText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

  // Tabs
  const tabs = [
    { id: 'roster',  label: ' Roster ' },
    { id: 'recruit', label: ' Recruit ' },
    { id: 'pay',     label: ' Pay Crew ' },
  ];
  let tabX = px + 3;
  for (const t of tabs) {
    _writeText(screen, py + 1, tabX, t.label, t.id === ui.tab ? TAB_ACTIVE : TAB_INACTIVE);
    tabX += t.label.length + 1;
  }

  // Gold + crew count
  const infoStr = `${eco.gold} rds  Crew: ${crew.members.length}/${crew.maxCrew}`;
  _writeText(screen, py + 1, px + panelW - infoStr.length - 2, infoStr, HEADER);

  // Morale bar
  const moraleVal = Math.round(crew.avgMorale);
  const moraleLabel = MORALE_LABELS[moraleVal] || '';
  const moraleStr = `Morale: ${moraleLabel} (${crew.avgMorale.toFixed(1)})`;
  _writeText(screen, py + 2, px + 3, moraleStr, moraleColor(moraleVal));

  // Tab content
  const contentY = py + 4;
  if (ui.tab === 'roster') {
    _renderRoster(screen, ui, crew, px, contentY, panelW, panelH - 7);
  } else if (ui.tab === 'recruit') {
    _renderRecruit(screen, ui, crew, eco, px, contentY, panelW, panelH - 7);
  } else {
    _renderPay(screen, ui, crew, eco, px, contentY, panelW, panelH - 7);
  }

  // Role assignment sub-menu
  if (ui.roleMenu) {
    _renderRoleMenu(screen, ui, crew, px, py, panelW, panelH);
  }

  // Message
  if (ui.message) {
    _writeText(screen, py + panelH - 3, px + 3, ui.message, TITLE);
  }

  // Help
  const help = ui.roleMenu
    ? ' \u2191\u2193:Select  Space:Assign  Q:Cancel '
    : ' \u2190\u2192:Tab  \u2191\u2193:Select  Space:Action  Enter/Q:Close ';
  _writeText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP);
}

function _renderRoster(screen, ui, crew, px, startY, panelW, maxRows) {
  // Header
  _writeText(screen, startY, px + 3, 'Name', HEADER);
  _writeText(screen, startY, px + 22, 'Str', HEADER);
  _writeText(screen, startY, px + 26, 'Sail', HEADER);
  _writeText(screen, startY, px + 31, 'Gun', HEADER);
  _writeText(screen, startY, px + 35, 'Loy', HEADER);
  _writeText(screen, startY, px + 39, 'Mor', HEADER);
  _writeText(screen, startY, px + 43, 'Role', HEADER);
  _writeText(screen, startY, px + 52, 'Trait', HEADER);

  // Separator
  _drawHLine(screen, startY + 1, px + 2, panelW - 4);

  if (crew.members.length === 0) {
    _writeText(screen, startY + 2, px + 3, 'No crew. Visit the Recruit tab.', CANT_AFFORD);
    return;
  }

  for (let i = 0; i < crew.members.length && i < maxRows - 2; i++) {
    const m = crew.members[i];
    const y = startY + 2 + i;
    const sel = i === ui.cursor;
    const attr = sel ? ROW_SELECTED : ROW_NORMAL;

    if (sel) _highlightRow(screen, y, px + 2, panelW - 4, ROW_SELECTED);

    const ptr = sel ? '\u25B6 ' : '  ';
    _writeText(screen, y, px + 1, ptr, attr);
    _writeText(screen, y, px + 3, m.name.slice(0, 18), attr);
    _writeText(screen, y, px + 22, String(Math.round(m.strength)), attr);
    _writeText(screen, y, px + 26, String(Math.round(m.sailing)), attr);
    _writeText(screen, y, px + 31, String(Math.round(m.gunnery)), attr);
    _writeText(screen, y, px + 35, String(Math.round(m.loyalty)), attr);
    _writeText(screen, y, px + 39, String(Math.round(m.morale)), moraleColor(Math.round(m.morale)));
    _writeText(screen, y, px + 43, m.role === 'none' ? '-' : m.role, attr);
    _writeText(screen, y, px + 52, m.trait, attr);
  }
}

function _renderRecruit(screen, ui, crew, eco, px, startY, panelW, maxRows) {
  _writeText(screen, startY, px + 3, 'Name', HEADER);
  _writeText(screen, startY, px + 22, 'Str', HEADER);
  _writeText(screen, startY, px + 26, 'Sail', HEADER);
  _writeText(screen, startY, px + 31, 'Gun', HEADER);
  _writeText(screen, startY, px + 35, 'Trait', HEADER);
  _writeText(screen, startY, px + 50, 'Cost', HEADER);

  _drawHLine(screen, startY + 1, px + 2, panelW - 4);

  if (ui.candidates.length === 0) {
    _writeText(screen, startY + 2, px + 3, 'No one looking for work today.', CANT_AFFORD);
    return;
  }

  for (let i = 0; i < ui.candidates.length && i < maxRows - 2; i++) {
    const c = ui.candidates[i];
    const y = startY + 2 + i;
    const sel = i === ui.cursor;
    const canAfford = eco.gold >= c.cost && crew.members.length < crew.maxCrew;
    const attr = sel ? ROW_SELECTED : ROW_NORMAL;
    const costAttr = sel ? ROW_SELECTED : (canAfford ? ROW_NORMAL : CANT_AFFORD);

    if (sel) _highlightRow(screen, y, px + 2, panelW - 4, ROW_SELECTED);

    const ptr = sel ? '\u25B6 ' : '  ';
    _writeText(screen, y, px + 1, ptr, attr);
    _writeText(screen, y, px + 3, c.name.slice(0, 18), attr);
    _writeText(screen, y, px + 22, String(c.strength), attr);
    _writeText(screen, y, px + 26, String(c.sailing), attr);
    _writeText(screen, y, px + 31, String(c.gunnery), attr);
    _writeText(screen, y, px + 35, c.trait, attr);
    _writeText(screen, y, px + 50, `${c.cost} rds`, costAttr);
  }
}

function _renderPay(screen, ui, crew, eco, px, startY, panelW, maxRows) {
  const cost = crew.members.length * 5;

  _writeText(screen, startY, px + 3, 'Your crew expects regular wages.', ROW_NORMAL);
  _writeText(screen, startY + 2, px + 3, `Crew size: ${crew.members.length}`, HEADER);
  _writeText(screen, startY + 3, px + 3, `Pay rate: 5 rds per head`, HEADER);
  _writeText(screen, startY + 4, px + 3, `Total cost: ${cost} rds`, TITLE);
  _writeText(screen, startY + 5, px + 3, `Your gold: ${eco.gold} rds`, HEADER);
  _writeText(screen, startY + 6, px + 3, `Days since last pay: ${crew.daysSincePay}`,
    crew.daysSincePay > 10 ? BAD : HEADER);

  _writeText(screen, startY + 8, px + 3, 'Press SPACE to pay crew.',
    eco.gold >= cost ? GOOD : CANT_AFFORD);
}

function _renderRoleMenu(screen, ui, crew, px, py, panelW, panelH) {
  const member = crew.members[ui.cursor];
  if (!member) return;

  const roles = [
    { id: ROLES.NONE,     label: 'Unassigned', desc: 'No role bonus' },
    { id: ROLES.GUNNERY,  label: 'Gunnery',    desc: 'Faster reload, better aim' },
    { id: ROLES.SAILING,  label: 'Sailing',    desc: 'Better ship speed' },
    { id: ROLES.BOARDING,  label: 'Boarding',   desc: 'Better melee combat' },
  ];

  // Small sub-panel
  const mw = 36;
  const mh = 8;
  const mx = px + Math.floor((panelW - mw) / 2);
  const my = py + Math.floor((panelH - mh) / 2);

  for (let y = my; y < my + mh; y++) {
    const row = screen.lines[y];
    if (!row) continue;
    for (let x = mx; x < mx + mw && x < row.length; x++) {
      row[x][0] = BG;
      row[x][1] = ' ';
    }
    row.dirty = true;
  }

  _drawBorder(screen, mx, my, mw, mh);
  _writeText(screen, my, mx + 2, ` Assign ${member.name.split(' ')[0]} `, TITLE);

  for (let i = 0; i < roles.length; i++) {
    const y = my + 2 + i;
    const sel = i === ui.roleCursor;
    const attr = sel ? ROW_SELECTED : ROW_NORMAL;
    const current = member.role === roles[i].id ? ' *' : '';

    if (sel) _highlightRow(screen, y, mx + 1, mw - 2, ROW_SELECTED);
    const ptr = sel ? '\u25B6 ' : '  ';
    _writeText(screen, y, mx + 1, ptr + roles[i].label + current, attr);
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

function _drawHLine(screen, y, startX, len) {
  const row = screen.lines[y];
  if (!row) return;
  for (let i = 0; i < len; i++) {
    const x = startX + i;
    if (x >= 0 && x < row.length) {
      row[x][0] = BORDER;
      row[x][1] = '\u2500';
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

module.exports = {
  createCrewUIState,
  crewHandleInput,
  crewUpdate,
  crewRender,
};
