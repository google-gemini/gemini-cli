/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely stringifies an object to JSON, replacing active-path circular references with [Circular].
 *
 * @param obj - The object to stringify
 * @param space - Optional space parameter for formatting (defaults to no formatting)
 * @returns JSON string with circular references replaced by [Circular]
 */
import type { Config } from '../config/config.js';

export function safeJsonStringify(
  obj: unknown,
  space?: string | number,
): string {
  const ancestors: object[] = [];
  return JSON.stringify(
    obj,
    function (this: object, _key: string, value: unknown) {
      if (typeof value !== 'object' || value === null) {
        return value;
      }

      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
        ancestors.pop();
      }

      if (ancestors.includes(value)) {
        return '[Circular]';
      }

      ancestors.push(value);
      return value;
    },
    space,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function removeEmptyObjects(data: any): object {
  const cleanedObject: { [key: string]: unknown } = {};
  for (const k in data) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const v = data[k];
    if (v !== null && v !== undefined && typeof v === 'boolean') {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJsonStringifyBooleanValuesOnly(obj: any): string {
  let configSeen = false;
  return JSON.stringify(removeEmptyObjects(obj), (key, value) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    if ((value as Config) !== null && !configSeen) {
      configSeen = true;
      return value as unknown;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return '';
  });
}
