/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment, loadSettings } from './settings.js';

export function validateAuthMethod(authMethod: string): string | null {
  const settings = loadSettings().merged;
  loadEnvironment(settings);
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.COMPUTE_ADC
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env['GEMINI_API_KEY']) {
      return (
        'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.\n' +
        'Update your environment and try again (no reload needed if using .env)!'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env['GOOGLE_CLOUD_PROJECT'] &&
      !!process.env['GOOGLE_CLOUD_LOCATION'];
    const hasGoogleApiKey = !!process.env['GOOGLE_API_KEY'];
    // Also check if project and location are in settings.json
    const hasProjectLocationInSettings =
      !!settings.project && !!settings.location;
    if (
      !hasVertexProjectLocationConfig &&
      !hasGoogleApiKey &&
      !hasProjectLocationInSettings
    ) {
      return (
        'When using Vertex AI, you must specify either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        '• project and location in settings.json.\n' +
        'Update your environment and try again (no reload needed if using .env)!'
      );
    }
    return null;
  }

  return 'Invalid auth method selected.';
}
