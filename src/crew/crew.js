'use strict';

// Scandinavian first + last names for crew generation
const FIRST_NAMES = [
  'Erik', 'Lars', 'Olaf', 'Sven', 'Bjorn', 'Gunnar', 'Harald', 'Knud',
  'Niels', 'Anders', 'Torsten', 'Ragnar', 'Magnus', 'Ivar', 'Leif',
  'Ingrid', 'Astrid', 'Sigrid', 'Freya', 'Helga', 'Runa', 'Thyra',
];

const LAST_NAMES = [
  'Eriksson', 'Larsson', 'Olsen', 'Svendsen', 'Bjornsson', 'Hansen',
  'Petersen', 'Andersen', 'Johansson', 'Nilsson', 'Lindqvist', 'Strand',
  'Dahl', 'Berg', 'Holm', 'Lund', 'Nygaard', 'Krog', 'Voss', 'Bakke',
];

// Crew traits — flavor and minor stat bonus
const TRAITS = [
  { name: 'Steady hand',  stat: 'gunnery',  bonus: 1 },
  { name: 'Born sailor',  stat: 'sailing',  bonus: 1 },
  { name: 'Brawler',      stat: 'strength', bonus: 1 },
  { name: 'Loyal',        stat: 'loyalty',  bonus: 2 },
  { name: 'Drunkard',     stat: 'loyalty',  bonus: -1 },
  { name: 'Superstitious', stat: 'morale',  bonus: -1 },
  { name: 'Veteran',      stat: 'gunnery',  bonus: 2 },
  { name: 'Young',        stat: 'strength', bonus: -1 },
  { name: 'Sea dog',      stat: 'sailing',  bonus: 2 },
  { name: 'Quiet',        stat: 'morale',   bonus: 1 },
];

// Roles a crew member can be assigned to
const ROLES = {
  NONE:     'none',
  GUNNERY:  'gunnery',
  SAILING:  'sailing',
  BOARDING: 'boarding',
};

/**
 * Generate a random crew member for recruitment.
 */
function generateCrewMember(portName) {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const trait = TRAITS[Math.floor(Math.random() * TRAITS.length)];

  const base = {
    strength: 3 + Math.floor(Math.random() * 5), // 3-7
    sailing:  3 + Math.floor(Math.random() * 5),
    gunnery:  3 + Math.floor(Math.random() * 5),
    loyalty:  4 + Math.floor(Math.random() * 4), // 4-7
    morale:   7,   // starts decent
  };

  // Apply trait bonus
  if (base[trait.stat] !== undefined) {
    base[trait.stat] = Math.max(1, Math.min(10, base[trait.stat] + trait.bonus));
  }

  // Hire cost scales with total stats
  const totalStats = base.strength + base.sailing + base.gunnery;
  const cost = 10 + Math.floor(totalStats * 1.5) + Math.floor(Math.random() * 10);

  return {
    id: Math.random().toString(36).slice(2, 8),
    name: `${first} ${last}`,
    trait: trait.name,
    strength: base.strength,
    sailing: base.sailing,
    gunnery: base.gunnery,
    loyalty: base.loyalty,
    morale: base.morale,
    role: ROLES.NONE,
    cost,
  };
}

/**
 * Generate a set of recruitment candidates for a tavern.
 */
function generateCandidates(portName, count) {
  const candidates = [];
  for (let i = 0; i < count; i++) {
    candidates.push(generateCrewMember(portName));
  }
  return candidates;
}

/**
 * Create initial crew state for the game.
 */
function createCrewState() {
  // Start with a small loyal crew
  const starter1 = generateCrewMember('start');
  starter1.name = 'Bjorn Eriksson';
  starter1.trait = 'Loyal';
  starter1.loyalty = 8;
  starter1.morale = 9;
  starter1.sailing = 6;
  starter1.role = ROLES.SAILING;
  starter1.cost = 0;

  const starter2 = generateCrewMember('start');
  starter2.name = 'Lars Petersen';
  starter2.trait = 'Steady hand';
  starter2.gunnery = 7;
  starter2.morale = 8;
  starter2.role = ROLES.GUNNERY;
  starter2.cost = 0;

  return {
    members: [starter1, starter2],
    maxCrew: 8,
    avgMorale: 8.5,
    daysSincePort: 0,
    daysSincePay: 0,
    victories: 0,
    losses: 0,
  };
}

