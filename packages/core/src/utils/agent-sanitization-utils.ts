/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import restoreRedact from 'restore-redact';

const RESTORABLE_REDACTION_TOKEN_RE =
  /\[REDACTED:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;
const EXACT_RESTORABLE_REDACTION_TOKEN_RE =
  /^\[REDACTED:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]$/;
const localRedactionStore = new Map<string, unknown>();
const localValueToToken = new Map<string, string>();

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

function isSensitiveKey(key: string): boolean {
  let decodedKey = key;
  try {
    decodedKey = decodeURIComponent(key);
  } catch {
    // Ignore decoding errors
  }
  const keyNormalized = decodedKey.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    keyNormalized.includes(pattern.replace(/[-_]/g, '')),
  );
}

function tokenForValue(value: unknown): string {
  const key =
    typeof value === 'string'
      ? `s:${value}`
      : `j:${JSON.stringify(value) ?? String(value)}`;
  const existing = localValueToToken.get(key);
  if (existing) {
    return existing;
  }

  const id = randomUUID();
  const token = `[REDACTED:${id}]`;
  localRedactionStore.set(id, value);
  localValueToToken.set(key, token);
  return token;
}

function redactPemBlocks(text: string): string {
  let sanitized = text;
  let startIndex = 0;
  while ((startIndex = sanitized.indexOf('-----BEGIN', startIndex)) !== -1) {
    const endOfBegin = sanitized.indexOf('-----', startIndex + 10);
    if (endOfBegin === -1) {
      break;
    }

    const endHeaderStart = sanitized.indexOf('-----END', endOfBegin + 5);
    if (endHeaderStart === -1) {
      break;
    }

    const endHeaderEnd = sanitized.indexOf('-----', endHeaderStart + 8);
    if (endHeaderEnd === -1) {
      break;
    }

    const secret = sanitized.substring(startIndex, endHeaderEnd + 5);
    const before = sanitized.substring(0, startIndex);
    const after = sanitized.substring(endHeaderEnd + 5);
    const token = tokenForValue(secret);
    sanitized = before + token + after;
    startIndex = before.length + token.length;
  }

  return sanitized;
}

function redactKnownSecretStrings(text: string): string {
  let sanitized = redactPemBlocks(text);

  // Redact standalone tokens whose provider-specific format is distinctive
  // enough to avoid treating ordinary identifiers as credentials.
  const standaloneTokenPatterns = [
    /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
    /\bAIza[A-Za-z0-9_-]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  ];
  for (const pattern of standaloneTokenPatterns) {
    sanitized = sanitized.replace(pattern, (secret) => tokenForValue(secret));
  }

  const unquotedValue = `[^\\s]+(?:\\s+(?![a-zA-Z0-9_.-]+(?:=|:))[^\\s=:<>]+)*`;
  const valuePattern = `(?:"[^"]*"|'[^']*'|${unquotedValue})`;
  const urlSafeKeyPatternStr = SENSITIVE_KEY_PATTERNS.map((p) =>
    p.replace(/[-_]/g, '(?:[-_]|%2D|%5F|%2d|%5f)?'),
  ).join('|');

  const keyWithDelimiter = new RegExp(
    `((?:--)?("|')?(?:${urlSafeKeyPatternStr})\\2\\s*(?:[:=]|%3A|%3D)\\s*)(${valuePattern})`,
    'gi',
  );
  sanitized = sanitized.replace(
    keyWithDelimiter,
    (_match, prefix, _quote, value) => `${prefix}${tokenForValue(value)}`,
  );

  const tokenValuePattern = `[A-Za-z0-9._\\-/+=]{8,}`;
  const spaceKeywords = [
    ...SENSITIVE_KEY_PATTERNS.map((p) =>
      p.replace(/[-_]/g, '(?:[-_]|%2D|%5F|%2d|%5f)?'),
    ),
    'bearer',
  ];
  const spaceSeparated = new RegExp(
    `\\b((?:--)?(?:${spaceKeywords.join('|')})(?:\\s*:\\s*bearer)?\\s+)(${tokenValuePattern})`,
    'gi',
  );
  sanitized = sanitized.replace(
    spaceSeparated,
    (_match, prefix, value) => `${prefix}${tokenForValue(value)}`,
  );

  sanitized = sanitized.replace(
    /((?:[/\\][a-zA-Z0-9_-]+)*[/\\][a-zA-Z0-9_-]*\.(?:key|pem|p12|pfx))/gi,
    (secret) => tokenForValue(secret),
  );

  return sanitized;
}

function redactKnownSecrets(data: unknown, key?: string): unknown {
  if (
    key &&
    isSensitiveKey(key) &&
    typeof data === 'string' &&
    EXACT_RESTORABLE_REDACTION_TOKEN_RE.test(data)
  ) {
    return data;
  }

  if (key && isSensitiveKey(key)) {
    return tokenForValue(data);
  }

  if (typeof data === 'string') {
    return redactKnownSecretStrings(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactKnownSecrets(item));
  }

  if (data !== null && typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [entryKey, value] of Object.entries(data)) {
      sanitized[entryKey] = redactKnownSecrets(value, entryKey);
    }
    return sanitized;
  }

  return data;
}

