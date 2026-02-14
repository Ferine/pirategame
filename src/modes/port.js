'use strict';

const { FOV } = require('rot-js');
const { sattr } = require('../render/tiles');
const { T, TOWN_TILES, TOWN_W, TOWN_H, generateTownMap } = require('../port/town-map');
const { createShopState, shopHandleInput, shopUpdate, shopRender } = require('../economy/shop-ui');
const { createCrewUIState, crewHandleInput, crewUpdate, crewRender } = require('../crew/crew-ui');
const { onPortVisit } = require('../crew/crew');
const { FACTION_INFO, getRepTier } = require('../world/factions');
const { createMeleeState } = require('../combat/melee-state');
const { spawnTownNPCs } = require('../port/town-npcs');
const { saveGame } = require('../engine/save-load');
const { relocateShipToSafeWater } = require('../world/navigation');
const {
  ensureQuestState,
  getPortOffers,
  acceptPortOffer,
  abandonActiveQuest,
  resolvePortArrivalQuests,
} = require('../world/quests');
const { getQuarter } = require('../world/day-night');
const { createFleetUIState, fleetHandleInput, fleetUpdate, fleetRender } = require('../fleet/fleet-ui');
const { syncFromGameState, syncToGameState } = require('../fleet/fleet');
const { getPortStoryNPCs } = require('../story/npcs');
const { getDialog } = require('../story/dialog');
const { advanceCampaign } = require('../story/campaign');
const { createJournalState, journalHandleInput, journalRender } = require('../story/journal-ui');
const { syncAndCheckAchievements } = require('../meta/legacy');
const { logEvent } = require('../meta/captains-log');
const { createLogUIState, logUIHandleInput, logUIRender } = require('../meta/captains-log');

const PLAYER_CH = '@';
const PLAYER_ATTR = sattr(208, 0); // amber on black

const SIGHT_RANGE = 12;
const LANTERN_BONUS = 4; // extra FOV range near lanterns

// HUD area at bottom
const HUD_ROWS = 3;

// Building interaction labels
const BUILDING_NAMES = {
  [T.TAVERN]:         'Tavern',
  [T.MARKET]:         'Market',
  [T.SHIPWRIGHT]:     'Shipwright',
  [T.HARBOR_MASTER]:  'Harbor Master',
  [T.CHURCH]:         'Church',
};

const BUILDING_MESSAGES = {
  [T.TAVERN]:         'The tavern smells of salt pork and dubious ale.',
  [T.MARKET]:         'Fishwives argue over the price of herring.',
  [T.SHIPWRIGHT]:     'The smell of fresh-cut timber fills the air.',
  [T.HARBOR_MASTER]:  'Charts and ledgers cover every surface.',
  [T.CHURCH]:         'A quiet refuge. Lutheran hymns echo faintly.',
};

// Water animation chars
const WATER_CHARS = ['~', '\u2248', '\u223C', '~'];

class PortMode {
  constructor(stateMachine, gameState) {
    this.stateMachine = stateMachine;
    this.gameState = gameState;
    this.townMap = null;
    this.playerX = 0;
    this.playerY = 0;
    this.fov = null;
    this.visible = null;    // current frame visibility
    this.explored = null;   // persistent explored tiles
    this.camera = { x: 0, y: 0 };
    this.viewW = 0;
    this.viewH = 0;
    this.message = '';
    this.messageTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.portName = '';
    this.shop = null;    // active shop overlay (market or shipwright)
    this.crewUI = null;  // active crew/tavern overlay
    this.repUI = false;  // reputation display overlay (harbor master)
    this.questUI = null; // mission board overlay
    this.npcs = [];      // town NPCs
    this.fleetUI = null; // fleet roster overlay
    this.journalUI = null; // campaign journal overlay
    this.dialogUI = null;  // story NPC dialog overlay
    this.logUI = null;     // captain's log overlay
  }

