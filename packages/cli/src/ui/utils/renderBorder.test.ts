/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  renderBorder,
  renderNodeToOutput,
  safeRepeat,
} from './renderBorder.js';

describe('renderBorder', () => {
  it('returns empty string and does not throw for negative counts (-1, -5, -10)', () => {
    expect(renderBorder(-1)).toBe('');
    expect(renderBorder(-5)).toBe('');
    expect(renderBorder(-10)).toBe('');
  });

  it('returns empty string for zero count (0)', () => {
    expect(renderBorder(0)).toBe('');
  });

  it('floors fractional counts safely without errors (1.7, 0.5, 1.5, 0.7)', () => {
    expect(renderBorder(1.7)).toBe('─');
    expect(renderBorder(0.5)).toBe('');
    expect(renderBorder(1.5)).toBe('─');
    expect(renderBorder(0.7)).toBe('');
    expect(renderBorder(3.9)).toBe('───');
  });

  it('repeats default border character for positive integer counts', () => {
    expect(renderBorder(1)).toBe('─');
    expect(renderBorder(3)).toBe('───');
    expect(renderBorder(5)).toBe('─────');
  });

  it('supports custom border characters', () => {
    expect(renderBorder(3, '=')).toBe('===');
    expect(renderBorder(4, '═')).toBe('════');
    expect(renderBorder(-1, '=')).toBe('');
    expect(renderBorder(0, '=')).toBe('');
    expect(renderBorder(2.8, '*')).toBe('**');
  });

  it('handles non-finite values safely without throwing', () => {
    expect(renderBorder(NaN)).toBe('');
    expect(renderBorder(Infinity)).toBe('');
    expect(renderBorder(-Infinity)).toBe('');
  });
});

describe('renderNodeToOutput', () => {
  it('returns empty string and does not throw for negative counts (-1, -5)', () => {
    expect(renderNodeToOutput(-1)).toBe('');
    expect(renderNodeToOutput(-5)).toBe('');
  });

  it('returns empty string for zero count (0)', () => {
    expect(renderNodeToOutput(0)).toBe('');
  });

  it('floors fractional counts safely without errors (1.7, 0.5)', () => {
    expect(renderNodeToOutput(1.7)).toBe('─');
    expect(renderNodeToOutput(0.5)).toBe('');
  });
});

describe('safeRepeat', () => {
  it('returns empty string for negative counts', () => {
    expect(safeRepeat('a', -1)).toBe('');
    expect(safeRepeat('x', -5)).toBe('');
  });

  it('returns empty string for zero count', () => {
    expect(safeRepeat('a', 0)).toBe('');
  });

  it('floors fractional counts safely', () => {
    expect(safeRepeat('a', 1.7)).toBe('a');
    expect(safeRepeat('a', 0.5)).toBe('');
    expect(safeRepeat('abc', 2.9)).toBe('abcabc');
  });

  it('handles non-finite numbers safely', () => {
    expect(safeRepeat('a', NaN)).toBe('');
    expect(safeRepeat('a', Infinity)).toBe('');
    expect(safeRepeat('a', -Infinity)).toBe('');
  });
});
