/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as nodeFs from 'node:fs';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});
import {
  getSafeGitEnv,
  isGitRepository,
  findGitRoot,
  getAbsoluteGitDir,
} from './gitUtils.js';
import { spawnAsync } from './shell-utils.js';

describe('gitUtils', () => {
  let tempDir: string;

  beforeEach(async () => {
    const rawTempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'git-utils-test-'),
    );
    tempDir = await fs.realpath(rawTempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('getSafeGitEnv', () => {
    it('should strip existing GIT_CONFIG_* variables', () => {
      const baseEnv = {
        EXISTING_VAR: 'value',
        GIT_CONFIG_KEY_0: 'some.key',
        GIT_CONFIG_VALUE_0: 'some.value',
        GIT_CONFIG_PARAMETERS: "'foo=bar'",
      };

      const safeEnv = getSafeGitEnv(baseEnv);

      expect(safeEnv['EXISTING_VAR']).toBe('value');
      expect(safeEnv['GIT_CONFIG_PARAMETERS']).toBeUndefined();
      expect(safeEnv['GIT_CONFIG_KEY_0']).toBe('credential.helper');
    });

    it('should set default security overrides and expected count', () => {
      const safeEnv = getSafeGitEnv({});
      expect(safeEnv['GIT_TERMINAL_PROMPT']).toBe('0');
      expect(safeEnv['GIT_ASKPASS']).toBe('');
      expect(safeEnv['SSH_ASKPASS']).toBe('');
      expect(safeEnv['GIT_SSH_COMMAND']).toBe('ssh -o BatchMode=yes');
      expect(safeEnv['GH_PROMPT_DISABLED']).toBe('1');
      expect(safeEnv['GCM_INTERACTIVE']).toBe('never');
      expect(safeEnv['GIT_CONFIG_GLOBAL']).toBeUndefined();
      expect(safeEnv['GIT_CONFIG_NOSYSTEM']).toBe('1');
      expect(safeEnv['GIT_CONFIG_COUNT']).toBe('7');
      expect(safeEnv['GIT_CONFIG_KEY_0']).toBe('credential.helper');
      expect(safeEnv['GIT_CONFIG_VALUE_0']).toBe('');
      expect(safeEnv['GIT_CONFIG_KEY_1']).toBe('core.fsmonitor');
      expect(safeEnv['GIT_CONFIG_VALUE_1']).toBe('');
      expect(safeEnv['GIT_CONFIG_KEY_2']).toBe('core.hooksPath');
      expect(safeEnv['GIT_CONFIG_VALUE_2']).toBe('');
      expect(safeEnv['GIT_CONFIG_KEY_3']).toBe('core.sshCommand');
      expect(safeEnv['GIT_CONFIG_VALUE_3']).toBe('');
      expect(safeEnv['GIT_CONFIG_KEY_4']).toBe('core.pager');
      expect(safeEnv['GIT_CONFIG_VALUE_4']).toBe('cat');
      expect(safeEnv['GIT_CONFIG_KEY_5']).toBe('core.editor');
      expect(safeEnv['GIT_CONFIG_VALUE_5']).toBe('');
      expect(safeEnv['GIT_CONFIG_KEY_6']).toBe('sequence.editor');
      expect(safeEnv['GIT_CONFIG_VALUE_6']).toBe('');
    });

    it('should override interactive prompt environment variables from baseEnv', () => {
      const safeEnv = getSafeGitEnv({
        GIT_TERMINAL_PROMPT: '1',
        GIT_ASKPASS: '/usr/bin/ssh-askpass',
        SSH_ASKPASS: '/usr/bin/ssh-askpass',
        GIT_SSH_COMMAND: 'ssh -i /path/to/key',
        GH_PROMPT_DISABLED: '0',
        GCM_INTERACTIVE: 'always',
      });

      expect(safeEnv['GIT_TERMINAL_PROMPT']).toBe('0');
      expect(safeEnv['GIT_ASKPASS']).toBe('');
      expect(safeEnv['SSH_ASKPASS']).toBe('');
      expect(safeEnv['GIT_SSH_COMMAND']).toBe(
        'ssh -o BatchMode=yes -i /path/to/key',
      );
      expect(safeEnv['GH_PROMPT_DISABLED']).toBe('1');
      expect(safeEnv['GCM_INTERACTIVE']).toBe('never');
    });

    it('should not duplicate BatchMode=yes if already present in GIT_SSH_COMMAND', () => {
      const safeEnv = getSafeGitEnv({
        GIT_SSH_COMMAND: 'ssh -i /path/to/key -o BatchMode=yes',
      });

      expect(safeEnv['GIT_SSH_COMMAND']).toBe(
        'ssh -i /path/to/key -o BatchMode=yes',
      );
    });

    it('should prepend BatchMode=yes before BatchMode=no in GIT_SSH_COMMAND', () => {
      const safeEnv = getSafeGitEnv({
        GIT_SSH_COMMAND: 'ssh -o BatchMode=no -i /path/to/key',
      });

      expect(safeEnv['GIT_SSH_COMMAND']).toBe(
        'ssh -o BatchMode=yes -o BatchMode=no -i /path/to/key',
      );
    });

    it('should handle GIT_SSH and plink correctly', () => {
      const safeEnv1 = getSafeGitEnv({
        GIT_SSH: 'plink',
      });
      expect(safeEnv1['GIT_SSH_COMMAND']).toBe('plink -batch');

      const safeEnv2 = getSafeGitEnv({
        GIT_SSH: 'C:/Program Files/PuTTY/plink.exe',
      });
      expect(safeEnv2['GIT_SSH_COMMAND']).toBe(
        '"C:/Program Files/PuTTY/plink.exe" -batch',
      );

      const safeEnv3 = getSafeGitEnv({
        GIT_SSH_COMMAND: '/home/user/plink-helper/ssh',
      });
      expect(safeEnv3['GIT_SSH_COMMAND']).toBe(
        '/home/user/plink-helper/ssh -o BatchMode=yes',
      );
    });

    it('should not configure diff.external to an empty string', () => {
      const safeEnv = getSafeGitEnv({});
      const count = parseInt(safeEnv['GIT_CONFIG_COUNT'] || '0', 10);
      const configuredKeys: string[] = [];

      for (let i = 0; i < count; i++) {
        configuredKeys.push(safeEnv[`GIT_CONFIG_KEY_${i}`] || '');
      }

      // diff.external should not be overridden to empty string because Git treats
      // diff.external="" as an attempt to execute an executable named "", which fails.
      expect(configuredKeys).not.toContain('diff.external');
    });

    it('should allow git diff to run successfully on a repository with modifications', async () => {
      // 1. Initialize a git repository with a committed file
      spawnSync('git', ['init'], {
        cwd: tempDir,
        stdio: 'ignore',
      });
      spawnSync('git', ['config', 'user.name', 'Test'], {
        cwd: tempDir,
        stdio: 'ignore',
      });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tempDir,
        stdio: 'ignore',
      });

      const testFilePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFilePath, 'initial line\n');
      spawnSync('git', ['add', 'test.txt'], { cwd: tempDir, stdio: 'ignore' });
      spawnSync('git', ['commit', '-m', 'initial commit'], {
        cwd: tempDir,
        stdio: 'ignore',
      });

      // 2. Modify the file so git diff has changes to process
      await fs.appendFile(testFilePath, 'modified line\n');

      // 3. Execute git diff with getSafeGitEnv()
      const env = getSafeGitEnv();
      const result = await spawnAsync('git', ['diff'], {
        cwd: tempDir,
        env,
      });

      expect(result.stdout).toContain('modified line');
    });

    it('should allow git diff between commits to run successfully', async () => {
      spawnSync('git', ['init'], {
        cwd: tempDir,
        stdio: 'ignore',
      });
      spawnSync('git', ['config', 'user.name', 'Test'], {
        cwd: tempDir,
        stdio: 'ignore',
      });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tempDir,
        stdio: 'ignore',
      });

      const testFilePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFilePath, 'first commit\n');
      spawnSync('git', ['add', 'test.txt'], { cwd: tempDir, stdio: 'ignore' });
      spawnSync('git', ['commit', '-m', 'commit 1'], {
        cwd: tempDir,
        stdio: 'ignore',
      });

      await fs.writeFile(testFilePath, 'second commit\n');
      spawnSync('git', ['add', 'test.txt'], { cwd: tempDir, stdio: 'ignore' });
      spawnSync('git', ['commit', '-m', 'commit 2'], {
        cwd: tempDir,
        stdio: 'ignore',
      });

      const env = getSafeGitEnv();
      const result = await spawnAsync('git', ['diff', 'HEAD~1', 'HEAD'], {
        cwd: tempDir,
        env,
      });

      expect(result.stdout).toContain('-first commit');
      expect(result.stdout).toContain('+second commit');
    });

    it('should preserve access to user-level ~/.gitconfig settings', async () => {
      const fakeHome = path.join(tempDir, 'home');
      const repoDir = path.join(tempDir, 'repo');
      await fs.mkdir(fakeHome, { recursive: true });
      await fs.mkdir(repoDir, { recursive: true });

      await fs.writeFile(
        path.join(fakeHome, '.gitconfig'),
        [
          '[user]',
          '  name = Global User',
          '  email = global@example.com',
          '  signingKey = test-signing-key',
          '[init]',
          '  defaultBranch = custom-main',
          '[pull]',
          '  rebase = true',
          '',
        ].join('\n'),
      );

      const env = getSafeGitEnv({
        ...process.env,
        GIT_CONFIG_GLOBAL: '',
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        XDG_CONFIG_HOME: path.join(fakeHome, '.config'),
      });

      await spawnAsync('git', ['init'], { cwd: repoDir, env });

      const branchRes = await spawnAsync(
        'git',
        ['symbolic-ref', '--short', 'HEAD'],
        { cwd: repoDir, env },
      );
      expect(branchRes.stdout.trim()).toBe('custom-main');

      const nameRes = await spawnAsync(
        'git',
        ['config', '--get', 'user.name'],
        {
          cwd: repoDir,
          env,
        },
      );
      expect(nameRes.stdout.trim()).toBe('Global User');

      const emailRes = await spawnAsync(
        'git',
        ['config', '--get', 'user.email'],
        { cwd: repoDir, env },
      );
      expect(emailRes.stdout.trim()).toBe('global@example.com');

      const signingKeyRes = await spawnAsync(
        'git',
        ['config', '--get', 'user.signingKey'],
        { cwd: repoDir, env },
      );
      expect(signingKeyRes.stdout.trim()).toBe('test-signing-key');

      const pullRebaseRes = await spawnAsync(
        'git',
        ['config', '--get', 'pull.rebase'],
        { cwd: repoDir, env },
      );
      expect(pullRebaseRes.stdout.trim()).toBe('true');

      const testFile = path.join(repoDir, 'file.txt');
      await fs.writeFile(testFile, 'hello\n');
      await spawnAsync('git', ['add', 'file.txt'], { cwd: repoDir, env });
      await spawnAsync('git', ['commit', '-m', 'test commit'], {
        cwd: repoDir,
        env,
      });

      const logRes = await spawnAsync(
        'git',
        ['log', '-1', '--format=%an <%ae>'],
        { cwd: repoDir, env },
      );
      expect(logRes.stdout.trim()).toBe('Global User <global@example.com>');
    });

    it('should preserve custom GIT_CONFIG_GLOBAL when explicitly set in baseEnv', async () => {
      const customConfigPath = path.join(tempDir, 'custom.gitconfig');
      const repoDir = path.join(tempDir, 'custom-repo');
      await fs.mkdir(repoDir, { recursive: true });

      await fs.writeFile(
        customConfigPath,
        [
          '[user]',
          '  name = Custom Global User',
          '  email = custom@example.com',
          '',
        ].join('\n'),
      );

      const env = getSafeGitEnv({
        ...process.env,
        GIT_CONFIG_GLOBAL: customConfigPath,
        HOME: tempDir,
        USERPROFILE: tempDir,
      });

      expect(env['GIT_CONFIG_GLOBAL']).toBe(customConfigPath);

      await spawnAsync('git', ['init'], { cwd: repoDir, env });
      const nameRes = await spawnAsync(
        'git',
        ['config', '--get', 'user.name'],
        { cwd: repoDir, env },
      );
      expect(nameRes.stdout.trim()).toBe('Custom Global User');

      const emailRes = await spawnAsync(
        'git',
        ['config', '--get', 'user.email'],
        { cwd: repoDir, env },
      );
      expect(emailRes.stdout.trim()).toBe('custom@example.com');
    });
  });

  describe('isGitRepository and findGitRoot', () => {
    it('should correctly identify git repository and find git root', async () => {
      expect(isGitRepository(tempDir)).toBe(false);
      expect(findGitRoot(tempDir)).toBeNull();

      spawnSync('git', ['init'], {
        cwd: tempDir,
        stdio: 'ignore',
      });

      expect(isGitRepository(tempDir)).toBe(true);
      expect(findGitRoot(tempDir)).toBe(tempDir);

      const subDir = path.join(tempDir, 'sub', 'folder');
      await fs.mkdir(subDir, { recursive: true });

      expect(isGitRepository(subDir)).toBe(true);
      expect(findGitRoot(subDir)).toBe(tempDir);
    });

    it('should recognize worktree repository structures (.git is a file)', async () => {
      const worktreeDir = path.join(tempDir, 'mock-worktree');
      await fs.mkdir(worktreeDir, { recursive: true });
      // In a git worktree, .git is a text file containing "gitdir: /path/to/.git/worktrees/..."
      await fs.writeFile(
        path.join(worktreeDir, '.git'),
        'gitdir: /path/to/repo/.git/worktrees/mock\n',
      );

      expect(isGitRepository(worktreeDir)).toBe(true);
      expect(findGitRoot(worktreeDir)).toBe(worktreeDir);

      const nestedInWorktree = path.join(worktreeDir, 'a', 'b');
      await fs.mkdir(nestedInWorktree, { recursive: true });
      expect(isGitRepository(nestedInWorktree)).toBe(true);
      expect(findGitRoot(nestedInWorktree)).toBe(worktreeDir);
    });

    it('should safely return false/null on filesystem errors', () => {
      const existsSyncSpy = vi
        .spyOn(nodeFs, 'existsSync')
        .mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

      expect(isGitRepository(tempDir)).toBe(false);
      expect(findGitRoot(tempDir)).toBeNull();
      expect(existsSyncSpy).toHaveBeenCalled();
    });

    it('should get absolute git dir for standard repo and subdirectories', async () => {
      spawnSync('git', ['init'], {
        cwd: tempDir,
        stdio: 'ignore',
      });
      const expectedGitDir = await fs.realpath(path.join(tempDir, '.git'));

      const actualGitDir = await fs.realpath(await getAbsoluteGitDir(tempDir));
      expect(actualGitDir).toBe(expectedGitDir);

      const subDir = path.join(tempDir, 'deep', 'sub');
      await fs.mkdir(subDir, { recursive: true });
      const actualSubGitDir = await fs.realpath(
        await getAbsoluteGitDir(subDir),
      );
      expect(actualSubGitDir).toBe(expectedGitDir);
    });
  });
});
