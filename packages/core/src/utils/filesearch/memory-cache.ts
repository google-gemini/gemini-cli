/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { filter } from './fileSearch.js';

export class MemoryCache {
  private readonly cache: Map<string, string[]>;
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly allFiles: string[],
    private readonly absoluteDir: string,
  ) {
    this.cache = new Map();
  }

  async get(
    query: string,
    signal: AbortSignal | undefined,
  ): Promise<string[]> {
    const isCacheHit = this.cache.has(query);

    if (isCacheHit) {
      this.hits++;
      return this.cache.get(query)!;
    }

    this.misses++;

    let bestBaseQuery = '';
    for (const key of this.cache?.keys?.() ?? []) {
      if (query.startsWith(key) && key.length > bestBaseQuery.length) {
        bestBaseQuery = key;
      }
    }

    const filesToSearch = bestBaseQuery
      ? this.cache.get(bestBaseQuery)!
      : this.allFiles;

    const results = await filter(filesToSearch, query || '*', signal);

    this.cache.set(query, results);

    return results;
  }
}
