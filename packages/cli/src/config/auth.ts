/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment, loadSettings } from './settings.js';

const GEMINI_API_KEY_ERROR =
  'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.\n' +
  'Update your environment and try again (no reload needed if using .env)!';

const UNTRUSTED_ENV_HINT =
  'Note: A .env file was found but not loaded because the current folder is untrusted.\n' +
  'Use the /permissions trust command to trust this folder and load workspace environment variables.';

function withUntrustedEnvHint(
  baseMessage: string,
  envLoadResult: ReturnType<typeof loadEnvironment>,
): string {
  if (envLoadResult.skippedDueToTrust && envLoadResult.envFilePath) {
    return `${baseMessage}\n${UNTRUSTED_ENV_HINT}`;
  }
  return baseMessage;
}

export function validateAuthMethod(authMethod: string): string | null {
  const envLoadResult = loadEnvironment(loadSettings().merged, process.cwd());
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.COMPUTE_ADC
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env['GEMINI_API_KEY']) {
      return withUntrustedEnvHint(GEMINI_API_KEY_ERROR, envLoadResult);
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env['GOOGLE_CLOUD_PROJECT'] &&
      !!process.env['GOOGLE_CLOUD_LOCATION'];
    const hasGoogleApiKey = !!process.env['GOOGLE_API_KEY'];
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        'When using Vertex AI, you must specify either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        'Update your environment and try again (no reload needed if using .env)!'
      );
    }
    return null;
  }

  return 'Invalid auth method selected.';
}
