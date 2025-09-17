/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProviderConfig } from './types.js';
import { ModelProviderType } from './types.js';
import type { BaseModelProvider } from './BaseModelProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { LMStudioProvider } from './LMStudioProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import type { Config } from '../config/config.js';

export class ModelProviderFactory {
  private static providers: Map<string, BaseModelProvider> = new Map();
  private static currentProviderType: ModelProviderType | null = null;

  static create(config: ModelProviderConfig, configInstance?: Config): BaseModelProvider {
    const key = `${config.type}-${config.model}-${config.baseUrl || 'default'}`;
    
    // Defensive check to ensure providers Map is initialized
    if (!this.providers) {
      this.providers = new Map();
    }
    
    if (this.providers.has(key)) {
      const existingProvider = this.providers.get(key)!;
      existingProvider.updateConfig(config);
      // Update current provider type even when using cached provider
      this.currentProviderType = config.type;
      return existingProvider;
    }

    // Update current provider type
    this.currentProviderType = config.type;

    let provider: BaseModelProvider;

    switch (config.type) {
      case ModelProviderType.OPENAI:
        // OpenAIProvider will get authentication from AuthManager internally
        provider = new OpenAIProvider(config, configInstance);
        break;
      case ModelProviderType.LM_STUDIO:
        provider = new LMStudioProvider(config, configInstance);
        break;
        case ModelProviderType.GEMINI:
        // GeminiProvider will get authentication from AuthManager internally
        provider = new GeminiProvider(config, configInstance);
        break;
      case ModelProviderType.ANTHROPIC:
        throw new Error('Anthropic provider not yet implemented');
      case ModelProviderType.CUSTOM:
        throw new Error('Custom provider not yet implemented');
      default: {
        const exhaustiveCheck: never = config.type;
        throw new Error(`Unsupported provider type: ${exhaustiveCheck}`);
      }
    }

    this.providers.set(key, provider);
    return provider;
  }

  static async createAndInitialize(config: ModelProviderConfig, configInstance?: Config): Promise<BaseModelProvider> {
    const provider = this.create(config, configInstance);
    await provider.initialize();
    return provider;
  }

  static clearCache(): void {
    this.providers.clear();
  }

  static getCachedProvider(config: ModelProviderConfig): BaseModelProvider | undefined {
    const key = `${config.type}-${config.model}-${config.baseUrl || 'default'}`;
    return this.providers.get(key);
  }

  static getSupportedProviders(): ModelProviderType[] {
    return [
      ModelProviderType.GEMINI,
      ModelProviderType.OPENAI,
      ModelProviderType.LM_STUDIO
    ];
  }

  static getCurrentProviderType(): ModelProviderType | null {
    return this.currentProviderType;
  }

  static validateConfig(config: ModelProviderConfig): void {
    if (!config.type) {
      throw new Error('Provider type is required');
    }

    if (!config.model) {
      throw new Error('Model is required');
    }

    // switch (config.type) {
    //   case ModelProviderType.OPENAI:
    //     if (!config.apiKey) {
    //       throw new Error('API key is required for OpenAI provider');
    //     }
    //     break;
    //   case ModelProviderType.LM_STUDIO:
    //     if (!config.baseUrl) {
    //       throw new Error('Base URL is required for LM Studio provider');
    //     }
    //     break;
    //   case ModelProviderType.GEMINI:
    //     // Gemini validation handled by GeminiClient
    //     break;
    //   case ModelProviderType.ANTHROPIC:
    //   case ModelProviderType.CUSTOM:
    //     throw new Error(`Provider ${config.type} is not yet supported`);
    //   default: {
    //     const exhaustiveCheck: never = config.type;
    //     throw new Error(`Unknown provider type: ${exhaustiveCheck}`);
    //   }
    // }
  }
}