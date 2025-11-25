/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { formatCompactNumber } from './formatCompactNumber.js';

describe('formatCompactNumber', () => {
  it('returns numbers under 1000 as-is', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatCompactNumber(1000)).toBe('1K');
    expect(formatCompactNumber(1234)).toBe('1.23K');
    expect(formatCompactNumber(15000)).toBe('15K');
  });

  it('formats millions with M suffix', () => {
    expect(formatCompactNumber(1000000)).toBe('1M');
    expect(formatCompactNumber(1500000)).toBe('1.5M');
    expect(formatCompactNumber(1234567)).toBe('1.23M');
  });

  it('formats billions with B suffix', () => {
    expect(formatCompactNumber(1000000000)).toBe('1B');
    expect(formatCompactNumber(2345678901)).toBe('2.35B');
  });

  it('formats trillions with T suffix', () => {
    expect(formatCompactNumber(1000000000000)).toBe('1T');
    expect(formatCompactNumber(1234567890123)).toBe('1.23T');
  });

  it('removes trailing zeros', () => {
    expect(formatCompactNumber(1000)).toBe('1K');
    expect(formatCompactNumber(1500)).toBe('1.5K');
    expect(formatCompactNumber(1100)).toBe('1.1K');
  });
});
