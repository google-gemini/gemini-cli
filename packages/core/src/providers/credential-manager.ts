/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import type { ProviderId } from './types.js';
import { debugLogger } from '../utils/debugLogger.js';

const KEYCHAIN_SERVICE_PREFIX = 'phoenix-cli-provider';

/**
 * Manages API keys and credentials for multiple AI providers
 *
 * Credentials are stored securely using the system keychain when available,
 * with fallback to encrypted file storage.
 *
 * Priority for loading credentials:
 * 1. Phoenix-specific environment variables (PHOENIX_GEMINI_API_KEY, etc.)
 * 2. Standard environment variables (GEMINI_API_KEY, ANTHROPIC_API_KEY, etc.)
 * 3. Stored credentials (keychain or file)
 */
export class ProviderCredentialManager {
  private storages: Map<ProviderId, HybridTokenStorage> = new Map();

  /**
   * Get API key for a provider
   *
   * Checks environment variables first, then falls back to stored credentials
   */
  async getApiKey(providerId: ProviderId): Promise<string | null> {
    // Priority 1: Phoenix-specific env var
    const phoenixKey = process.env[this.getPhoenixEnvVar(providerId)];
    if (phoenixKey) {
      return phoenixKey;
    }

    // Priority 2: Standard env var
    const standardKey = process.env[this.getStandardEnvVar(providerId)];
    if (standardKey) {
      return standardKey;
    }

    // Priority 3: Stored credentials
    try {
      const storage = this.getStorage(providerId);
      const credentials = await storage.getCredentials('api-key');

      if (credentials?.token?.accessToken) {
        return credentials.token.accessToken;
      }
    } catch (error) {
      debugLogger.warn(
        `Failed to load API key for ${providerId} from storage:`,
        error,
      );
    }

    return null;
  }

  /**
   * Save API key for a provider
   */
  async setApiKey(providerId: ProviderId, apiKey: string): Promise<void> {
    if (!apiKey || apiKey.trim() === '') {
      await this.clearApiKey(providerId);
      return;
    }

    const credentials: OAuthCredentials = {
      serverName: 'api-key',
      token: {
        accessToken: apiKey,
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    };

    const storage = this.getStorage(providerId);
    await storage.setCredentials(credentials);
  }

  /**
   * Clear stored API key for a provider
   */
  async clearApiKey(providerId: ProviderId): Promise<void> {
    try {
      const storage = this.getStorage(providerId);
      await storage.deleteCredentials('api-key');
    } catch (error) {
      debugLogger.warn(`Failed to clear API key for ${providerId}:`, error);
    }
  }

  /**
   * Check if credentials are available for a provider
   */
  async hasCredentials(providerId: ProviderId): Promise<boolean> {
    // Ollama doesn't need credentials
    if (providerId === 'ollama') {
      return true;
    }

    const apiKey = await this.getApiKey(providerId);
    return apiKey !== null && apiKey.trim() !== '';
  }

  /**
   * Get all providers that have credentials available
   */
  async getProvidersWithCredentials(): Promise<ProviderId[]> {
    const providers: ProviderId[] = ['gemini', 'claude', 'openai', 'ollama'];
    const result: ProviderId[] = [];

    for (const providerId of providers) {
      if (await this.hasCredentials(providerId)) {
        result.push(providerId);
      }
    }

    return result;
  }

  /**
   * Load all available API keys
   */
  async loadAllApiKeys(): Promise<Partial<Record<ProviderId, string>>> {
    const keys: Partial<Record<ProviderId, string>> = {};
    const providers: ProviderId[] = ['gemini', 'claude', 'openai', 'ollama'];

    for (const providerId of providers) {
      const key = await this.getApiKey(providerId);
      if (key) {
        keys[providerId] = key;
      }
    }

    return keys;
  }

  /**
   * Get the Phoenix-specific environment variable name for a provider
   */
  getPhoenixEnvVar(providerId: ProviderId): string {
    return `PHOENIX_${providerId.toUpperCase()}_API_KEY`;
  }

  /**
   * Get the standard environment variable name for a provider
   */
  getStandardEnvVar(providerId: ProviderId): string {
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
   * Get or create a storage instance for a provider
   */
  private getStorage(providerId: ProviderId): HybridTokenStorage {
    if (!this.storages.has(providerId)) {
      const serviceName = `${KEYCHAIN_SERVICE_PREFIX}-${providerId}`;
      this.storages.set(providerId, new HybridTokenStorage(serviceName));
    }
    return this.storages.get(providerId)!;
  }
}

/**
 * Singleton instance
 */
let credentialManager: ProviderCredentialManager | null = null;

/**
 * Get the default credential manager instance
 */
export function getCredentialManager(): ProviderCredentialManager {
  if (!credentialManager) {
    credentialManager = new ProviderCredentialManager();
  }
  return credentialManager;
}

/**
 * Reset the credential manager (useful for testing)
 */
export function resetCredentialManager(): void {
  credentialManager = null;
}
