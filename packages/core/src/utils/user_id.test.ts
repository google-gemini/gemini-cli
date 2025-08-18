/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getInstallationId } from './user_id.js';

describe('user_id', () => {
  describe('getInstallationId', () => {
    it('should return a valid UUID format string or undefined', () => {
      const installationId = getInstallationId();

      if (installationId !== undefined) {
        expect(typeof installationId).toBe('string');
        expect(installationId.length).toBeGreaterThan(0);

        // Should return the same ID on subsequent calls (consistent)
        const secondCall = getInstallationId();
        expect(secondCall).toBe(installationId);
      } else {
        // If undefined, subsequent calls should also be undefined (consistent)
        const secondCall = getInstallationId();
        expect(secondCall).toBeUndefined();
      }
    });
  });
});
