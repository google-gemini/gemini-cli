/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { SandboxedFileSystemService } from './sandboxedFileSystemService.js';
import type {
  SandboxManager,
  SandboxRequest,
  SandboxedCommand,
  GlobalSandboxOptions,
} from './sandboxManager.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import path from 'node:path';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

class MockSandboxManager implements SandboxManager {
  prepareCommand = vi.fn(
    async (req: SandboxRequest): Promise<SandboxedCommand> => ({
      program: 'sandbox.exe',
      args: ['0', req.cwd, req.command, ...req.args],
      env: req.env || {},
    }),
  );

  isKnownSafeCommand(): boolean {
    return false;
  }

  isDangerousCommand(): boolean {
    return false;
  }

  parseDenials(): undefined {
    return undefined;
  }

  getWorkspace(): string {
    return path.resolve('/workspace');
  }

  getOptions(): GlobalSandboxOptions | undefined {
    return {
      workspace: path.resolve('/workspace'),
      includeDirectories: [path.resolve('/test/cwd')],
    };
  }
}

describe('SandboxedFileSystemService', () => {
  let sandboxManager: MockSandboxManager;
  let service: SandboxedFileSystemService;
  const cwd = path.resolve('/test/cwd');

  beforeEach(() => {
    sandboxManager = new MockSandboxManager();
    service = new SandboxedFileSystemService(sandboxManager, cwd);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should read a file through the sandbox', async () => {
    const mockChild = new EventEmitter() as unknown as ChildProcess;
    Object.assign(mockChild, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });

    vi.mocked(spawn).mockReturnValue(mockChild);

    const testFile = path.resolve('/test/cwd/file.txt');
    const readPromise = service.readTextFile(testFile);

    // Use setImmediate to ensure events are emitted after the promise starts executing
    setImmediate(() => {
      mockChild.stdout!.emit('data', Buffer.from('file content'));
      mockChild.emit('close', 0);
    });

    const content = await readPromise;
    expect(content).toBe('file content');
    expect(vi.mocked(sandboxManager.prepareCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        command: '__read',
        args: [testFile],
        policy: {
          allowedPaths: [testFile],
        },
      }),
    );
    expect(spawn).toHaveBeenCalledWith(
      'sandbox.exe',
      ['0', cwd, '__read', testFile],
      expect.any(Object),
    );
  });

  it('should write a file through the sandbox', async () => {
    const mockChild = new EventEmitter() as unknown as ChildProcess;
    const mockStdin = new EventEmitter();
    Object.assign(mockStdin, {
      write: vi.fn(),
      end: vi.fn(),
    });
    Object.assign(mockChild, {
      stdin: mockStdin as unknown as Writable,
      stderr: new EventEmitter(),
    });

    vi.mocked(spawn).mockReturnValue(mockChild);

    const testFile = path.resolve('/test/cwd/file.txt');
    const writePromise = service.writeTextFile(testFile, 'new content');

    setImmediate(() => {
      mockChild.emit('close', 0);
    });

    await writePromise;
    expect(
      (mockStdin as unknown as { write: Mock }).write,
    ).toHaveBeenCalledWith('new content');
    expect((mockStdin as unknown as { end: Mock }).end).toHaveBeenCalled();
    expect(vi.mocked(sandboxManager.prepareCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        command: '__write',
        args: [testFile],
        policy: {
          allowedPaths: [testFile],
          additionalPermissions: {
            fileSystem: {
              write: [testFile],
            },
          },
        },
      }),
    );
    expect(spawn).toHaveBeenCalledWith(
      'sandbox.exe',
      ['0', cwd, '__write', testFile],
      expect.any(Object),
    );
  });

  it('should reject if sandbox command fails', async () => {
    const mockChild = new EventEmitter() as unknown as ChildProcess;
    Object.assign(mockChild, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });

    vi.mocked(spawn).mockReturnValue(mockChild);

    const testFile = path.resolve('/test/cwd/file.txt');
    const readPromise = service.readTextFile(testFile);

    setImmediate(() => {
      mockChild.stderr!.emit('data', Buffer.from('access denied'));
      mockChild.emit('close', 1);
    });

    await expect(readPromise).rejects.toThrow(
      `Sandbox Error: read_file failed for '${testFile}'. Exit code 1. Details: access denied`,
    );
  });

  it('should set ENOENT code when file does not exist', async () => {
    const mockChild = new EventEmitter() as unknown as ChildProcess;
    Object.assign(mockChild, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });

    vi.mocked(spawn).mockReturnValue(mockChild);

    const testFile = path.resolve('/test/cwd/missing.txt');
    const readPromise = service.readTextFile(testFile);

    setImmediate(() => {
      mockChild.stderr!.emit('data', Buffer.from('No such file or directory'));
      mockChild.emit('close', 1);
    });

    try {
      await readPromise;
      expect.fail('Should have rejected');
    } catch (err: unknown) {
      // @ts-expect-error - Checking message and code on unknown error
      expect(err.message).toContain('No such file or directory');
      // @ts-expect-error - Checking message and code on unknown error
      expect(err.code).toBe('ENOENT');
    }
  });

  it('should set ENOENT code when file does not exist on Windows', async () => {
    const mockChild = new EventEmitter() as unknown as ChildProcess;
    Object.assign(mockChild, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });

    vi.mocked(spawn).mockReturnValue(mockChild);

    const testFile = path.resolve('/test/cwd/missing.txt');
    const readPromise = service.readTextFile(testFile);

    setImmediate(() => {
      mockChild.stderr!.emit(
        'data',
        Buffer.from('Could not find a part of the path'),
      );
      mockChild.emit('close', 1);
    });

    try {
      await readPromise;
      expect.fail('Should have rejected');
    } catch (err: unknown) {
      const error = err as { message: string; code?: string };
      expect(error.message).toContain('Could not find a part of the path');
      expect(error.code).toBe('ENOENT');
    }
  });
});
