/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { deriveStableId } from './cryptoUtils.js';

describe('cryptoUtils', () => {
  describe('deriveStableId', () => {
    it('should be deterministic regardless of input order', () => {
      const id1 = deriveStableId(['a', 'b', 'c']);
      const id2 = deriveStableId(['c', 'b', 'a']);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should produce different IDs for different inputs', () => {
      const id1 = deriveStableId(['a', 'b', 'c']);
      const id2 = deriveStableId(['a', 'b', 'd']);
      expect(id1).not.toBe(id2);
    });

    it('should handle single inputs', () => {
      const id = deriveStableId(['only-one']);
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should be consistent across calls with same data', () => {
      const input = ['id-123', 'id-456'];
      expect(deriveStableId(input)).toBe(deriveStableId(input));
    });
  });
});
