/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { eastAsianWidth } from 'get-east-asian-width';

/**
 * Calculates the visual width of a string, accounting for graphemes and East Asian characters.
 */
export function stringWidth(str: string): number {
  if (typeof str !== 'string' || str.length === 0) {
    return 0;
  }

  let width = 0;

  for (const segment of Array.from(str)) {
    const code = segment.codePointAt(0);
    if (code) {
      width += eastAsianWidth(code);
    }
  }

  return width;
}
