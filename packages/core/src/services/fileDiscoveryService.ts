// ...existing code...
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
    const gParserLegacy = new GitIgnoreParser(this.projectRoot);
    try {
      gParserLegacy.loadPatterns(GEMINI_IGNORE_FILE_NAME);
      patterns.push(...gParserLegacy.getPatterns());
    } catch (_error) {
      // ignore file not found
    }
    this.geminiIgnoreFilter = gParserLegacy;
    // Ensure all negative patterns from .geminiignore are appended last
    const geminiNegatives = (this.geminiIgnoreFilter?.getPatterns() ?? []).filter(p => p.startsWith('!'));
    if (geminiNegatives.length > 0) {
      patterns.push(...geminiNegatives);
    }
    this.unifiedIgnore = ignore();
    this.unifiedIgnore.add(patterns);
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
    // If both are respected, use unified ignore
    if (options.respectGitIgnore && options.respectGeminiIgnore) {
      return filePaths.filter((filePath) => {
        const resolved = path.resolve(this.projectRoot, filePath);
        const relativePath = path.relative(this.projectRoot, resolved).replace(/\\/g, '/');
        return !this.unifiedIgnore!.ignores(relativePath);
      });
    }
    // If only gitignore is respected
    if (options.respectGitIgnore && !options.respectGeminiIgnore) {
      return filePaths.filter((filePath) => !this.shouldGitIgnoreFile(filePath));
    }
    // If only geminiignore is respected
    if (!options.respectGitIgnore && options.respectGeminiIgnore) {
      return filePaths.filter((filePath) => !this.shouldGeminiIgnoreFile(filePath));
    }
    // If neither is respected
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
      if (!this.unifiedIgnore) return false;
      const resolved = path.resolve(this.projectRoot, filePath);
      const relativePath = path.relative(this.projectRoot, resolved).replace(/\\/g, '/');
      return this.unifiedIgnore.ignores(relativePath);
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
