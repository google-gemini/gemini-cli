/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SandboxedFileSystemService } from './sandboxedFileSystemService.js';
import type {
  SandboxManager,
  SandboxRequest,
  SandboxedCommand,
} from './sandboxManager.js';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

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

  it('should read a file through the sandbox', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockChild = new EventEmitter() as any;
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();

    vi.mocked(spawn).mockReturnValue(mockChild);

    const readPromise = service.readTextFile('/test/file.txt');

    // Use setImmediate to ensure events are emitted after the promise starts executing
    setImmediate(() => {
      mockChild.stdout.emit('data', Buffer.from('file content'));
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockChild = new EventEmitter() as any;
    mockChild.stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    mockChild.stderr = new EventEmitter();

    vi.mocked(spawn).mockReturnValue(mockChild);

    const writePromise = service.writeTextFile('/test/file.txt', 'new content');

    setImmediate(() => {
      mockChild.emit('close', 0);
    });

    await writePromise;
    expect(mockChild.stdin.write).toHaveBeenCalledWith('new content');
    expect(mockChild.stdin.end).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      'sandbox.exe',
      ['0', cwd, '__write', '/test/file.txt'],
      expect.any(Object),
    );
  });

  it('should reject if sandbox command fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockChild = new EventEmitter() as any;
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();

    vi.mocked(spawn).mockReturnValue(mockChild);

    const readPromise = service.readTextFile('/test/file.txt');

    setImmediate(() => {
      mockChild.stderr.emit('data', Buffer.from('access denied'));
      mockChild.emit('close', 1);
    });

    await expect(readPromise).rejects.toThrow(
      'Sandbox Error: Command failed with exit code 1. Details: access denied',
    );
  });
});
