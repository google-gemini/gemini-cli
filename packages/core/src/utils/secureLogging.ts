/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Secure logging utilities to prevent exposure of sensitive information
 * like API keys, tokens, passwords, and other secrets in debug logs.
 */

// List of sensitive keys that should be redacted in logs
const SENSITIVE_KEYS = [
  'api_key',
  'apikey',
  'apiKey',
  'API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'token',
  'Token',
  'TOKEN',
  'secret',
  'Secret',
  'SECRET',
  'password',
  'Password',
  'PASSWORD',
  'auth',
  'Auth',
  'AUTH',
  'authorization',
  'Authorization',
  'AUTHORIZATION',
  'bearer',
  'Bearer',
  'BEARER',
  'oauth',
  'OAuth',
  'OAUTH',
  'client_secret',
  'clientSecret',
  'CLIENT_SECRET',
  'private_key',
  'privateKey',
  'PRIVATE_KEY',
  'access_token',
  'accessToken',
  'ACCESS_TOKEN',
  'refresh_token',
  'refreshToken',
  'REFRESH_TOKEN',
  'session_token',
  'sessionToken',
  'SESSION_TOKEN',
  'jwt',
  'JWT',
  'credential',
  'Credential',
  'CREDENTIAL',
  'credentials',
  'Credentials',
  'CREDENTIALS',
];

// Patterns for sensitive data in strings
const SENSITIVE_PATTERNS = [
  /\b[A-Za-z0-9+/]{20,}={0,2}\b/, // Base64-like strings (20+ chars)
  /\b[A-Fa-f0-9]{32,}\b/, // Hex strings (32+ chars, likely tokens)
  /\bsk-[A-Za-z0-9_-]{20,}\b/, // OpenAI-style API keys
  /\bAIza[A-Za-z0-9_-]{35}\b/, // Google AI API keys
  /\bya29\.[A-Za-z0-9_.-]+\b/, // Google OAuth tokens
  /\b[A-Za-z0-9_-]{40,}\b/, // Generic long tokens
];

const REDACTED_VALUE = '[REDACTED]';

/**
 * Checks if a key name suggests it contains sensitive information
 */
function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_KEYS.some((sensitiveKey) =>
    normalizedKey.includes(sensitiveKey.toLowerCase().replace(/[-_]/g, '')),
  );
}

/**
 * Checks if a string value appears to contain sensitive data
 */
function isSensitiveValue(value: string): boolean {
  if (typeof value !== 'string' || value.length < 10) {
    return false;
  }

  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Recursively redacts sensitive information from an object
 */
function redactObject(
  obj: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  // Prevent infinite recursion from very deep (but not circular) objects
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  // Use WeakSet to detect and handle circular references
  if (typeof obj === 'object') {
    if (seen.has(obj)) {
      // Return a circular reference marker object instead of string
      return { '[CIRCULAR_REFERENCE]': true };
    }
    seen.add(obj);
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1, seen));
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    if (typeof obj === 'string' && isSensitiveValue(obj)) {
      return REDACTED_VALUE;
    }
    return obj;
  }

  // Handle objects
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      // For sensitive keys, preserve null/undefined values
      if (value === null || value === undefined) {
        result[key] = value;
      } else if (typeof value === 'object') {
        // For objects and arrays in sensitive keys, recursively redact their contents
        result[key] = redactObject(value, depth + 1, seen);
      } else {
        result[key] = REDACTED_VALUE;
      }
    } else if (typeof value === 'string' && isSensitiveValue(value)) {
      result[key] = REDACTED_VALUE;
    } else {
      result[key] = redactObject(value, depth + 1, seen);
    }
  }

  return result;
}

/**
 * Redacts sensitive information from environment variables
 */
function redactEnvironment(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    if (isSensitiveKey(key)) {
      result[key] = value === undefined ? value : REDACTED_VALUE;
    } else if (value && isSensitiveValue(value)) {
      result[key] = REDACTED_VALUE;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Main function to redact secrets from any data structure
 */
export function redactSecrets(data: unknown): unknown {
  try {
    return redactObject(data);
  } catch (error) {
    // If redaction fails, return a safe placeholder
    console.warn('Failed to redact secrets from data:', error);
    // Return an object placeholder if the input was an object
    if (data !== null && typeof data === 'object') {
      return { '[REDACTION_FAILED]': true };
    }
    return '[REDACTION_FAILED]';
  }
}

/**
 * Redacts secrets specifically from environment variables
 */
export function redactEnvironmentSecrets(
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  try {
    return redactEnvironment(env);
  } catch (error) {
    console.warn('Failed to redact secrets from environment:', error);
    return { '[REDACTION_FAILED]': '[REDACTION_FAILED]' };
  }
}

/**
 * Secure logger that automatically redacts sensitive information
 */
export class SecureLogger {
  private debugEnabled: boolean;

  constructor(debugEnabled = false) {
    this.debugEnabled = debugEnabled;
  }

  debug(message: string, data?: unknown): void {
    if (!this.debugEnabled) return;

    const safeMessage =
      typeof message === 'string' && isSensitiveValue(message)
        ? REDACTED_VALUE
        : message;

    if (data !== undefined) {
      const safeData = redactSecrets(data);
      console.debug('[DEBUG]', safeMessage, safeData);
    } else {
      console.debug('[DEBUG]', safeMessage);
    }
  }

  info(message: string, data?: unknown): void {
    const safeMessage =
      typeof message === 'string' && isSensitiveValue(message)
        ? REDACTED_VALUE
        : message;

    if (data !== undefined) {
      const safeData = redactSecrets(data);
      console.info('[INFO]', safeMessage, safeData);
    } else {
      console.info('[INFO]', safeMessage);
    }
  }

  warn(message: string, data?: unknown): void {
    const safeMessage =
      typeof message === 'string' && isSensitiveValue(message)
        ? REDACTED_VALUE
        : message;

    if (data !== undefined) {
      const safeData = redactSecrets(data);
      console.warn('[WARN]', safeMessage, safeData);
    } else {
      console.warn('[WARN]', safeMessage);
    }
  }

  error(message: string, data?: unknown): void {
    const safeMessage =
      typeof message === 'string' && isSensitiveValue(message)
        ? REDACTED_VALUE
        : message;

    if (data !== undefined) {
      const safeData = redactSecrets(data);
      console.error('[ERROR]', safeMessage, safeData);
    } else {
      console.error('[ERROR]', safeMessage);
    }
  }
}

/**
 * Creates a secure logger instance
 */
export function createSecureLogger(debugEnabled = false): SecureLogger {
  return new SecureLogger(debugEnabled);
}

/**
 * Utility function to safely log configuration objects
 */
export function logConfigSafely(config: unknown, debugEnabled = false): void {
  if (!debugEnabled) return;

  const logger = createSecureLogger(debugEnabled);
  logger.debug('Configuration loaded', config);
}

/**
 * Utility function to safely log environment variables
 */
export function logEnvironmentSafely(
  env: Record<string, string | undefined> = process.env,
  debugEnabled = false,
): void {
  if (!debugEnabled) return;

  const logger = createSecureLogger(debugEnabled);
  logger.debug('Environment variables', env);
}
