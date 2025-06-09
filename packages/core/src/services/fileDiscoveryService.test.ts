/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { FileDiscoveryService } from './fileDiscoveryService.js';
import { GitIgnoreParser } from '../utils/gitIgnoreParser.js';

// Mock the GitIgnoreParser
vi.mock('../utils/gitIgnoreParser.js');

// Mock gitUtils module
vi.mock('../utils/gitUtils.js', () => ({
  isGitRepository: vi.fn(() => true),
  findGitRoot: vi.fn(() => '/test/project'),
}));

describe('FileDiscoveryService', () => {
  let service: FileDiscoveryService;
  let mockGitIgnoreParser: Mocked<GitIgnoreParser>;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    service = new FileDiscoveryService(mockProjectRoot);

    mockGitIgnoreParser = {
      initialize: vi.fn(),
      isIgnored: vi.fn(),
      getIgnoredPatterns: vi.fn(() => ['.git/**', 'node_modules/**']),
      parseGitIgnoreContent: vi.fn(),
    } as unknown as Mocked<GitIgnoreParser>;

    vi.mocked(GitIgnoreParser).mockImplementation(() => mockGitIgnoreParser);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize git ignore parser by default', async () => {
      await service.initialize();

      expect(GitIgnoreParser).toHaveBeenCalledWith(mockProjectRoot);
      expect(mockGitIgnoreParser.initialize).toHaveBeenCalled();
    });

    it('should not initialize git ignore parser when respectGitIgnore is false', async () => {
      await service.initialize({ respectGitIgnore: false });

      expect(GitIgnoreParser).not.toHaveBeenCalled();
      expect(mockGitIgnoreParser.initialize).not.toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockGitIgnoreParser.initialize.mockRejectedValue(
        new Error('Init failed'),
      );

      await expect(service.initialize()).rejects.toThrow('Init failed');
    });
  });

  describe('filterFiles', () => {
    beforeEach(async () => {
      mockGitIgnoreParser.isIgnored.mockImplementation(
        (path: string) =>
          path.includes('node_modules') || path.includes('.git'),
      );
      await service.initialize();
    });

    it('should filter out git-ignored files by default', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        'README.md',
        '.git/config',
        'dist/bundle.js',
      ];

      const filtered = service.filterFiles(files);

      expect(filtered).toEqual(['src/index.ts', 'README.md', 'dist/bundle.js']);
    });

    it('should not filter files when respectGitIgnore is false', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        '.git/config',
      ];

      const filtered = service.filterFiles(files, { respectGitIgnore: false });

      expect(filtered).toEqual(files);
    });

    it('should handle empty file list', () => {
      const filtered = service.filterFiles([]);
      expect(filtered).toEqual([]);
    });
  });

  describe('shouldIgnoreFile', () => {
    beforeEach(async () => {
      mockGitIgnoreParser.isIgnored.mockImplementation((path: string) =>
        path.includes('node_modules'),
      );
      await service.initialize();
    });

    it('should return true for git-ignored files', () => {
      expect(service.shouldIgnoreFile('node_modules/package/index.js')).toBe(
        true,
      );
    });

    it('should return false for non-ignored files', () => {
      expect(service.shouldIgnoreFile('src/index.ts')).toBe(false);
    });

    it('should return false when respectGitIgnore is false', () => {
      expect(
        service.shouldIgnoreFile('node_modules/package/index.js', {
          respectGitIgnore: false,
        }),
      ).toBe(false);
    });

    it('should return false when git ignore parser is not initialized', async () => {
      const uninitializedService = new FileDiscoveryService(mockProjectRoot);
      expect(
        uninitializedService.shouldIgnoreFile('node_modules/package/index.js'),
      ).toBe(false);
    });
  });

  describe('isGitRepository', () => {
    it('should return true when isGitRepo is explicitly set to true in options', () => {
      const result = service.isGitRepository({ isGitRepo: true });
      expect(result).toBe(true);
    });

    it('should return false when isGitRepo is explicitly set to false in options', () => {
      const result = service.isGitRepository({ isGitRepo: false });
      expect(result).toBe(false);
    });

    it('should use git utility function when isGitRepo is not specified', () => {
      const result = service.isGitRepository();
      expect(result).toBe(true); // mocked to return true
    });

    it('should use git utility function when options are undefined', () => {
      const result = service.isGitRepository(undefined);
      expect(result).toBe(true); // mocked to return true
    });
  });

  describe('initialization with isGitRepo config', () => {
    it('should initialize git ignore parser when isGitRepo is true in options', async () => {
      await service.initialize({ isGitRepo: true });

      expect(GitIgnoreParser).toHaveBeenCalledWith(mockProjectRoot);
      expect(mockGitIgnoreParser.initialize).toHaveBeenCalled();
    });

    it('should not initialize git ignore parser when isGitRepo is false in options', async () => {
      await service.initialize({ isGitRepo: false });

      expect(GitIgnoreParser).not.toHaveBeenCalled();
      expect(mockGitIgnoreParser.initialize).not.toHaveBeenCalled();
    });

    it('should initialize git ignore parser when isGitRepo is not specified but respectGitIgnore is true', async () => {
      await service.initialize({ respectGitIgnore: true });

      expect(GitIgnoreParser).toHaveBeenCalledWith(mockProjectRoot);
      expect(mockGitIgnoreParser.initialize).toHaveBeenCalled();
    });
  });

  describe('shouldIgnoreFile with isGitRepo config', () => {
    it('should respect isGitRepo option when checking if file should be ignored', async () => {
      mockGitIgnoreParser.isIgnored.mockImplementation((path: string) =>
        path.includes('node_modules'),
      );
      await service.initialize({ isGitRepo: true });

      expect(
        service.shouldIgnoreFile('node_modules/package/index.js', {
          isGitRepo: true,
        }),
      ).toBe(true);
      expect(
        service.shouldIgnoreFile('node_modules/package/index.js', {
          isGitRepo: false,
        }),
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle relative project root paths', () => {
      const relativeService = new FileDiscoveryService('./relative/path');
      expect(relativeService).toBeInstanceOf(FileDiscoveryService);
    });

    it('should handle undefined options', async () => {
      await service.initialize(undefined);
      expect(GitIgnoreParser).toHaveBeenCalled();
    });

    it('should handle filterFiles with undefined options', async () => {
      await service.initialize();
      const files = ['src/index.ts'];
      const filtered = service.filterFiles(files, undefined);
      expect(filtered).toEqual(files);
    });
  });
});
