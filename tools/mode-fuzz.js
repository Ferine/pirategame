'use strict';
/*
 * Headless mode fuzzer. Creates a real (headless) blessed screen, builds a full
 * gameState, then drives each mode through enter/update/render/handleInput across
 * many frames with a broad input alphabet. Crashes are collected per mode.
 *
 * Usage: node tools/mode-fuzz.js [frames] [seed]
 */
process.env.TERM = 'xterm-256color';
// Isolate all disk side effects (saves, persistent stats, crash log) to a temp
// dir so fuzzing never touches the real ~/.kattegat-kaper data.
process.env.HOME = require('os').tmpdir() + '/kk-fuzz-home';

const blessed = require('neo-blessed');
const { generateMap } = require('../src/world/map-gen');
const { StateMachine } = require('../src/engine/state');
const { createEconomyState } = require('../src/economy/goods');
const { createCrewState } = require('../src/crew/crew');
const { createReputationState } = require('../src/world/factions');
const { createWeatherState } = require('../src/world/weather');
const { createQuestState } = require('../src/world/quests');
const { createEventsState } = require('../src/world/events');
const { createFleetState } = require('../src/fleet/fleet');
const { createCampaignState } = require('../src/story/campaign');
const { createStats, loadPersistent } = require('../src/meta/legacy');
const { createLogState } = require('../src/meta/captains-log');
const { createCodecState } = require('../src/world/codec-ships');
const { createCombatState } = require('../src/combat/combat-state');
const { createMeleeState } = require('../src/combat/melee-state');
const { createNPCShips, FACTION } = require('../src/world/npc-ships');
const { createHarborState } = require('../src/harbor/lanes');

const modeFiles = {
  TITLE: ['../src/modes/title', 'TitleMode'],
  OVERWORLD: ['../src/modes/overworld', 'OverworldMode'],
  SPYGLASS: ['../src/modes/spyglass', 'SpyglassMode'],
  POWER_GAUGE: ['../src/modes/power-gauge', 'PowerGaugeMode'],
  DRONE_CAM: ['../src/modes/drone-cam', 'DroneCamMode'],
  HARBOR: ['../src/modes/harbor', 'HarborMode'],
  PORT: ['../src/modes/port', 'PortMode'],
  ENCOUNTER: ['../src/modes/encounter', 'EncounterMode'],
  ISLAND: ['../src/modes/island', 'IslandMode'],
  MELEE: ['../src/modes/melee', 'MeleeMode'],
  STEALTH: ['../src/modes/stealth', 'StealthMode'],
  CREDITS: ['../src/modes/credits', 'CreditsMode'],
  CODEC: ['../src/modes/codec', 'CodecMode'],
};

const FRAMES = parseInt(process.argv[2] || '300', 10);
let SEED = parseInt(process.argv[3] || '12345', 10);
function rng() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; }

const KEYS = [
  { name: 'up' }, { name: 'down' }, { name: 'left' }, { name: 'right' },
  { name: 'enter' }, { name: 'space' }, { name: 'escape' }, { name: 'tab' },
  ...'wasdcvnmrfjlhgptx12'.split('').map(ch => ({ name: ch, ch })),
  { name: '?', ch: '?' },
];

function makeScreen() {
  const stream = require('fs').createWriteStream('/dev/null');
  stream.columns = 130; stream.rows = 44; stream.isTTY = true;
  const screen = blessed.screen({ output: stream, input: process.stdin, smartCSR: false, terminal: 'xterm-256color' });
  return screen;
}

function buildState(map) {
  return {
    map,
    ship: { x: 150, y: 100, direction: 0, hull: 100, maxHull: 100, name: 'Drakar', moveAccum: 0 },
    wind: { direction: 2, strength: 3, changeTimer: 30 },
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
    campaign: createCampaignState(),
    convoy: null, blockade: null, melee: null, meleeResult: null, boardingNpcId: null,
    stealthInfo: null, crtEnabled: false,
    stats: createStats(), difficulty: 'normal',
    captainsLog: createLogState(), persistent: loadPersistent(),
    achievementToasts: [], ngPlus: false,
    codec: createCodecState(), codecShips: [],
    npcShips: [],
  };
}

function makeNpc(faction) {
  return {
    id: 1, x: 151, y: 100, faction: faction || FACTION.MERCHANT,
    name: 'Test Vessel', hull: 60, maxHull: 60, crew: 20, masts: 2,
    cargo: { cod: 5, iron: 2 }, gold: 120, direction: 4,
    vx: 0, vy: 0, waypoint: null, hostile: false,
  };
}

