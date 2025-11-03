/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { debugLogger } from '../utils/debugLogger.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-hf-api-key';
const HF_API_KEY_ENTRY = 'huggingface-api-key';

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

/**
 * Load cached HuggingFace API key
 */
export async function loadHfApiKey(): Promise<string | null> {
  try {
    const credentials = await storage.getCredentials(HF_API_KEY_ENTRY);

    if (credentials?.token?.accessToken) {
      return credentials.token.accessToken;
    }

    return null;
  } catch (error: unknown) {
    // Ignore "file not found" error from FileTokenStorage, it just means no key is saved yet.
    if (
      error instanceof Error &&
      error.message === 'Token file does not exist'
    ) {
      return null;
    }

    // Log other errors but don't crash, just return null so user can re-enter key
    debugLogger.error(
      'Failed to load HuggingFace API key from storage:',
      error,
    );
    return null;
  }
}

/**
 * Save HuggingFace API key
 */
export async function saveHfApiKey(
  apiKey: string | null | undefined,
): Promise<void> {
  if (!apiKey || apiKey.trim() === '') {
    await storage.deleteCredentials(HF_API_KEY_ENTRY);
    return;
  }

  // Wrap API key in OAuthCredentials format as required by HybridTokenStorage
  const credentials: OAuthCredentials = {
    serverName: HF_API_KEY_ENTRY,
    token: {
      accessToken: apiKey,
      tokenType: 'ApiKey',
    },
    updatedAt: Date.now(),
  };

  await storage.setCredentials(credentials);
}

/**
 * Clear cached HuggingFace API key
 */
export async function clearHfApiKey(): Promise<void> {
  try {
    await storage.deleteCredentials(HF_API_KEY_ENTRY);
  } catch (error: unknown) {
    debugLogger.error(
      'Failed to clear HuggingFace API key from storage:',
      error,
    );
  }
}
