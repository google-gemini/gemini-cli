/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { OllamaProvider } from './OllamaProvider.js';
import type { ModelEvent } from '../ModelProvider.js';
import { ProviderRegistry } from '../ProviderRegistry.js';

describe('OllamaProvider', () => {
  it('instantiates with custom baseUrl and model', () => {
    const provider = new OllamaProvider({
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.2',
    });
    expect(provider.name).toBe('ollama');
  });

  it('handles connection error gracefully when endpoint is unreachable', async () => {
    // Point to an invalid local port that will refuse connections
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:59999' });
    const events: ModelEvent[] = [];

    for await (const event of provider.chat({ messages: [{ role: 'user', content: 'hello' }] })) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThanOrEqual(1);
    const firstChunk = events[0];
    expect(firstChunk.type).toBe('chunk');
    if (firstChunk.type === 'chunk') {
      expect(firstChunk.text).toContain('Cannot connect to Ollama');
    }
  });
});

describe('ProviderRegistry', () => {
  it('resolves placeholder provider', () => {
    const registry = new ProviderRegistry();
    const resolved = registry.resolve('placeholder');
    expect(resolved.provider.name).toBe('placeholder');
    expect(resolved.model).toBe('placeholder');
  });

  it('resolves ollama provider by default for named models', () => {
    const registry = new ProviderRegistry();
    const resolved = registry.resolve('llama3.2');
    expect(resolved.provider.name).toBe('ollama');
    expect(resolved.model).toBe('llama3.2');
  });

  it('resolves explicit provider:model format', () => {
    const registry = new ProviderRegistry();
    const resolved = registry.resolve('ollama:mistral');
    expect(resolved.provider.name).toBe('ollama');
    expect(resolved.model).toBe('mistral');
  });
});
