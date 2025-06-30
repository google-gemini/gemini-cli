/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthType } from '@google/gemini-cli-core';
import { validateAuthMethod } from './auth';

// Mock config.js to avoid loading environment
vi.mock('./config.js', () => ({
  loadEnvironment: vi.fn(),
}));

describe('Authentication Module', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('validateAuthMethod', () => {
    it('returns null for LOGIN_WITH_GOOGLE_PERSONAL', () => {
      const result = validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE_PERSONAL);
      expect(result).toBeNull();
    });

    it('returns null for USE_GEMINI when GEMINI_API_KEY is present', () => {
      process.env.GEMINI_API_KEY = 'test-api-key';
      const result = validateAuthMethod(AuthType.USE_GEMINI);
      expect(result).toBeNull();
    });

    it('returns error for USE_GEMINI when GEMINI_API_KEY is missing', () => {
      delete process.env.GEMINI_API_KEY;
      const result = validateAuthMethod(AuthType.USE_GEMINI);
      expect(result).toContain('GEMINI_API_KEY environment variable not found');
    });

    it('returns null for USE_VERTEX_AI when GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are present', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);
      expect(result).toBeNull();
    });

    it('returns null for USE_VERTEX_AI when GOOGLE_API_KEY is present', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_LOCATION;
      process.env.GOOGLE_API_KEY = 'test-api-key';
      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);
      expect(result).toBeNull();
    });

    it('returns error for USE_VERTEX_AI when required environment variables are missing', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_LOCATION;
      delete process.env.GOOGLE_API_KEY;
      const result = validateAuthMethod(AuthType.USE_VERTEX_AI);
      expect(result).toContain('Must specify GOOGLE_GENAI_USE_VERTEXAI=true');
    });

    it('returns error for invalid auth method', () => {
      const result = validateAuthMethod('invalid-method' as AuthType);
      expect(result).toBe('Invalid auth method selected.');
    });
  });
});
