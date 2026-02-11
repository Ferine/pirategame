'use strict';

const blessed = require('neo-blessed');
const { getWeatherEffects } = require('../world/weather');

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

  // Weather display
  let weatherStr = '';
  if (gameState.weather) {
    const wx = getWeatherEffects(gameState.weather);
    weatherStr = `    ${wx.label} ${wx.icon}`;
  }

  const line1 = `  Wind: ${windArrow} ${windDir} ${strengthBars}    Ship: ${shipDir}    Speed: ${speed} kn${weatherStr}`;
  const line2 = `  Pos: (${ship.x}, ${ship.y})    Hull: ${ship.hull}/${ship.maxHull}    ${ship.name}`;

  box.setContent(`{bold}${line1}{/bold}\n${line2}`);
}

module.exports = { createHUD, updateHUD, HUD_HEIGHT };
