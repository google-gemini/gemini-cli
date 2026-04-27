/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import picomatch from 'picomatch';
import { loadIgnoreRules, type Ignore } from './ignore.js';
import { ResultCache } from './result-cache.js';
import { crawl } from './crawler.js';
import { AsyncFzf, type FzfResultItem } from 'fzf';
import { unescapePath } from '../paths.js';
import type { FileDiscoveryService } from '../../services/fileDiscoveryService.js';
import { FileWatcher, type FileWatcherEvent } from './fileWatcher.js';
import { debugLogger } from '../debugLogger.js';

// Tiebreaker: Prefers shorter paths.
const byLengthAsc = (a: { item: string }, b: { item: string }) =>
  a.item.length - b.item.length;

// Tiebreaker: Prefers matches at the start of the filename (basename prefix).
const byBasenamePrefix = (
  a: { item: string; positions: Set<number> },
  b: { item: string; positions: Set<number> },
) => {
  const getBasenameStart = (p: string) => {
    const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
    return Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1;
  };
  const aDiff = Math.min(...a.positions) - getBasenameStart(a.item);
  const bDiff = Math.min(...b.positions) - getBasenameStart(b.item);

  const aIsFilenameMatch = aDiff >= 0;
  const bIsFilenameMatch = bDiff >= 0;

  if (aIsFilenameMatch && !bIsFilenameMatch) return -1;
  if (!aIsFilenameMatch && bIsFilenameMatch) return 1;
  if (aIsFilenameMatch && bIsFilenameMatch) return aDiff - bDiff;

  return 0; // Both are directory matches, let subsequent tiebreakers decide.
};

// Tiebreaker: Prefers matches closer to the end of the path.
const byMatchPosFromEnd = (
  a: { item: string; positions: Set<number> },
  b: { item: string; positions: Set<number> },
) => {
  const maxPosA = Math.max(-1, ...a.positions);
  const maxPosB = Math.max(-1, ...b.positions);
  const distA = a.item.length - maxPosA;
  const distB = b.item.length - maxPosB;
  return distA - distB;
};

export interface FileSearchOptions {
  projectRoot: string;
  ignoreDirs: string[];
  fileDiscoveryService: FileDiscoveryService;
  cache: boolean;
  cacheTtl: number;
  enableFileWatcher?: boolean;
  enableRecursiveFileSearch: boolean;
  enableFuzzySearch: boolean;
  maxDepth?: number;
  maxFiles?: number;
}

export class AbortError extends Error {
  constructor(message = 'Search aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

/**
 * Filters a list of paths based on a given pattern.
 * @param allPaths The list of all paths to filter.
 * @param pattern The picomatch pattern to filter by.
 * @param signal An AbortSignal to cancel the operation.
 * @returns A promise that resolves to the filtered and sorted list of paths.
 */
export async function filter(
  allPaths: string[],
  pattern: string,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const patternFilter = picomatch(pattern, {
    dot: true,
    contains: true,
    nocase: true,
  });

  const results: string[] = [];
  for (const [i, p] of allPaths.entries()) {
    // Yield control to the event loop periodically to prevent blocking.
    if (i % 1000 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
      if (signal?.aborted) {
        throw new AbortError();
      }
    }

    if (patternFilter(p)) {
      results.push(p);
    }
  }

  results.sort((a, b) => {
    const aIsDir = a.endsWith('/');
    const bIsDir = b.endsWith('/');

    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;

    // This is 40% faster than localeCompare and the only thing we would really
    // gain from localeCompare is case-sensitive sort
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return results;
}

export interface SearchOptions {
  signal?: AbortSignal;
  maxResults?: number;
}

export interface FileSearch {
  initialize(): Promise<void>;
  search(pattern: string, options?: SearchOptions): Promise<string[]>;
  close?(): Promise<void>;
}

class RecursiveFileSearch implements FileSearch {
  private ignore: Ignore | undefined;
  private resultCache: ResultCache | undefined;
  private allFiles: Set<string> = new Set();
  private fzf: AsyncFzf<string[]> | undefined;
  private fileWatcher: FileWatcher | undefined;
  private rebuildTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: FileSearchOptions) {}

  async initialize(): Promise<void> {
    this.ignore = loadIgnoreRules(
      this.options.fileDiscoveryService,
      this.options.ignoreDirs,
    );

    this.allFiles = new Set(
      await crawl({
        crawlDirectory: this.options.projectRoot,
        cwd: this.options.projectRoot,
        ignore: this.ignore,
        cache: this.options.cache,
        cacheTtl: this.options.cacheTtl,
        maxDepth: this.options.maxDepth,
        maxFiles: this.options.maxFiles ?? 20000,
      }),
    );

    this.buildResultCache();

    if (this.options.enableFileWatcher) {
      const directoryFilter = this.ignore.getDirectoryFilter();
      this.fileWatcher = new FileWatcher(
        this.options.projectRoot,
        (event) => this.handleFileWatcherEvent(event),
        {
          shouldIgnore: (relativePath) => directoryFilter(`${relativePath}/`),
          onError(error) {
            debugLogger.error('File search watcher error: ', error);
          },
        },
      );
      this.fileWatcher.start();
    }
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }

    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = undefined;
      this.buildResultCache();
    }, 150);
  }

