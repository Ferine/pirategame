'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createLogState,
  logEvent,
  flushDay,
  getLogEntries,
  createLogUIState,
  logUIHandleInput,
} = require('../../src/meta/captains-log');

describe('captains-log', () => {
  describe('createLogState', () => {
    it('returns initial log state', () => {
      const log = createLogState();
      assert.deepEqual(log.entries, []);
      assert.deepEqual(log.currentDayEvents, []);
      assert.equal(log.lastDay, 0);
    });
  });

  describe('logEvent', () => {
    it('buffers an event into currentDayEvents', () => {
      const log = createLogState();
      logEvent(log, 'port_visit', { name: 'Copenhagen' });
      assert.equal(log.currentDayEvents.length, 1);
      assert.equal(log.currentDayEvents[0].type, 'port_visit');
      assert.equal(log.currentDayEvents[0].data.name, 'Copenhagen');
    });

    it('handles null log gracefully', () => {
      logEvent(null, 'port_visit', { name: 'Copenhagen' });
      // should not throw
    });

    it('defaults data to empty object', () => {
      const log = createLogState();
      logEvent(log, 'storm');
      assert.deepEqual(log.currentDayEvents[0].data, {});
    });

    it('buffers multiple events', () => {
      const log = createLogState();
      logEvent(log, 'new_day', { day: 1 });
      logEvent(log, 'port_visit', { name: 'Aarhus' });
      logEvent(log, 'trade', { port: 'Aarhus' });
      assert.equal(log.currentDayEvents.length, 3);
    });
  });

  describe('flushDay', () => {
    it('creates an entry from buffered events', () => {
      const log = createLogState();
      logEvent(log, 'port_visit', { name: 'Copenhagen' });
      flushDay(log, 5);
      assert.equal(log.entries.length, 1);
      assert.equal(log.entries[0].day, 5);
      assert.ok(log.entries[0].text.includes('Copenhagen'));
    });

    it('clears currentDayEvents after flush', () => {
      const log = createLogState();
      logEvent(log, 'storm');
      flushDay(log, 3);
      assert.equal(log.currentDayEvents.length, 0);
    });

    it('updates lastDay', () => {
      const log = createLogState();
      logEvent(log, 'new_day', { day: 7 });
      flushDay(log, 7);
      assert.equal(log.lastDay, 7);
    });

    it('does nothing when no events buffered', () => {
      const log = createLogState();
      flushDay(log, 1);
      assert.equal(log.entries.length, 0);
    });

    it('handles null log gracefully', () => {
      flushDay(null, 1);
      // should not throw
    });

    it('combines multiple events into one entry', () => {
      const log = createLogState();
      logEvent(log, 'port_visit', { name: 'Aalborg' });
      logEvent(log, 'trade', { port: 'Aalborg' });
      flushDay(log, 2);
      assert.equal(log.entries.length, 1);
      assert.ok(log.entries[0].text.includes('Aalborg'));
    });

    it('generates prose for combat_win event', () => {
      const log = createLogState();
      logEvent(log, 'combat_win', { name: 'Swedish Corvette' });
      flushDay(log, 4);
      assert.equal(log.entries.length, 1);
      assert.ok(log.entries[0].text.includes('Swedish Corvette'));
    });

    it('generates prose for treasure event', () => {
      const log = createLogState();
      logEvent(log, 'treasure');
      flushDay(log, 6);
      assert.equal(log.entries.length, 1);
      assert.ok(log.entries[0].text.length > 0);
    });

    it('generates prose for barrel event', () => {
      const log = createLogState();
      logEvent(log, 'barrel');
      flushDay(log, 8);
      assert.equal(log.entries.length, 1);
      assert.ok(log.entries[0].text.includes('barrel'));
    });

    it('generates prose for storm event', () => {
      const log = createLogState();
      logEvent(log, 'storm');
      flushDay(log, 9);
      assert.equal(log.entries.length, 1);
      assert.ok(log.entries[0].text.length > 0);
    });
  });

  describe('getLogEntries', () => {
    it('returns entries array', () => {
      const log = createLogState();
      logEvent(log, 'new_day', { day: 1 });
      flushDay(log, 1);
      const entries = getLogEntries(log);
      assert.equal(entries.length, 1);
    });

    it('returns empty array for null log', () => {
      assert.deepEqual(getLogEntries(null), []);
    });
  });

  describe('logUI', () => {
    it('createLogUIState returns initial scroll state', () => {
      const ui = createLogUIState();
      assert.equal(ui.scroll, 0);
    });

    it('logUIHandleInput returns false for close keys', () => {
      const ui = createLogUIState();
      const log = createLogState();
      assert.equal(logUIHandleInput('l', ui, log), false);
      assert.equal(logUIHandleInput('q', ui, log), false);
      assert.equal(logUIHandleInput('enter', ui, log), false);
    });

    it('logUIHandleInput scrolls down', () => {
      const ui = createLogUIState();
      const log = createLogState();
      logEvent(log, 'new_day', { day: 1 });
      flushDay(log, 1);
      logEvent(log, 'new_day', { day: 2 });
      flushDay(log, 2);

      assert.equal(logUIHandleInput('down', ui, log), true);
      assert.equal(ui.scroll, 1);
    });

    it('logUIHandleInput scrolls up', () => {
      const ui = createLogUIState();
      ui.scroll = 1;
      const log = createLogState();
      assert.equal(logUIHandleInput('up', ui, log), true);
      assert.equal(ui.scroll, 0);
    });

    it('logUIHandleInput does not scroll below 0', () => {
      const ui = createLogUIState();
      const log = createLogState();
      assert.equal(logUIHandleInput('up', ui, log), true);
      assert.equal(ui.scroll, 0);
    });
  });
});
