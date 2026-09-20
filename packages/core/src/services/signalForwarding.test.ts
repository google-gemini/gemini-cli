/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  SignalForwarder,
  FORWARDED_SIGNALS,
  DEFAULT_SIGNAL_GRACE_MS,
  installSignalForwarders,
} from './signalForwarding.js';

/**
 * Creates a mock ChildProcess backed by an EventEmitter.
 */
function createMockChild(): ChildProcess {
  const emitter = new EventEmitter();
  const mock = emitter as unknown as ChildProcess;
  Object.assign(mock, {
    pid: 99999,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: '',
    stdin: null,
    stdout: null,
    stderr: null,
    stdio: [null, null, null],
    kill: vi.fn().mockReturnValue(true),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
  });
  return mock;
}

describe('SignalForwarder', () => {
  let child: ChildProcess;
  let originalListeners: Map<string, ((...args: unknown[]) => void)[]>;

  beforeEach(() => {
    child = createMockChild();
    // Snapshot existing process signal listeners to restore later
    originalListeners = new Map();
    for (const sig of FORWARDED_SIGNALS) {
      originalListeners.set(sig, [...process.listeners(sig)]);
    }
  });

  afterEach(() => {
    // Restore original listeners
    for (const sig of FORWARDED_SIGNALS) {
      process.removeAllListeners(sig);
      const original = originalListeners.get(sig) ?? [];
      for (const fn of original) {
        process.on(sig, fn as (...args: unknown[]) => void);
      }
    }
    vi.restoreAllMocks();
  });

  describe('constructor and constants', () => {
    it('should export FORWARDED_SIGNALS with the expected signals', () => {
      expect(FORWARDED_SIGNALS).toContain('SIGTERM');
      expect(FORWARDED_SIGNALS).toContain('SIGHUP');
      expect(FORWARDED_SIGNALS).toContain('SIGINT');
      expect(FORWARDED_SIGNALS).toContain('SIGQUIT');
      expect(FORWARDED_SIGNALS).toContain('SIGUSR1');
      expect(FORWARDED_SIGNALS).toContain('SIGUSR2');
      expect(FORWARDED_SIGNALS).toHaveLength(6);
    });

    it('should not include uncatchable signals', () => {
      expect(FORWARDED_SIGNALS).not.toContain('SIGKILL');
      expect(FORWARDED_SIGNALS).not.toContain('SIGSTOP');
    });

    it('should export a reasonable default grace period', () => {
      expect(DEFAULT_SIGNAL_GRACE_MS).toBe(5000);
    });
  });

  describe('install', () => {
    it('should register handlers for all forwarded signals', () => {
      const forwarder = new SignalForwarder(child);
      const listenerCountsBefore = FORWARDED_SIGNALS.map((sig) =>
        process.listenerCount(sig),
      );

      forwarder.install();

      for (let i = 0; i < FORWARDED_SIGNALS.length; i++) {
        expect(process.listenerCount(FORWARDED_SIGNALS[i])).toBe(
          listenerCountsBefore[i] + 1,
        );
      }

      forwarder.remove();
    });

    it('should be idempotent ,  calling install twice does not add duplicate listeners', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();
      const countAfterFirst = FORWARDED_SIGNALS.map((sig) =>
        process.listenerCount(sig),
      );

      forwarder.install(); // second call ,  should be no-op

      for (let i = 0; i < FORWARDED_SIGNALS.length; i++) {
        expect(process.listenerCount(FORWARDED_SIGNALS[i])).toBe(
          countAfterFirst[i],
        );
      }

      forwarder.remove();
    });

    it('should accept a custom subset of signals', () => {
      const subset: NodeJS.Signals[] = ['SIGTERM', 'SIGHUP'];
      const forwarder = new SignalForwarder(child, subset);
      forwarder.install();

      expect(forwarder.size).toBe(2);

      forwarder.remove();
    });

    it('should set isInstalled to true after install', () => {
      const forwarder = new SignalForwarder(child);
      expect(forwarder.isInstalled()).toBe(false);

      forwarder.install();
      expect(forwarder.isInstalled()).toBe(true);

      forwarder.remove();
    });
  });

  describe('signal forwarding', () => {
    it('should forward SIGTERM to the child process', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();

      process.emit('SIGTERM');

      expect(child.kill).toHaveBeenCalledWith('SIGTERM');

      forwarder.remove();
    });

    it('should forward SIGHUP to the child process', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();

      process.emit('SIGHUP');

      expect(child.kill).toHaveBeenCalledWith('SIGHUP');

      forwarder.remove();
    });

    it('should forward SIGINT to the child process', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();

      // SIGINT has default behavior that would terminate, so we need to
      // check the mock was called rather than actually emitting
      process.emit('SIGINT');

      expect(child.kill).toHaveBeenCalledWith('SIGINT');

      forwarder.remove();
    });

    it('should forward SIGUSR1 to the child process', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();

      process.emit('SIGUSR1');

      expect(child.kill).toHaveBeenCalledWith('SIGUSR1');

      forwarder.remove();
    });

    it('should forward SIGUSR2 to the child process', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();

      process.emit('SIGUSR2');

      expect(child.kill).toHaveBeenCalledWith('SIGUSR2');

      forwarder.remove();
    });

    it('should handle child.kill() throwing when child has already exited', () => {
      vi.mocked(child.kill).mockImplementation(() => {
        throw new Error('kill ESRCH');
      });

      const forwarder = new SignalForwarder(child);
      forwarder.install();

      // Should not throw
      expect(() => process.emit('SIGTERM')).not.toThrow();

      forwarder.remove();
    });

    it('should handle child.kill() returning false (child already gone)', () => {
      vi.mocked(child.kill).mockReturnValue(false);

      const forwarder = new SignalForwarder(child);
      forwarder.install();

      // Should not throw
      expect(() => process.emit('SIGTERM')).not.toThrow();
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');

      forwarder.remove();
    });
  });

  describe('remove', () => {
    it('should remove all installed signal handlers', () => {
      const forwarder = new SignalForwarder(child);
      const listenerCountsBefore = FORWARDED_SIGNALS.map((sig) =>
        process.listenerCount(sig),
      );

      forwarder.install();
      forwarder.remove();

      for (let i = 0; i < FORWARDED_SIGNALS.length; i++) {
        expect(process.listenerCount(FORWARDED_SIGNALS[i])).toBe(
          listenerCountsBefore[i],
        );
      }
    });

    it('should set isInstalled to false after remove', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();
      forwarder.remove();

      expect(forwarder.isInstalled()).toBe(false);
    });

    it('should be idempotent ,  calling remove twice should not throw', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();

      forwarder.remove();
      expect(() => forwarder.remove()).not.toThrow();
    });

    it('should be safe to call without prior install', () => {
      const forwarder = new SignalForwarder(child);
      expect(() => forwarder.remove()).not.toThrow();
    });

    it('should not affect other listeners on the same signals', () => {
      const otherHandler = vi.fn();
      process.on('SIGTERM', otherHandler);

      const forwarder = new SignalForwarder(child);
      forwarder.install();
      forwarder.remove();

      // The other handler should still be registered
      expect(process.listeners('SIGTERM')).toContain(otherHandler);

      process.off('SIGTERM', otherHandler);
    });

    it('should stop forwarding signals after removal', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();
      forwarder.remove();

      // Emitting SIGUSR2 (safe to emit without side effects)
      process.emit('SIGUSR2');

      // child.kill should not have been called after removal
      expect(child.kill).not.toHaveBeenCalled();
    });
  });

  describe('escalation to SIGKILL', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should escalate to SIGKILL after grace period for SIGTERM', () => {
      const forwarder = new SignalForwarder(child, ['SIGTERM'], 3000);
      forwarder.install();

      process.emit('SIGTERM');
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(child.kill).not.toHaveBeenCalledWith('SIGKILL');

      vi.advanceTimersByTime(3000);

      expect(child.kill).toHaveBeenCalledWith('SIGKILL');

      forwarder.remove();
    });

    it('should escalate to SIGKILL after grace period for SIGHUP', () => {
      const forwarder = new SignalForwarder(child, ['SIGHUP'], 2000);
      forwarder.install();

      process.emit('SIGHUP');
      vi.advanceTimersByTime(2000);

      expect(child.kill).toHaveBeenCalledWith('SIGKILL');

      forwarder.remove();
    });

    it('should escalate to SIGKILL after grace period for SIGQUIT', () => {
      const forwarder = new SignalForwarder(child, ['SIGQUIT'], 2000);
      forwarder.install();

      process.emit('SIGQUIT');
      vi.advanceTimersByTime(2000);

      expect(child.kill).toHaveBeenCalledWith('SIGKILL');

      forwarder.remove();
    });

    it('should NOT escalate for non-fatal signals like SIGUSR1', () => {
      const forwarder = new SignalForwarder(child, ['SIGUSR1'], 1000);
      forwarder.install();

      process.emit('SIGUSR1');
      vi.advanceTimersByTime(5000);

      expect(child.kill).toHaveBeenCalledWith('SIGUSR1');
      expect(child.kill).not.toHaveBeenCalledWith('SIGKILL');

      forwarder.remove();
    });

    it('should cancel escalation timer when remove is called', () => {
      const forwarder = new SignalForwarder(child, ['SIGTERM'], 3000);
      forwarder.install();

      process.emit('SIGTERM');
      forwarder.remove(); // should cancel the escalation timer

      vi.advanceTimersByTime(5000);

      // SIGKILL should NOT have been sent because we removed forwarders
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(child.kill).not.toHaveBeenCalledWith('SIGKILL');
    });

    it('should not start multiple escalation timers for repeated signals', () => {
      const forwarder = new SignalForwarder(child, ['SIGTERM'], 3000);
      forwarder.install();

      process.emit('SIGTERM');
      process.emit('SIGTERM'); // second signal ,  timer already running

      vi.advanceTimersByTime(3000);

      // SIGKILL should be sent exactly once
      const killCalls = vi.mocked(child.kill).mock.calls;
      const sigkillCount = killCalls.filter(
        (call) => call[0] === 'SIGKILL',
      ).length;
      expect(sigkillCount).toBe(1);

      forwarder.remove();
    });

    it('should handle SIGKILL escalation when child already exited', () => {
      vi.mocked(child.kill).mockImplementation((signal) => {
        if (signal === 'SIGKILL') {
          throw new Error('kill ESRCH');
        }
        return true;
      });

      const forwarder = new SignalForwarder(child, ['SIGTERM'], 1000);
      forwarder.install();

      process.emit('SIGTERM');
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();

      forwarder.remove();
    });
  });

  describe('reinstall after remove', () => {
    it('should allow re-installation after removal', () => {
      const forwarder = new SignalForwarder(child);
      forwarder.install();
      forwarder.remove();

      expect(forwarder.isInstalled()).toBe(false);
      expect(forwarder.size).toBe(0);

      forwarder.install();
      expect(forwarder.isInstalled()).toBe(true);
      expect(forwarder.size).toBe(FORWARDED_SIGNALS.length);

      process.emit('SIGUSR2');
      expect(child.kill).toHaveBeenCalledWith('SIGUSR2');

      forwarder.remove();
    });
  });
});