  private handleFileWatcherEvent(event: FileWatcherEvent): void {
    const normalizedPath = event.relativePath.replaceAll('\\', '/');
    if (!normalizedPath || normalizedPath === '.') {
      return;
    }

    const fileFilter = this.ignore?.getFileFilter();
    const directoryFilter = this.ignore?.getDirectoryFilter();

    let changed = false;
    switch (event.eventType) {
      case 'add': {
        if (
          fileFilter?.(normalizedPath) ||
          this.allFiles.size >= (this.options.maxFiles ?? 20000)
        ) {
          return;
        }
        const sizeBefore = this.allFiles.size;
        this.allFiles.add(normalizedPath);
        changed = this.allFiles.size !== sizeBefore;
        break;
      }
      case 'unlink': {
        changed = this.allFiles.delete(normalizedPath);
        break;
      }
      case 'addDir': {
        const directoryPath = normalizedPath.endsWith('/')
          ? normalizedPath
          : `${normalizedPath}/`;
        if (
          directoryFilter?.(directoryPath) ||
          this.allFiles.size >= (this.options.maxFiles ?? 20000)
        ) {
          return;
        }
        const sizeBefore = this.allFiles.size;
        this.allFiles.add(directoryPath);
        changed = this.allFiles.size !== sizeBefore;
        break;
      }
      case 'unlinkDir': {
        const directoryPath = normalizedPath.endsWith('/')
          ? normalizedPath
          : `${normalizedPath}/`;
        const toDelete: string[] = [];
        for (const file of this.allFiles) {
          if (file === directoryPath || file.startsWith(directoryPath)) {
            toDelete.push(file);
          }
        }
        changed = toDelete.length > 0;
        for (const file of toDelete) {
          this.allFiles.delete(file);
        }
        break;
      }
      default:
        return;
    }

    if (changed) {
      this.scheduleRebuild();
    }
  }

  async search(
    pattern: string,
    options: SearchOptions = {},
  ): Promise<string[]> {
    if (
      !this.resultCache ||
      (!this.fzf && this.options.enableFuzzySearch) ||
      !this.ignore
    ) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    pattern = unescapePath(pattern) || '*';

    let filteredCandidates;
    const { files: candidates, isExactMatch } =
      await this.resultCache.get(pattern);

    if (isExactMatch) {
      // Use the cached result.
      filteredCandidates = candidates;
    } else {
      let shouldCache = true;
      if (pattern.includes('*') || !this.fzf) {
        filteredCandidates = await filter(candidates, pattern, options.signal);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        filteredCandidates = await this.fzf
          .find(pattern)
          .then((results: Array<FzfResultItem<string>>) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            results.map((entry: FzfResultItem<string>) => entry.item),
          )
          .catch(() => {
            shouldCache = false;
            return [];
          });
      }

      if (shouldCache) {
        this.resultCache.set(pattern, filteredCandidates);
      }
    }

    const fileFilter = this.ignore.getFileFilter();
    const results: string[] = [];
    for (const [i, candidate] of filteredCandidates.entries()) {
      if (i % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (options.signal?.aborted) {
          throw new AbortError();
        }
      }

      if (results.length >= (options.maxResults ?? Infinity)) {
        break;
      }
      if (candidate === '.') {
        continue;
      }
      if (!fileFilter(candidate)) {
        results.push(candidate);
      }
    }
    return results;
  }

  async close(): Promise<void> {
    await this.fileWatcher?.close();
    this.fileWatcher = undefined;
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = undefined;
    }
  }

  private buildResultCache(): void {
    const allFiles = [...this.allFiles];
    this.resultCache = new ResultCache(allFiles);
    if (this.options.enableFuzzySearch) {
      // The v1 algorithm is much faster since it only looks at the first
      // occurrence of the pattern. We use it for search spaces that have >20k
      // files, because the v2 algorithm is just too slow in those cases.
      this.fzf = new AsyncFzf(allFiles, {
        fuzzy: allFiles.length > 20000 ? 'v1' : 'v2',
        forward: false,
        tiebreakers: [byBasenamePrefix, byMatchPosFromEnd, byLengthAsc],
      });
    }
  }
}

class DirectoryFileSearch implements FileSearch {
  private ignore: Ignore | undefined;

  constructor(private readonly options: FileSearchOptions) {}

  async initialize(): Promise<void> {
    this.ignore = loadIgnoreRules(
      this.options.fileDiscoveryService,
      this.options.ignoreDirs,
    );
  }

  async search(
    pattern: string,
    options: SearchOptions = {},
  ): Promise<string[]> {
    if (!this.ignore) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }
    pattern = pattern || '*';

    const dir = pattern.endsWith('/') ? pattern : path.dirname(pattern);
    const results = await crawl({
      crawlDirectory: path.join(this.options.projectRoot, dir),
      cwd: this.options.projectRoot,
      maxDepth: 0,
      ignore: this.ignore,
      cache: this.options.cache,
      cacheTtl: this.options.cacheTtl,
    });

    const filteredResults = await filter(results, pattern, options.signal);

    const fileFilter = this.ignore.getFileFilter();
    const finalResults: string[] = [];
    for (const candidate of filteredResults) {
      if (finalResults.length >= (options.maxResults ?? Infinity)) {
        break;
      }
      if (candidate === '.') {
        continue;
      }
      if (!fileFilter(candidate)) {
        finalResults.push(candidate);
      }
    }
    return finalResults;
  }
}

export class FileSearchFactory {
  static create(options: FileSearchOptions): FileSearch {
    if (options.enableRecursiveFileSearch) {
      return new RecursiveFileSearch(options);
    }
    return new DirectoryFileSearch(options);
  }
}
