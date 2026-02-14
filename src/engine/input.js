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
      this.stateMachine.handleInput('v');
    });

    // P for port test
    this.screen.key(['p'], () => {
      this.stateMachine.handleInput('p');
    });

    // X to dig (island) / sell (fleet) / abandon (quests)
    this.screen.key(['x'], () => {
      this.stateMachine.handleInput('x');
    });

    // T to talk (city NPCs)
    this.screen.key(['t'], () => {
      this.stateMachine.handleInput('t');
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

    // J for campaign journal
    this.screen.key(['j'], () => {
      this.stateMachine.handleInput('j');
    });

    // L for captain's log
    this.screen.key(['l'], () => {
      this.stateMachine.handleInput('l');
    });

    // H for barrel hide (stealth)
    this.screen.key(['h'], () => {
      this.stateMachine.handleInput('h');
    });

    // G for throw stone (stealth)
    this.screen.key(['g'], () => {
      this.stateMachine.handleInput('g');
    });

    // Q to quit
    this.screen.key(['q'], () => {
      this.stateMachine.handleInput('q');
    });

    // N for helmsman navigation
    this.screen.key(['n'], () => {
      this.stateMachine.handleInput('n');
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
