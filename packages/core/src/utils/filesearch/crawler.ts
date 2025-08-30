/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fdir } from 'fdir';
import type { Ignore } from './ignore.js';
import * as cache from './crawlCache.js';

export interface CrawlOptions {
  // The directory to start the crawl from.
  crawlDirectory: string;
  // The project's root directory, for path relativity.
  cwd: string;
  // The fdir maxDepth option.
  maxDepth?: number;
  // A pre-configured Ignore instance.
  ignore: Ignore;
  // Caching options.
  cache: boolean;
  cacheTtl: number;
}

// Helper function to configure the fdir API based on options
function _configureFdirApi(
  options: CrawlOptions,
  dirFilter: (path: string) => boolean,
  posixCwd: string,
): fdir {
  const api = new fdir().withDirs().withPathSeparator('/'); // Always use unix style paths

  if (options.crawlDirectory === options.cwd) {
    api.withRelativePaths();
  } else {
    api.withFullPaths();
  }

  if (options.maxDepth !== undefined) {
    api.withMaxDepth(options.maxDepth);
  }

  api.exclude((_, dirPath) => {
    // dirPath is absolute. We need to make it relative to the ignore directory
    const pathRelativeToCwd = path.posix.relative(posixCwd, dirPath);
    return dirFilter(`${pathRelativeToCwd}/`);
  });
  return api;
}

// Helper function to process the raw crawl results into final relative paths
async function _processCrawlResults(
  rawResults: string[],
  options: CrawlOptions,
  posixCwd: string,
): Promise<string[]> {
  // Drop the `.` entry.
  rawResults = rawResults.slice(1);

  if (options.crawlDirectory === options.cwd) {
    return rawResults; // Already relative
  } else {
    const relativeToCwdResults: string[] = [];
    for (const [i, p] of rawResults.entries()) {
      if (i % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      let relativePath = path.posix.relative(posixCwd, p);
      // If the original path was a directory (ended with '/'), ensure the relative path also ends with '/'
      if (p.endsWith('/') && !relativePath.endsWith('/')) {
        relativePath += '/';
      }
      relativeToCwdResults.push(relativePath);
    }
    return relativeToCwdResults;
  }
}

export async function crawl(options: CrawlOptions): Promise<string[]> {
  if (options.cache) {
    const cacheKey = cache.getCacheKey(
      options.crawlDirectory,
      options.ignore.getFingerprint(),
      options.maxDepth,
    );
    const cachedResults = cache.read(cacheKey);

    if (cachedResults) {
      return cachedResults;
    }
  }

  const posixCwd = options.cwd.split(path.sep).join(path.posix.sep);
  const dirFilter = options.ignore.getDirectoryFilter();
  let finalResults: string[];

  try {
    const api = _configureFdirApi(options, dirFilter, posixCwd);
    const rawResults = await api.crawl(options.crawlDirectory).withPromise();

    finalResults = await _processCrawlResults(rawResults, options, posixCwd);
  } catch (_e) {
    // The directory probably doesn't exist.
    return [];
  }

  if (options.cache) {
    const cacheKey = cache.getCacheKey(
      options.crawlDirectory,
      options.ignore.getFingerprint(),
      options.maxDepth,
    );
    cache.write(cacheKey, finalResults, options.cacheTtl * 1000);
  }

  return finalResults;
}
