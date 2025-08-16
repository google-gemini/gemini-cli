/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { FileExclusions, BINARY_EXTENSIONS } from './ignorePatterns.js';
import { Config } from '../config/config.js';

// Mock the memoryTool module
vi.mock('../tools/memoryTool.js', () => ({
  getCurrentGeminiMdFilename: vi.fn(() => 'GEMINI.md'),
}));

describe('FileExclusions', () => {
  describe('getCoreIgnorePatterns', () => {
    it('should return basic ignore patterns', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getCoreIgnorePatterns();

      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/.git/**');
      expect(patterns).toContain('**/bower_components/**');
      expect(patterns).toHaveLength(3);
    });
  });

  describe('getDefaultExcludePatterns', () => {
    it('should return comprehensive patterns by default', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getDefaultExcludePatterns();

      // Should include core patterns
      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/.git/**');

      // Should include directory excludes
      expect(patterns).toContain('**/.vscode/**');
      expect(patterns).toContain('**/dist/**');
      expect(patterns).toContain('**/build/**');

      // Should include binary patterns
      expect(patterns).toContain('**/*.exe');
      expect(patterns).toContain('**/*.jar');

      // Should include system files
      expect(patterns).toContain('**/.DS_Store');
      expect(patterns).toContain('**/.env');

      // Should include dynamic patterns
      expect(patterns).toContain('**/GEMINI.md');
    });

    it('should respect includeDefaults option', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getDefaultExcludePatterns({
        includeDefaults: false,
        includeDynamicPatterns: false,
      });

      expect(patterns).not.toContain('**/node_modules/**');
      expect(patterns).not.toContain('**/.git/**');
      expect(patterns).not.toContain('**/GEMINI.md');
      expect(patterns).toHaveLength(0);
    });

    it('should include custom patterns', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getDefaultExcludePatterns({
        customPatterns: ['**/custom/**', '**/*.custom'],
      });

      expect(patterns).toContain('**/custom/**');
      expect(patterns).toContain('**/*.custom');
    });

    it('should include runtime patterns', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getDefaultExcludePatterns({
        runtimePatterns: ['**/temp/**', '**/*.tmp'],
      });

      expect(patterns).toContain('**/temp/**');
      expect(patterns).toContain('**/*.tmp');
    });

    it('should respect includeDynamicPatterns option', () => {
      const excluder = new FileExclusions();
      const patternsWithDynamic = excluder.getDefaultExcludePatterns({
        includeDynamicPatterns: true,
      });
      const patternsWithoutDynamic = excluder.getDefaultExcludePatterns({
        includeDynamicPatterns: false,
      });

      expect(patternsWithDynamic).toContain('**/GEMINI.md');
      expect(patternsWithoutDynamic).not.toContain('**/GEMINI.md');
    });
  });

  describe('getReadManyFilesExcludes', () => {
    it('should provide legacy compatibility', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getReadManyFilesExcludes(['**/*.log']);

      // Should include all default patterns
      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/.git/**');
      expect(patterns).toContain('**/GEMINI.md');

      // Should include additional excludes
      expect(patterns).toContain('**/*.log');
    });
  });

  describe('getGlobExcludes', () => {
    it('should return core patterns for glob operations', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getGlobExcludes();

      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/.git/**');
      expect(patterns).toContain('**/bower_components/**');

      // Should not include comprehensive patterns by default
      expect(patterns).toHaveLength(3);
    });

    it('should include additional excludes', () => {
      const excluder = new FileExclusions();
      const patterns = excluder.getGlobExcludes(['**/temp/**']);

      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/.git/**');
      expect(patterns).toContain('**/temp/**');
    });
  });

  describe('with Config', () => {
    it('should use config custom excludes when available', () => {
      const mockConfig = {
        getCustomExcludes: vi.fn(() => ['**/config-exclude/**']),
      } as unknown as Config;

      const excluder = new FileExclusions(mockConfig);
      const patterns = excluder.getDefaultExcludePatterns();

      expect(patterns).toContain('**/config-exclude/**');
      expect(mockConfig.getCustomExcludes).toHaveBeenCalled();
    });

    it('should handle config without getCustomExcludes method', () => {
      const mockConfig = {} as Config;

      const excluder = new FileExclusions(mockConfig);
      const patterns = excluder.getDefaultExcludePatterns();

      // Should not throw and should include default patterns
      expect(patterns).toContain('**/node_modules/**');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should include config custom excludes in glob patterns', () => {
      const mockConfig = {
        getCustomExcludes: vi.fn(() => ['**/config-glob/**']),
      } as unknown as Config;

      const excluder = new FileExclusions(mockConfig);
      const patterns = excluder.getGlobExcludes();

      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/.git/**');
      expect(patterns).toContain('**/config-glob/**');
    });
  });

  describe('buildExcludePatterns', () => {
    it('should be an alias for getDefaultExcludePatterns', () => {
      const excluder = new FileExclusions();
      const options = {
        includeDefaults: true,
        customPatterns: ['**/test/**'],
        runtimePatterns: ['**/runtime/**'],
      };

      const defaultPatterns = excluder.getDefaultExcludePatterns(options);
      const buildPatterns = excluder.buildExcludePatterns(options);

      expect(buildPatterns).toEqual(defaultPatterns);
    });
  });
});

describe('BINARY_EXTENSIONS', () => {
  it('should include common binary file extensions', () => {
    expect(BINARY_EXTENSIONS).toContain('.exe');
    expect(BINARY_EXTENSIONS).toContain('.dll');
    expect(BINARY_EXTENSIONS).toContain('.jar');
    expect(BINARY_EXTENSIONS).toContain('.zip');
  });

  it('should include additional binary extensions', () => {
    expect(BINARY_EXTENSIONS).toContain('.dat');
    expect(BINARY_EXTENSIONS).toContain('.obj');
    expect(BINARY_EXTENSIONS).toContain('.wasm');
  });

  it('should be sorted', () => {
    const sortedExtensions = [...BINARY_EXTENSIONS].sort();
    expect(BINARY_EXTENSIONS).toEqual(sortedExtensions);
  });
});
