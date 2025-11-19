/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isNodeError,
  getErrorMessage,
  FatalError,
  FatalAuthenticationError,
  FatalInputError,
  FatalSandboxError,
  FatalConfigError,
  FatalTurnLimitedError,
  FatalToolExecutionError,
  FatalCancellationError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError,
  toFriendlyError,
} from './errors.js';

describe('errors utilities', () => {
  describe('isNodeError', () => {
    it('should return true for NodeJS.ErrnoException', () => {
      const err = new Error('Test error') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      expect(isNodeError(err)).toBe(true);
    });

    it('should return false for regular Error without code', () => {
      const err = new Error('Regular error');
      expect(isNodeError(err)).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isNodeError('string error')).toBe(false);
      expect(isNodeError(42)).toBe(false);
      expect(isNodeError(null)).toBe(false);
      expect(isNodeError(undefined)).toBe(false);
    });

    it('should return true when Error has code property', () => {
      const err = new Error('Test') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      expect(isNodeError(err)).toBe(true);
    });

    it('should handle Error with errno', () => {
      const err = new Error('Test') as NodeJS.ErrnoException;
      err.code = 'EISDIR';
      err.errno = -21;
      expect(isNodeError(err)).toBe(true);
    });

    it('should return false for objects with code but not Error', () => {
      const obj = { code: 'TEST', message: 'Not an error' };
      expect(isNodeError(obj)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should return message from Error instance', () => {
      const err = new Error('Test error message');
      expect(getErrorMessage(err)).toBe('Test error message');
    });

    it('should convert string to string', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should convert number to string', () => {
      expect(getErrorMessage(42)).toBe('42');
    });

    it('should handle null', () => {
      expect(getErrorMessage(null)).toBe('null');
    });

    it('should handle undefined', () => {
      expect(getErrorMessage(undefined)).toBe('undefined');
    });

    it('should handle objects with toString', () => {
      const obj = { toString: () => 'Custom error' };
      expect(getErrorMessage(obj)).toBe('Custom error');
    });

    it('should handle arrays', () => {
      expect(getErrorMessage([1, 2, 3])).toBe('1,2,3');
    });

    it('should handle boolean values', () => {
      expect(getErrorMessage(true)).toBe('true');
      expect(getErrorMessage(false)).toBe('false');
    });

    it('should handle object without custom toString', () => {
      const obj = { error: 'something' };
      expect(getErrorMessage(obj)).toContain('object');
    });

    it('should fallback for non-stringifiable errors', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const result = getErrorMessage(circular);
      expect(result).toBeDefined();
    });
  });

  describe('FatalError', () => {
    it('should be an instance of Error', () => {
      const err = new FatalError('Test', 1);
      expect(err).toBeInstanceOf(Error);
    });

    it('should have correct message', () => {
      const err = new FatalError('Fatal message', 1);
      expect(err.message).toBe('Fatal message');
    });

    it('should have correct exitCode', () => {
      const err = new FatalError('Test', 42);
      expect(err.exitCode).toBe(42);
    });

    it('should allow different exit codes', () => {
      const err1 = new FatalError('Test', 1);
      const err2 = new FatalError('Test', 2);
      expect(err1.exitCode).toBe(1);
      expect(err2.exitCode).toBe(2);
    });

    it('should be catchable', () => {
      expect(() => {
        throw new FatalError('Test', 1);
      }).toThrow(FatalError);
    });

    it('should preserve stack trace', () => {
      const err = new FatalError('Test', 1);
      expect(err.stack).toBeDefined();
    });
  });

  describe('FatalAuthenticationError', () => {
    it('should extend FatalError', () => {
      const err = new FatalAuthenticationError('Auth failed');
      expect(err).toBeInstanceOf(FatalError);
    });

    it('should have exit code 41', () => {
      const err = new FatalAuthenticationError('Auth failed');
      expect(err.exitCode).toBe(41);
    });

    it('should have correct message', () => {
      const err = new FatalAuthenticationError('Invalid credentials');
      expect(err.message).toBe('Invalid credentials');
    });

    it('should be catchable as FatalError', () => {
      expect(() => {
        throw new FatalAuthenticationError('Test');
      }).toThrow(FatalError);
    });
  });

  describe('FatalInputError', () => {
    it('should extend FatalError', () => {
      const err = new FatalInputError('Invalid input');
      expect(err).toBeInstanceOf(FatalError);
    });

    it('should have exit code 42', () => {
      const err = new FatalInputError('Invalid input');
      expect(err.exitCode).toBe(42);
    });

    it('should have correct message', () => {
      const err = new FatalInputError('Bad format');
      expect(err.message).toBe('Bad format');
    });
  });

  describe('FatalSandboxError', () => {
    it('should extend FatalError', () => {
      const err = new FatalSandboxError('Sandbox failed');
      expect(err).toBeInstanceOf(FatalError);
    });

    it('should have exit code 44', () => {
      const err = new FatalSandboxError('Sandbox failed');
      expect(err.exitCode).toBe(44);
    });

    it('should have correct message', () => {
      const err = new FatalSandboxError('Container error');
      expect(err.message).toBe('Container error');
    });
  });

  describe('FatalConfigError', () => {
    it('should extend FatalError', () => {
      const err = new FatalConfigError('Config invalid');
      expect(err).toBeInstanceOf(FatalError);
    });

    it('should have exit code 52', () => {
      const err = new FatalConfigError('Config invalid');
      expect(err.exitCode).toBe(52);
    });

    it('should have correct message', () => {
      const err = new FatalConfigError('Missing config');
      expect(err.message).toBe('Missing config');
    });
  });

  describe('FatalTurnLimitedError', () => {
    it('should extend FatalError', () => {
      const err = new FatalTurnLimitedError('Turn limit reached');
      expect(err).toBeInstanceOf(FatalError);
    });

    it('should have exit code 53', () => {
      const err = new FatalTurnLimitedError('Turn limit reached');
      expect(err.exitCode).toBe(53);
    });

    it('should have correct message', () => {
      const err = new FatalTurnLimitedError('Max turns exceeded');
      expect(err.message).toBe('Max turns exceeded');
    });
  });

  describe('FatalToolExecutionError', () => {
    it('should extend FatalError', () => {
      const err = new FatalToolExecutionError('Tool failed');
      expect(err).toBeInstanceOf(FatalError);
    });

    it('should have exit code 54', () => {
      const err = new FatalToolExecutionError('Tool failed');
      expect(err.exitCode).toBe(54);
    });

    it('should have correct message', () => {
      const err = new FatalToolExecutionError('Execution error');
      expect(err.message).toBe('Execution error');
    });
  });

  describe('FatalCancellationError', () => {
    it('should extend FatalError', () => {
      const err = new FatalCancellationError('Cancelled');
      expect(err).toBeInstanceOf(FatalError);
    });

    it('should have exit code 130', () => {
      const err = new FatalCancellationError('Cancelled');
      expect(err.exitCode).toBe(130);
    });

    it('should use SIGINT exit code', () => {
      const err = new FatalCancellationError('User cancelled');
      expect(err.exitCode).toBe(130);
    });

    it('should have correct message', () => {
      const err = new FatalCancellationError('Operation cancelled');
      expect(err.message).toBe('Operation cancelled');
    });
  });

  describe('ForbiddenError', () => {
    it('should be an instance of Error', () => {
      const err = new ForbiddenError('Forbidden');
      expect(err).toBeInstanceOf(Error);
    });

    it('should have correct message', () => {
      const err = new ForbiddenError('Access denied');
      expect(err.message).toBe('Access denied');
    });

    it('should be distinct from other error types', () => {
      const err = new ForbiddenError('Test');
      expect(err).not.toBeInstanceOf(FatalError);
    });
  });

  describe('UnauthorizedError', () => {
    it('should be an instance of Error', () => {
      const err = new UnauthorizedError('Unauthorized');
      expect(err).toBeInstanceOf(Error);
    });

    it('should have correct message', () => {
      const err = new UnauthorizedError('Not authenticated');
      expect(err.message).toBe('Not authenticated');
    });

    it('should be distinct from ForbiddenError', () => {
      const err = new UnauthorizedError('Test');
      expect(err).not.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('BadRequestError', () => {
    it('should be an instance of Error', () => {
      const err = new BadRequestError('Bad request');
      expect(err).toBeInstanceOf(Error);
    });

    it('should have correct message', () => {
      const err = new BadRequestError('Invalid request');
      expect(err.message).toBe('Invalid request');
    });

    it('should be distinct from other error types', () => {
      const err = new BadRequestError('Test');
      expect(err).not.toBeInstanceOf(FatalError);
    });
  });

  describe('toFriendlyError', () => {
    it('should return original error for non-response errors', () => {
      const err = new Error('Regular error');
      expect(toFriendlyError(err)).toBe(err);
    });

    it('should convert 400 errors to BadRequestError', () => {
      const gaxiosError = {
        response: {
          data: {
            error: {
              code: 400,
              message: 'Bad request',
            },
          },
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBeInstanceOf(BadRequestError);
      expect((result as BadRequestError).message).toBe('Bad request');
    });

    it('should convert 401 errors to UnauthorizedError', () => {
      const gaxiosError = {
        response: {
          data: {
            error: {
              code: 401,
              message: 'Unauthorized',
            },
          },
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBeInstanceOf(UnauthorizedError);
      expect((result as UnauthorizedError).message).toBe('Unauthorized');
    });

    it('should convert 403 errors to ForbiddenError', () => {
      const gaxiosError = {
        response: {
          data: {
            error: {
              code: 403,
              message: 'Forbidden',
            },
          },
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBeInstanceOf(ForbiddenError);
      expect((result as ForbiddenError).message).toBe('Forbidden');
    });

    it('should preserve message for 403 errors', () => {
      const gaxiosError = {
        response: {
          data: {
            error: {
              code: 403,
              message: 'Cloud project does not have code assist enabled',
            },
          },
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect((result as ForbiddenError).message).toBe(
        'Cloud project does not have code assist enabled',
      );
    });

    it('should handle other error codes without conversion', () => {
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

    it('should handle response data as string', () => {
      const gaxiosError = {
        response: {
          data: JSON.stringify({
            error: {
              code: 401,
              message: 'Auth failed',
            },
          }),
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBeInstanceOf(UnauthorizedError);
      expect((result as UnauthorizedError).message).toBe('Auth failed');
    });

    it('should handle missing error code', () => {
      const gaxiosError = {
        response: {
          data: {
            error: {
              message: 'Error without code',
            },
          },
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBe(gaxiosError);
    });

    it('should handle missing error message', () => {
      const gaxiosError = {
        response: {
          data: {
            error: {
              code: 400,
            },
          },
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBe(gaxiosError);
    });

    it('should handle missing error object', () => {
      const gaxiosError = {
        response: {
          data: {},
        },
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBe(gaxiosError);
    });

    it('should handle missing response data', () => {
      const gaxiosError = {
        response: {},
      };
      const result = toFriendlyError(gaxiosError);
      expect(result).toBe(gaxiosError);
    });

    it('should handle non-object errors', () => {
      expect(toFriendlyError('string')).toBe('string');
      expect(toFriendlyError(42)).toBe(42);
      expect(toFriendlyError(null)).toBe(null);
    });

    it('should handle empty response data string', () => {
      const gaxiosError = {
        response: {
          data: '',
        },
      };
      expect(() => toFriendlyError(gaxiosError)).toThrow();
    });

    it('should handle invalid JSON in response data', () => {
      const gaxiosError = {
        response: {
          data: 'invalid json{',
        },
      };
      expect(() => toFriendlyError(gaxiosError)).toThrow();
    });
  });

  describe('error hierarchy', () => {
    it('should have consistent inheritance chain', () => {
      const errors = [
        new FatalAuthenticationError('test'),
        new FatalInputError('test'),
        new FatalSandboxError('test'),
        new FatalConfigError('test'),
        new FatalTurnLimitedError('test'),
        new FatalToolExecutionError('test'),
        new FatalCancellationError('test'),
      ];

      for (const err of errors) {
        expect(err).toBeInstanceOf(FatalError);
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('should have unique exit codes', () => {
      const exitCodes = [
        new FatalAuthenticationError('test').exitCode,
        new FatalInputError('test').exitCode,
        new FatalSandboxError('test').exitCode,
        new FatalConfigError('test').exitCode,
        new FatalTurnLimitedError('test').exitCode,
        new FatalToolExecutionError('test').exitCode,
        new FatalCancellationError('test').exitCode,
      ];

      const uniqueCodes = new Set(exitCodes);
      expect(uniqueCodes.size).toBe(exitCodes.length);
    });
  });
});
