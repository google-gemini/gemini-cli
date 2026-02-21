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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return value;
    },
    space,
  );
}

function removeEmptyObjects(data: object): Record<string, unknown> {
  const cleanedObject: Record<string, unknown> = {};
  for (const k in data) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const v = (data as Record<string, unknown>)[k];
    if (typeof v === 'boolean') {
      cleanedObject[k] = v;
    }
  }

  return cleanedObject;
}

/**
 * Safely stringifies an object to JSON, retaining only non-null, Boolean-valued members.
 *
 * @param obj - The object to stringify
 * @returns JSON string with circular references skipped and only non-null, Boolean member values retained.
 */
export function safeJsonStringifyBooleanValuesOnly(obj: unknown): string {
  let configSeen = false;
  const data = typeof obj === 'object' && obj !== null ? obj : {};
  return JSON.stringify(removeEmptyObjects(data), (_key, value) => {
    if (value !== null && !configSeen) {
      configSeen = true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return '';
  });
}
