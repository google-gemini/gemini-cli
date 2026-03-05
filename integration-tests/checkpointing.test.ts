/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { GitService, Storage } from '@google/gemini-cli-core';

describe('Checkpointing Integration', () => {
  let tmpDir: string;
  let projectRoot: string;
  let fakeHome: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-checkpoint-test-'),
    );
    projectRoot = path.join(tmpDir, 'project');
    fakeHome = path.join(tmpDir, 'home');

    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(fakeHome, { recursive: true });

    // Save original env
    originalEnv = { ...process.env };

    // Simulate environment with NO global gitconfig
    process.env['HOME'] = fakeHome;
    delete process.env['GIT_CONFIG_GLOBAL'];
    delete process.env['GIT_CONFIG_SYSTEM'];
  });

  afterEach(async () => {
    // Restore env
    process.env = originalEnv;

    // Cleanup
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to cleanup temp dir', e);
    }
  });

  it('should successfully create and restore snapshots without global git config', async () => {
    const storage = new Storage(projectRoot);
    const gitService = new GitService(projectRoot, storage);

    // 1. Initialize
    await gitService.initialize();

    // Verify system config empty file creation
    // We need to access getHistoryDir logic or replicate it.
    // Since we don't have access to private getHistoryDir, we can infer it or just trust the functional test.

    // 2. Create initial state
    await fs.writeFile(path.join(projectRoot, 'file1.txt'), 'version 1');
    await fs.writeFile(path.join(projectRoot, 'file2.txt'), 'permanent file');

    // 3. Create Snapshot
    const snapshotHash = await gitService.createFileSnapshot('Checkpoint 1');
    expect(snapshotHash).toBeDefined();

    // 4. Modify files
    await fs.writeFile(
      path.join(projectRoot, 'file1.txt'),
      'version 2 (BAD CHANGE)',
    );
    await fs.writeFile(
      path.join(projectRoot, 'file3.txt'),
      'new file (SHOULD BE GONE)',
    );
    await fs.rm(path.join(projectRoot, 'file2.txt'));

    // 5. Restore
    await gitService.restoreProjectFromSnapshot(snapshotHash);

    // 6. Verify state
    const file1Content = await fs.readFile(
      path.join(projectRoot, 'file1.txt'),
      'utf-8',
    );
    expect(file1Content).toBe('version 1');

    const file2Exists = await fs
      .stat(path.join(projectRoot, 'file2.txt'))
      .then(() => true)
      .catch(() => false);
    expect(file2Exists).toBe(true);
    const file2Content = await fs.readFile(
      path.join(projectRoot, 'file2.txt'),
      'utf-8',
    );
    expect(file2Content).toBe('permanent file');

    const file3Exists = await fs
      .stat(path.join(projectRoot, 'file3.txt'))
      .then(() => true)
      .catch(() => false);
    expect(file3Exists).toBe(false);
  });

  it('should ignore user global git config and use isolated identity', async () => {
    // 1. Create a fake global gitconfig with a specific user
    const globalConfigPath = path.join(fakeHome, '.gitconfig');
    const globalConfigContent = `[user]
  name = Global User
  email = global@example.com
`;
    await fs.writeFile(globalConfigPath, globalConfigContent);

    // Point HOME to fakeHome so git picks up this global config (if we didn't isolate it)
    process.env['HOME'] = fakeHome;
    // Ensure GIT_CONFIG_GLOBAL is NOT set for the process initially,
    // so it would default to HOME/.gitconfig if GitService didn't override it.
    delete process.env['GIT_CONFIG_GLOBAL'];

    const storage = new Storage(projectRoot);
    const gitService = new GitService(projectRoot, storage);

    await gitService.initialize();

    // 2. Create a file and snapshot
    await fs.writeFile(path.join(projectRoot, 'test.txt'), 'content');
    await gitService.createFileSnapshot('Snapshot with global config present');

    // 3. Verify the commit author in the shadow repo
    const historyDir = storage.getHistoryDir();

    const { execFileSync } = await import('node:child_process');

    const logOutput = execFileSync(
      'git',
      ['log', '-1', '--pretty=format:%an <%ae>'],
      {
        cwd: historyDir,
        env: {
          ...process.env,
          GIT_DIR: path.join(historyDir, '.git'),
          GIT_CONFIG_GLOBAL: path.join(historyDir, '.gitconfig'),
          GIT_CONFIG_SYSTEM: path.join(historyDir, '.gitconfig_system_empty'),
        },
        encoding: 'utf-8',
      },
    );

    expect(logOutput).toBe('Gemini CLI <gemini-cli@google.com>');
    expect(logOutput).not.toContain('Global User');
  });
});
