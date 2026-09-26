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

/**
 * Keys that contain one of the words above and are not credentials. A token
 * COUNT is the case that matters: `total_tokens`, `prompt_tokens` and
 * `completion_tokens` are the numbers an operator reads the log for, and
 * redacting those would make the log useless to keep a secret that was never
 * there. Credentials are singular -- `token`, `refreshToken`, `id_token` --
 * so the plural is the tell.
 */
const NOT_A_SECRET = /tokens/;

const REDACTED = '[REDACTED]';

const isSecretKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (NOT_A_SECRET.test(normalized)) {
    return false;
  }
  return SECRET_KEY_PARTS.some((part) => normalized.includes(part));
};

/**
 * Whether recursing into `value` would rebuild it faithfully.
 *
 * `{ ...value }` is only lossless for a plain object: spreading a `Date`, a
 * `Map`, a `Set`, an `Error` or a `Buffer` yields `{}` or drops everything
 * that made it that type, so a log line would lose the value it came to
 * report. Anything else is passed through as it is -- it holds no keys for
 * this to match on anyway.
 */
const isPlainObject = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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

  if (!isPlainObject(value)) {
    return value;
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
