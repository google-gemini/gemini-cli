/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

class ApiKeyManager {
  private apiKeys: string[];
  private currentKeyIndex: number = 0;
  private keyFailures: Map<string, { count: number; lastFailure: number }> =
    new Map();
  private readonly maxFailures = 3;
  private readonly failureResetTime = 60000;

  constructor(apiKeys: string[]) {
    if (!apiKeys || apiKeys.length === 0) {
      throw new Error('At least one API key is required');
    }
    this.apiKeys = apiKeys;
  }

  getCurrentKey(): string {
    return this.apiKeys[this.currentKeyIndex];
  }

  private isKeyHealthy(key: string): boolean {
    const failure = this.keyFailures.get(key);
    if (!failure) return true;

    const timeSinceLastFailure = Date.now() - failure.lastFailure;
    if (timeSinceLastFailure > this.failureResetTime) {
      this.keyFailures.delete(key);
      return true;
    }

    return failure.count < this.maxFailures;
  }

  switchToNextKey(): string {
    const startIndex = this.currentKeyIndex;
    let attempts = 0;

    while (attempts < this.apiKeys.length) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      const key = this.apiKeys[this.currentKeyIndex];

      if (this.isKeyHealthy(key)) {
        return key;
      }

      if (this.currentKeyIndex === startIndex) {
        throw new Error('All API keys have reached their limits or failed');
      }
      attempts++;
    }

    throw new Error('All API keys have reached their limits or failed');
  }

  recordFailure(key: string, errorCode?: string): void {
    const isRateLimitError =
      errorCode === '429' || errorCode === 'RATE_LIMIT_EXCEEDED';
    const isUsageLimitError =
      errorCode === 'QUOTA_EXCEEDED' || errorCode === 'USAGE_LIMIT_EXCEEDED';

    if (!isRateLimitError && !isUsageLimitError) {
      return;
    }

    const failure = this.keyFailures.get(key) || { count: 0, lastFailure: 0 };
    failure.count++;
    failure.lastFailure = Date.now();
    this.keyFailures.set(key, failure);
  }

  recordSuccess(key: string): void {
    this.keyFailures.delete(key);
  }

  async executeWithFallback<T>(
    apiCall: (apiKey: string) => Promise<T>,
    maxRetries: number = this.apiKeys.length,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentKey = this.getCurrentKey();

      try {
        const result = await apiCall(currentKey);
        this.recordSuccess(currentKey);
        return result;
      } catch (error: unknown) {
        lastError = error as Error;
        const errorCode =
          (error as { code?: string; status?: number }).code ||
          (error as { code?: string; status?: number }).status?.toString();
        this.recordFailure(currentKey, errorCode);

        const isRecoverableError =
          errorCode === '429' ||
          errorCode === 'RATE_LIMIT_EXCEEDED' ||
          errorCode === 'QUOTA_EXCEEDED' ||
          errorCode === 'USAGE_LIMIT_EXCEEDED';

        if (!isRecoverableError || attempt === maxRetries - 1) {
          throw error;
        }

        try {
          this.switchToNextKey();
        } catch (_switchError) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('All API key attempts failed');
  }

  getKeyStats(): Array<{ key: string; failures: number; healthy: boolean }> {
    return this.apiKeys.map((key) => {
      const failure = this.keyFailures.get(key);
      const maskedKey = `${key.slice(0, 8)}...${key.slice(-4)}`;
      return {
        key: maskedKey,
        failures: failure?.count || 0,
        healthy: this.isKeyHealthy(key),
      };
    });
  }
}

function loadApiKeys(): string[] {
  const keys: string[] = [];

  const primaryKey = process.env['GEMINI_API_KEY'];
  if (primaryKey) keys.push(primaryKey);

  let i = 2;
  while (process.env[`GEMINI_API_KEY_${i}`]) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key) keys.push(key);
    i++;
  }

  const keysFromConfig = process.env['GEMINI_API_KEYS']
    ?.split(',')
    .map((k) => k.trim())
    .filter((k) => k);
  if (keysFromConfig) {
    keys.push(...keysFromConfig);
  }

  return [...new Set(keys)];
}

const apiKeyManager = new ApiKeyManager(loadApiKeys());

async function makeGeminiRequest<T>(
  requestFn: (apiKey: string) => Promise<T>,
): Promise<T> {
  return apiKeyManager.executeWithFallback(requestFn);
}

export { ApiKeyManager, loadApiKeys, makeGeminiRequest, apiKeyManager };
