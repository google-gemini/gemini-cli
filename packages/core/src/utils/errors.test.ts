/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isAuthenticationError,
  isAbortError,
  UnauthorizedError,
  toFriendlyError,
  BadRequestError,
  ForbiddenError,
  AccountSuspendedError,
  getErrorMessage,
  getErrorType,
  FatalAuthenticationError,
  FatalCancellationError,
  FatalInputError,
  FatalSandboxError,
  FatalConfigError,
  FatalTurnLimitedError,
  FatalToolExecutionError,
  normalizeError,
  safeSerializeErrorValue,
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

describe('isAbortError', () => {
  it('should return true for AbortError', () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    expect(isAbortError(error)).toBe(true);
  });

  it('should return true for DOMException AbortError', () => {
    const error = new DOMException('Aborted', 'AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('should return false for other errors', () => {
    expect(isAbortError(new Error('Other error'))).toBe(false);
  });

  it('should return false for non-error objects', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});

describe('isAuthenticationError', () => {
  it('should detect error with code: 401 property (MCP SDK style)', () => {
    const error = { code: 401, message: 'Unauthorized' };
    expect(isAuthenticationError(error)).toBe(true);
  });

  it('should detect error with status or statusCode: 401 property', () => {
    expect(isAuthenticationError({ status: 401 })).toBe(true);
    expect(isAuthenticationError({ statusCode: 401 })).toBe(true);
    expect(isAuthenticationError({ code: 401 })).toBe(true);
    expect(isAuthenticationError({ status: '401' })).toBe(true);
    expect(isAuthenticationError({ statusCode: '401' })).toBe(true);
    expect(isAuthenticationError({ code: '401' })).toBe(true);
    expect(isAuthenticationError({ status: 500 })).toBe(false);
    expect(isAuthenticationError({ statusCode: 404 })).toBe(false);
    expect(isAuthenticationError({ status: '500' })).toBe(false);
    expect(isAuthenticationError({ statusCode: '404' })).toBe(false);
  });

  it('should detect error with nested response.status or response.statusCode: 401 (gaxios/axios style)', () => {
    expect(isAuthenticationError({ response: { status: 401 } })).toBe(true);
    expect(isAuthenticationError({ response: { statusCode: 401 } })).toBe(true);
    expect(isAuthenticationError({ response: { status: '401' } })).toBe(true);
    expect(isAuthenticationError({ response: { statusCode: '401' } })).toBe(
      true,
    );
    expect(isAuthenticationError({ response: { status: 500 } })).toBe(false);
    expect(isAuthenticationError({ response: { statusCode: 404 } })).toBe(
      false,
    );
    expect(isAuthenticationError({ response: { status: '500' } })).toBe(false);
    expect(isAuthenticationError({ response: { statusCode: '404' } })).toBe(
      false,
    );
    expect(isAuthenticationError({ response: null })).toBe(false);
    expect(isAuthenticationError({ response: 'invalid' })).toBe(false);
  });

  it('should detect structured API errors that map to UnauthorizedError via toFriendlyError', () => {
    const gaxiosError = {
      response: {
        data: {
          error: {
            code: 401,
            message: 'Invalid API key',
          },
        },
      },
    };
    expect(isAuthenticationError(gaxiosError)).toBe(true);

    const badRequestGaxiosError = {
      response: {
        data: {
          error: {
            code: 400,
            message: 'Bad Request',
          },
        },
      },
    };
    expect(isAuthenticationError(badRequestGaxiosError)).toBe(false);
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
    expect(isAuthenticationError(new Error('401: Unauthorized'))).toBe(true);
    expect(isAuthenticationError(new Error('401 - Unauthorized'))).toBe(true);
    expect(isAuthenticationError(new Error('[401] Unauthorized'))).toBe(true);
    expect(isAuthenticationError(new Error('(401) Unauthorized'))).toBe(true);
    expect(isAuthenticationError(new Error('Unauthorized (401)'))).toBe(true);
    expect(isAuthenticationError(new Error('Unauthorized: 401'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP 401'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP 401: Unauthorized'))).toBe(
      true,
    );
    expect(isAuthenticationError(new Error('(HTTP 401)'))).toBe(true);
    expect(isAuthenticationError(new Error('[HTTP 401]'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP/1.1 401 Unauthorized'))).toBe(
      true,
    );
    expect(isAuthenticationError(new Error('HTTP/2 401'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP status: 401'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP status 401'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP error 401'))).toBe(true);
    expect(isAuthenticationError(new Error('HTTP error: 401'))).toBe(true);
    expect(isAuthenticationError(new Error('Status code: 401'))).toBe(true);
    expect(isAuthenticationError(new Error('Status code 401'))).toBe(true);
    expect(isAuthenticationError(new Error('status code: 401'))).toBe(true);
    expect(isAuthenticationError(new Error('statusCode: 401'))).toBe(true);
    expect(isAuthenticationError(new Error('status: 401'))).toBe(true);
    expect(isAuthenticationError(new Error('status 401'))).toBe(true);
    expect(isAuthenticationError(new Error('Failed with status 401'))).toBe(
      true,
    );
    expect(
      isAuthenticationError(new Error('Request failed with status code 401')),
    ).toBe(true);
    expect(
      isAuthenticationError(
        new Error(
          'Error POSTing to endpoint (HTTP 401): {"error":"unauthorized"}',
        ),
      ),
    ).toBe(true);
  });

  it('should return false for non-auth errors containing "401" as a substring or token', () => {
    // Port numbers containing 401
    expect(
      isAuthenticationError(new Error('connect ECONNREFUSED 127.0.0.1:4012')),
    ).toBe(false);
    expect(
      isAuthenticationError(
        new Error('Failed to connect to http://localhost:4012/sse'),
      ),
    ).toBe(false);
    expect(
      isAuthenticationError(
        new Error('Error connecting to http://localhost:1401'),
      ),
    ).toBe(false);
    expect(isAuthenticationError(new Error('port 4012 is in use'))).toBe(false);

    // Line numbers and file paths
    expect(
      isAuthenticationError(
        new Error('SyntaxError: Unexpected token at file.js:401:12'),
      ),
    ).toBe(false);
    expect(
      isAuthenticationError(new Error('error at line 401: missing semicolon')),
    ).toBe(false);
    expect(isAuthenticationError(new Error('line 401'))).toBe(false);
    expect(isAuthenticationError(new Error('index.ts:401:5'))).toBe(false);

    // Process exit codes and numbers
    expect(
      isAuthenticationError(new Error('Process exited with code 4010')),
    ).toBe(false);
    expect(
      isAuthenticationError(new Error('Command failed with exit status 4010')),
    ).toBe(false);
    expect(
      isAuthenticationError(new Error('Command failed with exit status 401')),
    ).toBe(false);
    expect(
      isAuthenticationError(new Error('Process exited with status 401')),
    ).toBe(false);
    expect(
      isAuthenticationError(new Error('Process exited with code 401')),
    ).toBe(false);

    // Entity IDs and other non-HTTP 401 contexts
    expect(
      isAuthenticationError(new Error('Record with ID 401 not found')),
    ).toBe(false);
    expect(isAuthenticationError(new Error('User 401 not found'))).toBe(false);
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
    expect(result).not.toBeInstanceOf(AccountSuspendedError);
    expect((result as ForbiddenError).message).toBe('Forbidden');
  });

  it('should return AccountSuspendedError for 403 with TOS_VIOLATION reason in details', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 403,
            message:
              'This service has been disabled in this account for violation of Terms of Service.',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'TOS_VIOLATION',
                domain: 'example.googleapis.com',
                metadata: {
                  uiMessage: 'true',
                  appeal_url_link_text: 'Appeal Here',
                  appeal_url: 'https://example.com/appeal',
                },
              },
            ],
          },
        },
      },
    };
    const result = toFriendlyError(error);
    expect(result).toBeInstanceOf(AccountSuspendedError);
    expect(result).toBeInstanceOf(ForbiddenError);
    const suspended = result as AccountSuspendedError;
    expect(suspended.message).toBe(
      'This service has been disabled in this account for violation of Terms of Service.',
    );
    expect(suspended.appealUrl).toBe('https://example.com/appeal');
    expect(suspended.appealLinkText).toBe('Appeal Here');
  });

  it('should return ForbiddenError for 403 with violation message but no TOS_VIOLATION detail', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 403,
            message:
              'This service has been disabled in this account for violation of Terms of Service.',
          },
        },
      },
    };
    const result = toFriendlyError(error);
    expect(result).toBeInstanceOf(ForbiddenError);
    expect(result).not.toBeInstanceOf(AccountSuspendedError);
  });

  it('should return ForbiddenError for 403 with non-TOS_VIOLATION detail', () => {
    const error = {
      response: {
        data: {
          error: {
            code: 403,
            message: 'Forbidden',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'ACCESS_DENIED',
                domain: 'googleapis.com',
                metadata: {},
              },
            ],
          },
        },
      },
    };
    const result = toFriendlyError(error);
    expect(result).toBeInstanceOf(ForbiddenError);
    expect(result).not.toBeInstanceOf(AccountSuspendedError);
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
    expect(getErrorType(new AccountSuspendedError('test'))).toBe(
      'AccountSuspendedError',
    );
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

  it('should use explicitly set error names', () => {
    class _GaxiosError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'GaxiosError';
      }
    }
    expect(getErrorType(new _GaxiosError('test'))).toBe('GaxiosError');

    class BadRequestError3 extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'BadRequestError';
      }
    }
    expect(getErrorType(new BadRequestError3('test'))).toBe('BadRequestError');

    class _AbortError2 extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'AbortError';
      }
    }
    expect(getErrorType(new _AbortError2('test'))).toBe('AbortError');
  });
});

