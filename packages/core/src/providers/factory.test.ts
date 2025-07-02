// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderFactory } from './factory.js';
import type { IModelProvider, ProviderFactoryConfig } from './types.js';

// Mock providers
vi.mock('./copilot-provider.js', () => ({
  CopilotProvider: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    listModels: vi.fn().mockResolvedValue([]),
    chat: vi.fn().mockResolvedValue({ choices: [], model: 'mock' }),
    chatStream: vi.fn().mockImplementation(async function* () {
      yield { choices: [], model: 'mock' };
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
    getName: vi.fn().mockReturnValue('Copilot Provider'),
    dispose: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('./gemini-provider.js', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    listModels: vi.fn().mockResolvedValue([]),
    chat: vi.fn().mockResolvedValue({ choices: [], model: 'mock' }),
    chatStream: vi.fn().mockImplementation(async function* () {
      yield { choices: [], model: 'mock' };
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
    getName: vi.fn().mockReturnValue('Gemini Provider'),
    dispose: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('ProviderFactory', () => {
  let factory: ProviderFactory;
  const defaultConfig: ProviderFactoryConfig = {
    defaultProvider: 'copilot',
    fallbackProvider: 'gemini',
    copilot: {
      bridgeUrl: 'http://localhost:7337'
    },
    gemini: {
      apiKey: 'test-key'
    }
  };

  beforeEach(() => {
    // Clear singleton instance
    ProviderFactory['instance'] = undefined as any;
  });

  afterEach(async () => {
    if (factory) {
      await factory.dispose();
    }
  });

  describe('getInstance', () => {
    it('should create singleton instance with config', () => {
      factory = ProviderFactory.getInstance(defaultConfig);
      const factory2 = ProviderFactory.getInstance();
      
      expect(factory).toBe(factory2);
    });

    it('should throw error if no config provided on first call', () => {
      expect(() => ProviderFactory.getInstance()).toThrow(
        'ProviderFactory must be initialized with config on first call'
      );
    });
  });

  describe('getProvider', () => {
    beforeEach(() => {
      factory = ProviderFactory.getInstance(defaultConfig);
    });

    it('should get copilot provider', async () => {
      const provider = await factory.getProvider('copilot');
      
      expect(provider).toBeDefined();
      expect(provider.getName()).toBe('Copilot Provider');
      expect(provider.initialize).toHaveBeenCalled();
    });

    it('should get gemini provider', async () => {
      const provider = await factory.getProvider('gemini');
      
      expect(provider).toBeDefined();
      expect(provider.getName()).toBe('Gemini Provider');
      expect(provider.initialize).toHaveBeenCalled();
    });

    it('should use default provider when type is auto', async () => {
      const provider = await factory.getProvider('auto');
      
      expect(provider).toBeDefined();
      expect(provider.getName()).toBe('Copilot Provider');
    });

    it('should use default provider when no type specified', async () => {
      const provider = await factory.getProvider();
      
      expect(provider).toBeDefined();
      expect(provider.getName()).toBe('Copilot Provider');
    });

    it('should cache providers', async () => {
      const provider1 = await factory.getProvider('copilot');
      const provider2 = await factory.getProvider('copilot');
      
      expect(provider1).toBe(provider2);
    });

    it('should fallback to gemini if copilot fails', async () => {
      // Make copilot initialization fail
      const { CopilotProvider } = await import('./copilot-provider.js');
      (CopilotProvider as any).mockImplementationOnce(() => ({
        initialize: vi.fn().mockRejectedValue(new Error('Copilot not available'))
      }));

      const provider = await factory.getProvider('copilot');
      
      expect(provider.getName()).toBe('Gemini Provider');
    });

    it('should throw error if no providers available', async () => {
      // Make both providers fail
      const { CopilotProvider } = await import('./copilot-provider.js');
      const { GeminiProvider } = await import('./gemini-provider.js');
      
      (CopilotProvider as any).mockImplementation(() => ({
        initialize: vi.fn().mockRejectedValue(new Error('Copilot not available'))
      }));
      
      (GeminiProvider as any).mockImplementation(() => ({
        initialize: vi.fn().mockRejectedValue(new Error('Gemini not available'))
      }));

      await expect(factory.getProvider('copilot')).rejects.toThrow(
        'No available providers'
      );
    });
  });

  describe('isProviderAvailable', () => {
    beforeEach(() => {
      factory = ProviderFactory.getInstance(defaultConfig);
    });

    it('should return true for available provider', async () => {
      const available = await factory.isProviderAvailable('copilot');
      expect(available).toBe(true);
    });

    it('should return false for unavailable provider', async () => {
      // Make copilot health check fail
      const { CopilotProvider } = await import('./copilot-provider.js');
      (CopilotProvider as any).mockImplementationOnce(() => ({
        initialize: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue(false)
      }));

      const available = await factory.isProviderAvailable('copilot');
      expect(available).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    beforeEach(() => {
      factory = ProviderFactory.getInstance(defaultConfig);
    });

    it('should list all available providers', async () => {
      const providers = await factory.getAvailableProviders();
      
      expect(providers).toHaveLength(2);
      expect(providers[0]).toEqual({
        type: 'copilot',
        name: 'Copilot Provider',
        healthy: true
      });
      expect(providers[1]).toEqual({
        type: 'gemini',
        name: 'Gemini Provider',
        healthy: true
      });
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      factory = ProviderFactory.getInstance(defaultConfig);
    });

    it('should update configuration', async () => {
      // Create a provider first
      await factory.getProvider('copilot');
      
      // Update config
      factory.updateConfig({
        defaultProvider: 'gemini'
      });

      // Get default provider - should now be gemini
      const provider = await factory.getProvider('auto');
      expect(provider.getName()).toBe('Gemini Provider');
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      factory = ProviderFactory.getInstance(defaultConfig);
    });

    it('should clear all cached providers', async () => {
      // Create providers
      const provider1 = await factory.getProvider('copilot');
      await factory.getProvider('gemini');
      
      // Clear cache
      await factory.clearCache();
      
      // Get provider again - should be a new instance
      const provider2 = await factory.getProvider('copilot');
      
      expect(provider1).not.toBe(provider2);
      expect(provider1.dispose).toHaveBeenCalled();
    });
  });
});