'use strict';

const { HIT_RADIUS, NEAR_MISS_RADIUS } = require('./combat-state');

const GRAVITY = -4.0;

function computeLaunchParams(power) {
  const velZ = 2.0 + (power / 100) * 8.0;
  const launchAngle = 0.2 + (power / 100) * 0.6;
  const velY = Math.sin(launchAngle) * velZ * 1.5;
  return { velZ, velY, launchAngle };
}

// Simulate trajectory and return state at time t
function trajectoryAt(t, power, wind) {
  const { velZ, velY } = computeLaunchParams(power);

  const z = velZ * t;
  const y = velY * t + 0.5 * GRAVITY * t * t;
  // Wind drift (lateral)
  const windDriftX = (wind.strength * 0.3) * t;

  return { z, y, x: windDriftX };
}

// Get total flight time (when y returns to 0)
function flightTime(power) {
  const { velY } = computeLaunchParams(power);
  // y = velY*t + 0.5*g*t^2 = 0 => t = -2*velY/g
  return -2 * velY / GRAVITY;
}

// Get the Z distance at landing
function landingDistance(power) {
  const t = flightTime(power);
  const { velZ } = computeLaunchParams(power);
  return velZ * t;
}

// Determine hit/miss based on aim offsets and landing distance vs target distance
function checkHit(aimOffsetX, aimOffsetY, power, targetDistance) {
  const dist = Math.sqrt(aimOffsetX * aimOffsetX + aimOffsetY * aimOffsetY);

  if (dist < HIT_RADIUS) {
    return { hit: true, nearMiss: false, distance: dist };
  }
  if (dist < NEAR_MISS_RADIUS) {
    return { hit: false, nearMiss: true, distance: dist };
  }
  return { hit: false, nearMiss: false, distance: dist };
}

module.exports = {
  computeLaunchParams,
  trajectoryAt,
  flightTime,
  landingDistance,
  checkHit,
  GRAVITY,
};
