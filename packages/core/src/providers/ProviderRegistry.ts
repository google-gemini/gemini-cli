/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProvider } from './ModelProvider.js';
import { PlaceholderProvider } from './placeholder/PlaceholderProvider.js';
import { OllamaProvider } from './ollama/OllamaProvider.js';
import { GroqProvider } from './groq/GroqProvider.js';
import { OpenRouterProvider } from './openrouter/OpenRouterProvider.js';
import { OpenAiProvider } from './openai/OpenAiProvider.js';
import { AgyProvider } from './agy/AgyProvider.js';
import { CodexProvider } from './codex/CodexProvider.js';

export interface ResolvedProvider {
  provider: ModelProvider;
  model: string;
}

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();
  private defaultModel = 'placeholder';

  constructor() {
    this.register(new PlaceholderProvider());
    this.register(new OllamaProvider());
    this.register(new GroqProvider());
    this.register(new OpenRouterProvider());
    this.register(new OpenAiProvider());
    this.register(new AgyProvider());
    this.register(new CodexProvider());
  }

  public register(provider: ModelProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public get(name: string): ModelProvider | undefined {
    const lower = name.toLowerCase();
    if (lower === 'antigravity') {
      return this.providers.get('agy');
    }
    return this.providers.get(lower);
  }

  public getRegisteredProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  public resolve(modelName?: string): ResolvedProvider {
    const target = (modelName || this.defaultModel).trim();

    if (target === 'placeholder') {
      const placeholder = this.get('placeholder') ?? new PlaceholderProvider();
      return { provider: placeholder, model: 'placeholder' };
    }

    const lower = target.toLowerCase();

    // Bare provider names -> use default model for that provider
    if (lower === 'agy' || lower === 'antigravity') {
      const agy = this.get('agy') ?? new AgyProvider();
      return { provider: agy, model: 'gemini-3.8-flash-high' };
    }

    if (lower === 'codex') {
      const codex = this.get('codex') ?? new CodexProvider();
      return { provider: codex, model: 'gpt-6-astra' };
    }

    if (lower === 'groq') {
      const groq = this.get('groq') ?? new GroqProvider();
      return { provider: groq, model: 'qwen/qwen3.8-27b' };
    }

    if (lower === 'openrouter') {
      const openrouter = this.get('openrouter') ?? new OpenRouterProvider();
      return { provider: openrouter, model: 'meta-llama/llama-3.3-70b-instruct' };
    }

    if (lower === 'openai') {
      const openai = this.get('openai') ?? new OpenAiProvider();
      return { provider: openai, model: 'gpt-4o-mini' };
    }

    if (lower === 'ollama') {
      const ollama = this.get('ollama') ?? new OllamaProvider();
      return { provider: ollama, model: 'llama3.2' };
    }

    // Explicit format: provider:model (e.g. agy:gemini-3.8-flash-high, codex:gpt-6-astra, groq:qwen/qwen3.8-27b)
    if (target.includes(':') && !target.startsWith('http')) {
      const [providerName, ...rest] = target.split(':');
      const innerModel = rest.join(':');
      const provider = this.get(providerName);
      if (provider) {
        return { provider, model: innerModel };
      }
    }

    // Direct Codex models (e.g. gpt-6-astra)
    if (lower.startsWith('gpt-6')) {
      const codex = this.get('codex') ?? new CodexProvider();
      return { provider: codex, model: target };
    }

    // Direct Antigravity models (e.g. gemini-3.8-flash-high, claude-sonnet-4-6)
    if (
      lower.startsWith('gemini-3.') ||
      lower.startsWith('claude-sonnet-') ||
      lower.startsWith('claude-opus-')
    ) {
      const agy = this.get('agy') ?? new AgyProvider();
      return { provider: agy, model: target };
    }

    // Direct OpenAI model name aliases (gpt-4o, gpt-4o-mini, o1, o3-mini)
    if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3')) {
      const openai = this.get('openai') ?? new OpenAiProvider();
      return { provider: openai, model: target };
    }

    // Active models hosted on Groq
    const activeGroqModels = [
      'qwen/qwen3.8-27b',
      'qwen/qwen3.6-27b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'groq/compound',
      'groq/compound-mini',
      'allam-2-7b',
      'meta-llama/llama-prompt-guard-2-86m',
      'meta-llama/llama-prompt-guard-2-22m',
    ];
    if (activeGroqModels.includes(lower)) {
      const groq = this.get('groq') ?? new GroqProvider();
      return { provider: groq, model: target };
    }

    // Slash prefix formats (e.g. groq/qwen/qwen3.8-27b, openrouter/deepseek/deepseek-r1)
    if (lower.startsWith('groq/')) {
      const groq = this.get('groq') ?? new GroqProvider();
      return { provider: groq, model: target.slice('groq/'.length) };
    }

    if (lower.startsWith('openrouter/')) {
      const openrouter = this.get('openrouter') ?? new OpenRouterProvider();
      return { provider: openrouter, model: target.slice('openrouter/'.length) };
    }

    // Known multi-part OpenRouter org models (e.g. anthropic/..., meta-llama/..., deepseek/..., openai/...)
    const openrouterOrgs = ['anthropic/', 'meta-llama/', 'deepseek/', 'openai/', 'google/', 'mistralai/', 'qwen/'];
    if (openrouterOrgs.some((org) => lower.startsWith(org))) {
      const openrouter = this.get('openrouter') ?? new OpenRouterProvider();
      return { provider: openrouter, model: target };
    }

    // Default provider for other model names is Ollama
    const ollama = this.get('ollama') ?? new OllamaProvider();
    return {
      provider: ollama,
      model: target,
    };
  }
}
