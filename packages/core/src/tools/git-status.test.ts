/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { GitStatusTool, type GitStatusToolParams } from './git-status.js';
import type { Config } from '../config/config.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { simpleGit } from 'simple-git';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('GitStatusTool', () => {
  let tempDir: string;
  let config: Config;
  let tool: GitStatusTool;

  beforeEach(async () => {
    // Create a temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-status-test-'));

    config = makeFakeConfig({
      targetDir: tempDir,
      cwd: tempDir,
    });

    tool = new GitStatusTool(config);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('when not in a Git repository', () => {
    it('should return an error indicating not in a repo', async () => {
      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Not in a Git repository');
    });
  });

  describe('when in a Git repository', () => {
    beforeEach(async () => {
      // Initialize a Git repo
      const git = simpleGit(tempDir);
      await git.init();

      // Create and commit an initial file
      await fs.writeFile(path.join(tempDir, 'initial.txt'), 'initial content');
      await git.add('initial.txt');
      await git.commit('Initial commit');
    });

    it('should return clean status for a clean repo', async () => {
      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Clean');
      expect(result.llmContent).toContain('Staged files (0)');
    });

    it('should detect staged files', async () => {
      // Create a new file and stage it
      await fs.writeFile(path.join(tempDir, 'staged.txt'), 'staged content');
      const git = simpleGit(tempDir);
      await git.add('staged.txt');

      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('staged.txt');
      expect(result.llmContent).toContain('Staged files (1)');
    });

    it('should detect unstaged files', async () => {
      // Modify an existing file without staging
      await fs.writeFile(path.join(tempDir, 'initial.txt'), 'modified content');

      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('initial.txt');
      expect(result.llmContent).toContain('Unstaged files (1)');
    });

    it('should detect untracked files', async () => {
      // Create a new file without staging
      await fs.writeFile(
        path.join(tempDir, 'untracked.txt'),
        'untracked content',
      );

      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('untracked.txt');
      expect(result.llmContent).toContain('Untracked files (1)');
    });

    it('should detect deleted files in unstaged', async () => {
      // Delete an existing file
      await fs.unlink(path.join(tempDir, 'initial.txt'));

      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('initial.txt');
      expect(result.llmContent).toContain('Unstaged files (1)');
      expect(result.returnDisplay).toContain('1 unstaged');
    });

    it('should detect conflicted files', async () => {
      // Create a merge conflict scenario
      const git = simpleGit(tempDir);

      // Create a file and commit it
      await fs.writeFile(
        path.join(tempDir, 'conflict.txt'),
        'original content',
      );
      await git.add('conflict.txt');
      await git.commit('Add conflict.txt');

      // Create a branch and modify the file
      await git.checkoutLocalBranch('feature-branch');
      await fs.writeFile(path.join(tempDir, 'conflict.txt'), 'feature content');
      await git.add('conflict.txt');
      await git.commit('Modify in feature branch');

      // Switch back to main and modify the same file differently
      await git.checkout('main');
      await fs.writeFile(path.join(tempDir, 'conflict.txt'), 'main content');
      await git.add('conflict.txt');
      await git.commit('Modify in main');

      // Attempt merge to create conflict
      await git.merge(['feature-branch']).catch(() => {
        // Merge conflict is expected
      });

      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('conflict.txt');
      expect(result.llmContent).toContain('Conflicted files');
      expect(result.returnDisplay).toContain('conflicted');
    });

    it('should show conflicted files count in returnDisplay', async () => {
      // Create a merge conflict scenario
      const git = simpleGit(tempDir);

      // Create a file and commit it
      await fs.writeFile(
        path.join(tempDir, 'conflict.txt'),
        'original content',
      );
      await git.add('conflict.txt');
      await git.commit('Add conflict.txt');

      // Create a branch and modify the file
      await git.checkoutLocalBranch('feature-branch');
      await fs.writeFile(path.join(tempDir, 'conflict.txt'), 'feature content');
      await git.add('conflict.txt');
      await git.commit('Modify in feature branch');

      // Switch back to main and modify the same file differently
      await git.checkout('main');
      await fs.writeFile(path.join(tempDir, 'conflict.txt'), 'main content');
      await git.add('conflict.txt');
      await git.commit('Modify in main');

      // Attempt merge to create conflict
      await git.merge(['feature-branch']).catch(() => {
        // Merge conflict is expected
      });

      const params: GitStatusToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.returnDisplay).toMatch(/\d+ conflicted/);
    });
  });
});
