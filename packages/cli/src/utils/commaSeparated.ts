/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Coerces comma-separated or multiple flag values into a flat array.
 */
export const coerceCommaSeparated = (values: unknown): string[] => {
  if (values == null) {
    return [];
  }

  const arrayValues = Array.isArray(values) ? values : [values];

  if (arrayValues.length === 1 && arrayValues[0] === '') {
    return [''];
  }

  return arrayValues.flatMap((value) => {
    if (typeof value !== 'string') {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  });
};
