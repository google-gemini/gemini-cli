/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks whether a value is a plain object (not an array or null).
 */
function isPlainObject(item: unknown): item is Record<string, unknown> {
  return !!item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Recursively deep-merges multiple objects. Later sources take precedence over
 * earlier ones. Arrays are replaced wholesale rather than concatenated so that
 * a user can fully override a default array value.
 *
 * @returns A new object containing the merged result.
 */
export function deepMergeObjects(
  ...objects: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  return objects.reduce((acc: Record<string, unknown>, obj) => {
    if (!obj) {
      return acc;
    }

    for (const key of Object.keys(obj)) {
      const accValue = acc[key];
      const objValue = obj[key];

      if (isPlainObject(accValue) && isPlainObject(objValue)) {
        acc[key] = deepMergeObjects(accValue, objValue);
      } else {
        acc[key] = objValue;
      }
    }

    return acc;
  }, {});
}
