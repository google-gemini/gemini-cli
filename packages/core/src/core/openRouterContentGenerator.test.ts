/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOpenRouterContentGenerator } from './openRouterContentGenerator.js';
import { ContentGeneratorConfig, AuthType } from './contentGenerator.js';

describe('OpenRouter Content Generator', () => {
  const mockConfig: ContentGeneratorConfig = {
    model: 'google/gemini-2.5-flash',
    apiKey: 'test-api-key',
    authType: AuthType.USE_OPENROUTER,
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',
  };

  const mockHttpOptions = {
    headers: {
      'User-Agent': 'test-user-agent',
    },
  };

  it('should create content generator with correct configuration', () => {
    const generator = createOpenRouterContentGenerator(
      mockConfig,
      mockHttpOptions,
    );

    expect(generator).toBeDefined();
    expect(generator.generateContent).toBeDefined();
    expect(generator.generateContentStream).toBeDefined();
    expect(generator.countTokens).toBeDefined();
    expect(generator.embedContent).toBeDefined();
  });

  it('should estimate tokens correctly', async () => {
    const generator = createOpenRouterContentGenerator(
      mockConfig,
      mockHttpOptions,
    );

    const result = await generator.countTokens({
      model: 'google/gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello, how are you?' }],
        },
      ],
    });

    // "Hello, how are you?" is 19 characters, estimated as ~5 tokens
    expect(result.totalTokens).toBe(5);
    expect(result.cachedContentTokenCount).toBe(0);
  });

  it('should handle string content in countTokens', async () => {
    const generator = createOpenRouterContentGenerator(
      mockConfig,
      mockHttpOptions,
    );

    const result = await generator.countTokens({
      model: 'google/gemini-2.5-flash',
      contents: 'Hello world',
    });

    // "Hello world" is 11 characters, estimated as ~3 tokens
    expect(result.totalTokens).toBe(3);
  });

  it('should throw error for embedContent', async () => {
    const generator = createOpenRouterContentGenerator(
      mockConfig,
      mockHttpOptions,
    );

    await expect(
      generator.embedContent({
        model: 'text-embedding-ada-002',
        contents: ['test'],
      }),
    ).rejects.toThrow(
      'Embeddings are not supported through OpenRouter for Gemini models',
    );
  });
});

describe('Model mapping', () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalBaseUrl = process.env.OPENROUTER_BASE_URL;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    delete process.env.OPENROUTER_BASE_URL;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.OPENROUTER_BASE_URL;
    } else {
      process.env.OPENROUTER_BASE_URL = originalBaseUrl;
    }
  });

  it('maps Gemini aliases to OpenRouter format for the official endpoint', async () => {
    const { createContentGeneratorConfig } = await import(
      './contentGenerator.js'
    );
    const config = await createContentGeneratorConfig(
      'gemini-2.5-flash',
      AuthType.USE_OPENROUTER,
    );

    expect(config.model).toBe('google/gemini-2.5-flash');
  });

  it('keeps fully-qualified model IDs unchanged', async () => {
    const { createContentGeneratorConfig } = await import(
      './contentGenerator.js'
    );
    const config = await createContentGeneratorConfig(
      'google/gemini-2.5-flash',
      AuthType.USE_OPENROUTER,
    );

    expect(config.model).toBe('google/gemini-2.5-flash');
  });

  it('does not force non-Gemini models onto google/ for the official endpoint', async () => {
    const { createContentGeneratorConfig } = await import(
      './contentGenerator.js'
    );
    const config = await createContentGeneratorConfig(
      'glm-4.7',
      AuthType.USE_OPENROUTER,
    );

    expect(config.model).toBe('glm-4.7');
  });

  it('passes model IDs through unchanged for custom OpenRouter-compatible endpoints', async () => {
    process.env.OPENROUTER_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

    const { createContentGeneratorConfig } = await import(
      './contentGenerator.js'
    );
    const config = await createContentGeneratorConfig(
      'glm-4.7',
      AuthType.USE_OPENROUTER,
    );

    expect(config.model).toBe('glm-4.7');
  });
});
