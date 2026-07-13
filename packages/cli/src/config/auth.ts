/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  loadApiKey,
  loadOpenAICredentials,
} from '@google/gemini-cli-core';
import { loadEnvironment, loadSettings } from './settings.js';

export async function validateAuthMethod(
  authMethod: string,
): Promise<string | null> {
  loadEnvironment(loadSettings().merged, process.cwd());

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

  if (authMethod === AuthType.USE_OPENAI) {
    const credentials = await loadOpenAICredentials();
    if (!process.env['OPENAI_BASE_URL'] && !credentials?.baseUrl) {
      return 'OpenAI-compatible credentials have not been configured. Select the OpenAI-compatible API auth method to enter them.';
    }
    return null;
  }

  return 'Invalid auth method selected.';
}
