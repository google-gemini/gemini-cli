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
const GIT_LOGS_HEAD_PATH = path.join(CWD, '.git', 'logs', 'HEAD');

describe('useGitBranchName', () => {
  let deferredSpawn: Array<{
    resolve: (val: { stdout: string; stderr: string }) => void;
    reject: (err: Error) => void;
    args: string[];
  }> = [];

  beforeEach(() => {
    vol.reset(); // Reset in-memory filesystem
    vol.fromJSON({
      [GIT_LOGS_HEAD_PATH]: 'ref: refs/heads/main',
    });

    deferredSpawn = [];
    vi.mocked(mockSpawnAsync).mockImplementation(
      (_command: string, args: string[]) =>
        new Promise((resolve, reject) => {
          deferredSpawn.push({ resolve, reject, args });
        }),
    );
  });

  afterEach(() => {
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

  it('should return branch name', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    expect(result.current).toBeUndefined();

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'main\n', stderr: '' });
    });

    expect(result.current).toBe('main');
  });

  it('should return undefined if git command fails', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.reject(new Error('Git error'));
    });

    expect(result.current).toBeUndefined();
  });

  it('should return short commit hash if branch is HEAD (detached state)', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'HEAD\n', stderr: '' });
    });

    // It should now call spawnAsync again for the short hash
    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--short');
      spawn.resolve({ stdout: 'a1b2c3d\n', stderr: '' });
    });

    expect(result.current).toBe('a1b2c3d');
  });

  it('should return undefined if branch is HEAD and getting commit hash fails', async () => {
    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'HEAD\n', stderr: '' });
    });

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--short');
      spawn.reject(new Error('Git error'));
    });

    expect(result.current).toBeUndefined();
  });

  it('should update branch name when .git/HEAD changes', async () => {
    vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    const watchSpy = vi.spyOn(fs, 'watch');

    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'main\n', stderr: '' });
    });

    expect(result.current).toBe('main');

    // Wait for watcher to be set up
    await waitFor(() => {
      expect(watchSpy).toHaveBeenCalled();
    });

    // Simulate file change event
    await act(async () => {
      fs.writeFileSync(GIT_LOGS_HEAD_PATH, 'ref: refs/heads/develop'); // Trigger watcher
    });

    // Resolving the new branch name fetch
    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'develop\n', stderr: '' });
    });

    expect(result.current).toBe('develop');
  });

  it('should handle watcher setup error silently', async () => {
    // Remove .git/logs/HEAD to cause an error in fs.watch setup
    vol.unlinkSync(GIT_LOGS_HEAD_PATH);

    const { result } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'main\n', stderr: '' });
    });

    expect(result.current).toBe('main');

    // This write would trigger the watcher if it was set up
    // We need to create the file again for writeFileSync to not throw
    vol.fromJSON({
      [GIT_LOGS_HEAD_PATH]: 'ref: refs/heads/develop',
    });

    await act(async () => {
      fs.writeFileSync(GIT_LOGS_HEAD_PATH, 'ref: refs/heads/develop');
    });

    // spawnAsync should NOT have been called again for updating
    expect(deferredSpawn.length).toBe(0);
    expect(result.current).toBe('main');
  });

  it('should cleanup watcher on unmount', async () => {
    vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    const closeMock = vi.fn();
    const watchMock = vi.spyOn(fs, 'watch').mockReturnValue({
      close: closeMock,
    } as unknown as ReturnType<typeof fs.watch>);

    const { unmount } = await renderGitBranchNameHook(CWD);

    await act(async () => {
      const spawn = deferredSpawn.shift()!;
      expect(spawn.args).toContain('--abbrev-ref');
      spawn.resolve({ stdout: 'main\n', stderr: '' });
    });

    // Wait for watcher to be set up BEFORE unmounting
    await waitFor(() => {
      expect(watchMock).toHaveBeenCalledWith(
        GIT_LOGS_HEAD_PATH,
        expect.any(Function),
      );
    });

    unmount();
    expect(closeMock).toHaveBeenCalled();
  });
});
