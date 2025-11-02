/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { debugLogger } from '../utils/debugLogger.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-api-keys';
const MULTI_API_KEYS_ENTRY = 'multi-api-keys';

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

export interface ApiKeyEntry {
  key: string;
  label?: string;
  addedAt: number;
  lastUsed?: number;
  failureCount: number;
  isBlocked: boolean;
}

export interface MultiApiKeyData {
  keys: ApiKeyEntry[];
  currentIndex: number;
}

/**
 * Load all stored API keys
 */
export async function loadApiKeys(): Promise<MultiApiKeyData | null> {
  try {
    const credentials = await storage.getCredentials(MULTI_API_KEYS_ENTRY);

    if (credentials?.token?.accessToken) {
      const data = JSON.parse(credentials.token.accessToken) as MultiApiKeyData;
      return data;
    }

    return null;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === 'Token file does not exist'
    ) {
      return null;
    }

    debugLogger.error('Failed to load API keys from storage:', error);
    return null;
  }
}

/**
 * Save API keys
 */
export async function saveApiKeys(data: MultiApiKeyData): Promise<void> {
  const credentials: OAuthCredentials = {
    serverName: MULTI_API_KEYS_ENTRY,
    token: {
      accessToken: JSON.stringify(data),
      tokenType: 'ApiKey',
    },
    updatedAt: Date.now(),
  };

  await storage.setCredentials(credentials);
}

/**
 * Add a new API key
 */
export async function addApiKey(
  key: string,
  label?: string,
): Promise<MultiApiKeyData> {
  const data = (await loadApiKeys()) || { keys: [], currentIndex: 0 };

  // Check if key already exists
  const existingIndex = data.keys.findIndex((entry) => entry.key === key);
  if (existingIndex !== -1) {
    throw new Error('API key already exists');
  }

  const newEntry: ApiKeyEntry = {
    key,
    label,
    addedAt: Date.now(),
    failureCount: 0,
    isBlocked: false,
  };

  data.keys.push(newEntry);
  await saveApiKeys(data);

  return data;
}

/**
 * Remove an API key by index
 */
export async function removeApiKey(index: number): Promise<MultiApiKeyData> {
  const data = await loadApiKeys();
  if (!data || index < 0 || index >= data.keys.length) {
    throw new Error('Invalid API key index');
  }

  data.keys.splice(index, 1);

  // Adjust current index if needed
  if (data.currentIndex >= data.keys.length) {
    data.currentIndex = Math.max(0, data.keys.length - 1);
  }

  await saveApiKeys(data);
  return data;
}

/**
 * Get the current active API key
 */
export async function getCurrentApiKey(): Promise<string | null> {
  const data = await loadApiKeys();
  if (!data || data.keys.length === 0) {
    return null;
  }

  // Find next non-blocked key starting from current index
  const startIndex = data.currentIndex;
  let attempts = 0;

  while (attempts < data.keys.length) {
    const index = (startIndex + attempts) % data.keys.length;
    const entry = data.keys[index];

    if (!entry.isBlocked) {
      if (index !== data.currentIndex) {
        data.currentIndex = index;
        await saveApiKeys(data);
      }
      return entry.key;
    }

    attempts++;
  }

  // All keys are blocked
  return null;
}

/**
 * Mark current key as failed and rotate to next
 */
export async function rotateToNextApiKey(
  reason: 'rate_limit' | 'quota_exhausted' | 'error',
): Promise<string | null> {
  const data = await loadApiKeys();
  if (!data || data.keys.length === 0) {
    return null;
  }

  const currentEntry = data.keys[data.currentIndex];
  if (currentEntry) {
    currentEntry.failureCount++;

    // Block key if it hit quota/rate limit
    if (reason === 'rate_limit' || reason === 'quota_exhausted') {
      currentEntry.isBlocked = true;
      debugLogger.warn(
        `API key ${currentEntry.label || data.currentIndex} blocked due to ${reason}`,
      );
    }
  }

  // Find next available key
  const startIndex = (data.currentIndex + 1) % data.keys.length;
  let attempts = 0;

  while (attempts < data.keys.length) {
    const index = (startIndex + attempts) % data.keys.length;
    const entry = data.keys[index];

    if (!entry.isBlocked) {
      data.currentIndex = index;
      entry.lastUsed = Date.now();
      await saveApiKeys(data);

      debugLogger.info(
        `Rotated to API key ${entry.label || index} (${attempts + 1} keys checked)`,
      );
      return entry.key;
    }

    attempts++;
  }

  // All keys are blocked
  debugLogger.error('All API keys are blocked or exhausted');
  return null;
}

/**
 * Update last used timestamp for current key
 */
export async function markCurrentKeyUsed(): Promise<void> {
  const data = await loadApiKeys();
  if (!data || data.keys.length === 0) {
    return;
  }

  const currentEntry = data.keys[data.currentIndex];
  if (currentEntry) {
    currentEntry.lastUsed = Date.now();
    await saveApiKeys(data);
  }
}

/**
 * Reset all blocked keys (useful for daily quota resets)
 */
export async function resetBlockedKeys(): Promise<MultiApiKeyData | null> {
  const data = await loadApiKeys();
  if (!data) {
    return null;
  }

  data.keys.forEach((entry) => {
    entry.isBlocked = false;
    entry.failureCount = 0;
  });

  await saveApiKeys(data);
  return data;
}

/**
 * Clear all API keys
 */
export async function clearAllApiKeys(): Promise<void> {
  try {
    await storage.deleteCredentials(MULTI_API_KEYS_ENTRY);
  } catch (error: unknown) {
    debugLogger.error('Failed to clear API keys from storage:', error);
  }
}
