'use strict';

const { sattr } = require('../render/tiles');

/**
 * Captain's Log: event-driven prose generation in 19th-century Danish captain's journal tone.
 */

// --- Templates by event type ---

const TEMPLATES = {
  new_day: [
    'Day {day}. The wind shifts as the sun rises over the Kattegat.',
    'Day {day}. Another dawn upon these restless waters.',
    'Day {day}. The crew stirs with the morning tide.',
  ],
  port_visit: [
    'We made port at {name}. The harbour bustled with trade and gossip.',
    'Dropped anchor at {name}. The crew was eager for solid ground.',
    'Arrived at {name}. The smell of fish and tar greeted us.',
  ],
  combat_win: [
    'Engaged the {name} and prevailed. The sea claimed another vessel.',
    'Victory against the {name}. The crew cheered as she sank beneath the waves.',
    'The {name} struck her colours. We plundered what we could.',
  ],
  combat_loss: [
    'We were bested in battle. The ship limps onward, hull groaning.',
    'A defeat most bitter. We retreated with what little pride remained.',
  ],
  treasure: [
    'Unearthed buried treasure on the island. Fortune smiles upon the bold.',
    'X marked the spot true. Gold and goods recovered from beneath the sand.',
  ],
  trade: [
    'Conducted trade at {port}. The markets were lively.',
    'Bought and sold goods at {port}. A fair exchange.',
  ],
  storm: [
    'A fearsome storm struck. The hull groaned under each wave.',
    'Thunder and lightning engulfed us. We battened the hatches and prayed.',
  ],
  barrel: [
    'Hid inside a barrel during infiltration. A most undignified but effective stratagem.',
  ],
  stealth_success: [
    'Infiltrated the fort without raising alarm. The guards suspected nothing.',
  ],
  melee_win: [
    'Won a close-quarters fight. Steel against steel, and I stood victorious.',
  ],
  convoy_complete: [
    'Escorted the convoy safely to its destination. The merchants were grateful.',
  ],
};

function _pickTemplate(type) {
  const list = TEMPLATES[type];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function _fillTemplate(template, data) {
  let result = template;
  if (data) {
    for (const [key, val] of Object.entries(data)) {
      result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), String(val));
    }
  }
  return result;
}

// --- Log state ---

function createLogState() {
  return {
    entries: [],         // [{day, text}]
    currentDayEvents: [], // [{type, data}] buffered for current day
    lastDay: 0,
  };
}

/**
 * Buffer an event for the current day.
 */
function logEvent(log, type, data) {
  if (!log) return;
  log.currentDayEvents.push({ type, data: data || {} });
}

/**
 * Flush buffered events into a prose paragraph for the given day.
 */
function flushDay(log, day) {
  if (!log) return;
  if (log.currentDayEvents.length === 0) return;

  const lines = [];
  for (const evt of log.currentDayEvents) {
    const template = _pickTemplate(evt.type);
    if (template) {
      lines.push(_fillTemplate(template, { ...evt.data, day }));
    }
  }

  if (lines.length > 0) {
    log.entries.push({ day, text: lines.join(' ') });
  }

  log.currentDayEvents = [];
  log.lastDay = day;
}

/**
 * Get all log entries.
 */
function getLogEntries(log) {
  return log ? log.entries : [];
}

// --- Log UI overlay ---

function createLogUIState() {
  return {
    scroll: 0,
  };
}

function logUIHandleInput(key, ui, log) {
  if (key === 'l' || key === 'q' || key === 'enter') {
    return false; // close
  }
  if (key === 'up') {
    ui.scroll = Math.max(0, ui.scroll - 1);
    return true;
  }
  if (key === 'down') {
    const entries = getLogEntries(log);
    ui.scroll = Math.min(Math.max(0, entries.length - 1), ui.scroll + 1);
    return true;
  }
  return true;
}

function logUIRender(screen, ui, log) {
  const entries = getLogEntries(log);
  const sw = screen.width;
  const sh = screen.height;

  const panelW = Math.min(60, sw - 4);
  const panelH = Math.min(20, sh - 4);
  const px = Math.floor((sw - panelW) / 2);
  const py = Math.floor((sh - panelH) / 2);

  const BG = sattr(233, 233);
  const BORDER = sattr(94, 233);
  const TITLE_ATTR = sattr(178, 233);
  const DAY_ATTR = sattr(226, 233);
  const TEXT_ATTR = sattr(252, 233);
  const HELP = sattr(240, 233);

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
  const _wc = (y, x, ch) => {
    const row = screen.lines[y];
    if (row && x >= 0 && x < row.length) { row[x][0] = BORDER; row[x][1] = ch; }
  };
  _wc(py, px, '\u250C');
  for (let x = px + 1; x < px + panelW - 1; x++) _wc(py, x, '\u2500');
  _wc(py, px + panelW - 1, '\u2510');
  _wc(py + panelH - 1, px, '\u2514');
  for (let x = px + 1; x < px + panelW - 1; x++) _wc(py + panelH - 1, x, '\u2500');
  _wc(py + panelH - 1, px + panelW - 1, '\u2518');
  for (let y = py + 1; y < py + panelH - 1; y++) {
    _wc(y, px, '\u2502');
    _wc(y, px + panelW - 1, '\u2502');
  }

  // Title
  const title = " Captain's Log ";
  _writeText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE_ATTR);

  if (entries.length === 0) {
    _writeText(screen, py + 3, px + 3, 'No entries yet.', TEXT_ATTR);
  } else {
    // Render entries with word wrapping
    const contentW = panelW - 6;
    const maxLines = panelH - 4;
    let lineIdx = 0;

    for (let i = ui.scroll; i < entries.length && lineIdx < maxLines; i++) {
      const entry = entries[i];
      const dayLabel = `Day ${entry.day}:`;
      _writeText(screen, py + 2 + lineIdx, px + 3, dayLabel, DAY_ATTR);
      lineIdx++;

      // Word-wrap the entry text
      const words = entry.text.split(' ');
      let line = '';
      for (const word of words) {
        if (line.length + word.length + 1 > contentW) {
          if (lineIdx >= maxLines) break;
          _writeText(screen, py + 2 + lineIdx, px + 3, line, TEXT_ATTR);
          lineIdx++;
          line = word;
        } else {
          line = line ? line + ' ' + word : word;
        }
      }
      if (line && lineIdx < maxLines) {
        _writeText(screen, py + 2 + lineIdx, px + 3, line, TEXT_ATTR);
        lineIdx++;
      }
      lineIdx++; // blank line between entries
    }
  }

  // Help
  const help = ' Up/Down: Scroll  L/Q: Close ';
  _writeText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP);
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
  createLogState,
  logEvent,
  flushDay,
  getLogEntries,
  createLogUIState,
  logUIHandleInput,
  logUIRender,
};
