/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import { start_sandbox } from './sandbox.js';
import {
  FatalSandboxError,
  type SandboxConfig,
  SandboxOrchestrator,
} from '@google/gemini-cli-core';
import { EventEmitter } from 'node:events';

const { mockedHomedir, mockedGetContainerPath, mockSpawnAsync } = vi.hoisted(
  () => ({
    mockedHomedir: vi.fn().mockReturnValue('/home/user'),
    mockedGetContainerPath: vi.fn().mockImplementation((p: string) => p),
    mockSpawnAsync: vi.fn().mockImplementation(async (cmd, args) => {
      if (cmd === 'id' && args?.[0] === '-u')
        return { stdout: '1000', stderr: '' };
      if (cmd === 'id' && args?.[0] === '-g')
        return { stdout: '1000', stderr: '' };
      if (cmd === 'getconf') return { stdout: '/tmp/cache', stderr: '' };
      if (cmd === 'docker' && args?.[0] === 'ps')
        return { stdout: 'existing-container', stderr: '' };
      if (cmd === 'docker' && args?.[0] === 'network')
        return { stdout: '', stderr: '' };
      if (cmd === 'curl') return { stdout: 'ok', stderr: '' };
      return { stdout: '', stderr: '' };
    }),
  }),
);

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

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    },
    coreEvents: {
      emitFeedback: vi.fn(),
    },
    SandboxOrchestrator: {
      ensureSandboxImageIsPresent: vi.fn().mockResolvedValue(true),
      getContainerRunArgs: vi
        .fn()
        .mockResolvedValue(['run', '-i', '--rm', '--init']),
      getSeatbeltArgs: vi.fn().mockReturnValue(['-D', 'TARGET_DIR=/tmp']),
    },
    spawnAsync: mockSpawnAsync,
    LOCAL_DEV_SANDBOX_IMAGE_NAME: 'gemini-cli-sandbox',
    SANDBOX_NETWORK_NAME: 'gemini-cli-sandbox',
    SANDBOX_PROXY_NAME: 'gemini-cli-sandbox-proxy',
    homedir: mockedHomedir,
  };
});

