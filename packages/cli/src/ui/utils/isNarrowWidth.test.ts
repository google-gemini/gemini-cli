/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isNarrowWidth } from './isNarrowWidth.js';

describe('isNarrowWidth', () => {
  it('should return true for width less than 80', () => {
    expect(isNarrowWidth(79)).toBe(true);
    expect(isNarrowWidth(50)).toBe(true);
    expect(isNarrowWidth(1)).toBe(true);
    expect(isNarrowWidth(0)).toBe(true);
  });

  it('should return false for width equal to or greater than 80', () => {
    expect(isNarrowWidth(80)).toBe(false);
    expect(isNarrowWidth(81)).toBe(false);
    expect(isNarrowWidth(100)).toBe(false);
    expect(isNarrowWidth(120)).toBe(false);
    expect(isNarrowWidth(200)).toBe(false);
  });

  it('should handle boundary value at 80', () => {
    expect(isNarrowWidth(79)).toBe(true);
    expect(isNarrowWidth(80)).toBe(false);
  });

  it('should handle negative widths', () => {
    expect(isNarrowWidth(-1)).toBe(true);
    expect(isNarrowWidth(-100)).toBe(true);
  });

  it('should handle floating point widths', () => {
    expect(isNarrowWidth(79.9)).toBe(true);
    expect(isNarrowWidth(80.1)).toBe(false);
    expect(isNarrowWidth(79.5)).toBe(true);
    expect(isNarrowWidth(80.0)).toBe(false);
  });

  it('should handle very large widths', () => {
    expect(isNarrowWidth(1000)).toBe(false);
    expect(isNarrowWidth(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('should handle edge case of zero width', () => {
    expect(isNarrowWidth(0)).toBe(true);
  });
});
