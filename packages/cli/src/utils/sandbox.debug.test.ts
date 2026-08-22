/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression tests for DEBUG environment variable handling in sandbox.ts.
 *
 * These tests verify that only the values 'true' and '1' enable debug
 * behaviour. Before this fix, sandbox.ts used JavaScript string truthiness
 * (!!process.env['DEBUG']) instead of strict comparison, so values like
 * 'false' and '0' incorrectly activated:
 *   - Docker/Podman debug-port publication (--publish 9229:9229)
 *   - macOS Seatbelt --inspect-brk injection
 *   - ConsolePatcher debug mode
 *   - Image-pull progress logging
 *
 * Call-chain covered by this test file:
 *   start_sandbox()
 *     → ConsolePatcher({ debugMode })            [line ~55]
 *     → (seatbelt path) nodeOptions --inspect-brk [line ~157]
 *     → (docker path)   --publish debugPort       [line ~516]
 *     → pullImage() → onStdoutData logging        [line ~1188]
 *
 * See: https://github.com/google-gemini/gemini-cli/issues/28885
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, exec, execFile, execSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import { start_sandbox } from './sandbox.js';
import type { SandboxConfig } from '@google/gemini-cli-core';
import { createMockSandboxConfig } from '@google/gemini-cli-test-utils';
import { EventEmitter } from 'node:events';

const { mockedGetContainerPath, mockedExecCommands } = vi.hoisted(() => ({
  mockedGetContainerPath: vi.fn().mockImplementation((p: string) => p),
  mockedExecCommands: [] as string[],
}));

vi.mock('./sandboxUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sandboxUtils.js')>();
  return {
    ...actual,
    getContainerPath: mockedGetContainerPath,
  };
});

vi.mock('node:child_process');
vi.mock('node:os');
vi.mock('node:fs');
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn().mockReturnValue(Buffer.from('a1b2c3d4e5f6', 'hex')),
}));
vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: (fn: (...args: unknown[]) => unknown) => {
      if (fn === exec) {
        return async (cmd: string) => {
          mockedExecCommands.push(cmd);
          if (cmd === 'id -u' || cmd === 'id -g') {
            return { stdout: '1000', stderr: '' };
          }
          if (cmd.includes('getconf DARWIN_USER_CACHE_DIR')) {
            return { stdout: '/tmp/cache', stderr: '' };
          }
          return { stdout: '', stderr: '' };
        };
      }
      if (fn === execFile) {
        return async () => ({ stdout: '', stderr: '' });
      }
      return actual.promisify(fn);
    },
  };
});

/**
 * Helper: create a mock spawn result that mimics the Docker image-check
 * process (spawn 'docker images ...') and the subsequent 'docker run' process.
 *
 * The returned `capturedRunArgs` array will be populated with the `args`
 * parameter of the 'docker run' spawn call, allowing assertions on the
 * presence or absence of --publish and debug-port arguments.
 */
function mockDockerSpawnSequence(): { capturedRunArgs: string[][] } {
  const capturedRunArgs: string[][] = [];

  interface MockProcessWithStdout extends EventEmitter {
    stdout: EventEmitter;
  }

  // First spawn: 'docker images ...' — return image found immediately.
  const mockImageCheckProcess = new EventEmitter() as MockProcessWithStdout;
  mockImageCheckProcess.stdout = new EventEmitter();
  vi.mocked(spawn).mockImplementationOnce((_cmd, args) => {
    if (args && args[0] === 'images') {
      setTimeout(() => {
        mockImageCheckProcess.stdout.emit('data', Buffer.from('image-id'));
        mockImageCheckProcess.emit('close', 0);
      }, 1);
      return mockImageCheckProcess as unknown as ReturnType<typeof spawn>;
    }
    return new EventEmitter() as unknown as ReturnType<typeof spawn>;
  });

  // Second spawn: 'docker run ...' — capture args and close cleanly.
  const mockRunProcess = new EventEmitter() as unknown as ReturnType<
    typeof spawn
  >;
  mockRunProcess.on = vi.fn().mockImplementation((event, cb) => {
    if (event === 'close') {
      setTimeout(() => cb(0), 10);
    }
    return mockRunProcess;
  });
  vi.mocked(spawn).mockImplementationOnce((_cmd, args) => {
    if (args) {
      capturedRunArgs.push(args as string[]);
    }
    return mockRunProcess;
  });

  return { capturedRunArgs };
}

