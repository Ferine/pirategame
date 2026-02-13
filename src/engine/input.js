'use strict';

class InputHandler {
  constructor(screen, stateMachine) {
    this.screen = screen;
    this.stateMachine = stateMachine;
    this._bind();
  }

  _bind() {
    // Movement keys (Arrows + WASD)
    const movementKeys = {
      up: 'up', down: 'down', left: 'left', right: 'right',
      w: 'up', a: 'left', s: 'down', d: 'right'
    };

    this.screen.key(Object.keys(movementKeys), (ch, key) => {
      this.stateMachine.handleInput(movementKeys[key.name] || key.name);
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

    // T to talk (city NPCs)
    this.screen.key(['t'], () => {
      this.stateMachine.handleInput('talk');
    });

    // M for map or missions
    this.screen.key(['m'], () => {
      this.stateMachine.handleInput('m');
    });

    // R for reputation board
    this.screen.key(['r'], () => {
      this.stateMachine.handleInput('r');
    });

    // F for fleet roster
    this.screen.key(['f'], () => {
      this.stateMachine.handleInput('f');
    });

    // Q to quit
    this.screen.key(['q'], () => {
      this.stateMachine.handleInput('q');
    });

    // Tab for convoy formation toggle
    this.screen.key(['tab'], () => {
      this.stateMachine.handleInput('tab');
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