describe('installSignalForwarders', () => {
  let child: ChildProcess;
  let originalListeners: Map<string, ((...args: unknown[]) => void)[]>;

  beforeEach(() => {
    child = createMockChild();
    originalListeners = new Map();
    for (const sig of FORWARDED_SIGNALS) {
      originalListeners.set(sig, [...process.listeners(sig)]);
    }
  });

  afterEach(() => {
    for (const sig of FORWARDED_SIGNALS) {
      process.removeAllListeners(sig);
      const original = originalListeners.get(sig) ?? [];
      for (const fn of original) {
        process.on(sig, fn as (...args: unknown[]) => void);
      }
    }
    vi.restoreAllMocks();
  });

  it('should install forwarders and return a cleanup function', () => {
    const cleanup = installSignalForwarders(child);

    process.emit('SIGUSR2');
    expect(child.kill).toHaveBeenCalledWith('SIGUSR2');

    cleanup();
    vi.mocked(child.kill).mockClear();

    process.emit('SIGUSR2');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('should accept a custom subset of signals', () => {
    const cleanup = installSignalForwarders(child, ['SIGTERM']);

    process.emit('SIGTERM');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    // SIGUSR2 is not in the subset ,  should not be forwarded
    vi.mocked(child.kill).mockClear();
    process.emit('SIGUSR2');
    expect(child.kill).not.toHaveBeenCalled();

    cleanup();
  });

  it('should be safe to call cleanup multiple times', () => {
    const cleanup = installSignalForwarders(child);
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });
});
