/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { OpenAiProvider } from './OpenAiProvider.js';

describe('OpenAiProvider', () => {
  it('initializes with openai defaults', () => {
    const provider = new OpenAiProvider();
    expect(provider.name).toBe('openai');
  });

  it('accepts custom default model and api key', () => {
    const provider = new OpenAiProvider({
      apiKey: 'sk-test-key',
      defaultModel: 'gpt-4o',
    });
    expect(provider.getApiKey()).toBe('sk-test-key');
  });
});
