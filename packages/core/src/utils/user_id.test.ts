/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getInstallationId, getGoogleAccountEmail } from './user_id.js';

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

  describe('getGoogleAccountEmail', () => {
    it('should return a non-empty string', () => {
      const result = getGoogleAccountEmail();

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Should be consistent on subsequent calls
      const secondCall = getGoogleAccountEmail();
      expect(secondCall).toBe(result);
    });

    it('should return empty string when no Google Account email is cached', () => {
      // In a clean test environment, there should be no cached Google Account email
      const googleAccountEmailResult = getGoogleAccountEmail();

      // They should be the same when no Google Account email is cached
      expect(googleAccountEmailResult).toBe('');
    });
  });
});
