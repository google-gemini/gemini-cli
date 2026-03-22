/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { access } from 'node:fs/promises';
import {
  setupWorktree,
  cleanupWorktreeOnExit,
  resetWorktreeExitCleanupForTesting,
} from './worktreeSetup.js';
import * as coreFunctions from '@google/gemini-cli-core';

const hoisted = vi.hoisted(() => ({
  mockMaybeCleanup: vi.fn(),
  mockIsGeminiWorktree: vi.fn(),
}));

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getProjectRootForWorktree: vi.fn(),
    createWorktreeService: vi.fn(),
    WorktreeService: vi.fn().mockImplementation(() => ({
      maybeCleanup: hoisted.mockMaybeCleanup,
    })),
    isGeminiWorktree: hoisted.mockIsGeminiWorktree,
    debugLogger: {
      log: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    writeToStdout: vi.fn(),
    writeToStderr: vi.fn(),
  };
});

describe('setupWorktree', () => {
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd;

  const mockService = {
    setup: vi.fn(),
    maybeCleanup: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetWorktreeExitCleanupForTesting();
    hoisted.mockIsGeminiWorktree.mockReturnValue(true);
    process.env = { ...originalEnv };

    // Mock process.cwd and process.chdir
    let currentPath = '/mock/project';
    process.cwd = vi.fn().mockImplementation(() => currentPath);
    process.chdir = vi.fn().mockImplementation((newPath) => {
      currentPath = newPath;
    });

    // Mock successful execution of core utilities
    vi.mocked(coreFunctions.getProjectRootForWorktree).mockResolvedValue(
      '/mock/project',
    );
    vi.mocked(coreFunctions.createWorktreeService).mockResolvedValue(
      mockService as never,
    );
    mockService.setup.mockResolvedValue({
      name: 'my-feature',
      path: '/mock/project/.gemini/worktrees/my-feature',
      baseSha: 'base-sha',
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.cwd = originalCwd;
    delete (process as { chdir?: typeof process.chdir }).chdir;
  });

  it('should create and switch to a new worktree', async () => {
    await setupWorktree('my-feature');

    expect(coreFunctions.getProjectRootForWorktree).toHaveBeenCalledWith(
      '/mock/project',
    );
    expect(coreFunctions.createWorktreeService).toHaveBeenCalledWith(
      '/mock/project',
    );
    expect(mockService.setup).toHaveBeenCalledWith('my-feature');
    expect(process.chdir).toHaveBeenCalledWith(
      '/mock/project/.gemini/worktrees/my-feature',
    );
    expect(process.env['GEMINI_CLI_WORKTREE_HANDLED']).toBe('1');
  });

  it('should generate a name if worktreeName is undefined', async () => {
    mockService.setup.mockResolvedValue({
      name: 'generated-name',
      path: '/mock/project/.gemini/worktrees/generated-name',
      baseSha: 'base-sha',
    });

    await setupWorktree(undefined);

    expect(mockService.setup).toHaveBeenCalledWith(undefined);
  });

  it('should skip worktree creation if GEMINI_CLI_WORKTREE_HANDLED is set', async () => {
    process.env['GEMINI_CLI_WORKTREE_HANDLED'] = '1';

    await setupWorktree('my-feature');

    expect(coreFunctions.createWorktreeService).not.toHaveBeenCalled();
    expect(process.chdir).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully and exit', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('PROCESS_EXIT');
    });

    mockService.setup.mockRejectedValue(new Error('Git failure'));

    await expect(setupWorktree('my-feature')).rejects.toThrow('PROCESS_EXIT');

    expect(coreFunctions.writeToStderr).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to create or switch to worktree: Git failure',
      ),
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});

