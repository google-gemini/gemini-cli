/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, validateModelOutput } from './test-helper.js';
import { Storage } from '@google/gemini-cli-core';
import * as fs from 'node:fs';

describe('authentication', () => {
  let rig: TestRig;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
    // Restore original environment variables after each test
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const key in originalEnv) {
      process.env[key] = originalEnv[key];
    }
  });

  it('should fail when no auth environment variables are set', async () => {
    await rig.setup('auth-fail-test', {
      settings: {
        security: { auth: { enforcedType: '', selectedType: '' } },
      },
    });

    // Unset all authentication-related environment variables
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_LOCATION'];
    delete process.env['GOOGLE_GENAI_USE_GCA'];
    delete process.env['GOOGLE_GENAI_USE_VERTEXAI'];

    let thrown: Error | undefined;
    try {
      await rig.run('hello');
      expect.fail('Expected process to exit with error');
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeDefined();
    const message = (thrown as Error).message;

    // Check for a message that indicates an authentication failure.
    const isAuthError = message.includes('Please set an Auth method');

    expect(
      isAuthError,
      `Expected an authentication error, but got: ${message}`,
    ).toBe(true);
  });

  it('should succeed with GEMINI_API_KEY', async () => {
    // This test relies on GEMINI_API_KEY being set in the testing environment (e.g., via GitHub secrets)
    if (!process.env['GEMINI_API_KEY']) {
      console.warn('Skipping GEMINI_API_KEY test: key is not set.');
      return;
    }

    await rig.setup('auth-gemini-api-key-test', {
      settings: {
        security: {
          auth: {
            enforcedType: 'gemini-api-key',
            selectedType: 'gemini-api-key',
          },
        },
      },
    });

    // Unset other potentially conflicting auth variables
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_LOCATION'];
    const result = await rig.run({
      stdin: 'A one-word response: hi',
    });

    validateModelOutput(
      result,
      ['hi', 'hello', 'okay'],
      'GEMINI_API_KEY auth test',
    );
  });

  it('should succeed with Vertex AI authentication', async () => {
    // This test relies on Vertex AI credentials being configured in the test environment
    // and these two variables being set.
    if (
      !process.env['GOOGLE_CLOUD_PROJECT'] ||
      !process.env['GOOGLE_CLOUD_LOCATION']
    ) {
      console.warn(
        'Skipping Vertex AI test: GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_LOCATION is not set.',
      );
      return;
    }

    await rig.setup('auth-vertex-ai-test', {
      settings: {
        security: {
          auth: { enforcedType: 'vertex-ai', selectedType: 'vertex-ai' },
        },
      },
    });

    // Unset other keys to ensure Vertex AI ADC is used
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';

    const result = await rig.run('A one-word response: hi');

    validateModelOutput(result, ['hi', 'hello', 'okay'], 'Vertex AI auth test');
  });

  // TODO: Modify this test to check for cached keychain credentials once
  // keychain storage is enabled by default.
  it('should succeed with "Login with Google" (cached credentials)', async () => {
    // This test relies on cached OAuth credentials being available.
    if (!fs.existsSync(Storage.getOAuthCredsPath())) {
      console.warn(
        'Skipping "Login with Google" test: Cached credentials not found at ' +
          Storage.getOAuthCredsPath(),
      );
      return;
    }

    await rig.setup('auth-login-with-google-test', {
      settings: {
        security: {
          auth: {
            enforcedType: 'oauth-personal',
            selectedType: 'oauth-personal',
          },
        },
      },
    });

    // Unset other auth methods
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    delete process.env['GOOGLE_CLOUD_LOCATION'];
    process.env['GOOGLE_GENAI_USE_GCA'] = 'true';

    const result = await rig.run({
      stdin: 'A one-word response: hi',
    });

    validateModelOutput(
      result,
      ['hi', 'hello', 'okay'],
      '"Login with Google" auth test',
    );
  });

  it('should fail and prompt for browser login when no cached credentials exist', async () => {
    await rig.setup('auth-oauth-no-cache-fail-test', {
      settings: {
        security: {
          auth: {
            enforcedType: 'oauth-personal',
            selectedType: 'oauth-personal',
          },
        },
      },
    });
    // Unset all other auth methods AND the cached credentials variable
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    process.env['GOOGLE_GENAI_USE_GCA'] = 'true';
    // Point to a non-existent credentials file to prevent CLI from finding global cache
    process.env['FORCE_ENCRYPTED_FILE_ENV_VAR'] = 'false';
    process.env['GEMINI_OAUTH_CREDS_PATH'] = 'mock-creds.json';
    // Suppress the browser from opening in a non-interactive environment
    process.env['NO_BROWSER'] = 'true';

    // We expect this to fail because it's a non-interactive environment
    // and it will try to launch a browser.
    const interactiveRun = await rig.runInteractive(['hello'], {
      waitForReady: false,
    });

    await interactiveRun.expectText('Enter the authorization code:', 15000);

    // Kill the process once we've seen the prompt.
    await interactiveRun.kill();
    // Wait for the process to fully exit.
    await interactiveRun.expectExit();
  });
});
