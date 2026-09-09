/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { lerp } from './math.js';

describe('math', () => {
  describe('lerp', () => {
    it.each([
      [0, 10, 0, 0],
      [0, 10, 1, 10],
      [0, 10, 0.5, 5],
      [10, 20, 0.5, 15],
      [-10, 10, 0.5, 0],
      [0, 10, 2, 20],
      [0, 10, -1, -10],
    ])('lerp(%d, %d, %d) should return %d', (start, end, t, expected) => {
      expect(lerp(start, end, t)).toBe(expected);
    });
  });
});
