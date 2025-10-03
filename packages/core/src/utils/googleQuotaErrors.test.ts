/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  classifyGoogleError,
  RetryableQuotaError,
  TerminalQuotaError,
} from './googleQuotaErrors.js';
import * as errorParser from './googleErrors.js';
import type { GoogleApiError } from './googleErrors.js';

describe('classifyGoogleError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return original error if not a Google API error', () => {
    const regularError = new Error('Something went wrong');
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(null);
    const result = classifyGoogleError(regularError);
    expect(result).toBe(regularError);
  });

  it('should return original error if code is not 429', () => {
    const apiError: GoogleApiError = {
      code: 500,
      message: 'Server error',
      details: [],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const originalError = new Error();
    const result = classifyGoogleError(originalError);
    expect(result).toBe(originalError);
    expect(result).not.toBeInstanceOf(TerminalQuotaError);
    expect(result).not.toBeInstanceOf(RetryableQuotaError);
  });

  it('should return TerminalQuotaError for daily quota violations in QuotaFailure', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              subject: 'user',
              description: 'daily limit',
              quotaId: 'RequestsPerDay-limit',
            },
          ],
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(TerminalQuotaError);
    expect((result as TerminalQuotaError).cause).toBe(apiError);
  });

  it('should return TerminalQuotaError for daily quota violations in ErrorInfo', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'QUOTA_EXCEEDED',
          domain: 'googleapis.com',
          metadata: {
            quota_limit: 'RequestsPerDay_PerProject_PerUser',
          },
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(TerminalQuotaError);
  });

  it('should return TerminalQuotaError for long retry delays', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Too many requests',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '301s', // > 5 minutes
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(TerminalQuotaError);
  });

  it('should return RetryableQuotaError for short retry delays', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Too many requests',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '45.123s',
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBe(45123);
  });

  it('should return RetryableQuotaError for per-minute quota violations in QuotaFailure', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              subject: 'user',
              description: 'per minute limit',
              quotaId: 'RequestsPerMinute-limit',
            },
          ],
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBe(60000);
  });

  it('should return RetryableQuotaError for per-minute quota violations in ErrorInfo', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'QUOTA_EXCEEDED',
          domain: 'googleapis.com',
          metadata: {
            quota_limit: 'RequestsPerMinute_PerProject_PerUser',
          },
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBe(60000);
  });

  it('should prioritize daily limit over retry info', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              subject: 'user',
              description: 'daily limit',
              quotaId: 'RequestsPerDay-limit',
            },
          ],
        },
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '10s',
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(TerminalQuotaError);
  });

  it('should return original error for 429 without specific details', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Too many requests',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.DebugInfo',
          detail: 'some debug info',
          stackEntries: [],
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const originalError = new Error();
    const result = classifyGoogleError(originalError);
    expect(result).toBe(originalError);
  });
});
