/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, loadApiKey } from '@google/gemini-cli-core';
import { loadEnvironment, loadSettings } from './settings.js';
import fs from 'node:fs';

export async function validateAuthMethod(
  authMethod: string,
  experimentalByoid?: boolean,
): Promise<string | null> {
  const settings = loadSettings();
  loadEnvironment(settings.merged, process.cwd());
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

  if (authMethod === AuthType.BYOID) {
    const isByoidEnabled =
      experimentalByoid || settings.merged.experimental?.byoid;
    if (!isByoidEnabled) {
      return 'BYOID authentication is experimental and must be enabled via experimental.byoid in settings.';
    }
    const configPath = settings.merged.security.auth.byoidConfigPath;
    if (!configPath) {
      return (
        'When using BYOID, you must specify the security.auth.byoidConfigPath setting.\n' +
        'Update your settings and try again!'
      );
    }

    if (!fs.existsSync(configPath)) {
      return `BYOID configuration file not found at: ${configPath}`;
    }
    return null;
  }

  return 'Invalid auth method selected.';
}
