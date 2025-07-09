/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../config/models.js';

// Cache for rate limit status - prevents repeated API calls
const rateLimitCache = new Map<string, { limited: boolean; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute

// Track pending rate limit checks to prevent race conditions
const pendingChecks = new Map<string, Promise<boolean>>();

/**
 * Checks if model is rate-limited, returns fallback if needed.
 * Implements caching and optimized error handling with race condition protection.
 */
export async function getEffectiveModel(
  apiKey: string,
  currentConfiguredModel: string,
): Promise<string> {
  // Early return if not using default pro model
  if (currentConfiguredModel !== DEFAULT_GEMINI_MODEL) {
    return currentConfiguredModel;
  }

  const cacheKey = `${apiKey.slice(-8)}_${DEFAULT_GEMINI_MODEL}`;
  const cached = rateLimitCache.get(cacheKey);
  
  // Use cached result if recent
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.limited ? DEFAULT_GEMINI_FLASH_MODEL : currentConfiguredModel;
  }

  // Check if rate limit check is already in progress
  let isLimitedPromise = pendingChecks.get(cacheKey);
  if (!isLimitedPromise) {
    isLimitedPromise = checkRateLimit(apiKey);
    pendingChecks.set(cacheKey, isLimitedPromise);
  }

  const isLimited = await isLimitedPromise;
  
  // Clean up pending check and update cache
  pendingChecks.delete(cacheKey);
  rateLimitCache.set(cacheKey, { limited: isLimited, timestamp: Date.now() });
  
  if (isLimited) {
    console.log(`[INFO] Model ${DEFAULT_GEMINI_MODEL} rate-limited. Using ${DEFAULT_GEMINI_FLASH_MODEL}.`);
    return DEFAULT_GEMINI_FLASH_MODEL;
  }
  
  return currentConfiguredModel;
}

/**
 * Optimized rate limit check with minimal payload
 */
async function checkRateLimit(apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000); // Reduced timeout

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'x' }] }], // Minimal test
          generationConfig: { maxOutputTokens: 1, temperature: 0 }
        }),
        signal: controller.signal,
      }
    );

    return response.status === 429;
  } catch {
    return false; // Assume not rate-limited on error
  } finally {
    clearTimeout(timeoutId);
  }
}

// Clean up old cache entries periodically (with graceful shutdown)
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start cache cleanup interval
 */
export function startCacheCleanup(): void {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION * 2) {
        rateLimitCache.delete(key);
      }
    }
  }, CACHE_DURATION);
  
  // Allow graceful shutdown
  cleanupInterval.unref();
}

/**
 * Stop cache cleanup interval
 */
export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Auto-start cleanup
startCacheCleanup();
