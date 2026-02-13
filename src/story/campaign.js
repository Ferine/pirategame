'use strict';

/**
 * Campaign state & pure logic for "The Kattegat Conspiracy" storyline.
 * All functions are pure (or minimally mutating) for testability.
 */

/**
 * Create initial campaign state.
 */
function createCampaignState() {
  return {
    act: 0,              // 0=not started, 1-5=active acts
    phase: 'idle',       // sub-phase within current act
    keyItems: [],        // ['letter', 'dispatches', 'royal_seal', 'signal_flags']
    journalEntries: [],  // [{act, title, text, day}]
    flags: {},           // {letterFound, informantMet, dispatchTaken, fortComplete, alliesRallied, flagshipSpawned}
    ending: null,        // null | 'hero' | 'pirate_king' | 'outlaw'
    npcStates: {},       // per-NPC: { met: false, dialogIndex: 0 }
  };
}

/**
 * True when act === 0 (first victory triggers letter).
 */
function checkActOneTrigger(campaign) {
  return campaign.act === 0;
}

/**
 * Add a key item to the campaign.
 */
function addKeyItem(campaign, itemId) {
  if (!campaign.keyItems.includes(itemId)) {
    campaign.keyItems.push(itemId);
  }
}

/**
 * Check if a key item has been collected.
 */
function hasKeyItem(campaign, itemId) {
  return campaign.keyItems.includes(itemId);
}

/**
 * Add a journal entry.
 */
function addJournalEntry(campaign, act, title, text, day) {
  campaign.journalEntries.push({ act, title, text, day: day || 0 });
}

/**
 * Get current objective text.
 */
function getCurrentObjective(campaign) {
  switch (campaign.act) {
    case 0: return 'Sail the Kattegat and seek your fortune.';
    case 1: return 'A mysterious letter was found. Sail to Copenhagen to find someone who can read it.';
    case 2: return 'Speak with Henrik Madsen at the Copenhagen tavern.';
    case 3:
      if (campaign.phase === 'dispatch_hunt') {
        return 'Intercept an English dispatch ship in the Kattegat.';
      }
      if (campaign.phase === 'fort_infiltration') {
        return 'Infiltrate the English fort to steal the royal seal.';
      }
      return 'Follow the informant\'s leads to uncover the English plot.';
    case 4: return 'Build Crown reputation to Friendly and visit Helsingor for signal flags.';
    case 5:
      if (campaign.ending) {
        return 'The Kattegat Conspiracy has been resolved.';
      }
      return 'Sail to Helsingor narrows and defeat the English flagship HMS Sovereign.';
    default: return '';
  }
}

/**
 * Check whether a story NPC should appear at a given port.
 */
function shouldStoryNPCAppear(campaign, portName, npcId) {
  const NPC_VISIBILITY = {
    informant:       { ports: ['Copenhagen'], acts: [2, 3] },
    admiral:         { ports: ['Helsingor'],  acts: [4, 5] },
    spy:             { ports: ['Gothenburg'], acts: [2, 3] },
    smuggler_chief:  { ports: ['Aalborg'],    acts: [3, 4] },
    royal_envoy:     { ports: ['Copenhagen'], acts: [4] },
    english_captain: { ports: [],             acts: [] },  // encountered at sea only
  };

  const vis = NPC_VISIBILITY[npcId];
  if (!vis) return false;
  return vis.ports.includes(portName) && vis.acts.includes(campaign.act);
}

/**
 * Check Act 4 reputation gate.
 */
function checkActFourGate(reputation) {
  return !!(reputation && reputation.crown >= 55);
}

/**
 * Determine ending based on reputation.
 */
function determineEnding(reputation) {
  if (!reputation) return 'outlaw';
  if (reputation.crown >= 70 && reputation.pirate < 50) return 'hero';
  if (reputation.pirate >= 60 && reputation.smuggler >= 50) return 'pirate_king';
  return 'outlaw';
}

/**
 * Advance campaign based on game events.
 * Mutates campaign, returns effects array.
 *
 * @param {object} campaign - Campaign state
 * @param {string} eventType - 'combat_victory', 'port_enter', 'npc_dialog_complete', 'stealth_complete'
 * @param {object} eventData - { portName, npcId, faction, ... }
 * @param {object} reputation - Reputation state
 * @returns {Array} effects - [{type: 'notice'|'journal'|'set_act', ...}]
 */
