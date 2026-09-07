/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { OpenRouterProvider } from './OpenRouterProvider.js';

describe('OpenRouterProvider', () => {
  it('initializes with openrouter defaults', () => {
    const provider = new OpenRouterProvider();
    expect(provider.name).toBe('openrouter');
  });

  it('accepts custom default model and api key', () => {
    const provider = new OpenRouterProvider({
      apiKey: 'custom-key',
      defaultModel: 'anthropic/claude-3.5-sonnet',
    });
    expect(provider.getApiKey()).toBe('custom-key');
  });
});
