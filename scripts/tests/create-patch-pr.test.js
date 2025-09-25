/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the child_process module at the top level
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

describe('create-patch-pr', () => {
  const scriptPath = '../../scripts/releasing/create-patch-pr.js';
  let originalArgv;
  let execSyncMock;
  let consoleLogSpy;
  let consoleErrorSpy;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let processExitSpy;

  // Helper to set up mocks with default "happy path" behavior
  const setupMocks = (overrides = {}) => {
    const defaultMocks = {
      'get-release-version.js': () =>
        JSON.stringify({
          previousReleaseTag: 'v1.0.0',
          releaseVersion: 'v1.0.1',
        }),
      'git ls-remote': () => {
        throw new Error('exit code 1');
      }, // Default: branches don't exist
      'gh pr list': () => '', // Default: no existing PR
      'git cherry-pick': () => '', // Default: success
      'git push': () => '',
      'git status': () => '',
    };

    const mocks = { ...defaultMocks, ...overrides };

    execSyncMock.mockImplementation((command) => {
      for (const key in mocks) {
        if (command.includes(key)) {
          return mocks[key]();
        }
      }
      return ''; // Default success for other commands (checkout, config, etc.)
    });
  };

  beforeEach(async () => {
    vi.resetModules();
    originalArgv = [...process.argv];
    const cp = await import('node:child_process');
    execSyncMock = cp.execSync;
    vi.resetAllMocks();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  async function runScript(args = []) {
    process.argv = ['node', 'create-patch-pr.js', ...args];
    const { main } = await import(scriptPath);
    await main();
  }

  // --- TEST CASES ---

  it('should complete successfully on the happy path', async () => {
    setupMocks();
    await runScript(['--commit', 'abcdef1', '--channel', 'stable']);

    const prCommand = execSyncMock.mock.calls.find((call) =>
      call[0].startsWith('gh pr create'),
    );
    expect(prCommand).toBeDefined();
    expect(prCommand[0]).toContain('fix(patch): cherry-pick abcdef1');
    expect(prCommand[0]).not.toContain('[CONFLICTS]');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '✅ Patch process completed successfully!',
    );
  });

  it('should handle cherry-pick with merge conflicts', async () => {
    setupMocks({
      'git cherry-pick': () => {
        throw new Error('Cherry-pick failed');
      },
      'git status': () => 'UU file1.js\nUU file2.js',
    });

    await runScript(['--commit', 'abcdef1', '--channel', 'stable']);

    const prCommand = execSyncMock.mock.calls.find((call) =>
      call[0].startsWith('gh pr create'),
    );
    expect(prCommand).toBeDefined();
    expect(prCommand[0]).toContain('[CONFLICTS]');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cherry-pick has conflicts'),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '⚠️  Patch process completed with conflicts - manual resolution required!',
    );
  });

  it('should exit gracefully if commit is already applied', async () => {
    setupMocks({
      'git cherry-pick': () => {
        const error = new Error('Command failed');
        error.stderr = 'nothing to commit, working tree clean';
        throw error;
      },
    });

    await expect(
      runScript(['--commit', 'abcdef1', '--channel', 'stable']),
    ).rejects.toThrow('Process exited with code 0');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('already been applied'),
    );
  });

  it('should exit gracefully if commit is empty', async () => {
    setupMocks({
      'git cherry-pick': () => {
        const error = new Error('Command failed');
        error.stdout = 'The previous cherry-pick is now empty';
        throw error;
      },
    });

    await expect(
      runScript(['--commit', 'abcdef1', '--channel', 'stable']),
    ).rejects.toThrow('Process exited with code 0');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('is empty and has been skipped'),
    );
  });

  it('should detect and report an existing PR', async () => {
    setupMocks({
      'git ls-remote': () => '', // Branches exist
      'gh pr list': () =>
        JSON.stringify({
          number: 123,
          url: 'https://github.com/owner/repo/pull/123',
        }),
    });

    await runScript(['--commit', 'abcdef1', '--channel', 'stable']);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Found existing PR #123: https://github.com/owner/repo/pull/123',
    );
    const prCreateCall = execSyncMock.mock.calls.find((call) =>
      call[0].startsWith('gh pr create'),
    );
    expect(prCreateCall).toBeUndefined();
  });

  it('should log commands but not execute them in dry-run mode', async () => {
    setupMocks();
    await runScript([
      '--commit',
      'abcdef1',
      '--channel',
      'stable',
      '--dry-run',
    ]);

    expect(consoleLogSpy).toHaveBeenCalledWith('Running in dry-run mode.');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DRY RUN] Would cherry-pick'),
    );
    const pushCall = execSyncMock.mock.calls.find((call) =>
      call[0].startsWith('git push'),
    );
    expect(pushCall).toBeUndefined();
  });

  it('should provide manual instructions on permission failure', async () => {
    setupMocks({
      'git push': () => {
        const error = new Error('Command failed');
        error.message =
          'GH013: refusing to allow a GitHub App to create or update workflow without the workflows permission.';
        throw error;
      },
    });

    await expect(
      runScript(['--commit', 'abcdef1', '--channel', 'stable']),
    ).rejects.toThrow('Process exited with code 1');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('insufficient GitHub App permissions'),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Please run these commands manually'),
    );
  });
});
