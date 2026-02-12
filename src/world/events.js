'use strict';

/**
 * World event lifecycle for Kattegat Kaper.
 *
 * Events fire on day boundaries: trade boom, plague, naval blockade, pirate raid.
 * State is stored in gameState.events.
 */

const EVENT_TYPES = [
  { type: 'trade_boom',     duration: 3, label: 'Trade Boom',      msg: (p) => `Trade boom at ${p}! Prices +30% for 3 days.` },
  { type: 'plague',         duration: 3, label: 'Plague',          msg: (p) => `Plague outbreak at ${p}! Port closed for 3 days.` },
  { type: 'naval_blockade', duration: 2, label: 'Naval Blockade',  msg: (p) => `English blockade near ${p}! Patrols increased.` },
  { type: 'pirate_raid',    duration: 2, label: 'Pirate Raid',     msg: (p) => `Pirate raid near ${p}! Faction tensions rise.` },
];

const PORT_NAMES = [
  'Skagen', 'Frederikshavn', 'Aalborg', 'Aarhus', 'Helsingor',
  'Helsingborg', 'Copenhagen', 'Malmo', 'Gothenburg',
];

const EVENT_CHANCE = 0.35; // 35% chance per day
const NOTIFICATION_DURATION = 5.0; // seconds

/**
 * Create initial events state.
 */
function createEventsState() {
  return {
    active: [],
    notifications: [],
  };
}

/**
 * Called on each day advance. Expires old events, possibly spawns a new one.
 * Returns array of notification message strings.
 */
function onDayAdvance(gameState, newDay) {
  const events = gameState.events;
  if (!events) return [];

  const messages = [];

  // Expire old events
  for (let i = events.active.length - 1; i >= 0; i--) {
    if (newDay >= events.active[i].endDay) {
      const ev = events.active[i];
      messages.push(`${_getLabel(ev.type)} at ${ev.port} has ended.`);
      events.active.splice(i, 1);
    }
  }

  // Roll for new event
  if (Math.random() < EVENT_CHANCE) {
    const template = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];

    // Pick a port not already affected by same event type
    const affected = new Set(events.active.filter(e => e.type === template.type).map(e => e.port));
    const candidates = PORT_NAMES.filter(p => !affected.has(p));
    if (candidates.length > 0) {
      const port = candidates[Math.floor(Math.random() * candidates.length)];
      const event = {
        type: template.type,
        port,
        startDay: newDay,
        endDay: newDay + template.duration,
      };
      events.active.push(event);

      const msg = template.msg(port);
      messages.push(msg);

      // Apply pirate raid reputation shifts
      if (template.type === 'pirate_raid' && gameState.reputation) {
        gameState.reputation.pirate = Math.min(100, (gameState.reputation.pirate || 50) + 3);
        gameState.reputation.merchant = Math.max(0, (gameState.reputation.merchant || 50) - 2);
      }
    }
  }

  // Push notifications for banner display
  for (const msg of messages) {
    events.notifications.push({ text: msg, timer: NOTIFICATION_DURATION });
  }

  return messages;
}

/**
 * Tick down notification timers, remove expired.
 */
function updateEventNotifications(events, dt) {
  if (!events || !events.notifications) return;
  for (let i = events.notifications.length - 1; i >= 0; i--) {
    events.notifications[i].timer -= dt;
    if (events.notifications[i].timer <= 0) {
      events.notifications.splice(i, 1);
    }
  }
}

/**
 * Check if a port is affected by a specific event type.
 */
function isPortAffected(events, portName, eventType) {
  if (!events || !events.active) return false;
  return events.active.some(e => e.port === portName && e.type === eventType);
}

/**
 * Get trade price multiplier for a port (1.0 or 1.3 during trade boom).
 */
function getTradePriceMult(events, portName) {
  if (isPortAffected(events, portName, 'trade_boom')) return 1.3;
  return 1.0;
}

/**
 * Check if a port is closed due to plague.
 */
function isPortClosed(events, portName) {
  return isPortAffected(events, portName, 'plague');
}

function _getLabel(type) {
  const tmpl = EVENT_TYPES.find(t => t.type === type);
  return tmpl ? tmpl.label : type;
}

module.exports = {
  EVENT_TYPES,
  createEventsState,
  onDayAdvance,
  updateEventNotifications,
  isPortAffected,
  getTradePriceMult,
  isPortClosed,
};