describe('cleanupWorktreeOnExit', () => {
  const originalCwd = process.cwd;
  const worktreePath = '/mock/project/.gemini/worktrees/my-feature';

  const createConfig = () => ({
    getWorktreeSettings: vi.fn(),
    markWorktreeRemoved: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetWorktreeExitCleanupForTesting();
    hoisted.mockIsGeminiWorktree.mockReturnValue(true);
    hoisted.mockMaybeCleanup.mockResolvedValue(false);
    vi.mocked(coreFunctions.getProjectRootForWorktree).mockResolvedValue(
      '/mock/project',
    );
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

    let currentPath = worktreePath;
    process.cwd = vi.fn().mockImplementation(() => currentPath);
    process.chdir = vi.fn().mockImplementation((newPath: string) => {
      currentPath = newPath;
    });
  });

  afterEach(() => {
    process.cwd = originalCwd;
    delete (process as { chdir?: typeof process.chdir }).chdir;
  });

  it('returns false when there are no worktree settings', async () => {
    const config = createConfig();
    config.getWorktreeSettings.mockReturnValue(undefined);

    await expect(cleanupWorktreeOnExit(config as never)).resolves.toBe(false);
    expect(hoisted.mockMaybeCleanup).not.toHaveBeenCalled();
  });

  it('returns false without cleanup when path is not a Gemini worktree', async () => {
    hoisted.mockIsGeminiWorktree.mockReturnValue(false);
    const config = createConfig();
    config.getWorktreeSettings.mockReturnValue({
      name: 'x',
      path: '/evil/other/path',
      baseSha: 'sha',
    });

    await expect(cleanupWorktreeOnExit(config as never)).resolves.toBe(false);
    expect(hoisted.mockMaybeCleanup).not.toHaveBeenCalled();
  });

  it('calls markWorktreeRemoved only when maybeCleanup succeeds and path is gone', async () => {
    hoisted.mockMaybeCleanup.mockResolvedValue(true);
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    const config = createConfig();
    config.getWorktreeSettings.mockReturnValue({
      name: 'my-feature',
      path: worktreePath,
      baseSha: 'base-sha',
    });

    await expect(cleanupWorktreeOnExit(config as never)).resolves.toBe(true);
    expect(config.markWorktreeRemoved).toHaveBeenCalledTimes(1);
  });

  it('does not mark removed when path still exists after maybeCleanup', async () => {
    hoisted.mockMaybeCleanup.mockResolvedValue(true);
    vi.mocked(access).mockResolvedValue(undefined);
    const config = createConfig();
    config.getWorktreeSettings.mockReturnValue({
      name: 'my-feature',
      path: worktreePath,
      baseSha: 'base-sha',
    });

    await expect(cleanupWorktreeOnExit(config as never)).resolves.toBe(false);
    expect(config.markWorktreeRemoved).not.toHaveBeenCalled();
  });

  it('restores cwd after cleanup', async () => {
    hoisted.mockMaybeCleanup.mockResolvedValue(false);
    const config = createConfig();
    config.getWorktreeSettings.mockReturnValue({
      name: 'my-feature',
      path: worktreePath,
      baseSha: 'base-sha',
    });

    await cleanupWorktreeOnExit(config as never);

    expect(process.chdir).toHaveBeenCalledWith('/mock/project');
    expect(process.chdir).toHaveBeenCalledWith(worktreePath);
    const chdirMock = vi.mocked(process.chdir);
    expect(chdirMock.mock.calls[chdirMock.mock.calls.length - 1]?.[0]).toBe(
      worktreePath,
    );
  });

  it('runs at most once per process', async () => {
    hoisted.mockMaybeCleanup.mockResolvedValue(false);
    const config = createConfig();
    config.getWorktreeSettings.mockReturnValue({
      name: 'my-feature',
      path: worktreePath,
      baseSha: 'base-sha',
    });

    await cleanupWorktreeOnExit(config as never);
    await cleanupWorktreeOnExit(config as never);

    expect(hoisted.mockMaybeCleanup).toHaveBeenCalledTimes(1);
  });
});
