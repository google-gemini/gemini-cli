/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

vi.mock('@google/gemini-cli-core', () => ({
  Storage: vi.fn().mockImplementation(() => ({
    getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
  shutdownTelemetry: vi.fn(),
  isTelemetrySdkInitialized: vi.fn().mockReturnValue(false),
  ExitCodes: { SUCCESS: 0 },
}));

vi.mock('node:fs', () => ({
  promises: {
    rm: vi.fn(),
  },
}));

import {
  registerCleanup,
  runExitCleanup,
  registerSyncCleanup,
  runSyncCleanup,
  cleanupCheckpoints,
  resetCleanupForTesting,
  setupSignalHandlers,
  setupTtyCheck,
} from './cleanup.js';

describe('cleanup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetCleanupForTesting();
  });

  it('should run a registered synchronous function', async () => {
    const cleanupFn = vi.fn();
    registerCleanup(cleanupFn);

    await runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run a registered asynchronous function', async () => {
    const cleanupFn = vi.fn().mockResolvedValue(undefined);
    registerCleanup(cleanupFn);

    await runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run multiple registered functions', async () => {
    const syncFn = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue(undefined);

    registerCleanup(syncFn);
    registerCleanup(asyncFn);

    await runExitCleanup();

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should continue running cleanup functions even if one throws an error', async () => {
    const errorFn = vi.fn().mockImplementation(() => {
      throw new Error('test error');
    });
    const successFn = vi.fn();
    registerCleanup(errorFn);
    registerCleanup(successFn);

    await expect(runExitCleanup()).resolves.not.toThrow();

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  describe('sync cleanup', () => {
    it('should run registered sync functions', async () => {
      const syncFn = vi.fn();
      registerSyncCleanup(syncFn);
      runSyncCleanup();
      expect(syncFn).toHaveBeenCalledTimes(1);
    });

    it('should continue running sync cleanup functions even if one throws', async () => {
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('test error');
      });
      const successFn = vi.fn();
      registerSyncCleanup(errorFn);
      registerSyncCleanup(successFn);

      expect(() => runSyncCleanup()).not.toThrow();
      expect(errorFn).toHaveBeenCalledTimes(1);
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupCheckpoints', () => {
    it('should remove checkpoints directory', async () => {
      await cleanupCheckpoints();
      expect(fs.rm).toHaveBeenCalledWith(
        path.join('/tmp/project', 'checkpoints'),
        {
          recursive: true,
          force: true,
        },
      );
    });

    it('should ignore errors during checkpoint removal', async () => {
      vi.mocked(fs.rm).mockRejectedValue(new Error('Failed to remove'));
      await expect(cleanupCheckpoints()).resolves.not.toThrow();
    });
  });
});

describe('signal and TTY handling', () => {
  let processOnHandlers: Map<
    string,
    Array<(...args: unknown[]) => void | Promise<void>>
  >;

  beforeEach(() => {
    processOnHandlers = new Map();
    resetCleanupForTesting();

    vi.spyOn(process, 'on').mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (typeof event === 'string') {
          const handlers = processOnHandlers.get(event) || [];
          handlers.push(handler);
          processOnHandlers.set(event, handlers);
        }
        return process;
      },
    );

    vi.spyOn(process, 'exit').mockImplementation((() => {
      // Don't actually exit
    }) as typeof process.exit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    processOnHandlers.clear();
  });

  describe('setupSignalHandlers', () => {
    it('should register handlers for SIGHUP, SIGTERM, and SIGINT', () => {
      setupSignalHandlers();

      expect(processOnHandlers.has('SIGHUP')).toBe(true);
      expect(processOnHandlers.has('SIGTERM')).toBe(true);
      expect(processOnHandlers.has('SIGINT')).toBe(true);
    });

    it('should gracefully shutdown when SIGHUP is received', async () => {
      setupSignalHandlers();

      const sighupHandlers = processOnHandlers.get('SIGHUP') || [];
      expect(sighupHandlers.length).toBeGreaterThan(0);

      await sighupHandlers[0]?.();

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should register SIGTERM handler that can trigger shutdown', () => {
      setupSignalHandlers();

      const sigtermHandlers = processOnHandlers.get('SIGTERM') || [];
      expect(sigtermHandlers.length).toBeGreaterThan(0);
      expect(typeof sigtermHandlers[0]).toBe('function');
    });
  });

  describe('setupTtyCheck', () => {
    let originalStdinIsTTY: boolean | undefined;
    let originalStdoutIsTTY: boolean | undefined;

    beforeEach(() => {
      originalStdinIsTTY = process.stdin.isTTY;
      originalStdoutIsTTY = process.stdout.isTTY;
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalStdinIsTTY,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalStdoutIsTTY,
        writable: true,
        configurable: true,
      });
    });

    it('should return a cleanup function', () => {
      const cleanup = setupTtyCheck();
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('should not exit when both stdin and stdout are TTY', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });

      const cleanup = setupTtyCheck();
      await vi.advanceTimersByTimeAsync(5000);
      expect(process.exit).not.toHaveBeenCalled();
      cleanup();
    });

    it('should exit when both stdin and stdout are not TTY', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });

      const cleanup = setupTtyCheck();
      await vi.advanceTimersByTimeAsync(5000);
      expect(process.exit).toHaveBeenCalledWith(0);
      cleanup();
    });

    it('should not check when SANDBOX env is set', async () => {
      const originalSandbox = process.env['SANDBOX'];
      process.env['SANDBOX'] = 'true';

      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });

      const cleanup = setupTtyCheck();
      await vi.advanceTimersByTimeAsync(5000);
      expect(process.exit).not.toHaveBeenCalled();
      cleanup();
      process.env['SANDBOX'] = originalSandbox;
    });

    it('cleanup function should stop the interval', () => {
      const cleanup = setupTtyCheck();
      cleanup();
      vi.advanceTimersByTime(10000);
      expect(process.exit).not.toHaveBeenCalled();
    });
  });
});
