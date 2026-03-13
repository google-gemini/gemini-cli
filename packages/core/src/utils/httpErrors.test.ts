/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getErrorStatus, ModelNotFoundError } from './httpErrors.js';

describe('httpErrors', () => {
  describe('getErrorStatus', () => {
    it('returns status from a direct status property', () => {
      expect(getErrorStatus({ status: 404 })).toBe(404);
    });

    it('returns status from an Error with status', () => {
      const error = Object.assign(new Error('fail'), { status: 500 });
      expect(getErrorStatus(error)).toBe(500);
    });

    it('returns status from error.response.status (axios-style)', () => {
      const error = { response: { status: 429 } };
      expect(getErrorStatus(error)).toBe(429);
    });

    it('returns status from nested response with extra headers', () => {
      const error = {
        response: { status: 503, headers: { 'retry-after': '30' } },
      };
      expect(getErrorStatus(error)).toBe(503);
    });

    it('returns undefined for null', () => {
      expect(getErrorStatus(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(getErrorStatus(undefined)).toBeUndefined();
    });

    it('returns undefined for a string', () => {
      expect(getErrorStatus('error')).toBeUndefined();
    });

    it('returns undefined for a number', () => {
      expect(getErrorStatus(42)).toBeUndefined();
    });

    it('returns undefined for an empty object', () => {
      expect(getErrorStatus({})).toBeUndefined();
    });

    it('returns undefined when status is not a number', () => {
      expect(getErrorStatus({ status: '404' })).toBeUndefined();
    });

    it('returns undefined when response is not an object', () => {
      expect(getErrorStatus({ response: 'not an object' })).toBeUndefined();
    });

    it('returns undefined when response is null', () => {
      expect(getErrorStatus({ response: null })).toBeUndefined();
    });

    it('returns undefined when response has no status', () => {
      expect(getErrorStatus({ response: { headers: {} } })).toBeUndefined();
    });

    it('returns undefined when response.status is not a number', () => {
      expect(getErrorStatus({ response: { status: 'bad' } })).toBeUndefined();
    });

    it('prefers direct status over response.status', () => {
      const error = { status: 400, response: { status: 500 } };
      expect(getErrorStatus(error)).toBe(400);
    });
  });

  describe('ModelNotFoundError', () => {
    it('creates error with default 404 code', () => {
      const error = new ModelNotFoundError('model not found');
      expect(error.message).toBe('model not found');
      expect(error.code).toBe(404);
      expect(error.name).toBe('ModelNotFoundError');
      expect(error).toBeInstanceOf(Error);
    });

    it('creates error with custom code', () => {
      const error = new ModelNotFoundError('gone', 410);
      expect(error.code).toBe(410);
    });
  });
});
