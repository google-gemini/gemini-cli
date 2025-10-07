/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseGoogleApiError } from './googleErrors.js';
import type { QuotaFailure } from './googleErrors.js';

describe('parseGoogleApiError', () => {
  it('should return null for non-gaxios errors', () => {
    expect(parseGoogleApiError(new Error('vanilla error'))).toBeNull();
    expect(parseGoogleApiError(null)).toBeNull();
    expect(parseGoogleApiError({})).toBeNull();
  });

  it('should parse a standard gaxios error', () => {
    const mockError = {
      response: {
        status: 429,
        data: {
          error: {
            code: 429,
            message: 'Quota exceeded',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                violations: [{ subject: 'user', description: 'daily limit' }],
              },
            ],
          },
        },
      },
    };

    const parsed = parseGoogleApiError(mockError);
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(429);
    expect(parsed?.message).toBe('Quota exceeded');
    expect(parsed?.details).toHaveLength(1);
    const detail = parsed?.details[0] as QuotaFailure;
    expect(detail['@type']).toBe('type.googleapis.com/google.rpc.QuotaFailure');
    expect(detail.violations[0].description).toBe('daily limit');
  });

  it('should parse an error with details stringified in the message', () => {
    const innerError = {
      error: {
        code: 429,
        message: 'Inner quota message',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '10s',
          },
        ],
      },
    };

    const mockError = {
      response: {
        status: 429,
        data: {
          error: {
            code: 429,
            message: JSON.stringify(innerError),
            details: [], // Top-level details are empty
          },
        },
      },
    };

    const parsed = parseGoogleApiError(mockError);
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(429);
    expect(parsed?.message).toBe('Inner quota message');
    expect(parsed?.details).toHaveLength(1);
    expect(parsed?.details[0]['@type']).toBe(
      'type.googleapis.com/google.rpc.RetryInfo',
    );
  });

  it('should return null if details are not in the expected format', () => {
    const mockError = {
      response: {
        status: 400,
        data: {
          error: {
            code: 400,
            message: 'Bad Request',
            details: 'just a string', // Invalid details format
          },
        },
      },
    };
    expect(parseGoogleApiError(mockError)).toBeNull();
  });

  it('should return null if there are no valid details', () => {
    const mockError = {
      response: {
        status: 400,
        data: {
          error: {
            code: 400,
            message: 'Bad Request',
            details: [
              {
                // missing '@type'
                reason: 'some reason',
              },
            ],
          },
        },
      },
    };
    expect(parseGoogleApiError(mockError)).toBeNull();
  });

  it('should parse a doubly nested error in the message', () => {
    const innerError = {
      error: {
        code: 429,
        message: 'Innermost quota message',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '20s',
          },
        ],
      },
    };

    const middleError = {
      error: {
        code: 429,
        message: JSON.stringify(innerError),
        details: [],
      },
    };

    const mockError = {
      response: {
        status: 429,
        data: {
          error: {
            code: 429,
            message: JSON.stringify(middleError),
            details: [],
          },
        },
      },
    };

    const parsed = parseGoogleApiError(mockError);
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(429);
    expect(parsed?.message).toBe('Innermost quota message');
    expect(parsed?.details).toHaveLength(1);
    expect(parsed?.details[0]['@type']).toBe(
      'type.googleapis.com/google.rpc.RetryInfo',
    );
  });

  it('should parse an error that is not in a response object', () => {
    const innerError = {
      error: {
        code: 429,
        message: 'Innermost quota message',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '20s',
          },
        ],
      },
    };

    const mockError = {
      error: {
        code: 429,
        message: JSON.stringify(innerError),
        details: [],
      },
    };

    const parsed = parseGoogleApiError(mockError);
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(429);
    expect(parsed?.message).toBe('Innermost quota message');
    expect(parsed?.details).toHaveLength(1);
    expect(parsed?.details[0]['@type']).toBe(
      'type.googleapis.com/google.rpc.RetryInfo',
    );
  });

  it('should parse an error that is a JSON string', () => {
    const innerError = {
      error: {
        code: 429,
        message: 'Innermost quota message',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '20s',
          },
        ],
      },
    };

    const mockError = {
      error: {
        code: 429,
        message: JSON.stringify(innerError),
        details: [],
      },
    };

    const parsed = parseGoogleApiError(JSON.stringify(mockError));
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(429);
    expect(parsed?.message).toBe('Innermost quota message');
    expect(parsed?.details).toHaveLength(1);
    expect(parsed?.details[0]['@type']).toBe(
      'type.googleapis.com/google.rpc.RetryInfo',
    );
  });

  it('should parse the user-provided nested error string', () => {
    const userErrorString =
      '{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\\\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_paid_tier_input_token_count, limit: 10000\\\\nPlease retry in 40.025771073s.\\",\\n    \\"status\\": \\"RESOURCE_EXHAUSTED\\",\\n    \\"details\\": [\\n      {\\n        \\"@type\\": \\"type.googleapis.com/google.rpc.DebugInfo\\",\\n        \\"detail\\": \\"[ORIGINAL ERROR] generic::resource_exhausted: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\\\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_paid_tier_input_token_count, limit: 10000\\\\nPlease retry in 40.025771073s. [google.rpc.error_details_ext] { message: \\\\\\"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\\\\\\\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_paid_tier_input_token_count, limit: 10000\\\\\\\\nPlease retry in 40.025771073s.\\\\\\" }\\"\\n      },\\n      {\\n        \\"@type\\": \\"type.googleapis.com/google.rpc.QuotaFailure\\",\\n        \\"violations\\": [\\n          {\\n            \\"quotaMetric\\": \\"generativelanguage.googleapis.com/generate_content_paid_tier_input_token_count\\",\\n            \\"quotaId\\": \\"GenerateContentPaidTierInputTokensPerModelPerMinute\\",\\n            \\"quotaDimensions\\": {\\n              \\"location\\": \\"global\\",\\n              \\"model\\": \\"gemini-2.5-pro\\"\\n            },\\n            \\"quotaValue\\": \\"10000\\"\\n          }\\n        ]\\n      },\\n      {\\n        \\"@type\\": \\"type.googleapis.com/google.rpc.Help\\",\\n        \\"links\\": [\\n          {\\n            \\"description\\": \\"Learn more about Gemini API quotas\\",\\n            \\"url\\": \\"https://ai.google.dev/gemini-api/docs/rate-limits\\"\\n          }\\n        ]\\n      },\\n      {\\n        \\"@type\\": \\"type.googleapis.com/google.rpc.RetryInfo\\",\\n        \\"retryDelay\\": \\"40s\\"\\n      }\\n    ]\\n  }\\n}\\n","code":429,"status":"Too Many Requests"}}';

    const parsed = parseGoogleApiError(userErrorString);
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(429);
    expect(parsed?.message).toContain('You exceeded your current quota');
    expect(parsed?.details).toHaveLength(4);
    expect(
      parsed?.details.some(
        (d) => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure',
      ),
    ).toBe(true);
    expect(
      parsed?.details.some(
        (d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
      ),
    ).toBe(true);
  });
});
