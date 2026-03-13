/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isApiError, isStructuredError } from './quotaErrorDetection.js';

describe('quotaErrorDetection', () => {
  describe('isApiError', () => {
    it('returns true for a valid ApiError object', () => {
      const error = {
        error: {
          code: 429,
          message: 'Resource exhausted',
          status: 'RESOURCE_EXHAUSTED',
          details: [],
        },
      };
      expect(isApiError(error)).toBe(true);
    });

    it('returns true when error.error has extra fields', () => {
      const error = {
        error: {
          code: 500,
          message: 'Internal error',
          status: 'INTERNAL',
          details: [],
          extra: 'field',
        },
      };
      expect(isApiError(error)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isApiError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isApiError(undefined)).toBe(false);
    });

    it('returns false for a string', () => {
      expect(isApiError('some error')).toBe(false);
    });

    it('returns false for a number', () => {
      expect(isApiError(42)).toBe(false);
    });

    it('returns false when error property is missing', () => {
      expect(isApiError({ message: 'not an api error' })).toBe(false);
    });

    it('returns false when error property is not an object', () => {
      expect(isApiError({ error: 'string value' })).toBe(false);
    });

    it('returns false when error property is null', () => {
      expect(isApiError({ error: null })).toBe(false);
    });

    it('returns false when error.error has no message field', () => {
      expect(isApiError({ error: { code: 400, status: 'BAD_REQUEST' } })).toBe(
        false,
      );
    });

    it('returns false when error.error is missing code', () => {
      expect(
        isApiError({
          error: { message: 'fail', status: 'UNKNOWN', details: [] },
        }),
      ).toBe(false);
    });

    it('returns false when error.error is missing status', () => {
      expect(
        isApiError({ error: { code: 400, message: 'fail', details: [] } }),
      ).toBe(false);
    });

    it('returns false when error.error is missing details', () => {
      expect(
        isApiError({
          error: { code: 400, message: 'fail', status: 'BAD_REQUEST' },
        }),
      ).toBe(false);
    });

    it('returns false for an empty object', () => {
      expect(isApiError({})).toBe(false);
    });

    it('returns false for an array', () => {
      expect(isApiError([{ error: { message: 'test' } }])).toBe(false);
    });
  });

  describe('isStructuredError', () => {
    it('returns true for a valid StructuredError', () => {
      expect(isStructuredError({ message: 'Something failed' })).toBe(true);
    });

    it('returns true for a StructuredError with status', () => {
      expect(isStructuredError({ message: 'Not found', status: 404 })).toBe(
        true,
      );
    });

    it('returns true for an Error instance', () => {
      expect(isStructuredError(new Error('test error'))).toBe(true);
    });

    it('returns false for null', () => {
      expect(isStructuredError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isStructuredError(undefined)).toBe(false);
    });

    it('returns false for a string', () => {
      expect(isStructuredError('error message')).toBe(false);
    });

    it('returns false for a number', () => {
      expect(isStructuredError(500)).toBe(false);
    });

    it('returns false when message is not a string', () => {
      expect(isStructuredError({ message: 123 })).toBe(false);
    });

    it('returns false when message is an object', () => {
      expect(isStructuredError({ message: { text: 'error' } })).toBe(false);
    });

    it('returns false when message property is missing', () => {
      expect(isStructuredError({ error: 'something' })).toBe(false);
    });

    it('returns false for an empty object', () => {
      expect(isStructuredError({})).toBe(false);
    });
  });
});
