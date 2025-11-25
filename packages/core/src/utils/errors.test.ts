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

  it('should return false for 500 errors', () => {
    const error = new Error('Internal Server Error (HTTP 500)');
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
  it('should convert HTTP 400 to BadRequestError', () => {
    const gaxiosError = {
      response: {
        data: {
          error: {
            code: 400,
            message: 'Bad request message',
          },
        },
      },
    };
    const result = toFriendlyError(gaxiosError);
    expect(result).toBeInstanceOf(BadRequestError);
    expect((result as BadRequestError).message).toBe('Bad request message');
  });

  it('should convert HTTP 401 to UnauthorizedError', () => {
    const gaxiosError = {
      response: {
        data: {
          error: {
            code: 401,
            message: 'Unauthorized message',
          },
        },
      },
    };
    const result = toFriendlyError(gaxiosError);
    expect(result).toBeInstanceOf(UnauthorizedError);
    expect((result as UnauthorizedError).message).toBe('Unauthorized message');
  });

  it('should convert HTTP 403 to ForbiddenError', () => {
    const gaxiosError = {
      response: {
        data: {
          error: {
            code: 403,
            message: 'Forbidden message',
          },
        },
      },
    };
    const result = toFriendlyError(gaxiosError);
    expect(result).toBeInstanceOf(ForbiddenError);
    expect((result as ForbiddenError).message).toBe('Forbidden message');
  });

  it('should pass through non-HTTP errors unchanged', () => {
    const error = new Error('Generic error');
    const result = toFriendlyError(error);
    expect(result).toBe(error);
  });

  it('should handle response data without error property', () => {
    const gaxiosError = {
      response: {
        data: {
          message: 'Some message',
        },
      },
    };
    const result = toFriendlyError(gaxiosError);
    expect(result).toBe(gaxiosError);
  });

  it('should handle stringified JSON response data', () => {
    const gaxiosError = {
      response: {
        data: JSON.stringify({
          error: {
            code: 401,
            message: 'Unauthorized from stringified JSON',
          },
        }),
      },
    };
    const result = toFriendlyError(gaxiosError);
    expect(result).toBeInstanceOf(UnauthorizedError);
    expect((result as UnauthorizedError).message).toBe(
      'Unauthorized from stringified JSON',
    );
  });

  it('should pass through errors with other HTTP codes', () => {
    const gaxiosError = {
      response: {
        data: {
          error: {
            code: 500,
            message: 'Internal server error',
          },
        },
      },
    };
    const result = toFriendlyError(gaxiosError);
    expect(result).toBe(gaxiosError);
  });
});
