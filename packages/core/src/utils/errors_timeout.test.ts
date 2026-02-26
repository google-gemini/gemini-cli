/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errors.js';
import { type HttpError } from './httpErrors.js';

describe('getErrorMessage with timeout errors', () => {
  it('should handle undici HeadersTimeoutError correctly', () => {
    // Simulate what undici might throw if it's not a proper Error instance
    // or has a specific code.
    const timeoutError = {
      name: 'HeadersTimeoutError',
      code: 'UND_ERR_HEADERS_TIMEOUT',
      message: 'Headers timeout error',
    };

    // If it's a plain object, getErrorMessage might struggle if it expects an Error
    const message = getErrorMessage(timeoutError);
    // Based on existing implementation:
    // friendlyError = toFriendlyError(timeoutError) -> returns timeoutError
    // if (friendlyError instanceof Error) -> false
    // return String(friendlyError) -> "[object Object]"

    expect(message).toBe('Headers timeout error');
  });

  it('should handle undici HeadersTimeoutError as an Error instance', () => {
    const error = new Error('Headers timeout error');
    (error as HttpError).name = 'HeadersTimeoutError';
    (error as HttpError).status = 504; // simulate status for test
    (error as HttpError & { code?: string }).code = 'UND_ERR_HEADERS_TIMEOUT';

    const message = getErrorMessage(error);
    expect(message).toBe('Headers timeout error');
  });

  it('should return String representation for objects without a message property', () => {
    const error = { some: 'other', object: 123 };
    const message = getErrorMessage(error);
    expect(message).toBe('[object Object]');
  });
});
