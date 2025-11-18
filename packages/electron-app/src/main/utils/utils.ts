/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function isObject(item: unknown): item is Record<string, unknown> {
  return !!(item && typeof item === 'object' && !Array.isArray(item));
}

export function deepMerge<T extends object, U extends object>(
  target: T,
  source: U,
): T & U {
  const output = { ...target } as T & U;

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (
          key === '__proto__' ||
          key === 'constructor' ||
          key === 'prototype'
        ) {
          continue;
        }
        const sourceValue = source[key as keyof U];
        const targetValue = (target as Record<string, unknown>)[key];

        if (isObject(sourceValue) && isObject(targetValue)) {
          (output as Record<string, unknown>)[key] = deepMerge(
            targetValue,
            sourceValue,
          );
        } else {
          (output as Record<string, unknown>)[key] = sourceValue;
        }
      }
    }
  }

  return output;
}
