/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateAuthMethod } from './auth.js';
import fs from 'node:fs';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    loadApiKey: vi.fn().mockResolvedValue(null),
  };
});

const { mockSettings } = vi.hoisted(() => ({
  mockSettings: {
    merged: {
      security: {
        auth: {
          byoidConfigPath: undefined as string | undefined,
        },
      },
      experimental: {
        byoid: false as boolean,
      },
    },
  },
}));

vi.mock('./settings.js', () => ({
  loadEnvironment: vi.fn(),
  loadSettings: vi.fn(() => mockSettings),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

describe('validateAuthMethod', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', undefined);
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', undefined);
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', undefined);
    vi.stubEnv('GOOGLE_API_KEY', undefined);
    mockSettings.merged.security.auth.byoidConfigPath = undefined;
    mockSettings.merged.experimental.byoid = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
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
      description:
        'should return null for BYOID if experimental.byoid is true, and byoidConfigPath is set and exists',
      authType: AuthType.BYOID,
      envs: {},
      byoidEnabled: true,
      byoidConfigPath: '/path/to/config',
      fsExists: true,
      expected: null,
    },
    {
      description:
        'should return error for BYOID if experimental.byoid is false',
      authType: AuthType.BYOID,
      envs: {},
      byoidEnabled: false,
      expected:
        'BYOID authentication is experimental and must be enabled via experimental.byoid in settings.',
    },
    {
      description:
        'should return error for BYOID if byoidConfigPath is not set',
      authType: AuthType.BYOID,
      envs: {},
      byoidEnabled: true,
      expected:
        'When using BYOID, you must specify the security.auth.byoidConfigPath setting.\n' +
        'Update your settings and try again!',
    },
    {
      description:
        'should return error for BYOID if byoidConfigPath does not exist',
      authType: AuthType.BYOID,
      envs: {},
      byoidEnabled: true,
      byoidConfigPath: '/non/existent/path',
      fsExists: false,
      expected: 'BYOID configuration file not found at: /non/existent/path',
    },
    {
      description:
        'should return null for BYOID if experimentalByoid argument is true, even if settings are false',
      authType: AuthType.BYOID,
      envs: {},
      experimentalByoidArg: true,
      byoidEnabled: false,
      byoidConfigPath: '/path/to/config',
      fsExists: true,
      expected: null,
    },
    {
      description:
        'should return error for BYOID if experimentalByoid argument is false and settings are false',
      authType: AuthType.BYOID,
      envs: {},
      experimentalByoidArg: false,
      byoidEnabled: false,
      expected:
        'BYOID authentication is experimental and must be enabled via experimental.byoid in settings.',
    },
    {
      description: 'should return an error message for an invalid auth method',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authType: 'invalid' as any,
      envs: {},
      expected: 'Invalid auth method selected.',
    },
  ])(
    '$description',
    async ({
      authType,
      envs,
      expected,
      byoidConfigPath,
      fsExists,
      byoidEnabled,
      experimentalByoidArg,
    }) => {
      for (const [key, value] of Object.entries(envs)) {
        vi.stubEnv(key, value as string);
      }
      if (byoidConfigPath !== undefined) {
        mockSettings.merged.security.auth.byoidConfigPath = byoidConfigPath;
      }
      if (byoidEnabled !== undefined) {
        mockSettings.merged.experimental.byoid = byoidEnabled;
      }
      if (fsExists !== undefined) {
        vi.mocked(fs.existsSync).mockReturnValue(fsExists);
      }
      expect(await validateAuthMethod(authType, experimentalByoidArg)).toBe(
        expected,
      );
    },
  );
});
