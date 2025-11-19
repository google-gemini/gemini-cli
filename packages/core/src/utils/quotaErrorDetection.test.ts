/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isApiError,
  isStructuredError,
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  type ApiError,
} from './quotaErrorDetection.js';
import type { StructuredError } from '../core/turn.js';

describe('quotaErrorDetection', () => {
  describe('ApiError type', () => {
    it('should define valid ApiError structure', () => {
      const error: ApiError = {
        error: {
          code: 429,
          message: 'Quota exceeded',
          status: 'RESOURCE_EXHAUSTED',
          details: [],
        },
      };

      expect(error).toBeDefined();
      expect(error.error.code).toBe(429);
    });

    it('should allow details array with values', () => {
      const error: ApiError = {
        error: {
          code: 429,
          message: 'Error',
          status: 'ERROR',
          details: [{ type: 'info' }, { type: 'debug' }],
        },
      };

      expect(error.error.details).toHaveLength(2);
    });
  });

  describe('isApiError', () => {
    it('should return true for valid ApiError', () => {
      const error: ApiError = {
        error: {
          code: 429,
          message: 'Quota exceeded',
          status: 'RESOURCE_EXHAUSTED',
          details: [],
        },
      };

      expect(isApiError(error)).toBe(true);
    });

    it('should return true for ApiError with details', () => {
      const error: ApiError = {
        error: {
          code: 400,
          message: 'Bad request',
          status: 'INVALID_ARGUMENT',
          details: [{ type: 'validation' }],
        },
      };

      expect(isApiError(error)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isApiError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isApiError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isApiError('error string')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isApiError(429)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isApiError({})).toBe(false);
    });

    it('should return false for object without error property', () => {
      const error = {
        message: 'Error',
        code: 429,
      };

      expect(isApiError(error)).toBe(false);
    });

    it('should return false when error is not an object', () => {
      const error = {
        error: 'string error',
      };

      expect(isApiError(error)).toBe(false);
    });

    it('should return false when error.message is missing', () => {
      const error = {
        error: {
          code: 429,
          status: 'ERROR',
        },
      };

      expect(isApiError(error)).toBe(false);
    });

    it('should return false for array', () => {
      expect(isApiError([1, 2, 3])).toBe(false);
    });

    it('should validate nested structure', () => {
      const error = {
        error: {
          code: 429,
          message: 'Error',
          status: 'ERROR',
          details: [],
          extra: 'ignored',
        },
        other: 'ignored',
      };

      expect(isApiError(error)).toBe(true);
    });
  });

  describe('isStructuredError', () => {
    it('should return true for valid StructuredError', () => {
      const error: StructuredError = {
        message: 'Error occurred',
      };

      expect(isStructuredError(error)).toBe(true);
    });

    it('should return true for StructuredError with additional properties', () => {
      const error = {
        message: 'Error occurred',
        code: 'ERROR_CODE',
        details: { info: 'value' },
      };

      expect(isStructuredError(error)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isStructuredError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isStructuredError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isStructuredError('error message')).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isStructuredError({})).toBe(false);
    });

    it('should return false when message is not a string', () => {
      const error = {
        message: 123,
      };

      expect(isStructuredError(error)).toBe(false);
    });

    it('should return false when message is null', () => {
      const error = {
        message: null,
      };

      expect(isStructuredError(error)).toBe(false);
    });

    it('should return false when message is undefined', () => {
      const error = {
        message: undefined,
      };

      expect(isStructuredError(error)).toBe(false);
    });

    it('should return false for array', () => {
      expect(isStructuredError(['message'])).toBe(false);
    });
  });

  describe('isProQuotaExceededError', () => {
    describe('string format', () => {
      it('should detect Pro quota error in string', () => {
        const error =
          "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'";

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should detect Pro quota error with preview version', () => {
        const error =
          "Quota exceeded for quota metric 'Gemini 2.5-preview Pro Requests'";

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should return false for Flash quota error', () => {
        const error =
          "Quota exceeded for quota metric 'Gemini 2.0 Flash Requests'";

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should return false for non-quota error string', () => {
        const error = 'Network error occurred';

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isProQuotaExceededError('')).toBe(false);
      });
    });

    describe('StructuredError format', () => {
      it('should detect Pro quota error in StructuredError', () => {
        const error: StructuredError = {
          message: "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
        };

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should detect Pro quota error with preview', () => {
        const error: StructuredError = {
          message:
            "Quota exceeded for quota metric 'Gemini 2.5-preview Pro Requests'",
        };

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should return false for Flash quota in StructuredError', () => {
        const error: StructuredError = {
          message:
            "Quota exceeded for quota metric 'Gemini 2.0 Flash Requests'",
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should return false for non-quota StructuredError', () => {
        const error: StructuredError = {
          message: 'Invalid request',
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });
    });

    describe('ApiError format', () => {
      it('should detect Pro quota error in ApiError', () => {
        const error: ApiError = {
          error: {
            code: 429,
            message:
              "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
            status: 'RESOURCE_EXHAUSTED',
            details: [],
          },
        };

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should detect Pro quota error with preview in ApiError', () => {
        const error: ApiError = {
          error: {
            code: 429,
            message:
              "Quota exceeded for quota metric 'Gemini 2.5-preview Pro Requests'",
            status: 'RESOURCE_EXHAUSTED',
            details: [],
          },
        };

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should return false for Flash quota in ApiError', () => {
        const error: ApiError = {
          error: {
            code: 429,
            message:
              "Quota exceeded for quota metric 'Gemini 2.0 Flash Requests'",
            status: 'RESOURCE_EXHAUSTED',
            details: [],
          },
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should return false for non-quota ApiError', () => {
        const error: ApiError = {
          error: {
            code: 400,
            message: 'Bad request',
            status: 'INVALID_ARGUMENT',
            details: [],
          },
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });
    });

    describe('Gaxios error format', () => {
      it('should detect Pro quota error in Gaxios response data string', () => {
        const error = {
          response: {
            data: "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
          },
        };

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should detect Pro quota error in Gaxios response data object', () => {
        const error = {
          response: {
            data: {
              error: {
                message:
                  "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
              },
            },
          },
        };

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should detect preview version in Gaxios error', () => {
        const error = {
          response: {
            data: {
              error: {
                message:
                  "Quota exceeded for quota metric 'Gemini 2.5-preview Pro Requests'",
              },
            },
          },
        };

        expect(isProQuotaExceededError(error)).toBe(true);
      });

      it('should return false for Flash in Gaxios error', () => {
        const error = {
          response: {
            data: {
              error: {
                message:
                  "Quota exceeded for quota metric 'Gemini 2.0 Flash Requests'",
              },
            },
          },
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should return false for Gaxios error without data', () => {
        const error = {
          response: {},
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should return false for Gaxios error without response', () => {
        const error = {
          message: 'Network error',
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should handle null response data', () => {
        const error = {
          response: {
            data: null,
          },
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should handle undefined error message in Gaxios data', () => {
        const error = {
          response: {
            data: {
              error: {},
            },
          },
        };

        expect(isProQuotaExceededError(error)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for null', () => {
        expect(isProQuotaExceededError(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isProQuotaExceededError(undefined)).toBe(false);
      });

      it('should return false for number', () => {
        expect(isProQuotaExceededError(429)).toBe(false);
      });

      it('should return false for boolean', () => {
        expect(isProQuotaExceededError(true)).toBe(false);
      });

      it('should return false for array', () => {
        expect(isProQuotaExceededError([])).toBe(false);
      });

      it('should return false for empty object', () => {
        expect(isProQuotaExceededError({})).toBe(false);
      });

      it('should be case sensitive for Pro', () => {
        const error =
          "Quota exceeded for quota metric 'Gemini 2.5 pro Requests'";

        expect(isProQuotaExceededError(error)).toBe(false);
      });

      it('should require both Gemini and Pro in message', () => {
        const error1 = "Quota exceeded for quota metric 'Pro Requests'";
        const error2 = "Quota exceeded for quota metric 'Gemini Requests'";

        expect(isProQuotaExceededError(error1)).toBe(false);
        expect(isProQuotaExceededError(error2)).toBe(false);
      });
    });
  });

  describe('isGenericQuotaExceededError', () => {
    describe('string format', () => {
      it('should detect generic quota error in string', () => {
        const error = 'Quota exceeded for quota metric ABC';

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should detect Pro quota error as generic', () => {
        const error =
          "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'";

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should detect Flash quota error as generic', () => {
        const error =
          "Quota exceeded for quota metric 'Gemini 2.0 Flash Requests'";

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should return false for non-quota error', () => {
        const error = 'Network error';

        expect(isGenericQuotaExceededError(error)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isGenericQuotaExceededError('')).toBe(false);
      });
    });

    describe('StructuredError format', () => {
      it('should detect quota error in StructuredError', () => {
        const error: StructuredError = {
          message: 'Quota exceeded for quota metric ABC',
        };

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should detect Pro quota in StructuredError', () => {
        const error: StructuredError = {
          message: "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
        };

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should return false for non-quota StructuredError', () => {
        const error: StructuredError = {
          message: 'Invalid argument',
        };

        expect(isGenericQuotaExceededError(error)).toBe(false);
      });
    });

    describe('ApiError format', () => {
      it('should detect quota error in ApiError', () => {
        const error: ApiError = {
          error: {
            code: 429,
            message: 'Quota exceeded for quota metric ABC',
            status: 'RESOURCE_EXHAUSTED',
            details: [],
          },
        };

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should detect Pro quota in ApiError', () => {
        const error: ApiError = {
          error: {
            code: 429,
            message:
              "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
            status: 'RESOURCE_EXHAUSTED',
            details: [],
          },
        };

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should detect Flash quota in ApiError', () => {
        const error: ApiError = {
          error: {
            code: 429,
            message:
              "Quota exceeded for quota metric 'Gemini 2.0 Flash Requests'",
            status: 'RESOURCE_EXHAUSTED',
            details: [],
          },
        };

        expect(isGenericQuotaExceededError(error)).toBe(true);
      });

      it('should return false for non-quota ApiError', () => {
        const error: ApiError = {
          error: {
            code: 400,
            message: 'Bad request',
            status: 'INVALID_ARGUMENT',
            details: [],
          },
        };

        expect(isGenericQuotaExceededError(error)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for null', () => {
        expect(isGenericQuotaExceededError(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isGenericQuotaExceededError(undefined)).toBe(false);
      });

      it('should return false for number', () => {
        expect(isGenericQuotaExceededError(429)).toBe(false);
      });

      it('should return false for boolean', () => {
        expect(isGenericQuotaExceededError(false)).toBe(false);
      });

      it('should return false for array', () => {
        expect(isGenericQuotaExceededError([])).toBe(false);
      });

      it('should return false for empty object', () => {
        expect(isGenericQuotaExceededError({})).toBe(false);
      });

      it('should return false for object without message', () => {
        const error = {
          code: 429,
          status: 'ERROR',
        };

        expect(isGenericQuotaExceededError(error)).toBe(false);
      });
    });
  });

  describe('function relationships', () => {
    it('should have isProQuotaExceededError as subset of isGenericQuotaExceededError', () => {
      const proError =
        "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'";

      expect(isProQuotaExceededError(proError)).toBe(true);
      expect(isGenericQuotaExceededError(proError)).toBe(true);
    });

    it('should have Flash errors detected only by generic', () => {
      const flashError =
        "Quota exceeded for quota metric 'Gemini 2.0 Flash Requests'";

      expect(isProQuotaExceededError(flashError)).toBe(false);
      expect(isGenericQuotaExceededError(flashError)).toBe(true);
    });

    it('should have non-quota errors detected by neither', () => {
      const error = 'Network error';

      expect(isProQuotaExceededError(error)).toBe(false);
      expect(isGenericQuotaExceededError(error)).toBe(false);
    });

    it('should consistently detect Pro errors across all formats', () => {
      const message =
        "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'";

      const stringError = message;
      const structuredError: StructuredError = { message };
      const apiError: ApiError = {
        error: {
          code: 429,
          message,
          status: 'RESOURCE_EXHAUSTED',
          details: [],
        },
      };

      expect(isProQuotaExceededError(stringError)).toBe(true);
      expect(isProQuotaExceededError(structuredError)).toBe(true);
      expect(isProQuotaExceededError(apiError)).toBe(true);
    });

    it('should consistently detect generic errors across all formats', () => {
      const message = 'Quota exceeded for quota metric TEST';

      const stringError = message;
      const structuredError: StructuredError = { message };
      const apiError: ApiError = {
        error: {
          code: 429,
          message,
          status: 'RESOURCE_EXHAUSTED',
          details: [],
        },
      };

      expect(isGenericQuotaExceededError(stringError)).toBe(true);
      expect(isGenericQuotaExceededError(structuredError)).toBe(true);
      expect(isGenericQuotaExceededError(apiError)).toBe(true);
    });
  });
});
