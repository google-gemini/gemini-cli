/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parses custom headers and returns a map of key and vallues
 */
export function parseCustomHeaders(
  envValue: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!envValue) {
    return headers;
  }

  for (const entry of envValue.split(',')) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      continue;
    }

    const separatorIndex = trimmedEntry.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmedEntry.slice(0, separatorIndex).trim();
    const value = trimmedEntry.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    headers[name] = value;
  }

  return headers;
}
