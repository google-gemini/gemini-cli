/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, loadApiKey } from '@google/gemini-cli-core';
import { loadEnvironment, loadSettings } from './settings.js';

export async function validateAuthMethod(
  authMethod: string,
): Promise<string | null> {
  loadEnvironment(loadSettings().merged, process.cwd());
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.COMPUTE_ADC
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    const key = process.env['GEMINI_API_KEY'] || (await loadApiKey());
    if (!key) {
      return (
        'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.\n' +
        'Update your environment and try again (no reload needed if using .env)!'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProject =
      !!process.env['GOOGLE_CLOUD_PROJECT'] ||
      !!process.env['GOOGLE_CLOUD_PROJECT_ID'];
    const hasVertexLocation = !!process.env['GOOGLE_CLOUD_LOCATION'];
    const hasVertexProjectLocationConfig =
      hasVertexProject && hasVertexLocation;
    const hasGoogleApiKey = !!process.env['GOOGLE_API_KEY'];
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      if (hasVertexProject && !hasVertexLocation) {
        return (
          'When using Vertex AI with a Google Cloud project, you must also specify the GOOGLE_CLOUD_LOCATION environment variable (or GOOGLE_API_KEY if using express mode).\n' +
          'Update your environment and try again (no reload needed if using .env)!'
        );
      }
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
