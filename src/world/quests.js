'use strict';

const { GOODS } = require('../economy/goods');
const { applyRepChanges } = require('./factions');

const DAY_SECONDS = 30;
const MAX_ACTIVE_QUESTS = 5;
const OFFERS_PER_PORT = 4;
const HISTORY_LIMIT = 20;

function createQuestState() {
  return {
    day: 1,
    clockAccum: 0,
    nextId: 1,
    offersByPort: {},
    active: [],
    history: [],
  };
}

function ensureQuestState(gameState) {
  if (!gameState.quests) {
    gameState.quests = createQuestState();
  }
  return gameState.quests;
}

function advanceQuestTime(quests, dt) {
  if (!quests) return 0;
  quests.clockAccum = (quests.clockAccum || 0) + dt;

  let daysAdvanced = 0;
  while (quests.clockAccum >= DAY_SECONDS) {
    quests.clockAccum -= DAY_SECONDS;
    quests.day = (quests.day || 1) + 1;
    daysAdvanced++;
  }

  return daysAdvanced;
}

function getPortOffers(quests, portName, portNames) {
  if (!quests || !portName) return [];
  const day = quests.day || 1;
  const existing = quests.offersByPort[portName];
  if (existing && existing.day === day) {
    return existing.offers;
  }

  const offers = _generateOffersForPort(quests, portName, portNames || []);
  quests.offersByPort[portName] = { day, offers };
  return offers;
}

function acceptPortOffer(quests, portName, questId) {
  if (!quests || !portName || !questId) {
    return { ok: false, reason: 'Invalid quest selection.' };
  }

  if (quests.active.length >= MAX_ACTIVE_QUESTS) {
    return { ok: false, reason: `You can only carry ${MAX_ACTIVE_QUESTS} active contracts.` };
  }

  const offers = getPortOffers(quests, portName, []);
  const idx = offers.findIndex(q => q.id === questId);
  if (idx < 0) {
    return { ok: false, reason: 'That contract is no longer available.' };
  }

  const offer = offers[idx];
  offers.splice(idx, 1);

  const activeQuest = {
    ...offer,
    status: 'active',
    acceptedDay: quests.day || 1,
    progress: offer.type === 'hunt' ? 0 : undefined,
  };

  quests.active.push(activeQuest);
  return { ok: true, quest: activeQuest };
}

function abandonActiveQuest(quests, questId) {
  if (!quests || !questId) return false;
  const idx = quests.active.findIndex(q => q.id === questId);
  if (idx < 0) return false;
  quests.active.splice(idx, 1);
  return true;
}

function recordShipDefeat(quests, npcFaction) {
  if (!quests || !npcFaction) return [];
  const day = quests.day || 1;
  const updates = [];

  for (const quest of quests.active) {
    if (quest.type !== 'hunt') continue;
    if (quest.targetFaction !== npcFaction) continue;
    if (_isExpired(day, quest)) continue;
    if ((quest.progress || 0) >= quest.required) continue;

    quest.progress = (quest.progress || 0) + 1;
    const progress = Math.min(quest.progress, quest.required);
    quest.progress = progress;

    if (progress >= quest.required) {
      updates.push(`Contract complete: ${quest.title}. Return to port for reward.`);
    } else {
      updates.push(`Contract update: ${quest.title} (${progress}/${quest.required}).`);
    }
  }

  return updates;
}

