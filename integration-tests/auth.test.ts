/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestRig, validateModelOutput } from './test-helper';

describe('auth tests', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should work with a valid GEMINI_API_KEY', async () => {
    const GEMINI_API_KEY = 'fake-api-key';
    await rig.setup('auth-gemini-api-key', {
      env: {
        GEMINI_API_KEY,
      },
    });

    const result = await rig.run('a prompt');
    validateModelOutput(result, 'OK', 'Auth with API Key');
  });

  it('should return an error if no auth is configured', async () => {
    await rig.setup('auth-no-auth');
    try {
      await rig.run('a prompt');
      // Should not reach here
      expect(true).toBe(false);
    } catch (e) {
      validateModelOutput(
        (e as Error).message,
        'Please set an Auth method in your config or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA',
        'No Auth Configured',
      );
    }
  });

  it('should work with Vertex AI', async () => {
    await rig.setup('auth-vertex-ai', {
      env: {
        GOOGLE_GENAI_USE_VERTEXAI: 'true',
        GOOGLE_CLOUD_PROJECT: 'test-project',
        GOOGLE_CLOUD_LOCATION: 'us-central1',
      },
    });

    const result = await rig.run('a prompt');
    validateModelOutput(result, 'OK', 'Auth with Vertex AI');
  });

  it('should work with Login with Google', async () => {
    // This test is a bit more involved as it mocks the OAuth flow.
    const mockCode = 'mock-auth-code';
    const mockState = 'mock-state';

    await rig.setup('auth-login-with-google', {
      settings: {
        security: {
          auth: {
            selectedType: 'oauth-personal',
          },
        },
      },
    });

    // Mock the google-auth-library
    vi.mock('google-auth-library', () => {
      const OAuth2Client = vi.fn(() => ({
        generateAuthUrl: vi.fn(
          () =>
            `http://localhost:7777/oauth2callback?code=${mockCode}&state=${mockState}`,
        ),
        getToken: vi.fn(() => ({
          tokens: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
          },
        })),
      }));
      return { OAuth2Client };
    });

    const { ptyProcess, promise } = rig.runInteractive('a prompt');

    ptyProcess.onData(async (data) => {
      if (data.includes('http://localhost:7777/oauth2callback')) {
        // Simulate the OAuth callback
        await fetch(
          `http://localhost:7777/oauth2callback?code=${mockCode}&state=${mockState}`,
        );
      }
    });

    const result = await promise;
    validateModelOutput(result.output, 'OK', 'Auth with Login with Google');
  });
});
