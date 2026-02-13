'use strict';

/**
 * Dialog trees for story NPCs in "The Kattegat Conspiracy".
 * Indexed by [npcId][act] as arrays of dialog nodes.
 */

const DIALOG_TREES = {
  informant: {
    2: [
      { id: 'greet', speaker: 'Henrik Madsen', text: 'I used to work for Danish naval intelligence. Show me what you\'ve found.', choices: [
        { label: 'Show the letter', next: 'read_letter' },
        { label: 'Who are you?', next: 'identity' },
      ]},
      { id: 'identity', speaker: 'Henrik Madsen', text: 'Henrik Madsen. Retired spymaster. I still have contacts. Now, the letter?', choices: [
        { label: 'Show the letter', next: 'read_letter' },
      ]},
      { id: 'read_letter', speaker: 'Henrik Madsen', text: 'My God... This is from the English Admiralty. They plan to seize the Kattegat strait. We need proof — intercept their dispatch ships. Return to me when you have their orders.', choices: [
        { label: 'I\'ll find them.', next: 'accept', effect: { type: 'advance_campaign' } },
        { label: 'Why should I care?', next: 'convince' },
      ]},
      { id: 'convince', speaker: 'Henrik Madsen', text: 'If England controls these waters, every captain — pirate or honest — loses their livelihood. This is bigger than any of us.', choices: [
        { label: 'You\'re right. I\'ll do it.', next: 'accept', effect: { type: 'advance_campaign' } },
      ]},
      { id: 'accept', speaker: 'Henrik Madsen', text: 'Good. English dispatch ships fly a red pennant. Hunt them near the shipping lanes. Bring me their dispatches.', choices: [] },
    ],
    3: [
      { id: 'greet', speaker: 'Henrik Madsen', text: 'You have news? Tell me what you\'ve found.', choices: [
        { label: 'I have the dispatches.', next: 'dispatches', condition: 'has_dispatches' },
        { label: 'Still searching.', next: 'waiting' },
      ]},
      { id: 'waiting', speaker: 'Henrik Madsen', text: 'Keep hunting English ships. Their dispatch vessels carry coded orders.', choices: [] },
      { id: 'dispatches', speaker: 'Henrik Madsen', text: 'These confirm everything. There\'s a fort on one of the islands — they keep the royal seal there. Infiltrate it and bring me that seal. It\'s the proof we need for the Crown.', choices: [
        { label: 'Where is this fort?', next: 'fort_info' },
      ]},
      { id: 'fort_info', speaker: 'Henrik Madsen', text: 'The next English ship you encounter — try infiltrating instead of attacking. Their forts are well-guarded, but a clever captain can slip through.', choices: [] },
    ],
  },

  admiral: {
    4: [
      { id: 'greet', speaker: 'Admiral Tordenskjold', text: 'Captain. I\'ve heard rumors of English movements. What do you know?', choices: [
        { label: 'Show the evidence', next: 'evidence' },
        { label: 'Are you preparing for war?', next: 'war_talk' },
      ]},
      { id: 'war_talk', speaker: 'Admiral Tordenskjold', text: 'I prepare for whatever comes. But I need proof before I can commit the fleet. Show me what you have.', choices: [
        { label: 'Show the evidence', next: 'evidence' },
      ]},
      { id: 'evidence', speaker: 'Admiral Tordenskjold', text: 'The dispatches, the royal seal... This is genuine. England means to take our straits. I will rally the fleet — but you must build support with the Crown first.', choices: [
        { label: 'What must I do?', next: 'instructions' },
      ]},
      { id: 'instructions', speaker: 'Admiral Tordenskjold', text: 'Earn the Crown\'s trust through honest deeds. When you return with their confidence, I\'ll give you the signal flags for the fleet.', choices: [] },
    ],
    5: [
      { id: 'greet', speaker: 'Admiral Tordenskjold', text: 'The fleet is assembled. The English approach. Are you ready, captain?', choices: [
        { label: 'Ready as I\'ll ever be.', next: 'rally' },
        { label: 'What\'s the plan?', next: 'plan' },
      ]},
      { id: 'plan', speaker: 'Admiral Tordenskjold', text: 'Their flagship, HMS Sovereign, leads the fleet. Destroy her and the rest will scatter. I\'ll engage their flanks — you take the Sovereign.', choices: [
        { label: 'Consider it done.', next: 'rally' },
      ]},
      { id: 'rally', speaker: 'Admiral Tordenskjold', text: 'For Denmark! For the Kattegat! Sail to the narrows — the English will come to us.', choices: [] },
    ],
  },

  spy: {
    2: [
      { id: 'greet', speaker: 'James Whitmore', text: 'A pirate with an English letter? How delightfully complicated. I might know something about its origin.', choices: [
        { label: 'Who wrote it?', next: 'info' },
        { label: 'I don\'t trust you.', next: 'distrust' },
      ]},
      { id: 'info', speaker: 'James Whitmore', text: 'A certain Admiral Blackwood. He\'s behind the Kattegat operation. But you didn\'t hear that from me.', choices: [
        { label: 'Useful. Thank you.', next: 'end' },
      ]},
      { id: 'distrust', speaker: 'James Whitmore', text: 'Smart. But sometimes the enemy of your enemy is a useful friend. Think about it.', choices: [
        { label: 'I\'ll keep that in mind.', next: 'end' },
      ]},
      { id: 'end', speaker: 'James Whitmore', text: 'If you need me, I\'ll be here. For now.', choices: [] },
    ],
    3: [
      { id: 'greet', speaker: 'James Whitmore', text: 'Still alive? The English are getting nervous. Their dispatch ships have doubled their escort.', choices: [
        { label: 'Any advice?', next: 'advice' },
      ]},
      { id: 'advice', speaker: 'James Whitmore', text: 'Strike at dawn. Their crews are at half-watch. And if you find yourself near their fort... the southeast wall has a blind spot.', choices: [] },
    ],
  },

  smuggler_chief: {
    3: [
      { id: 'greet', speaker: 'Svend Blackhand', text: 'Word is you\'re making trouble for the English. Good. They\'ve been bad for business.', choices: [
        { label: 'Can you help?', next: 'help' },
        { label: 'Just passing through.', next: 'end' },
      ]},
      { id: 'help', speaker: 'Svend Blackhand', text: 'I can\'t fight their warships, but my smuggling network can keep you supplied. Consider it a professional courtesy.', choices: [
        { label: 'Deal.', next: 'end', effect: { type: 'set_flag', flag: 'smugglerAlliance' } },
      ]},
      { id: 'end', speaker: 'Svend Blackhand', text: 'Fair winds, captain. Try not to get killed.', choices: [] },
    ],
    4: [
      { id: 'greet', speaker: 'Svend Blackhand', text: 'The English are scared. They\'re pulling ships back to defend the homeland. Your work is paying off.', choices: [
        { label: 'Good to hear.', next: 'end' },
      ]},
      { id: 'end', speaker: 'Svend Blackhand', text: 'When this is over, you\'ll always have a friend in Aalborg.', choices: [] },
    ],
  },

  royal_envoy: {
    4: [
      { id: 'greet', speaker: 'Countess Ingrid', text: 'The Crown has been watching your exploits with interest, captain. Your service has not gone unnoticed.', choices: [
        { label: 'I serve Denmark.', next: 'loyal' },
        { label: 'I serve myself.', next: 'independent' },
      ]},
      { id: 'loyal', speaker: 'Countess Ingrid', text: 'Then Denmark is fortunate. Continue your good works, and the Admiral will have what he needs to rally the fleet.', choices: [] },
      { id: 'independent', speaker: 'Countess Ingrid', text: 'Honest, at least. But know this — helping Denmark now helps everyone who sails these waters. Think on it.', choices: [] },
    ],
  },
};

/**
 * Get dialog tree for a story NPC at the current act.
 * Returns array of dialog nodes or null.
 */
function getDialog(npcId, act) {
  const npcTrees = DIALOG_TREES[npcId];
  if (!npcTrees) return null;
  return npcTrees[act] || null;
}

module.exports = {
  DIALOG_TREES,
  getDialog,
};
