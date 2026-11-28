/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import { parseAndFormatApiError } from './errorParsing.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { UserTierId } from '../code_assist/types.js';
import { AuthType } from '../core/contentGenerator.js';
import type { StructuredError } from '../core/turn.js';

describe('parseAndFormatApiError', () => {
  const vertexMessage = 'request a quota increase through Vertex';
  const geminiMessage = 'request a quota increase through AI Studio';

  it('should format a valid API error JSON', () => {
    const errorMessage =
      'got status: 400 Bad Request. {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
    const expected =
      '[API Error: API key not valid. Please pass a valid API key. (Status: INVALID_ARGUMENT)]';
    expect(parseAndFormatApiError(errorMessage)).toBe(expected);
  });

  it('should format a 429 API error with the default message', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      undefined,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      `Possible quota limitations in place or slow response times detected. Switching to the ${DEFAULT_GEMINI_FLASH_MODEL} model for the rest of this session.`,
    );
  });

  it('should format a 429 API error with the vertex message', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(errorMessage, AuthType.USE_VERTEX_AI);
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(vertexMessage);
  });

  it('should return the original message if it is not a JSON error', () => {
    const errorMessage = 'This is a plain old error message';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('should return the original message for malformed JSON', () => {
    const errorMessage = '[Stream Error: {"error": "malformed}';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('should handle JSON that does not match the ApiError structure', () => {
    const errorMessage = '[Stream Error: {"not_an_error": "some other json"}]';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('should format a nested API error', () => {
    const nestedErrorMessage = JSON.stringify({
      error: {
        code: 429,
        message:
          "Gemini 2.5 Pro Preview doesn't have a free quota tier. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.",
        status: 'RESOURCE_EXHAUSTED',
      },
    });

    const errorMessage = JSON.stringify({
      error: {
        code: 429,
        message: nestedErrorMessage,
        status: 'Too Many Requests',
      },
    });

    const result = parseAndFormatApiError(errorMessage, AuthType.USE_GEMINI);
    expect(result).toContain('Gemini 2.5 Pro Preview');
    expect(result).toContain(geminiMessage);
  });

  it('should format a StructuredError', () => {
    const error: StructuredError = {
      message: 'A structured error occurred',
      status: 500,
    };
    const expected = '[API Error: A structured error occurred]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });

  it('should format a 429 StructuredError with the vertex message', () => {
    const error: StructuredError = {
      message: 'Rate limit exceeded',
      status: 429,
    };
    const result = parseAndFormatApiError(error, AuthType.USE_VERTEX_AI);
    expect(result).toContain('[API Error: Rate limit exceeded]');
    expect(result).toContain(vertexMessage);
  });

  it('should format a StructuredError with status: undefined', () => {
    const error: StructuredError = {
      message: 'Rate limit exceeded (simulated 429 error, limit: 0)',
      status: undefined,
    };
    const expected =
      '[API Error: Rate limit exceeded (simulated 429 error, limit: 0)]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });

  it('should handle an unknown error type', () => {
    const error = 12345;
    const expected = '[API Error: An unknown error occurred.]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });
});

describe('parseAndFormatApiError with CONSUMER_INVALID project errors', () => {
  const originalProject = process.env['GOOGLE_CLOUD_PROJECT'];
  const originalProjectId = process.env['GOOGLE_CLOUD_PROJECT_ID'];

  afterEach(() => {
    if (originalProject === undefined) {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
    } else {
      process.env['GOOGLE_CLOUD_PROJECT'] = originalProject;
    }
    if (originalProjectId === undefined) {
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];
    } else {
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = originalProjectId;
    }
  });

  const consumerInvalidError =
    'got status: 403 Forbidden. {"error":{"code":403,"message":"Permission denied on resource project Gemini Project.","status":"PERMISSION_DENIED","details":[{"reason":"CONSUMER_INVALID"}]}}';

  it('should append a set-the-env-var hint when the project env var is missing', () => {
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_PROJECT_ID'];
    const result = parseAndFormatApiError(consumerInvalidError);
    expect(result).toContain(
      '[API Error: Permission denied on resource project Gemini Project. (Status: PERMISSION_DENIED)]',
    );
    expect(result).toContain(
      'GOOGLE_CLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT_ID) is not set',
    );
    expect(result).toContain(
      'https://geminicli.com/docs/get-started/authentication/#set-gcp',
    );
  });

  it('should append a check-the-value hint when the project env var is set', () => {
    process.env['GOOGLE_CLOUD_PROJECT'] = 'my-project-123';
    const result = parseAndFormatApiError(consumerInvalidError);
    expect(result).toContain('missing or invalid');
    expect(result).toContain('not the numeric project number');
  });

  it('should not append the hint for a 403 without CONSUMER_INVALID', () => {
    const errorMessage =
      'got status: 403 Forbidden. {"error":{"code":403,"message":"The caller does not have permission.","status":"PERMISSION_DENIED"}}';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      '[API Error: The caller does not have permission. (Status: PERMISSION_DENIED)]',
    );
  });

  it('should append the hint for a 403 StructuredError mentioning CONSUMER_INVALID', () => {
    const error: StructuredError = {
      message: 'Permission denied (CONSUMER_INVALID) on resource project.',
      status: 403,
    };
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_PROJECT_ID'];
    const result = parseAndFormatApiError(error);
    expect(result).toContain(
      'GOOGLE_CLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT_ID) is not set',
    );
  });

  it('should give free-tier users a re-auth hint instead of env-var advice', () => {
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_PROJECT_ID'];
    const result = parseAndFormatApiError(
      consumerInvalidError,
      undefined,
      UserTierId.FREE,
    );
    expect(result).toContain('Free-tier accounts use a managed project');
    expect(result).not.toContain(
      'GOOGLE_CLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT_ID) is not set',
    );
  });
});
