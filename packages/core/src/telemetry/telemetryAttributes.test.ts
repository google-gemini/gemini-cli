/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  getCommonAttributes,
  getCommonMetricAttributes,
} from './telemetryAttributes.js';
import type { Config } from '../config/config.js';
import { UserAccountManager } from '../utils/userAccountManager.js';
import { InstallationManager } from '../utils/installationManager.js';

vi.mock('../utils/userAccountManager.js');
vi.mock('../utils/installationManager.js');

describe('telemetryAttributes', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('mock-session-id'),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue(undefined),
      getContentGeneratorConfig: vi.fn().mockReturnValue(undefined),
    };

    (
      UserAccountManager.prototype.getCachedGoogleAccount as Mock
    ).mockReturnValue(undefined);
    (InstallationManager.prototype.getInstallationId as Mock).mockReturnValue(
      'mock-install-id',
    );
  });

  describe('getCommonMetricAttributes', () => {
    it('should return interactive and auth_type when defined', () => {
      mockConfig.getContentGeneratorConfig = vi
        .fn()
        .mockReturnValue({ authType: 'oauth-personal' });

      const attributes = getCommonMetricAttributes(mockConfig as Config);

      expect(attributes).toEqual({
        interactive: true,
        auth_type: 'oauth-personal',
      });
    });

    it('should return only interactive when auth_type is not defined', () => {
      const attributes = getCommonMetricAttributes(mockConfig as Config);

      expect(attributes).toEqual({
        interactive: true,
      });
    });
  });

  describe('getCommonAttributes', () => {
    it('should include all common attributes', () => {
      (
        UserAccountManager.prototype.getCachedGoogleAccount as Mock
      ).mockReturnValue('test@google.com');
      mockConfig.getExperiments = vi
        .fn()
        .mockReturnValue({ experimentIds: [123, 456] });
      mockConfig.getContentGeneratorConfig = vi
        .fn()
        .mockReturnValue({ authType: 'adc' });

      const attributes = getCommonAttributes(mockConfig as Config);

      expect(attributes).toEqual({
        'session.id': 'mock-session-id',
        'installation.id': 'mock-install-id',
        interactive: true,
        'user.email': 'test@google.com',
        auth_type: 'adc',
        'experiments.ids': '123,456',
      });
    });

    it('should safely truncate experiments string to not exceed 1000 characters and not cut mid-ID', () => {
      // Generate a list of experiment IDs that will produce a string > 1000 chars
      const expIds = [];
      for (let i = 0; i < 200; i++) {
        // e.g., 100000000 -> 9 chars + 1 comma = 10 chars per ID
        expIds.push(100000000 + i);
      }
      mockConfig.getExperiments = vi
        .fn()
        .mockReturnValue({ experimentIds: expIds });

      const attributes = getCommonAttributes(mockConfig as Config);
      const expString = attributes['experiments.ids'] as string;

      expect(expString.length).toBeLessThanOrEqual(1000);

      // Verify the last ID is complete (not cut off) by checking if it's one of our expected IDs
      const ids = expString.split(',');
      const lastIdStr = ids[ids.length - 1];
      const lastIdNumber = parseInt(lastIdStr, 10);

      expect(lastIdNumber).toBeGreaterThanOrEqual(100000000);
      expect(lastIdNumber).toBeLessThan(100000200);

      // Also ensure no trailing comma
      expect(expString.endsWith(',')).toBe(false);
    });
  });
});
