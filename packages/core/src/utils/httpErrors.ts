/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HttpError extends Error {
  status?: number;
}

/**
 * Extracts the HTTP status code from an error object.
 * @param error The error object.
 * @returns The HTTP status code, or undefined if not found.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }
    // Check for error.response.status (common in axios errors)
    if ('response' in error) {
      const resp: unknown = error.response;
      if (typeof resp === 'object' && resp !== null) {
        if ('status' in resp && typeof resp.status === 'number') {
          return resp.status;
        }
      }
    }
  }
  return undefined;
}

export class ModelNotFoundError extends Error {
  code: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'ModelNotFoundError';
    this.code = code ? code : 404;
  }
}
