/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  classifyFailureKind,
  isCapacityQuotaError,
} from './errorClassification.js';
import {
  RetryableQuotaError,
  TerminalQuotaError,
} from '../utils/googleQuotaErrors.js';
import { ModelNotFoundError } from '../utils/httpErrors.js';

const mockGoogleApiError = {
  code: 429,
  message: 'mock quota error',
  details: [],
};

describe('errorClassification', () => {
  describe('isCapacityQuotaError', () => {
    it('returns true for MODEL_CAPACITY_EXHAUSTED reason', () => {
      const err = new TerminalQuotaError(
        'Resource exhausted',
        mockGoogleApiError,
        undefined,
        'MODEL_CAPACITY_EXHAUSTED',
      );
      expect(isCapacityQuotaError(err)).toBe(true);
    });

    it('returns true for MODEL_CAPACITY_EXCEEDED reason', () => {
      const err = new TerminalQuotaError(
        'Resource exhausted',
        mockGoogleApiError,
        undefined,
        'MODEL_CAPACITY_EXCEEDED',
      );
      expect(isCapacityQuotaError(err)).toBe(true);
    });

    it('returns true for capacity message without explicit reason', () => {
      const err = new TerminalQuotaError(
        'You have exhausted your capacity on this model.',
        mockGoogleApiError,
      );
      expect(isCapacityQuotaError(err)).toBe(true);
    });

    it('returns false for daily quota exhaustion', () => {
      const err = new TerminalQuotaError(
        'You have exhausted your daily quota on this model.',
        mockGoogleApiError,
      );
      expect(isCapacityQuotaError(err)).toBe(false);
    });
  });

  describe('classifyFailureKind', () => {
    it('classifies non-capacity TerminalQuotaError as terminal', () => {
      const err = new TerminalQuotaError(
        'You have exhausted your daily quota on this model.',
        mockGoogleApiError,
      );
      expect(classifyFailureKind(err)).toBe('terminal');
    });

    it('classifies capacity TerminalQuotaError as transient', () => {
      const err = new TerminalQuotaError(
        'No capacity available',
        mockGoogleApiError,
        5,
        'MODEL_CAPACITY_EXHAUSTED',
      );
      expect(classifyFailureKind(err)).toBe('transient');
    });

    it('classifies RetryableQuotaError as transient', () => {
      const err = new RetryableQuotaError(
        'Temporary rate limit',
        mockGoogleApiError,
        1,
      );
      expect(classifyFailureKind(err)).toBe('transient');
    });

    it('classifies ModelNotFoundError as not_found', () => {
      const err = new ModelNotFoundError('Model not found', 404);
      expect(classifyFailureKind(err)).toBe('not_found');
    });

    it('classifies unknown errors as unknown', () => {
      expect(classifyFailureKind(new Error('boom'))).toBe('unknown');
    });
  });
});
