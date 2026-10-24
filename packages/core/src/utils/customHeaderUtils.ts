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

  // Split the string on commas that are followed by a header key (key:),
  // but ignore commas that are part of a header value (including values with colons or commas)
  for (const entry of envValue.split(/,(?=\s*[^,:]+:)/)) {
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
