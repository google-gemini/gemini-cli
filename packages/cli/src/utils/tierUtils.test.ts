/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { hasAccessToProModel, isUltraTier } from './tierUtils';
import { type Config } from '@google/gemini-cli-core';

describe('tierUtils', () => {
  describe('hasAccessToProModel', () => {
    it('should return true if config.getHasProModelAccessSync() returns true', () => {
      const mockConfig = {
        getHasProModelAccessSync: vi.fn().mockReturnValue(true),
      } as unknown as Config;
      expect(hasAccessToProModel(mockConfig)).toBe(true);
    });

    it('should return false if config.getHasProModelAccessSync() returns false', () => {
      const mockConfig = {
        getHasProModelAccessSync: vi.fn().mockReturnValue(false),
      } as unknown as Config;
      expect(hasAccessToProModel(mockConfig)).toBe(false);
    });

    it('should return false if config is null/undefined', () => {
      expect(hasAccessToProModel(null)).toBe(false);
      expect(hasAccessToProModel(undefined)).toBe(false);
    });
  });

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

    it('should accept Config object and check its tier name', () => {
      const mockConfig = {
        getUserTierName: vi.fn().mockReturnValue('Advanced Ultra'),
      } as unknown as Config;
      expect(isUltraTier(mockConfig)).toBe(true);
    });
  });
});
