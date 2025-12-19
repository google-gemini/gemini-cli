/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { GitDiffTool, type GitDiffToolParams } from './git-diff.js';
import type { Config } from '../config/config.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { simpleGit } from 'simple-git';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('GitDiffTool', () => {
  let tempDir: string;
  let config: Config;
  let tool: GitDiffTool;

  beforeEach(async () => {
    // Create a temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-diff-test-'));

    config = makeFakeConfig({
      targetDir: tempDir,
      cwd: tempDir,
    });

    tool = new GitDiffTool(config);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('when not in a Git repository', () => {
    it('should return an error indicating not in a repo', async () => {
      const params: GitDiffToolParams = {};
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
      await fs.writeFile(
        path.join(tempDir, 'initial.txt'),
        'initial content\n',
      );
      await git.add('initial.txt');
      await git.commit('Initial commit');
    });

    it('should show no changes for a clean repo', async () => {
      const params: GitDiffToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('No changes to show');
    });

    it('should show staged changes', async () => {
      // Create and stage a new file
      await fs.writeFile(path.join(tempDir, 'staged.txt'), 'staged content\n');
      const git = simpleGit(tempDir);
      await git.add('staged.txt');

      const params: GitDiffToolParams = { staged: true };
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('staged.txt');
      expect(result.llmContent).toContain('+staged content');
    });

    it('should show unstaged changes', async () => {
      // Modify an existing file without staging
      await fs.writeFile(
        path.join(tempDir, 'initial.txt'),
        'modified content\n',
      );

      const params: GitDiffToolParams = { staged: false };
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('initial.txt');
      expect(result.llmContent).toContain('-initial content');
      expect(result.llmContent).toContain('+modified content');
    });

    it('should show all changes', async () => {
      // Create staged and unstaged changes
      await fs.writeFile(path.join(tempDir, 'staged.txt'), 'staged\n');
      await fs.writeFile(path.join(tempDir, 'initial.txt'), 'modified\n');

      const git = simpleGit(tempDir);
      await git.add('staged.txt');

      const params: GitDiffToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('staged.txt');
      expect(result.llmContent).toContain('initial.txt');
    });

    it('should limit diff to specific paths', async () => {
      // Create multiple files with changes
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1\n');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2\n');

      const git = simpleGit(tempDir);
      await git.add('.');

      const params: GitDiffToolParams = {
        staged: true,
        paths: ['file1.txt'],
      };
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('file1.txt');
      expect(result.llmContent).not.toContain('file2.txt');
    });

    it('should show deleted files', async () => {
      const git = simpleGit(tempDir);
      await fs.unlink(path.join(tempDir, 'initial.txt'));
      await git.add('initial.txt');

      const params: GitDiffToolParams = { staged: true };
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('initial.txt');
      expect(result.llmContent).toContain('deleted file mode');
    });

    it('should show files with both staged and unstaged changes', async () => {
      await fs.writeFile(path.join(tempDir, 'mixed.txt'), 'staged content\n');
      const git = simpleGit(tempDir);
      await git.add('mixed.txt');
      await fs.writeFile(
        path.join(tempDir, 'mixed.txt'),
        'staged content\nunstaged content\n',
      );

      const params: GitDiffToolParams = {};
      const signal = new AbortController().signal;

      const result = await tool.buildAndExecute(params, signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('mixed.txt');
    });
  });
});
