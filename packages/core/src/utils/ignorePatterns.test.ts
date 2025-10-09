/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FileExclusions,
  BINARY_EXTENSIONS,
  extractExtensionsFromPatterns,
} from './ignorePatterns.js';
import type { Config } from '../config/config.js';

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
      expect(patterns).toContain('**/.svn/**');
      expect(patterns).toContain('**/.hg/**');
      expect(patterns).toHaveLength(5);
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
      expect(patterns).toContain('**/.svn/**');
      expect(patterns).toContain('**/.hg/**');

      // Should not include comprehensive patterns by default
      expect(patterns).toHaveLength(5);
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

  it('should include media file extensions', () => {
    expect(BINARY_EXTENSIONS).toContain('.pdf');
    expect(BINARY_EXTENSIONS).toContain('.png');
    expect(BINARY_EXTENSIONS).toContain('.jpg');
  });

  it('should be sorted', () => {
    const sortedExtensions = [...BINARY_EXTENSIONS].sort();
    expect(BINARY_EXTENSIONS).toEqual(sortedExtensions);
  });

  it('should not contain invalid extensions from brace patterns', () => {
    // If brace expansion was not handled correctly, we would see invalid extensions like '.{jpg,png}'
    const invalidExtensions = BINARY_EXTENSIONS.filter(
      (ext) => ext.includes('{') || ext.includes('}'),
    );
    expect(invalidExtensions).toHaveLength(0);
  });
});

describe('extractExtensionsFromPatterns', () => {
  it('should extract simple extensions', () => {
    const patterns = ['**/*.exe', '**/*.jar', '**/*.zip'];
    const result = extractExtensionsFromPatterns(patterns);

    expect(result).toEqual(['.exe', '.jar', '.zip']);
  });

  it('should handle brace expansion patterns', () => {
    const patterns = ['**/*.{js,ts}', '**/*.{jpg,png}'];
    const result = extractExtensionsFromPatterns(patterns);

    expect(result).toContain('.js');
    expect(result).toContain('.ts');
    expect(result).toContain('.jpg');
    expect(result).toContain('.png');
    expect(result).not.toContain('.{js,ts}');
    expect(result).not.toContain('.{jpg,png}');
  });

  it('should combine simple and brace expansion patterns', () => {
    const patterns = ['**/*.exe', '**/*.{js,ts}', '**/*.pdf'];
    const result = extractExtensionsFromPatterns(patterns);

    expect(result).toContain('.exe');
    expect(result).toContain('.js');
    expect(result).toContain('.ts');
    expect(result).toContain('.pdf');
  });

  it('should handle empty brace expansion', () => {
    const patterns = ['**/*.{}', '**/*.{,}'];
    const result = extractExtensionsFromPatterns(patterns);

    // Empty extensions should be filtered out
    expect(result).toHaveLength(0);
  });

  it('should ignore invalid patterns', () => {
    const patterns = ['no-asterisk.exe', '**/*no-dot', '**/*.{unclosed'];
    const result = extractExtensionsFromPatterns(patterns);

    expect(result).toHaveLength(0);
  });

  it('should remove duplicates and sort results', () => {
    const patterns = ['**/*.js', '**/*.{js,ts}', '**/*.ts'];
    const result = extractExtensionsFromPatterns(patterns);

    expect(result).toEqual(['.js', '.ts']);
  });

  it('should handle complex brace patterns with multiple extensions', () => {
    const patterns = ['**/*.{html,css,js,jsx,ts,tsx}'];
    const result = extractExtensionsFromPatterns(patterns);

    expect(result).toEqual(['.css', '.html', '.js', '.jsx', '.ts', '.tsx']);
  });

  it('should handle compound extensions correctly using path.extname', () => {
    const patterns = ['**/*.tar.gz', '**/*.min.js', '**/*.d.ts'];
    const result = extractExtensionsFromPatterns(patterns);

    // Should extract the final extension part only
    expect(result).toEqual(['.gz', '.js', '.ts']);
  });

  it('should handle dotfiles correctly', () => {
    const patterns = ['**/*.gitignore', '**/*.profile', '**/*.bashrc'];
    const result = extractExtensionsFromPatterns(patterns);

    // Dotfiles should be extracted properly
    expect(result).toEqual(['.bashrc', '.gitignore', '.profile']);
  });

  it('should handle edge cases with path.extname', () => {
    const patterns = ['**/*.hidden.', '**/*.config.json'];
    const result = extractExtensionsFromPatterns(patterns);

    // Should handle edge cases properly (trailing dots are filtered out)
    expect(result).toEqual(['.json']);
  });
});
