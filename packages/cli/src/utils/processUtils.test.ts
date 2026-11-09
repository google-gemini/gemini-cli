/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import {
  RELAUNCH_EXIT_CODE,
  FORWARDED_SIGNALS,
  setupSignalForwarding,
  handleChildProcessClose,
  relaunchApp,
  _resetRelaunchStateForTesting,
  isStandardSea,
  getScriptArgs,
  isSeaEnvironment,
  getSpawnConfig,
  type ProcessWithSea,
} from './processUtils.js';
import * as cleanup from './cleanup.js';
import * as handleAutoUpdate from './handleAutoUpdate.js';

vi.mock('./handleAutoUpdate.js', () => ({
  waitForUpdateCompletion: vi.fn().mockResolvedValue(undefined),
}));

describe('processUtils', () => {
  const processExit = vi
    .spyOn(process, 'exit')
    .mockReturnValue(undefined as never);
  const runExitCleanup = vi.spyOn(cleanup, 'runExitCleanup');

  beforeEach(() => {
    _resetRelaunchStateForTesting();
  });

  afterEach(() => vi.clearAllMocks());

  it('should wait for updates, run cleanup, and exit with the relaunch code', async () => {
    await relaunchApp();
    expect(handleAutoUpdate.waitForUpdateCompletion).toHaveBeenCalledTimes(1);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });

  it('should send auth override IPC message with callback if options.overrideAuthType is provided', async () => {
    const originalSend = process.send;
    const sendMock = vi.fn((_msg: unknown, cb?: () => void) => {
      if (cb) cb();
      return true;
    });
    Object.defineProperty(process, 'send', {
      value: sendMock,
      configurable: true,
      writable: true,
    });
    vi.stubEnv('VITEST', '');

    try {
      await relaunchApp({ overrideAuthType: 'login_with_google' });
      expect(sendMock).toHaveBeenCalledWith(
        {
          type: 'auth-selected-type',
          authType: 'login_with_google',
        },
        expect.any(Function),
      );
      expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
    } finally {
      Object.defineProperty(process, 'send', {
        value: originalSend,
        configurable: true,
        writable: true,
      });
    }
  });

  it('should fall back to timeout if process.send callback is never called', async () => {
    vi.useFakeTimers();
    const originalSend = process.send;
    const sendMock = vi.fn(() => false);
    Object.defineProperty(process, 'send', {
      value: sendMock,
      configurable: true,
      writable: true,
    });
    vi.stubEnv('VITEST', '');

    try {
      const relaunchPromise = relaunchApp({
        overrideAuthType: 'login_with_google',
      });
      await vi.advanceTimersByTimeAsync(500);
      await relaunchPromise;

      expect(sendMock).toHaveBeenCalled();
      expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
    } finally {
      Object.defineProperty(process, 'send', {
        value: originalSend,
        configurable: true,
        writable: true,
      });
      vi.useRealTimers();
    }
  });
});

