/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProvider } from './ModelProvider.js';
import { PlaceholderProvider } from './placeholder/PlaceholderProvider.js';
import { OllamaProvider } from './ollama/OllamaProvider.js';

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
  }

  public register(provider: ModelProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public get(name: string): ModelProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  public resolve(modelName?: string): ResolvedProvider {
    const target = (modelName || this.defaultModel).trim();

    if (target === 'placeholder') {
      const placeholder = this.get('placeholder') ?? new PlaceholderProvider();
      return { provider: placeholder, model: 'placeholder' };
    }

    // Explicit format: provider:model (e.g. ollama:llama3.2)
    if (target.includes(':') && !target.startsWith('http')) {
      const [providerName, ...rest] = target.split(':');
      const innerModel = rest.join(':');
      const provider = this.get(providerName);
      if (provider) {
        return { provider, model: innerModel };
      }
    }

    // Default provider for models is Ollama
    const ollama = this.get('ollama') ?? new OllamaProvider();
    return {
      provider: ollama,
      model: target,
    };
  }
}
