/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { isNodeError } from '../utils/errors.js';
import { isGitRepository } from '../utils/gitUtils.js';
import { exec } from 'node:child_process';
import { simpleGit, SimpleGit, CheckRepoActions } from 'simple-git';

export class GitService {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  private getHistoryDir(): string {
    const hash = crypto
      .createHash('sha256')
      .update(this.projectRoot)
      .digest('hex');
    return path.join(os.homedir(), '.gemini', 'history', hash);
  }

  async initialize(): Promise<void> {
    if (!isGitRepository(this.projectRoot)) {
      throw new Error('GitService requires a Git repository');
    }
    const gitAvailable = await this.verifyGitAvailability();
    if (!gitAvailable) {
      throw new Error('GitService requires Git to be installed');
    }
    this.setupShadowGitRepository();
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
  async setupShadowGitRepository() {
    const repoDir = this.getHistoryDir();

    await fs.mkdir(repoDir, { recursive: true });
    const isRepoDefined = await simpleGit(repoDir).checkIsRepo(
      CheckRepoActions.IS_REPO_ROOT,
    );

    if (!isRepoDefined) {
      await simpleGit(repoDir).init(false, {
        '--initial-branch': 'main',
      });

      const repo = simpleGit(repoDir);
      await repo.commit('Initial commit', { '--allow-empty': null });
    }

    const userGitIgnorePath = path.join(this.projectRoot, '.gitignore');
    const shadowGitIgnorePath = path.join(repoDir, '.gitignore');

    let userGitIgnoreContent = '';
    try {
      userGitIgnoreContent = await fs.readFile(userGitIgnorePath, 'utf-8');
    } catch (error) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.writeFile(shadowGitIgnorePath, userGitIgnoreContent);
  }

  private get shadowGitRepository(): SimpleGit {
    const repoDir = this.getHistoryDir();
    return simpleGit(this.projectRoot).env({
      GIT_DIR: path.join(repoDir, '.git'),
      GIT_WORK_TREE: this.projectRoot,
    });
  }

  async getCurrentCommitHash(): Promise<string> {
    const hash = await this.shadowGitRepository.raw('rev-parse', 'HEAD');
    return hash.trim();
  }

  async createFileSnapshot(message: string): Promise<string> {
    const repo = this.shadowGitRepository;
    await repo.add('.');
    const commitResult = await repo.commit(message);
    return commitResult.commit;
  }

  async restoreProjectFromSnapshot(commitHash: string): Promise<void> {
    const repo = this.shadowGitRepository;
    await repo.raw(['restore', '--source', commitHash, '.']);
    // Removes any untracked files that were introduced post snapshot.
    await repo.clean('f', ['-d']);
  }
}