function restoreLocalRedactions(data: unknown): unknown {
  if (typeof data === 'string') {
    const exactToken = data.match(EXACT_RESTORABLE_REDACTION_TOKEN_RE);
    if (exactToken) {
      return localRedactionStore.get(exactToken[1]) ?? data;
    }

    return data.replace(RESTORABLE_REDACTION_TOKEN_RE, (token, id) => {
      const value = localRedactionStore.get(id);
      return value === undefined ? token : String(value);
    });
  }

  if (Array.isArray(data)) {
    return data.map(restoreLocalRedactions);
  }

  if (data !== null && typeof data === 'object') {
    const restored: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      restored[key] = restoreLocalRedactions(value);
    }
    return restored;
  }

  return data;
}

export function redactRestorableSecrets(data: string): string;
export function redactRestorableSecrets(
  data: Record<string, unknown>,
): Record<string, unknown>;
export function redactRestorableSecrets(data: unknown[]): unknown[];
export function redactRestorableSecrets(data: unknown): unknown;
export function redactRestorableSecrets(data: unknown): unknown {
  return redactKnownSecrets(restoreRedact.detect(data));
}

export function restoreRedactedSecrets(data: string): string;
export function restoreRedactedSecrets(
  data: Record<string, unknown>,
): Record<string, unknown>;
export function restoreRedactedSecrets(data: unknown[]): unknown[];
export function restoreRedactedSecrets(data: unknown): unknown;
export function restoreRedactedSecrets(data: unknown): unknown {
  return restoreRedact.restore(restoreLocalRedactions(data));
}

export function clearRestorableSecretStore(): void {
  restoreRedact.clear();
  localRedactionStore.clear();
  localValueToToken.clear();
}

export function hasRestorableRedactions(data: unknown): boolean {
  if (typeof data === 'string') {
    RESTORABLE_REDACTION_TOKEN_RE.lastIndex = 0;
    const result = RESTORABLE_REDACTION_TOKEN_RE.test(data);
    RESTORABLE_REDACTION_TOKEN_RE.lastIndex = 0;
    return result;
  }
  if (Array.isArray(data)) {
    return data.some(hasRestorableRedactions);
  }
  if (data !== null && typeof data === 'object') {
    return Object.values(data).some(hasRestorableRedactions);
  }
  return false;
}

/**
 * Sanitizes tool arguments by recursively redacting sensitive fields.
 * Supports nested objects and arrays.
 */
export function sanitizeToolArgs(args: unknown): unknown {
  return redactRestorableSecrets(args);
}

/**
 * Sanitizes error messages by redacting potential sensitive data patterns.
 * Uses [^\s'"]+ to catch JWTs, tokens with dots/slashes, and other complex values.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return message;

  let sanitized = message;

  // Redact standalone tokens whose provider-specific format is distinctive
  // enough to avoid treating ordinary identifiers as credentials.
  const standaloneTokenPatterns = [
    /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
    /\bAIza[A-Za-z0-9_-]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  ];
  for (const pattern of standaloneTokenPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

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

  const unquotedValue = `[^\\s]+(?:\\s+(?![a-zA-Z0-9_.-]+(?:=|:))[^\\s=:<>]+)*`;
  const valuePattern = `(?:"[^"]*"|'[^']*'|${unquotedValue})`;

  // 2. Handle key-value pairs with delimiters (=, :, space, CLI-style --flag)
  const urlSafeKeyPatternStr = SENSITIVE_KEY_PATTERNS.map((p) =>
    p.replace(/[-_]/g, '(?:[-_]|%2D|%5F|%2d|%5f)?'),
  ).join('|');

  const keyWithDelimiter = new RegExp(
    `((?:--)?("|')?(${urlSafeKeyPatternStr})\\2\\s*(?:[:=]|%3A|%3D)\\s*)${valuePattern}`,
    'gi',
  );
  sanitized = sanitized.replace(keyWithDelimiter, '$1[REDACTED]');

  // 3. Handle space-separated sensitive keywords (e.g. "password mypass", "--api-key secret")
  const tokenValuePattern = `[A-Za-z0-9._\\-/+=]{8,}`;
  const spaceKeywords = [
    ...SENSITIVE_KEY_PATTERNS.map((p) =>
      p.replace(/[-_]/g, '(?:[-_]|%2D|%5F|%2d|%5f)?'),
    ),
    'bearer',
  ];
  const spaceSeparated = new RegExp(
    `\\b((?:--)?(?:${spaceKeywords.join('|')})(?:\\s*:\\s*bearer)?\\s+)(${tokenValuePattern})`,
    'gi',
  );
  sanitized = sanitized.replace(spaceSeparated, '$1[REDACTED]');

  // 4. Handle file path redaction
  sanitized = sanitized.replace(
    /((?:[/\\][a-zA-Z0-9_-]+)*[/\\][a-zA-Z0-9_-]*\.(?:key|pem|p12|pfx))/gi,
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

/** Sanitizes text immediately before it is sent to an external model. */
export function sanitizeModelContent(text: string): string {
  return redactRestorableSecrets(text);
}
