'use strict';

/**
 * Onboarding content: the first-run welcome sequence and the shared controls
 * reference (used by both the overworld help overlay and the title "How to Play"
 * screen, so they never drift apart).
 *
 * Tone: dry, understated 19th-century captain's journal (see ROADMAP design notes).
 */

function getIntroPages(shipName) {
  const name = shipName || 'your ship';
  return [
    {
      title: 'Welcome, Captain',
      lines: [
        'The Kattegat strait, 1801. Danish ports and English',
        'men-o’-war, herring fleets and smugglers’ coves.',
        '',
        `You command the ${name}. What you make of these`,
        'waters is entirely your affair.',
      ],
    },
    {
      title: 'Sailing',
      lines: [
        'Arrow keys or WASD set your heading.',
        '',
        'The wind is your master. Watch the TRIM gauge in the',
        'status bar: run across or with the wind and you fly;',
        'beat straight into it and you crawl.',
        '',
        'Press  N  to let the helmsman set a course for any',
        'port — or chart the unknown for you.',
      ],
    },
    {
      title: 'Making Your Way',
      lines: [
        'Sail onto a port  ⌂  to put in — trade goods, hire',
        'crew, repair, and listen for rumours.',
        '',
        'Sail into another ship to hail, fight, board, or flee.',
        '',
        'A larger matter will find you soon enough at sea.',
        '',
        'Press  J  for your journal and orders,  ?  for the',
        'full list of controls.   Fair winds, Captain.',
      ],
    },
  ];
}

// Shared controls reference: [key, description] rows. '' separates groups.
function getControlsReference() {
  return [
    ['Arrows / WASD', 'Steer the ship'],
    ['N', 'Helmsman — set course or auto-explore'],
    ['M', 'Toggle the chart (map)'],
    ['J', 'Campaign journal & objectives'],
    ['L', 'Captain’s log'],
    ['R', 'Reputation / faction standings'],
    ['F', 'Fleet roster (at port)'],
    ['V', 'Spyglass — eavesdrop on marked ships'],
    ['C', 'Toggle CRT filter'],
    ['Tab', 'Convoy formation (during escorts)'],
    ['?', 'Show / hide help'],
    ['Q', 'Quit to title'],
    ['', ''],
    ['Sail onto a port (⌂)', 'to approach its harbour'],
    ['Sail into a ship', 'to hail, fight, board or flee'],
  ];
}

module.exports = { getIntroPages, getControlsReference };
