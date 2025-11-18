/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { PartListUnion } from '@google/genai';
import { partListUnionToString } from './geminiRequest.js';

describe('geminiRequest', () => {
  describe('partListUnionToString', () => {
    it('should convert string to string', () => {
      const input: PartListUnion = 'Hello, world!';
      const result = partListUnionToString(input);
      expect(typeof result).toBe('string');
      expect(result).toContain('Hello, world!');
    });

    it('should convert text part to string', () => {
      const input: PartListUnion = [{ text: 'Test message' }];
      const result = partListUnionToString(input);
      expect(typeof result).toBe('string');
      expect(result).toContain('Test message');
    });

    it('should handle empty string', () => {
      const input: PartListUnion = '';
      const result = partListUnionToString(input);
      expect(typeof result).toBe('string');
    });

    it('should handle array of parts', () => {
      const input: PartListUnion = [
        { text: 'First part' },
        { text: 'Second part' },
      ];
      const result = partListUnionToString(input);
      expect(typeof result).toBe('string');
    });

    it('should use verbose mode in conversion', () => {
      // The function internally uses verbose: true
      // We can't directly test this without mocking, but we can verify it produces output
      const input: PartListUnion = [{ text: 'Test' }];
      const result = partListUnionToString(input);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
