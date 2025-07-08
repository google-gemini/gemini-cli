/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAICompatibleContentGenerator } from './openaiCompatibleContentGenerator.js';
import { AnthropicContentGenerator } from './anthropicContentGenerator.js';
import { AzureContentGenerator } from './azureContentGenerator.js';
import { ContentGenerator, ContentGeneratorConfig, AuthType } from '../core/contentGenerator.js';

export function createCustomContentGenerator(authType: AuthType, config: ContentGeneratorConfig): ContentGenerator {
  // Use string literals to avoid circular dependency with enum values
  switch (authType) {
    case 'openai-compatible':
      return new OpenAICompatibleContentGenerator(config);
    case 'local-llm':
      return new OpenAICompatibleContentGenerator(config);
    case 'anthropic':
      return new AnthropicContentGenerator(config);
    case 'azure':
      return new AzureContentGenerator(config);
    default:
      // Check global registry for custom providers
      const GeneratorClass = globalContentGeneratorRegistry.get(authType);
      if (GeneratorClass) {
        return new GeneratorClass(config);
      }
      throw new Error(`No content generator available for auth type: ${authType}`);
  }
}

// Global registry for external registrations
const globalContentGeneratorRegistry = new Map<AuthType, new (config: ContentGeneratorConfig) => ContentGenerator>();

export function registerContentGenerator(authType: AuthType, generatorClass: new (config: ContentGeneratorConfig) => ContentGenerator) {
  globalContentGeneratorRegistry.set(authType, generatorClass);
}

// Export all generators for direct use if needed
export { OpenAICompatibleContentGenerator, AnthropicContentGenerator };