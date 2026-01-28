/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { crawl } from '../utils/filesearch/crawler.js';
import { loadIgnoreRules } from '../utils/filesearch/ignore.js';
import type { FileDiscoveryService } from './fileDiscoveryService.js';
import fastLevenshtein from 'fast-levenshtein';
const { get } = fastLevenshtein;

export interface SearchResult {
  path: string;
  score: number;
}

export class FuzzySearchService {
  constructor(private readonly fileDiscoveryService: FileDiscoveryService) {}

  /**
   * Searches for files matching the query string using fuzzy matching.
   */
  async search(
    query: string,
    maxResults: number = 20,
  ): Promise<SearchResult[]> {
    const ignore = loadIgnoreRules(this.fileDiscoveryService);
    const root = this.fileDiscoveryService.getTargetDir();

    const allFiles = await crawl({
      crawlDirectory: root,
      cwd: root,
      ignore,
      cache: true,
      cacheTtl: 60, // 1 minute cache
    });

    const normalizedQuery = query.toLowerCase();
    const rankedFiles: SearchResult[] = allFiles.map((filePath) => {
      const normalizedPath = filePath.toLowerCase();
      const basename = path.basename(filePath).toLowerCase();

      let score = 0;

      // 1. Exact full path match
      if (normalizedPath === normalizedQuery) {
        score = 1.0;
      }
      // 2. Exact basename match
      else if (basename === normalizedQuery) {
        score = 0.9;
      }
      // 3. Substring match
      else if (normalizedPath.includes(normalizedQuery)) {
        // Longer queries that match are more significant, but exact matches are better.
        // Penalty for extra characters.
        const lengthRatio = normalizedQuery.length / normalizedPath.length;
        score = 0.5 + 0.3 * lengthRatio;
      }
      // 4. Fuzzy match (Levenshtein) on basename
      else {
        // We focus on basename for fuzzy search to avoid noise from long paths
        const distance = get(basename, normalizedQuery);
        const maxLength = Math.max(basename.length, normalizedQuery.length);
        const similarity = 1 - distance / maxLength;

        // Only consider it relevant if similarity is high enough
        if (similarity > 0.4) {
          score = 0.5 * similarity;
        }
      }

      return { path: filePath, score };
    });

    // Filter out zero scores and sort
    return rankedFiles
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
}
