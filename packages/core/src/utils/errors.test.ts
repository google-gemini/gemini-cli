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
  getErrorMessage,
  getErrorType,
  FatalAuthenticationError,
  FatalCancellationError,
  FatalInputError,
  FatalSandboxError,
  FatalConfigError,
  FatalTurnLimitedError,
  FatalToolExecutionError,
} from './errors.js';

describe('getErrorMessage', () => {
  it('should return plain error message', () => {
    expect(getErrorMessage(new Error('plain error'))).toBe('plain error');
  });

  it('should handle non-Error inputs', () => {
    expect(getErrorMessage('string error')).toBe('string error');
    expect(getErrorMessage(123)).toBe('123');
  });

  it('should handle structured HTTP errors via toFriendlyError', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 400,
            message: 'Bad Request Message',
          },
        },
      },
    };
    expect(getErrorMessage(error)).toBe('Bad Request Message');
  });
});

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

describe('getErrorType', () => {
  it('should return error name for standard errors', () => {
    expect(getErrorType(new Error('test'))).toBe('Error');
    expect(getErrorType(new TypeError('test'))).toBe('TypeError');
    expect(getErrorType(new SyntaxError('test'))).toBe('SyntaxError');
  });

  it('should return constructor name for custom errors', () => {
    expect(getErrorType(new FatalAuthenticationError('test'))).toBe(
      'FatalAuthenticationError',
    );
    expect(getErrorType(new FatalInputError('test'))).toBe('FatalInputError');
    expect(getErrorType(new FatalSandboxError('test'))).toBe(
      'FatalSandboxError',
    );
    expect(getErrorType(new FatalConfigError('test'))).toBe('FatalConfigError');
    expect(getErrorType(new FatalTurnLimitedError('test'))).toBe(
      'FatalTurnLimitedError',
    );
    expect(getErrorType(new FatalToolExecutionError('test'))).toBe(
      'FatalToolExecutionError',
    );
    expect(getErrorType(new FatalCancellationError('test'))).toBe(
      'FatalCancellationError',
    );
    expect(getErrorType(new ForbiddenError('test'))).toBe('ForbiddenError');
    expect(getErrorType(new UnauthorizedError('test'))).toBe(
      'UnauthorizedError',
    );
    expect(getErrorType(new BadRequestError('test'))).toBe('BadRequestError');
  });

  it('should return "unknown" for non-Error objects', () => {
    expect(getErrorType('string error')).toBe('unknown');
    expect(getErrorType(123)).toBe('unknown');
    expect(getErrorType({})).toBe('unknown');
    expect(getErrorType(null)).toBe('unknown');
    expect(getErrorType(undefined)).toBe('unknown');
  });
});
