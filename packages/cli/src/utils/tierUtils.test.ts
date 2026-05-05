/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isUltraTier } from './tierUtils.js';

describe('tierUtils', () => {
  describe('isUltraTier', () => {
    it('should return true if tier name contains "ultra" (case-insensitive)', () => {
      expect(isUltraTier('Advanced Ultra')).toBe(true);
      expect(isUltraTier('gemini ultra')).toBe(true);
      expect(isUltraTier('ULTRA')).toBe(true);
    });

    it('should return false if tier name does not contain "ultra"', () => {
      expect(isUltraTier('Free')).toBe(false);
      expect(isUltraTier('Pro')).toBe(false);
      expect(isUltraTier('Standard')).toBe(false);
    });

    it('should return false if tier name is undefined', () => {
      expect(isUltraTier(undefined)).toBe(false);
    });
  });
});
