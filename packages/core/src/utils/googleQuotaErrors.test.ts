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

  it('should return RetryableQuotaError when message contains "Please retry in Xs"', () => {
    const complexError = {
      error: {
        message:
          '{"error": {"code": 429, "status": 429, "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/usage?tab=rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 2\nPlease retry in 44.097740004s.", "details": [{"detail": "??? to (unknown) : APP_ERROR(8) You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/usage?tab=rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 2\nPlease retry in 44.097740004s."}]}}',
        code: 429,
        status: 'Too Many Requests',
      },
    };
    const rawError = new Error(JSON.stringify(complexError));
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(null);

    const result = classifyGoogleError(rawError);

    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBe(44097.740004);
    expect((result as RetryableQuotaError).message).toBe(rawError.message);
  });

  it('should return RetryableQuotaError when error is a string and message contains "Please retry in Xms"', () => {
    const complexErrorString = JSON.stringify({
      error: {
        message:
          '{"error": {"code": 429, "status": 429, "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/usage?tab=rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 2\nPlease retry in 900.2ms.", "details": [{"detail": "??? to (unknown) : APP_ERROR(8) You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/usage?tab=rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 2\nPlease retry in 900.2ms."}]}}',
        code: 429,
        status: 'Too Many Requests',
      },
    });
    const rawError = new Error(complexErrorString);
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(null);

    const result = classifyGoogleError(rawError);

    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBeCloseTo(900.2);
    expect((result as RetryableQuotaError).message).toBe(rawError.message);
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

  it('should return RetryableQuotaError for another short retry delay', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message:
        'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 2\nPlease retry in 56.185908122s.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric:
                'generativelanguage.googleapis.com/generate_content_free_tier_requests',
              quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
              quotaDimensions: {
                location: 'global',
                model: 'gemini-2.5-pro',
              },
              quotaValue: '2',
            },
          ],
        },
        {
          '@type': 'type.googleapis.com/google.rpc.Help',
          links: [
            {
              description: 'Learn more about Gemini API quotas',
              url: 'https://ai.google.dev/gemini-api/docs/rate-limits',
            },
          ],
        },
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '56s',
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBe(56000);
  });

  it('should return RetryableQuotaError for Cloud Code RATE_LIMIT_EXCEEDED with retry delay', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message:
        'You have exhausted your capacity on this model. Your quota will reset after 0s.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'RATE_LIMIT_EXCEEDED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: {
            uiMessage: 'true',
            model: 'gemini-2.5-pro',
            quotaResetDelay: '539.477544ms',
            quotaResetTimeStamp: '2025-10-20T19:14:08Z',
          },
        },
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '0.539477544s',
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBeCloseTo(
      539.477544,
    );
  });

  it('should return TerminalQuotaError for Cloud Code QUOTA_EXHAUSTED', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message:
        'You have exhausted your capacity on this model. Your quota will reset after 0s.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'QUOTA_EXHAUSTED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: {
            uiMessage: 'true',
            model: 'gemini-2.5-pro',
            quotaResetDelay: '539.477544ms',
            quotaResetTimeStamp: '2025-10-20T19:14:08Z',
          },
        },
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '0.539477544s',
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(TerminalQuotaError);
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
