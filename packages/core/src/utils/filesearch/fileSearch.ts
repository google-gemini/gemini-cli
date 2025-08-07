/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import { fdir } from 'fdir';
import picomatch from 'picomatch';
import { Ignore } from './ignore.js';
import { ResultCache } from './result-cache.js';
import * as cache from './crawlCache.js';
import { AsyncFzf, FzfResultItem } from 'fzf';

export type FileSearchOptions = {
  projectRoot: string;
  ignoreDirs: string[];
  useGitignore: boolean;
  useGeminiignore: boolean;
  cache: boolean;
  cacheTtl: number;
  maxDepth?: number;
};

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

export type SearchOptions = {
  signal?: AbortSignal;
  maxResults?: number;
};

/**
 * Provides a fast and efficient way to search for files within a project,
 * respecting .gitignore and .geminiignore rules, and utilizing caching
 * for improved performance.
 */
export class FileSearch {
  private readonly absoluteDir: string;
  private readonly ignore: Ignore = new Ignore();
  private resultCache: ResultCache | undefined;
  private allFiles: string[] = [];
  private fzf: AsyncFzf<string[]> | undefined;

  /**
   * Constructs a new `FileSearch` instance.
   * @param options Configuration options for the file search.
   */
  constructor(private readonly options: FileSearchOptions) {
    this.absoluteDir = path.resolve(options.projectRoot);
  }

  /**
   * Initializes the file search engine by loading ignore rules, crawling the
   * file system, and building the in-memory cache. This method must be called
   * before performing any searches.
   */
  async initialize(): Promise<void> {
    this.loadIgnoreRules();
    await this.crawlFiles();
    this.buildResultCache();
  }

  /**
   * Searches for files matching a given pattern.
   * @param pattern The picomatch pattern to search for (e.g., '*.js', 'src/**').
   * @param options Search options, including an AbortSignal and maxResults.
   * @returns A promise that resolves to a list of matching file paths, relative
   *          to the project root.
   */
  async search(
    pattern: string,
    options: SearchOptions = {},
  ): Promise<string[]> {
    if (!this.resultCache || !this.fzf) {
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

    // Trade-off: We apply a two-stage filtering process.
    // 1. During the file system crawl (`performCrawl`), we only apply directory-level
    //    ignore rules (e.g., `node_modules/`, `dist/`). This is because applying
    //    a full ignore filter (which includes file-specific patterns like `*.log`)
    //    during the crawl can significantly slow down `fdir`.
    // 2. Here, in the `search` method, we apply the full ignore filter
    //    (including file patterns) to the `filteredCandidates` (which have already
    //    been filtered by the user's search pattern and sorted). For autocomplete,
    //    the number of displayed results is small (MAX_SUGGESTIONS_TO_SHOW),
    //    so applying the full filter to this truncated list is much more efficient
    //    than applying it to every file during the initial crawl.
    const fileFilter = this.ignore.getFileFilter();
    const results: string[] = [];
    for (const [i, candidate] of filteredCandidates.entries()) {
      // Yield to the event loop to avoid blocking on large result sets.
      if (i % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (options.signal?.aborted) {
          throw new AbortError();
        }
      }

      if (results.length >= (options.maxResults ?? Infinity)) {
        break;
      }
      // The `ignore` library throws an error if the path is '.', so we skip it.
      if (candidate === '.') {
        continue;
      }
      if (!fileFilter(candidate)) {
        results.push(candidate);
      }
    }
    return results;
  }

  /**
   * Loads ignore rules from .gitignore and .geminiignore files, and applies
   * any additional ignore directories specified in the options.
   */
  private loadIgnoreRules(): void {
    if (this.options.useGitignore) {
      const gitignorePath = path.join(this.absoluteDir, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        this.ignore.add(fs.readFileSync(gitignorePath, 'utf8'));
      }
    }

    if (this.options.useGeminiignore) {
      const geminiignorePath = path.join(this.absoluteDir, '.geminiignore');
      if (fs.existsSync(geminiignorePath)) {
        this.ignore.add(fs.readFileSync(geminiignorePath, 'utf8'));
      }
    }

    const ignoreDirs = ['.git', ...this.options.ignoreDirs];
    this.ignore.add(
      ignoreDirs.map((dir) => {
        if (dir.endsWith('/')) {
          return dir;
        }
        return `${dir}/`;
      }),
    );
  }

  /**
   * Crawls the file system to get a list of all files and directories,
   * optionally using a cache for faster initialization.
   */
  private async crawlFiles(): Promise<void> {
    if (this.options.cache) {
      const cacheKey = cache.getCacheKey(
        this.absoluteDir,
        this.ignore.getFingerprint(),
        this.options.maxDepth,
      );
      const cachedResults = cache.read(cacheKey);

      if (cachedResults) {
        this.allFiles = cachedResults;
        return;
      }
    }

    this.allFiles = await this.performCrawl();

    if (this.options.cache) {
      const cacheKey = cache.getCacheKey(
        this.absoluteDir,
        this.ignore.getFingerprint(),
        this.options.maxDepth,
      );
      cache.write(cacheKey, this.allFiles, this.options.cacheTtl * 1000);
    }
  }

  /**
   * Performs the actual file system crawl using `fdir`, applying directory
   * ignore rules.
   * @returns A promise that resolves to a list of all files and directories.
   */
  private async performCrawl(): Promise<string[]> {
    const dirFilter = this.ignore.getDirectoryFilter();

    // We use `fdir` for fast file system traversal. A key performance
    // optimization for large workspaces is to exclude entire directories
    // early in the traversal process. This is why we apply directory-specific
    // ignore rules (e.g., `node_modules/`, `dist/`) directly to `fdir`'s
    // exclude filter.
    const api = new fdir()
      .withRelativePaths()
      .withDirs()
      .withPathSeparator('/') // Always use unix style paths
      .exclude((_, dirPath) => {
        const relativePath = path.relative(this.absoluteDir, dirPath);
        return dirFilter(`${relativePath}/`);
      });

    if (this.options.maxDepth !== undefined) {
      api.withMaxDepth(this.options.maxDepth);
    }

    return api.crawl(this.absoluteDir).withPromise();
  }

  /**
   * Builds the in-memory cache for fast pattern matching.
   */
  private buildResultCache(): void {
    this.resultCache = new ResultCache(this.allFiles, this.absoluteDir);
    // The v1 algorithm is much faster since it only looks at the first
    // occurence of the pattern. We use it for search spaces that have >20k
    // files, because the v2 algorithm is just too slow in those cases.
    this.fzf = new AsyncFzf(this.allFiles, {
      fuzzy: this.allFiles.length > 20000 ? 'v1' : 'v2',
    });
  }
}