function resolvePortArrivalQuests(gameState, portName) {
  if (!gameState || !portName) return [];

  const quests = ensureQuestState(gameState);
  const events = [];
  const day = quests.day || 1;

  for (let i = quests.active.length - 1; i >= 0; i--) {
    const quest = quests.active[i];

    if (_isExpired(day, quest)) {
      _archiveQuest(quests, quest, 'failed');
      quests.active.splice(i, 1);
      events.push(`Contract failed: ${quest.title}.`);
      continue;
    }

    if (quest.type === 'delivery') {
      if (quest.targetPort !== portName) continue;
      if (!gameState.economy || !gameState.economy.cargo) continue;

      const cargo = gameState.economy.cargo;
      const have = cargo[quest.goodId] || 0;
      if (have < quest.qty) continue;

      cargo[quest.goodId] = have - quest.qty;
      if (cargo[quest.goodId] <= 0) delete cargo[quest.goodId];

      const repChanges = _applyQuestRewards(gameState, quest);
      _archiveQuest(quests, quest, 'success');
      quests.active.splice(i, 1);

      let msg = `Contract fulfilled: ${quest.title}. +${quest.rewardGold} rds`;
      if (repChanges.length) msg += ` (${repChanges.join(', ')})`;
      events.push(msg);
      continue;
    }

    if (quest.type === 'hunt' && (quest.progress || 0) >= quest.required) {
      const repChanges = _applyQuestRewards(gameState, quest);
      _archiveQuest(quests, quest, 'success');
      quests.active.splice(i, 1);

      let msg = `Bounty paid: ${quest.title}. +${quest.rewardGold} rds`;
      if (repChanges.length) msg += ` (${repChanges.join(', ')})`;
      events.push(msg);
      continue;
    }

    if (quest.type === 'escort') {
      if (quest.targetPort !== portName) continue;
      // Check if convoy is active and successful
      if (gameState.convoy && gameState.convoy.active && gameState.convoy.questId === quest.id) {
        const alive = gameState.convoy.escorts.filter(e => e.alive).length;
        if (alive > 0) {
          const repChanges = _applyQuestRewards(gameState, quest);
          _archiveQuest(quests, quest, 'success');
          quests.active.splice(i, 1);
          gameState.convoy = null;

          let msg = `Convoy escorted safely! +${quest.rewardGold} rds`;
          if (repChanges.length) msg += ` (${repChanges.join(', ')})`;
          events.push(msg);
        } else {
          _archiveQuest(quests, quest, 'failed');
          quests.active.splice(i, 1);
          gameState.convoy = null;
          events.push(`Convoy escort failed: all merchants destroyed.`);
        }
      }
      continue;
    }

    if (quest.type === 'blockade') {
      if (quest.targetPort !== portName) continue;
      if (gameState.blockade && gameState.blockade.active && gameState.blockade.questId === quest.id) {
        if (!gameState.blockade.detected) {
          const repChanges = _applyQuestRewards(gameState, quest);
          _archiveQuest(quests, quest, 'success');
          quests.active.splice(i, 1);
          gameState.blockade = null;

          let msg = `Blockade run successful! +${quest.rewardGold} rds`;
          if (repChanges.length) msg += ` (${repChanges.join(', ')})`;
          events.push(msg);
        } else {
          _archiveQuest(quests, quest, 'failed');
          quests.active.splice(i, 1);
          gameState.blockade = null;
          events.push(`Blockade run failed: you were detected.`);
        }
      }
      continue;
    }
  }

  return events;
}

function _applyQuestRewards(gameState, quest) {
  if (gameState.economy) {
    gameState.economy.gold = (gameState.economy.gold || 0) + (quest.rewardGold || 0);
  }

  if (gameState.reputation && quest.rewardRep) {
    return applyRepChanges(gameState.reputation, quest.rewardRep);
  }

  return [];
}

function _archiveQuest(quests, quest, outcome) {
  quests.history.unshift({
    ...quest,
    status: outcome,
    resolvedDay: quests.day || 1,
  });

  if (quests.history.length > HISTORY_LIMIT) {
    quests.history.length = HISTORY_LIMIT;
  }
}

function _isExpired(day, quest) {
  return day > (quest.deadlineDay || day);
}

function _generateOffersForPort(quests, portName, portNames) {
  const allPorts = _normalizePortNames(portNames, portName);
  const rand = _makeRng(_hash(`${portName}-${quests.day}-${quests.nextId}`));
  const offers = [];

  for (let i = 0; i < OFFERS_PER_PORT; i++) {
    let quest;
    if (i === OFFERS_PER_PORT - 1) {
      // Last slot: hunt quest
      quest = _generateHuntQuest(quests, portName, rand);
    } else if (i === 2) {
      // Slot 2: escort or blockade quest
      if (rand() < 0.3) {
        quest = _generateBlockadeQuest(quests, portName, allPorts, rand);
      } else {
        quest = _generateEscortQuest(quests, portName, allPorts, rand);
      }
    } else {
      // Slots 0-1: delivery quests
      quest = _generateDeliveryQuest(quests, portName, allPorts, rand);
    }
    offers.push(quest);
  }

  return offers;
}

