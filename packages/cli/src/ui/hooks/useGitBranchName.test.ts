/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  MockedFunction,
} from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useGitBranchName } from './useGitBranchName.js';
import { EventEmitter } from 'node:events';
import { exec as mockExec, type ChildProcess } from 'node:child_process';
import type { FSWatcher } from 'node:fs';

// Mock child_process
vi.mock('child_process');

const CWD = '/test/project';
const GIT_LOGS_HEAD_PATH = `${CWD}/.git/logs/HEAD`;

describe('useGitBranchName', () => {
  beforeEach(() => {
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

  it('should update branch name when .git/logs/HEAD changes', async () => {
    let watchCallback: ((eventType: string) => void) | undefined;
    
    // Create mock fs dependencies
    const mockFs = {
      watch: vi.fn().mockImplementation((path: string, callback: (eventType: string) => void) => {
        watchCallback = callback;
        return {
          close: vi.fn(),
        } as unknown as FSWatcher;
      }),
      constants: { F_OK: 0 },
    };

    const mockFsPromises = {
      access: vi.fn().mockResolvedValue(undefined),
    };

    // Mock initial call to return 'main'
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => 
      useGitBranchName(CWD, { fs: mockFs as any, fsPromises: mockFsPromises as any })
    );

    // Wait for initial branch name to be set
    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBe('main');

    // Wait for async watcher setup to complete
    await act(async () => {
      await Promise.resolve();
      vi.runAllTimers();
      rerender();
    });

    // Verify watcher was set up
    expect(mockFs.watch).toHaveBeenCalledWith(GIT_LOGS_HEAD_PATH, expect.any(Function));

    // Mock subsequent call for file change to return 'develop'
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'develop\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    // Now simulate the file change event
    await act(async () => {
      watchCallback?.('change');
      vi.runAllTimers();
      rerender();
    });

    expect(result.current).toBe('develop');
  });

  it('should handle watcher setup error silently', async () => {
    // Create mock fs dependencies that fail on access
    const mockFs = {
      watch: vi.fn(),
      constants: { F_OK: 0 },
    };

    const mockFsPromises = {
      access: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory')),
    };

    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => 
      useGitBranchName(CWD, { fs: mockFs as any, fsPromises: mockFsPromises as any })
    );

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });

    expect(result.current).toBe('main'); // Branch name should still be fetched initially

    // Wait for async watcher setup attempt to complete
    await act(async () => {
      await Promise.resolve();
      vi.runAllTimers();
      rerender();
    });

    // Verify that fs.watch was never called because access failed
    expect(mockFs.watch).not.toHaveBeenCalled();
    
    // Branch name should remain the same since no watcher was set up
    expect(result.current).toBe('main');
  });

  it('should cleanup watcher on unmount', async () => {
    const closeMock = vi.fn();
    
    // Create mock fs dependencies
    const mockFs = {
      watch: vi.fn().mockReturnValue({
        close: closeMock,
      } as unknown as FSWatcher),
      constants: { F_OK: 0 },
    };

    const mockFsPromises = {
      access: vi.fn().mockResolvedValue(undefined),
    };

    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { unmount, rerender } = renderHook(() => 
      useGitBranchName(CWD, { fs: mockFs as any, fsPromises: mockFsPromises as any })
    );

    // Wait for initial setup
    await act(async () => {
      vi.runAllTimers();
      rerender();
    });

    // Wait for async watcher setup to complete
    await act(async () => {
      await Promise.resolve();
      vi.runAllTimers();
      rerender();
    });

    unmount();
    expect(mockFs.watch).toHaveBeenCalledWith(GIT_LOGS_HEAD_PATH, expect.any(Function));
    expect(closeMock).toHaveBeenCalled();
  });
});
