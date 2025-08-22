/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getLicenseDisplay } from './license.js';
import { AuthType, UserTierId } from '@google/gemini-cli-core';

describe('getLicenseDisplay', () => {
  describe('Free Tier (Login with Google)', () => {
    it('should return Free Tier for LOGIN_WITH_GOOGLE', () => {
      expect(getLicenseDisplay(AuthType.LOGIN_WITH_GOOGLE)).toBe(
        'Free Tier (Login with Google)',
      );
    });

    it('should ignore userTier for LOGIN_WITH_GOOGLE', () => {
      expect(
        getLicenseDisplay(AuthType.LOGIN_WITH_GOOGLE, UserTierId.STANDARD),
      ).toBe('Free Tier (Login with Google)');
      expect(
        getLicenseDisplay(AuthType.LOGIN_WITH_GOOGLE, UserTierId.LEGACY),
      ).toBe('Free Tier (Login with Google)');
    });
  });

  describe('Gemini Code Assist (Google Workspace)', () => {
    it('should return GCA Standard for LOGIN_WITH_GOOGLE_GCA with STANDARD tier', () => {
      expect(
        getLicenseDisplay(AuthType.LOGIN_WITH_GOOGLE_GCA, UserTierId.STANDARD),
      ).toBe('Gemini Code Assist Standard (Google Workspace)');
    });

    it('should return GCA Enterprise for LOGIN_WITH_GOOGLE_GCA with LEGACY tier', () => {
      expect(
        getLicenseDisplay(AuthType.LOGIN_WITH_GOOGLE_GCA, UserTierId.LEGACY),
      ).toBe('Gemini Code Assist Enterprise (Google Workspace)');
    });

    it('should return generic GCA for LOGIN_WITH_GOOGLE_GCA without tier', () => {
      expect(getLicenseDisplay(AuthType.LOGIN_WITH_GOOGLE_GCA)).toBe(
        'Gemini Code Assist (Google Workspace)',
      );
    });

    it('should return generic GCA for LOGIN_WITH_GOOGLE_GCA with unknown tier', () => {
      expect(
        getLicenseDisplay(
          AuthType.LOGIN_WITH_GOOGLE_GCA,
          'unknown-tier' as UserTierId,
        ),
      ).toBe('Gemini Code Assist (Google Workspace)');
    });

    it('should return generic GCA for LOGIN_WITH_GOOGLE_GCA with FREE tier', () => {
      expect(
        getLicenseDisplay(AuthType.LOGIN_WITH_GOOGLE_GCA, UserTierId.FREE),
      ).toBe('Gemini Code Assist (Google Workspace)');
    });
  });

  describe('Gemini API Key', () => {
    it('should return Gemini API Key for USE_GEMINI', () => {
      expect(getLicenseDisplay(AuthType.USE_GEMINI)).toBe('Gemini API Key');
    });

    it('should ignore userTier for USE_GEMINI', () => {
      expect(getLicenseDisplay(AuthType.USE_GEMINI, UserTierId.STANDARD)).toBe(
        'Gemini API Key',
      );
    });
  });

  describe('Vertex AI', () => {
    it('should return Vertex AI for USE_VERTEX_AI', () => {
      expect(getLicenseDisplay(AuthType.USE_VERTEX_AI)).toBe('Vertex AI');
    });

    it('should ignore userTier for USE_VERTEX_AI', () => {
      expect(getLicenseDisplay(AuthType.USE_VERTEX_AI, UserTierId.LEGACY)).toBe(
        'Vertex AI',
      );
    });
  });

  describe('Cloud Shell', () => {
    it('should return Cloud Shell for CLOUD_SHELL', () => {
      expect(getLicenseDisplay(AuthType.CLOUD_SHELL)).toBe('Cloud Shell');
    });

    it('should ignore userTier for CLOUD_SHELL', () => {
      expect(getLicenseDisplay(AuthType.CLOUD_SHELL, UserTierId.STANDARD)).toBe(
        'Cloud Shell',
      );
    });
  });

  describe('Unknown auth types', () => {
    it('should return the auth type as-is for unknown values', () => {
      expect(getLicenseDisplay('custom-auth-type')).toBe('custom-auth-type');
      expect(getLicenseDisplay('oauth')).toBe('oauth');
      expect(getLicenseDisplay('unknown-auth')).toBe('unknown-auth');
    });

    it('should handle undefined gracefully', () => {
      expect(getLicenseDisplay(undefined as unknown as string)).toBe(undefined);
    });

    it('should handle null gracefully', () => {
      expect(getLicenseDisplay(null as unknown as string)).toBe(null);
    });

    it('should handle empty string', () => {
      expect(getLicenseDisplay('')).toBe('');
    });
  });
});
