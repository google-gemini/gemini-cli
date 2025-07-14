/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely stringifies an object to JSON, handling circular references by replacing them with [Circular].
 *
 * @param obj - The object to stringify
 * @param space - Optional space parameter for formatting (defaults to no formatting)
 * @returns JSON string with circular references replaced by [Circular]
 */
export function safeJsonStringify(
  obj: unknown,
  space?: string | number,
): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    },
    space,
  );
}
