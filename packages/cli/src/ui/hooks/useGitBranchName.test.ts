/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockedFunction } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { useGitBranchName } from './useGitBranchName.js';
import { fs, vol } from 'memfs'; // For mocking fs
import { spawnAsync as mockSpawnAsync } from '@google/gemini-cli-core';

// Mock @google/gemini-cli-core
vi.mock('@google/gemini-cli-core', async () => {
  const original = await vi.importActual<
    typeof import('@google/gemini-cli-core')
  >('@google/gemini-cli-core');
  return {
    ...original,
    spawnAsync: vi.fn(),
  };
});

// Mock fs and fs/promises
vi.mock('node:fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('node:fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return { ...memfs.fs.promises, default: memfs.fs.promises };
});

const CWD = '/test/project';
const GIT_HEAD_PATH = `${CWD}/.git/HEAD`;

describe('useGitBranchName', () => {
  beforeEach(() => {
    vol.reset(); // Reset in-memory filesystem
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/main',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return branch name', async () => {
    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockResolvedValue(
      {
        stdout: 'main\n',
      } as { stdout: string; stderr: string },
    );
    const { result } = renderHook(() => useGitBranchName(CWD));

    await waitFor(() => {
      expect(result.current).toBe('main');
    });
  });

  it('should return undefined if git command fails', async () => {
    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockRejectedValue(
      new Error('Git error'),
    );

    const { result } = renderHook(() => useGitBranchName(CWD));

    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('should return short commit hash if branch is HEAD (detached state)', async () => {
    (
      mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>
    ).mockImplementation(async (command: string, args: string[]) => {
      if (args.includes('--abbrev-ref')) {
        return { stdout: 'HEAD\n' } as { stdout: string; stderr: string };
      } else if (args.includes('--short')) {
        return { stdout: 'a1b2c3d\n' } as { stdout: string; stderr: string };
      }
      return { stdout: '' } as { stdout: string; stderr: string };
    });

    const { result } = renderHook(() => useGitBranchName(CWD));
    await waitFor(() => {
      expect(result.current).toBe('a1b2c3d');
    });
  });

  it('should return undefined if branch is HEAD and getting commit hash fails', async () => {
    (
      mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>
    ).mockImplementation(async (command: string, args: string[]) => {
      if (args.includes('--abbrev-ref')) {
        return { stdout: 'HEAD\n' } as { stdout: string; stderr: string };
      } else if (args.includes('--short')) {
        throw new Error('Git error');
      }
      return { stdout: '' } as { stdout: string; stderr: string };
    });

    const { result } = renderHook(() => useGitBranchName(CWD));
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('should update branch name when .git/HEAD changes', async () => {
    let watcherCallback:
      | ((event: string, filename: string | null) => void)
      | undefined;
    const closeMock = vi.fn();
    const watchMock = vi.spyOn(fs, 'watch').mockImplementation((_path, cb) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      watcherCallback = cb as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { close: closeMock } as any;
    });

    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>)
      .mockResolvedValueOnce({ stdout: 'main\n' } as {
        stdout: string;
        stderr: string;
      })
      .mockResolvedValueOnce({ stdout: 'develop\n' } as {
        stdout: string;
        stderr: string;
      });

    const { result } = renderHook(() => useGitBranchName(CWD));

    // Wait for initial fetch and watcher setup
    await waitFor(() => {
      expect(result.current).toBe('main');
      expect(watchMock).toHaveBeenCalledWith(
        GIT_HEAD_PATH,
        expect.any(Function),
      );
    });
    expect(mockSpawnAsync).toHaveBeenCalledTimes(1);

    // Simulate file change event by calling the captured callback
    act(() => {
      expect(watcherCallback).toBeDefined();
      if (watcherCallback) {
        watcherCallback('change', null);
      }
    });

    // Wait for the branch name to update
    await waitFor(() => {
      expect(result.current).toBe('develop');
    });
    expect(mockSpawnAsync).toHaveBeenCalledTimes(2);
  });

  it('should handle watcher setup error silently', async () => {
    // Remove .git/HEAD to cause an error in fs.watch setup
    vol.unlinkSync(GIT_HEAD_PATH);

    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockResolvedValue(
      {
        stdout: 'main\n',
      } as { stdout: string; stderr: string },
    );

    const { result } = renderHook(() => useGitBranchName(CWD));

    await waitFor(() => {
      expect(result.current).toBe('main'); // Branch name should still be fetched initially
    });
    expect(mockSpawnAsync).toHaveBeenCalledTimes(1);

    // This write would trigger the watcher if it was set up
    // but since it failed, the branch name should not update
    // We need to create the file again for writeFileSync to not throw
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/develop',
    });

    act(() => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/develop');
    });

    // Branch name should not change because watcher setup failed,
    // and spawnAsync should not have been called again.
    expect(mockSpawnAsync).toHaveBeenCalledTimes(1);
    expect(result.current).toBe('main');
  });

  it('should cleanup watcher on unmount', async () => {
    const closeMock = vi.fn();
    const watchMock = vi.spyOn(fs, 'watch').mockReturnValue({
      close: closeMock,
    } as unknown as ReturnType<typeof fs.watch>);

    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockResolvedValue(
      {
        stdout: 'main\n',
      } as { stdout: string; stderr: string },
    );

    const { unmount } = renderHook(() => useGitBranchName(CWD));

    // Wait for the watcher to be set up
    await waitFor(() => {
      expect(watchMock).toHaveBeenCalledWith(
        GIT_HEAD_PATH,
        expect.any(Function),
      );
    });

    unmount();

    expect(closeMock).toHaveBeenCalled();
  });
});
