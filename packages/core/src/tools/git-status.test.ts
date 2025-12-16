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
  });
});
