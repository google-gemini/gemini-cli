/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useGitBranchName } from './useGitBranchName.js';
import { fs, vol } from 'memfs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path'; // For mocking fs
import {
  spawnAsync as mockSpawnAsync,
  getAbsoluteGitDir as mockGetAbsoluteGitDir,
} from '@google/gemini-cli-core';

// Mock @google/gemini-cli-core
vi.mock('@google/gemini-cli-core', async () => {
  const original = await vi.importActual<
    typeof import('@google/gemini-cli-core')
  >('@google/gemini-cli-core');
  return {
    ...original,
    spawnAsync: vi.fn(),
    getAbsoluteGitDir: vi.fn(),
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
const GIT_DIR = path.join(CWD, '.git');
const GIT_HEAD_PATH = path.join(GIT_DIR, 'HEAD');

describe('useGitBranchName', () => {
  let deferredSpawn: Array<{
    resolve: (val: { stdout: string; stderr: string; code: number }) => void;
    reject: (err: Error) => void;
    args: string[];
  }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vol.reset(); // Reset in-memory filesystem
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/main',
    });

    deferredSpawn = [];
    vi.mocked(mockSpawnAsync).mockImplementation(
      (_command: string, args: string[]) =>
        new Promise((resolve, reject) => {
          deferredSpawn.push({ resolve, reject, args });
        }),
    );
    vi.mocked(mockGetAbsoluteGitDir).mockResolvedValue(GIT_DIR);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderGitBranchNameHook = async (cwd: string) => {
    let hookResult: ReturnType<typeof useGitBranchName>;
    function TestComponent() {
      hookResult = useGitBranchName(cwd);
      return null;
    }
    const result = await render(<TestComponent />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: () => result.rerender(<TestComponent />),
      unmount: result.unmount,
    };
  };

  /**
   * Helper to resolve pending spawns for a hook render.
   */
  const resolveInitialSpawns = async (branch: string = 'main') => {
    await act(async () => {
      let resolvedAny = true;
      while (resolvedAny || deferredSpawn.length > 0) {
        resolvedAny = false;
        while (deferredSpawn.length > 0) {
          const spawn = deferredSpawn.shift()!;
          if (spawn.args.includes('--abbrev-ref')) {
            spawn.resolve({ stdout: `${branch}\n`, stderr: '', code: 0 });
            resolvedAny = true;
          } else if (spawn.args.includes('--short')) {
            spawn.resolve({ stdout: `${branch}\n`, stderr: '', code: 0 });
            resolvedAny = true;
          }
        }
        await vi.advanceTimersByTimeAsync(1);
      }
    });
  };

  it('should return branch name', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    expect(result.current).toBeUndefined();

    await resolveInitialSpawns('main');

    expect(result.current).toBe('main');
  });

  it('should return undefined if git command fails', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const abbrevSpawn = deferredSpawn.find((s) =>
        s.args.includes('--abbrev-ref'),
      );
      if (abbrevSpawn) {
        abbrevSpawn.reject(new Error('Git error'));
      }
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current).toBeUndefined();
  });

  it('should return short commit hash if branch is HEAD (detached state)', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const abbrevSpawn = deferredSpawn.find((s) =>
        s.args.includes('--abbrev-ref'),
      )!;
      abbrevSpawn.resolve({ stdout: 'HEAD\n', stderr: '', code: 0 });
      await vi.advanceTimersByTimeAsync(1);
    });

    // It should now call spawnAsync again for the short hash
    await act(async () => {
      const shortSpawn = deferredSpawn.find((s) => s.args.includes('--short'));
      if (shortSpawn) {
        shortSpawn.resolve({ stdout: 'a1b2c3d\n', stderr: '', code: 0 });
      } else {
        throw new Error('Short spawn not found');
      }
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current).toBe('a1b2c3d');
  });

  it('should return undefined if branch is HEAD and getting commit hash fails', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const abbrevSpawn = deferredSpawn.find((s) =>
        s.args.includes('--abbrev-ref'),
      )!;
      abbrevSpawn.resolve({ stdout: 'HEAD\n', stderr: '', code: 0 });
      await vi.advanceTimersByTimeAsync(1);
    });

    await act(async () => {
      const shortSpawn = deferredSpawn.find((s) => s.args.includes('--short'));
      if (shortSpawn) {
        shortSpawn.reject(new Error('Git error'));
      } else {
        throw new Error('Short spawn not found');
      }
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current).toBeUndefined();
  });

  it('should update branch name when .git/HEAD changes', async () => {
    vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    let watchCallback:
      | ((eventType: string, filename: string | null) => void)
      | undefined;
    const watchSpy = vi.spyOn(fs, 'watch').mockImplementation(((
      _path: string,
      callback: (eventType: string, filename: string | null) => void,
    ) => {
      watchCallback = callback;
      return { close: vi.fn() };
    }) as unknown as typeof fs.watch);

    const { result } = await renderGitBranchNameHook(CWD);

    await resolveInitialSpawns('main');

    expect(result.current).toBe('main');

    // Wait for watcher to be set up
    await waitFor(() => {
      expect(watchSpy).toHaveBeenCalledWith(GIT_DIR, expect.any(Function));
    });

    // Simulate file change event for HEAD
    await act(async () => {
      if (watchCallback) {
        watchCallback('change', 'HEAD');
      }
      await vi.advanceTimersByTimeAsync(150); // triggers debounce
    });

    // Resolving the new branch name fetch
    await act(async () => {
      // Find the specific abbrev-ref spawn for this update
      const spawn = deferredSpawn.find((s) => s.args.includes('--abbrev-ref'))!;
      // Remove it from the array so subsequent lookups don't find the same one
      deferredSpawn.splice(deferredSpawn.indexOf(spawn), 1);
      spawn.resolve({ stdout: 'develop\n', stderr: '', code: 0 });
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current).toBe('develop');

    // Simulate file change event with null filename (platform compatibility)
    await act(async () => {
      if (watchCallback) {
        watchCallback('change', null);
      }
      await vi.advanceTimersByTimeAsync(150);
    });

    // Resolving the new branch name fetch
    await act(async () => {
      const spawn = deferredSpawn.find((s) => s.args.includes('--abbrev-ref'))!;
      deferredSpawn.splice(deferredSpawn.indexOf(spawn), 1);
      spawn.resolve({ stdout: 'feature-x\n', stderr: '', code: 0 });
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current).toBe('feature-x');
  });

  it('should handle watcher setup error silently', async () => {
    // Cause an error in absolute git dir setup
    vi.mocked(mockGetAbsoluteGitDir).mockRejectedValueOnce(
      new Error('Git error'),
    );

    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'main\n', stderr: '', code: 0 });
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current).toBe('main');

    // Trigger a mock write that would normally be watched
    await act(async () => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/develop');
      await vi.advanceTimersByTimeAsync(1);
    });

    // spawnAsync should NOT have been called again for updating
    expect(
      deferredSpawn.filter((s) => s.args.includes('--abbrev-ref')).length,
    ).toBe(0);
    expect(result.current).toBe('main');
  });

  it('should cleanup watcher on unmount', async () => {
    vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    const closeMock = vi.fn();
    const watchMock = vi.spyOn(fs, 'watch').mockReturnValue({
      close: closeMock,
    } as unknown as ReturnType<typeof fs.watch>);

    const { unmount } = await renderGitBranchNameHook(CWD);

    await resolveInitialSpawns('main');

    // Wait for watcher to be set up BEFORE unmounting
    await waitFor(() => {
      expect(watchMock).toHaveBeenCalledWith(GIT_DIR, expect.any(Function));
    });

    unmount();
    expect(closeMock).toHaveBeenCalled();
  });
});
