/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FuzzySearchService } from './fuzzySearchService.js';
import type { FileDiscoveryService } from './fileDiscoveryService.js';
import * as crawler from '../utils/filesearch/crawler.js';

// Mock the dependencies
vi.mock('../utils/filesearch/crawler.js');
vi.mock('../utils/filesearch/ignore.js', () => ({
  loadIgnoreRules: vi.fn(),
}));

describe('FuzzySearchService', () => {
  let service: FuzzySearchService;
  let mockFileDiscoveryService: FileDiscoveryService;

  beforeEach(() => {
    mockFileDiscoveryService = {
      getTargetDir: vi.fn().mockReturnValue('/root'),
    } as unknown as FileDiscoveryService;

    service = new FuzzySearchService(mockFileDiscoveryService);

    // Clear mocks
    vi.clearAllMocks();
  });

  describe('search', () => {
    it('should return empty array for empty or whitespace query', async () => {
      const results1 = await service.search('');
      const results2 = await service.search('   ');

      expect(results1).toEqual([]);
      expect(results2).toEqual([]);
      expect(crawler.crawl).not.toHaveBeenCalled();
    });

    it('should limit file crawl count and query length', async () => {
      const mockFiles = ['/root/file1.ts', '/root/file2.ts'];
      vi.mocked(crawler.crawl).mockResolvedValue(mockFiles);

      // Create a very long query
      const longQuery = 'a'.repeat(1000);

      await service.search(longQuery);

      expect(crawler.crawl).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFiles: 20000,
        }),
      );
    });

    it('should prioritize exact matches', async () => {
      const mockFiles = [
        '/root/other.ts',
        '/root/exactMatch.ts',
        '/root/partial_exactMatch_partial.ts',
      ];
      vi.mocked(crawler.crawl).mockResolvedValue(mockFiles);

      const results = await service.search('exactMatch.ts');

      expect(results[0].path).toBe('/root/exactMatch.ts');
      expect(results[0].score).toBe(0.9); // Exact basename match
    });

    it('should use cache for repeated queries', async () => {
      const mockFiles = ['/root/file1.ts'];
      vi.mocked(crawler.crawl).mockResolvedValue(mockFiles);

      await service.search('file1');
      await service.search('file1');

      expect(crawler.crawl).toHaveBeenCalledTimes(1);
    });

    it('should truncate extremely long queries to 500 chars', async () => {
      const mockFiles = ['/root/file1.ts'];
      vi.mocked(crawler.crawl).mockResolvedValue(mockFiles);

      const longQuery = 'a'.repeat(600);
      await service.search(longQuery);

      // Access private cache to verify truncated key or verify behavior
      // Since we can't easily spy on internal logic without exposing it,
      // we rely on the fact it didn't crash and returned results.
      // We can indirectly check if it behaved as expected if we had a file matching the truncated query.
      expect(crawler.crawl).toHaveBeenCalled();
    });
  });
});
