/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import { ShellExecutionService } from './shellExecutionService.js';
import type { SandboxManager } from './sandboxManager.js';
import * as cp from 'node:child_process';
import EventEmitter from 'node:events';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    spawn: vi.fn(),
  };
});

vi.mock('../utils/getPty.js', () => ({
  getPty: vi.fn(),
}));

vi.mock('../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/shell-utils.js')>();
  return {
    ...actual,
    resolveExecutable: vi.fn(),
  };
});

describe('ShellExecutionService Sandbox Wrapping', () => {
  const mockSandboxManager: SandboxManager = {
    prepareCommand: vi.fn(),
    prepareCommandSync: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ShellExecutionService.setSandboxManager(mockSandboxManager);
  });

  afterEach(() => {
    // @ts-expect-error accessing private
    ShellExecutionService.sandboxManager = undefined;
  });

  it('should wrap the command using sandboxManager and call cleanup', async () => {
    const mockCleanup = vi.fn();
    vi.mocked(mockSandboxManager.prepareCommand).mockResolvedValue({
      program: 'sandbox-exec',
      args: ['-f', 'profile.sb', '/bin/zsh', '-c', 'echo hi'],
      cleanup: mockCleanup,
    });

    const mockChildEmitter = new EventEmitter();
    // @ts-expect-error mock child
    const mockChild: cp.ChildProcess = Object.assign(mockChildEmitter, {
      pid: 123,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    vi.mocked(cp.spawn).mockReturnValue(mockChild);

    const abortController = new AbortController();
    const handle = await ShellExecutionService.execute(
      'echo hi',
      '/tmp',
      () => {},
      abortController.signal,
      false, // child_process
      {
        sanitizationConfig: {
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
          enableEnvironmentVariableRedaction: false,
        },
      },
    );

    // Verify prepareCommand was called
    expect(mockSandboxManager.prepareCommand).toHaveBeenCalled();

    // Verify spawn was called with wrapped arguments
    expect(cp.spawn).toHaveBeenCalledWith(
      'sandbox-exec',
      ['-f', 'profile.sb', '/bin/zsh', '-c', 'echo hi'],
      expect.any(Object),
    );

    // Simulate exit
    mockChild.emit('exit', 0, null);

    await handle.result;

    // Verify cleanup was called
    expect(mockCleanup).toHaveBeenCalled();
  });

  it('should wrap the command using sandboxManager for PTY', async () => {
    const mockPtyEmitter = new EventEmitter();
    // @ts-expect-error mock pty process
    const mockPtyProcess: import('@lydell/node-pty').IPty = Object.assign(
      mockPtyEmitter,
      {
        pid: 456,
        onData: vi.fn(),
        onExit: vi.fn(),
      },
    );

    const mockPtyModule = {
      spawn: vi.fn().mockReturnValue(mockPtyProcess),
    };

    const { getPty } = await import('../utils/getPty.js');
    vi.mocked(getPty).mockResolvedValue({
      name: 'node-pty',
      module: mockPtyModule,
    });

    const { resolveExecutable } = await import('../utils/shell-utils.js');
    vi.mocked(resolveExecutable).mockResolvedValue('/bin/zsh');

    const mockCleanup = vi.fn();
    vi.mocked(mockSandboxManager.prepareCommand).mockResolvedValue({
      program: 'sandbox-exec',
      args: ['-f', 'profile.sb', '/bin/zsh', '-c', 'echo pty'],
      cleanup: mockCleanup,
    });

    const abortController = new AbortController();
    const handle = await ShellExecutionService.execute(
      'echo pty',
      '/tmp',
      () => {},
      abortController.signal,
      true, // shouldUseNodePty
      {
        sanitizationConfig: {
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
          enableEnvironmentVariableRedaction: false,
        },
      },
    );

    expect(mockSandboxManager.prepareCommand).toHaveBeenCalled();
    expect(mockPtyModule.spawn).toHaveBeenCalledWith(
      'sandbox-exec',
      ['-f', 'profile.sb', '/bin/zsh', '-c', 'echo pty'],
      expect.any(Object),
    );

    // Simulate exit
    const exitCallback = (mockPtyProcess.onExit as any).mock.calls[0][0];
    exitCallback({ exitCode: 0 });

    await handle.result;

    expect(mockCleanup).toHaveBeenCalled();
  });
});
