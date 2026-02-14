'use strict';

const { GOODS } = require('../economy/goods');
const { PORTS } = require('./ports');

// Hail outcome tables per faction
// Each outcome: { id, weight, text, effect?, choices? }
// Text supports {port} and {good} placeholders

const GOOD_NAMES = GOODS.map(g => g.id);
const PORT_NAMES = PORTS.map(p => p.name);

function _randomGood() {
  return GOOD_NAMES[Math.floor(Math.random() * GOOD_NAMES.length)];
}

function _randomPort() {
  return PORT_NAMES[Math.floor(Math.random() * PORT_NAMES.length)];
}

function _fillPlaceholders(text) {
  return text
    .replace(/\{port\}/g, _randomPort())
    .replace(/\{good\}/g, _randomGood());
}

const HAIL_OUTCOMES = {
  merchant: [
    { id: 'trade_offer', weight: 30,
      text: '"We have surplus {good}. Care to trade?"',
      effect: { type: 'trade_offer' },
      choices: [
        { id: 'accept', label: 'Trade' },
        { id: 'decline', label: 'Decline' },
      ],
    },
    { id: 'tip', weight: 25,
      text: '"Friend, {good} fetches a fine price in {port} right now."',
      effect: { type: 'trade_hint' },
    },
    { id: 'warning', weight: 20,
      text: '"Beware — pirates were spotted near {port}."',
      effect: { type: 'intel' },
    },
    { id: 'nothing', weight: 15,
      text: '"Fair winds, captain. We seek no trouble."',
    },
    { id: 'gift', weight: 10,
      text: '"You look like an honest sort. Take this for your trouble."',
      effect: { type: 'gold', amount: 5 + Math.floor(Math.random() * 6) },
    },
  ],
  english: [
    { id: 'demand', weight: 30,
      text: '"Present your papers, privateer!" The officer eyes you suspiciously.',
      effect: { type: 'papers_check' },
      choices: [
        { id: 'papers', label: 'Show papers' },
        { id: 'bribe', label: 'Bribe (10 rds)' },
      ],
    },
    { id: 'intel', weight: 25,
      text: '"We are patrolling for smugglers near {port}. Move along."',
      effect: { type: 'intel' },
    },
    { id: 'hostile', weight: 25,
      text: '"You look like a pirate to me. Prepare to be boarded!"',
      effect: { type: 'forced_combat' },
    },
    { id: 'pass', weight: 20,
      text: '"Carry on. But know that English eyes are everywhere."',
    },
  ],
  danish: [
    { id: 'friendly', weight: 30,
      text: '"God dag! The English are gathering near {port}. Stay sharp."',
      effect: { type: 'intel' },
    },
    { id: 'supply_gift', weight: 25,
      text: '"You sail for Denmark? Take these provisions, friend."',
      effect: { type: 'cargo', good: null },  // filled at resolve time
    },
    { id: 'quest_hint', weight: 20,
      text: '"I heard strange rumours in {port}. Might be worth investigating."',
      effect: { type: 'quest_hint' },
    },
    { id: 'nothing', weight: 25,
      text: '"Calm seas today. May Holger Danske watch over you."',
    },
  ],
  pirate: [
    { id: 'demand_cargo', weight: 25,
      text: '"Hand over your {good}, or we take it by force!"',
      effect: { type: 'demand_cargo' },
      choices: [
        { id: 'comply', label: 'Hand over cargo' },
        { id: 'refuse', label: 'Refuse' },
      ],
    },
    { id: 'raid_offer', weight: 20,
      text: '"Join us for a raid on {port}? Split the take, no questions asked."',
      effect: { type: 'raid_offer' },
      choices: [
        { id: 'join', label: 'Join raid' },
        { id: 'decline', label: 'Decline' },
      ],
    },
    { id: 'black_market', weight: 20,
      text: '"Psst — I can get you {good} at half price. Interested?"',
      effect: { type: 'black_market' },
      choices: [
        { id: 'buy', label: 'Buy (15 rds)' },
        { id: 'decline', label: 'Decline' },
      ],
    },
    { id: 'threat', weight: 20,
      text: '"Cross our waters again and you will feed the fish."',
      effect: { type: 'threat' },
    },
    { id: 'intel', weight: 15,
      text: '"The English are weak near {port}. Good hunting, friend."',
      effect: { type: 'intel' },
    },
  ],
};

/**
 * Pick a weighted random hail outcome for a faction.
 * Returns { id, text, effect, choices } with placeholders filled.
 */
