/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { normalizeToolName, getClosestMatch } from './fuzzy-matcher.js';

describe('fuzzy-matcher', () => {
  describe('normalizeToolName', () => {
    it('converts kebab-case to snake_case', () => {
      expect(normalizeToolName('read-file')).toBe('read_file');
      expect(normalizeToolName('read_file')).toBe('read_file');
      expect(normalizeToolName('read-many-files')).toBe('read_many_files');
    });
  });

  describe('getClosestMatch', () => {
    const availableTools = ['read_file', 'write_file', 'list_directory'];

    it('returns the exact match if it exists', () => {
      const result = getClosestMatch('read_file', availableTools);
      expect(result.repairedName).toBe('read_file');
      expect(result.distance).toBe(0);
      expect(result.isAmbiguous).toBe(false);
    });

    it('finds a match with distance 1', () => {
      const result = getClosestMatch('read_fil', availableTools);
      expect(result.repairedName).toBe('read_file');
      expect(result.distance).toBe(1);
    });

    it('finds a match with distance 2', () => {
      const result = getClosestMatch('rd_file', availableTools);
      expect(result.repairedName).toBe('read_file');
      expect(result.distance).toBe(2);
    });

    it('returns no match if distance > maxDistance', () => {
      const result = getClosestMatch('something_else', availableTools, 2);
      expect(result.repairedName).toBeUndefined();
      expect(result.distance).toBeGreaterThan(2);
    });

    it('returns ambiguous if multiple matches at the same distance', () => {
      const result = getClosestMatch(
        'read_file',
        ['read_file_1', 'read_file_2'],
        2,
      );
      expect(result.isAmbiguous).toBe(true);
      expect(result.repairedName).toBeUndefined();
    });

    it('respects a custom maxDistance', () => {
      const result = getClosestMatch('rd_file', availableTools, 1);
      expect(result.repairedName).toBeUndefined();
      expect(result.distance).toBe(2);
    });
  });
});
