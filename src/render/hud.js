'use strict';

const blessed = require('neo-blessed');
const { getWeatherEffects } = require('../world/weather');
const { getQuarterName, getMoonPhase, getSeason } = require('../world/day-night');
const { getHelmsmanHUDText } = require('../world/helmsman');

const COMPASS_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const WIND_ARROWS = ['\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196'];
// ↑ ↗ → ↘ ↓ ↙ ← ↖

const HUD_HEIGHT = 4;

function createHUD(screen) {
  const box = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: HUD_HEIGHT,
    tags: true,
    style: {
      fg: 'white',
      bg: '#1a1a2e',
      border: {
        fg: '#b08550',
      },
    },
    border: {
      type: 'line',
    },
  });

  screen.append(box);
  return box;
}

function updateHUD(box, gameState) {
  if (!gameState || !gameState.wind || !gameState.ship) return;

  const { wind, ship } = gameState;

  const windDir = COMPASS_NAMES[wind.direction];
  const windArrow = WIND_ARROWS[wind.direction];
  const strengthBars = '\u25AE'.repeat(wind.strength) + '\u25AF'.repeat(5 - wind.strength);
  // ▮ and ▯

  const shipDir = COMPASS_NAMES[ship.direction];
  const speed = (gameState.currentSpeed || 0).toFixed(1);

  // Sail trim quality based on ship-vs-wind angle
  let diff = Math.abs(ship.direction - wind.direction);
  if (diff > 4) diff = 8 - diff;
  const TRIM_LABELS = ['DEAD', 'POOR', 'GREAT', 'GOOD', 'FAIR'];
  const trimLabel = TRIM_LABELS[diff] || 'FAIR';

  // Weather display
  let weatherStr = '';
  if (gameState.weather) {
    const wx = getWeatherEffects(gameState.weather);
    weatherStr = `    ${wx.label} ${wx.icon}`;
  }

  // Day/night cycle display
  let timeStr = '';
  if (gameState.quests) {
    const q = gameState.quests;
    const quarter = getQuarterName(q.clockAccum);
    const moon = getMoonPhase(q.day || 1);
    const season = getSeason(q.day || 1);
    timeStr = `    Day ${q.day || 1} ${quarter} ${moon.icon} ${season.name}`;
  }

  // Convoy info
  let convoyStr = '';
  if (gameState.convoy && gameState.convoy.active) {
    const alive = gameState.convoy.escorts.filter(e => e.alive).length;
    const total = gameState.convoy.escorts.length;
    const timer = Math.ceil(gameState.convoy.timer);
    const formation = (gameState.convoy.formation || 'tight').toUpperCase();
    convoyStr = `    CONVOY: ${alive}/${total} ${formation} ${timer}s`;
  }

  // Helmsman info
  let helmsmanStr = '';
  if (gameState.helmsman) {
    const ht = getHelmsmanHUDText(gameState.helmsman);
    if (ht) helmsmanStr = `    ${ht}`;
  }

  const line1 = `  Wind: ${windArrow} ${windDir} ${strengthBars}    Ship: ${shipDir}    Trim: ${trimLabel}    Speed: ${speed} kn${weatherStr}${timeStr}${convoyStr}${helmsmanStr}`;
  const defaultLine2 = `  Pos: (${ship.x}, ${ship.y})    Hull: ${ship.hull}/${ship.maxHull}    ${ship.name}`;
  const notice = (gameState.hudMessage || '').replace(/[{}]/g, '').trim();
  const line2 = notice ? `  Notice: ${notice}` : defaultLine2;

  box.setContent(`{bold}${line1}{/bold}\n${line2}`);
}

module.exports = { createHUD, updateHUD, HUD_HEIGHT };
