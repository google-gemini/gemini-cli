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
  ValidationRequiredError,
} from './googleQuotaErrors.js';
import * as errorParser from './googleErrors.js';
import type { GoogleApiError } from './googleErrors.js';
import { ModelNotFoundError } from './httpErrors.js';

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

  it('should return RetryableQuotaError for 503 Service Unavailable', () => {
    const apiError: GoogleApiError = {
      code: 503,
      message: 'Service Unavailable',
      details: [],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const originalError = new Error('Service Unavailable');
    const result = classifyGoogleError(originalError);
    expect(result).toBeInstanceOf(RetryableQuotaError);
    if (result instanceof RetryableQuotaError) {
      expect(result.cause).toBe(apiError);
      expect(result.message).toBe('Service Unavailable');
    }
  });

  it('should return original error if code is not 429 or 503', () => {
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

  it('should return RetryableQuotaError for long retry delays', () => {
    const apiError: GoogleApiError = {
      code: 429,
      message: 'Too many requests',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '301s', // Any delay is now retryable
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(RetryableQuotaError);
    expect((result as RetryableQuotaError).retryDelayMs).toBe(301000);
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

  it('should return RetryableQuotaError for any 429', () => {
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
    expect(result).toBeInstanceOf(RetryableQuotaError);
    if (result instanceof RetryableQuotaError) {
      expect(result.retryDelayMs).toBeUndefined();
    }
  });

  it('should classify nested JSON string 404 error as ModelNotFoundError', () => {
    // Mimic the double-wrapped JSON structure seen in the user report
    const innerError = {
      error: {
        code: 404,
        message:
          'models/NOT_FOUND is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.',
        status: 'NOT_FOUND',
      },
    };
    const errorString = JSON.stringify(innerError);

    const outerErrorString = JSON.stringify({
      error: {
        message: errorString,
      },
    });
    const error = new Error(`[API Error: ${outerErrorString}]`);

    const classified = classifyGoogleError(error);
    expect(classified).toBeInstanceOf(ModelNotFoundError);
    expect((classified as ModelNotFoundError).code).toBe(404);
  });

  it('should fallback to string parsing for retry delays when details array is empty', () => {
    const errorWithEmptyDetails = {
      error: {
        code: 429,
        message: 'Resource exhausted. Please retry in 5s',
        details: [],
      },
    };

    const result = classifyGoogleError(errorWithEmptyDetails);

    expect(result).toBeInstanceOf(RetryableQuotaError);
    if (result instanceof RetryableQuotaError) {
      expect(result.retryDelayMs).toBe(5000);
      // The cause should be the parsed GoogleApiError
      expect(result.cause).toEqual({
        code: 429,
        message: 'Resource exhausted. Please retry in 5s',
        details: [],
      });
    }
  });

  it('should return RetryableQuotaError without delay time for generic 429 without specific message', () => {
    const generic429 = {
      status: 429,
      message: 'Resource exhausted. No specific retry info.',
    };

    const result = classifyGoogleError(generic429);

    expect(result).toBeInstanceOf(RetryableQuotaError);
    if (result instanceof RetryableQuotaError) {
      expect(result.retryDelayMs).toBeUndefined();
    }
  });

  it('should return RetryableQuotaError without delay time for 429 with empty details and no regex match', () => {
    const errorWithEmptyDetails = {
      error: {
        code: 429,
        message: 'A generic 429 error with no retry message.',
        details: [],
      },
    };

    const result = classifyGoogleError(errorWithEmptyDetails);

    expect(result).toBeInstanceOf(RetryableQuotaError);
    if (result instanceof RetryableQuotaError) {
      expect(result.retryDelayMs).toBeUndefined();
    }
  });

  it('should return RetryableQuotaError without delay time for 429 with some detail', () => {
    const errorWithEmptyDetails = {
      error: {
        code: 429,
        message: 'A generic 429 error with no retry message.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'QUOTA_EXCEEDED',
            domain: 'googleapis.com',
            metadata: {
              quota_limit: '',
            },
          },
        ],
      },
    };

    const result = classifyGoogleError(errorWithEmptyDetails);

    expect(result).toBeInstanceOf(RetryableQuotaError);
    if (result instanceof RetryableQuotaError) {
      expect(result.retryDelayMs).toBeUndefined();
    }
  });

  it('should return ValidationRequiredError for 403 with VALIDATION_REQUIRED from cloudcode-pa domain', () => {
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Validation required to continue.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VALIDATION_REQUIRED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: {
            validation_link: 'https://fallback.example.com/validate',
          },
        },
        {
          '@type': 'type.googleapis.com/google.rpc.Help',
          links: [
            {
              description: 'Complete validation to continue',
              url: 'https://example.com/validate',
            },
            {
              description: 'Learn more',
              url: 'https://support.google.com/accounts?p=al_alert',
            },
          ],
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(ValidationRequiredError);
    expect((result as ValidationRequiredError).validationLink).toBe(
      'https://example.com/validate',
    );
    expect((result as ValidationRequiredError).validationDescription).toBe(
      'Complete validation to continue',
    );
    expect((result as ValidationRequiredError).learnMoreUrl).toBe(
      'https://support.google.com/accounts?p=al_alert',
    );
    expect((result as ValidationRequiredError).cause).toBe(apiError);
  });

  it('should correctly parse Learn more URL when first link description contains "Learn more" text', () => {
    // This tests the real API response format where the description of the first
    // link contains "Learn more:" text, but we should use the second link's URL
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Validation required to continue.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VALIDATION_REQUIRED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: {},
        },
        {
          '@type': 'type.googleapis.com/google.rpc.Help',
          links: [
            {
              description:
                'Further action is required to use this service. Navigate to the following URL to complete verification:\n\nhttps://accounts.sandbox.google.com/signin/continue?...\n\nLearn more:\n\nhttps://support.google.com/accounts?p=al_alert\n',
              url: 'https://accounts.sandbox.google.com/signin/continue?sarp=1&scc=1&continue=...',
            },
            {
              description: 'Learn more',
              url: 'https://support.google.com/accounts?p=al_alert',
            },
          ],
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(ValidationRequiredError);
    // Should get the validation link from the first link
    expect((result as ValidationRequiredError).validationLink).toBe(
      'https://accounts.sandbox.google.com/signin/continue?sarp=1&scc=1&continue=...',
    );
    // Should get the Learn more URL from the SECOND link, not the first
    expect((result as ValidationRequiredError).learnMoreUrl).toBe(
      'https://support.google.com/accounts?p=al_alert',
    );
  });

  it('should fallback to ErrorInfo metadata when Help detail is not present', () => {
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Validation required.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VALIDATION_REQUIRED',
          domain: 'staging-cloudcode-pa.googleapis.com',
          metadata: {
            validation_link: 'https://staging.example.com/validate',
          },
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(ValidationRequiredError);
    expect((result as ValidationRequiredError).validationLink).toBe(
      'https://staging.example.com/validate',
    );
    expect(
      (result as ValidationRequiredError).validationDescription,
    ).toBeUndefined();
    expect((result as ValidationRequiredError).learnMoreUrl).toBeUndefined();
  });

  it('should return original error for 403 with different reason', () => {
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Access denied.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'ACCESS_DENIED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: {},
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const originalError = new Error();
    const result = classifyGoogleError(originalError);
    expect(result).toBe(originalError);
    expect(result).not.toBeInstanceOf(ValidationRequiredError);
  });

  it('should find learn more link by hostname when description is different', () => {
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Validation required.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VALIDATION_REQUIRED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: {},
        },
        {
          '@type': 'type.googleapis.com/google.rpc.Help',
          links: [
            {
              description: 'Complete validation',
              url: 'https://accounts.google.com/validate',
            },
            {
              description: 'More information', // Not exactly "Learn more"
              url: 'https://support.google.com/accounts?p=al_alert',
            },
          ],
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const result = classifyGoogleError(new Error());
    expect(result).toBeInstanceOf(ValidationRequiredError);
    expect((result as ValidationRequiredError).learnMoreUrl).toBe(
      'https://support.google.com/accounts?p=al_alert',
    );
  });

  it('should return original error for 403 from non-cloudcode domain', () => {
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Forbidden.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VALIDATION_REQUIRED',
          domain: 'other.googleapis.com',
          metadata: {},
        },
      ],
    };
    vi.spyOn(errorParser, 'parseGoogleApiError').mockReturnValue(apiError);
    const originalError = new Error();
    const result = classifyGoogleError(originalError);
    expect(result).toBe(originalError);
    expect(result).not.toBeInstanceOf(ValidationRequiredError);
  });
});
