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

describe('classifyFailureKind', () => {
  it('should return "terminal" for TerminalQuotaError', () => {
    const error = new TerminalQuotaError('Daily quota exceeded', {
      code: 429,
      message: 'quota exceeded',
      details: [],
    });
    expect(classifyFailureKind(error)).toBe('terminal');
  });

  it('should return "transient" for RetryableQuotaError', () => {
    const error = new RetryableQuotaError('Rate limit hit', {
      code: 429,
      message: 'rate limit',
      details: [],
    });
    expect(classifyFailureKind(error)).toBe('transient');
  });

  it('should return "not_found" for ModelNotFoundError', () => {
    const error = new ModelNotFoundError('Model not found', 404);
    expect(classifyFailureKind(error)).toBe('not_found');
  });

  it('should return "not_found" for ModelNotFoundError without code', () => {
    const error = new ModelNotFoundError('Model not found');
    expect(classifyFailureKind(error)).toBe('not_found');
  });

  it('should return "unknown" for a generic Error', () => {
    const error = new Error('something went wrong');
    expect(classifyFailureKind(error)).toBe('unknown');
  });

  it('should return "unknown" for a string error', () => {
    expect(classifyFailureKind('some string error')).toBe('unknown');
  });

  it('should return "unknown" for null', () => {
    expect(classifyFailureKind(null)).toBe('unknown');
  });

  it('should return "unknown" for undefined', () => {
    expect(classifyFailureKind(undefined)).toBe('unknown');
  });
});