function resolveHailOutcome(faction) {
  const outcomes = HAIL_OUTCOMES[faction];
  if (!outcomes) return { id: 'nothing', text: 'They nod and sail on.', effect: null, choices: null };

  const totalWeight = outcomes.reduce((s, o) => s + o.weight, 0);
  let roll = Math.random() * totalWeight;
  let picked = outcomes[0];
  for (const outcome of outcomes) {
    roll -= outcome.weight;
    if (roll <= 0) { picked = outcome; break; }
  }

  const text = _fillPlaceholders(picked.text);
  // Re-roll gold amount fresh each time
  let effect = picked.effect ? { ...picked.effect } : null;
  if (effect && effect.type === 'gold') {
    effect.amount = 5 + Math.floor(Math.random() * 6);
  }
  if (effect && effect.type === 'cargo') {
    effect.good = _randomGood();
  }

  return {
    id: picked.id,
    text,
    effect,
    choices: picked.choices || null,
  };
}

/**
 * Apply the effect of a hail outcome after player makes a choice.
 * Returns { text, repChanges } for display.
 */
function applyHailEffect(effect, choiceId, gameState) {
  if (!effect) return { text: '', repChanges: [] };

  const repChanges = [];
  let text = '';

  switch (effect.type) {
    case 'gold':
      if (gameState.economy) {
        gameState.economy.gold += effect.amount;
      }
      text = `Received ${effect.amount} rigsdaler.`;
      break;

    case 'cargo': {
      const good = effect.good || _randomGood();
      if (gameState.economy) {
        gameState.economy.cargo[good] = (gameState.economy.cargo[good] || 0) + 2;
      }
      text = `Received 2 ${good}.`;
      break;
    }

    case 'trade_offer':
      if (choiceId === 'accept') {
        const good = _randomGood();
        if (gameState.economy) {
          gameState.economy.cargo[good] = (gameState.economy.cargo[good] || 0) + 3;
          gameState.economy.gold = Math.max(0, gameState.economy.gold - 10);
        }
        text = `Traded 10 rigsdaler for 3 ${good}.`;
        repChanges.push('Merchant Guild +1');
      } else {
        text = 'You decline the offer.';
      }
      break;

    case 'papers_check':
      if (choiceId === 'bribe') {
        if (gameState.economy) {
          gameState.economy.gold = Math.max(0, gameState.economy.gold - 10);
        }
        text = 'The officer pockets the coin and waves you on.';
        repChanges.push('English Navy -2');
      } else {
        // Papers check: Crown rep determines outcome
        const crownRep = gameState.reputation ? gameState.reputation.crown : 50;
        if (crownRep >= 40) {
          text = 'Your papers are in order. The English seem satisfied.';
        } else {
          text = 'Your papers are suspect. The English grow hostile!';
        }
      }
      break;

    case 'demand_cargo':
      if (choiceId === 'comply') {
        // Lose some cargo
        if (gameState.economy && Object.keys(gameState.economy.cargo).length > 0) {
          const goods = Object.keys(gameState.economy.cargo);
          const g = goods[Math.floor(Math.random() * goods.length)];
          const lost = Math.min(gameState.economy.cargo[g], 2);
          gameState.economy.cargo[g] -= lost;
          if (gameState.economy.cargo[g] <= 0) delete gameState.economy.cargo[g];
          text = `You hand over ${lost} ${g}. The pirates are satisfied.`;
        } else {
          text = 'You have nothing to give. The pirates laugh and leave.';
        }
      } else {
        text = 'The pirates snarl but back off... for now.';
        repChanges.push('Pirate Brotherhood -3');
      }
      break;

    case 'raid_offer':
      if (choiceId === 'join') {
        const loot = 15 + Math.floor(Math.random() * 21);
        if (gameState.economy) gameState.economy.gold += loot;
        text = `The raid succeeds! You earn ${loot} rigsdaler.`;
        repChanges.push('Pirate Brotherhood +3');
        repChanges.push('Danish Crown -2');
      } else {
        text = 'You decline. The pirates shrug and sail away.';
      }
      break;

    case 'black_market':
      if (choiceId === 'buy') {
        const good = _randomGood();
        if (gameState.economy && gameState.economy.gold >= 15) {
          gameState.economy.gold -= 15;
          gameState.economy.cargo[good] = (gameState.economy.cargo[good] || 0) + 4;
          text = `Purchased 4 ${good} on the black market.`;
          repChanges.push('Smuggler Network +1');
        } else {
          text = 'You cannot afford it.';
        }
      } else {
        text = 'You pass on the offer.';
      }
      break;

    case 'forced_combat':
      text = 'The English attack!';
      break;

    case 'threat':
      text = 'The pirates glare menacingly before sailing away.';
      break;

    case 'intel':
    case 'trade_hint':
    case 'quest_hint':
      text = 'You note the information.';
      break;

    default:
      text = '';
  }

  return { text, repChanges };
}

// Weather-dependent encounter prefix text
const WEATHER_PREFIX = {
  fog:   'The ship materializes from the fog... ',
  rain:  'Through the driving rain, you spot a sail... ',
  storm: 'Lightning illuminates a ship on the waves... ',
};

function getWeatherEncounterPrefix(weatherType) {
  return WEATHER_PREFIX[weatherType] || '';
}

module.exports = {
  HAIL_OUTCOMES,
  resolveHailOutcome,
  applyHailEffect,
  getWeatherEncounterPrefix,
};
