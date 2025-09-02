/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment, loadSettings } from './settings.js';

const ENV_PATH = path.resolve(process.cwd(), '.env');

// Save or update GEMINI_API_KEY in .env file.
export function saveGeminiApiKeyToEnvFile(key: string): boolean {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(ENV_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Read existing env file content (if exists)
    let envContent = fs.existsSync(ENV_PATH)
      ? fs.readFileSync(ENV_PATH, 'utf-8')
      : '';

    const regex = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=.*$/m;
    const newLine = `GEMINI_API_KEY="${key}"`;

    if (regex.test(envContent)) {
      // Replace existing GEMINI_API_KEY
      envContent = envContent.replace(regex, newLine);
    } else {
      // Append GEMINI_API_KEY to the end
      envContent += (envContent.trim().length ? '\n' : '') + newLine + '\n';
    }

    // Write back to the .env file
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
    return true;
  } catch (error) {
    console.error(`[Error] Failed to save GEMINI_API_KEY:`, error);
    return false;
  }
}

export function validateAuthMethod(authMethod: string): string | null {
  loadEnvironment(loadSettings(process.cwd()).merged);
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.CLOUD_SHELL
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env['GEMINI_API_KEY']) {
      return 'GEMINI_API_KEY environment variable not found. Please provide one to continue.';
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
