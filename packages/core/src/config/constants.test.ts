/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
  DEFAULT_FILE_FILTERING_OPTIONS,
  type FileFilteringOptions,
} from './constants.js';

describe('config constants', () => {
  describe('FileFilteringOptions type', () => {
    it('should require respectGitIgnore property', () => {
      const options: FileFilteringOptions = {
        respectGitIgnore: true,
        respectGeminiIgnore: false,
      };
      expect(options.respectGitIgnore).toBeDefined();
    });

    it('should require respectGeminiIgnore property', () => {
      const options: FileFilteringOptions = {
        respectGitIgnore: false,
        respectGeminiIgnore: true,
      };
      expect(options.respectGeminiIgnore).toBeDefined();
    });
  });

  describe('DEFAULT_MEMORY_FILE_FILTERING_OPTIONS', () => {
    it('should have respectGitIgnore set to false', () => {
      expect(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS.respectGitIgnore).toBe(
        false,
      );
    });

    it('should have respectGeminiIgnore set to true', () => {
      expect(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS.respectGeminiIgnore).toBe(
        true,
      );
    });

    it('should be a valid FileFilteringOptions object', () => {
      const options: FileFilteringOptions =
        DEFAULT_MEMORY_FILE_FILTERING_OPTIONS;
      expect(options).toBeDefined();
      expect(typeof options.respectGitIgnore).toBe('boolean');
      expect(typeof options.respectGeminiIgnore).toBe('boolean');
    });

    it('should be an object with exactly 2 properties', () => {
      const keys = Object.keys(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS);
      expect(keys).toHaveLength(2);
      expect(keys).toContain('respectGitIgnore');
      expect(keys).toContain('respectGeminiIgnore');
    });
  });

  describe('DEFAULT_FILE_FILTERING_OPTIONS', () => {
    it('should have respectGitIgnore set to true', () => {
      expect(DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore).toBe(true);
    });

    it('should have respectGeminiIgnore set to true', () => {
      expect(DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore).toBe(true);
    });

    it('should be a valid FileFilteringOptions object', () => {
      const options: FileFilteringOptions = DEFAULT_FILE_FILTERING_OPTIONS;
      expect(options).toBeDefined();
      expect(typeof options.respectGitIgnore).toBe('boolean');
      expect(typeof options.respectGeminiIgnore).toBe('boolean');
    });

    it('should be an object with exactly 2 properties', () => {
      const keys = Object.keys(DEFAULT_FILE_FILTERING_OPTIONS);
      expect(keys).toHaveLength(2);
      expect(keys).toContain('respectGitIgnore');
      expect(keys).toContain('respectGeminiIgnore');
    });
  });

  describe('comparison between default options', () => {
    it('should have different respectGitIgnore values', () => {
      expect(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS.respectGitIgnore).not.toBe(
        DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
      );
    });

    it('should have same respectGeminiIgnore values', () => {
      expect(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS.respectGeminiIgnore).toBe(
        DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore,
      );
    });

    it('should respect Gemini ignore in both cases', () => {
      expect(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS.respectGeminiIgnore).toBe(
        true,
      );
      expect(DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore).toBe(true);
    });

    it('should only ignore git files for regular files, not memory files', () => {
      expect(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS.respectGitIgnore).toBe(
        false,
      );
      expect(DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore).toBe(true);
    });
  });

  describe('immutability checks', () => {
    it('should not share references between the two constants', () => {
      expect(DEFAULT_MEMORY_FILE_FILTERING_OPTIONS).not.toBe(
        DEFAULT_FILE_FILTERING_OPTIONS,
      );
    });
  });
});