  enter(gameState) {
    this.gameState = gameState;
    const portInfo = gameState.portInfo;
    this.portName = portInfo ? portInfo.name : 'Port';

    // Generate town
    this.townMap = generateTownMap(this.portName);
    this.playerX = this.townMap.spawn.x;
    this.playerY = this.townMap.spawn.y;

    // Allocate visibility arrays
    const size = this.townMap.width * this.townMap.height;
    this.visible = new Uint8Array(size);
    this.explored = new Uint8Array(size);

    // Set up FOV
    const self = this;
    this.fov = new FOV.RecursiveShadowcasting(
      (x, y) => {
        if (x < 0 || x >= self.townMap.width || y < 0 || y >= self.townMap.height) return false;
        const tile = self.townMap.tiles[y * self.townMap.width + x];
        return TOWN_TILES[tile] ? TOWN_TILES[tile].transparent : false;
      },
      { topology: 8 }
    );

    this._computeFOV();
    this.message = `You step ashore at ${this.portName}.`;
    this.messageTimer = 4.0;

    // Ensure quests are initialized and resolve any completed/failed contracts.
    ensureQuestState(gameState);
    const questEvents = resolvePortArrivalQuests(gameState, this.portName);
    if (questEvents.length > 0) {
      this.message = questEvents[0];
      this.messageTimer = 6.0;
    } else if (gameState.questNotices && gameState.questNotices.length > 0) {
      this.message = gameState.questNotices.shift();
      this.messageTimer = 5.0;
    }

    // Spawn town NPCs
    this.npcs = spawnTownNPCs(this.townMap);

    // Inject story NPCs if campaign is active
    if (gameState.campaign && gameState.campaign.act > 0) {
      const storyNPCs = getPortStoryNPCs(this.portName, gameState.campaign.act, this.townMap);
      this.npcs.push(...storyNPCs);

      // Process campaign port-enter event
      const effects = advanceCampaign(gameState.campaign, 'port_enter',
        { portName: this.portName, day: gameState.quests ? gameState.quests.day : 0 },
        gameState.reputation);
      for (const eff of effects) {
        if (eff.type === 'notice') {
          gameState.questNotices = (gameState.questNotices || []).concat([eff.message]);
        }
      }
    }

    // Sync fleet on port entry
    if (gameState.fleet) {
      syncFromGameState(gameState.fleet, gameState);
    }

    // Auto-save on port visit
    if (saveGame(gameState, 'auto')) {
      this.message += ' Game saved.';
    }

    // Crew morale boost from port visit
    if (gameState.crew) {
      onPortVisit(gameState.crew);
    }

    // Track unique port visits
    if (gameState.stats) {
      if (!gameState.stats.portsVisitedSet.includes(this.portName)) {
        gameState.stats.portsVisitedSet.push(this.portName);
      }
      gameState.stats.uniquePortsVisited = gameState.stats.portsVisitedSet.length;
    }

    // Captain's log
    logEvent(gameState.captainsLog, 'port_visit', { name: this.portName });

    // Sync achievements on port visit
    syncAndCheckAchievements(gameState);
  }

  exit() {
    this.townMap = null;
    this.visible = null;
    this.explored = null;
    this.fov = null;
    this.questUI = null;
    this.fleetUI = null;
    this.journalUI = null;
    this.dialogUI = null;
    this.logUI = null;
  }

