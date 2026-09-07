/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProvider } from './ModelProvider.js';
import { PlaceholderProvider } from './placeholder/PlaceholderProvider.js';
import { OllamaProvider } from './ollama/OllamaProvider.js';
import { AgyProvider } from './agy/AgyProvider.js';
import { CodexProvider } from './codex/CodexProvider.js';
import { ClaudeCodeProvider } from './claude/ClaudeCodeProvider.js';

export interface ResolvedProvider {
  provider: ModelProvider;
  model: string;
}

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();
  private defaultModel = 'gemini-3.8-flash-high';

  constructor() {
    this.register(new PlaceholderProvider());
    this.register(new OllamaProvider());
    this.register(new AgyProvider());
    this.register(new CodexProvider());
    this.register(new ClaudeCodeProvider());
  }

  public register(provider: ModelProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public get(name: string): ModelProvider | undefined {
    const lower = name.toLowerCase();
    if (lower === 'antigravity') {
      return this.providers.get('agy');
    }
    if (lower === 'claudecode' || lower === 'claude-code') {
      return this.providers.get('claude');
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

    // Bare provider names -> default model for each local tool
    if (lower === 'agy' || lower === 'antigravity') {
      const agy = this.get('agy') ?? new AgyProvider();
      return { provider: agy, model: 'gemini-3.8-flash-high' };
    }

    if (lower === 'codex') {
      const codex = this.get('codex') ?? new CodexProvider();
      return { provider: codex, model: 'gpt-6-astra' };
    }

    if (lower === 'claude' || lower === 'claudecode' || lower === 'claude-code') {
      const claude = this.get('claude') ?? new ClaudeCodeProvider();
      return { provider: claude, model: 'claude-3-7-sonnet' };
    }

    if (lower === 'ollama') {
      const ollama = this.get('ollama') ?? new OllamaProvider();
      return { provider: ollama, model: 'llama3.2' };
    }

    // Explicit format: provider:model (e.g. agy:claude-sonnet-4-6, codex:o3, claude:claude-3-5-sonnet)
    if (target.includes(':') && !target.startsWith('http')) {
      const [providerName, ...rest] = target.split(':');
      const innerModel = rest.join(':');
      const provider = this.get(providerName);
      if (provider) {
        return { provider, model: innerModel };
      }
    }

    // Direct Codex models (e.g. gpt-6-astra, o3, o1, gpt-4o)
    if (
      lower.startsWith('gpt-6') ||
      lower.startsWith('o3') ||
      lower.startsWith('o1') ||
      lower.startsWith('gpt-4')
    ) {
      const codex = this.get('codex') ?? new CodexProvider();
      return { provider: codex, model: target };
    }

    // Direct Antigravity models (e.g. gemini-3.8-flash-high, claude-sonnet-4-6, gpt-oss-120b-medium)
    if (
      lower.startsWith('gemini-') ||
      lower.startsWith('claude-sonnet-') ||
      lower.startsWith('claude-opus-') ||
      lower.startsWith('gpt-oss-')
    ) {
      const agy = this.get('agy') ?? new AgyProvider();
      return { provider: agy, model: target };
    }

    // Direct Claude Code models (e.g. claude-3-7-sonnet, claude-3-5-sonnet)
    if (lower.startsWith('claude-3-')) {
      const claude = this.get('claude') ?? new ClaudeCodeProvider();
      return { provider: claude, model: target };
    }

    // Default local provider for other models is Ollama
    const ollama = this.get('ollama') ?? new OllamaProvider();
    return {
      provider: ollama,
      model: target,
    };
  }
}
