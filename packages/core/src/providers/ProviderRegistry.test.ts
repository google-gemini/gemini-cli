/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from './ProviderRegistry.js';

describe('ProviderRegistry', () => {
  it('registers placeholder, ollama, groq, and openrouter by default', () => {
    const registry = new ProviderRegistry();
    const providers = registry.getRegisteredProviderNames();

    expect(providers).toContain('placeholder');
    expect(providers).toContain('ollama');
    expect(providers).toContain('groq');
    expect(providers).toContain('openrouter');
  });

  it('resolves bare provider names to their default models', () => {
    const registry = new ProviderRegistry();

    const groq = registry.resolve('groq');
    expect(groq.provider.name).toBe('groq');
    expect(groq.model).toBe('qwen/qwen3.8-27b');

    const openrouter = registry.resolve('openrouter');
    expect(openrouter.provider.name).toBe('openrouter');
    expect(openrouter.model).toBe('meta-llama/llama-3.3-70b-instruct');

    const ollama = registry.resolve('ollama');
    expect(ollama.provider.name).toBe('ollama');
    expect(ollama.model).toBe('llama3.2');
  });

  it('resolves explicit provider:model format', () => {
    const registry = new ProviderRegistry();

    const groqModel = registry.resolve('groq:llama-3.1-8b-instant');
    expect(groqModel.provider.name).toBe('groq');
    expect(groqModel.model).toBe('llama-3.1-8b-instant');

    const openrouterModel = registry.resolve('openrouter:anthropic/claude-3.5-sonnet');
    expect(openrouterModel.provider.name).toBe('openrouter');
    expect(openrouterModel.model).toBe('anthropic/claude-3.5-sonnet');
  });

  it('resolves slash prefixed provider names', () => {
    const registry = new ProviderRegistry();

    const groqSlash = registry.resolve('groq/mixtral-8x7b-32768');
    expect(groqSlash.provider.name).toBe('groq');
    expect(groqSlash.model).toBe('mixtral-8x7b-32768');

    const openrouterSlash = registry.resolve('openrouter/deepseek/deepseek-r1');
    expect(openrouterSlash.provider.name).toBe('openrouter');
    expect(openrouterSlash.model).toBe('deepseek/deepseek-r1');
  });

  it('auto-resolves known OpenRouter org prefixes', () => {
    const registry = new ProviderRegistry();

    const claude = registry.resolve('anthropic/claude-3.5-sonnet');
    expect(claude.provider.name).toBe('openrouter');
    expect(claude.model).toBe('anthropic/claude-3.5-sonnet');

    const deepseek = registry.resolve('deepseek/deepseek-r1');
    expect(deepseek.provider.name).toBe('openrouter');
    expect(deepseek.model).toBe('deepseek/deepseek-r1');
  });

  it('defaults simple model names to Ollama', () => {
    const registry = new ProviderRegistry();

    const res = registry.resolve('mistral');
    expect(res.provider.name).toBe('ollama');
    expect(res.model).toBe('mistral');
  });
});
