/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructuredError } from '@gemini-cli/core';

const RATE_LIMIT_ERROR_MESSAGE =
  '\nPlease wait and try again later. To increase your limits, upgrade to a plan with higher limits, or use /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey';

export interface ApiError {
  error: {
    code: number;
    message: string;
    status: string;
    details: unknown[];
  };
}

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as ApiError).error === 'object' &&
    'message' in (error as ApiError).error
  );
}

function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as StructuredError).message === 'string'
  );
}

export function parseAndFormatApiError(error: unknown): string {
  if (isStructuredError(error)) {
    let text = `[API Error: ${error.message}]`;
    if (error.status === 429) {
      text += RATE_LIMIT_ERROR_MESSAGE;
    }
    return text;
  }

  // The error message might be a string containing a JSON object.
  if (typeof error === 'string') {
    const jsonStart = error.indexOf('{');
    if (jsonStart === -1) {
      return `[API Error: ${error}]`; // Not a JSON error, return as is.
    }

    const jsonString = error.substring(jsonStart);

    try {
      const parsedError = JSON.parse(jsonString) as unknown;
      if (isApiError(parsedError)) {
        let finalMessage = parsedError.error.message;
        try {
          // See if the message is a stringified JSON with another error
          const nestedError = JSON.parse(finalMessage) as unknown;
          if (isApiError(nestedError)) {
            finalMessage = nestedError.error.message;
          }
        } catch (_e) {
          // It's not a nested JSON error, so we just use the message as is.
        }
        let text = `[API Error: ${finalMessage} (Status: ${parsedError.error.status})]`;
        if (parsedError.error.code === 429) {
          text += RATE_LIMIT_ERROR_MESSAGE;
        }
        return text;
      }
    } catch (_e) {
      // Not a valid JSON, fall through and return the original message.
    }
    return `[API Error: ${error}]`;
  }

  return '[API Error: An unknown error occurred.]';
}
