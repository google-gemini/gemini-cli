/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redaction.js';

describe('redactSecrets', () => {
  it('replaces the value of a secret-looking key', () => {
    expect(
      redactSecrets({ authorization: 'Bearer abc', command: 'ls' }),
    ).toEqual({ authorization: '[REDACTED]', command: 'ls' });
  });

  it('matches the key however it is spelled', () => {
    expect(
      redactSecrets({
        apiKey: 'a',
        API_KEY: 'b',
        'x-goog-api-key': 'c',
        refreshToken: 'd',
        Password: 'e',
      }),
    ).toEqual({
      apiKey: '[REDACTED]',
      API_KEY: '[REDACTED]',
      'x-goog-api-key': '[REDACTED]',
      refreshToken: '[REDACTED]',
      Password: '[REDACTED]',
    });
  });

  it('reaches a secret nested inside the body', () => {
    expect(
      redactSecrets({
        parts: [{ headers: { Authorization: 'Bearer abc' }, text: 'hello' }],
      }),
    ).toEqual({
      parts: [{ headers: { Authorization: '[REDACTED]' }, text: 'hello' }],
    });
  });

  it('keeps everything that is not a secret, including falsy values', () => {
    const body = { command: 'ls', args: ['-la'], count: 0, flag: false };

    expect(redactSecrets(body)).toEqual(body);
  });

  it('does not mutate the value it was given', () => {
    const body = { authorization: 'Bearer abc' };

    redactSecrets(body);

    expect(body.authorization).toBe('Bearer abc');
  });

  it('survives a body that refers to itself', () => {
    const body: Record<string, unknown> = { token: 'abc' };
    body['self'] = body;

    expect(redactSecrets(body)).toEqual({
      token: '[REDACTED]',
      self: '[Circular]',
    });
  });

  it.each([
    'total_tokens',
    'promptTokens',
    'completion_tokens',
    'cached_tokens',
  ])('keeps %s, which is a count and not a credential', (key) => {
    expect(redactSecrets({ [key]: 1234 })).toEqual({ [key]: 1234 });
  });

  it('still redacts the singular token keys', () => {
    expect(
      redactSecrets({ token: 'a', refreshToken: 'b', id_token: 'c' }),
    ).toEqual({
      token: '[REDACTED]',
      refreshToken: '[REDACTED]',
      id_token: '[REDACTED]',
    });
  });

  it('returns a Date as the Date it was, rather than an empty object', () => {
    const when = new Date('2026-09-14T12:00:00.000Z');

    expect(redactSecrets({ when })).toEqual({ when });
  });

  it.each([
    ['Map', new Map([['token', 'a']])],
    ['Set', new Set(['a'])],
    ['Error', new Error('boom')],
    ['Buffer', Buffer.from('hi')],
  ])('passes a %s through rather than spreading it away', (_name, value) => {
    expect((redactSecrets({ value }) as { value: unknown }).value).toBe(value);
  });

  it('passes a primitive through untouched', () => {
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(7)).toBe(7);
  });
});
