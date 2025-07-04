/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { createContentGenerator, ContentGeneratorConfig, AuthType } from './contentGenerator';

describe('Ollama Integration in ContentGenerator', () => {
  const ollamaConfig: ContentGeneratorConfig = {
    model: 'test-ollama-model',
    authType: AuthType.OLLAMA,
    ollamaHost: 'http://localhost:11434',
  };

  it('createContentGenerator should return an OllamaClient instance for AuthType.OLLAMA', async () => {
    const generator = await createContentGenerator(ollamaConfig);
    // We can't directly check the class type if OllamaClient is not exported.
    // Instead, we'll check if it behaves like our placeholder OllamaClient.
    expect(generator).toBeDefined();
    expect(typeof generator.generateContent).toBe('function');
    expect(typeof generator.generateContentStream).toBe('function');
    expect(typeof generator.countTokens).toBe('function');
    expect(typeof generator.embedContent).toBe('function');
  });

  it('OllamaClient (via createContentGenerator) generateContent should return a placeholder response', async () => {
    const generator = await createContentGenerator(ollamaConfig);
    const response = await generator.generateContent({ contents: [] });
    expect(response.candidates[0].content.parts[0].text).toBe('Response from Ollama');
  });

  it('OllamaClient (via createContentGenerator) generateContentStream should return a placeholder stream', async () => {
    const generator = await createContentGenerator(ollamaConfig);
    const stream = await generator.generateContentStream({ contents: [] });
    const result = await stream.next();
    expect(result.value.candidates[0].content.parts[0].text).toBe('Response from Ollama stream');
  });

  it('OllamaClient (via createContentGenerator) countTokens should return a placeholder count', async () => {
    const generator = await createContentGenerator(ollamaConfig);
    const response = await generator.countTokens({ contents: [] });
    expect(response.totalTokens).toBe(0);
  });

  it('OllamaClient (via createContentGenerator) embedContent should return placeholder embeddings', async () => {
    const generator = await createContentGenerator(ollamaConfig);
    const response = await generator.embedContent({ contents: [] });
    expect(response.embeddings).toEqual([]);
  });

  // Add more tests here as OllamaClient functionality is built out:
  // - Test constructor with and without ollamaHost (would require exporting OllamaClient or more complex setup)
  // - Test API error handling (once actual API calls are made)
});