function _generateDeliveryQuest(quests, originPort, allPorts, rand) {
  const destinations = allPorts.filter(p => p !== originPort);
  const targetPort = destinations[Math.floor(rand() * destinations.length)] || originPort;
  const good = GOODS[Math.floor(rand() * GOODS.length)];
  const qty = 2 + Math.floor(rand() * 4); // 2-5 units
  const deadlineDay = (quests.day || 1) + 2 + Math.floor(rand() * 3); // 2-4 days
  const rewardGold = Math.round(good.base * qty * (2.4 + rand() * 1.2));
  const rewardRep = {
    merchant: 3 + Math.floor(rand() * 4),
    crown: 1 + Math.floor(rand() * 3),
  };

  const title = `Deliver ${qty} ${good.name} to ${targetPort}`;
  const rumor = `Rumor: ${targetPort} is paying handsomely for ${good.name.toLowerCase()}.`;

  return {
    id: `Q${quests.nextId++}`,
    type: 'delivery',
    title,
    rumor,
    originPort,
    targetPort,
    goodId: good.id,
    goodName: good.name,
    qty,
    deadlineDay,
    rewardGold,
    rewardRep,
  };
}

function _generateHuntQuest(quests, originPort, rand) {
  const targetFaction = rand() < 0.8 ? 'pirate' : 'english';
  const required = targetFaction === 'pirate' ? 1 + Math.floor(rand() * 2) : 1;
  const deadlineDay = (quests.day || 1) + 3 + Math.floor(rand() * 3); // 3-5 days
  const rewardGold = 90 + Math.floor(rand() * 130);

  const rewardRep = targetFaction === 'pirate'
    ? { crown: 4, merchant: 3, pirate: -6, navy: -1 }
    : { crown: 2, merchant: 1, navy: 4, pirate: 2 };

  const targetLabel = targetFaction === 'pirate' ? 'Pirate raiders' : 'English patrols';
  const title = `Hunt ${required} ${targetLabel}`;
  const rumor = targetFaction === 'pirate'
    ? 'Rumor: pirates are harrying merchant lanes.'
    : 'Rumor: English patrols are getting bolder in open waters.';

  return {
    id: `Q${quests.nextId++}`,
    type: 'hunt',
    title,
    rumor,
    originPort,
    targetFaction,
    required,
    progress: 0,
    deadlineDay,
    rewardGold,
    rewardRep,
  };
}

function _generateEscortQuest(quests, originPort, allPorts, rand) {
  const destinations = allPorts.filter(p => p !== originPort);
  const targetPort = destinations[Math.floor(rand() * destinations.length)] || originPort;
  const escortCount = 1 + (rand() < 0.3 ? 1 : 0);
  const timeLimit = 60 + Math.floor(rand() * 30);
  const deadlineDay = (quests.day || 1) + 3;
  const rewardGold = 100 + Math.floor(rand() * 200);

  return {
    id: `Q${quests.nextId++}`,
    type: 'escort',
    title: `Escort convoy to ${targetPort}`,
    rumor: `Rumor: merchants seek armed escort to ${targetPort}.`,
    originPort,
    targetPort,
    escortCount,
    timeLimit,
    deadlineDay,
    rewardGold,
    rewardRep: { merchant: 8, crown: 3 },
  };
}

function _generateBlockadeQuest(quests, originPort, allPorts, rand) {
  const destinations = allPorts.filter(p => p !== originPort);
  const targetPort = destinations[Math.floor(rand() * destinations.length)] || originPort;
  const deadlineDay = (quests.day || 1) + 3;
  const rewardGold = 150 + Math.floor(rand() * 200);

  return {
    id: `Q${quests.nextId++}`,
    type: 'blockade',
    title: `Smuggle cargo to ${targetPort}`,
    rumor: `Rumor: smugglers need a runner past the English patrols to ${targetPort}.`,
    originPort,
    targetPort,
    deadlineDay,
    rewardGold,
    rewardRep: { smuggler: 10, merchant: 3, crown: -2 },
  };
}

function _normalizePortNames(portNames, fallbackPort) {
  const unique = new Set();
  for (const p of portNames || []) {
    if (typeof p === 'string' && p) unique.add(p);
  }
  if (fallbackPort) unique.add(fallbackPort);
  return Array.from(unique);
}

function _hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _makeRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return function rand() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

module.exports = {
  DAY_SECONDS,
  MAX_ACTIVE_QUESTS,
  createQuestState,
  ensureQuestState,
  advanceQuestTime,
  getPortOffers,
  acceptPortOffer,
  abandonActiveQuest,
  recordShipDefeat,
  resolvePortArrivalQuests,
};