describe('SEA handling utilities', () => {
  const originalArgv = process.argv;
  const originalExecArgv = process.execArgv;
  const originalExecPath = process.execPath;
  const originalIsSea = (process as ProcessWithSea).isSea;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_OPTIONS', '');
    process.argv = [...originalArgv];
    process.execArgv = [...originalExecArgv];
    process.execPath = '/fake/exec/path';
    delete (process as ProcessWithSea).isSea;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.argv = originalArgv;
    process.execArgv = originalExecArgv;
    process.execPath = originalExecPath;
    if (originalIsSea) {
      (process as ProcessWithSea).isSea = originalIsSea;
    } else {
      delete (process as ProcessWithSea).isSea;
    }
  });

  describe('isStandardSea', () => {
    it('returns false if argv[0] === argv[1]', () => {
      process.argv = ['/bin/gemini', '/bin/gemini', 'my-command'];
      vi.stubEnv('IS_BINARY', 'true');
      expect(isStandardSea()).toBe(false);
    });

    it('returns true if IS_BINARY is true and argv[0] !== argv[1]', () => {
      process.argv = ['/bin/gemini', 'my-command'];
      vi.stubEnv('IS_BINARY', 'true');
      expect(isStandardSea()).toBe(true);
    });

    it('returns true if process.isSea() is true and argv[0] !== argv[1]', () => {
      process.argv = ['/bin/gemini', 'my-command'];
      (process as ProcessWithSea).isSea = () => true;
      expect(isStandardSea()).toBe(true);
    });

    it('returns false in standard node environment', () => {
      process.argv = ['/bin/node', '/path/to/script.js', 'my-command'];
      expect(isStandardSea()).toBe(false);
    });
  });

  describe('getScriptArgs', () => {
    it('slices from index 1 if isStandardSea is true', () => {
      process.argv = ['/bin/gemini', 'my-command', '--flag'];
      vi.stubEnv('IS_BINARY', 'true');
      expect(getScriptArgs()).toEqual(['my-command', '--flag']);
    });

    it('slices from index 2 if isStandardSea is false (relaunch SEA or standard node)', () => {
      // Relaunch SEA
      process.argv = ['/bin/gemini', '/bin/gemini', 'my-command', '--flag'];
      vi.stubEnv('IS_BINARY', 'true');
      expect(getScriptArgs()).toEqual(['my-command', '--flag']);

      // Standard node
      process.argv = ['/bin/node', '/path/to/script.js', 'my-command'];
      vi.stubEnv('IS_BINARY', '');
      expect(getScriptArgs()).toEqual(['my-command']);
    });
  });

  describe('isSeaEnvironment', () => {
    it('returns true if IS_BINARY is true', () => {
      vi.stubEnv('IS_BINARY', 'true');
      expect(isSeaEnvironment()).toBe(true);
    });

    it('returns true if process.isSea() is true', () => {
      (process as ProcessWithSea).isSea = () => true;
      expect(isSeaEnvironment()).toBe(true);
    });

    it('returns true if argv[0] === argv[1]', () => {
      process.argv = ['/bin/gemini', '/bin/gemini'];
      expect(isSeaEnvironment()).toBe(true);
    });

    it('returns false otherwise', () => {
      process.argv = ['/bin/node', '/path/to/script.js'];
      expect(isSeaEnvironment()).toBe(false);
    });
  });

  describe('getSpawnConfig', () => {
    it('handles standard node mode', () => {
      process.argv = ['/bin/node', '/path/to/script.js', 'my-command'];
      process.execArgv = ['--inspect'];
      process.execPath = '/bin/node';

      const config = getSpawnConfig(
        ['--max-old-space-size=8192'],
        ['my-command'],
      );

      expect(config.spawnArgs).toEqual([
        '--inspect',
        '--max-old-space-size=8192',
        '/path/to/script.js',
        'my-command',
      ]);
      expect(config.env['GEMINI_CLI_NO_RELAUNCH']).toBe('true');
      expect(config.env['NODE_OPTIONS']).toBeFalsy();
    });

    it('handles SEA binary mode with new nodeArgs', () => {
      vi.stubEnv('IS_BINARY', 'true');
      vi.stubEnv('NODE_OPTIONS', '--existing-flag');
      process.argv = ['/bin/gemini', 'my-command'];
      process.execArgv = ['--inspect']; // Should not be duplicated in NODE_OPTIONS
      process.execPath = '/bin/gemini';

      const config = getSpawnConfig(
        ['--max-old-space-size=8192'],
        ['my-command'],
      );

      expect(config.spawnArgs).toEqual([
        '/bin/gemini', // explicitly uses execPath as placeholder
        'my-command',
      ]);
      expect(config.env['NODE_OPTIONS']).toBe(
        '--existing-flag --max-old-space-size=8192',
      );
      expect(config.env['GEMINI_CLI_NO_RELAUNCH']).toBe('true');
    });

    it('throws error for complex nodeArgs in SEA mode', () => {
      vi.stubEnv('IS_BINARY', 'true');

      expect(() => {
        getSpawnConfig(['--title "My App"'], []);
      }).toThrow(
        'Unsupported node argument for SEA relaunch: --title "My App". Complex escaping is not supported.',
      );

      expect(() => {
        getSpawnConfig(['--title=A\\B'], []);
      }).toThrow();
    });
  });

  describe('setupSignalForwarding and handleChildProcessClose', () => {
    const initialListeners = new Map<
      NodeJS.Signals,
      NodeJS.SignalsListener[]
    >();

    beforeEach(() => {
      for (const sig of FORWARDED_SIGNALS) {
        initialListeners.set(sig, process.listeners(sig));
      }
    });

    afterEach(() => {
      for (const sig of FORWARDED_SIGNALS) {
        process.removeAllListeners(sig);
        const listeners = initialListeners.get(sig) || [];
        for (const listener of listeners) {
          process.on(sig, listener);
        }
      }
      initialListeners.clear();
    });

    it('registers forwarders for FORWARDED_SIGNALS and removes them on cleanup', () => {
      const originalPlatform = process.platform;
      const initialCounts = new Map(
        FORWARDED_SIGNALS.map((sig) => [sig, process.listenerCount(sig)]),
      );
      const mockChild = { kill: vi.fn() } as unknown as ChildProcess;

      const removeForwarders = setupSignalForwarding(mockChild);

      try {
        for (const sig of FORWARDED_SIGNALS) {
          expect(process.listenerCount(sig)).toBe(
            (initialCounts.get(sig) ?? 0) + 1,
          );
        }

        Object.defineProperty(process, 'platform', {
          value: 'linux',
          configurable: true,
        });
        process.emit('SIGTERM', 'SIGTERM');
        expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
        process.emit('SIGINT', 'SIGINT');
        expect(mockChild.kill).toHaveBeenCalledWith('SIGINT');

        vi.mocked(mockChild.kill).mockClear();
        Object.defineProperty(process, 'platform', {
          value: 'win32',
          configurable: true,
        });
        process.emit('SIGINT', 'SIGINT');
        expect(mockChild.kill).not.toHaveBeenCalledWith('SIGINT');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
        removeForwarders();
      }

      for (const sig of FORWARDED_SIGNALS) {
        expect(process.listenerCount(sig)).toBe(initialCounts.get(sig));
      }
    });

    it('handleChildProcessClose resolves with exit code when no signal is present', () => {
      const removeForwarders = vi.fn();
      const resolve = vi.fn();
      const stdinResumeSpy = vi
        .spyOn(process.stdin, 'resume')
        .mockReturnValue(process.stdin);

      try {
        handleChildProcessClose(0, null, removeForwarders, resolve);
        expect(removeForwarders).toHaveBeenCalledTimes(1);
        expect(stdinResumeSpy).toHaveBeenCalledTimes(1);
        expect(resolve).toHaveBeenCalledWith(0);
      } finally {
        stdinResumeSpy.mockRestore();
      }
    });

    it('handleChildProcessClose re-raises signal on parent and resolves via fallback timer', () => {
      vi.useFakeTimers();
      const removeForwarders = vi.fn();
      const resolve = vi.fn();
      const stdinResumeSpy = vi
        .spyOn(process.stdin, 'resume')
        .mockReturnValue(process.stdin);
      const processKillSpy = vi
        .spyOn(process, 'kill')
        .mockImplementation(() => true);

      try {
        handleChildProcessClose(null, 'SIGTERM', removeForwarders, resolve);
        expect(removeForwarders).toHaveBeenCalledTimes(1);
        expect(stdinResumeSpy).toHaveBeenCalledTimes(1);
        expect(processKillSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');

        vi.runAllTimers();
        expect(resolve).toHaveBeenCalledWith(1);
      } finally {
        processKillSpy.mockRestore();
        stdinResumeSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });
});
