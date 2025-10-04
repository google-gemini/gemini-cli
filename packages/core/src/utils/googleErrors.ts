/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structured representation of a Google API error
 */
export interface GoogleApiError {
  code: number;
  message: string;
  status?: string;
  details?: Array<Record<string, unknown>>;
}

/**
 * Parses a Google API error from various formats.
 * Returns null if the error cannot be parsed as a Google API error.
 *
 * @param error - The error to parse
 * @returns GoogleApiError if successfully parsed, null otherwise
 */
export function parseGoogleApiError(error: unknown): GoogleApiError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  // Try to extract from different error formats

  // Format 1: Direct API error object
  // { error: { code: 429, message: "...", status: "...", details: [...] } }
  if (
    'error' in error &&
    typeof (error as Record<string, unknown>).error === 'object'
  ) {
    const apiError = (error as Record<string, unknown>).error;
    if (isGoogleApiError(apiError)) {
      return apiError;
    }
  }

  // Format 2: Axios/fetch response with nested data
  // { response: { data: { error: { code: 429, ... } } } }
  if (
    'response' in error &&
    typeof (error as Record<string, unknown>).response === 'object'
  ) {
    const response = (error as Record<string, unknown>).response as Record<
      string,
      unknown
    >;
    if (response.data && typeof response.data === 'object') {
      // Handle string data that needs parsing
      let data = response.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return null;
        }
      }
      if (data.error && isGoogleApiError(data.error)) {
        return data.error;
      }
    }
  }

  // Format 3: Error with status and message properties
  // { status: 429, message: "...", details: [...] }
  if (
    'status' in error &&
    typeof (error as Record<string, unknown>).status === 'number'
  ) {
    const status = (error as Record<string, unknown>).status as number;
    const message =
      ((error as Record<string, unknown>).message as string) ||
      ((error as Record<string, unknown>).statusText as string) ||
      'Unknown error';
    const details = (error as Record<string, unknown>).details;
    return {
      code: status,
      message,
      details: Array.isArray(details) ? details : undefined,
    };
  }

  // Format 4: Nested JSON in error message
  // Error { message: '{"error":{"code":429,"message":"..."}}' }
  if (error instanceof Error && error.message) {
    const extracted = extractApiErrorFromMessage(error.message);
    if (extracted) {
      return extracted;
    }
  }

  return null;
}

/**
 * Type guard to check if an object is a GoogleApiError
 */
function isGoogleApiError(obj: unknown): obj is GoogleApiError {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.code === 'number' &&
    typeof obj.message === 'string'
  );
}

/**
 * Attempts to extract a Google API error from a string message
 */
function extractApiErrorFromMessage(message: string): GoogleApiError | null {
  // Look for JSON object in the message
  const jsonMatch = message.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Check if it's a wrapped error
    if (parsed.error && isGoogleApiError(parsed.error)) {
      return parsed.error;
    }

    // Check if it's a direct error object
    if (isGoogleApiError(parsed)) {
      return parsed;
    }
  } catch {
    // Not valid JSON
  }

  return null;
}
