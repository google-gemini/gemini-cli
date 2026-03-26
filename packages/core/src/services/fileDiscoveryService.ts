/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GitIgnoreParser,
  type GitIgnoreFilter,
} from '../utils/gitIgnoreParser.js';
import {
  IgnoreFileParser,
  type IgnoreFileFilter,
} from '../utils/ignoreFileParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import { GEMINI_IGNORE_FILE_NAME } from '../config/constants.js';
import { isNodeError } from '../utils/errors.js';
import { debugLogger } from '../utils/debugLogger.js';
import fs from 'node:fs';
import * as path from 'node:path';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
  customIgnoreFilePaths?: string[];
}

export interface FilterReport {
  filteredPaths: string[];
  ignoredCount: number;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private geminiIgnoreFilter: IgnoreFileFilter | null = null;
  private customIgnoreFilter: IgnoreFileFilter | null = null;
  private combinedIgnoreFilter: GitIgnoreFilter | IgnoreFileFilter | null =
    null;
  private defaultFilterFileOptions: FilterFilesOptions = {
    respectGitIgnore: true,
    respectGeminiIgnore: true,
    customIgnoreFilePaths: [],
  };
  private projectRoot: string;

  constructor(projectRoot: string, options?: FilterFilesOptions) {
    this.projectRoot = path.resolve(projectRoot);
    this.applyFilterFilesOptions(options);
    if (isGitRepository(this.projectRoot)) {
      this.gitIgnoreFilter = new GitIgnoreParser(this.projectRoot);
    }
    this.geminiIgnoreFilter = new IgnoreFileParser(
      this.projectRoot,
      GEMINI_IGNORE_FILE_NAME,
    );
    if (this.defaultFilterFileOptions.customIgnoreFilePaths?.length) {
      this.customIgnoreFilter = new IgnoreFileParser(
        this.projectRoot,
        this.defaultFilterFileOptions.customIgnoreFilePaths,
      );
    }

    if (this.gitIgnoreFilter) {
      const geminiPatterns = this.geminiIgnoreFilter.getPatterns();
      const customPatterns = this.customIgnoreFilter
        ? this.customIgnoreFilter.getPatterns()
        : [];
      // Create combined parser: .gitignore + .geminiignore + custom ignore
      this.combinedIgnoreFilter = new GitIgnoreParser(
        this.projectRoot,
        // customPatterns should go the last to ensure overwriting of geminiPatterns
        [...geminiPatterns, ...customPatterns],
      );
    } else {
      // Create combined parser when not git repo
      const geminiPatterns = this.geminiIgnoreFilter.getPatterns();
      const customPatterns = this.customIgnoreFilter
        ? this.customIgnoreFilter.getPatterns()
        : [];
      this.combinedIgnoreFilter = new IgnoreFileParser(
        this.projectRoot,
        [...geminiPatterns, ...customPatterns],
        true,
      );
    }
  }

  /**
   * Returns all absolute paths (files and directories) within the project root that should be ignored.
   */
  async getIgnoredPaths(options: FilterFilesOptions = {}): Promise<string[]> {
    const ignoredPaths: string[] = [];

    /**
     * Recursively walks the directory tree to find ignored paths.
     */
    const walk = async (currentDir: string) => {
      let dirEntries: fs.Dirent[];
      try {
        dirEntries = await fs.promises.readdir(currentDir, {
          withFileTypes: true,
        });
      } catch (error: unknown) {
        if (
          isNodeError(error) &&
          (error.code === 'EACCES' || error.code === 'ENOENT')
        ) {
          // Stop if the directory is inaccessible or doesn't exist
          debugLogger.debug(
            `Skipping directory ${currentDir} due to ${error.code}`,
          );
          return;
        }
        throw error;
      }

      // Traverse sibling directories concurrently to improve performance.
      await Promise.all(
        dirEntries.map(async (entry) => {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            // Optimization: If a directory is ignored, its contents are not traversed.
            if (this.shouldIgnoreDirectory(fullPath, options)) {
              ignoredPaths.push(fullPath);
            } else {
              await walk(fullPath);
            }
          } else {
            if (this.shouldIgnoreFile(fullPath, options)) {
              ignoredPaths.push(fullPath);
            }
          }
        }),
      );
    };

