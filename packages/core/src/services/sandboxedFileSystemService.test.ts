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
} from './sandboxManager.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

class MockSandboxManager implements SandboxManager {
  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    return {
      program: 'sandbox.exe',
      args: ['0', req.cwd, req.command, ...req.args],
      env: req.env || {},
    };
  }

  isKnownSafeCommand(): boolean {
    return false;
  }

  isDangerousCommand(): boolean {
    return false;
  }

  parseDenials(): undefined {
    return undefined;
  }
}

describe('SandboxedFileSystemService', () => {
  let sandboxManager: MockSandboxManager;
  let service: SandboxedFileSystemService;
  const cwd = '/test/cwd';

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

    const readPromise = service.readTextFile('/test/file.txt');

    // Use setImmediate to ensure events are emitted after the promise starts executing
    setImmediate(() => {
      mockChild.stdout!.emit('data', Buffer.from('file content'));
      mockChild.emit('close', 0);
    });

    const content = await readPromise;
    expect(content).toBe('file content');
    expect(spawn).toHaveBeenCalledWith(
      'sandbox.exe',
      ['0', cwd, '__read', '/test/file.txt'],
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

    const writePromise = service.writeTextFile('/test/file.txt', 'new content');

    setImmediate(() => {
      mockChild.emit('close', 0);
    });

    await writePromise;
    expect(
      (mockStdin as unknown as { write: Mock }).write,
    ).toHaveBeenCalledWith('new content');
    expect((mockStdin as unknown as { end: Mock }).end).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      'sandbox.exe',
      ['0', cwd, '__write', '/test/file.txt'],
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

    const readPromise = service.readTextFile('/test/file.txt');

    setImmediate(() => {
      mockChild.stderr!.emit('data', Buffer.from('access denied'));
      mockChild.emit('close', 1);
    });

    await expect(readPromise).rejects.toThrow(
      "Sandbox Error: read_file failed for '/test/file.txt'. Exit code 1. Details: access denied",
    );
  });
});
