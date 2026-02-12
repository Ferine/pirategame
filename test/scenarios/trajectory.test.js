'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeLaunchParams, trajectoryAt, flightTime,
  landingDistance, checkHit, GRAVITY,
} = require('../../src/combat/trajectory');
const { HIT_RADIUS, NEAR_MISS_RADIUS } = require('../../src/combat/combat-state');

describe('trajectory', () => {
  describe('computeLaunchParams', () => {
    it('zero power gives minimum velocity', () => {
      const p = computeLaunchParams(0);
      assert.ok(Math.abs(p.velZ - 2.0) < 0.001);
      assert.ok(p.launchAngle > 0);
    });

    it('full power gives maximum velocity', () => {
      const p = computeLaunchParams(100);
      assert.ok(Math.abs(p.velZ - 10.0) < 0.001);
      assert.ok(p.launchAngle > computeLaunchParams(0).launchAngle);
    });
  });

  describe('trajectoryAt', () => {
    it('starts at origin (t=0)', () => {
      const pos = trajectoryAt(0, 50, { strength: 0 });
      assert.ok(Math.abs(pos.z) < 0.001);
      assert.ok(Math.abs(pos.y) < 0.001);
      assert.ok(Math.abs(pos.x) < 0.001);
    });

    it('y is positive mid-flight', () => {
      const t = flightTime(50) / 2;
      const pos = trajectoryAt(t, 50, { strength: 0 });
      assert.ok(pos.y > 0, 'cannonball should be airborne at mid-flight');
    });

    it('wind causes lateral drift', () => {
      const t = 1;
      const noWind = trajectoryAt(t, 50, { strength: 0 });
      const withWind = trajectoryAt(t, 50, { strength: 5 });
      assert.ok(Math.abs(withWind.x) > Math.abs(noWind.x));
    });
  });

  describe('flightTime', () => {
    it('returns positive flight time for any power > 0', () => {
      for (const power of [10, 50, 100]) {
        assert.ok(flightTime(power) > 0, `power ${power} should have positive flight time`);
      }
    });

    it('higher power gives longer flight', () => {
      assert.ok(flightTime(100) > flightTime(50));
      assert.ok(flightTime(50) > flightTime(10));
    });
  });

  describe('landingDistance', () => {
    it('higher power gives longer distance', () => {
      assert.ok(landingDistance(100) > landingDistance(50));
    });

    it('trajectory y approximately 0 at landing time', () => {
      for (const power of [30, 60, 100]) {
        const t = flightTime(power);
        const pos = trajectoryAt(t, power, { strength: 0 });
        assert.ok(Math.abs(pos.y) < 0.5, `y should be near 0 at landing (power=${power}, y=${pos.y})`);
      }
    });
  });

  describe('checkHit', () => {
    it('direct hit within HIT_RADIUS', () => {
      const result = checkHit(0, 0, 50, 200);
      assert.ok(result.hit);
      assert.ok(!result.nearMiss);
    });

    it('near miss between HIT and NEAR_MISS radius', () => {
      const result = checkHit(8, 0, 50, 200);
      assert.ok(!result.hit);
      assert.ok(result.nearMiss);
    });

    it('complete miss beyond NEAR_MISS_RADIUS', () => {
      const result = checkHit(20, 0, 50, 200);
      assert.ok(!result.hit);
      assert.ok(!result.nearMiss);
    });

    it('distance is computed correctly', () => {
      const result = checkHit(3, 4, 50, 200);
      assert.ok(Math.abs(result.distance - 5) < 0.001);
    });
  });
});
