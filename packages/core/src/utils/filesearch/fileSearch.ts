/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import picomatch from 'picomatch';
import { Ignore, loadIgnoreRules } from './ignore.js';
import { ResultCache } from './result-cache.js';
import { crawl } from './crawler.js';
import { AsyncFzf, FzfResultItem } from 'fzf';

export interface FileSearchOptions {
  projectRoot: string;
  ignoreDirs: string[];
  useGitignore: boolean;
  useGeminiignore: boolean;
  cache: boolean;
  cacheTtl: number;
  enableRecursiveFileSearch: boolean;
  maxDepth?: number;
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
}

class RecursiveFileSearch implements FileSearch {
  private ignore: Ignore | undefined;
  private resultCache: ResultCache | undefined;
  private allFiles: string[] = [];
  private fzf: AsyncFzf<string[]> | undefined;

  constructor(private readonly options: FileSearchOptions) {}

  async initialize(): Promise<void> {
    this.ignore = loadIgnoreRules(this.options);
    this.allFiles = await crawl({
      crawlDirectory: this.options.projectRoot,
      cwd: this.options.projectRoot,
      ignore: this.ignore,
      cache: this.options.cache,
      cacheTtl: this.options.cacheTtl,
      maxDepth: this.options.maxDepth,
    });
    this.buildResultCache();
  }

  async search(
    pattern: string,
    options: SearchOptions = {},
  ): Promise<string[]> {
    if (!this.resultCache || !this.fzf || !this.ignore) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    pattern = pattern || '*';

    let filteredCandidates;
    const { files: candidates, isExactMatch } =
      await this.resultCache!.get(pattern);

    if (isExactMatch) {
      // Use the cached result.
      filteredCandidates = candidates;
    } else {
      let shouldCache = true;
      if (pattern.includes('*')) {
        filteredCandidates = await filter(candidates, pattern, options.signal);
      } else {
        filteredCandidates = await this.fzf
          .find(pattern)
          .then((results: Array<FzfResultItem<string>>) =>
            results.map((entry: FzfResultItem<string>) => entry.item),
          )
          .catch(() => {
            shouldCache = false;
            return [];
          });
      }

      if (shouldCache) {
        this.resultCache!.set(pattern, filteredCandidates);
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

  private buildResultCache(): void {
    this.resultCache = new ResultCache(this.allFiles);
    // The v1 algorithm is much faster since it only looks at the first
    // occurence of the pattern. We use it for search spaces that have >20k
    // files, because the v2 algorithm is just too slow in those cases.
    this.fzf = new AsyncFzf(this.allFiles, {
      fuzzy: this.allFiles.length > 20000 ? 'v1' : 'v2',
    });
  }
}

class DirectoryFileSearch implements FileSearch {
  private ignore: Ignore | undefined;

  constructor(private readonly options: FileSearchOptions) {}

  async initialize(): Promise<void> {
    this.ignore = loadIgnoreRules(this.options);
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
