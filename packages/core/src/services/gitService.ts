/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isNodeError } from '../utils/errors.js';
import { exec } from 'node:child_process';
import { simpleGit, SimpleGit, CheckRepoActions } from 'simple-git';
import { Storage } from '../config/storage.js';

export class GitService {
  private projectRoot: string;
  private storage: Storage;

  constructor(projectRoot: string, storage: Storage) {
    this.projectRoot = path.resolve(projectRoot);
    this.storage = storage;
  }

  private getHistoryDir(): string {
    return this.storage.getHistoryDir();
  }

  async initialize(): Promise<void> {
    const gitAvailable = await this.verifyGitAvailability();
    if (!gitAvailable) {
      throw new Error(
        'Checkpointing is enabled, but Git is not installed. Please install Git or disable checkpointing to continue.',
      );
    }
    try {
      await this.setupShadowGitRepository();
    } catch (error) {
      throw new Error(
        `Failed to initialize checkpointing: ${error instanceof Error ? error.message : 'Unknown error'}. Please check that Git is working properly or disable checkpointing.`,
      );
    }
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
    const gitConfigPath = path.join(repoDir, '.gitconfig');

    await fs.mkdir(repoDir, { recursive: true });

    // We don't want to inherit the user's name, email, or gpg signing
    // preferences for the shadow repository, so we create a dedicated gitconfig.
    const gitConfigContent =
      '[user]\n  name = Gemini CLI\n  email = gemini-cli@google.com\n[commit]\n  gpgsign = false\n';
    await fs.writeFile(gitConfigPath, gitConfigContent);

    const repo = simpleGit(repoDir);
    const isRepoDefined = await repo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);

    if (!isRepoDefined) {
      await repo.init(false, {
        '--initial-branch': 'main',
      });

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
      // Prevent git from using the user's global git config.
      HOME: repoDir,
      XDG_CONFIG_HOME: repoDir,
    });
  }

  async getCurrentCommitHash(): Promise<string> {
    const hash = await this.shadowGitRepository.raw('rev-parse', 'HEAD');
    return hash.trim();
  }

  async createFileSnapshot(message: string): Promise<string> {
    try {
      const repo = this.shadowGitRepository;
      await repo.add('.');
      const commitResult = await repo.commit(message);
      return commitResult.commit;
    } catch (error) {
      throw new Error(
        `Failed to create checkpoint snapshot: ${error instanceof Error ? error.message : 'Unknown error'}. Checkpointing may not be working properly.`,
      );
    }
  }

  async restoreProjectFromSnapshot(commitHash: string): Promise<void> {
    const repo = this.shadowGitRepository;
    await repo.raw(['restore', '--source', commitHash, '.']);
    // Removes any untracked files that were introduced post snapshot.
    await repo.clean('f', ['-d']);
  }
}
