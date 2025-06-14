/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { FileDiscoveryService } from './fileDiscoveryService.js';
import { GitIgnoreParser } from '../utils/gitIgnoreParser.js';
import * as gitUtils from '../utils/gitUtils.js';

// Mock the GitIgnoreParser
vi.mock('../utils/gitIgnoreParser.js');

// Mock gitUtils module
vi.mock('../utils/gitUtils.js');

describe('FileDiscoveryService', () => {
  let service: FileDiscoveryService;
  let mockGitIgnoreParser: Mocked<GitIgnoreParser>;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    mockGitIgnoreParser = {
      initialize: vi.fn(),
      isIgnored: vi.fn(),
      loadPatterns: vi.fn(),
      loadGitRepoPatterns: vi.fn(),
    } as unknown as Mocked<GitIgnoreParser>;

    vi.mocked(GitIgnoreParser).mockImplementation(() => mockGitIgnoreParser);
    vi.mocked(gitUtils.isGitRepository).mockReturnValue(true);
    vi.mocked(gitUtils.findGitRoot).mockReturnValue('/test/project');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize git ignore parser by default', () => {
      service = new FileDiscoveryService(mockProjectRoot);
      expect(GitIgnoreParser).toHaveBeenCalledWith(mockProjectRoot);
      expect(GitIgnoreParser).toHaveBeenCalledTimes(2);
      expect(mockGitIgnoreParser.loadGitRepoPatterns).toHaveBeenCalled();
      expect(mockGitIgnoreParser.loadPatterns).toHaveBeenCalled();
    });

    it('should not initialize git ignore parser when not a git repo', () => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(false);
      service = new FileDiscoveryService(mockProjectRoot);

      expect(GitIgnoreParser).toHaveBeenCalledOnce();
      expect(mockGitIgnoreParser.loadGitRepoPatterns).not.toHaveBeenCalled();
    });
  });

  describe('filterFiles', () => {
    beforeEach(() => {
      mockGitIgnoreParser.isIgnored.mockImplementation(
        (path: string) =>
          path.includes('node_modules') || path.includes('.git'),
      );
      service = new FileDiscoveryService(mockProjectRoot);
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

  describe('shouldGitIgnoreFile', () => {
    beforeEach(() => {
      mockGitIgnoreParser.isIgnored.mockImplementation((path: string) =>
        path.includes('node_modules'),
      );
      service = new FileDiscoveryService(mockProjectRoot);
    });

    it('should return true for git-ignored files', () => {
      expect(service.shouldGitIgnoreFile('node_modules/package/index.js')).toBe(
        true,
      );
    });

    it('should return false for non-ignored files', () => {
      expect(service.shouldGitIgnoreFile('src/index.ts')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle relative project root paths', () => {
      const relativeService = new FileDiscoveryService('./relative/path');
      expect(relativeService).toBeInstanceOf(FileDiscoveryService);
    });

    it('should handle filterFiles with undefined options', () => {
      const files = ['src/index.ts'];
      const filtered = service.filterFiles(files, undefined);
      expect(filtered).toEqual(files);
    });
  });
});
