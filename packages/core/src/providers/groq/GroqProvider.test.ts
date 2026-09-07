/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GroqProvider } from './GroqProvider.js';

describe('GroqProvider', () => {
  it('initializes with groq defaults', () => {
    const provider = new GroqProvider();
    expect(provider.name).toBe('groq');
  });

  it('accepts custom default model and api key', () => {
    const provider = new GroqProvider({
      apiKey: 'gsk_test_key',
      defaultModel: 'llama-3.1-8b-instant',
    });
    expect(provider.getApiKey()).toBe('gsk_test_key');
  });
});
