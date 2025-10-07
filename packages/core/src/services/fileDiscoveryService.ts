/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitIgnoreFilter } from '../utils/gitIgnoreParser.js';
import type { GeminiIgnoreFilter } from '../utils/geminiIgnoreParser.js';
import { GitIgnoreParser } from '../utils/gitIgnoreParser.js';
import { GeminiIgnoreParser } from '../utils/geminiIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'node:path';
import ignore, { type Ignore } from 'ignore';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
}

export interface FilterReport {
  filteredPaths: string[];
  gitIgnoredCount: number;
  geminiIgnoredCount: number;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private geminiIgnoreFilter: GeminiIgnoreFilter | null = null;
  private unifiedIgnore: Ignore | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    // Merge patterns from both .gitignore and .geminiignore
    const patterns: string[] = [];
    if (isGitRepository(this.projectRoot)) {
      this.gitIgnoreFilter = new GitIgnoreParser(this.projectRoot);
      patterns.push(...this.gitIgnoreFilter.getPatterns());
    }
    this.geminiIgnoreFilter = new GeminiIgnoreParser(this.projectRoot);
    patterns.push(...this.geminiIgnoreFilter.getPatterns());
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
    return filePaths.filter(
      (filePath) => !this.shouldIgnoreFile(filePath, options),
    );
  }

  /**
   * Filters a list of file paths based on git ignore rules and returns a report
   * with counts of ignored files.
   */
  filterFilesWithReport(
    filePaths: string[],
    opts: FilterFilesOptions = {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
  ): FilterReport {
    const filteredPaths: string[] = [];
    let gitIgnoredCount = 0;
    let geminiIgnoredCount = 0;

    for (const filePath of filePaths) {
      if (opts.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
        gitIgnoredCount++;
        continue;
      }

      if (opts.respectGeminiIgnore && this.shouldGeminiIgnoreFile(filePath)) {
        geminiIgnoredCount++;
        continue;
      }

      filteredPaths.push(filePath);
    }

    return {
      filteredPaths,
      gitIgnoredCount,
      geminiIgnoredCount,
    };
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
