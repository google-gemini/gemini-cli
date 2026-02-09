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
  // Maximum number of files to return.
  maxFiles?: number;
  // A pre-configured Ignore instance.
  ignore: Ignore;
  // Caching options.
  cache: boolean;
  cacheTtl: number;
}

function toPosixPath(p: string) {
  return p.split(path.sep).join(path.posix.sep);
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

  const posixCwd = toPosixPath(options.cwd);
  const posixCrawlDirectory = toPosixPath(options.crawlDirectory);
  const maxFiles = options.maxFiles ?? Infinity;
  let fileCount = 0;
  let truncated = false;

  let results: string[];
  try {
    const dirFilter = options.ignore.getDirectoryFilter();
    const api = new fdir()
      .withRelativePaths()
      .withDirs()
      .withPathSeparator('/') // Always use unix style paths
      .filter((path, isDirectory) => {
        if (!isDirectory) {
          fileCount++;
          if (fileCount > maxFiles) {
            truncated = true;
            return false;
          }
        }
        return true;
      })
      .exclude((_, dirPath) => {
        if (fileCount > maxFiles) {
          truncated = true;
          return true;
        }
        const relativePath = path.posix.relative(posixCrawlDirectory, dirPath);
        return dirFilter(`${relativePath}/`);
      });

    if (options.maxDepth !== undefined) {
      api.withMaxDepth(options.maxDepth);
    }

    results = await api.crawl(options.crawlDirectory).withPromise();
  } catch (_e) {
    // The directory probably doesn't exist.
    return [];
  }

  const relativeToCrawlDir = path.posix.relative(posixCwd, posixCrawlDirectory);

  const relativeToCwdResults = results.map((p) =>
    path.posix.join(relativeToCrawlDir, p),
  );

  if (options.cache && !truncated) {
    const cacheKey = cache.getCacheKey(
      options.crawlDirectory,
      options.ignore.getFingerprint(),
      options.maxDepth,
    );
    cache.write(cacheKey, relativeToCwdResults, options.cacheTtl * 1000);
  }

  return relativeToCwdResults;
}
