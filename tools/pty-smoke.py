#!/usr/bin/env python3
"""Headless PTY smoke test: launch the real game, feed scripted keystrokes,
and detect crashes (uncaught exceptions print stack traces / 'Fatal error')."""
import os, pty, sys, time, select, signal, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Key sequences. Each entry: (label, bytes, wait_seconds_after)
ESC = b'\x1b'
ENTER = b'\r'
def arrows(d): return {'up':ESC+b'[A','down':ESC+b'[B','right':ESC+b'[C','left':ESC+b'[D'}[d]

SCRIPT = []
def add(label, keys, wait=0.4):
    SCRIPT.append((label, keys, wait))

# Title screen -> New Game (navigate menu). Title menu: Continue/New/Load/Quit.
add('title-settle', b'', 1.5)
add('menu-down', arrows('down'), 0.3)
add('menu-up', arrows('up'), 0.3)
add('select', ENTER, 1.2)            # pick first menu item
add('select2', ENTER, 1.2)           # confirm any submenu (difficulty etc.)
add('select3', ENTER, 1.0)
# Overworld: sail around
for i in range(6):
    add(f'sail-right-{i}', arrows('right'), 0.25)
for i in range(4):
    add(f'sail-down-{i}', arrows('down'), 0.25)
# Open various overlays
add('helm-menu', b'n', 0.6); add('helm-close', b'n', 0.4)
add('journal', b'j', 0.6); add('journal-close', b'q', 0.4)
add('captains-log', b'l', 0.6); add('log-close', b'q', 0.4)
add('crt-toggle', b'c', 0.4); add('crt-toggle2', b'c', 0.4)
add('mission-board', b'm', 0.6); add('mission-close', b'q', 0.4)
add('reputation', b'r', 0.6); add('rep-close', b'q', 0.4)
add('fleet', b'f', 0.6); add('fleet-close', b'q', 0.4)
# more sailing to maybe trigger encounters / weather
for i in range(20):
    add(f'wander-{i}', arrows(['up','down','left','right'][i % 4]), 0.2)
add('space-fire', b' ', 0.4)
add('enter-poke', ENTER, 0.4)
add('quit-mode', b'q', 0.6)

def main():
    rows, cols = 44, 130
    pid, fd = pty.fork()
    if pid == 0:  # child
        os.environ['TERM'] = 'xterm-256color'
        os.environ['LINES'] = str(rows)
        os.environ['COLUMNS'] = str(cols)
        os.environ['KK_DEBUG'] = '1'  # fail fast on loop errors so we detect them
        # Isolate saves/persistent/crash-log to a temp HOME so smoke runs never
        # touch the player's real ~/.kattegat-kaper data.
        import tempfile
        os.environ['HOME'] = os.path.join(tempfile.gettempdir(), 'kk-smoke-home')
        os.chdir(ROOT)
        os.execvp('node', ['node', 'src/index.js'])
        os._exit(127)

    # parent: set window size
    import fcntl, termios, struct
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

    captured = bytearray()
    def drain(timeout=0.05):
        end = time.time() + timeout
        while time.time() < end:
            r, _, _ = select.select([fd], [], [], max(0, end - time.time()))
            if r:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    return False
                if not data:
                    return False
                captured.extend(data)
        return True

    alive = True
    drain(1.0)
    for label, keys, wait in SCRIPT:
        if keys:
            try:
                os.write(fd, keys)
            except OSError:
                alive = False
                break
        if not drain(wait):
            alive = False
            break

    # graceful quit
    try:
        os.write(fd, b'\x03')  # Ctrl-C
    except OSError:
        pass
    drain(0.6)

    # reap
    status = None
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass
    try:
        _, status = os.waitpid(pid, 0)
    except OSError:
        pass

    text = captured.decode('utf-8', errors='replace')
    # strip ansi for crash scan
    clean = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', text)
    clean = re.sub(r'\x1b[\]P_].*?(\x07|\x1b\\)', '', clean, flags=re.S)

    crash_markers = ['Fatal error:', 'TypeError', 'ReferenceError', 'RangeError',
                     'is not a function', 'Cannot read', 'undefined is not',
                     'at Object.', 'throw ', 'UnhandledPromiseRejection']
    hits = []
    for m in crash_markers:
        for mo in re.finditer(re.escape(m), clean):
            s = max(0, mo.start() - 80)
            e = min(len(clean), mo.start() + 200)
            hits.append(clean[s:e].strip())

    print('=== PTY SMOKE RESULT ===')
    print(f'child alive through script: {alive}')
    print(f'captured bytes: {len(captured)}')
    if status is not None:
        print(f'exit status raw: {status}')
    if hits:
        print(f'\n!!! {len(hits)} crash marker(s) found:')
        seen = set()
        for h in hits:
            key = h[:60]
            if key in seen: continue
            seen.add(key)
            print('---')
            print(h)
        sys.exit(2)
    else:
        print('No crash markers detected.')

if __name__ == '__main__':
    main()
