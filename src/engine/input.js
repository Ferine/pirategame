'use strict';

class InputHandler {
  constructor(screen, stateMachine) {
    this.screen = screen;
    this.stateMachine = stateMachine;
    this._bind();
  }

  _bind() {
    // Arrow keys
    this.screen.key(['up', 'down', 'left', 'right'], (ch, key) => {
      this.stateMachine.handleInput(key.name);
    });

    // WASD
    this.screen.key(['w', 'a', 's', 'd'], (ch, key) => {
      const map = { w: 'up', a: 'left', s: 'down', d: 'right' };
      this.stateMachine.handleInput(map[key.name] || key.name);
    });

    // Enter
    this.screen.key(['enter', 'return'], () => {
      this.stateMachine.handleInput('enter');
    });

    // Space
    this.screen.key(['space'], () => {
      this.stateMachine.handleInput('space');
    });

    // C toggles CRT in overworld
    this.screen.key(['c'], () => {
      this.stateMachine.handleInput('c');
    });

    // V for combat test
    this.screen.key(['v'], () => {
      this.stateMachine.handleInput('combat_test');
    });

    // P for port test
    this.screen.key(['p'], () => {
      this.stateMachine.handleInput('port_test');
    });

    // X to dig (island exploration)
    this.screen.key(['x'], () => {
      this.stateMachine.handleInput('dig');
    });

    // Q to quit
    this.screen.key(['q'], () => {
      this.stateMachine.handleInput('q');
    });

    // Numeric keys (used by some overlays)
    this.screen.key(['1', '2'], (ch, key) => {
      this.stateMachine.handleInput(key.name);
    });

    // Ctrl-C to exit
    this.screen.key(['C-c'], () => {
      process.exit(0);
    });
  }
}

module.exports = { InputHandler };
