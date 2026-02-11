'use strict';

class StateMachine {
  constructor() {
    this.modes = {};
    this.currentMode = null;
    this.currentName = null;
  }

  register(name, mode) {
    this.modes[name] = mode;
  }

  transition(name, gameState) {
    if (this.currentMode && this.currentMode.exit) {
      this.currentMode.exit();
    }
    this.currentName = name;
    this.currentMode = this.modes[name];
    if (this.currentMode && this.currentMode.enter) {
      this.currentMode.enter(gameState);
    }
  }

  update(dt) {
    if (this.currentMode && this.currentMode.update) {
      this.currentMode.update(dt);
    }
  }

  render(screen) {
    if (this.currentMode && this.currentMode.render) {
      this.currentMode.render(screen);
    }
  }

  handleInput(key) {
    if (this.currentMode && this.currentMode.handleInput) {
      this.currentMode.handleInput(key);
    }
  }
}

module.exports = { StateMachine };