  update(dt) {
    // Water animation
    this.animTimer += dt;
    if (this.animTimer >= 0.5) {
      this.animTimer -= 0.5;
      this.animFrame = (this.animFrame + 1) % 4;
    }

    // Message fadeout
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        this.message = '';
      }
    }

    // Shop overlay
    if (this.shop) {
      shopUpdate(dt, this.shop);
    }

    // Crew UI overlay
    if (this.crewUI) {
      crewUpdate(dt, this.crewUI);
    }

    // Fleet UI overlay
    if (this.fleetUI) {
      fleetUpdate(dt, this.fleetUI);
    }
  }

  render(screen) {
    this.viewW = screen.width;
    this.viewH = screen.height - HUD_ROWS;

    this._updateCamera();

    // Render town tiles
    for (let sy = 0; sy < this.viewH; sy++) {
      const my = this.camera.y + sy;
      const row = screen.lines[sy];
      if (!row) continue;

      for (let sx = 0; sx < this.viewW; sx++) {
        const mx = this.camera.x + sx;
        if (sx >= row.length) continue;

        if (mx < 0 || mx >= this.townMap.width || my < 0 || my >= this.townMap.height) {
          // Out of bounds — black
          row[sx][0] = sattr(0, 0);
          row[sx][1] = ' ';
          continue;
        }

        const idx = my * this.townMap.width + mx;
        const isVisible = this.visible[idx];
        const isExplored = this.explored[idx];
        const tileType = this.townMap.tiles[idx];
        const def = TOWN_TILES[tileType];

        if (isVisible) {
          let ch = def ? def.ch : '?';
          let attr = def ? def.attr : 0;

          // Animate water
          if (tileType === T.WATER) {
            ch = WATER_CHARS[(mx + my + this.animFrame) % WATER_CHARS.length];
          }

          row[sx][0] = attr;
          row[sx][1] = ch;
        } else if (isExplored) {
          // Dark grey silhouette
          let ch = def ? def.ch : ' ';
          if (tileType === T.WATER) ch = '~';
          row[sx][0] = sattr(237, 233);
          row[sx][1] = ch;
        } else {
          // Unexplored — black
          row[sx][0] = sattr(233, 233);
          row[sx][1] = ' ';
        }
      }
      row.dirty = true;
    }

    // Render NPCs
    this._renderNPCs(screen);

    // Render player
    this._renderPlayer(screen);

    // Render building labels for visible doors
    this._renderBuildingLabels(screen);

    // Render HUD
    this._renderHUD(screen);

    // Shop overlay on top of everything
    if (this.shop) {
      shopRender(screen, this.shop, this.gameState);
    }

    // Crew/tavern overlay
    if (this.crewUI) {
      crewRender(screen, this.crewUI, this.gameState);
    }

    // Reputation overlay (harbor master)
    if (this.repUI) {
      this._renderReputationUI(screen);
    }

    // Mission board overlay
    if (this.questUI) {
      this._renderQuestBoard(screen);
    }

    // Fleet roster overlay
    if (this.fleetUI) {
      fleetRender(screen, this.fleetUI, this.gameState);
    }

    // Story dialog overlay
    if (this.dialogUI) {
      this._renderDialog(screen);
    }

    // Campaign journal overlay
    if (this.journalUI) {
      journalRender(screen, this.journalUI, this.gameState.campaign);
    }

    // Captain's log overlay
    if (this.logUI) {
      logUIRender(screen, this.logUI, this.gameState.captainsLog);
    }
  }

  handleInput(key) {
    // Route to log overlay if open
    if (this.logUI) {
      const consumed = logUIHandleInput(key, this.logUI, this.gameState.captainsLog);
      if (!consumed) {
        this.logUI = null;
      }
      return;
    }

    // Route to dialog overlay if open
    if (this.dialogUI) {
      this._handleDialogInput(key);
      return;
    }

    // Route to journal overlay if open
    if (this.journalUI) {
      const consumed = journalHandleInput(key, this.journalUI, this.gameState.campaign);
      if (!consumed) {
        this.journalUI = null;
      }
      return;
    }

    // Route to fleet UI if open
    if (this.fleetUI) {
      const consumed = fleetHandleInput(key, this.fleetUI, this.gameState);
      if (!consumed) {
        this.fleetUI = null;
      }
      return;
    }

    // Route to reputation display if open
    if (this.repUI) {
      if (key === 'q' || key === 'enter' || key === 'space') {
        this.repUI = false;
      }
      return;
    }

    // Route to mission board if open
    if (this.questUI) {
      this._handleQuestInput(key);
      return;
    }

    // Route to crew UI if open
    if (this.crewUI) {
      const consumed = crewHandleInput(key, this.crewUI, this.gameState);
      if (!consumed) {
        this.crewUI = null;
      }
      return;
    }

    // Route to shop overlay if open
    if (this.shop) {
      const consumed = shopHandleInput(key, this.shop, this.gameState);
      if (!consumed) {
        this.shop = null; // close shop
      }
      return;
    }

    // Talk to nearby NPC without triggering building interactions
    if (key === 't') {
      const npc = this._findAdjacentNPC();
      if (npc) {
        if (npc.storyNpcId && this.gameState.campaign) {
          this._openStoryDialog(npc);
        } else {
          this.message = npc.greeting;
        }
      } else {
        this.message = 'No one nearby to talk to.';
      }
      this.messageTimer = 4.0;
      return;
    }

    // Captain's log
    if (key === 'l' && this.gameState.captainsLog) {
      this.logUI = createLogUIState();
      return;
    }

    // Campaign journal
    if (key === 'j' && this.gameState.campaign) {
      this.journalUI = createJournalState(this.gameState.campaign);
      return;
    }

    if (key === 'm') {
      this._openQuestBoard('available');
      return;
    }

    if (key === 'r' && this.gameState.reputation) {
      this.repUI = true;
      return;
    }

    if (key === 'f' && this.gameState.fleet) {
      this.fleetUI = createFleetUIState(true, this.portName);
      return;
    }

    const dirMap = {
      up:    { dx: 0,  dy: -1 },
      down:  { dx: 0,  dy: 1 },
      left:  { dx: -1, dy: 0 },
      right: { dx: 1,  dy: 0 },
    };

    const dir = dirMap[key];
    if (dir) {
      const nx = this.playerX + dir.dx;
      const ny = this.playerY + dir.dy;

      // Bounds check
      if (nx < 0 || nx >= this.townMap.width || ny < 0 || ny >= this.townMap.height) return;

      const tile = this.townMap.tiles[ny * this.townMap.width + nx];
      const def = TOWN_TILES[tile];

      if (!def || !def.passable) return;

      this.playerX = nx;
      this.playerY = ny;
      this._computeFOV();

      // Check interactions
      this._checkTileInteraction(tile);
      return;
    }

    // Q to return to ship (from anywhere, as a shortcut)
    if (key === 'q') {
      this._returnToShip();
      return;
    }

    // Enter to interact with current tile
    if (key === 'enter') {
      const tile = this.townMap.tiles[this.playerY * this.townMap.width + this.playerX];
      this._interact(tile);
    }
  }

  // --- Private ---

  _computeFOV() {
    // Clear visible
    this.visible.fill(0);

    this.fov.compute(this.playerX, this.playerY, SIGHT_RANGE, (x, y) => {
      if (x >= 0 && x < this.townMap.width && y >= 0 && y < this.townMap.height) {
        const idx = y * this.townMap.width + x;
        this.visible[idx] = 1;
        this.explored[idx] = 1;
      }
    });
  }

  _updateCamera() {
    this.camera.x = Math.floor(this.playerX - this.viewW / 2);
    this.camera.y = Math.floor(this.playerY - this.viewH / 2);
    this.camera.x = Math.max(0, Math.min(this.townMap.width - this.viewW, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.townMap.height - this.viewH, this.camera.y));
  }

  _renderPlayer(screen) {
    const sx = this.playerX - this.camera.x;
    const sy = this.playerY - this.camera.y;

    if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) return;
    const row = screen.lines[sy];
    if (!row || sx >= row.length) return;

    row[sx][0] = PLAYER_ATTR;
    row[sx][1] = PLAYER_CH;
  }

  _renderNPCs(screen) {
    for (const npc of this.npcs) {
      const sx = npc.x - this.camera.x;
      const sy = npc.y - this.camera.y;
      if (sx < 0 || sx >= this.viewW || sy < 0 || sy >= this.viewH) continue;

      const idx = npc.y * this.townMap.width + npc.x;
      if (!this.visible[idx]) continue;

      const row = screen.lines[sy];
      if (!row || sx >= row.length) continue;
      row[sx][0] = npc.attr;
      row[sx][1] = npc.ch;
    }
  }

  _renderBuildingLabels(screen) {
    if (!this.townMap.buildings) return;

    for (const bld of this.townMap.buildings) {
      // Show label above door if door is visible
      const doorIdx = bld.doorY * this.townMap.width + bld.doorX;
      if (!this.visible[doorIdx]) continue;

      const sx = bld.doorX - this.camera.x;
      const sy = bld.doorY - this.camera.y - 1; // one row above door

      if (sy < 0 || sy >= this.viewH) continue;

      const label = bld.name;
      const startX = sx - Math.floor(label.length / 2);
      const row = screen.lines[sy];
      if (!row) continue;

      const labelAttr = sattr(178, 236); // amber on dark
      for (let i = 0; i < label.length; i++) {
        const x = startX + i;
        if (x >= 0 && x < this.viewW && x < row.length) {
          row[x][0] = labelAttr;
          row[x][1] = label[i];
        }
      }
    }
  }

  _renderHUD(screen) {
    const baseY = screen.height - HUD_ROWS;
    const hudAttr = sattr(178, 233);   // amber on dark
    const textAttr = sattr(250, 233);   // grey on dark
    const msgAttr = sattr(186, 233);    // light amber

    // Clear HUD area
    for (let y = baseY; y < screen.height; y++) {
      const row = screen.lines[y];
      if (!row) continue;
      for (let x = 0; x < screen.width && x < row.length; x++) {
        row[x][0] = sattr(233, 233);
        row[x][1] = ' ';
      }
      row.dirty = true;
    }

    // Top border
    const borderRow = screen.lines[baseY];
    if (borderRow) {
      const borderAttr = sattr(94, 233);
      for (let x = 0; x < screen.width && x < borderRow.length; x++) {
        borderRow[x][0] = borderAttr;
        borderRow[x][1] = '\u2500'; // ─
      }
    }

    // Line 1: port name + gold + controls
    const eco = this.gameState.economy;
    const goldStr = eco ? `  ${eco.gold} rds` : '';
    const line1 = ` ${this.portName}${goldStr}  |  Arrows: Walk  Enter: Interact  T: Talk  M: Missions  L: Log  Q: Ship`;
    this._writeHudText(screen, baseY + 1, 0, line1, hudAttr);

    // Line 2: message
    if (this.message) {
      this._writeHudText(screen, baseY + 2, 1, this.message, msgAttr);
    }
  }

  _writeHudText(screen, y, startX, text, attr) {
    const row = screen.lines[y];
    if (!row) return;
    for (let i = 0; i < text.length; i++) {
      const x = startX + i;
      if (x >= 0 && x < screen.width && x < row.length) {
        row[x][0] = attr;
        row[x][1] = text[i];
      }
    }
  }

  _checkTileInteraction(tile) {
    // Stepping onto ship tile
    if (tile === T.SHIP_TILE) {
      this.message = 'Your ship awaits. Press ENTER to set sail.';
      this.messageTimer = 5.0;
      return;
    }

    // Stepping through a door
    if (tile === T.DOOR) {
      // Find which building this door belongs to
      const bld = this._findBuildingAtDoor(this.playerX, this.playerY);
      if (bld) {
        const msg = BUILDING_MESSAGES[bld.floorType];
        this.message = msg || `You enter the ${bld.name}.`;
        this.messageTimer = 4.0;
      }
      return;
    }

    // Stepping onto building interior tiles — show hint for shops
    if (tile === T.TAVERN) {
      this.message = 'Press ENTER to recruit crew. Watch out for brawlers.';
      this.messageTimer = 3.0;
      return;
    }
    if (tile === T.MARKET) {
      this.message = 'Press ENTER to trade goods.';
      this.messageTimer = 3.0;
      return;
    }
    if (tile === T.SHIPWRIGHT) {
      this.message = 'Press ENTER to buy upgrades.';
      this.messageTimer = 3.0;
      return;
    }
    if (tile === T.HARBOR_MASTER) {
      this.message = 'Press ENTER for mission board. Press R for faction standings.';
      this.messageTimer = 3.0;
      return;
    }
    if (BUILDING_NAMES[tile]) {
      return;
    }
  }

  _interact(tile) {
    // If standing on an NPC tile, prioritize dialogue.
    const npcHere = this._findNPCAt(this.playerX, this.playerY);
    if (npcHere) {
      this.message = npcHere.greeting;
      this.messageTimer = 4.0;
      return;
    }

    // On ship tile — depart
    if (tile === T.SHIP_TILE) {
      this._returnToShip();
      return;
    }

    // Inside tavern — open crew/recruitment UI, chance of bar fight
    if (tile === T.TAVERN) {
      const quarter = this.gameState.quests ? getQuarter(this.gameState.quests.clockAccum) : 1;
      const barFightChance = quarter === 3 ? 0.40 : 0.25;
      if (Math.random() < barFightChance) {
        // Bar fight!
        this.gameState.melee = createMeleeState(this.gameState, 'barfight');
        this.stateMachine.transition('MELEE', this.gameState);
        return;
      }
      const recruitCount = quarter === 3 ? 6 : undefined;
      this.crewUI = createCrewUIState(this.portName, this.gameState, recruitCount);
      return;
    }

    // Inside market — open market shop (closed at night)
    if (tile === T.MARKET) {
      const quarter = this.gameState.quests ? getQuarter(this.gameState.quests.clockAccum) : 1;
      if (quarter === 3) {
        this.message = 'The market is closed at night.';
        this.messageTimer = 3.0;
        return;
      }
      this.shop = createShopState('market', this.portName, this.gameState);
      return;
    }

    // Inside shipwright — open shipwright shop (closed at night)
    if (tile === T.SHIPWRIGHT) {
      const quarter = this.gameState.quests ? getQuarter(this.gameState.quests.clockAccum) : 1;
      if (quarter === 3) {
        this.message = 'The shipwright is closed at night.';
        this.messageTimer = 3.0;
        return;
      }
      this.shop = createShopState('shipwright', this.portName, this.gameState);
      return;
    }

    // Inside harbor master — open reputation display
    if (tile === T.HARBOR_MASTER) {
      this._openQuestBoard('available');
      return;
    }

    // Inside other buildings
    const buildingName = BUILDING_NAMES[tile];
    if (buildingName) {
      const msg = BUILDING_MESSAGES[tile];
      this.message = msg || `You look around the ${buildingName}.`;
      this.messageTimer = 4.0;
      return;
    }

    // On door
    if (tile === T.DOOR) {
      const bld = this._findBuildingAtDoor(this.playerX, this.playerY);
      if (bld) {
        const doorQuarter = this.gameState.quests ? getQuarter(this.gameState.quests.clockAccum) : 1;
        if (bld.floorType === T.TAVERN) {
          const recruitCount = doorQuarter === 3 ? 6 : undefined;
          this.crewUI = createCrewUIState(this.portName, this.gameState, recruitCount);
        } else if (bld.floorType === T.MARKET) {
          if (doorQuarter === 3) {
            this.message = 'The market is closed at night.';
            this.messageTimer = 3.0;
            return;
          }
          this.shop = createShopState('market', this.portName, this.gameState);
        } else if (bld.floorType === T.SHIPWRIGHT) {
          if (doorQuarter === 3) {
            this.message = 'The shipwright is closed at night.';
            this.messageTimer = 3.0;
            return;
          }
          this.shop = createShopState('shipwright', this.portName, this.gameState);
        } else if (bld.floorType === T.HARBOR_MASTER) {
          this._openQuestBoard('available');
        } else {
          this.message = BUILDING_MESSAGES[bld.floorType] || `You enter the ${bld.name}.`;
          this.messageTimer = 4.0;
        }
      }
      return;
    }

    // Check for NPC adjacency
    const npc = this._findAdjacentNPC();
    if (npc) {
      this.message = npc.greeting;
      this.messageTimer = 4.0;
      return;
    }

    // Default
    this.message = 'Nothing of interest here.';
    this.messageTimer = 2.0;
  }

  _renderReputationUI(screen) {
    const rep = this.gameState.reputation;
    if (!rep) return;

    const sw = screen.width;
    const sh = screen.height;

    const panelW = Math.min(50, sw - 4);
    const panelH = Math.min(16, sh - 4);
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    const BG = sattr(233, 233);
    const BORDER = sattr(94, 233);
    const TITLE = sattr(178, 233);
    const HEADER = sattr(250, 233);
    const HELP = sattr(240, 233);

    // Color mapping for rep tiers
    const TIER_COLORS = {
      bad:     sattr(160, 233),
      warn:    sattr(208, 233),
      neutral: sattr(250, 233),
      good:    sattr(34, 233),
      great:   sattr(226, 233),
    };

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
    const title = ' Harbor Master - Reputation ';
    this._writeHudText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

    // Header row
    this._writeHudText(screen, py + 2, px + 3, 'Faction', HEADER);
    this._writeHudText(screen, py + 2, px + 24, 'Rep', HEADER);
    this._writeHudText(screen, py + 2, px + 30, 'Standing', HEADER);

    // Separator
    const sepRow = screen.lines[py + 3];
    if (sepRow) {
      for (let x = px + 2; x < px + panelW - 2 && x < sepRow.length; x++) {
        sepRow[x][0] = BORDER;
        sepRow[x][1] = '\u2500';
      }
    }

    // Faction rows
    const factions = ['crown', 'smuggler', 'navy', 'merchant', 'pirate'];
    for (let i = 0; i < factions.length; i++) {
      const rowY = py + 4 + i;
      const fid = factions[i];
      const info = FACTION_INFO[fid];
      const val = rep[fid] || 0;
      const tier = getRepTier(val);
      const tierAttr = TIER_COLORS[tier.color] || HEADER;

      // Icon + name
      this._writeHudText(screen, rowY, px + 3, `${info.icon} ${info.name}`, HEADER);
      // Value
      this._writeHudText(screen, rowY, px + 24, `${val}`, tierAttr);
      // Tier label
      this._writeHudText(screen, rowY, px + 30, tier.label, tierAttr);

      // Mini bar (10 chars wide)
      const barStart = px + 41;
      const barLen = Math.min(6, panelW - 44);
      if (barLen > 0) {
        const filled = Math.round((val / 100) * barLen);
        for (let b = 0; b < barLen; b++) {
          const bx = barStart + b;
          const bRow = screen.lines[rowY];
          if (bRow && bx < bRow.length) {
            bRow[bx][0] = b < filled ? tierAttr : sattr(237, 233);
            bRow[bx][1] = b < filled ? '\u2588' : '\u2591';
          }
        }
      }
    }

    // Help
    const help = ' Enter/Q: Close ';
    this._writeHudText(screen, py + panelH - 2, px + Math.floor((panelW - help.length) / 2), help, HELP);
  }

  _openQuestBoard(tab) {
    const quests = ensureQuestState(this.gameState);
    getPortOffers(quests, this.portName, this._getPortNames());
    this.questUI = {
      tab: tab || 'available', // available | active | history
      cursor: 0,
    };
  }

  _getPortNames() {
    if (!this.gameState.map || !Array.isArray(this.gameState.map.ports)) {
      return [this.portName];
    }
    return this.gameState.map.ports.map(p => p.name);
  }

  _getQuestListForTab(tab) {
    const quests = ensureQuestState(this.gameState);
    if (tab === 'available') {
      return getPortOffers(quests, this.portName, this._getPortNames());
    }
    if (tab === 'active') return quests.active;
    return quests.history;
  }

  _handleQuestInput(key) {
    if (!this.questUI) return;

    if (key === 'q' || key === 'm') {
      this.questUI = null;
      return;
    }

    if (key === 'r' && this.gameState.reputation) {
      this.questUI = null;
      this.repUI = true;
      return;
    }

    const tabs = ['available', 'active', 'history'];
    if (key === 'left') {
      const idx = tabs.indexOf(this.questUI.tab);
      this.questUI.tab = tabs[(idx + tabs.length - 1) % tabs.length];
      this.questUI.cursor = 0;
      return;
    }
    if (key === 'right') {
      const idx = tabs.indexOf(this.questUI.tab);
      this.questUI.tab = tabs[(idx + 1) % tabs.length];
      this.questUI.cursor = 0;
      return;
    }

    const list = this._getQuestListForTab(this.questUI.tab);
    if (key === 'up') {
      this.questUI.cursor = Math.max(0, this.questUI.cursor - 1);
      return;
    }
    if (key === 'down') {
      this.questUI.cursor = Math.min(Math.max(0, list.length - 1), this.questUI.cursor + 1);
      return;
    }

    if ((key === 'enter' || key === 'space') && this.questUI.tab === 'available') {
      const selected = list[this.questUI.cursor];
      if (selected) {
        const result = acceptPortOffer(ensureQuestState(this.gameState), this.portName, selected.id);
        if (result.ok) {
          this.message = `Accepted contract: ${selected.title}`;
          // Activate convoy or blockade on escort/blockade quest accept
          if (selected.type === 'escort') {
            const { createConvoyState } = require('../convoy/convoy');
            this.gameState.convoy = createConvoyState(selected, this.portName);
          }
          if (selected.type === 'blockade') {
            const { createBlockadeState } = require('../convoy/convoy');
            this.gameState.blockade = createBlockadeState(selected, this.portName);
          }
        } else {
          this.message = result.reason || 'Could not accept that contract.';
        }
        this.messageTimer = 4.0;
      }
      return;
    }

    if (key === 'x' && this.questUI.tab === 'active') {
      const selected = list[this.questUI.cursor];
      if (selected && abandonActiveQuest(ensureQuestState(this.gameState), selected.id)) {
        this.message = `Abandoned contract: ${selected.title}`;
        this.messageTimer = 3.0;
        this.questUI.cursor = Math.max(0, this.questUI.cursor - 1);
      }
    }
  }

  _renderQuestBoard(screen) {
    if (!this.questUI) return;

    const quests = ensureQuestState(this.gameState);
    const list = this._getQuestListForTab(this.questUI.tab);
    if (this.questUI.cursor >= list.length) {
      this.questUI.cursor = Math.max(0, list.length - 1);
    }

    const sw = screen.width;
    const sh = screen.height;
    const panelW = Math.min(74, sw - 4);
    const panelH = Math.min(20, sh - 4);
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    const BG = sattr(233, 233);
    const BORDER = sattr(94, 233);
    const TITLE = sattr(178, 233);
    const HEADER = sattr(250, 233);
    const HELP = sattr(240, 233);
    const SELECTED = sattr(233, 178);
    const SUB = sattr(244, 233);
    const SUCCESS = sattr(34, 233);
    const FAILED = sattr(160, 233);

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

    const title = ` Mission Board - Day ${quests.day || 1} `;
    this._writeHudText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE);

    const tabs = [
      this.questUI.tab === 'available' ? '[Available]' : ' Available ',
      this.questUI.tab === 'active' ? '[Active]' : ' Active ',
      this.questUI.tab === 'history' ? '[History]' : ' History ',
    ];
    this._writeHudText(screen, py + 2, px + 3, tabs.join('   '), HEADER);

    const listTop = py + 4;
    const listBottom = py + panelH - 4;
    const rowStep = 2;
    const maxRows = Math.max(1, Math.floor((listBottom - listTop + 1) / rowStep));
    const start = Math.max(0, Math.min(this.questUI.cursor - 2, Math.max(0, list.length - maxRows)));

    if (!list.length) {
      const emptyMsg = this.questUI.tab === 'available'
        ? 'No new contracts today. Return tomorrow.'
        : this.questUI.tab === 'active'
        ? 'No active contracts.'
        : 'No completed contracts yet.';
      this._writeHudText(screen, listTop + 1, px + 3, emptyMsg, SUB);
    } else {
      for (let i = 0; i < maxRows; i++) {
        const quest = list[start + i];
        if (!quest) break;

        const rowY = listTop + i * rowStep;
        const isSelected = (start + i) === this.questUI.cursor;
        const mainAttr = isSelected ? SELECTED : HEADER;

        if (isSelected) {
          const row = screen.lines[rowY];
          const row2 = screen.lines[rowY + 1];
          for (let x = px + 2; x < px + panelW - 2; x++) {
            if (row && x < row.length) {
              row[x][0] = SELECTED;
              row[x][1] = ' ';
            }
            if (row2 && x < row2.length) {
              row2[x][0] = SELECTED;
              row2[x][1] = ' ';
            }
          }
        }

        let heading = `${quest.id}  ${quest.title}`;
        heading = heading.slice(0, panelW - 8);
        this._writeHudText(screen, rowY, px + 3, heading, mainAttr);

        let detail = '';
        let detailAttr = SUB;
        if (this.questUI.tab === 'available') {
          detail = `Due day ${quest.deadlineDay}  |  Reward ${quest.rewardGold} rds  |  ${quest.rumor}`;
        } else if (this.questUI.tab === 'active') {
          if (quest.type === 'delivery') {
            const have = this.gameState.economy && this.gameState.economy.cargo
              ? (this.gameState.economy.cargo[quest.goodId] || 0)
              : 0;
            detail = `Delivery ${have}/${quest.qty} ${quest.goodName} to ${quest.targetPort}  |  Due day ${quest.deadlineDay}`;
          } else if (quest.type === 'escort') {
            const convoy = this.gameState.convoy;
            const alive = convoy ? convoy.escorts.filter(e => e.alive).length : '?';
            const total = convoy ? convoy.escorts.length : '?';
            detail = `Escort ${alive}/${total} to ${quest.targetPort}  |  Due day ${quest.deadlineDay}`;
          } else if (quest.type === 'blockade') {
            const blockade = this.gameState.blockade;
            const status = blockade && blockade.detected ? 'DETECTED' : 'Undetected';
            detail = `Smuggle to ${quest.targetPort} (${status})  |  Due day ${quest.deadlineDay}`;
          } else {
            detail = `Hunt ${quest.progress || 0}/${quest.required} (${quest.targetFaction})  |  Due day ${quest.deadlineDay}`;
          }
        } else {
          detailAttr = quest.status === 'success' ? SUCCESS : FAILED;
          const outcome = quest.status === 'success' ? 'SUCCESS' : 'FAILED';
          detail = `${outcome} on day ${quest.resolvedDay || '-'}  |  Reward ${quest.rewardGold || 0} rds`;
        }

        detail = detail.slice(0, panelW - 8);
        this._writeHudText(screen, rowY + 1, px + 3, detail, isSelected ? SELECTED : detailAttr);
      }
    }

    const help = this.questUI.tab === 'available'
      ? ' Left/Right: Tabs  Up/Down: Select  Enter: Accept  R: Reputation  Q/M: Close '
      : this.questUI.tab === 'active'
      ? ' Left/Right: Tabs  Up/Down: Select  X: Abandon  R: Reputation  Q/M: Close '
      : ' Left/Right: Tabs  Up/Down: Select  R: Reputation  Q/M: Close ';
    this._writeHudText(screen, py + panelH - 2, px + 2, help.slice(0, panelW - 4), HELP);
  }

  _findAdjacentNPC() {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0],[0,0]];
    for (const [dx, dy] of dirs) {
      const nx = this.playerX + dx;
      const ny = this.playerY + dy;
      for (const npc of this.npcs) {
        if (npc.x === nx && npc.y === ny) return npc;
      }
    }
    return null;
  }

  _findNPCAt(x, y) {
    for (const npc of this.npcs) {
      if (npc.x === x && npc.y === y) return npc;
    }
    return null;
  }

  _findBuildingAtDoor(x, y) {
    if (!this.townMap.buildings) return null;
    for (const bld of this.townMap.buildings) {
      if (bld.doorX === x && bld.doorY === y) return bld;
    }
    return null;
  }

  _openStoryDialog(npc) {
    if (!this.gameState.campaign) {
      this.message = npc.greeting;
      this.messageTimer = 4.0;
      return;
    }
    const tree = getDialog(npc.storyNpcId, this.gameState.campaign.act);
    if (!tree || tree.length === 0) {
      this.message = npc.greeting;
      this.messageTimer = 4.0;
      return;
    }
    this.dialogUI = {
      npc,
      tree,
      currentNodeId: tree[0].id,
      choiceCursor: 0,
    };
  }

  _handleDialogInput(key) {
    if (!this.dialogUI) return;
    const { tree } = this.dialogUI;
    const node = tree.find(n => n.id === this.dialogUI.currentNodeId);
    if (!node) { this.dialogUI = null; return; }

    // If no choices, any key closes
    if (!node.choices || node.choices.length === 0) {
      if (key === 'enter' || key === 'space' || key === 'q') {
        this.dialogUI = null;
      }
      return;
    }

    if (key === 'up') {
      this.dialogUI.choiceCursor = Math.max(0, this.dialogUI.choiceCursor - 1);
      return;
    }
    if (key === 'down') {
      this.dialogUI.choiceCursor = Math.min(node.choices.length - 1, this.dialogUI.choiceCursor + 1);
      return;
    }

    if (key === 'enter' || key === 'space') {
      const choice = node.choices[this.dialogUI.choiceCursor];
      if (!choice) return;

      // Apply effect
      if (choice.effect) {
        this._applyDialogEffect(choice.effect);
      }

      // Navigate
      if (choice.next) {
        const nextNode = tree.find(n => n.id === choice.next);
        if (nextNode) {
          this.dialogUI.currentNodeId = choice.next;
          this.dialogUI.choiceCursor = 0;
          return;
        }
      }

      // No next node — close dialog
      this.dialogUI = null;
      return;
    }

    if (key === 'q') {
      this.dialogUI = null;
    }
  }

  _applyDialogEffect(effect) {
    if (!effect || !this.gameState.campaign) return;

    if (effect.type === 'advance_campaign') {
      const campaign = this.gameState.campaign;
      const npcId = this.dialogUI ? this.dialogUI.npc.storyNpcId : null;
      const effects = advanceCampaign(campaign, 'npc_dialog_complete',
        { npcId, day: this.gameState.quests ? this.gameState.quests.day : 0 },
        this.gameState.reputation);
      for (const eff of effects) {
        if (eff.type === 'notice') {
          this.gameState.questNotices = (this.gameState.questNotices || []).concat([eff.message]);
        }
      }
    } else if (effect.type === 'add_key_item') {
      const { addKeyItem } = require('../story/campaign');
      addKeyItem(this.gameState.campaign, effect.itemId);
    } else if (effect.type === 'set_flag') {
      this.gameState.campaign.flags[effect.flag] = true;
    }
  }

  _renderDialog(screen) {
    if (!this.dialogUI) return;
    const { npc, tree, currentNodeId, choiceCursor } = this.dialogUI;
    const node = tree.find(n => n.id === currentNodeId);
    if (!node) return;

    const sw = screen.width;
    const sh = screen.height;
    const panelW = Math.min(58, sw - 4);
    const panelH = Math.min(18, sh - 4);
    const px = Math.floor((sw - panelW) / 2);
    const py = Math.floor((sh - panelH) / 2);

    const BG = sattr(233, 233);
    const BORDER = sattr(94, 233);
    const TITLE_ATTR = sattr(178, 233);
    const TEXT_ATTR = sattr(252, 233);
    const DIM = sattr(240, 233);
    const SEL = sattr(233, 178);
    const UNSEL = sattr(250, 233);
    const PORTRAIT_ATTR = sattr(117, 233);

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
    for (let y = py + 1; y < py + panelH - 1; y++) { _wc(y, px, '\u2502'); _wc(y, px + panelW - 1, '\u2502'); }

    // Title — NPC name
    const title = ` ${node.speaker || npc.name} `;
    this._writeHudText(screen, py, px + Math.floor((panelW - title.length) / 2), title, TITLE_ATTR);

    // Portrait (left side, 8 lines)
    if (npc.portrait) {
      for (let i = 0; i < npc.portrait.length && i < panelH - 4; i++) {
        this._writeHudText(screen, py + 2 + i, px + 2, npc.portrait[i], PORTRAIT_ATTR);
      }
    }

    // Text (right of portrait)
    const textX = px + 12;
    const textW = panelW - 14;
    const words = node.text.split(' ');
    let line = '';
    let lineY = py + 2;
    for (const word of words) {
      if (line.length + word.length + 1 > textW) {
        this._writeHudText(screen, lineY, textX, line, TEXT_ATTR);
        lineY++;
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
    }
    if (line) {
      this._writeHudText(screen, lineY, textX, line, TEXT_ATTR);
    }

    // Choices (at bottom)
    if (node.choices && node.choices.length > 0) {
      const choiceY = py + panelH - 2 - node.choices.length;
      for (let i = 0; i < node.choices.length; i++) {
        const c = node.choices[i];
        const isSelected = i === choiceCursor;
        const attr = isSelected ? SEL : UNSEL;
        const pointer = isSelected ? '> ' : '  ';

        if (isSelected) {
          const row = screen.lines[choiceY + i];
          if (row) {
            for (let x = px + 2; x < px + panelW - 2 && x < row.length; x++) {
              row[x][0] = SEL; row[x][1] = ' ';
            }
          }
        }
        this._writeHudText(screen, choiceY + i, px + 4, pointer + c.label, attr);
      }
    } else {
      // No choices — show continue prompt
      const prompt = ' Enter: Continue ';
      this._writeHudText(screen, py + panelH - 2, px + Math.floor((panelW - prompt.length) / 2), prompt, DIM);
    }
  }

  _returnToShip() {
    this.gameState.portInfo = null;
    // Move ship to nearby navigable water so we do not strand the player.
    relocateShipToSafeWater(this.gameState, 3);
    this.stateMachine.transition('OVERWORLD', this.gameState);
  }
}

module.exports = { PortMode };