    await walk(this.projectRoot);
    return ignoredPaths;
  }

  private applyFilterFilesOptions(options?: FilterFilesOptions): void {
    if (!options) return;

    if (options.respectGitIgnore !== undefined) {
      this.defaultFilterFileOptions.respectGitIgnore = options.respectGitIgnore;
    }
    if (options.respectGeminiIgnore !== undefined) {
      this.defaultFilterFileOptions.respectGeminiIgnore =
        options.respectGeminiIgnore;
    }
    if (options.customIgnoreFilePaths) {
      this.defaultFilterFileOptions.customIgnoreFilePaths =
        options.customIgnoreFilePaths;
    }
  }

  /**
   * Filters a list of file paths based on ignore rules.
   *
   * NOTE: Directory paths must include a trailing slash to be correctly identified and
   * matched against directory-specific ignore patterns (e.g., 'dist/').
   */
  filterFiles(filePaths: string[], options: FilterFilesOptions = {}): string[] {
    return filePaths.filter((filePath) => {
      // Infer directory status from the string format
      const isDir = filePath.endsWith('/') || filePath.endsWith('\\');
      return !this._shouldIgnore(filePath, isDir, options);
    });
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
    const filteredPaths = this.filterFiles(filePaths, opts);
    const ignoredCount = filePaths.length - filteredPaths.length;

    return {
      filteredPaths,
      ignoredCount,
    };
  }

  /**
   * Checks if a specific file should be ignored based on project ignore rules.
   */
  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    return this._shouldIgnore(filePath, false, options);
  }

  /**
   * Checks if a specific directory should be ignored based on project ignore rules.
   */
  shouldIgnoreDirectory(
    dirPath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    return this._shouldIgnore(dirPath, true, options);
  }

  /**
   * Internal unified check for paths.
   */
  private _shouldIgnore(
    filePath: string,
    isDirectory: boolean,
    options: FilterFilesOptions = {},
  ): boolean {
    const {
      respectGitIgnore = this.defaultFilterFileOptions.respectGitIgnore,
      respectGeminiIgnore = this.defaultFilterFileOptions.respectGeminiIgnore,
    } = options;

    if (respectGitIgnore && respectGeminiIgnore && this.combinedIgnoreFilter) {
      return this.combinedIgnoreFilter.isIgnored(filePath, isDirectory);
    }

    if (this.customIgnoreFilter?.isIgnored(filePath, isDirectory)) {
      return true;
    }

    if (
      respectGitIgnore &&
      this.gitIgnoreFilter?.isIgnored(filePath, isDirectory)
    ) {
      return true;
    }

    if (
      respectGeminiIgnore &&
      this.geminiIgnoreFilter?.isIgnored(filePath, isDirectory)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Returns the list of ignore files being used (e.g. .geminiignore) excluding .gitignore.
   */
  getIgnoreFilePaths(): string[] {
    const paths: string[] = [];
    if (
      this.geminiIgnoreFilter &&
      this.defaultFilterFileOptions.respectGeminiIgnore
    ) {
      paths.push(...this.geminiIgnoreFilter.getIgnoreFilePaths());
    }
    if (this.customIgnoreFilter) {
      paths.push(...this.customIgnoreFilter.getIgnoreFilePaths());
    }
    return paths;
  }

  /**
   * Returns all ignore files including .gitignore if applicable.
   */
  getAllIgnoreFilePaths(): string[] {
    const paths: string[] = [];
    if (
      this.gitIgnoreFilter &&
      this.defaultFilterFileOptions.respectGitIgnore
    ) {
      const gitIgnorePath = path.join(this.projectRoot, '.gitignore');
      if (fs.existsSync(gitIgnorePath)) {
        paths.push(gitIgnorePath);
      }
    }
    return paths.concat(this.getIgnoreFilePaths());
  }
}
