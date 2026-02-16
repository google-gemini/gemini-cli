/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setupSignalHandlers,
  setupTtyCheck,
  validateDnsResolutionOrder,
  getNodeMemoryArgs,
  setupUnhandledRejectionHandler,
} from './gemini.js';

// Mock the cleanup module
const mockRunExitCleanup = vi.fn().mockResolvedValue(undefined);
vi.mock('./utils/cleanup.js', () => ({
  runExitCleanup: () => mockRunExitCleanup(),
  registerCleanup: vi.fn(),
  registerSyncCleanup: vi.fn(),
  cleanupCheckpoints: vi.fn(),
  registerTelemetryConfig: vi.fn(),
}));

// Mock debugLogger
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    debugLogger: {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    },
    ExitCodes: {
      SUCCESS: 0,
      FATAL_INPUT_ERROR: 1,
      FATAL_AUTHENTICATION_ERROR: 2,
    },
  };
});

describe('gemini.tsx signal handling', () => {
  let processOnHandlers: Map<
    string,
    Array<(...args: unknown[]) => void | Promise<void>>
  >;

  beforeEach(() => {
    // Track registered handlers
    processOnHandlers = new Map();

    // Mock process.on to capture handlers
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

    // Mock process.exit
    vi.spyOn(process, 'exit').mockImplementation((() => {
      // Don't actually exit
    }) as typeof process.exit);

    mockRunExitCleanup.mockClear();
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

    it('should call runExitCleanup when SIGHUP is received', async () => {
      setupSignalHandlers();

      const sighupHandlers = processOnHandlers.get('SIGHUP') || [];
      expect(sighupHandlers.length).toBeGreaterThan(0);

      // Trigger the handler
      await sighupHandlers[0]?.();

      expect(mockRunExitCleanup).toHaveBeenCalled();
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
      // Restore TTY values
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
      // Set both as TTY
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

      // Advance timers to trigger the check
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockRunExitCleanup).not.toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();

      cleanup();
    });

    it('should not check when SANDBOX env is set', async () => {
      const originalSandbox = process.env['SANDBOX'];
      process.env['SANDBOX'] = 'true';

      // Set both as non-TTY (would normally trigger exit)
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

      // Advance timers to trigger the check
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockRunExitCleanup).not.toHaveBeenCalled();

      cleanup();
      process.env['SANDBOX'] = originalSandbox;
    });

    it('should not check when GEMINI_NON_INTERACTIVE env is set', async () => {
      const originalNonInteractive = process.env['GEMINI_NON_INTERACTIVE'];
      process.env['GEMINI_NON_INTERACTIVE'] = 'true';

      // Set both as non-TTY (would normally trigger exit)
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

      // Advance timers to trigger the check
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockRunExitCleanup).not.toHaveBeenCalled();

      cleanup();
      process.env['GEMINI_NON_INTERACTIVE'] = originalNonInteractive;
    });

    it('cleanup function should stop the interval', () => {
      const cleanup = setupTtyCheck();

      // Clear mocks before cleanup
      mockRunExitCleanup.mockClear();

      // Call cleanup
      cleanup();

      // Try to advance timers - handler should not run
      vi.advanceTimersByTime(10000);

      expect(mockRunExitCleanup).not.toHaveBeenCalled();
    });
  });

  describe('validateDnsResolutionOrder', () => {
    it('should return ipv4first as default when undefined', () => {
      expect(validateDnsResolutionOrder(undefined)).toBe('ipv4first');
    });

    it('should return ipv4first when specified', () => {
      expect(validateDnsResolutionOrder('ipv4first')).toBe('ipv4first');
    });

    it('should return verbatim when specified', () => {
      expect(validateDnsResolutionOrder('verbatim')).toBe('verbatim');
    });

    it('should return default for invalid values', () => {
      expect(validateDnsResolutionOrder('invalid')).toBe('ipv4first');
    });
  });

  describe('getNodeMemoryArgs', () => {
    let originalNoRelaunch: string | undefined;

    beforeEach(() => {
      originalNoRelaunch = process.env['GEMINI_CLI_NO_RELAUNCH'];
    });

    afterEach(() => {
      if (originalNoRelaunch === undefined) {
        delete process.env['GEMINI_CLI_NO_RELAUNCH'];
      } else {
        process.env['GEMINI_CLI_NO_RELAUNCH'] = originalNoRelaunch;
      }
    });

    it('should return empty array when GEMINI_CLI_NO_RELAUNCH is set', () => {
      process.env['GEMINI_CLI_NO_RELAUNCH'] = 'true';
      const result = getNodeMemoryArgs(false);
      expect(result).toEqual([]);
    });

    it('should return array (possibly empty) based on memory calculation', () => {
      delete process.env['GEMINI_CLI_NO_RELAUNCH'];
      const result = getNodeMemoryArgs(false);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('setupUnhandledRejectionHandler', () => {
    it('should register an unhandledRejection handler', () => {
      setupUnhandledRejectionHandler();

      expect(processOnHandlers.has('unhandledRejection')).toBe(true);
    });
  });
});
