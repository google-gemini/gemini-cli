// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import { IModelProvider, ProviderFactoryConfig, ProviderConfig } from './types.js';
import { CopilotProvider } from './copilot-provider.js';
import { GeminiProvider } from './gemini-provider.js';

// Re-export types
export type { ProviderFactoryConfig } from './types.js';

/**
 * Factory for creating and managing model providers
 */
export class ProviderFactory {
  private static instance: ProviderFactory;
  private providers: Map<string, IModelProvider> = new Map();
  private config: ProviderFactoryConfig;

  private constructor(config: ProviderFactoryConfig) {
    this.config = config;
  }

  /**
   * Get or create the singleton instance
   */
  public static getInstance(config?: ProviderFactoryConfig): ProviderFactory {
    if (!ProviderFactory.instance) {
      if (!config) {
        throw new Error('ProviderFactory must be initialized with config on first call');
      }
      ProviderFactory.instance = new ProviderFactory(config);
    }
    return ProviderFactory.instance;
  }

  /**
   * Get a provider by type, creating it if necessary
   */
  public async getProvider(type: 'copilot' | 'gemini' | 'auto' = 'auto'): Promise<IModelProvider> {
    // Handle auto selection
    if (type === 'auto') {
      type = this.config.defaultProvider;
    }

    // Check if we already have an initialized provider
    if (this.providers.has(type)) {
      const provider = this.providers.get(type)!;
      
      // Verify the provider is still healthy
      try {
        if (await provider.healthCheck()) {
          return provider;
        }
      } catch (error) {
        console.warn(`Provider ${type} failed health check, will try fallback or recreate`);
      }
    }

    // Try to create/recreate the requested provider
    try {
      const provider = await this.createProvider(type);
      this.providers.set(type, provider);
      return provider;
    } catch (error) {
      console.error(`Failed to create ${type} provider:`, error);
      
      // Try fallback if configured and not already trying fallback
      if (this.config.fallbackProvider && this.config.fallbackProvider !== type) {
        console.log(`Falling back to ${this.config.fallbackProvider} provider`);
        return this.getProvider(this.config.fallbackProvider);
      }
      
      throw new Error(`No available providers. Failed to create ${type}: ${error}`);
    }
  }

  /**
   * Create a new provider instance
   */
  private async createProvider(type: 'copilot' | 'gemini'): Promise<IModelProvider> {
    let provider: IModelProvider;
    let config: ProviderConfig;

    switch (type) {
      case 'copilot':
        provider = new CopilotProvider();
        config = {
          type: 'copilot',
          ...this.config.copilot
        };
        break;
      
      case 'gemini':
        provider = new GeminiProvider();
        config = {
          type: 'gemini',
          ...this.config.gemini
        };
        break;
      
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }

    await provider.initialize(config);
    return provider;
  }

  /**
   * Get default provider based on configuration and availability
   */
  public async getDefaultProvider(): Promise<IModelProvider> {
    return this.getProvider('auto');
  }

  /**
   * Check if a specific provider is available
   */
  public async isProviderAvailable(type: 'copilot' | 'gemini'): Promise<boolean> {
    try {
      const provider = await this.getProvider(type);
      return await provider.healthCheck();
    } catch (error) {
      return false;
    }
  }

  /**
   * List all available providers
   */
  public async getAvailableProviders(): Promise<Array<{ type: string; name: string; healthy: boolean }>> {
    const results = [];
    
    for (const type of ['copilot', 'gemini'] as const) {
      try {
        const provider = await this.createProvider(type);
        const healthy = await provider.healthCheck();
        results.push({
          type,
          name: provider.getName(),
          healthy
        });
        // Clean up test provider
        if (provider.dispose) {
          await provider.dispose();
        }
      } catch (error) {
        results.push({
          type,
          name: type,
          healthy: false
        });
      }
    }
    
    return results;
  }

  /**
   * Update factory configuration
   */
  public updateConfig(config: Partial<ProviderFactoryConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Clear cached providers if config changed significantly
    if (config.defaultProvider || config.fallbackProvider || config.copilot || config.gemini) {
      this.clearCache();
    }
  }

  /**
   * Clear all cached providers
   */
  public async clearCache(): Promise<void> {
    for (const [type, provider] of this.providers) {
      try {
        if (provider.dispose) {
          await provider.dispose();
        }
      } catch (error) {
        console.warn(`Error disposing provider ${type}:`, error);
      }
    }
    this.providers.clear();
  }

  /**
   * Dispose of the factory and all providers
   */
  public async dispose(): Promise<void> {
    await this.clearCache();
    ProviderFactory.instance = undefined as any;
  }
}