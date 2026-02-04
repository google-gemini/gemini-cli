/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { flattenMemory } from './memory.js';

describe('memory', () => {
  describe('flattenMemory', () => {
    it('should return empty string for null or undefined', () => {
      expect(flattenMemory(undefined)).toBe('');
      expect(flattenMemory(null as unknown as undefined)).toBe('');
    });

    it('should return the string itself if a string is provided', () => {
      expect(flattenMemory('raw string')).toBe('raw string');
    });

    it('should return empty string for an empty object', () => {
      expect(flattenMemory({})).toBe('');
    });

    it('should return content without headers if only global memory is present', () => {
      expect(flattenMemory({ global: 'global content' })).toBe(
        'global content',
      );
    });

    it('should return content without headers if only extension memory is present', () => {
      expect(flattenMemory({ extension: 'extension content' })).toBe(
        'extension content',
      );
    });

    it('should return content without headers if only project memory is present', () => {
      expect(flattenMemory({ project: 'project content' })).toBe(
        'project content',
      );
    });

    it('should include headers if multiple levels are present (global + project)', () => {
      const result = flattenMemory({
        global: 'global content',
        project: 'project content',
      });
      expect(result).toContain('--- Global ---');
      expect(result).toContain('global content');
      expect(result).toContain('--- Project ---');
      expect(result).toContain('project content');
      expect(result).not.toContain('--- Extension ---');
    });

    it('should include headers if all levels are present', () => {
      const result = flattenMemory({
        global: 'global content',
        extension: 'extension content',
        project: 'project content',
      });
      expect(result).toContain('--- Global ---');
      expect(result).toContain('--- Extension ---');
      expect(result).toContain('--- Project ---');
      expect(result).toBe(
        `--- Global ---
global content

--- Extension ---
extension content

--- Project ---
project content`,
      );
    });

    it('should trim content and ignore empty strings', () => {
      const result = flattenMemory({
        global: '  trimmed global  ',
        extension: '   ',
        project: 'project\n',
      });
      expect(result).toBe(
        `--- Global ---
trimmed global

--- Project ---
project`,
      );
    });

    it('should return empty string if all levels are only whitespace', () => {
      expect(
        flattenMemory({
          global: '  ',
          extension: '\n',
          project: ' 	 ',
        }),
      ).toBe('');
    });
  });
});
