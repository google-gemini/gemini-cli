/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockedFunction } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useGitBranchName } from './useGitBranchName.js';
import { fs, vol } from 'memfs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path'; // For mocking fs
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
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

vi.mock('node:fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return { ...memfs.fs.promises, default: memfs.fs.promises };
});

const CWD = '/test/project';
const GIT_HEAD_PATH = path.join(CWD, '.git', 'HEAD');
const GIT_LOGS_HEAD_PATH = path.join(CWD, '.git', 'logs', 'HEAD');

describe('useGitBranchName', () => {
  beforeEach(() => {
    vol.reset(); // Reset in-memory filesystem
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/main',
      [GIT_LOGS_HEAD_PATH]: 'ref: refs/heads/main',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderGitBranchNameHook = (cwd: string) => {
    let hookResult: ReturnType<typeof useGitBranchName>;
    function TestComponent() {
      hookResult = useGitBranchName(cwd);
      return null;
    }
    const { rerender, unmount } = render(<TestComponent />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: () => rerender(<TestComponent />),
      unmount,
    };
  };

  it('should return branch name', async () => {
    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockResolvedValue(
      {
        stdout: 'main\n',
      } as { stdout: string; stderr: string },
    );
    const { result, rerender } = renderGitBranchNameHook(CWD);

    await act(async () => {
      rerender(); // Rerender to get the updated state
    });

    expect(result.current).toBe('main');
  });

  it('should return undefined if git command fails', async () => {
    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockRejectedValue(
      new Error('Git error'),
    );

    const { result, rerender } = renderGitBranchNameHook(CWD);
    expect(result.current).toBeUndefined();

    await act(async () => {
      rerender();
    });
    expect(result.current).toBeUndefined();
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

    const { result, rerender } = renderGitBranchNameHook(CWD);
    await act(async () => {
      rerender();
    });
    expect(result.current).toBe('a1b2c3d');
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

    const { result, rerender } = renderGitBranchNameHook(CWD);
    await act(async () => {
      rerender();
    });
    expect(result.current).toBeUndefined();
  });

  it('should update branch name when .git/logs/HEAD changes', async () => {
    vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    const watchSpy = vi.spyOn(fs, 'watch');

    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>)
      .mockResolvedValueOnce({ stdout: 'main\n' } as {
        stdout: string;
        stderr: string;
      })
      .mockResolvedValue({ stdout: 'develop\n' } as {
        stdout: string;
        stderr: string;
      });

    const { result, rerender } = renderGitBranchNameHook(CWD);

    await act(async () => {
      rerender();
    });
    expect(result.current).toBe('main');

    // Wait for watchers to be set up (both .git/HEAD and .git/logs/HEAD)
    await waitFor(() => {
      expect(watchSpy).toHaveBeenCalledTimes(2);
    });

    // Simulate file change event on .git/logs/HEAD
    await act(async () => {
      fs.writeFileSync(GIT_LOGS_HEAD_PATH, 'ref: refs/heads/develop');
      rerender();
    });

    await waitFor(() => {
      expect(result.current).toBe('develop');
    });
  });

  it('should update branch name when .git/HEAD changes', async () => {
    vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    const watchSpy = vi.spyOn(fs, 'watch');

    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>)
      .mockResolvedValueOnce({ stdout: 'main\n' } as {
        stdout: string;
        stderr: string;
      })
      .mockResolvedValue({ stdout: 'feature-branch\n' } as {
        stdout: string;
        stderr: string;
      });

    const { result, rerender } = renderGitBranchNameHook(CWD);

    await act(async () => {
      rerender();
    });
    expect(result.current).toBe('main');

    // Wait for watchers to be set up
    await waitFor(() => {
      expect(watchSpy).toHaveBeenCalledTimes(2);
    });

    // Simulate file change event on .git/HEAD (branch switch)
    await act(async () => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/feature-branch');
      rerender();
    });

    await waitFor(() => {
      expect(result.current).toBe('feature-branch');
    });
  });

  it('should handle watcher setup error silently', async () => {
    // Remove both .git/HEAD and .git/logs/HEAD to cause errors in watcher setup
    vol.unlinkSync(GIT_HEAD_PATH);
    vol.unlinkSync(GIT_LOGS_HEAD_PATH);

    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockResolvedValue(
      {
        stdout: 'main\n',
      } as { stdout: string; stderr: string },
    );

    const { result, rerender } = renderGitBranchNameHook(CWD);

    await act(async () => {
      rerender();
    });

    expect(result.current).toBe('main'); // Branch name should still be fetched initially

    (
      mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>
    ).mockResolvedValueOnce({
      stdout: 'develop\n',
    } as { stdout: string; stderr: string });

    // Recreate the files so writeFileSync doesn't throw,
    // but watchers were never set up so branch name should not update.
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/develop',
      [GIT_LOGS_HEAD_PATH]: 'ref: refs/heads/develop',
    });

    await act(async () => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/develop');
      fs.writeFileSync(GIT_LOGS_HEAD_PATH, 'ref: refs/heads/develop');
      rerender();
    });

    // Branch name should not change because watcher setup failed
    expect(result.current).toBe('main');
  });

  it('should cleanup all watchers on unmount', async () => {
    vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    const closeMock = vi.fn();
    const watchMock = vi.spyOn(fs, 'watch').mockReturnValue({
      close: closeMock,
    } as unknown as ReturnType<typeof fs.watch>);

    (mockSpawnAsync as MockedFunction<typeof mockSpawnAsync>).mockResolvedValue(
      {
        stdout: 'main\n',
      } as { stdout: string; stderr: string },
    );

    const { unmount, rerender } = renderGitBranchNameHook(CWD);

    await act(async () => {
      rerender();
    });

    // Wait for both watchers to be set up BEFORE unmounting
    await waitFor(() => {
      expect(watchMock).toHaveBeenCalledWith(
        GIT_HEAD_PATH,
        expect.any(Function),
      );
      expect(watchMock).toHaveBeenCalledWith(
        GIT_LOGS_HEAD_PATH,
        expect.any(Function),
      );
    });

    unmount();
    // Both watchers should be closed
    expect(closeMock).toHaveBeenCalledTimes(2);
  });
});