function advanceCampaign(campaign, eventType, eventData, reputation) {
  const effects = [];

  // Act 0 -> 1: First combat victory
  if (eventType === 'combat_victory' && campaign.act === 0) {
    campaign.act = 1;
    campaign.phase = 'letter_found';
    campaign.flags.letterFound = true;
    addJournalEntry(campaign, 1,
      'A Mysterious Letter',
      'Among the spoils of battle, you found a sealed letter written in English. The handwriting is elegant — clearly from someone of rank. You cannot decipher it fully, but "Copenhagen" and "Kattegat" appear repeatedly. Someone there might know more.',
      eventData.day || 0);
    effects.push({ type: 'notice', message: 'You found a mysterious sealed letter among the loot!' });
    effects.push({ type: 'journal' });
    return effects;
  }

  // Act 1 -> 2: Enter Copenhagen
  if (eventType === 'port_enter' && campaign.act === 1 && eventData.portName === 'Copenhagen') {
    campaign.act = 2;
    campaign.phase = 'seek_informant';
    addJournalEntry(campaign, 2,
      'Copenhagen',
      'The busy harbour of Copenhagen stretches before you. Somewhere in this city is someone who can decode the English letter. The taverns are the best place to start asking questions.',
      eventData.day || 0);
    effects.push({ type: 'notice', message: 'Copenhagen! Find someone who can read the English letter.' });
    effects.push({ type: 'journal' });
    return effects;
  }

  // Act 2 -> 3: Dialog with informant complete
  if (eventType === 'npc_dialog_complete' && campaign.act === 2 && eventData.npcId === 'informant') {
    campaign.act = 3;
    campaign.phase = 'dispatch_hunt';
    campaign.flags.informantMet = true;
    addJournalEntry(campaign, 3,
      'The English Plot',
      'Henrik Madsen, a former naval intelligence officer, decoded the letter. England plans to seize the Kattegat straits with a secret fleet. He urges you to intercept English dispatch ships for proof, then infiltrate their fort for the royal seal.',
      eventData.day || 0);
    effects.push({ type: 'notice', message: 'The letter reveals an English plot! Intercept their dispatches.' });
    effects.push({ type: 'journal' });
    return effects;
  }

  // Act 3: Dispatch interception (combat victory vs English during dispatch_hunt)
  if (eventType === 'combat_victory' && campaign.act === 3 && campaign.phase === 'dispatch_hunt'
      && eventData.faction === 'english') {
    campaign.phase = 'fort_infiltration';
    campaign.flags.dispatchTaken = true;
    addJournalEntry(campaign, 3,
      'Dispatches Seized',
      'The English dispatch ship carried coded orders confirming the invasion plan. The documents reference a royal seal held at the English fort — proof that will convince the Danish Crown to act.',
      eventData.day || 0);
    effects.push({ type: 'notice', message: 'English dispatches seized! Now infiltrate the fort for the royal seal.' });
    effects.push({ type: 'journal' });
    return effects;
  }

  // Act 3 -> 4: Stealth complete (fort infiltration)
  if (eventType === 'stealth_complete' && campaign.act === 3 && campaign.phase === 'fort_infiltration') {
    campaign.act = 4;
    campaign.phase = 'rally_allies';
    campaign.flags.fortComplete = true;
    addJournalEntry(campaign, 4,
      'The Royal Seal',
      'Deep inside the English fort, you found the royal seal — undeniable proof of the conspiracy. With this evidence, the Danish Crown may rally the fleet. Seek Admiral Tordenskjold at Helsingor, but first you must earn the Crown\'s trust.',
      eventData.day || 0);
    effects.push({ type: 'notice', message: 'Royal seal obtained! Earn Crown reputation and visit Helsingor.' });
    effects.push({ type: 'journal' });
    return effects;
  }

  // Act 4 -> 5: Enter Helsingor with sufficient Crown rep
  if (eventType === 'port_enter' && campaign.act === 4
      && eventData.portName === 'Helsingor' && checkActFourGate(reputation)) {
    campaign.act = 5;
    campaign.phase = 'final_battle';
    campaign.flags.alliesRallied = true;
    addKeyItem(campaign, 'signal_flags');
    addJournalEntry(campaign, 5,
      'The Fleet Assembles',
      'Admiral Tordenskjold examined the evidence and declared it genuine. He handed you the signal flags of the Danish fleet. "Sail to the narrows," he said. "The English will come. We will be ready."',
      eventData.day || 0);
    effects.push({ type: 'notice', message: 'Signal flags received! The final battle approaches at Helsingor.' });
    effects.push({ type: 'journal' });
    return effects;
  }

  // Act 5: Final battle victory
  if (eventType === 'combat_victory' && campaign.act === 5) {
    const ending = determineEnding(reputation);
    campaign.ending = ending;
    campaign.phase = 'complete';

    const endingText = {
      hero: 'You are hailed as the Hero of the Kattegat. The Crown grants you lands and title. The English retreat, and Denmark\'s sovereignty is secured for a generation.',
      pirate_king: 'With the English defeated, you carved your own kingdom from the chaos. The Pirate King of the Kattegat — feared by navies, loved by smugglers. The straits are yours.',
      outlaw: 'The English are defeated, but your methods left few friends. An outlaw with no flag and no port to call home — but free. Always free.',
    };

    addJournalEntry(campaign, 5,
      'The Kattegat Conspiracy - ' + ending.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      endingText[ending],
      eventData.day || 0);
    effects.push({ type: 'notice', message: `The Kattegat is saved! Ending: ${ending.replace('_', ' ').toUpperCase()}` });
    effects.push({ type: 'journal' });
    return effects;
  }

  return effects;
}

// Key item descriptions for journal display
const KEY_ITEM_INFO = {
  letter:       { name: 'Sealed Letter',    desc: 'An English letter mentioning the Kattegat. Found in battle loot.' },
  dispatches:   { name: 'English Dispatches', desc: 'Coded orders confirming the English invasion plan.' },
  royal_seal:   { name: 'Royal Seal',       desc: 'Proof of English conspiracy, taken from their fort.' },
  signal_flags: { name: 'Signal Flags',     desc: 'Danish fleet signal flags, given by Admiral Tordenskjold.' },
};

module.exports = {
  createCampaignState,
  checkActOneTrigger,
  addKeyItem,
  hasKeyItem,
  addJournalEntry,
  getCurrentObjective,
  shouldStoryNPCAppear,
  checkActFourGate,
  determineEnding,
  advanceCampaign,
  KEY_ITEM_INFO,
};
