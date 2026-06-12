/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the post-exit output drain watchdog (#25166).
 *
 * These tests mock the headless terminal so the xterm write callback is
 * under test control, which is how the stuck state reproduces: the exit
 * result is gated on the output processing chain, and a write callback
 * that never fires used to leave the execution unresolved forever, with
 * the UI stuck showing the shell as awaiting input.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  ShellExecutionService,
  DRAIN_STALL_TIMEOUT_MS,
  type ShellExecutionConfig,
} from './shellExecutionService.js';
import { NoopSandboxManager } from './sandboxManager.js';
import { ExecutionLifecycleService } from './executionLifecycleService.js';

// Hoisted Mocks
const mockPtySpawn = vi.hoisted(() => vi.fn());
const mockIsBinary = vi.hoisted(() => vi.fn());
const mockPlatform = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn());
const mockGetPty = vi.hoisted(() => vi.fn());
const mockSerializeTerminalToObject = vi.hoisted(() => vi.fn());
const mockResolveExecutable = vi.hoisted(() => vi.fn());
const mockDebugLogger = vi.hoisted(() => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

/**
 * Controllable headless terminal: write callbacks are queued instead of
 * fired, so each test decides when (or whether) a chunk finishes draining.
 */
const terminalState = vi.hoisted(() => ({
  pendingWriteCallbacks: [] as Array<() => void>,
}));

vi.mock('@xterm/headless', () => {
  class MockTerminal {
    buffer = {
      active: {
        viewportY: 0,
        baseY: 0,
        cursorY: 0,
        length: 0,
        getLine: () => undefined,
      },
    };
    scrollToTop = vi.fn();
    onScroll = vi.fn();
    resize = vi.fn();
    scrollLines = vi.fn();
    dispose = vi.fn();
    write = vi.fn((_data: string, cb?: () => void) => {
      if (cb) {
        terminalState.pendingWriteCallbacks.push(cb);
      }
    });
  }
  return {
    default: { Terminal: MockTerminal },
    Terminal: MockTerminal,
  };
});

vi.mock('../config/storage.js', () => ({
  Storage: {
    getGlobalTempDir: vi.fn().mockReturnValue('/mock/temp'),
  },
}));
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: mockDebugLogger,
}));
vi.mock('../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/shell-utils.js')>();
  return {
    ...actual,
    resolveExecutable: mockResolveExecutable,
  };
});
vi.mock('../utils/textUtils.js', () => ({
  isBinary: mockIsBinary,
}));
vi.mock('node:os', () => ({
  default: {
    platform: mockPlatform,
    homedir: mockHomedir,
    constants: { signals: { SIGTERM: 15, SIGKILL: 9 } },
  },
  platform: mockPlatform,
  homedir: mockHomedir,
  constants: { signals: { SIGTERM: 15, SIGKILL: 9 } },
}));
vi.mock('../utils/getPty.js', () => ({
  getPty: mockGetPty,
}));
vi.mock('../utils/terminalSerializer.js', () => ({
  serializeTerminalToObject: (
    _terminal: unknown,
    ...args: [number | undefined, number | undefined]
  ) => mockSerializeTerminalToObject(...args),
  convertColorToHex: () => '#000000',
  ColorMode: { DEFAULT: 0, PALETTE: 1, RGB: 2 },
}));

const shellExecutionConfig: ShellExecutionConfig = {
  sessionId: 'default',
  terminalWidth: 80,
  terminalHeight: 24,
  pager: 'cat',
  showColor: false,
  disableDynamicLineTrimming: true,
  sanitizationConfig: {
    enableEnvironmentVariableRedaction: false,
    allowedEnvironmentVariables: [],
    blockedEnvironmentVariables: [],
  },
  sandboxManager: new NoopSandboxManager(),
};

describe('ShellExecutionService drain watchdog', () => {
  let mockPtyProcess: {
    pid: number;
    kill: ReturnType<typeof vi.fn>;
    onData: ReturnType<typeof vi.fn>;
    onExit: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    ExecutionLifecycleService.resetForTest();
    ShellExecutionService.resetForTest();
    terminalState.pendingWriteCallbacks.length = 0;
    mockSerializeTerminalToObject.mockReturnValue([]);
    mockIsBinary.mockReturnValue(false);
    mockPlatform.mockReturnValue('linux');
    mockResolveExecutable.mockImplementation((exe: string) => exe);
    mockGetPty.mockResolvedValue({
      module: { spawn: mockPtySpawn },
      name: 'mock-pty',
    });

    mockPtyProcess = {
      pid: 12345,
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
    };
    mockPtySpawn.mockReturnValue(mockPtyProcess);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const startExecution = async (command: string) => {
    const handle = await ShellExecutionService.execute(
      command,
      '/test/dir',
      vi.fn(),
      new AbortController().signal,
      true,
      shellExecutionConfig,
    );
    // Let the microtask that registers onData/onExit run.
    await vi.advanceTimersByTimeAsync(0);
    return handle;
  };

  const emitData = (chunk: string) => {
    mockPtyProcess.onData.mock.calls[0][0](chunk);
  };

  const emitExit = (exitCode = 0) => {
    mockPtyProcess.onExit.mock.calls[0][0]({ exitCode, signal: null });
  };

  it('finalizes the execution when a write callback is never invoked', async () => {
    const handle = await startExecution('echo hello');

    emitData('hello\r\n'); // its write callback is intentionally never fired
    emitExit(0);

    let resolved = false;
    const resultPromise = handle.result.then((r) => {
      resolved = true;
      return r;
    });

    // Before the watchdog window elapses the execution is still pending.
    await vi.advanceTimersByTimeAsync(DRAIN_STALL_TIMEOUT_MS / 2);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(DRAIN_STALL_TIMEOUT_MS);
    const result = await resultPromise;

    expect(resolved).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(mockDebugLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('drain stalled'),
    );
  });

  it('does not cut short a slow drain that keeps making progress', async () => {
    const handle = await startExecution('big-output');

    emitData('chunk-1');
    emitData('chunk-2');
    emitData('chunk-3');
    emitExit(0);

    let resolved = false;
    void handle.result.then(() => {
      resolved = true;
    });

    // Each chunk settles slower than the poll cadence but faster than the
    // stall window; total drain time exceeds the window. Progress must
    // keep the watchdog from firing.
    const step = DRAIN_STALL_TIMEOUT_MS * 0.75;
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(step);
      expect(resolved).toBe(false);
      terminalState.pendingWriteCallbacks.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
    }

    const result = await handle.result;
    expect(result.exitCode).toBe(0);
    expect(mockDebugLogger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('drain stalled'),
    );
  });

  it('does not start a watchdog when there is nothing left to drain', async () => {
    const handle = await startExecution('true');

    emitExit(0);
    await vi.advanceTimersByTimeAsync(0);

    const result = await handle.result;
    expect(result.exitCode).toBe(0);
    expect(mockDebugLogger.warn).not.toHaveBeenCalled();
  });
});
