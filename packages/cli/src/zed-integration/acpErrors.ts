/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage as getCoreErrorMessage } from '@google/gemini-cli-core';

/**
 * Extracts a human-readable error message specifically for ACP (IDE) clients.
 * This function recursively parses JSON error blobs that are common in
 * Google API responses but ugly to display in an IDE's UI.
 */
export function getAcpErrorMessage(error: unknown): string {
  const coreMessage = getCoreErrorMessage(error);
  return extractRecursiveMessage(coreMessage);
}

function extractRecursiveMessage(input: string): string {
  const trimmed = input.trim();

  // Attempt to parse JSON error responses (common in Google API errors)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(trimmed);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const next =
        parsed?.error?.message ||
        parsed?.[0]?.error?.message ||
        parsed?.message;

      if (next && typeof next === 'string' && next !== input) {
        return extractRecursiveMessage(next);
      }
    } catch {
      // Fall back to original string if parsing fails
    }
  }
  return input;
}
