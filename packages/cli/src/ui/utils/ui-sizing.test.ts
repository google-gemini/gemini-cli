/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { calculateMainAreaWidth } from './ui-sizing.js';

describe('ui-sizing', () => {
  describe('calculateMainAreaWidth', () => {
    it.each([
      // expected, width, altBuffer
      [80, 80, false],
      [79, 80, true],
      [100, 100, false],
      [99, 100, true],
    ])(
      'returns %s for width %s and altBuffer %s',
      (expected, width, altBuffer) => {
        expect(calculateMainAreaWidth(width, altBuffer)).toBe(expected);
      },
    );
  });
});
