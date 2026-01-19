/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderInfo,
  ProviderId,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamChunk,
  ProviderModelInfo,
} from './types.js';
import { ProviderError } from './types.js';
import { GeminiProvider } from './gemini-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { OllamaProvider } from './ollama-provider.js';

/**
 * Configuration for the provider manager
 */
export interface ProviderManagerConfig {
  /** Default provider to use */
  defaultProvider?: ProviderId;
  /** Default models per provider */
  defaultModels?: Partial<Record<ProviderId, string>>;
  /** Provider-specific overrides */
  providerOverrides?: Partial<Record<ProviderId, Partial<ProviderConfig>>>;
}

/**
 * Manages multiple AI providers and handles switching between them
 */
export class ProviderManager {
  private providers: Map<ProviderId, AIProvider> = new Map();
  private activeProviderId: ProviderId | null = null;
  private config: ProviderManagerConfig;

  constructor(config: ProviderManagerConfig = {}) {
    this.config = config;

    // Register all providers
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new ClaudeProvider());
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new OllamaProvider());
  }

  /**
   * Register a provider
   */
  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a provider by ID without initializing
   */
  getProvider(providerId: ProviderId): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get the currently active provider
   */
  getActiveProvider(): AIProvider | null {
    if (!this.activeProviderId) return null;
    return this.providers.get(this.activeProviderId) || null;
  }

  /**
   * Get the ID of the currently active provider
   */
  getActiveProviderId(): ProviderId | null {
    return this.activeProviderId;
  }

  /**
   * Switch to a different provider
   */
  async switchProvider(
    providerId: ProviderId,
    config: Partial<ProviderConfig>,
  ): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(
        `Unknown provider: ${providerId}. Available providers: ${Array.from(this.providers.keys()).join(', ')}`,
        providerId,
        'UNKNOWN_PROVIDER',
      );
    }

    // Merge with overrides from config
    const overrides = this.config.providerOverrides?.[providerId] || {};
    const defaultModel =
      config.model ||
      this.config.defaultModels?.[providerId] ||
      provider.defaultModel;

    const fullConfig: ProviderConfig = {
      ...overrides,
      ...config,
      model: defaultModel,
    };

    await provider.initialize(fullConfig);
    this.activeProviderId = providerId;
  }

  /**
   * Initialize the default provider
   */
  async initializeDefault(
    apiKeys: Partial<Record<ProviderId, string>>,
  ): Promise<ProviderId> {
    const defaultProvider = this.config.defaultProvider || 'gemini';

    // Try to initialize the default provider
    const apiKey = apiKeys[defaultProvider];
    if (apiKey || defaultProvider === 'ollama') {
      try {
        await this.switchProvider(defaultProvider, { apiKey });
        return defaultProvider;
      } catch (_error) {
        // Fall through to try other providers
      }
    }

    // Try other providers in order of preference
    const fallbackOrder: ProviderId[] = [
      'gemini',
      'claude',
      'openai',
      'ollama',
    ];
    for (const providerId of fallbackOrder) {
      if (providerId === defaultProvider) continue; // Already tried

      const key = apiKeys[providerId];
      if (key || providerId === 'ollama') {
        try {
          await this.switchProvider(providerId, { apiKey: key });
          return providerId;
        } catch {
          // Continue to next provider
        }
      }
    }

    throw new ProviderError(
      'No provider could be initialized. Please configure at least one API key.',
      'gemini',
      'NO_PROVIDER_AVAILABLE',
    );
  }

  /**
   * List all available providers with their info
   */
  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => p.getInfo());
  }

  /**
   * List models for a specific provider
   */
  async listModels(providerId: ProviderId): Promise<ProviderModelInfo[]> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(
        `Unknown provider: ${providerId}`,
        providerId,
        'UNKNOWN_PROVIDER',
      );
    }

    // If provider is initialized, get available models
    if (provider.isInitialized()) {
      return provider.getAvailableModels();
    }

    // Otherwise return static list from info
    const info = provider.getInfo();
    return info.models;
  }

  /**
   * Generate content using the active provider
   */
  async generateContent(request: ProviderRequest): Promise<ProviderResponse> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new ProviderError(
        'No provider is active. Call switchProvider() first.',
        'gemini',
        'NO_ACTIVE_PROVIDER',
      );
    }

    return provider.generateContent(request);
  }

  /**
   * Generate content with streaming using the active provider
   */
  async *generateContentStream(
    request: ProviderRequest,
  ): AsyncGenerator<ProviderStreamChunk> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new ProviderError(
        'No provider is active. Call switchProvider() first.',
        'gemini',
        'NO_ACTIVE_PROVIDER',
      );
    }

    yield* provider.generateContentStream(request);
  }

  /**
   * Count tokens using the active provider
   */
  async countTokens(content: string, model?: string): Promise<number> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new ProviderError(
        'No provider is active. Call switchProvider() first.',
        'gemini',
        'NO_ACTIVE_PROVIDER',
      );
    }

    return provider.countTokens(content, model);
  }

  /**
   * Validate credentials for the active provider
   */
  async validateCredentials(): Promise<boolean> {
    const provider = this.getActiveProvider();
    if (!provider) {
      return false;
    }

    return provider.validateCredentials();
  }

  /**
   * Get environment variable name for a provider's API key
   */
  static getApiKeyEnvVar(providerId: ProviderId): string {
    switch (providerId) {
      case 'gemini':
        return 'GEMINI_API_KEY';
      case 'claude':
        return 'ANTHROPIC_API_KEY';
      case 'openai':
        return 'OPENAI_API_KEY';
      case 'ollama':
        return 'OLLAMA_BASE_URL';
      default:
        return `${(providerId as string).toUpperCase()}_API_KEY`;
    }
  }

  /**
   * Get Phoenix-specific environment variable name for a provider's API key
   */
  static getPhoenixApiKeyEnvVar(providerId: ProviderId): string {
    return `PHOENIX_${providerId.toUpperCase()}_API_KEY`;
  }

  /**
   * Load API key from environment variables
   */
  static loadApiKeyFromEnv(providerId: ProviderId): string | undefined {
    // Check Phoenix-specific env var first
    const phoenixKey =
      process.env[ProviderManager.getPhoenixApiKeyEnvVar(providerId)];
    if (phoenixKey) return phoenixKey;

    // Fall back to standard env var
    const standardKey =
      process.env[ProviderManager.getApiKeyEnvVar(providerId)];
    return standardKey;
  }

  /**
   * Load all API keys from environment variables
   */
  static loadAllApiKeysFromEnv(): Partial<Record<ProviderId, string>> {
    const keys: Partial<Record<ProviderId, string>> = {};
    const providers: ProviderId[] = ['gemini', 'claude', 'openai', 'ollama'];

    for (const providerId of providers) {
      const key = ProviderManager.loadApiKeyFromEnv(providerId);
      if (key) {
        keys[providerId] = key;
      }
    }

    return keys;
  }
}

/**
 * Create a provider manager with default configuration
 */
export function createProviderManager(
  config?: ProviderManagerConfig,
): ProviderManager {
  return new ProviderManager(config);
}

/**
 * Singleton instance for convenience
 */
let defaultProviderManager: ProviderManager | null = null;

/**
 * Get the default provider manager instance
 */
export function getProviderManager(): ProviderManager {
  if (!defaultProviderManager) {
    defaultProviderManager = createProviderManager();
  }
  return defaultProviderManager;
}

/**
 * Reset the default provider manager (useful for testing)
 */
export function resetProviderManager(): void {
  defaultProviderManager = null;
}
