/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { EventEmitter } from 'node:events';
import { RELAUNCH_EXIT_CODE } from './processUtils.js';
import { spawn, type ChildProcess } from 'node:child_process';

const mocks = vi.hoisted(() => ({
  writeToStderr: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    writeToStderr: mocks.writeToStderr,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

const mockedSpawn = vi.mocked(spawn);

// Import the functions initially
import { relaunchAppInChildProcess, relaunchOnExitCode } from './relaunch.js';

describe('relaunchOnExitCode', () => {
  let processExitSpy: MockInstance;
  let stdinResumeSpy: MockInstance;
  const originalPlatform = process.platform;

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true,
    });
  };

  beforeEach(() => {
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('PROCESS_EXIT_CALLED');
    });
    stdinResumeSpy = vi
      .spyOn(process.stdin, 'resume')
      .mockImplementation(() => process.stdin);
    vi.clearAllMocks();
    mocks.writeToStderr.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setPlatform(originalPlatform);
    processExitSpy.mockRestore();
    stdinResumeSpy.mockRestore();
  });

  it('should exit with non-RELAUNCH_EXIT_CODE', async () => {
    const runner = vi.fn().mockResolvedValue(0);

    await expect(relaunchOnExitCode(runner)).rejects.toThrow(
      'PROCESS_EXIT_CALLED',
    );

    expect(runner).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('should continue running when RELAUNCH_EXIT_CODE is returned', async () => {
    let callCount = 0;
    const runner = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return RELAUNCH_EXIT_CODE;
      if (callCount === 2) return RELAUNCH_EXIT_CODE;
      return 0; // Exit on third call
    });

    await expect(relaunchOnExitCode(runner)).rejects.toThrow(
      'PROCESS_EXIT_CALLED',
    );

    expect(runner).toHaveBeenCalledTimes(3);
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('should not relaunch on Android when RELAUNCH_EXIT_CODE is returned', async () => {
    setPlatform('android');
    const runner = vi.fn().mockResolvedValue(RELAUNCH_EXIT_CODE);

    await expect(relaunchOnExitCode(runner)).rejects.toThrow(
      'PROCESS_EXIT_CALLED',
    );

    expect(runner).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });

  it('should handle runner errors', async () => {
    const error = new Error('Runner failed');
    const runner = vi.fn().mockRejectedValue(error);

    await expect(relaunchOnExitCode(runner)).rejects.toThrow(
      'PROCESS_EXIT_CALLED',
    );

    expect(runner).toHaveBeenCalledTimes(1);
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      expect.stringContaining(
        'Fatal error: Failed to relaunch the CLI process.',
      ),
    );
    expect(stdinResumeSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

describe('relaunchAppInChildProcess', () => {
  let processExitSpy: MockInstance;
  let stdinPauseSpy: MockInstance;
  let stdinResumeSpy: MockInstance;

  // Store original values to restore later
  const originalExecArgv = [...process.execArgv];
  const originalArgv = [...process.argv];
  const originalExecPath = process.execPath;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeToStderr.mockClear();

    vi.stubEnv('GEMINI_CLI_NO_RELAUNCH', '');
    vi.stubEnv('IS_BINARY', '');
    vi.stubEnv('NODE_OPTIONS', '');

    process.execArgv = [...originalExecArgv];
    process.argv = [...originalArgv];
    process.execPath = '/usr/bin/node';

    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('PROCESS_EXIT_CALLED');
    });
    stdinPauseSpy = vi
      .spyOn(process.stdin, 'pause')
      .mockImplementation(() => process.stdin);
    stdinResumeSpy = vi
      .spyOn(process.stdin, 'resume')
      .mockImplementation(() => process.stdin);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.execArgv = [...originalExecArgv];
    process.argv = [...originalArgv];
    process.execPath = originalExecPath;

    processExitSpy.mockRestore();
    stdinPauseSpy.mockRestore();
    stdinResumeSpy.mockRestore();
  });

  describe('when GEMINI_CLI_NO_RELAUNCH is set', () => {
    it('should return early without spawning a child process', async () => {
      vi.stubEnv('GEMINI_CLI_NO_RELAUNCH', 'true');

      await relaunchAppInChildProcess(['--test'], ['--verbose']);

      expect(mockedSpawn).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('when GEMINI_CLI_NO_RELAUNCH is not set', () => {
    beforeEach(() => {
      vi.stubEnv('GEMINI_CLI_NO_RELAUNCH', '');
    });

    it('should construct correct spawn arguments and use command line for node arguments in standard Node mode', async () => {
      process.execArgv = ['--inspect=9229', '--trace-warnings'];
      process.argv = [
        '/usr/bin/node',
        '/path/to/cli.js',
        'command',
        '--flag=value',
        '--verbose',
      ];

      const additionalNodeArgs = [
        '--max-old-space-size=4096',
        '--experimental-modules',
      ];
      const additionalScriptArgs = ['--model', 'gemini-1.5-pro', '--debug'];

      const mockChild = createMockChildProcess(0, true);
      mockedSpawn.mockReturnValue(mockChild);

      await expect(
        relaunchAppInChildProcess(additionalNodeArgs, additionalScriptArgs),
      ).rejects.toThrow('PROCESS_EXIT_CALLED');

      expect(mockedSpawn).toHaveBeenCalledWith(
        process.execPath,
        [
          '--inspect=9229',
          '--trace-warnings',
          '--max-old-space-size=4096',
          '--experimental-modules',
          '/path/to/cli.js',
          '--model',
          'gemini-1.5-pro',
          '--debug',
          'command',
          '--flag=value',
          '--verbose',
        ],
        expect.objectContaining({
          env: expect.objectContaining({
            GEMINI_CLI_NO_RELAUNCH: 'true',
          }),
        }),
      );

      const lastCall = mockedSpawn.mock.calls[0] as unknown as [
        string,
        string[],
        { env: NodeJS.ProcessEnv },
      ];
      const env = lastCall[2].env;
      expect(env['NODE_OPTIONS']).toBeFalsy();
    });

    it('should handle SEA binary mode (IS_BINARY=true) correctly using NODE_OPTIONS', async () => {
      vi.stubEnv('IS_BINARY', 'true');
      // execArgv should be inherited, not duplicated in NODE_OPTIONS
      process.execArgv = ['--inspect=9229'];
      process.argv = [
        '/usr/bin/gemini',
        '/usr/bin/gemini',
        'command',
        '--verbose',
      ];

      const additionalNodeArgs = ['--max-old-space-size=8192'];
      const additionalScriptArgs: string[] = [];

      const mockChild = createMockChildProcess(0, true);
      mockedSpawn.mockReturnValue(mockChild);

      await expect(
        relaunchAppInChildProcess(additionalNodeArgs, additionalScriptArgs),
      ).rejects.toThrow('PROCESS_EXIT_CALLED');

      expect(mockedSpawn).toHaveBeenCalledWith(
        process.execPath,
        ['/usr/bin/node', 'command', '--verbose'],
        expect.objectContaining({
          env: expect.objectContaining({
            GEMINI_CLI_NO_RELAUNCH: 'true',
            NODE_OPTIONS: '--max-old-space-size=8192',
          }),
        }),
      );
    });

    it('should append new nodeArgs to NODE_OPTIONS in SEA mode without escaping', async () => {
      vi.stubEnv('IS_BINARY', 'true');
      vi.stubEnv('NODE_OPTIONS', '--existing-flag');
      process.execArgv = ['--inspect']; // inherited from env/binary, should not be duplicated
      process.argv = ['/usr/bin/gemini', '/usr/bin/gemini', 'command'];

      // In our use case, these are simple flags like --max-old-space-size=X
      const additionalNodeArgs = ['--max-old-space-size=8192'];
      const additionalScriptArgs: string[] = [];

      const mockChild = createMockChildProcess(0, true);
      mockedSpawn.mockReturnValue(mockChild);

      await expect(
        relaunchAppInChildProcess(additionalNodeArgs, additionalScriptArgs),
      ).rejects.toThrow('PROCESS_EXIT_CALLED');

      expect(mockedSpawn).toHaveBeenCalledWith(
        process.execPath,
        ['/usr/bin/node', 'command'],
        expect.objectContaining({
          env: expect.objectContaining({
            NODE_OPTIONS: '--existing-flag --max-old-space-size=8192',
          }),
        }),
      );
    });

    it('should handle empty additional arguments correctly in Node mode', async () => {
      process.execArgv = ['--trace-warnings'];
      process.argv = ['/usr/bin/node', '/app/cli.js', 'start'];

      const mockChild = createMockChildProcess(0, true);
      mockedSpawn.mockReturnValue(mockChild);

      await expect(relaunchAppInChildProcess([], [])).rejects.toThrow(
        'PROCESS_EXIT_CALLED',
      );

      expect(mockedSpawn).toHaveBeenCalledWith(
        process.execPath,
        ['--trace-warnings', '/app/cli.js', 'start'],
        expect.anything(),
      );
    });

    it('should handle null exit code from child process', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      const mockChild = createMockChildProcess(0, false); // Don't auto-close
      mockedSpawn.mockImplementation(() => {
        // Emit close with null code immediately
        setImmediate(() => {
          mockChild.emit('close', null);
        });
        return mockChild;
      });

      // Start the relaunch process
      const promise = relaunchAppInChildProcess([], []);

      await expect(promise).rejects.toThrow('PROCESS_EXIT_CALLED');

      // Should default to exit code 1
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('signal forwarding (issue #25590)', () => {
    let originalSIGTERMListeners: ((...args: unknown[]) => void)[];
    let originalSIGHUPListeners: ((...args: unknown[]) => void)[];
    let originalSIGINTListeners: ((...args: unknown[]) => void)[];
    let originalSIGQUITListeners: ((...args: unknown[]) => void)[];
    let originalSIGUSR1Listeners: ((...args: unknown[]) => void)[];
    let originalSIGUSR2Listeners: ((...args: unknown[]) => void)[];

    beforeEach(() => {
      vi.stubEnv('GEMINI_CLI_NO_RELAUNCH', '');
      // Snapshot process signal listeners to restore after each test
      originalSIGTERMListeners = [...process.listeners('SIGTERM')];
      originalSIGHUPListeners = [...process.listeners('SIGHUP')];
      originalSIGINTListeners = [...process.listeners('SIGINT')];
      originalSIGQUITListeners = [...process.listeners('SIGQUIT')];
      originalSIGUSR1Listeners = [...process.listeners('SIGUSR1')];
      originalSIGUSR2Listeners = [...process.listeners('SIGUSR2')];
    });

    afterEach(() => {
      // Restore original signal listeners
      const signals = [
        'SIGTERM', 'SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2',
      ] as const;
      const originals = [
        originalSIGTERMListeners, originalSIGHUPListeners,
        originalSIGINTListeners, originalSIGQUITListeners,
        originalSIGUSR1Listeners, originalSIGUSR2Listeners,
      ];
      for (let i = 0; i < signals.length; i++) {
        process.removeAllListeners(signals[i]);
        for (const fn of originals[i]) {
          process.on(signals[i], fn as (...args: unknown[]) => void);
        }
      }
    });

    it('should forward SIGTERM to the child process', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      const mockChild = createMockChildProcess(0, false);
      mockedSpawn.mockReturnValue(mockChild);

      const promise = relaunchAppInChildProcess([], []);

      // Wait for the child to be spawned
      await new Promise((r) => setImmediate(r));

      // Emit SIGTERM on the parent process
      process.emit('SIGTERM');

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      // Close the child to let the test finish
      mockChild.emit('close', 0);
      await expect(promise).rejects.toThrow('PROCESS_EXIT_CALLED');
    });

    it('should forward SIGHUP to the child process', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      const mockChild = createMockChildProcess(0, false);
      mockedSpawn.mockReturnValue(mockChild);

      const promise = relaunchAppInChildProcess([], []);
      await new Promise((r) => setImmediate(r));

      process.emit('SIGHUP');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGHUP');

      mockChild.emit('close', 0);
      await expect(promise).rejects.toThrow('PROCESS_EXIT_CALLED');
    });

    it('should forward SIGUSR1 and SIGUSR2 to the child process', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      const mockChild = createMockChildProcess(0, false);
      mockedSpawn.mockReturnValue(mockChild);

      const promise = relaunchAppInChildProcess([], []);
      await new Promise((r) => setImmediate(r));

      process.emit('SIGUSR1');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGUSR1');

      process.emit('SIGUSR2');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGUSR2');

      mockChild.emit('close', 0);
      await expect(promise).rejects.toThrow('PROCESS_EXIT_CALLED');
    });

    it('should remove signal forwarders when child exits normally', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      const mockChild = createMockChildProcess(0, false);
      mockedSpawn.mockReturnValue(mockChild);

      const promise = relaunchAppInChildProcess([], []);
      await new Promise((r) => setImmediate(r));

      const listenerCountBefore = process.listenerCount('SIGUSR2');
      expect(listenerCountBefore).toBeGreaterThan(0);

      // Simulate child exiting
      mockChild.emit('close', 0);
      await expect(promise).rejects.toThrow('PROCESS_EXIT_CALLED');

      // The forwarder for SIGUSR2 should have been removed
      // (listener count back to original or zero)
    });

    it('should remove signal forwarders when child emits error', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      const mockChild = createMockChildProcess(0, false);
      mockedSpawn.mockReturnValue(mockChild);

      const promise = relaunchAppInChildProcess([], []);
      await new Promise((r) => setImmediate(r));

      // Simulate child erroring
      mockChild.emit('error', new Error('spawn failed'));
      await expect(promise).rejects.toThrow('PROCESS_EXIT_CALLED');
    });

    it('should not throw when child.kill fails (child already exited)', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      const mockChild = createMockChildProcess(0, false);
      vi.mocked(mockChild.kill).mockImplementation(() => {
        throw new Error('kill ESRCH');
      });
      mockedSpawn.mockReturnValue(mockChild);

      const promise = relaunchAppInChildProcess([], []);
      await new Promise((r) => setImmediate(r));

      // Should not throw even though child.kill throws
      expect(() => process.emit('SIGUSR2')).not.toThrow();

      mockChild.emit('close', 0);
      await expect(promise).rejects.toThrow('PROCESS_EXIT_CALLED');
    });

    it('should not leak listeners across relaunch iterations', async () => {
      process.argv = ['/usr/bin/node', '/app/cli.js'];

      let iteration = 0;
      mockedSpawn.mockImplementation(() => {
        iteration++;
        const child = createMockChildProcess(0, false);
        // First iteration: relaunch; second: exit normally
        setImmediate(() => {
          child.emit('close', iteration === 1 ? RELAUNCH_EXIT_CODE : 0);
        });
        return child;
      });

      const listenersBefore = process.listenerCount('SIGTERM');

      await expect(relaunchAppInChildProcess([], [])).rejects.toThrow(
        'PROCESS_EXIT_CALLED',
      );

      expect(iteration).toBe(2);
      // After both iterations complete, listeners should be cleaned up
      // (no net growth relative to before)
      expect(process.listenerCount('SIGTERM')).toBeLessThanOrEqual(
        listenersBefore + 1, // at most 1 from the exit handler chain
      );
    });
  });
});

/**
 * Creates a mock child process that emits events asynchronously
 */
function createMockChildProcess(
  exitCode: number = 0,
  autoClose: boolean = false,
): ChildProcess {
  const mockChild = new EventEmitter() as ChildProcess;

  Object.assign(mockChild, {
    stdin: null,
    stdout: null,
    stderr: null,
    stdio: [null, null, null],
    pid: 12345,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: '',
    kill: vi.fn(),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    on: mockChild.on.bind(mockChild),
    emit: mockChild.emit.bind(mockChild),
  });

  if (autoClose) {
    setImmediate(() => {
      mockChild.emit('close', exitCode);
    });
  }

  return mockChild;
}
