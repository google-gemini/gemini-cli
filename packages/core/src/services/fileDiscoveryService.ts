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
import { isSubpath, resolveToRealPath } from '../utils/paths.js';
import fs from 'node:fs';
import * as path from 'node:path';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
  customIgnoreFilePaths?: string[];
  isSymbolicLink?: boolean;
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
  private _realProjectRoot?: string;

  private get realProjectRoot(): string {
    if (!this._realProjectRoot) {
      try {
        this._realProjectRoot = resolveToRealPath(this.projectRoot);
      } catch {
        this._realProjectRoot = this.projectRoot;
      }
    }
    return this._realProjectRoot;
  }

  // Bounded cache to avoid unbounded memory growth.
  // Simple FIFO eviction when size exceeds MAX_CACHE_SIZE.
  // Key format: `${filePath}|${isDirectory ? 'dir' : 'file'}|${respectGitIgnore}|${respectGeminiIgnore}`
  private ignoreCache = new Map<string, boolean>();
  private static readonly MAX_CACHE_SIZE = 5000;

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

    this.ignoreCache.clear();
  }

  /**
   * Returns all absolute paths (files and directories) within the project root that should be ignored.
   */
  async getIgnoredPaths(options: FilterFilesOptions = {}): Promise<string[]> {
    const ignoredPaths: string[] = [];

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
          debugLogger.debug(
            `Skipping directory ${currentDir} due to ${error.code}`,
          );
          return;
        }
        throw error;
      }

      await Promise.all(
        dirEntries.map(async (entry) => {
          const fullPath = path.join(currentDir, entry.name);
          const entryOptions: FilterFilesOptions = {
            ...options,
            isSymbolicLink: entry.isSymbolicLink(),
          };

          if (entry.isDirectory()) {
<<<<<<< HEAD
            // Optimization: If a directory is ignored, its contents are not traversed.
            if (this.shouldIgnoreDirectory(fullPath, entryOptions)) {
=======
            if (this.shouldIgnoreDirectory(fullPath, options)) {
>>>>>>> 8882d408d (perf(fileDiscovery): add bounded caching and subtree pruning)
              ignoredPaths.push(fullPath);
            } else {
              await walk(fullPath);
            }
          } else {
            if (this.shouldIgnoreFile(fullPath, entryOptions)) {
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

  filterFiles(filePaths: string[], options: FilterFilesOptions = {}): string[] {
    return filePaths.filter((filePath) => {
      const isDir = filePath.endsWith('/') || filePath.endsWith('\\');
      return !this._shouldIgnore(filePath, isDir, options);
    });
  }

  filterFilesWithReport(
    filePaths: string[],
    opts: FilterFilesOptions = {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
  ): FilterReport {
    const filteredPaths = this.filterFiles(filePaths, opts);
    const ignoredCount = filePaths.length - filteredPaths.length;
    return { filteredPaths, ignoredCount };
  }

  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    return this._shouldIgnore(filePath, false, options);
  }

  shouldIgnoreDirectory(
    dirPath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    return this._shouldIgnore(dirPath, true, options);
  }

<<<<<<< HEAD
  private _checkIgnoreFilters(
=======
  clearIgnoreCache(): void {
    this.ignoreCache.clear();
  }

  private _shouldIgnore(
>>>>>>> 8882d408d (perf(fileDiscovery): add bounded caching and subtree pruning)
    filePath: string,
    isDirectory: boolean,
    options: FilterFilesOptions = {},
  ): boolean {
    const {
      respectGitIgnore = this.defaultFilterFileOptions.respectGitIgnore,
      respectGeminiIgnore = this.defaultFilterFileOptions.respectGeminiIgnore,
    } = options;

    const cacheKey = `${filePath}|${isDirectory ? 'dir' : 'file'}|${respectGitIgnore}|${respectGeminiIgnore}`;

    const cached = this.ignoreCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let result = false;
    if (respectGitIgnore && respectGeminiIgnore && this.combinedIgnoreFilter) {
      result = this.combinedIgnoreFilter.isIgnored(filePath, isDirectory);
    } else {
      if (this.customIgnoreFilter?.isIgnored(filePath, isDirectory)) {
        result = true;
      } else if (
        respectGitIgnore &&
        this.gitIgnoreFilter?.isIgnored(filePath, isDirectory)
      ) {
        result = true;
      } else if (
        respectGeminiIgnore &&
        this.geminiIgnoreFilter?.isIgnored(filePath, isDirectory)
      ) {
        result = true;
      }
    }

    // Bound cache size: evict oldest entry when full
    if (this.ignoreCache.size >= FileDiscoveryService.MAX_CACHE_SIZE) {
      const firstKey = this.ignoreCache.keys().next().value;
      if (firstKey !== undefined) {
        this.ignoreCache.delete(firstKey);
      }
    }
    this.ignoreCache.set(cacheKey, result);
    return result;
  }

<<<<<<< HEAD
  /**
   * Internal unified check for paths.
   */
  private _shouldIgnore(
    filePath: string,
    isDirectory: boolean,
    options: FilterFilesOptions = {},
  ): boolean {
    if (this._checkIgnoreFilters(filePath, isDirectory, options)) {
      return true;
    }

    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(this.projectRoot, filePath);

      const isSymlink =
        options.isSymbolicLink ??
        fs
          .lstatSync(absolutePath, { throwIfNoEntry: false })
          ?.isSymbolicLink() ??
        false;

      if (isSymlink) {
        const realPath = resolveToRealPath(absolutePath);
        if (!isSubpath(this.realProjectRoot, realPath)) {
          return true;
        }
        let targetIsDir = isDirectory;
        try {
          targetIsDir = fs.statSync(realPath).isDirectory();
        } catch {
          // Fallback to original isDirectory status if target is inaccessible
        }
        if (this._checkIgnoreFilters(realPath, targetIsDir, options)) {
          return true;
        }
      }
    } catch {
      // Gracefully handle resolution errors or inaccessible paths
    }

    return false;
  }

  /**
   * Returns the list of ignore files being used (e.g. .geminiignore) excluding .gitignore.
   */
=======
>>>>>>> 8882d408d (perf(fileDiscovery): add bounded caching and subtree pruning)
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

  getAllIgnoreFilePaths(): string[] {
    const paths: string[] = [];
    if (
      this.gitIgnoreFilter &&
      this.defaultFilterFileOptions.respectGitIgnore
    ) {
      const gitIgnorePath = path.join(this.projectRoot, '.gitignore');
      const stat = fs.statSync(gitIgnorePath, { throwIfNoEntry: false });
      if (stat?.isFile()) {
        paths.push(gitIgnorePath);
      }
    }
    return paths.concat(this.getIgnoreFilePaths());
  }
}
