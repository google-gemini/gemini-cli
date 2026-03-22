/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isApiError, isStructuredError } from './quotaErrorDetection.js';

describe('isApiError', () => {
  it('returns true for a valid API error object', () => {
    const error = {
      error: {
        code: 429,
        message: 'quota exceeded',
        status: 'RESOURCE_EXHAUSTED',
        details: [],
      },
    };
    expect(isApiError(error)).toBe(true);
  });

  it('returns false when error.error is missing', () => {
    expect(isApiError({ other: 'value' })).toBe(false);
  });

  it('returns false when error.error is not an object', () => {
    expect(isApiError({ error: 'string' })).toBe(false);
  });

  it('returns false when error.error.message is missing', () => {
    expect(isApiError({ error: { code: 429 } })).toBe(false);
  });

  it('returns false for non-object inputs', () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError(undefined)).toBe(false);
    expect(isApiError(42)).toBe(false);
    expect(isApiError('string')).toBe(false);
  });
});

describe('isStructuredError', () => {
  it('returns true for an object with a string message property', () => {
    expect(isStructuredError({ message: 'something went wrong' })).toBe(true);
  });

  it('returns false when message is not a string', () => {
    expect(isStructuredError({ message: 123 })).toBe(false);
  });

  it('returns false when message is missing', () => {
    expect(isStructuredError({ code: 500 })).toBe(false);
  });

  it('returns false for non-object inputs', () => {
    expect(isStructuredError(null)).toBe(false);
    expect(isStructuredError(undefined)).toBe(false);
    expect(isStructuredError(42)).toBe(false);
  });
});
