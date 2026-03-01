/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { classifyFailureKind } from './errorClassification.js';
import {
  TerminalQuotaError,
  RetryableQuotaError,
} from '../utils/googleQuotaErrors.js';
import { ModelNotFoundError } from '../utils/httpErrors.js';
import type { GoogleApiError } from '../utils/googleErrors.js';

const stubCause: GoogleApiError = {
  code: 429,
  message: 'test',
  details: [],
};

describe('classifyFailureKind', () => {
  it('returns "terminal" for TerminalQuotaError', () => {
    const error = new TerminalQuotaError('quota exhausted', stubCause);
    expect(classifyFailureKind(error)).toBe('terminal');
  });

  it('returns "transient" for RetryableQuotaError', () => {
    const error = new RetryableQuotaError('rate limited', stubCause);
    expect(classifyFailureKind(error)).toBe('transient');
  });

  it('returns "not_found" for ModelNotFoundError', () => {
    const error = new ModelNotFoundError('model not found');
    expect(classifyFailureKind(error)).toBe('not_found');
  });

  it('returns "unknown" for a generic Error', () => {
    expect(classifyFailureKind(new Error('something went wrong'))).toBe(
      'unknown',
    );
  });

  it('returns "unknown" for null', () => {
    expect(classifyFailureKind(null)).toBe('unknown');
  });

  it('returns "unknown" for undefined', () => {
    expect(classifyFailureKind(undefined)).toBe('unknown');
  });

  it('returns "unknown" for a string error', () => {
    expect(classifyFailureKind('some string error')).toBe('unknown');
  });

  it('returns "unknown" for a plain object', () => {
    expect(classifyFailureKind({ status: 500, message: 'fail' })).toBe(
      'unknown',
    );
  });
});