/**
 * Calculate average morale across all crew.
 */
function calcAvgMorale(crew) {
  if (!crew.members.length) return 5;
  let sum = 0;
  for (const m of crew.members) sum += m.morale;
  crew.avgMorale = sum / crew.members.length;
  return crew.avgMorale;
}

/**
 * Tick morale over time (called from overworld update, once per "game day").
 * Returns events array: [{type: 'desertion', member}, {type: 'mutiny'}]
 */
function tickMorale(crew, economy) {
  const events = [];

  crew.daysSincePort++;
  crew.daysSincePay++;

  for (const m of crew.members) {
    // Time at sea drains morale slowly
    if (crew.daysSincePort > 5) {
      m.morale = Math.max(1, m.morale - 0.3);
    }

    // Unpaid crew lose loyalty and morale
    if (crew.daysSincePay > 10) {
      m.morale = Math.max(1, m.morale - 0.5);
      m.loyalty = Math.max(1, m.loyalty - 0.2);
    }

    // Loyalty prevents morale from dropping too fast
    if (m.loyalty >= 7) {
      m.morale = Math.max(3, m.morale);
    }
  }

  calcAvgMorale(crew);

  // Desertion check: low-morale, low-loyalty crew may leave
  for (let i = crew.members.length - 1; i >= 0; i--) {
    const m = crew.members[i];
    if (m.morale <= 2 && m.loyalty <= 3 && Math.random() < 0.3) {
      events.push({ type: 'desertion', member: m });
      crew.members.splice(i, 1);
    }
  }

  // Keep aggregate morale in sync with post-desertion crew.
  calcAvgMorale(crew);

  // Mutiny check: if average morale drops below 3
  if (crew.avgMorale < 3 && crew.members.length >= 3 && Math.random() < 0.2) {
    events.push({ type: 'mutiny' });
  }

  return events;
}

/**
 * Apply victory morale boost.
 */
function onVictory(crew) {
  crew.victories++;
  for (const m of crew.members) {
    m.morale = Math.min(10, m.morale + 1.5);
  }
  calcAvgMorale(crew);
}

/**
 * Apply loss morale penalty.
 */
function onLoss(crew) {
  crew.losses++;
  for (const m of crew.members) {
    m.morale = Math.max(1, m.morale - 1.0);
  }
  calcAvgMorale(crew);
}

/**
 * Pay crew (from port). Restores morale.
 */
function payCrew(crew, economy) {
  const cost = crew.members.length * 5; // 5 rds per head
  if (economy.gold < cost) return { paid: false, cost };

  economy.gold -= cost;
  crew.daysSincePay = 0;

  for (const m of crew.members) {
    m.morale = Math.min(10, m.morale + 2);
    m.loyalty = Math.min(10, m.loyalty + 0.5);
  }
  calcAvgMorale(crew);

  return { paid: true, cost };
}

/**
 * Port visit morale boost.
 */
function onPortVisit(crew) {
  crew.daysSincePort = 0;
  for (const m of crew.members) {
    m.morale = Math.min(10, m.morale + 1);
  }
  calcAvgMorale(crew);
}

/**
 * Count crew by role.
 */
function countByRole(crew) {
  const counts = { none: 0, gunnery: 0, sailing: 0, boarding: 0 };
  for (const m of crew.members) {
    counts[m.role] = (counts[m.role] || 0) + 1;
  }
  return counts;
}

/**
 * Get total stat bonus from crew in a given role.
 */
function getRoleBonus(crew, role) {
  let total = 0;
  for (const m of crew.members) {
    if (m.role === role) {
      switch (role) {
        case ROLES.GUNNERY:  total += m.gunnery; break;
        case ROLES.SAILING:  total += m.sailing; break;
        case ROLES.BOARDING: total += m.strength; break;
      }
    }
  }
  return total;
}

module.exports = {
  ROLES,
  generateCrewMember,
  generateCandidates,
  createCrewState,
  calcAvgMorale,
  tickMorale,
  onVictory,
  onLoss,
  payCrew,
  onPortVisit,
  countByRole,
  getRoleBonus,
};
