/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.js';

export interface OpenAiProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
}

export class OpenAiProvider extends OpenAiCompatibleProvider {
  constructor(options: OpenAiProviderOptions = {}) {
    super({
      name: 'openai',
      baseUrl: options.baseUrl || 'https://api.openai.com/v1',
      defaultModel: options.defaultModel || 'gpt-4o-mini',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      apiKey: options.apiKey,
      keyHelpMessage:
        'OpenAI API key is not configured. Set the OPENAI_API_KEY environment variable or run "/key openai <your_key>". Obtain a key at https://platform.openai.com/api-keys',
    });
  }
}
