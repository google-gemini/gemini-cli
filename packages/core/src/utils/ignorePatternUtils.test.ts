/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  hasContentSlash,
  isDirectoryOnlyPattern,
} from './ignorePatternUtils.js';

describe('ignorePatternUtils', () => {
  describe('hasContentSlash', () => {
    it('should return false for a pattern with only a trailing slash', () => {
      expect(hasContentSlash('build/')).toBe(false);
      expect(hasContentSlash('node_modules/')).toBe(false);
      expect(hasContentSlash('dist/')).toBe(false);
      expect(hasContentSlash('.cache/')).toBe(false);
      expect(hasContentSlash('__pycache__/')).toBe(false);
    });

    it('should return false for a pattern with no slash at all', () => {
      expect(hasContentSlash('build')).toBe(false);
      expect(hasContentSlash('*.log')).toBe(false);
      expect(hasContentSlash('.env')).toBe(false);
      expect(hasContentSlash('Thumbs.db')).toBe(false);
    });

    it('should return true for a pattern with a slash in the middle', () => {
      expect(hasContentSlash('src/build')).toBe(true);
      expect(hasContentSlash('a/b/c')).toBe(true);
      expect(hasContentSlash('docs/api')).toBe(true);
    });

    it('should return true for a pattern with both middle and trailing slash', () => {
      expect(hasContentSlash('src/build/')).toBe(true);
      expect(hasContentSlash('a/b/')).toBe(true);
      expect(hasContentSlash('vendor/cache/')).toBe(true);
    });

    it('should handle single-character patterns', () => {
      expect(hasContentSlash('/')).toBe(false);
      expect(hasContentSlash('a')).toBe(false);
    });

    it('should handle patterns with glob wildcards', () => {
      expect(hasContentSlash('**/*.log')).toBe(true);
      expect(hasContentSlash('*.log')).toBe(false);
      expect(hasContentSlash('logs/')).toBe(false);
      expect(hasContentSlash('src/**/*.ts')).toBe(true);
    });
  });

  describe('isDirectoryOnlyPattern', () => {
    it('should return true for patterns ending with a slash', () => {
      expect(isDirectoryOnlyPattern('build/')).toBe(true);
      expect(isDirectoryOnlyPattern('node_modules/')).toBe(true);
      expect(isDirectoryOnlyPattern('src/dist/')).toBe(true);
    });

    it('should return false for patterns without a trailing slash', () => {
      expect(isDirectoryOnlyPattern('build')).toBe(false);
      expect(isDirectoryOnlyPattern('*.log')).toBe(false);
      expect(isDirectoryOnlyPattern('.env')).toBe(false);
      expect(isDirectoryOnlyPattern('src/build')).toBe(false);
    });
  });
});
