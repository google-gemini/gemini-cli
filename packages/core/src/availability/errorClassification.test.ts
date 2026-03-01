/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { classifyFailureKind } from './errorClassification.js';
import {
  TerminalQuotaError,
  RetryableQuotaError,
} from '../utils/googleQuotaErrors.js';
import { ModelNotFoundError } from '../utils/httpErrors.js';

const mockCause = { code: 429, message: 'quota exceeded', details: [] };

describe('classifyFailureKind', () => {
  it('returns "terminal" for a TerminalQuotaError', () => {
    const error = new TerminalQuotaError('daily limit exceeded', mockCause);
    expect(classifyFailureKind(error)).toBe('terminal');
  });

  it('returns "transient" for a RetryableQuotaError', () => {
    const error = new RetryableQuotaError('rate limit exceeded', mockCause);
    expect(classifyFailureKind(error)).toBe('transient');
  });

  it('returns "not_found" for a ModelNotFoundError', () => {
    const error = new ModelNotFoundError('model not found', 404);
    expect(classifyFailureKind(error)).toBe('not_found');
  });

  it('returns "unknown" for a generic Error', () => {
    const error = new Error('something went wrong');
    expect(classifyFailureKind(error)).toBe('unknown');
  });

  it('returns "unknown" for a plain object', () => {
    expect(classifyFailureKind({ message: 'error' })).toBe('unknown');
  });

  it('returns "unknown" for null', () => {
    expect(classifyFailureKind(null)).toBe('unknown');
  });

  it('returns "unknown" for undefined', () => {
    expect(classifyFailureKind(undefined)).toBe('unknown');
  });

  it('returns "unknown" for a string', () => {
    expect(classifyFailureKind('some error string')).toBe('unknown');
  });
});
