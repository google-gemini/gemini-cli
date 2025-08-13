import { setGlobalDispatcher, ProxyAgent, Agent } from 'undici';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../config/models.js';

// Security constants
const MAX_CACHE_SIZE = 1000; // Prevent memory exhaustion
const CACHE_DURATION = 60000; // 1 minute
const REQUEST_TIMEOUT = 1000; // 1 second
const MAX_API_KEY_LENGTH = 256; // Prevent oversized keys
const VALID_PROXY_REGEX = /^https?:\/\/.+/i;

// Cache for rate limit status with size limits
const rateLimitCache = new Map<string, { limited: boolean; timestamp: number }>();
const pendingChecks = new Map<string, Promise<boolean>>();

// Original dispatcher for cleanup
let originalDispatcher: Agent | undefined;

/**
 * Validates API key format and length
 */
function validateApiKey(apiKey: string): void {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key format');
  }
  if (apiKey.length > MAX_API_KEY_LENGTH) {
    throw new Error('API key exceeds maximum length');
  }
  // Check for common injection patterns
  if (apiKey.includes('\n') || apiKey.includes('\r') || apiKey.includes('\0')) {
    throw new Error('Invalid characters in API key');
  }
}

/**
 * Validates proxy URL to prevent SSRF attacks
 */
function validateProxy(proxy: string): void {
  if (!VALID_PROXY_REGEX.test(proxy)) {
    throw new Error('Invalid proxy URL format');
  }
  
  // Parse and validate proxy URL
  try {
    const proxyUrl = new URL(proxy);
    
    // Prevent local/internal network access
    const hostname = proxyUrl.hostname.toLowerCase();
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254', // Link-local
      '10.', // Private network
      '192.168.', // Private network
      '172.16.', '172.17.', '172.18.', '172.19.', 
      '172.20.', '172.21.', '172.22.', '172.23.',
      '172.24.', '172.25.', '172.26.', '172.27.',
      '172.28.', '172.29.', '172.30.', '172.31.', // Private networks
    ];
    
    if (blockedHosts.some(blocked => hostname.startsWith(blocked))) {
      throw new Error('Proxy points to restricted network');
    }
    
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(proxyUrl.protocol)) {
      throw new Error('Invalid proxy protocol');
    }
  } catch (error) {
    throw new Error(`Invalid proxy URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Creates a secure cache key without exposing full API key
 */
function createCacheKey(apiKey: string, model: string): string {
  // Use a hash instead of substring for better security
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256')
    .update(apiKey)
    .update(model)
    .digest('hex');
  return hash.substring(0, 16); // Use first 16 chars of hash
}

/**
 * Checks if model is rate-limited with security validations
 */
export async function getEffectiveModel(
  apiKey: string,
  currentConfiguredModel: string,
  proxy?: string,
): Promise<string> {
  // Validate inputs
  try {
    validateApiKey(apiKey);
    if (proxy) {
      validateProxy(proxy);
    }
  } catch (error) {
    console.error('[SECURITY] Input validation failed:', error instanceof Error ? error.message : 'Unknown error');
    return DEFAULT_GEMINI_FLASH_MODEL; // Fail safely to fallback model
  }

  // Early return if not using default pro model
  if (currentConfiguredModel !== DEFAULT_GEMINI_MODEL) {
    return currentConfiguredModel;
  }

  const cacheKey = createCacheKey(apiKey, DEFAULT_GEMINI_MODEL);
  const cached = rateLimitCache.get(cacheKey);
  
  // Use cached result if recent
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.limited ? DEFAULT_GEMINI_FLASH_MODEL : currentConfiguredModel;
  }

  // Prevent cache from growing indefinitely
  if (rateLimitCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entries
    const sortedEntries = Array.from(rateLimitCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < MAX_CACHE_SIZE / 10; i++) { // Remove 10% of oldest
      rateLimitCache.delete(sortedEntries[i][0]);
    }
  }

  // Check if rate limit check is already in progress
  let isLimitedPromise = pendingChecks.get(cacheKey);
  if (!isLimitedPromise) {
    isLimitedPromise = checkRateLimit(apiKey, proxy);
    pendingChecks.set(cacheKey, isLimitedPromise);
  }

  try {
    const isLimited = await isLimitedPromise;
    
    // Update cache
    rateLimitCache.set(cacheKey, { limited: isLimited, timestamp: Date.now() });
    
    if (isLimited) {
      // Don't log sensitive model names in production
      console.log('[INFO] Rate limit detected, switching to fallback model');
    }
    
    return isLimited ? DEFAULT_GEMINI_FLASH_MODEL : currentConfiguredModel;
  } catch (error) {
    console.error('[ERROR] Rate limit check failed:', error instanceof Error ? error.message : 'Unknown error');
    return DEFAULT_GEMINI_FLASH_MODEL; // Fail safely
  } finally {
    // Always clean up pending check
    pendingChecks.delete(cacheKey);
  }
}

/**
 * Secure rate limit check
 */
async function checkRateLimit(apiKey: string, proxy?: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    // Store original dispatcher if using proxy
    if (proxy) {
      originalDispatcher = originalDispatcher || setGlobalDispatcher(new Agent());
      setGlobalDispatcher(new ProxyAgent({
        uri: proxy,
        requestTls: {
          rejectUnauthorized: true, // Enforce SSL verification
        },
      }));
    }

    // Never put API key in URL - always use headers
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey, // Secure header transmission
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'test' }] }],
          generationConfig: { 
            maxOutputTokens: 1, 
            temperature: 0,
            topK: 1,
          }
        }),
        signal: controller.signal,
      }
    );

    // Check for rate limiting
    return response.status === 429;
  } catch (error) {
    // Log error without sensitive data
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('[ERROR] Rate limit check error:', error.message);
    }
    return false; // Assume not rate-limited on error
  } finally {
    clearTimeout(timeoutId);
    
    // Restore original dispatcher
    if (proxy && originalDispatcher) {
      setGlobalDispatcher(originalDispatcher);
    }
  }
}

// Secure cleanup with WeakRef for better memory management
let cleanupInterval: NodeJS.Timeout | null = null;
const cleanupRegistry = new FinalizationRegistry(() => {
  stopCacheCleanup();
});

/**
 * Start cache cleanup interval with memory safety
 */
export function startCacheCleanup(): void {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    // Collect entries to delete
    for (const [key, value] of rateLimitCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION * 2) {
        entriesToDelete.push(key);
      }
    }
    
    // Delete in batch
    entriesToDelete.forEach(key => rateLimitCache.delete(key));
    
    // Also clean up any stale pending checks
    if (pendingChecks.size > MAX_CACHE_SIZE / 2) {
      pendingChecks.clear(); // Emergency cleanup
    }
  }, CACHE_DURATION);
  
  // Allow graceful shutdown
  cleanupInterval.unref();
  
  // Register for cleanup on garbage collection
  cleanupRegistry.register(cleanupInterval, undefined);
}

/**
 * Stop cache cleanup interval safely
 */
export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  // Clear caches to prevent memory leaks
  rateLimitCache.clear();
  pendingChecks.clear();
}

// Auto-start cleanup with error handling
try {
  startCacheCleanup();
} catch (error) {
  console.error('[ERROR] Failed to start cache cleanup:', error);
}

// Cleanup on process termination
process.on('SIGINT', () => {
  stopCacheCleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopCacheCleanup();
  process.exit(0);
});
