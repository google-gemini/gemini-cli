/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitIgnoreParser, GitIgnoreFilter } from '../utils/gitIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'path';

export interface FileDiscoveryOptions {
  respectGitIgnore?: boolean;
  includeBuildArtifacts?: boolean;
  isGitRepo?: boolean;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  async initialize(options: FileDiscoveryOptions = {}): Promise<void> {
    const isGitRepo = options.isGitRepo ?? isGitRepository(this.projectRoot);

    if (options.respectGitIgnore !== false && isGitRepo) {
      const parser = new GitIgnoreParser(this.projectRoot);
      await parser.initialize();
      this.gitIgnoreFilter = parser;
    }
  }

  /**
   * Filters a list of file paths based on git ignore rules
   */
  filterFiles(
    filePaths: string[],
    options: FileDiscoveryOptions = {},
  ): string[] {
    return filePaths.filter((filePath) => {
      // Always respect git ignore unless explicitly disabled
      if (options.respectGitIgnore !== false && this.gitIgnoreFilter) {
        if (this.gitIgnoreFilter.isIgnored(filePath)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Checks if a single file should be ignored
   */
  shouldIgnoreFile(
    filePath: string,
    options: FileDiscoveryOptions = {},
  ): boolean {
    const isGitRepo = options.isGitRepo ?? isGitRepository(this.projectRoot);
    if (
      options.respectGitIgnore !== false &&
      isGitRepo &&
      this.gitIgnoreFilter
    ) {
      return this.gitIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * Returns whether the project is a git repository
   */
  isGitRepository(options: FileDiscoveryOptions = {}): boolean {
    return options.isGitRepo ?? isGitRepository(this.projectRoot);
  }
}
