'use strict';

const term = (process.env.TERM || '').toLowerCase();
if (term === 'xterm-ghostty' || term === 'ghostty') {
  process.env.TERM = 'xterm-256color';
}

const { createScreen } = require('./engine/screen');
const { StateMachine } = require('./engine/state');
const { GameLoop } = require('./engine/game-loop');
const { InputHandler } = require('./engine/input');
const { generateMap } = require('./world/map-gen');
const { TitleMode } = require('./modes/title');
const { OverworldMode } = require('./modes/overworld');
const { SpyglassMode } = require('./modes/spyglass');
const { PowerGaugeMode } = require('./modes/power-gauge');
const { DroneCamMode } = require('./modes/drone-cam');
const { HarborMode } = require('./modes/harbor');
const { PortMode } = require('./modes/port');
const { EncounterMode } = require('./modes/encounter');
const { IslandMode } = require('./modes/island');
const { MeleeMode } = require('./modes/melee');
const { StealthMode } = require('./modes/stealth');
const { createEconomyState } = require('./economy/goods');
const { createCrewState } = require('./crew/crew');
const { createReputationState } = require('./world/factions');
const { createWeatherState } = require('./world/weather');
const { createQuestState } = require('./world/quests');
const { createEventsState } = require('./world/events');
const { createFleetState } = require('./fleet/fleet');

async function main() {
  const screen = createScreen();

  // Show loading message
  const blessed = require('neo-blessed');
  const loadingBox = blessed.box({
    top: 'center',
    left: 'center',
    width: 40,
    height: 5,
    tags: true,
    content: '\n  {bold}Generating the Kattegat...{/bold}',
    border: { type: 'line' },
    style: {
      fg: '#b08550',
      bg: '#0a1628',
      border: { fg: '#b08550' },
    },
  });
  screen.append(loadingBox);
  screen.render();

  // Generate map
  const map = await generateMap('kattegat-default');

  // Remove loading message
  loadingBox.detach();

  // Initial game state
  const gameState = {
    map,
    ship: {
      x: 150,
      y: 100,
      direction: 0, // North
      hull: 100,
      maxHull: 100,
      name: 'Drakar',
      moveAccum: 0,
    },
    wind: {
      direction: 2,   // East
      strength: 3,
      changeTimer: 30,
    },
    currentSpeed: 0,
    economy: createEconomyState(),
    crew: createCrewState(),
    reputation: createReputationState(),
    weather: createWeatherState(),
    quests: createQuestState(),
    events: createEventsState(),
    fleet: createFleetState('Drakar'),
    questNotices: [],
    treasureMaps: [],
    melee: null,
    meleeResult: null,
    boardingNpcId: null,
    stealthInfo: null,
    crtEnabled: false,
  };

  // Set up state machine
  const sm = new StateMachine();
  const titleMode = new TitleMode(sm, gameState);
  const overworldMode = new OverworldMode(sm, gameState);
  const spyglassMode = new SpyglassMode(sm, gameState);
  const powerGaugeMode = new PowerGaugeMode(sm, gameState);
  const droneCamMode = new DroneCamMode(sm, gameState);
  const harborMode = new HarborMode(sm, gameState);
  const portMode = new PortMode(sm, gameState);
  const encounterMode = new EncounterMode(sm, gameState);
  const islandMode = new IslandMode(sm, gameState);
  const meleeMode = new MeleeMode(sm, gameState);
  const stealthMode = new StealthMode(sm, gameState);

  sm.register('TITLE', titleMode);
  sm.register('OVERWORLD', overworldMode);
  sm.register('SPYGLASS', spyglassMode);
  sm.register('POWER_GAUGE', powerGaugeMode);
  sm.register('DRONE_CAM', droneCamMode);
  sm.register('HARBOR', harborMode);
  sm.register('PORT', portMode);
  sm.register('ENCOUNTER', encounterMode);
  sm.register('ISLAND', islandMode);
  sm.register('MELEE', meleeMode);
  sm.register('STEALTH', stealthMode);

  // Set up input
  new InputHandler(screen, sm);

  // Start game loop
  const loop = new GameLoop(sm, screen);

  // Transition to title screen
  sm.transition('TITLE', gameState);

  loop.start();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
