/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Coerces comma-separated or multiple flag values into a flat array.
 */
export const coerceCommaSeparated = (values: string[]): string[] => {
  if (values.length === 1 && values[0] === '') {
    return [''];
  }
  return values.flatMap((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
};
