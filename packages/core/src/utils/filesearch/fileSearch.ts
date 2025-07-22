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
import { MemoryCache } from './memory-cache.js';
import * as cache from './cache.js';

export type FileSearchOptions = {
  projectRoot: string;
  ignoreDirs: string[];
  useGitignore: boolean;
  useGeminiignore: boolean;
  cache: boolean;
  cacheTtl: number;
  /**
   * Whether to apply file-level ignore patterns (e.g., `*.log`).
   * This is disabled by default because it can be a performance-intensive
   * operation on large repositories. Directory-level ignores are always applied.
   */
  applyFileIgnores?: boolean;
};

export class AbortError extends Error {
  constructor(message = 'Search aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export async function filter(
  allPaths: string[],
  pattern: string,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const isGlob = pattern.includes('*');
  let finalPattern = pattern;

  if (isGlob && !pattern.includes('**')) {
    finalPattern = `**/${pattern}`;
  }

  const patternFilter = isGlob
    ? picomatch(finalPattern, { posix: true, dot: true })
    : (filePath: string) => {
        try {
          return new RegExp(pattern, 'i').test(filePath);
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.error(`Error testing pattern: ${error.message}`);
          }

          return false;
        }
      };

  const results: string[] = [];
  for (const [i, p] of allPaths.entries()) {
    if (i % 1000 === 0) {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      if (signal?.aborted) {
        throw new AbortError();
      }
    }

    const normalizedPath = p.replace(/\\/g, '/');
    const matches = patternFilter(normalizedPath);
    if (matches) {
      results.push(p);
    }
  }

  results.sort((a, b) => {
    const aIsDir = a.endsWith('/') || a.endsWith('\\');
    const bIsDir = b.endsWith('/') || b.endsWith('\\');

    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.localeCompare(b);
  });

  return results;
}

export class FileSearch {
  private readonly absoluteDir: string;
  private readonly ignore: Ignore = new Ignore();
  private memoryCache: MemoryCache | undefined;
  private allFiles: string[] = [];

  constructor(private readonly options: FileSearchOptions) {
    this.absoluteDir = path.resolve(options.projectRoot);
  }

  async initialize(): Promise<void> {
    this.loadIgnoreRules();
    await this.crawlFiles();
    this.buildMemoryCache();
  }

  async search(pattern: string, signal?: AbortSignal): Promise<string[]> {
    if (!this.memoryCache) {
      throw new Error('Engine not initialized.');
    }

    if (pattern === '') {
      return this.memoryCache!.get('*/', signal);
    }

    return this.memoryCache!.get(pattern, signal);
  }

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

    if (this.options.ignoreDirs.length > 0) {
      this.ignore.add(
        this.options.ignoreDirs.map((dir) => {
          if (dir.endsWith('/')) {
            return dir;
          }
          return `${dir}/`;
        }),
      );
    }
  }

  private async crawlFiles(): Promise<void> {
    if (this.options.cache) {
      const cacheKey = cache.getCacheKey(
        this.absoluteDir,
        this.ignore.getFingerprint(),
      );
      const cacheFile = cache.getCacheFile(cacheKey);

      if (!cache.isCacheStale(cacheFile, this.options.cacheTtl * 1000)) {
        const cached = cache.readCache(cacheFile);
        if (cached) {
          this.allFiles = cached.results;
          return;
        }
      }

      this.allFiles = await this.performCrawl();
      cache.writeCache(cacheFile, { results: this.allFiles });
    } else {
      this.allFiles = await this.performCrawl();
    }
  }

  private async performCrawl(): Promise<string[]> {
    const dirFilter = this.ignore.getDirectoryFilter();

    const api = new fdir()
      .withRelativePaths()
      .withDirs()
      .exclude((_, dirPath) =>
        dirFilter(path.relative(this.absoluteDir, dirPath)),
      );

    const crawled = await api.crawl(this.absoluteDir).withPromise();

    if (this.options.applyFileIgnores) {
      const fileFilter = this.ignore.getFileFilter();
      return crawled.filter((p) => !fileFilter(p));
    }

    return crawled;
  }

  private buildMemoryCache(): void {
    this.memoryCache = new MemoryCache(this.allFiles, this.absoluteDir);
  }
}
