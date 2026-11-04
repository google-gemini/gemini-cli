/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatCliError, isCliDebugEnabled } from './formatError.js';

describe('formatCliError', () => {
  it('formats StructuredError with HTTP status in standard mode', () => {
    expect(formatCliError({ message: 'Model not found', status: 404 })).toBe(
      'Error: Model not found (Status: 404)',
    );
  });

  it('formats top-level critical quota and Gaxios 403 errors without [object Object] or Gaxios config keys', () => {
    const quotaFormatted = formatCliError(
      { message: 'Quota exceeded', status: 429 },
      { prefix: 'An unexpected critical error occurred: ' },
    );
    expect(quotaFormatted).toBe(
      'An unexpected critical error occurred: Quota exceeded (Status: 429)',
    );
    expect(quotaFormatted).not.toContain('[object Object]');

    const licenseMessage =
      "Permission 'cloudaicompanion.licenses.selfAssign' denied on resource '//cloudresourcemanager.googleapis.com/projects/test-invalid-project' (or it may not exist). Remediate access with this Troubleshooter URL or share it with your administrator - https://console.cloud.google.com/iam-admin/troubleshooter/summary;errorId=abc";
    const gaxiosError = Object.assign(
      new Error('Request failed with status code 403'),
      {
        config: {
          url: 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
          headers: { Authorization: 'Bearer secret-token' },
          errorRedactor: () => ({}),
          retryConfig: { retry: 3, currentRetryAttempt: 0 },
        },
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: licenseMessage,
              status: 'PERMISSION_DENIED',
            },
          },
        },
      },
    );

    const formattedGaxios = formatCliError(gaxiosError, {
      prefix: 'An unexpected critical error occurred: ',
    });
    expect(formattedGaxios).toBe(
      `An unexpected critical error occurred: ${licenseMessage} (Status: 403)`,
    );
    expect(formattedGaxios).not.toContain('[object Object]');
    expect(formattedGaxios).not.toContain('errorRedactor');
    expect(formattedGaxios).not.toContain('retryConfig');
    expect(formattedGaxios).not.toContain('secret-token');
  });

  it('formats Gaxios 403 error into a single actionable line without transport internals', () => {
    const gaxiosError = Object.assign(
      new Error('Request failed with status code 403'),
      {
        config: {
          url: 'https://internal.googleapis.com/v1/projects/secret',
          headers: { Authorization: 'Bearer secret-token' },
        },
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'Permission denied on resource project demo.',
              status: 'PERMISSION_DENIED',
            },
          },
        },
      },
    );

    const formatted = formatCliError(gaxiosError);
    expect(formatted).toBe(
      'Error: Permission denied on resource project demo. (Status: 403)',
    );
    expect(formatted).not.toContain('secret-token');
    expect(formatted).not.toContain('internal.googleapis.com');
  });

  it('formats standard Error instances cleanly without redundant status suffix', () => {
    expect(formatCliError(new Error('Network timeout'))).toBe(
      'Error: Network timeout',
    );
    expect(
      formatCliError({
        message: 'Request failed with status code 404',
        status: 404,
      }),
    ).toBe('Error: Request failed with status code 404');
    expect(
      formatCliError({
        message: 'Error 403: Forbidden',
        status: 403,
      }),
    ).toBe('Error: Error 403: Forbidden');
    expect(
      formatCliError({
        error: {
          message: 'Transient failure',
          status: '   ',
        },
      }),
    ).toBe('Error: Transient failure');

    const errWithStack = new Error('Network timeout');
    errWithStack.stack = 'Error: Network timeout\n    at fetch (index.js:10:5)';
    expect(formatCliError(errWithStack, { debug: true })).toBe(
      'Error: Network timeout\n    at fetch (index.js:10:5)',
    );
    expect(
      formatCliError(errWithStack, {
        debug: true,
        prefix: 'An unexpected critical error occurred: ',
      }),
    ).toBe(
      'An unexpected critical error occurred: Error: Network timeout\n    at fetch (index.js:10:5)',
    );
  });

  it('formats primitive string throws with proper prefix spacing', () => {
    expect(formatCliError('Out of memory')).toBe('Error: Out of memory');
    expect(
      formatCliError('Out of memory', {
        prefix: 'An unexpected critical error occurred: ',
      }),
    ).toBe('An unexpected critical error occurred: Out of memory');
  });

  it('formats circular reference objects safely in both normal and debug modes', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const standardOutput = formatCliError(circular);
    expect(standardOutput).toBe('Error: {"self":"[Circular]"}');
    expect(standardOutput).not.toContain('[object Object]');

    const debugOutput = formatCliError(circular, { debug: true });
    expect(debugOutput).toContain('Error: {"self":"[Circular]"}');
    expect(debugOutput).toContain('Debug Context:');
    expect(debugOutput).toContain('"[Circular]"');
  });

  it('outputs full stack trace and redacted details when debug is enabled', () => {
    const gaxiosError = Object.assign(
      new Error('Request failed with status code 403'),
      {
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'Permission denied on resource project demo.',
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
    gaxiosError.stack =
      'Error: Request failed with status code 403\n    at Gaxios._request (gaxios.js:142:23)';

    const debugOutput = formatCliError(gaxiosError, { debug: true });
    expect(debugOutput).toContain(
      'Error: Permission denied on resource project demo. (Status: 403)',
    );
    expect(debugOutput).toContain('at Gaxios._request');
    expect(debugOutput).toContain('IAM_PERMISSION_DENIED');
  });

  it('redacts sensitive headers in debug context for non-Error objects', () => {
    const rawTransportPayload = {
      message: 'Authentication failed',
      status: 401,
      headers: {
        Authorization: 'Bearer secret-bearer',
        'x-goog-api-key': 'secret-key',
      },
    };

    const debugOutput = formatCliError(rawTransportPayload, { debug: true });
    expect(debugOutput).toContain('Error: Authentication failed (Status: 401)');
    expect(debugOutput).toContain('[REDACTED]');
    expect(debugOutput).not.toContain('secret-bearer');
    expect(debugOutput).not.toContain('secret-key');
  });
});

describe('isCliDebugEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('detects --debug and -d flags before -- separator', () => {
    expect(isCliDebugEnabled(['-p', 'hello'], {})).toBe(false);
    expect(isCliDebugEnabled(['--debug', '-p', 'hello'], {})).toBe(true);
    expect(isCliDebugEnabled(['-d', '-p', 'hello'], {})).toBe(true);
    expect(isCliDebugEnabled(['--', '--debug'], {})).toBe(false);
  });

  it('respects DEBUG and DEBUG_MODE environment variables without treating false/0 as enabled', () => {
    expect(isCliDebugEnabled([], { DEBUG: 'false' })).toBe(false);
    expect(isCliDebugEnabled([], { DEBUG: '0' })).toBe(false);
    expect(isCliDebugEnabled([], { DEBUG: '1' })).toBe(true);
    expect(isCliDebugEnabled([], { DEBUG: 'true' })).toBe(true);
    expect(isCliDebugEnabled([], { DEBUG_MODE: 'true' })).toBe(true);
  });
});
