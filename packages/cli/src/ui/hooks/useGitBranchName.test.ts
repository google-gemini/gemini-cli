/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockedFunction } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useGitBranchName } from './useGitBranchName.js';
import { fs, vol } from 'memfs'; // For mocking fs
import { EventEmitter } from 'node:events';
import { exec as mockExec, type ChildProcess } from 'node:child_process';
import type { FSWatcher } from 'memfs/lib/volume.js';

// Mock child_process
vi.mock('child_process');

// Mock fs and fs/promises
vi.mock('node:fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs;
});

vi.mock('node:fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs.promises;
});

const CWD = '/test/project';
const GIT_HEAD_PATH = `${CWD}/.git/HEAD`;

describe('useGitBranchName', () => {
  beforeEach(() => {
    vol.reset(); // Reset in-memory filesystem
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/main',
    });
    vi.useFakeTimers(); // Use fake timers for async operations
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  it('should return branch name', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers(); // Advance timers to trigger useEffect and exec callback
      rerender(); // Rerender to get the updated state
    });

    expect(result.current).toBe('main');
  });

  it('should return undefined if git command fails', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(new Error('Git error'), '', 'error output');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));
    expect(result.current).toBeUndefined();

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBeUndefined();
  });

  it('should return short commit hash if branch is HEAD (detached state)', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (command, _options, callback) => {
        if (command === 'git rev-parse --abbrev-ref HEAD') {
          callback?.(null, 'HEAD\n', '');
        } else if (command === 'git rev-parse --short HEAD') {
          callback?.(null, 'a1b2c3d\n', '');
        }
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));
    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBe('a1b2c3d');
  });

  it('should return undefined if branch is HEAD and getting commit hash fails', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (command, _options, callback) => {
        if (command === 'git rev-parse --abbrev-ref HEAD') {
          callback?.(null, 'HEAD\n', '');
        } else if (command === 'git rev-parse --short HEAD') {
          callback?.(new Error('Git error'), '', 'error output');
        }
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));
    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBeUndefined();
  });

  it('should update branch name when .git/HEAD changes', async ({ skip }) => {
    skip(); // TODO: fix
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBe('main');

    // Simulate a branch change
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'develop\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    // Simulate file change event
    // Ensure the watcher is set up before triggering the change
    await act(async () => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/develop'); // Trigger watcher
      vi.runAllTimers(); // Process timers for watcher and exec
      rerender();
    });

    expect(result.current).toBe('develop');
  });

  it('should handle watcher setup error silently', async () => {
    // Remove .git/HEAD to cause an error in fs.watch setup
    vol.unlinkSync(GIT_HEAD_PATH);

    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });

    expect(result.current).toBe('main'); // Branch name should still be fetched initially

    // Try to trigger a change that would normally be caught by the watcher
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'develop\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    // This write would trigger the watcher if it was set up
    // but since it failed, the branch name should not update
    // We need to create the file again for writeFileSync to not throw
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/develop',
    });

    await act(async () => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/develop');
      vi.runAllTimers();
      rerender();
    });

    // Branch name should not change because watcher setup failed
    expect(result.current).toBe('main');
  });

  it('should cleanup watcher on unmount', async ({ skip }) => {
    skip(); // TODO: fix
    const closeMock = vi.fn();
    const watchMock = vi.spyOn(fs, 'watch').mockReturnValue({
      close: closeMock,
    } as unknown as FSWatcher);

    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { unmount, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });

    unmount();
    expect(watchMock).toHaveBeenCalledWith(GIT_HEAD_PATH, expect.any(Function));
    expect(closeMock).toHaveBeenCalled();
  });
});
