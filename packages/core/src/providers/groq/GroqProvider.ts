/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAiCompatibleProvider } from '../openai/OpenAiCompatibleProvider.js';

export interface GroqProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
}

export class GroqProvider extends OpenAiCompatibleProvider {
  constructor(options: GroqProviderOptions = {}) {
    super({
      name: 'groq',
      baseUrl: options.baseUrl || 'https://api.groq.com/openai/v1',
      defaultModel: options.defaultModel || 'qwen/qwen3.8-27b',
      apiKeyEnvVar: 'GROQ_API_KEY',
      apiKey: options.apiKey,
      keyHelpMessage:
        'Groq API key is not configured. Set the GROQ_API_KEY environment variable or run "/key groq <your_key>". Obtain a fast, free key at https://console.groq.com/keys',
    });
  }
}
