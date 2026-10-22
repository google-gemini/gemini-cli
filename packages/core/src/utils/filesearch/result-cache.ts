/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Implements an in-memory cache for file search results.
 * This cache reuses results for identical queries.
 */
export class ResultCache {
  private readonly cache: Map<string, string[]>;
  private hits = 0;
  private misses = 0;

  constructor(private readonly allFiles: string[]) {
    this.cache = new Map();
  }

  /**
   * Retrieves cached search results for a given query, or provides a base set
   * of files to search from.
   * @param query The search query pattern.
   * @returns An object containing the files to search and a boolean indicating
   *          if the result is an exact cache hit.
   */
  async get(
    query: string,
  ): Promise<{ files: string[]; isExactMatch: boolean }> {
    const isCacheHit = this.cache.has(query);

    if (isCacheHit) {
      this.hits++;
      return { files: this.cache.get(query)!, isExactMatch: true };
    }

    this.misses++;

    // A query's string prefix may use a different matcher or a more restrictive
    // glob, so its cached results are not a safe candidate pool.
    return { files: this.allFiles, isExactMatch: false };
  }

  /**
   * Stores search results in the cache.
   * @param query The search query pattern.
   * @param results The matching file paths to cache.
   */
  set(query: string, results: string[]): void {
    this.cache.set(query, results);
  }
}
