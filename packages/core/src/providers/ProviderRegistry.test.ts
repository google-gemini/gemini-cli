/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from './ProviderRegistry.js';

describe('ProviderRegistry', () => {
  it('registers local CLI providers and daemons by default', () => {
    const registry = new ProviderRegistry();
    const providers = registry.getRegisteredProviderNames();

    expect(providers).toContain('placeholder');
    expect(providers).toContain('ollama');
    expect(providers).toContain('agy');
    expect(providers).toContain('codex');
    expect(providers).toContain('claude');

    // External API providers are removed
    expect(providers).not.toContain('groq');
    expect(providers).not.toContain('openrouter');
    expect(providers).not.toContain('openai');
  });

  it('resolves to Antigravity (gemini-3.8-flash-high) by default when no model is specified', () => {
    const registry = new ProviderRegistry();
    const resolved = registry.resolve();
    expect(resolved.provider.name).toBe('agy');
    expect(resolved.model).toBe('gemini-3.8-flash-high');
  });

  it('still resolves placeholder when explicitly requested', () => {
    const registry = new ProviderRegistry();
    const resolved = registry.resolve('placeholder');
    expect(resolved.provider.name).toBe('placeholder');
    expect(resolved.model).toBe('placeholder');
  });

  it('resolves bare provider names to their default models', () => {
    const registry = new ProviderRegistry();

    const agy = registry.resolve('agy');
    expect(agy.provider.name).toBe('agy');
    expect(agy.model).toBe('gemini-3.8-flash-high');

    const antigravity = registry.resolve('antigravity');
    expect(antigravity.provider.name).toBe('agy');
    expect(antigravity.model).toBe('gemini-3.8-flash-high');

    const codex = registry.resolve('codex');
    expect(codex.provider.name).toBe('codex');
    expect(codex.model).toBe('gpt-6-astra');

    const claude = registry.resolve('claude');
    expect(claude.provider.name).toBe('claude');
    expect(claude.model).toBe('claude-3-7-sonnet');

    const claudecode = registry.resolve('claudecode');
    expect(claudecode.provider.name).toBe('claude');
    expect(claudecode.model).toBe('claude-3-7-sonnet');

    const ollama = registry.resolve('ollama');
    expect(ollama.provider.name).toBe('ollama');
    expect(ollama.model).toBe('llama3.2');
  });

  it('resolves explicit provider:model format', () => {
    const registry = new ProviderRegistry();

    const agyModel = registry.resolve('agy:claude-sonnet-4-6');
    expect(agyModel.provider.name).toBe('agy');
    expect(agyModel.model).toBe('claude-sonnet-4-6');

    const codexModel = registry.resolve('codex:o3');
    expect(codexModel.provider.name).toBe('codex');
    expect(codexModel.model).toBe('o3');

    const claudeModel = registry.resolve('claude:claude-3-5-sonnet');
    expect(claudeModel.provider.name).toBe('claude');
    expect(claudeModel.model).toBe('claude-3-5-sonnet');

    const ollamaModel = registry.resolve('ollama:qwen2.5-coder');
    expect(ollamaModel.provider.name).toBe('ollama');
    expect(ollamaModel.model).toBe('qwen2.5-coder');
  });

  it('resolves direct model name aliases to corresponding CLI tools', () => {
    const registry = new ProviderRegistry();

    // Antigravity models
    const gemini = registry.resolve('gemini-3.8-flash-high');
    expect(gemini.provider.name).toBe('agy');
    expect(gemini.model).toBe('gemini-3.8-flash-high');

    const claudeAgy = registry.resolve('claude-sonnet-4-6');
    expect(claudeAgy.provider.name).toBe('agy');
    expect(claudeAgy.model).toBe('claude-sonnet-4-6');

    // Codex models
    const gpt6 = registry.resolve('gpt-6-astra');
    expect(gpt6.provider.name).toBe('codex');
    expect(gpt6.model).toBe('gpt-6-astra');

    const o3 = registry.resolve('o3');
    expect(o3.provider.name).toBe('codex');
    expect(o3.model).toBe('o3');

    const gpt4 = registry.resolve('gpt-4o');
    expect(gpt4.provider.name).toBe('codex');
    expect(gpt4.model).toBe('gpt-4o');

    // Claude Code models
    const claudeCode = registry.resolve('claude-3-7-sonnet');
    expect(claudeCode.provider.name).toBe('claude');
    expect(claudeCode.model).toBe('claude-3-7-sonnet');

    // Fallback models default to Ollama
    const mistral = registry.resolve('mistral');
    expect(mistral.provider.name).toBe('ollama');
    expect(mistral.model).toBe('mistral');
  });
});
