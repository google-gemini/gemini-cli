/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else {
    // Attempt to convert the non-Error value to a string for logging
    try {
      const errorMessage = String(error);
      return errorMessage;
    } catch {
      // If String() itself fails (highly unlikely)
      return 'Failed to get error details';
    }
  }
}
