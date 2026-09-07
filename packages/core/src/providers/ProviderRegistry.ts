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
  }

  public register(provider: ModelProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public get(name: string): ModelProvider | undefined {
    return this.providers.get(name.toLowerCase());
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
    if (lower === 'groq') {
      const groq = this.get('groq') ?? new GroqProvider();
      return { provider: groq, model: 'qwen/qwen3.8-27b' };
    }

    if (lower === 'openrouter') {
      const openrouter = this.get('openrouter') ?? new OpenRouterProvider();
      return { provider: openrouter, model: 'meta-llama/llama-3.3-70b-instruct' };
    }

    if (lower === 'ollama') {
      const ollama = this.get('ollama') ?? new OllamaProvider();
      return { provider: ollama, model: 'llama3.2' };
    }

    // Explicit format: provider:model (e.g. groq:qwen/qwen3.8-27b, openrouter:anthropic/claude-3.5-sonnet)
    if (target.includes(':') && !target.startsWith('http')) {
      const [providerName, ...rest] = target.split(':');
      const innerModel = rest.join(':');
      const provider = this.get(providerName);
      if (provider) {
        return { provider, model: innerModel };
      }
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
