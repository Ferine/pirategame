'use strict';

const { sattr } = require('../render/tiles');

// Explosion effect for hits
// Returns array of { dx, dy, ch, attr } for each particle at given time
function explosionFrame(elapsed, maxDuration) {
  if (elapsed > maxDuration) return [];

  const progress = elapsed / maxDuration;
  const particles = [];
  const numParticles = 16;
  const radius = 1 + progress * 8;

  // Color progression: yellow -> orange -> red -> dark
  let fg, bg;
  if (progress < 0.3) {
    fg = 226; bg = 208; // yellow on orange
  } else if (progress < 0.6) {
    fg = 208; bg = 196; // orange on red
  } else {
    fg = 196; bg = 233; // red on dark
  }

  const chars = '\u2588\u2593\u2592*\u00B7'; // █▓▒*·
  const charIdx = Math.min(Math.floor(progress * chars.length), chars.length - 1);

  for (let i = 0; i < numParticles; i++) {
    const angle = (i / numParticles) * Math.PI * 2;
    const r = radius * (0.5 + Math.random() * 0.5);
    const dx = Math.round(Math.cos(angle) * r);
    const dy = Math.round(Math.sin(angle) * r * 0.5); // aspect correction
    particles.push({
      dx, dy,
      ch: chars[charIdx],
      attr: sattr(fg, bg),
    });
  }

  // Center burst
  if (progress < 0.5) {
    particles.push({ dx: 0, dy: 0, ch: '\u2588', attr: sattr(226, 208) }); // █
  }

  return particles;
}

// Splash effect for misses
function splashFrame(elapsed, maxDuration) {
  if (elapsed > maxDuration) return [];

  const progress = elapsed / maxDuration;
  const particles = [];
  const radius = 1 + progress * 5;
  const numParticles = 10;

  // Fade from bright cyan to dark
  let fg;
  if (progress < 0.3) {
    fg = 159; // light cyan
  } else if (progress < 0.6) {
    fg = 117; // medium cyan
  } else {
    fg = 31; // dark cyan
  }

  const chars = '\u2022\u00B7~\u2248'; // •·~≈
  const charIdx = Math.min(Math.floor(progress * chars.length), chars.length - 1);

  for (let i = 0; i < numParticles; i++) {
    const angle = (i / numParticles) * Math.PI * 2;
    const dx = Math.round(Math.cos(angle) * radius);
    const dy = Math.round(Math.sin(angle) * radius * 0.5);
    particles.push({
      dx, dy,
      ch: chars[charIdx],
      attr: sattr(fg, 17),
    });
  }

  return particles;
}

// Render particles to screen buffer at given center position
function renderParticles(screen, particles, cx, cy) {
  const w = screen.width;
  const h = screen.height;

  for (const p of particles) {
    const sx = cx + p.dx;
    const sy = cy + p.dy;
    if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
    const row = screen.lines[sy];
    if (!row || sx >= row.length) continue;
    row[sx][0] = p.attr;
    row[sx][1] = p.ch;
  }
}

module.exports = {
  explosionFrame,
  splashFrame,
  renderParticles,
};
