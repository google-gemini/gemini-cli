/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { createRequire as createModuleRequire } from 'node:module';

interface RestoreRedact {
  detect<T>(data: T): T;
  restore<T>(data: T): T;
  clear(): void;
}

function isRestoreRedact(v: unknown): v is RestoreRedact {
  if (typeof v !== 'object' || v === null) return false;
  if (!('detect' in v && 'restore' in v && 'clear' in v)) return false;
  return (
    typeof v.detect === 'function' &&
    typeof v.restore === 'function' &&
    typeof v.clear === 'function'
  );
}

const moduleRequire = createModuleRequire(import.meta.url);
const loaded: unknown = moduleRequire('restore-redact');
if (!isRestoreRedact(loaded)) {
  throw new Error('restore-redact module did not load as expected');
}
const restoreRedact: RestoreRedact = loaded;

const RESTORABLE_REDACTION_TOKEN_RE =
  /\[REDACTED:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;
const RESTORABLE_REDACTION_TOKEN_PREFIX = '[REDACTED:';
const EXACT_RESTORABLE_REDACTION_TOKEN_RE =
  /^\[REDACTED:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]$/;
const localRedactionStore = new Map<string, unknown>();
const localValueToToken = new Map<string, string>();
const DEFAULT_PRESIDIO_ANALYZER_URL = 'http://127.0.0.1:5002/analyze';
const DEFAULT_PRESIDIO_ENTITIES = [
  'PERSON',
  'EMAIL_ADDRESS',
  'PHONE_NUMBER',
  'LOCATION',
  'CREDIT_CARD',
  'CRYPTO',
  'IBAN_CODE',
  'IP_ADDRESS',
  'MEDICAL_LICENSE',
  'NRP',
  'US_BANK_NUMBER',
  'US_DRIVER_LICENSE',
  'US_ITIN',
  'US_PASSPORT',
  'US_SSN',
];

interface PresidioAnalyzerResult {
  entity_type: string;
  start: number;
  end: number;
  score: number;
}

export interface PresidioSanitizationOptions {
  enabled?: boolean;
  analyzerUrl?: string;
  entities?: string[];
  language?: string;
  scoreThreshold?: number;
  timeoutMs?: number;
}

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

function isPresidioAnalyzerResult(
  value: unknown,
): value is PresidioAnalyzerResult {
  if (value === null || typeof value !== 'object') return false;
  const result = value as Partial<PresidioAnalyzerResult>;
  return (
    typeof result.entity_type === 'string' &&
    typeof result.start === 'number' &&
    Number.isInteger(result.start) &&
    typeof result.end === 'number' &&
    Number.isInteger(result.end) &&
    typeof result.score === 'number'
  );
}

function redactPresidioSpans(
  text: string,
  results: PresidioAnalyzerResult[],
): string {
  const codeUnitOffsets = [0];
  for (const character of text) {
    codeUnitOffsets.push(
      codeUnitOffsets[codeUnitOffsets.length - 1] + character.length,
    );
  }
  const validResults = results
    .filter(
      (result) =>
        result.start >= 0 &&
        result.end > result.start &&
        result.end < codeUnitOffsets.length,
    )
    .map((result) => ({
      ...result,
      start: codeUnitOffsets[result.start],
      end: codeUnitOffsets[result.end],
    }))
    .sort((a, b) => b.start - a.start || b.end - a.end);

  let sanitized = text;
  let earliestAppliedStart = text.length;
  for (const result of validResults) {
    // Prefer the longer/rightmost result when Presidio returns overlapping
    // recognizer matches for the same text.
    if (result.end > earliestAppliedStart) continue;
    const value = text.slice(result.start, result.end);
    sanitized =
      sanitized.slice(0, result.start) +
      tokenForValue(value) +
      sanitized.slice(result.end);
    earliestAppliedStart = result.start;
  }
  return sanitized;
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

/**
 * Restores model output while retaining suffixes that may be a redaction token
 * split across streaming chunks.
 */
export class StreamingRedactionRestorer {
  private pending = '';

  push(chunk: string): string {
    this.pending += chunk;
    const safeEnd = this.findSafeEnd();
    const safeText = this.pending.slice(0, safeEnd);
    this.pending = this.pending.slice(safeEnd);
    return restoreRedactedSecrets(safeText);
  }

  flush(): string {
    const remaining = restoreRedactedSecrets(this.pending);
    this.pending = '';
    return remaining;
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  private findSafeEnd(): number {
    const tokenStart = this.pending.lastIndexOf(
      RESTORABLE_REDACTION_TOKEN_PREFIX,
    );
    if (tokenStart >= 0 && this.pending.indexOf(']', tokenStart) === -1) {
      return tokenStart;
    }

    const maxPrefixLength = Math.min(
      RESTORABLE_REDACTION_TOKEN_PREFIX.length - 1,
      this.pending.length,
    );
    for (let length = maxPrefixLength; length > 0; length--) {
      if (
        RESTORABLE_REDACTION_TOKEN_PREFIX.startsWith(
          this.pending.slice(-length),
        )
      ) {
        return this.pending.length - length;
      }
    }
    return this.pending.length;
  }
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

/**
 * Sanitizes model-bound text with local secret detection followed by a
 * Presidio Analyzer sidecar. Failure is intentionally fatal so custom model
 * requests cannot silently bypass PII redaction.
 */
export async function sanitizeModelContentWithPresidio(
  text: string,
  options: PresidioSanitizationOptions = {},
): Promise<string> {
  const secretSanitized = sanitizeModelContent(text);
  if (!secretSanitized) return secretSanitized;
  if (options.enabled === false) return secretSanitized;

  const analyzerUrl =
    options.analyzerUrl ??
    process.env['GEMINI_PRESIDIO_ANALYZER_URL'] ??
    DEFAULT_PRESIDIO_ANALYZER_URL;
  const timeoutMs = options.timeoutMs ?? 5000;

  let response: Response;
  try {
    response = await fetch(analyzerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: secretSanitized,
        language: options.language ?? 'en',
        entities: options.entities ?? DEFAULT_PRESIDIO_ENTITIES,
        score_threshold: options.scoreThreshold ?? 0.5,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(
      `Presidio Analyzer is required for custom endpoints but could not be reached at ${analyzerUrl}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Presidio Analyzer rejected the request: ${response.status} ${response.statusText}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !payload.every(isPresidioAnalyzerResult)) {
    throw new Error('Presidio Analyzer returned an invalid response');
  }

  return redactPresidioSpans(secretSanitized, payload);
}

/** Recursively applies Presidio to strings in model-bound structured data. */
export async function sanitizeModelDataWithPresidio(
  data: unknown,
  options: PresidioSanitizationOptions = {},
): Promise<unknown> {
  const secretSanitized = redactRestorableSecrets(data);
  if (typeof secretSanitized === 'string') {
    return sanitizeModelContentWithPresidio(secretSanitized, options);
  }
  if (Array.isArray(secretSanitized)) {
    return Promise.all(
      secretSanitized.map((entry) =>
        sanitizeModelDataWithPresidio(entry, options),
      ),
    );
  }
  if (secretSanitized !== null && typeof secretSanitized === 'object') {
    const entries = await Promise.all(
      Object.entries(secretSanitized).map(async ([key, value]) => [
        key,
        await sanitizeModelDataWithPresidio(value, options),
      ]),
    );
    return Object.fromEntries(entries);
  }
  return secretSanitized;
}
