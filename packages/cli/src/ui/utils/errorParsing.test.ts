/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseAndFormatApiError } from './errorParsing.js';
import { AuthType, StructuredError } from '@google/gemini-cli-core';

describe('parseAndFormatApiError', () => {
  const enterpriseMessage = 'upgrade to a plan with higher limits';
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
    const result = parseAndFormatApiError(errorMessage);
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain('Your request has been rate limited');
  });

  it('should format a 429 API error with the personal message', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(enterpriseMessage);
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

  it('should handle an unknown error type', () => {
    const error = 12345;
    const expected = '[API Error: An unknown error occurred.]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });
});
