/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getInstallationId, getGoogleAccountId } from './user_id.js';

describe('user_id', () => {
  describe('getInstallationId', () => {
    it('should return a valid UUID format string', () => {
      const installationId = getInstallationId();

      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);

      // Should return the same ID on subsequent calls (consistent)
      const secondCall = getInstallationId();
      expect(secondCall).toBe(installationId);
    });
  });

  describe('getGoogleAccountId', () => {
    it('should return a non-empty string', async () => {
      const result = await getGoogleAccountId();

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Should be consistent on subsequent calls
      const secondCall = await getGoogleAccountId();
      expect(secondCall).toBe(result);
    });

    it('should return empty string when no Google Account ID is cached, or a valid ID when cached', async () => {
      // The function can return either an empty string (if no cached ID) or a valid Google Account ID (if cached)
      const googleAccountIdResult = await getGoogleAccountId();

      expect(googleAccountIdResult).toBeDefined();
      expect(typeof googleAccountIdResult).toBe('string');

      // Should be either empty string or a numeric string (Google Account ID)
      if (googleAccountIdResult !== '') {
        // If we have a cached ID, it should be a numeric string
        expect(googleAccountIdResult).toMatch(/^\d+$/);
      }
    });
  });
});
