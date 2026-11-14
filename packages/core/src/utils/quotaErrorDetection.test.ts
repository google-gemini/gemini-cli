/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isApiError, isStructuredError } from './quotaErrorDetection.js';

describe('isApiError', () => {
  it('returns true for a well-formed ApiError', () => {
    expect(
      isApiError({
        error: {
          code: 429,
          message: 'quota exceeded',
          status: 'RESOURCE_EXHAUSTED',
          details: [],
        },
      }),
    ).toBe(true);
  });

  it('returns false when the status field is missing', () => {
    expect(isApiError({ error: { code: 429, message: 'x' } })).toBe(false);
  });

  it('returns false when code is not a number', () => {
    expect(
      isApiError({ error: { code: '429', message: 'x', status: 'y' } }),
    ).toBe(false);
  });

  it('returns false when code is missing', () => {
    expect(isApiError({ error: { message: 'x', status: 'y' } })).toBe(false);
  });

  it('returns false when there is no error property', () => {
    expect(isApiError({ foo: 1 })).toBe(false);
  });

  it('returns false for null or non-object input', () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError('a string')).toBe(false);
  });

  it('returns false when error is null', () => {
    expect(isApiError({ error: null })).toBe(false);
  });
});

describe('isStructuredError', () => {
  it('returns true for a message-only error', () => {
    expect(isStructuredError({ message: 'boom' })).toBe(true);
  });

  it('returns true when status is a number', () => {
    expect(isStructuredError({ message: 'boom', status: 500 })).toBe(true);
  });

  it('returns true when status is undefined', () => {
    expect(isStructuredError({ message: 'boom', status: undefined })).toBe(
      true,
    );
  });

  it('returns true when status is 0', () => {
    expect(isStructuredError({ message: 'boom', status: 0 })).toBe(true);
  });

  it('returns false when status is a non-number defined value', () => {
    expect(isStructuredError({ message: 'boom', status: '500' })).toBe(false);
    expect(isStructuredError({ message: 'boom', status: null })).toBe(false);
  });

  it('returns false when message is not a string', () => {
    expect(isStructuredError({ message: 123 })).toBe(false);
  });

  it('returns false when there is no message property', () => {
    expect(isStructuredError({ status: 500 })).toBe(false);
  });

  it('returns false for null or non-object input', () => {
    expect(isStructuredError(null)).toBe(false);
    expect(isStructuredError('boom')).toBe(false);
  });
});
