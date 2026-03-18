/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupWorktree } from './worktreeSetup.js';
import * as coreFunctions from '@google/gemini-cli-core';
import * as settingsFunctions from '../config/settings.js';
import { registerCleanup } from './cleanup.js';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getProjectRootForWorktree: vi.fn(),
    createWorktreeService: vi.fn(),
    debugLogger: {
      log: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    writeToStdout: vi.fn(),
    writeToStderr: vi.fn(),
  };
});

vi.mock('../config/settings.js', () => ({
  loadSettings: vi.fn(),
}));

vi.mock('./cleanup.js', () => ({
  registerCleanup: vi.fn(),
}));

describe('setupWorktree', () => {
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd;

  const mockService = {
    setup: vi.fn(),
    maybeCleanup: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

    vi.mocked(settingsFunctions.loadSettings).mockReturnValue({
      merged: {},
    } as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.cwd = originalCwd;
    delete (process as { chdir?: typeof process.chdir }).chdir;
  });

  it('should create and switch to a new worktree', async () => {
    const initialSettings = { merged: { foo: 'bar' } } as never;

    const result = await setupWorktree('my-feature', initialSettings);

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
    expect(settingsFunctions.loadSettings).toHaveBeenCalledWith(
      '/mock/project/.gemini/worktrees/my-feature',
    );
    expect(registerCleanup).toHaveBeenCalled();
    expect(process.env['GEMINI_CLI_WORKTREE_HANDLED']).toBe('1');
    expect(result).not.toBe(initialSettings);
  });

  it('should generate a name if worktreeName is undefined', async () => {
    const initialSettings = { merged: { foo: 'bar' } } as never;
    mockService.setup.mockResolvedValue({
      name: 'generated-name',
      path: '/mock/project/.gemini/worktrees/generated-name',
      baseSha: 'base-sha',
    });

    await setupWorktree(undefined, initialSettings);

    expect(mockService.setup).toHaveBeenCalledWith(undefined);
  });

  it('should skip worktree creation if GEMINI_CLI_WORKTREE_HANDLED is set', async () => {
    process.env['GEMINI_CLI_WORKTREE_HANDLED'] = '1';
    const initialSettings = { merged: { foo: 'bar' } } as never;

    const result = await setupWorktree('my-feature', initialSettings);

    expect(coreFunctions.createWorktreeService).not.toHaveBeenCalled();
    expect(process.chdir).not.toHaveBeenCalled();
    expect(result).toBe(initialSettings);
  });

  it('should handle errors gracefully and exit', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('PROCESS_EXIT');
    });

    mockService.setup.mockRejectedValue(new Error('Git failure'));

    const initialSettings = { merged: {} } as never;
    await expect(setupWorktree('my-feature', initialSettings)).rejects.toThrow(
      'PROCESS_EXIT',
    );

    expect(coreFunctions.writeToStderr).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to create or switch to worktree: Git failure',
      ),
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});
