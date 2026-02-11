'use strict';

const TARGET_FPS = 12;
const FRAME_MS = Math.floor(1000 / TARGET_FPS);
const MAX_DT = 0.25; // cap to prevent spiral of death

class GameLoop {
  constructor(stateMachine, screen) {
    this.stateMachine = stateMachine;
    this.screen = screen;
    this.running = false;
    this.lastTime = 0;
    this._timer = null;
  }

  start() {
    this.running = true;
    this.lastTime = Date.now();
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _tick() {
    if (!this.running) return;

    const now = Date.now();
    let dt = (now - this.lastTime) / 1000;
    dt = Math.min(dt, MAX_DT);
    this.lastTime = now;

    this.stateMachine.update(dt);
    this.stateMachine.render(this.screen);
    this.screen.render();

    const elapsed = Date.now() - now;
    const delay = Math.max(0, FRAME_MS - elapsed);
    this._timer = setTimeout(() => this._tick(), delay);
  }
}

module.exports = { GameLoop };
