/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createIgnoreFileType,
  IgnoreFileManager,
  type IgnoreFileType,
} from '../utils/ignore-file-manager.js';

import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'node:path';

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
  private isGitRepository: boolean = false;

  private projectRoot: string;
  private managerCache: Map<string, IgnoreFileManager> = new Map();
  private allIgnoreFileTypes: IgnoreFileType[];

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.isGitRepository = isGitRepository(this.projectRoot);

    this.allIgnoreFileTypes = [
      createIgnoreFileType({
        name: '.gitignore',
        precedence: 10,
        staticGlobalRules: ['.git'],
        globalRuleFilePaths: this.isGitRepository ? ['.git/info/exclude'] : [],
      }),
      createIgnoreFileType({ name: '.geminiignore', precedence: 20 }),
    ];
  }

  /**
   * Returns an IgnoreFileManager configured based on the provided options.
   * Uses a cache to avoid recreating managers for the same options.
   *
   * @param options - The filtering options.
   * @returns The configured IgnoreFileManager.
   */
  private getIgnoreManagerForOptions(
    options: FilterFilesOptions,
  ): IgnoreFileManager {
    // Create a stable cache key from the options
    const cacheKey = `git:${options.respectGitIgnore ?? true}|gemini:${
      options.respectGeminiIgnore ?? true
    }`;

    if (this.managerCache.has(cacheKey)) {
      return this.managerCache.get(cacheKey)!;
    }

    // If not cached, determine which rule sets are active
    let activeIgnoreTypes = this.allIgnoreFileTypes;
    if (!options.respectGitIgnore) {
      activeIgnoreTypes = activeIgnoreTypes.filter(
        (type) => type.name !== '.gitignore',
      );
    }
    if (!options.respectGeminiIgnore) {
      activeIgnoreTypes = activeIgnoreTypes.filter(
        (type) => type.name !== '.geminiignore',
      );
    }

    // Create and cache a new manager for this specific configuration
    const manager = new IgnoreFileManager(this.projectRoot, activeIgnoreTypes);
    this.managerCache.set(cacheKey, manager);
    return manager;
  }

  /**
   * Filters a list of file paths based on the provided options.
   *
   * @param filePaths - The list of file paths to filter.
   * @param opts - The filtering options.
   * @param onIgnoredFile - A callback function to be called for each ignored file.
   * @returns The list of filtered file paths.
   */
  private filterFilesInternal(
    filePaths: string[],
    opts: FilterFilesOptions,
    onIgnoredFile: (absolutePath: string) => void,
  ): string[] {
    const manager = this.getIgnoreManagerForOptions(opts);

    return filePaths.filter((filePath) => {
      const absoluteFilePath = path.resolve(this.projectRoot, filePath);
      const relativePath = path.relative(this.projectRoot, absoluteFilePath);

      // We skip paths that are outside the project root.
      if (relativePath === '' || relativePath.startsWith('..')) {
        return true;
      }

      // Now we have a safe, relative path to check.
      const isIgnored = manager.isIgnored(absoluteFilePath);
      if (isIgnored) {
        onIgnoredFile(absoluteFilePath);
      }
      return !isIgnored;
    });
  }

  filterFilesWithReport(
    filePaths: string[],
    opts: FilterFilesOptions = {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
  ): FilterReport {
    const manager = this.getIgnoreManagerForOptions(opts);
    let gitIgnoredCount = 0;
    let geminiIgnoredCount = 0;
    const filteredPaths = this.filterFilesInternal(
      filePaths,
      opts,
      (absoluteFilePath) => {
        if (
          opts.respectGitIgnore &&
          manager.isIgnoredBy(absoluteFilePath, '.gitignore')
        ) {
          gitIgnoredCount++;
        } else if (opts.respectGeminiIgnore) {
          geminiIgnoredCount++;
        }
      },
    );

    return {
      filteredPaths,
      gitIgnoredCount,
      geminiIgnoredCount,
    };
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
    return this.filterFilesInternal(filePaths, options, () => {});
  }

  /**
   * Checks if a single file should be git-ignored
   */
  shouldGitIgnoreFile(filePath: string): boolean {
    return (
      this.isGitRepository &&
      this.shouldIgnoreFile(filePath, {
        respectGitIgnore: true,
        respectGeminiIgnore: false,
      })
    );
  }

  /**
   * Checks if a single file should be gemini-ignored
   */
  shouldGeminiIgnoreFile(filePath: string): boolean {
    return this.shouldIgnoreFile(filePath, {
      respectGitIgnore: false,
      respectGeminiIgnore: true,
    });
  }

  /**
   * Unified method to check if a file should be ignored based on filtering options
   */
  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
  ): boolean {
    const filtered = this.filterFiles([filePath], options);
    return filtered.length === 0;
  }

  /**
   * Returns loaded patterns from .geminiignore
   */
  getGeminiIgnorePatterns(): string[] {
    const manager = this.getIgnoreManagerForOptions({
      respectGeminiIgnore: true,
      respectGitIgnore: false,
    });
    return [...manager.getRootPatterns('.geminiignore')];
  }
}