describe('sandbox', () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;
  let mockProcessIn: {
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    isTTY: boolean;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    mockProcessIn = {
      pause: vi.fn(),
      resume: vi.fn(),
      isTTY: true,
    };
    Object.defineProperty(process, 'stdin', {
      value: mockProcessIn,
      writable: true,
    });
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    // Default mockSpawnAsync implementation
    mockSpawnAsync.mockImplementation(async (cmd, args) => {
      if (cmd === 'id' && args?.[0] === '-u')
        return { stdout: '1000', stderr: '' };
      if (cmd === 'id' && args?.[0] === '-g')
        return { stdout: '1000', stderr: '' };
      if (cmd === 'getconf') return { stdout: '/tmp/cache', stderr: '' };
      if (cmd === 'docker' && args?.[0] === 'ps')
        return { stdout: 'existing-container', stderr: '' };
      if (cmd === 'docker' && args?.[0] === 'network')
        return { stdout: '', stderr: '' };
      if (cmd === 'curl') return { stdout: 'ok', stderr: '' };
      return { stdout: '', stderr: '' };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  describe('start_sandbox', () => {
    it('should handle macOS seatbelt (sandbox-exec)', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      const config: SandboxConfig = {
        command: 'sandbox-exec',
        image: 'some-image',
      };

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      // @ts-expect-error - mocking readonly property
      mockSpawnProcess.stdout = new EventEmitter();
      // @ts-expect-error - mocking readonly property
      mockSpawnProcess.stderr = new EventEmitter();
      // @ts-expect-error - mocking readonly property
      mockSpawnProcess.pid = 123;
      vi.mocked(spawn).mockReturnValue(
        mockSpawnProcess as unknown as ReturnType<typeof spawn>,
      );

      const promise = start_sandbox(config, [], undefined, ['arg1']);

      // Use setImmediate to ensure the promise has had a chance to register handlers
      await new Promise((resolve) => setImmediate(resolve));
      mockSpawnProcess.emit('close', 0);

      await expect(promise).resolves.toBe(0);
      expect(spawn).toHaveBeenCalledWith(
        'sandbox-exec',
        expect.arrayContaining(['-D', expect.stringContaining('TARGET_DIR=')]),
        expect.objectContaining({ stdio: 'inherit' }),
      );
    });

    it('should throw FatalSandboxError if seatbelt profile is missing', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const config: SandboxConfig = {
        command: 'sandbox-exec',
        image: 'some-image',
      };

      await expect(start_sandbox(config)).rejects.toThrow(FatalSandboxError);
    });

    it('should handle Docker execution', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
      };

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      // @ts-expect-error - mocking readonly property
      mockSpawnProcess.stdout = new EventEmitter();
      // @ts-expect-error - mocking readonly property
      mockSpawnProcess.stderr = new EventEmitter();
      // @ts-expect-error - mocking readonly property
      mockSpawnProcess.pid = 123;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      const promise = start_sandbox(config, [], undefined, ['arg1']);

      await expect(promise).resolves.toBe(0);
      expect(
        SandboxOrchestrator.ensureSandboxImageIsPresent,
      ).toHaveBeenCalled();
      expect(SandboxOrchestrator.getContainerRunArgs).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(
        'docker',
        expect.any(Array),
        expect.objectContaining({ stdio: 'inherit' }),
      );
    });

    it('should inject custom flags from SANDBOX_FLAGS env var', async () => {
      process.env['SANDBOX_FLAGS'] =
        '--security-opt label=disable --env FOO=bar';
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
      };

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      await start_sandbox(config);

      expect(SandboxOrchestrator.getContainerRunArgs).toHaveBeenCalledWith(
        config,
        expect.any(String),
        expect.any(String),
        '--security-opt label=disable --env FOO=bar',
        false,
      );
    });

    it('should inject custom flags from config (settings)', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
        flags: '--privileged',
      };

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      await start_sandbox(config);

      expect(SandboxOrchestrator.getContainerRunArgs).toHaveBeenCalledWith(
        config,
        expect.any(String),
        expect.any(String),
        undefined,
        false,
      );
    });

    it('should expand multiple environment variables in sandbox flags', async () => {
      process.env['VAR1'] = 'val1';
      process.env['VAR2'] = 'val2';
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
        flags: '--env V1=$VAR1 --env V2=${VAR2}',
      };

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      await start_sandbox(config);

      expect(SandboxOrchestrator.getContainerRunArgs).toHaveBeenCalledWith(
        config,
        expect.any(String),
        expect.any(String),
        undefined,
        false,
      );
    });

    it('should handle quoted strings in sandbox flags', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
        flags: '--label "description=multi word label" --env \'FOO=bar baz\'',
      };

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      await start_sandbox(config);

      expect(SandboxOrchestrator.getContainerRunArgs).toHaveBeenCalledWith(
        config,
        expect.any(String),
        expect.any(String),
        undefined,
        false,
      );
    });

    it('should throw if image is missing', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'missing-image',
      };

      vi.mocked(
        SandboxOrchestrator.ensureSandboxImageIsPresent,
      ).mockResolvedValueOnce(false);

      await expect(start_sandbox(config)).rejects.toThrow(FatalSandboxError);
    });

    it('should mount volumes correctly', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
      };
      process.env['SANDBOX_MOUNTS'] = '/host/path:/container/path:ro';
      vi.mocked(fs.existsSync).mockReturnValue(true); // For mount path check

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      await start_sandbox(config);

      expect(spawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['--volume', '/host/path:/container/path:ro']),
        expect.any(Object),
      );
    });

    it('should pass through GOOGLE_GEMINI_BASE_URL and GOOGLE_VERTEX_BASE_URL', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
      };
      process.env['GOOGLE_GEMINI_BASE_URL'] = 'http://gemini.proxy';
      process.env['GOOGLE_VERTEX_BASE_URL'] = 'http://vertex.proxy';

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      await start_sandbox(config);

      expect(spawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining([
          '--env',
          'GOOGLE_GEMINI_BASE_URL=http://gemini.proxy',
          '--env',
          'GOOGLE_VERTEX_BASE_URL=http://vertex.proxy',
        ]),
        expect.any(Object),
      );
    });

    it('should handle user creation on Linux if needed', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
      };
      process.env['SANDBOX_SET_UID_GID'] = 'true';
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'id -u') return Buffer.from('1000');
        if (cmd === 'id -g') return Buffer.from('1000');
        return Buffer.from('');
      });

      const mockSpawnProcess = new EventEmitter() as unknown as ChildProcess;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setImmediate(() => cb(0));
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockReturnValue(mockSpawnProcess);

      await start_sandbox(config);

      expect(spawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['--user', 'root', '--env', 'HOME=/home/user']),
        expect.any(Object),
      );
      // Check that the entrypoint command includes useradd/groupadd
      const args = vi.mocked(spawn).mock.calls[0][1] as string[];
      const entrypointCmd = args[args.length - 1];
      expect(entrypointCmd).toContain('groupadd');
      expect(entrypointCmd).toContain('useradd');
      expect(entrypointCmd).toContain('su -p gemini');
    });

    describe('waitForProxy timeout', () => {
      it('should time out waiting for proxy', async () => {
        const config: SandboxConfig = {
          command: 'docker',
          image: 'gemini-cli-sandbox',
        };
        process.env['GEMINI_SANDBOX_PROXY_COMMAND'] = 'my-proxy';

        // Mock spawn to return processes that stay open
        vi.mocked(spawn).mockImplementation(() => {
          const p = new EventEmitter() as unknown as ChildProcess;
          // @ts-expect-error - mocking readonly property
          p.pid = 123;
          p.kill = vi.fn();
          // @ts-expect-error - mocking readonly property
          p.stderr = new EventEmitter();
          // @ts-expect-error - mocking readonly property
          p.stdout = new EventEmitter();
          return p;
        });

        // Mock spawnAsync to fail for curl (simulating proxy not started)
        mockSpawnAsync.mockImplementation(async (cmd) => {
          if (cmd === 'curl') {
            throw new Error('Connection refused');
          }
          return { stdout: '', stderr: '' };
        });

        // Mock Date.now to control time
        let currentTime = 1000000;
        const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
          currentTime += 10000; // Increment time by 10s on each call to hit timeout fast
          return currentTime;
        });

        // We also need to mock setTimeout to resolve immediately,
        // otherwise the loop will still take real time.
        const originalSetTimeout = global.setTimeout;
        // @ts-expect-error - mocking global setTimeout
        global.setTimeout = vi.fn().mockImplementation((cb) => cb());

        try {
          const promise = start_sandbox(config);
          await expect(promise).rejects.toThrow(/Timed out waiting for proxy/);
        } finally {
          dateSpy.mockRestore();
          global.setTimeout = originalSetTimeout;
        }
      });
    });
  });
});
