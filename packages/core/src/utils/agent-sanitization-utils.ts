/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sensitive key patterns used for redaction.
 */
export const SENSITIVE_KEY_PATTERNS = [
  'password',
  'pwd',
  'apikey',
  'api_key',
  'api-key',
  'token',
  'secret',
  'credential',
  'auth',
  'authorization',
  'access_token',
  'access_key',
  'refresh_token',
  'session_id',
  'cookie',
  'passphrase',
  'privatekey',
  'private_key',
  'private-key',
  'secret_key',
  'client_secret',
  'client_id',
];

/**
 * Performance optimization: Pre-compute normalized sensitive key patterns
 * to avoid calling .replace(/[-_]/g, '') on every key during tool args sanitization.
 */
const NORMALIZED_SENSITIVE_PATTERNS = SENSITIVE_KEY_PATTERNS.map((p) =>
  p.replace(/[-_]/g, ''),
);

/**
 * Performance optimization: Pre-compile regular expressions used in error sanitization
 * at module scope to avoid re-creating RegExp objects on every call (~8x speedup).
 */
const URL_SAFE_KEY_PATTERN_STR = SENSITIVE_KEY_PATTERNS.map((p) =>
  p.replace(/[-_]/g, '(?:[-_]|%2D|%5F|%2d|%5f)?'),
).join('|');

const UNQUOTED_VALUE = `[^\\s]+(?:\\s+(?![a-zA-Z0-9_.-]+(?:=|:))[^\\s=:<>]+)*`;
const VALUE_PATTERN = `(?:"[^"]*"|'[^']*'|${UNQUOTED_VALUE})`;

const KEY_WITH_DELIMITER_REGEX = new RegExp(
  `((?:--)?("|')?(${URL_SAFE_KEY_PATTERN_STR})\\2\\s*(?:[:=]|%3A|%3D)\\s*)${VALUE_PATTERN}`,
  'gi',
);

const TOKEN_VALUE_PATTERN = `[A-Za-z0-9._\\-/+=]{8,}`;
const SPACE_KEYWORDS = [
  ...SENSITIVE_KEY_PATTERNS.map((p) =>
    p.replace(/[-_]/g, '(?:[-_]|%2D|%5F|%2d|%5f)?'),
  ),
  'bearer',
];

const SPACE_SEPARATED_REGEX = new RegExp(
  `\\b((?:--)?(?:${SPACE_KEYWORDS.join('|')})(?:\\s*:\\s*bearer)?\\s+)(${TOKEN_VALUE_PATTERN})`,
  'gi',
);

const FILE_PATH_REDACT_REGEX =
  /((?:[/\\][a-zA-Z0-9_-]+)*[/\\][a-zA-Z0-9_-]*\.(?:key|pem|p12|pfx))/gi;

/**
 * Sanitizes tool arguments by recursively redacting sensitive fields.
 * Supports nested objects and arrays.
 */
export function sanitizeToolArgs(args: unknown): unknown {
  if (typeof args === 'string') {
    return sanitizeErrorMessage(args);
  }
  if (typeof args !== 'object' || args === null) {
    return args;
  }

  if (Array.isArray(args)) {
    return args.map(sanitizeToolArgs);
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    // Decode key to handle URL-encoded sensitive keys (e.g., api%5fkey)
    let decodedKey = key;
    try {
      decodedKey = decodeURIComponent(key);
    } catch {
      // Ignore decoding errors
    }
    const keyNormalized = decodedKey.toLowerCase().replace(/[-_]/g, '');
    const isSensitive = NORMALIZED_SENSITIVE_PATTERNS.some((pattern) =>
      keyNormalized.includes(pattern),
    );
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeToolArgs(value);
    }
  }

  return sanitized;
}

/**
 * Sanitizes error messages by redacting potential sensitive data patterns.
 * Uses [^\s'"]+ to catch JWTs, tokens with dots/slashes, and other complex values.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return message;

  let sanitized = message;

  // 1. Redact inline PEM content (Safe iterative approach to avoid ReDoS)
  let startIndex = 0;
  while ((startIndex = sanitized.indexOf('-----BEGIN', startIndex)) !== -1) {
    const endOfBegin = sanitized.indexOf('-----', startIndex + 10);
    if (endOfBegin === -1) {
      break; // No closing dashes for the BEGIN header
    }

    // Find the END header
    const endHeaderStart = sanitized.indexOf('-----END', endOfBegin + 5);
    if (endHeaderStart === -1) {
      break; // No END header found
    }

    const endHeaderEnd = sanitized.indexOf('-----', endHeaderStart + 8);
    if (endHeaderEnd === -1) {
      break; // No closing dashes for the END header
    }

    // We found a complete block. Replace it.
    const before = sanitized.substring(0, startIndex);
    const after = sanitized.substring(endHeaderEnd + 5);
    sanitized = before + '[REDACTED_PEM]' + after;

    // Resume searching after the redacted block
    startIndex = before.length + 14; // length of '[REDACTED_PEM]'
  }

  // 2. Handle key-value pairs with delimiters (=, :, space, CLI-style --flag)
  sanitized = sanitized.replace(KEY_WITH_DELIMITER_REGEX, '$1[REDACTED]');

  // 3. Handle space-separated sensitive keywords (e.g. "password mypass", "--api-key secret")
  sanitized = sanitized.replace(SPACE_SEPARATED_REGEX, '$1[REDACTED]');

  // 4. Handle file path redaction
  sanitized = sanitized.replace(
    FILE_PATH_REDACT_REGEX,
    '/path/to/[REDACTED].key',
  );

  return sanitized;
}

/**
 * Sanitizes LLM thought content by redacting sensitive data patterns.
 */
export function sanitizeThoughtContent(text: string): string {
  return sanitizeErrorMessage(text);
}
