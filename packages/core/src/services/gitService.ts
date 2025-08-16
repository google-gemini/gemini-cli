/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { isNodeError } from '../utils/errors.js';
import { exec } from 'node:child_process';
import {
  simpleGit,
  SimpleGit,
  CheckRepoActions,
  SimpleGitOptions,
} from 'simple-git';
import { getProjectHash, GEMINI_DIR } from '../utils/paths.js';

// We don't want to inherit the user's name, email, or gpg signing
// preferences for the shadow repository, so we pass this config explicitly.
const GIT_CONFIG = [
  'user.name=Gemini CLI',
  'user.email=gemini-cli@google.com',
  'commit.gpgsign=false',
];

// A factory for creating SimpleGit instances.
// This is useful for mocking in tests.
type GitFactory = (options?: Partial<SimpleGitOptions>) => SimpleGit;

export class GitService {
  private projectRoot: string;
  private gitFactory: GitFactory;

  constructor(
    projectRoot: string,
    gitFactory: GitFactory = simpleGit as unknown as GitFactory,
  ) {
    this.projectRoot = path.resolve(projectRoot);
    this.gitFactory = gitFactory;
  }

  private getHistoryDir(): string {
    const hash = getProjectHash(this.projectRoot);
    return path.join(os.homedir(), GEMINI_DIR, 'history', hash);
  }

  async initialize(): Promise<void> {
    const gitAvailable = await this.verifyGitAvailability();
    if (!gitAvailable) {
      throw new Error(
        'Checkpointing is enabled, but Git is not installed. Please install Git or disable checkpointing to continue.',
      );
    }
    await this.setupShadowGitRepository();
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

    const options: Partial<SimpleGitOptions> = {
      baseDir: repoDir,
      binary: 'git',
      maxConcurrentProcesses: 6,
      config: GIT_CONFIG,
    };

    const repo = this.gitFactory(options);
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
      if (!(isNodeError(error) && error.code === 'ENOENT')) {
        throw error;
      }
    }

    await fs.writeFile(shadowGitIgnorePath, userGitIgnoreContent);
  }

  private get shadowGitRepository(): SimpleGit {
    const repoDir = this.getHistoryDir();
    const options: Partial<SimpleGitOptions> = {
      baseDir: this.projectRoot,
      binary: 'git',
      maxConcurrentProcesses: 6,
      config: GIT_CONFIG,
    };

    return this.gitFactory(options).env({
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
