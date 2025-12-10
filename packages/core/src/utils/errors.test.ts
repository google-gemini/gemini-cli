/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isAuthenticationError,
  UnauthorizedError,
  toFriendlyError,
  BadRequestError,
  ForbiddenError,
} from './errors.js';

describe('isAuthenticationError', () => {
  it('should detect error with code: 401 property (MCP SDK style)', () => {
    const error = { code: 401, message: 'Unauthorized' };
    expect(isAuthenticationError(error)).toBe(true);
  });

  it('should detect UnauthorizedError instance', () => {
    const error = new UnauthorizedError('Authentication required');
    expect(isAuthenticationError(error)).toBe(true);
  });

  it('should return false for 404 errors', () => {
    const error = { code: 404, message: 'Not Found' };
    expect(isAuthenticationError(error)).toBe(false);
  });

  it('should handle null and undefined gracefully', () => {
    expect(isAuthenticationError(null)).toBe(false);
    expect(isAuthenticationError(undefined)).toBe(false);
  });

  it('should handle non-error objects', () => {
    expect(isAuthenticationError('string error')).toBe(false);
    expect(isAuthenticationError(123)).toBe(false);
    expect(isAuthenticationError({})).toBe(false);
  });

  it('should detect 401 in various message formats', () => {
    expect(isAuthenticationError(new Error('401 Unauthorized'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP 401'))).toBe(true);
    expect(isAuthenticationError(new Error('Status code: 401'))).toBe(true);
  });
});

describe('toFriendlyError', () => {
  it('should return BadRequestError for 400', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 400,
            message: 'Bad Request',
          },
        },
      },
    };
    const result = toFriendlyError(error);
    expect(result).toBeInstanceOf(BadRequestError);
    expect((result as BadRequestError).message).toBe('Bad Request');
  });

  it('should return UnauthorizedError for 401', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 401,
            message: 'Unauthorized',
          },
        },
      },
    };
    const result = toFriendlyError(error);
    expect(result).toBeInstanceOf(UnauthorizedError);
    expect((result as UnauthorizedError).message).toBe('Unauthorized');
  });

  it('should return ForbiddenError for 403', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 403,
            message: 'Forbidden',
          },
        },
      },
    };
    const result = toFriendlyError(error);
    expect(result).toBeInstanceOf(ForbiddenError);
    expect((result as ForbiddenError).message).toBe('Forbidden');
  });

  it('should parse stringified JSON data', () => {
    const error = {
      response: {
        data: JSON.stringify({
          error: {
            code: 400,
            message: 'Parsed Message',
          },
        }),
      },
    };
    const result = toFriendlyError(error);
    expect(result).toBeInstanceOf(BadRequestError);
    expect((result as BadRequestError).message).toBe('Parsed Message');
  });

  it('should return original error if response data is undefined', () => {
    const error = {
      response: {
        data: undefined,
      },
    };
    expect(toFriendlyError(error)).toBe(error);
  });

  it('should return original error if error object is missing in data', () => {
    const error = {
      response: {
        data: {
          somethingElse: 'value',
        },
      },
    };
    expect(toFriendlyError(error)).toBe(error);
  });

  it('should return original error if error code or message is missing', () => {
    const errorNoCode = {
      response: {
        data: {
          error: {
            message: 'No Code',
          },
        },
      },
    };
    expect(toFriendlyError(errorNoCode)).toBe(errorNoCode);

    const errorNoMessage = {
      response: {
        data: {
          error: {
            code: 400,
          },
        },
      },
    };
    expect(toFriendlyError(errorNoMessage)).toBe(errorNoMessage);
  });

  it('should return original error for unknown codes', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 500,
            message: 'Internal Server Error',
          },
        },
      },
    };
    expect(toFriendlyError(error)).toBe(error);
  });

  it('should return original error if not a Gaxios error object', () => {
    const error = new Error('Regular Error');
    expect(toFriendlyError(error)).toBe(error);
  });
});
