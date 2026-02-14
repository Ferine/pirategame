'use strict';

// Per-port personality data driving town layout variation
const PORT_PROFILES = {
  Skagen: {
    size: 'small',
    streetPattern: 'single',
    character: 'fishing',
    ambientNPCCount: 1,
    arrivalText: 'Wind-battered tip of Jutland. Gulls wheel above drying racks.',
    buildingZones: {
      Tavern:         { xFrac: 0.15, yFrac: 0.40 },
      Market:         { xFrac: 0.55, yFrac: 0.40 },
      Shipwright:     { xFrac: 0.60, yFrac: 0.65 },
      'Harbor Master': { xFrac: 0.15, yFrac: 0.65 },
      Church:         { xFrac: 0.40, yFrac: 0.12 },
    },
    buildingScale: {},
    decorations: [16], // FISH_RACK
    clutterDensity: 0.3,
  },
  Frederikshavn: {
    size: 'small',
    streetPattern: 'single',
    character: 'naval',
    ambientNPCCount: 2,
    arrivalText: 'Orderly military harbor. Cannons line the waterfront.',
    buildingZones: {
      Tavern:         { xFrac: 0.15, yFrac: 0.35 },
      Market:         { xFrac: 0.55, yFrac: 0.35 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.60 },
      'Harbor Master': { xFrac: 0.15, yFrac: 0.60 },
      Church:         { xFrac: 0.35, yFrac: 0.10 },
    },
    buildingScale: { 'Harbor Master': { w: 1.2, h: 1.2 } },
    decorations: [18], // CARGO_PILE
    clutterDensity: 0.6,
  },
  Aalborg: {
    size: 'medium',
    streetPattern: 'cross',
    character: 'inland',
    ambientNPCCount: 2,
    arrivalText: 'River town, grain and timber barges crowd the quays.',
    buildingZones: {
      Tavern:         { xFrac: 0.12, yFrac: 0.42 },
      Market:         { xFrac: 0.55, yFrac: 0.42 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.68 },
      'Harbor Master': { xFrac: 0.12, yFrac: 0.68 },
      Church:         { xFrac: 0.42, yFrac: 0.10 },
    },
    buildingScale: { Market: { w: 1.2, h: 1.0 } },
    decorations: [18], // CARGO_PILE
    clutterDensity: 0.5,
  },
  Aarhus: {
    size: 'medium',
    streetPattern: 'cross',
    character: 'trading',
    ambientNPCCount: 3,
    arrivalText: 'Busy Danish trading port. Merchants hawk wares on every corner.',
    buildingZones: {
      Tavern:         { xFrac: 0.12, yFrac: 0.40 },
      Market:         { xFrac: 0.55, yFrac: 0.40 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.67 },
      'Harbor Master': { xFrac: 0.12, yFrac: 0.67 },
      Church:         { xFrac: 0.42, yFrac: 0.10 },
    },
    buildingScale: { Market: { w: 1.3, h: 1.1 } },
    decorations: [18, 17], // CARGO_PILE, WELL
    clutterDensity: 0.7,
  },
  Helsingor: {
    size: 'medium',
    streetPattern: 'cross',
    character: 'fortress',
    ambientNPCCount: 2,
    arrivalText: 'Kronborg looms over the narrows. Hamlet\'s ghost walks these ramparts.',
    buildingZones: {
      Tavern:         { xFrac: 0.12, yFrac: 0.38 },
      Market:         { xFrac: 0.55, yFrac: 0.38 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.65 },
      'Harbor Master': { xFrac: 0.12, yFrac: 0.65 },
      Church:         { xFrac: 0.42, yFrac: 0.10 },
    },
    buildingScale: { 'Harbor Master': { w: 1.3, h: 1.2 } },
    decorations: [18], // CARGO_PILE
    clutterDensity: 0.5,
  },
  Helsingborg: {
    size: 'small',
    streetPattern: 'single',
    character: 'fortress',
    ambientNPCCount: 2,
    arrivalText: 'Swedish side of the Sound. The old tower watches Denmark across the water.',
    buildingZones: {
      Tavern:         { xFrac: 0.15, yFrac: 0.38 },
      Market:         { xFrac: 0.55, yFrac: 0.38 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.62 },
      'Harbor Master': { xFrac: 0.15, yFrac: 0.62 },
      Church:         { xFrac: 0.38, yFrac: 0.10 },
    },
    buildingScale: {},
    decorations: [18], // CARGO_PILE
    clutterDensity: 0.4,
  },
  Copenhagen: {
    size: 'large',
    streetPattern: 'grid',
    character: 'capital',
    ambientNPCCount: 4,
    arrivalText: 'The great Danish capital sprawls before you. Spires and masts compete for sky.',
    buildingZones: {
      Tavern:         { xFrac: 0.10, yFrac: 0.35 },
      Market:         { xFrac: 0.55, yFrac: 0.35 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.60 },
      'Harbor Master': { xFrac: 0.10, yFrac: 0.60 },
      Church:         { xFrac: 0.40, yFrac: 0.08 },
    },
    buildingScale: { Market: { w: 1.3, h: 1.2 }, Tavern: { w: 1.2, h: 1.1 } },
    decorations: [19, 17], // FOUNTAIN, WELL
    clutterDensity: 0.8,
  },
  Malmo: {
    size: 'medium',
    streetPattern: 'cross',
    character: 'industrial',
    ambientNPCCount: 2,
    arrivalText: 'Swedish coastal industry. Smoke rises from forges near the waterfront.',
    buildingZones: {
      Tavern:         { xFrac: 0.12, yFrac: 0.40 },
      Market:         { xFrac: 0.55, yFrac: 0.40 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.67 },
      'Harbor Master': { xFrac: 0.12, yFrac: 0.67 },
      Church:         { xFrac: 0.42, yFrac: 0.12 },
    },
    buildingScale: { Shipwright: { w: 1.2, h: 1.1 } },
    decorations: [18], // CARGO_PILE
    clutterDensity: 0.6,
  },
  Gothenburg: {
    size: 'medium',
    streetPattern: 'cross',
    character: 'trading',
    ambientNPCCount: 3,
    arrivalText: 'Swedish merchant hub. Dutch-style canals line the harbor district.',
    buildingZones: {
      Tavern:         { xFrac: 0.12, yFrac: 0.38 },
      Market:         { xFrac: 0.55, yFrac: 0.38 },
      Shipwright:     { xFrac: 0.55, yFrac: 0.65 },
      'Harbor Master': { xFrac: 0.12, yFrac: 0.65 },
      Church:         { xFrac: 0.42, yFrac: 0.10 },
    },
    buildingScale: { Market: { w: 1.2, h: 1.1 } },
    decorations: [17, 18], // WELL, CARGO_PILE
    clutterDensity: 0.7,
  },
};

