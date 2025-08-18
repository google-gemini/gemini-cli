/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitIgnoreParser, GitIgnoreFilter } from '../utils/gitIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'path';
import ignore, { type Ignore } from 'ignore';

const GEMINI_IGNORE_FILE_NAME = '.geminiignore';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private geminiIgnoreFilter: GitIgnoreFilter | null = null;
  private unifiedIgnore: Ignore | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    // Merge patterns from both .gitignore and .geminiignore
    const patterns: string[] = [];
    if (isGitRepository(this.projectRoot)) {
      const parser = new GitIgnoreParser(this.projectRoot);
      try {
        parser.loadGitRepoPatterns();
        patterns.push(...parser.getPatterns());
      } catch (_error) {
        // ignore file not found
      }
      this.gitIgnoreFilter = parser;
    }
    const gParser = new GitIgnoreParser(this.projectRoot);
    try {
      gParser.loadPatterns(GEMINI_IGNORE_FILE_NAME);
      patterns.push(...gParser.getPatterns());
    } catch (_error) {
      // ignore file not found
    }
    this.geminiIgnoreFilter = gParser;
    // The ignore library processes patterns in order, so negative patterns in .geminiignore will override .gitignore
    this.unifiedIgnore = ignore();
    this.unifiedIgnore.add(patterns);
  }

  /**
   * Helper to check if a file should be ignored by the unified ignore (both .gitignore and .geminiignore)
   */
  private isUnifiedIgnored(filePath: string): boolean {
    if (!this.unifiedIgnore) return false;
    const resolved = path.resolve(this.projectRoot, filePath);
    const relativePath = path.relative(this.projectRoot, resolved);
    if (relativePath === '' || relativePath.startsWith('..')) {
      return false;
    }
    const normalizedPath = relativePath.replace(/\\/g, '/');
    return this.unifiedIgnore.ignores(normalizedPath);
  }

  /**
   * Filters a list of file paths based on git ignore rules
   */
  filterFiles(
    filePaths: string[],
    options: FilterFilesOptions = {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
  ): string[] {
    if (!this.unifiedIgnore) return filePaths;
    if (options.respectGitIgnore && options.respectGeminiIgnore) {
      return filePaths.filter((filePath) => !this.isUnifiedIgnored(filePath));
    }
    if (options.respectGitIgnore && !options.respectGeminiIgnore) {
      return filePaths.filter(
        (filePath) => !this.shouldGitIgnoreFile(filePath),
      );
    }
    if (!options.respectGitIgnore && options.respectGeminiIgnore) {
      return filePaths.filter(
        (filePath) => !this.shouldGeminiIgnoreFile(filePath),
      );
    }
    return filePaths;
  }

  /**
   * Checks if a single file should be git-ignored
   */
  shouldGitIgnoreFile(filePath: string): boolean {
    if (this.gitIgnoreFilter) {
      return this.gitIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  shouldGeminiIgnoreFile(filePath: string): boolean {
    if (this.geminiIgnoreFilter) {
      return this.geminiIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    const { respectGitIgnore = true, respectGeminiIgnore = true } = options;
    if (respectGitIgnore && respectGeminiIgnore) {
      return this.isUnifiedIgnored(filePath);
    }
    if (respectGitIgnore && !respectGeminiIgnore) {
      return this.shouldGitIgnoreFile(filePath);
    }
    if (!respectGitIgnore && respectGeminiIgnore) {
      return this.shouldGeminiIgnoreFile(filePath);
    }
    return false;
  }

  /**
   * Returns loaded patterns from .geminiignore
   */
  getGeminiIgnorePatterns(): string[] {
    return this.geminiIgnoreFilter?.getPatterns() ?? [];
  }
}