// Per-mode precondition setup. Returns a transition-able gameState mutation.
function preconditions(name, gs) {
  switch (name) {
    case 'OVERWORLD':
      gs._showIntro = true; // exercise the first-run welcome overlay
      break;
    case 'SPYGLASS':
    case 'POWER_GAUGE':
    case 'DRONE_CAM':
      gs.combat = createCombatState(gs);
      if (!gs.combat.wind) gs.combat.wind = gs.wind;
      gs.combat.ammo = gs.combat.ammo || 'iron';
      gs.combat.power = 50; gs.combat.aimX = 0; gs.combat.aimY = 0;
      break;
    case 'ENCOUNTER':
      gs.encounter = makeNpc(FACTION.ENGLISH);
      break;
    case 'MELEE':
      gs.melee = createMeleeState(gs, 'boarding', null);
      break;
    case 'PORT':
      gs.portInfo = { name: 'Copenhagen', x: 150, y: 100 };
      break;
    case 'HARBOR':
      gs.harbor = createHarborState(gs, { name: 'Copenhagen', desc: 'The capital' });
      break;
    case 'STEALTH':
      gs.stealthInfo = { templateId: 'fort', faction: FACTION.ENGLISH, npcId: 1, seed: 7 };
      break;
    case 'ISLAND':
      gs.islandInfo = { id: 0, name: 'Anholt', seed: 42 };
      gs.treasureMaps = [];
      break;
    case 'CREDITS':
      gs.campaign.ending = 'hero';
      break;
  }
}

async function main() {
  const screen = makeScreen();
  const map = await generateMap('kattegat-default');
  const results = [];

  for (const [name, [file, cls]] of Object.entries(modeFiles)) {
    const Mode = require(file)[cls];
    const sm = new StateMachine();
    // Stub transition: record target & stop driving (don't actually swap/enter another mode).
    let transitionedTo = null;
    sm.transition = (target) => { transitionedTo = target; };
    const gs = buildState(map);
    gs.npcShips = createNPCShips(gs, map);
    const errors = [];
    let mode;
    try {
      mode = new Mode(sm, gs);
    } catch (e) {
      results.push({ name, stage: 'construct', errors: [String(e && e.stack || e)] });
      continue;
    }
    sm.register(name, mode);

    // enter
    try {
      preconditions(name, gs);
      if (mode.enter) mode.enter(gs);
    } catch (e) {
      errors.push(`enter: ${e && e.stack || e}`);
    }

    // drive frames. If the mode transitions away, re-arm it (clear target & re-enter)
    // so we keep fuzzing this mode rather than poking a logically-exited instance.
    for (let f = 0; f < FRAMES && errors.length < 6; f++) {
      const dt = 0.04 + rng() * 0.08;
      try { if (mode.update) mode.update(dt); }
      catch (e) { errors.push(`update@${f}: ${e && e.message}`); }
      if (transitionedTo) { transitionedTo = null; try { preconditions(name, gs); mode.enter(gs); } catch (e) { errors.push(`re-enter@${f}: ${e && e.message}`); } continue; }
      try { if (mode.render) mode.render(screen); }
      catch (e) { errors.push(`render@${f}: ${e && e.message}`); }
      // feed 1-2 inputs per frame
      const nKeys = rng() < 0.5 ? 1 : 2;
      for (let k = 0; k < nKeys; k++) {
        const key = KEYS[Math.floor(rng() * KEYS.length)];
        try { if (mode.handleInput) mode.handleInput(key); }
        catch (e) { errors.push(`input(${key.name})@${f}: ${e && e.message}`); }
        if (transitionedTo) { transitionedTo = null; try { preconditions(name, gs); mode.enter(gs); } catch (e) { errors.push(`re-enter@${f}: ${e && e.message}`); } break; }
      }
    }
    try { if (mode.exit) mode.exit(); } catch (e) { errors.push(`exit: ${e && e.message}`); }

    results.push({ name, errors });
  }

  // report
  let totalErr = 0;
  console.log('=== MODE FUZZ RESULTS (frames=' + FRAMES + ') ===');
  for (const r of results) {
    if (r.errors.length === 0) {
      console.log(`  OK   ${r.name}`);
    } else {
      totalErr += r.errors.length;
      console.log(`  FAIL ${r.name} (${r.errors.length})`);
      const seen = new Set();
      for (const e of r.errors) {
        const sig = e.split('\n')[0].slice(0, 120);
        if (seen.has(sig)) continue;
        seen.add(sig);
        console.log('       ' + sig);
      }
    }
  }
  console.log(`\nTotal error instances: ${totalErr}`);
  process.exit(totalErr > 0 ? 2 : 0);
}

main().catch(e => { console.error('HARNESS FATAL', e); process.exit(1); });