const SIZE_DIMS = {
  small:  { w: 50, h: 35 },
  medium: { w: 60, h: 40 },
  large:  { w: 70, h: 45 },
};

const DEFAULT_PROFILE = {
  size: 'medium',
  streetPattern: 'cross',
  character: 'trading',
  ambientNPCCount: 2,
  arrivalText: 'A port town on the Kattegat.',
  buildingZones: {
    Tavern:         { xFrac: 0.12, yFrac: 0.42 },
    Market:         { xFrac: 0.55, yFrac: 0.42 },
    Shipwright:     { xFrac: 0.55, yFrac: 0.68 },
    'Harbor Master': { xFrac: 0.12, yFrac: 0.68 },
    Church:         { xFrac: 0.42, yFrac: 0.12 },
  },
  buildingScale: {},
  decorations: [],
  clutterDensity: 0.5,
};

// Rumors NPCs may share — trade hints, danger warnings, tips, local flavor
const RUMORS = [
  'I hear Aarhus pays double for timber this season.',
  'Navy patrols have thickened near Helsingor. Steer clear if you carry contraband.',
  'A smuggler\'s cache washes up on the islands when the storms pass.',
  'The Gothenburg merchants undercut everyone on salt — buy there, sell east.',
  'They say a ghost ship sails the northern strait on moonless nights.',
  'Copenhagen\'s shipwright does the finest hull work in all the Kattegat.',
  'Watch the wind when you round Skagen — many a keel has been lost on those shoals.',
  'Frederikshavn\'s navy men will pay well for gunpowder, no questions asked.',
  'Malmo forges turn out the best cannonballs this side of the Baltic.',
  'A pirate crew was spotted near Aalborg. Armed to the teeth, they say.',
  'The church in Helsingor shelters any sailor, even wanted men.',
  'Trade spices from the south — every port north of Aarhus will pay a premium.',
];

/**
 * Get the profile for a port, merged with defaults.
 * @param {string} portName
 * @returns {object} profile with size dims resolved
 */
function getProfile(portName) {
  const base = PORT_PROFILES[portName] || DEFAULT_PROFILE;
  const profile = Object.assign({}, DEFAULT_PROFILE, base);
  const dims = SIZE_DIMS[profile.size] || SIZE_DIMS.medium;
  profile.w = dims.w;
  profile.h = dims.h;
  return profile;
}

module.exports = { PORT_PROFILES, RUMORS, getProfile, SIZE_DIMS };
