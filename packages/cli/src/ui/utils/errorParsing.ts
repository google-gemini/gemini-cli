/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

export function parseAndFormatApiError(errorMessage: string): string {
  // The error message might be prefixed with some text, like "[Stream Error: ...]".
  // We want to find the start of the JSON object.
  const jsonStart = errorMessage.indexOf('{');
  if (jsonStart === -1) {
    return errorMessage; // Not a JSON error, return as is.
  }

  const jsonString = errorMessage.substring(jsonStart);

  try {
    const error = JSON.parse(jsonString) as unknown;
    if (isApiError(error)) {
      let finalMessage = error.error.message;
      try {
        // See if the message is a stringified JSON with another error
        const nestedError = JSON.parse(finalMessage) as unknown;
        if (isApiError(nestedError)) {
          finalMessage = nestedError.error.message;
        }
      } catch (_e) {
        // It's not a nested JSON error, so we just use the message as is.
      }
      return `API Error: ${finalMessage} (Status: ${error.error.status})`;
    }
  } catch (_e) {
    // Not a valid JSON, fall through and return the original message.
  }

  return errorMessage;
}
