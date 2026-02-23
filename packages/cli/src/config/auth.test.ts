/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateAuthMethod } from './auth.js';
import { loadEnvironment } from './settings.js';

vi.mock('./settings.js', () => ({
  loadEnvironment: vi.fn(),
  loadSettings: vi.fn().mockReturnValue({
    merged: {},
  }),
}));

describe('validateAuthMethod', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', undefined);
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', undefined);
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', undefined);
    vi.stubEnv('GOOGLE_API_KEY', undefined);
    vi.mocked(loadEnvironment).mockReturnValue({
      envFilePath: null,
      trustResult: { isTrusted: true, source: 'file' },
      isSandboxed: false,
      skippedDueToTrust: false,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      description: 'should return null for LOGIN_WITH_GOOGLE',
      authType: AuthType.LOGIN_WITH_GOOGLE,
      envs: {},
      expected: null,
    },
    {
      description: 'should return null for COMPUTE_ADC',
      authType: AuthType.COMPUTE_ADC,
      envs: {},
      expected: null,
    },
    {
      description: 'should return null for USE_GEMINI if GEMINI_API_KEY is set',
      authType: AuthType.USE_GEMINI,
      envs: { GEMINI_API_KEY: 'test-key' },
      expected: null,
    },
    {
      description:
        'should return an error message for USE_GEMINI if GEMINI_API_KEY is not set',
      authType: AuthType.USE_GEMINI,
      envs: {},
      expected:
        'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.\n' +
        'Update your environment and try again (no reload needed if using .env)!',
    },
    {
      description:
        'should return null for USE_VERTEX_AI if GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are set',
      authType: AuthType.USE_VERTEX_AI,
      envs: {
        GOOGLE_CLOUD_PROJECT: 'test-project',
        GOOGLE_CLOUD_LOCATION: 'test-location',
      },
      expected: null,
    },
    {
      description:
        'should return null for USE_VERTEX_AI if GOOGLE_API_KEY is set',
      authType: AuthType.USE_VERTEX_AI,
      envs: { GOOGLE_API_KEY: 'test-api-key' },
      expected: null,
    },
    {
      description:
        'should return an error message for USE_VERTEX_AI if no required environment variables are set',
      authType: AuthType.USE_VERTEX_AI,
      envs: {},
      expected:
        'When using Vertex AI, you must specify either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        'Update your environment and try again (no reload needed if using .env)!',
    },
    {
      description: 'should return an error message for an invalid auth method',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authType: 'invalid-method' as any,
      envs: {},
      expected: 'Invalid auth method selected.',
    },
  ])('$description', ({ authType, envs, expected }) => {
    for (const [key, value] of Object.entries(envs)) {
      vi.stubEnv(key, value as string);
    }
    expect(validateAuthMethod(authType)).toBe(expected);
  });

  it('adds trust guidance when a .env file is skipped in an untrusted workspace', () => {
    vi.mocked(loadEnvironment).mockReturnValue({
      envFilePath: '/tmp/project/.env',
      trustResult: { isTrusted: false, source: 'file' },
      isSandboxed: false,
      skippedDueToTrust: true,
    });

    expect(validateAuthMethod(AuthType.USE_GEMINI)).toBe(
      'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.\n' +
        'Update your environment and try again (no reload needed if using .env)!\n' +
        'Note: A .env file was found but not loaded because the current folder is untrusted.\n' +
        'Use the /permissions trust command to trust this folder and load workspace environment variables.',
    );
  });

  it('does not add trust guidance when no .env file was found', () => {
    vi.mocked(loadEnvironment).mockReturnValue({
      envFilePath: null,
      trustResult: { isTrusted: false, source: 'file' },
      isSandboxed: false,
      skippedDueToTrust: true,
    });

    expect(validateAuthMethod(AuthType.USE_GEMINI)).toBe(
      'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.\n' +
        'Update your environment and try again (no reload needed if using .env)!',
    );
  });
});
