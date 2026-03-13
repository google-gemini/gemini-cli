/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateAuthMethod } from './auth.js';
import { AuthType } from '@google/gemini-cli-core';

// Mock the settings module
vi.mock('./settings.js', () => ({
  loadEnvironment: vi.fn(),
  loadSettings: vi.fn(() => ({
    merged: {},
  })),
}));

describe('validateAuthMethod', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('LOGIN_WITH_GOOGLE', () => {
    it('should return null when GOOGLE_CLOUD_PROJECT is set', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';

      const result = validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE);

      expect(result).toBeNull();
    });

    it('should return null when GOOGLE_CLOUD_PROJECT_ID is set', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'test-project';

      const result = validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE);

      expect(result).toBeNull();
    });

    it('should return error when neither variable is set', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      const result = validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE);

      expect(result).not.toBeNull();
      expect(result).toContain('GOOGLE_CLOUD_PROJECT');
      expect(result).toContain('Sign in with Google');
    });

    it('should return error for empty string', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = '';
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      const result = validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE);

      expect(result).not.toBeNull();
      expect(result).toContain('GOOGLE_CLOUD_PROJECT');
    });

    it('should return error for whitespace-only string', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = '   ';
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      const result = validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE);

      expect(result).not.toBeNull();
    });
  });

  describe('COMPUTE_ADC', () => {
    it('should return null regardless of GOOGLE_CLOUD_PROJECT', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      const result = validateAuthMethod(AuthType.COMPUTE_ADC);

      expect(result).toBeNull();
    });
  });

  describe('USE_GEMINI', () => {
    it('should return null when GEMINI_API_KEY is set', () => {
      process.env['GEMINI_API_KEY'] = 'test-api-key';

      const result = validateAuthMethod(AuthType.USE_GEMINI);

      expect(result).toBeNull();
    });

    it('should return error when GEMINI_API_KEY is not set', () => {
      delete process.env['GEMINI_API_KEY'];

      const result = validateAuthMethod(AuthType.USE_GEMINI);

      expect(result).not.toBeNull();
      expect(result).toContain('GEMINI_API_KEY');
    });
  });

  describe('USE_VERTEX_AI', () => {
    it('should return null when GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are set', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
      process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
      delete process.env['GOOGLE_API_KEY'];

      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);

      expect(result).toBeNull();
    });

    it('should return null when GOOGLE_API_KEY is set', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_LOCATION'];
      process.env['GOOGLE_API_KEY'] = 'test-api-key';

      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);

      expect(result).toBeNull();
    });

    it('should return error when neither configuration is complete', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_LOCATION'];
      delete process.env['GOOGLE_API_KEY'];

      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);

      expect(result).not.toBeNull();
      expect(result).toContain('Vertex AI');
    });

    it('should return error when only GOOGLE_CLOUD_PROJECT is set', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
      delete process.env['GOOGLE_CLOUD_LOCATION'];
      delete process.env['GOOGLE_API_KEY'];

      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);

      expect(result).not.toBeNull();
    });

    it('should return error when only GOOGLE_CLOUD_LOCATION is set', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
      delete process.env['GOOGLE_API_KEY'];

      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);

      expect(result).not.toBeNull();
    });
  });

  describe('Invalid auth method', () => {
    it('should return error for invalid auth method', () => {
      const result = validateAuthMethod('INVALID_AUTH_TYPE');

      expect(result).not.toBeNull();
      expect(result).toContain('Invalid auth method');
    });

    it('should return error for empty string', () => {
      const result = validateAuthMethod('');

      expect(result).not.toBeNull();
      expect(result).toContain('Invalid auth method');
    });

    it('should return error for null input', () => {
      const result = validateAuthMethod(null as unknown as string);

      expect(result).not.toBeNull();
      expect(result).toContain('Invalid auth method');
    });
  });
});
