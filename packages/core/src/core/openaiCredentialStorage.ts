/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { KeychainService } from '../services/keychainService.js';
import { debugLogger } from '../utils/debugLogger.js';
import { createCache } from '../utils/cache.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-openai-credentials';
const CREDENTIAL_ENTRY = 'default';

export interface OpenAICredentials {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

interface OpenAIModelList {
  data?: Array<{ id?: string }>;
}

const keychain = new KeychainService(KEYCHAIN_SERVICE_NAME);
const credentialCache = createCache<string, Promise<OpenAICredentials | null>>({
  storage: 'map',
  defaultTtl: 30000,
});

export function resetOpenAICredentialCacheForTesting(): void {
  credentialCache.clear();
}

export async function loadOpenAICredentials(): Promise<OpenAICredentials | null> {
  return credentialCache.getOrCreate(CREDENTIAL_ENTRY, async () => {
    try {
      const value = await keychain.getPassword(CREDENTIAL_ENTRY);
      if (!value) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return JSON.parse(value) as OpenAICredentials;
    } catch (error) {
      debugLogger.error('Failed to load OpenAI-compatible credentials:', error);
      return null;
    }
  });
}

export async function saveOpenAICredentials(
  credentials: OpenAICredentials,
): Promise<void> {
  credentialCache.delete(CREDENTIAL_ENTRY);
  await keychain.setPassword(CREDENTIAL_ENTRY, JSON.stringify(credentials));
}

export async function validateOpenAICredentials(
  credentials: OpenAICredentials,
): Promise<string | null> {
  const headers: Record<string, string> = {};
  if (credentials.apiKey) {
    headers['Authorization'] = `Bearer ${credentials.apiKey}`;
  }

  try {
    const response = await fetch(
      `${credentials.baseUrl.replace(/\/$/, '')}/models`,
      { headers },
    );
    if (!response.ok) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const body = (await response.json()) as OpenAIModelList;
    const models = body.data
      ?.map((model) => model.id)
      .filter((id): id is string => Boolean(id));
    if (!models?.length || models.includes(credentials.model)) {
      return null;
    }

    return `Model "${credentials.model}" is not available from this endpoint. Available models include: ${models.slice(0, 10).join(', ')}.`;
  } catch {
    return null;
  }
}

export async function clearOpenAICredentials(): Promise<void> {
  credentialCache.delete(CREDENTIAL_ENTRY);
  try {
    await keychain.deletePassword(CREDENTIAL_ENTRY);
  } catch (error) {
    debugLogger.error('Failed to clear OpenAI-compatible credentials:', error);
  }
}
