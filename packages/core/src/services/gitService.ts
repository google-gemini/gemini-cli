/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isNodeError } from '../utils/errors.js';
import { isGitRepository } from '../utils/gitUtils.js';
import { exec } from 'node:child_process';
import { simpleGit, SimpleGit, CheckRepoActions } from 'simple-git';

export const historyDirName = '.gemini_cli_history';

export class GitService {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  async initialize(): Promise<void> {
    if (!isGitRepository(this.projectRoot)) {
      throw new Error('GitService requires a Git repository');
    }
    const gitAvailable = await this.verifyGitAvailability();
    if (!gitAvailable) {
      throw new Error('GitService requires Git to be installed');
    }
    this.setupHiddenGitRepository();
  }

  verifyGitAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('git --version', (error) => {
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Creates a hidden git repository in the project root.
   * The Git repository is used to support checkpointing.
   */
  async setupHiddenGitRepository() {
    const historyDir = path.join(this.projectRoot, historyDirName);
    const repoDir = path.join(historyDir, 'repository');

    await fs.mkdir(repoDir, { recursive: true });
    const repoInstance: SimpleGit = simpleGit(repoDir);
    const isRepoDefined = await repoInstance.checkIsRepo(
      CheckRepoActions.IS_REPO_ROOT,
    );
    if (!isRepoDefined) {
      await repoInstance.init();
      try {
        await repoInstance.raw([
          'worktree',
          'add',
          this.projectRoot,
          '--force',
        ]);
      } catch (error) {
        console.log('Failed to add worktree:', error);
      }
    }

    const visibileGitIgnorePath = path.join(this.projectRoot, '.gitignore');
    const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');

    let visibileGitIgnoreContent = ``;
    try {
      visibileGitIgnoreContent = await fs.readFile(
        visibileGitIgnorePath,
        'utf-8',
      );
    } catch (error) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.writeFile(hiddenGitIgnorePath, visibileGitIgnoreContent);

    if (!visibileGitIgnoreContent.includes(historyDirName)) {
      const updatedContent = `${visibileGitIgnoreContent}\n# Gemini CLI history directory\n${historyDirName}\n`;
      await fs.writeFile(visibileGitIgnorePath, updatedContent);
    }

    const commit = await repoInstance.raw([
      'rev-list',
      '--all',
      '--max-count=1',
    ]);
    if (!commit) {
      await repoInstance.add(hiddenGitIgnorePath);

      await repoInstance.commit('Initial commit');
    }
  }

  private get hiddenGitRepository(): SimpleGit {
    const historyDir = path.join(this.projectRoot, historyDirName);
    const repoDir = path.join(historyDir, 'repository');
    return simpleGit(this.projectRoot).env({
      GIT_DIR: path.join(repoDir, '.git'),
      GIT_WORK_TREE: this.projectRoot,
    });
  }

  async getCurrentCommitHash(): Promise<string> {
    const hash = await this.hiddenGitRepository.raw('rev-parse', 'HEAD');
    return hash.trim();
  }

  async createFileSnapshot(message: string): Promise<string> {
    const repo = this.hiddenGitRepository;
    await repo.add('.');
    const commitResult = await repo.commit(message);
    return commitResult.commit;
  }

  async restoreProjectFromSnapshot(commitHash: string): Promise<void> {
    const repo = this.hiddenGitRepository;
    await repo.raw(['restore', '--source', commitHash, '.']);
  }
}