/**
 * Helper: create a mock spawn result for the macOS seatbelt path
 * (spawn 'sandbox-exec ...').  The returned `capturedArgs` array will
 * be populated with the full `args` of the spawn call.
 */
function mockSeatbeltSpawnSequence(): { capturedArgs: string[][] } {
  const capturedArgs: string[][] = [];

  interface MockProcess extends EventEmitter {
    stdout: EventEmitter;
    stderr: EventEmitter;
  }
  const mockSpawnProcess = new EventEmitter() as MockProcess;
  mockSpawnProcess.stdout = new EventEmitter();
  mockSpawnProcess.stderr = new EventEmitter();
  vi.mocked(spawn).mockReturnValue(
    mockSpawnProcess as unknown as ReturnType<typeof spawn>,
  );

  // Capture args and schedule the close event.
  vi.mocked(spawn).mockImplementation((_cmd, args) => {
    if (args) {
      capturedArgs.push(args as string[]);
    }
    setTimeout(() => mockSpawnProcess.emit('close', 0), 10);
    return mockSpawnProcess as unknown as ReturnType<typeof spawn>;
  });

  return { capturedArgs };
}

describe('sandbox — DEBUG environment variable handling', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommands.length = 0;
    process.argv = [...originalArgv];
    vi.stubEnv('DEBUG', '');
    vi.stubEnv('DEBUG_PORT', '');
    Object.defineProperty(process, 'stdin', {
      value: { pause: vi.fn(), resume: vi.fn(), isTTY: true },
      writable: true,
    });
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
  });

  // -----------------------------------------------------------------------
  // Docker / Podman: --publish debug-port assertions
  // -----------------------------------------------------------------------
  describe('Docker debug-port publication', () => {
    const dockerConfig: SandboxConfig = createMockSandboxConfig({
      command: 'docker',
      image: 'gemini-cli-sandbox',
    });

    it.each(['false', '0'])(
      'should NOT publish the debug port when DEBUG=%s',
      async (debugValue) => {
        vi.stubEnv('DEBUG', debugValue);
        const { capturedRunArgs } = mockDockerSpawnSequence();

        await start_sandbox(dockerConfig, [], undefined, []);

        expect(capturedRunArgs.length).toBeGreaterThan(0);
        const runArgs = capturedRunArgs[0];
        expect(runArgs).not.toContain('--publish');
        expect(runArgs.join(' ')).not.toContain('9229');
      },
    );

    it('should NOT publish the debug port when DEBUG is unset', async () => {
      vi.stubEnv('DEBUG', '');
      const { capturedRunArgs } = mockDockerSpawnSequence();

      await start_sandbox(dockerConfig, [], undefined, []);

      expect(capturedRunArgs.length).toBeGreaterThan(0);
      const runArgs = capturedRunArgs[0];
      // The '--publish' token should only appear for user-specified SANDBOX_PORTS,
      // not for the debug port.
      const publishIndices = runArgs
        .map((arg, i) => (arg === '--publish' ? i : -1))
        .filter((i) => i >= 0);
      for (const idx of publishIndices) {
        expect(runArgs[idx + 1]).not.toContain('9229');
      }
    });

    it('should NOT publish the debug port when DEBUG is an empty string', async () => {
      vi.stubEnv('DEBUG', '');
      const { capturedRunArgs } = mockDockerSpawnSequence();

      await start_sandbox(dockerConfig, [], undefined, []);

      expect(capturedRunArgs.length).toBeGreaterThan(0);
      const runArgs = capturedRunArgs[0];
      expect(runArgs.join(' ')).not.toContain('9229');
    });

    it.each(['true', '1'])(
      'should publish the debug port when DEBUG=%s',
      async (debugValue) => {
        vi.stubEnv('DEBUG', debugValue);
        const { capturedRunArgs } = mockDockerSpawnSequence();

        await start_sandbox(dockerConfig, [], undefined, []);

        expect(capturedRunArgs.length).toBeGreaterThan(0);
        const runArgs = capturedRunArgs[0];
        expect(runArgs).toContain('--publish');
        expect(runArgs.join(' ')).toContain('9229:9229');
      },
    );

    it('should respect a custom DEBUG_PORT when DEBUG=true', async () => {
      vi.stubEnv('DEBUG', 'true');
      vi.stubEnv('DEBUG_PORT', '5858');
      const { capturedRunArgs } = mockDockerSpawnSequence();

      await start_sandbox(dockerConfig, [], undefined, []);

      expect(capturedRunArgs.length).toBeGreaterThan(0);
      const runArgs = capturedRunArgs[0];
      expect(runArgs.join(' ')).toContain('5858:5858');
      expect(runArgs.join(' ')).not.toContain('9229');
    });
  });

  // -----------------------------------------------------------------------
  // macOS Seatbelt: --inspect-brk injection
  // -----------------------------------------------------------------------
  describe('macOS Seatbelt --inspect-brk injection', () => {
    const seatbeltConfig: SandboxConfig = createMockSandboxConfig({
      command: 'sandbox-exec',
      image: 'some-image',
    });

    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('darwin');
    });

    it.each(['false', '0'])(
      'should NOT inject --inspect-brk into NODE_OPTIONS when DEBUG=%s',
      async (debugValue) => {
        vi.stubEnv('DEBUG', debugValue);
        const { capturedArgs } = mockSeatbeltSpawnSequence();

        await start_sandbox(seatbeltConfig, [], undefined, []);

        expect(capturedArgs.length).toBeGreaterThan(0);
        const allArgs = capturedArgs[0].join(' ');
        expect(allArgs).not.toContain('--inspect-brk');
      },
    );

    it('should NOT inject --inspect-brk when DEBUG is unset', async () => {
      vi.stubEnv('DEBUG', '');
      const { capturedArgs } = mockSeatbeltSpawnSequence();

      await start_sandbox(seatbeltConfig, [], undefined, []);

      expect(capturedArgs.length).toBeGreaterThan(0);
      const allArgs = capturedArgs[0].join(' ');
      expect(allArgs).not.toContain('--inspect-brk');
    });

    it.each(['true', '1'])(
      'should inject --inspect-brk into NODE_OPTIONS when DEBUG=%s',
      async (debugValue) => {
        vi.stubEnv('DEBUG', debugValue);
        const { capturedArgs } = mockSeatbeltSpawnSequence();

        await start_sandbox(seatbeltConfig, [], undefined, []);

        expect(capturedArgs.length).toBeGreaterThan(0);
        const allArgs = capturedArgs[0].join(' ');
        expect(allArgs).toContain('--inspect-brk');
      },
    );
  });

  // -----------------------------------------------------------------------
  // Edge cases: non-canonical truthy values that should NOT enable debug
  // -----------------------------------------------------------------------
  describe('non-canonical truthy values', () => {
    const dockerConfig: SandboxConfig = createMockSandboxConfig({
      command: 'docker',
      image: 'gemini-cli-sandbox',
    });

    it.each(['yes', 'on', 'TRUE', 'True', '2', 'enabled'])(
      'should NOT publish the debug port for non-canonical value DEBUG=%s',
      async (debugValue) => {
        vi.stubEnv('DEBUG', debugValue);
        const { capturedRunArgs } = mockDockerSpawnSequence();

        await start_sandbox(dockerConfig, [], undefined, []);

        expect(capturedRunArgs.length).toBeGreaterThan(0);
        const runArgs = capturedRunArgs[0];
        expect(runArgs.join(' ')).not.toContain('9229');
      },
    );
  });
});