describe('normalizeError', () => {
  it('handles null and undefined payloads defensively', () => {
    expect(normalizeError(null)).toEqual({
      message: 'Unknown error occurred (empty payload)',
      originalError: null,
    });
    expect(normalizeError(undefined)).toEqual({
      message: 'Unknown error occurred (empty payload)',
      originalError: undefined,
    });
  });

  it('handles primitive string, number, and boolean throws', () => {
    expect(normalizeError('Out of memory')).toEqual({
      message: 'Out of memory',
      originalError: 'Out of memory',
    });
    expect(normalizeError(503)).toEqual({
      message: '503',
      originalError: 503,
    });
    expect(normalizeError(false)).toEqual({
      message: 'false',
      originalError: false,
    });
    expect(normalizeError('')).toEqual({
      message: 'Unknown error occurred (empty payload)',
      originalError: '',
    });
  });

  it('normalizes StructuredError plain objects with numeric status', () => {
    const structured = { message: 'Model not found', status: 404 };
    expect(normalizeError(structured)).toEqual({
      message: 'Model not found',
      status: 404,
      code: undefined,
      details: undefined,
      originalError: structured,
    });
  });

  it('extracts clean message, status, code, and details from Gaxios / Google Cloud API errors', () => {
    const gaxiosError = Object.assign(
      new Error('Request failed with status code 403'),
      {
        code: '403',
        config: {
          url: 'https://internal-endpoint.example.com/v1/projects/p',
          headers: { Authorization: 'Bearer secret-token' },
        },
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'Permission denied on resource project my-project.',
              status: 'PERMISSION_DENIED',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                  reason: 'IAM_PERMISSION_DENIED',
                },
              ],
            },
          },
        },
      },
    );

    const normalized = normalizeError(gaxiosError);
    expect(normalized.message).toBe(
      'Permission denied on resource project my-project.',
    );
    expect(normalized.status).toBe(403);
    expect(normalized.code).toBe('403');
    expect(normalized.details).toEqual([
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'IAM_PERMISSION_DENIED',
      },
    ]);
    expect(normalized.originalError).toBe(gaxiosError);
  });

  it('extracts OAuth2 error_description envelopes from HTTP responses', () => {
    const oauthError = Object.assign(new Error('Request failed'), {
      response: {
        status: 400,
        data: {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        },
      },
    });

    const normalized = normalizeError(oauthError);
    expect(normalized.message).toBe(
      'invalid_grant: Token has been expired or revoked.',
    );
    expect(normalized.status).toBe(400);
    expect(normalized.code).toBe('invalid_grant');
  });

  it('extracts JSON-RPC nested error payloads', () => {
    const rpcError = {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32601,
        message: 'Method not found',
        data: { method: 'tools/call' },
      },
    };

    const normalized = normalizeError(rpcError);
    expect(normalized.message).toBe('Method not found');
    expect(normalized.status).toBe(-32601);
    expect(normalized.code).toBe(-32601);
    expect(normalized.details).toEqual({ method: 'tools/call' });
  });

  it('enriches generic fetch failed errors with ES2022 cause details', () => {
    const cause = Object.assign(
      new Error('connect ECONNREFUSED 127.0.0.1:8080'),
      { code: 'ECONNREFUSED' },
    );
    const fetchErr = new TypeError('fetch failed', { cause });

    const normalized = normalizeError(fetchErr);
    expect(normalized.message).toBe(
      'fetch failed: connect ECONNREFUSED 127.0.0.1:8080',
    );
    expect(normalized.code).toBe('ECONNREFUSED');
    expect(normalized.status).toBe('ECONNREFUSED');
  });

  it('handles circular reference objects without throwing or returning [object Object]', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const normalized = normalizeError(circular);
    expect(normalized.message).toBe('{"self":"[Circular]"}');
    expect(normalized.message).not.toContain('[object Object]');
  });

  it('handles empty plain objects without returning [object Object]', () => {
    const normalized = normalizeError({});
    expect(normalized.message).toBe('Unknown error occurred (empty object)');
  });
});

describe('safeSerializeErrorValue', () => {
  it('redacts sensitive headers and omits raw socket/agent handles while preserving shared non-circular objects', () => {
    const sharedMeta = { region: 'us-central1' };
    const transportObj: Record<string, unknown> = {
      config: {
        headers: {
          Authorization: 'Bearer super-secret',
          'x-goog-api-key': 'secret-api-key',
          'Content-Type': 'application/json',
        },
        metaA: sharedMeta,
        metaB: sharedMeta,
      },
      agent: { sockets: {} },
      socket: { destroyed: false },
    };
    transportObj['self'] = transportObj;

    const serialized = JSON.parse(safeSerializeErrorValue(transportObj));
    expect(serialized.config.headers.Authorization).toBe('[REDACTED]');
    expect(serialized.config.headers['x-goog-api-key']).toBe('[REDACTED]');
    expect(serialized.config.headers['Content-Type']).toBe('application/json');
    expect(serialized.config.metaA).toEqual({ region: 'us-central1' });
    expect(serialized.config.metaB).toEqual({ region: 'us-central1' });
    expect(serialized.agent).toBeUndefined();
    expect(serialized.socket).toBeUndefined();
    expect(serialized.self).toBe('[Circular]');
  });
});
