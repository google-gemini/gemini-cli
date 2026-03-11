/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  classifyGoogleError,
  InvalidProjectError,
} from './googleQuotaErrors.js';
import type { GoogleApiError } from './googleErrors.js';

describe('classifyGoogleError - CONSUMER_INVALID', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return InvalidProjectError for 403 with CONSUMER_INVALID from cloudaicompanion', () => {
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

    const apiError: GoogleApiError = {
      code: 403,
      message: 'Permission denied on resource project Gemini Project.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'CONSUMER_INVALID',
          domain: 'cloudaicompanion.googleapis.com',
          metadata: {},
        },
      ],
    };

    // Wrap the error in the format that parseGoogleApiError expects
    const wrappedError = { error: apiError };

    const result = classifyGoogleError(wrappedError);

    expect(result).toBeInstanceOf(InvalidProjectError);
    expect((result as InvalidProjectError).message).toContain(
      'GOOGLE_CLOUD_PROJECT environment variable is not set',
    );
    expect((result as InvalidProjectError).message).toContain(
      'export GOOGLE_CLOUD_PROJECT',
    );
  });

  it('should return InvalidProjectError with project ID when set but invalid', () => {
    process.env['GOOGLE_CLOUD_PROJECT'] = 'invalid-project';

    const apiError: GoogleApiError = {
      code: 403,
      message: 'Permission denied on resource project invalid-project.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'CONSUMER_INVALID',
          domain: 'cloudaicompanion.googleapis.com',
          metadata: {},
        },
      ],
    };

    // Wrap the error in the format that parseGoogleApiError expects
    const wrappedError = { error: apiError };

    const result = classifyGoogleError(wrappedError);

    expect(result).toBeInstanceOf(InvalidProjectError);
    expect((result as InvalidProjectError).message).toContain(
      'Invalid Google Cloud project: "invalid-project"',
    );
    expect((result as InvalidProjectError).message).toContain(
      'does not exist or you do not have access',
    );
  });

  it('should not return InvalidProjectError for 403 with different reason', () => {
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Access denied.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'PERMISSION_DENIED',
          domain: 'cloudaicompanion.googleapis.com',
          metadata: {},
        },
      ],
    };

    // Wrap the error in the format that parseGoogleApiError expects
    const wrappedError = { error: apiError };

    const result = classifyGoogleError(wrappedError);

    expect(result).not.toBeInstanceOf(InvalidProjectError);
  });

  it('should not return InvalidProjectError for 403 from non-cloudaicompanion domain', () => {
    const apiError: GoogleApiError = {
      code: 403,
      message: 'Forbidden.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'CONSUMER_INVALID',
          domain: 'other-service.googleapis.com',
          metadata: {},
        },
      ],
    };

    // Wrap the error in the format that parseGoogleApiError expects
    const wrappedError = { error: apiError };

    const result = classifyGoogleError(wrappedError);

    expect(result).not.toBeInstanceOf(InvalidProjectError);
  });
});
