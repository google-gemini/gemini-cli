/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getErrorStatus, ModelNotFoundError } from './httpErrors.js';

describe('getErrorStatus', () => {
  it('returns status from a direct .status property', () => {
    expect(getErrorStatus({ status: 429 })).toBe(429);
  });

  it('returns status from a nested response.status property', () => {
    expect(getErrorStatus({ response: { status: 503 } })).toBe(503);
  });

  it('returns undefined for non-object inputs', () => {
    expect(getErrorStatus(null)).toBeUndefined();
    expect(getErrorStatus(undefined)).toBeUndefined();
    expect(getErrorStatus('error')).toBeUndefined();
    expect(getErrorStatus(42)).toBeUndefined();
  });

  it('returns undefined when status is not a number', () => {
    expect(getErrorStatus({ status: 'not a number' })).toBeUndefined();
  });

  it('returns undefined when response.status is missing', () => {
    expect(getErrorStatus({ response: {} })).toBeUndefined();
  });

  it('returns undefined when response is null', () => {
    expect(getErrorStatus({ response: null })).toBeUndefined();
  });

  it('returns undefined for an empty object', () => {
    expect(getErrorStatus({})).toBeUndefined();
  });
});

describe('ModelNotFoundError', () => {
  it('creates an error with default code 404', () => {
    const error = new ModelNotFoundError('model not found');
    expect(error.message).toBe('model not found');
    expect(error.name).toBe('ModelNotFoundError');
    expect(error.code).toBe(404);
    expect(error).toBeInstanceOf(Error);
  });

  it('creates an error with a custom code', () => {
    const error = new ModelNotFoundError('gone', 410);
    expect(error.code).toBe(410);
  });
});
