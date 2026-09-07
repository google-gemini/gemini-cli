/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAiCompatibleProvider } from '../openai/OpenAiCompatibleProvider.js';

export interface OpenRouterProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
}

export class OpenRouterProvider extends OpenAiCompatibleProvider {
  constructor(options: OpenRouterProviderOptions = {}) {
    super({
      name: 'openrouter',
      baseUrl: options.baseUrl || 'https://openrouter.ai/api/v1',
      defaultModel: options.defaultModel || 'meta-llama/llama-3.3-70b-instruct',
      apiKeyEnvVar: 'OPENROUTER_API_KEY',
      apiKey: options.apiKey,
      extraHeaders: {
        'HTTP-Referer': 'https://github.com/Abinjshaju/cli-zoe',
        'X-Title': 'Zoe Socratic Engineering Platform',
      },
      keyHelpMessage:
        'OpenRouter API key is not configured. Set the OPENROUTER_API_KEY environment variable or run "/key openrouter <your_key>". Obtain a key at https://openrouter.ai/keys',
    });
  }
}
