/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keys whose value is a credential often enough that logging it is never
 * worth the risk. Matched as a substring of the key with case, separators
 * and spacing removed, so one entry covers every spelling a header or a
 * field arrives in: `apikey` also matches `apiKey`, `API_KEY` and
 * `x-goog-api-key`.
 */
const SECRET_KEY_PARTS = [
  'authorization',
  'apikey',
  'cookie',
  'credential',
  'password',
  'secret',
  'token',
];

const REDACTED = '[REDACTED]';

const isSecretKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_KEY_PARTS.some((part) => normalized.includes(part));
};

/**
 * A copy of `value` with the value of every secret-looking key replaced.
 *
 * Structure is kept: an object stays an object and an array stays an array,
 * so a redacted body still reads as the body it came from. Nothing is
 * mutated in place, because the caller is logging a live request and must
 * get it back unchanged.
 *
 * `seen` guards a body that refers to itself, which a log call must not turn
 * into a stack overflow.
 */
export function redactSecrets(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, seen));
  }

  return redactRecord({ ...value }, seen);
}

/**
 * The same rule over a record whose shape is already known, which is what a
 * log call's metadata is.
 */
export function redactRecord(
  record: Record<string, unknown>,
  seen = new WeakSet(),
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    result[key] = isSecretKey(key) ? REDACTED : redactSecrets(item, seen);
  }
  return result;
}
