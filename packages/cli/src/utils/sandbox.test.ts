/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, exec, execSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import { start_sandbox } from './sandbox.js';
import { FatalSandboxError, type SandboxConfig } from '@google/gemini-cli-core';
import { EventEmitter } from 'node:events';

const { mockedHomedir, mockedGetContainerPath } = vi.hoisted(() => ({
  mockedHomedir: vi.fn().mockReturnValue('/home/user'),
  mockedGetContainerPath: vi.fn().mockImplementation((p: string) => p),
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
vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: (fn: (...args: unknown[]) => unknown) => {
      if (fn === exec) {
        return async (cmd: string) => {
          if (cmd === 'id -u' || cmd === 'id -g') {
            return { stdout: '1000', stderr: '' };
          }
          if (cmd.includes('curl')) {
            return { stdout: '', stderr: '' };
          }
          if (cmd.includes('getconf DARWIN_USER_CACHE_DIR')) {
            return { stdout: '/tmp/cache', stderr: '' };
          }
          if (cmd.includes('ps -a --format')) {
            return { stdout: 'existing-container', stderr: '' };
          }
          return { stdout: '', stderr: '' };
        };
      }
      return actual.promisify(fn);
    },
  };
});

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
    FatalSandboxError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'FatalSandboxError';
      }
    },
    GEMINI_DIR: '.gemini',
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

      const promise = start_sandbox(config, [], undefined, ['arg1']);

      setTimeout(() => {
        mockSpawnProcess.emit('close', 0);
      }, 10);

      await expect(promise).resolves.toBe(0);
      expect(spawn).toHaveBeenCalledWith(
        'sandbox-exec',
        expect.arrayContaining([
          '-f',
          expect.stringContaining('sandbox-macos-permissive-open.sb'),
        ]),
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

      // Mock image check to return true (image exists)
      interface MockProcessWithStdout extends EventEmitter {
        stdout: EventEmitter;
      }
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
        return new EventEmitter() as unknown as ReturnType<typeof spawn>; // fallback
      });

      const mockSpawnProcess = new EventEmitter() as unknown as ReturnType<
        typeof spawn
      >;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 10);
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockImplementationOnce((cmd, args) => {
        if (cmd === 'docker' && args && args[0] === 'run') {
          return mockSpawnProcess;
        }
        return new EventEmitter() as unknown as ReturnType<typeof spawn>;
      });

      const promise = start_sandbox(config, [], undefined, ['arg1']);

      await expect(promise).resolves.toBe(0);
      expect(spawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['run', '-i', '--rm', '--init']),
        expect.objectContaining({ stdio: 'inherit' }),
      );
    });

    it('should pull image if missing', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'missing-image',
      };

      // 1. Image check fails
      interface MockProcessWithStdout extends EventEmitter {
        stdout: EventEmitter;
      }
      const mockImageCheckProcess1 =
        new EventEmitter() as MockProcessWithStdout;
      mockImageCheckProcess1.stdout = new EventEmitter();
      vi.mocked(spawn).mockImplementationOnce(() => {
        setTimeout(() => {
          mockImageCheckProcess1.emit('close', 0);
        }, 1);
        return mockImageCheckProcess1 as unknown as ReturnType<typeof spawn>;
      });

      // 2. Pull image succeeds
      interface MockProcessWithStdoutStderr extends EventEmitter {
        stdout: EventEmitter;
        stderr: EventEmitter;
      }
      const mockPullProcess = new EventEmitter() as MockProcessWithStdoutStderr;
      mockPullProcess.stdout = new EventEmitter();
      mockPullProcess.stderr = new EventEmitter();
      vi.mocked(spawn).mockImplementationOnce(() => {
        setTimeout(() => {
          mockPullProcess.emit('close', 0);
        }, 1);
        return mockPullProcess as unknown as ReturnType<typeof spawn>;
      });

      // 3. Image check succeeds
      const mockImageCheckProcess2 =
        new EventEmitter() as MockProcessWithStdout;
      mockImageCheckProcess2.stdout = new EventEmitter();
      vi.mocked(spawn).mockImplementationOnce(() => {
        setTimeout(() => {
          mockImageCheckProcess2.stdout.emit('data', Buffer.from('image-id'));
          mockImageCheckProcess2.emit('close', 0);
        }, 1);
        return mockImageCheckProcess2 as unknown as ReturnType<typeof spawn>;
      });

      // 4. Docker run
      const mockSpawnProcess = new EventEmitter() as unknown as ReturnType<
        typeof spawn
      >;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 10);
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockImplementationOnce(() => mockSpawnProcess);

      const promise = start_sandbox(config, [], undefined, ['arg1']);

      await expect(promise).resolves.toBe(0);
      expect(spawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['pull', 'missing-image']),
        expect.any(Object),
      );
    });

    it('should throw if image pull fails', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'missing-image',
      };

      // 1. Image check fails
      interface MockProcessWithStdout extends EventEmitter {
        stdout: EventEmitter;
      }
      const mockImageCheckProcess1 =
        new EventEmitter() as MockProcessWithStdout;
      mockImageCheckProcess1.stdout = new EventEmitter();
      vi.mocked(spawn).mockImplementationOnce(() => {
        setTimeout(() => {
          mockImageCheckProcess1.emit('close', 0);
        }, 1);
        return mockImageCheckProcess1 as unknown as ReturnType<typeof spawn>;
      });

      // 2. Pull image fails
      interface MockProcessWithStdoutStderr extends EventEmitter {
        stdout: EventEmitter;
        stderr: EventEmitter;
      }
      const mockPullProcess = new EventEmitter() as MockProcessWithStdoutStderr;
      mockPullProcess.stdout = new EventEmitter();
      mockPullProcess.stderr = new EventEmitter();
      vi.mocked(spawn).mockImplementationOnce(() => {
        setTimeout(() => {
          mockPullProcess.emit('close', 1);
        }, 1);
        return mockPullProcess as unknown as ReturnType<typeof spawn>;
      });

      await expect(start_sandbox(config)).rejects.toThrow(FatalSandboxError);
    });

    it('should mount volumes correctly', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'gemini-cli-sandbox',
      };
      process.env['SANDBOX_MOUNTS'] = '/host/path:/container/path:ro';
      vi.mocked(fs.existsSync).mockReturnValue(true); // For mount path check

      // Mock image check to return true
      interface MockProcessWithStdout extends EventEmitter {
        stdout: EventEmitter;
      }
      const mockImageCheckProcess = new EventEmitter() as MockProcessWithStdout;
      mockImageCheckProcess.stdout = new EventEmitter();
      vi.mocked(spawn).mockImplementationOnce(() => {
        setTimeout(() => {
          mockImageCheckProcess.stdout.emit('data', Buffer.from('image-id'));
          mockImageCheckProcess.emit('close', 0);
        }, 1);
        return mockImageCheckProcess as unknown as ReturnType<typeof spawn>;
      });

      const mockSpawnProcess = new EventEmitter() as unknown as ReturnType<
        typeof spawn
      >;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 10);
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockImplementationOnce(() => mockSpawnProcess);

      await start_sandbox(config);

      // The first call is 'docker images -q ...'
      expect(spawn).toHaveBeenNthCalledWith(
        1,
        'docker',
        expect.arrayContaining(['images', '-q']),
      );

      // The second call is 'docker run ...'
      expect(spawn).toHaveBeenNthCalledWith(
        2,
        'docker',
        expect.arrayContaining([
          'run',
          '--volume',
          '/host/path:/container/path:ro',
          '--volume',
          expect.stringMatching(/[\\/]home[\\/]user[\\/]\.gemini/),
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

      // Mock image check to return true
      interface MockProcessWithStdout extends EventEmitter {
        stdout: EventEmitter;
      }
      const mockImageCheckProcess = new EventEmitter() as MockProcessWithStdout;
      mockImageCheckProcess.stdout = new EventEmitter();
      vi.mocked(spawn).mockImplementationOnce(() => {
        setTimeout(() => {
          mockImageCheckProcess.stdout.emit('data', Buffer.from('image-id'));
          mockImageCheckProcess.emit('close', 0);
        }, 1);
        return mockImageCheckProcess as unknown as ReturnType<typeof spawn>;
      });

      const mockSpawnProcess = new EventEmitter() as unknown as ReturnType<
        typeof spawn
      >;
      mockSpawnProcess.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 10);
        }
        return mockSpawnProcess;
      });
      vi.mocked(spawn).mockImplementationOnce(() => mockSpawnProcess);

      await start_sandbox(config);

      expect(spawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['--user', 'root', '--env', 'HOME=/home/user']),
        expect.any(Object),
      );
      // Check that the entrypoint command includes useradd/groupadd
      const args = vi.mocked(spawn).mock.calls[1][1] as string[];
      const entrypointCmd = args[args.length - 1];
      expect(entrypointCmd).toContain('groupadd');
      expect(entrypointCmd).toContain('useradd');
      expect(entrypointCmd).toContain('su -p gemini');
    });
  });
});
