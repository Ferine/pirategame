'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withDeterministicRandom } = require('../helpers/deterministic');

const {
  GOODS, PORT_PRICES, getPrice, generatePriceTable,
  createEconomyState, cargoCount,
} = require('../../src/economy/goods');

describe('economy', () => {
  describe('createEconomyState', () => {
    it('starts with 100 gold and 20 cargo capacity', () => {
      const eco = createEconomyState();
      assert.equal(eco.gold, 100);
      assert.equal(eco.cargoMax, 20);
      assert.deepEqual(eco.cargo, {});
    });
  });

  describe('cargoCount', () => {
    it('returns 0 for empty cargo', () => {
      assert.equal(cargoCount({ cargo: {} }), 0);
    });

    it('sums all cargo quantities', () => {
      assert.equal(cargoCount({ cargo: { cod: 5, iron: 3 } }), 8);
    });
  });

  describe('getPrice', () => {
    it('cod is cheap at Skagen (mult 0.6)', () => {
      // Skagen cod mult = 0.6, base = 8 → ~4.8 before jitter
      const prices = withDeterministicRandom(42, () => getPrice('cod', 'Skagen'));
      assert.ok(prices.buy > 0);
      assert.ok(prices.sell > 0);
      assert.ok(prices.buy > prices.sell); // markup > markdown
    });

    it('cod is expensive at Copenhagen (mult 1.3)', () => {
      // Compare average of several samples
      let skagenBuy = 0, copenBuy = 0;
      for (let seed = 1; seed <= 10; seed++) {
        skagenBuy += withDeterministicRandom(seed, () => getPrice('cod', 'Skagen').buy);
        copenBuy += withDeterministicRandom(seed, () => getPrice('cod', 'Copenhagen').buy);
      }
      assert.ok(copenBuy > skagenBuy, 'Copenhagen cod should cost more than Skagen cod');
    });

    it('returns {buy:0, sell:0} for unknown good', () => {
      const p = getPrice('unobtanium', 'Skagen');
      assert.equal(p.buy, 0);
      assert.equal(p.sell, 0);
    });

    it('applies event multiplier', () => {
      const normal = withDeterministicRandom(7, () => getPrice('cod', 'Skagen', 1.0));
      const boosted = withDeterministicRandom(7, () => getPrice('cod', 'Skagen', 1.3));
      assert.ok(boosted.buy >= normal.buy, 'event mult should increase price');
    });
  });

  describe('generatePriceTable', () => {
    it('returns entries for all 8 goods', () => {
      const table = withDeterministicRandom(1, () => generatePriceTable('Skagen'));
      assert.equal(Object.keys(table).length, GOODS.length);
      for (const good of GOODS) {
        assert.ok(table[good.id], `missing price for ${good.id}`);
        assert.ok(table[good.id].buy > 0);
        assert.ok(table[good.id].sell > 0);
      }
    });
  });

  describe('PORT_PRICES structure', () => {
    it('has entries for all 9 ports', () => {
      const ports = ['Skagen', 'Frederikshavn', 'Aalborg', 'Aarhus',
        'Helsingor', 'Helsingborg', 'Copenhagen', 'Malmo', 'Gothenburg'];
      for (const port of ports) {
        assert.ok(PORT_PRICES[port], `missing PORT_PRICES for ${port}`);
      }
    });
  });
});
