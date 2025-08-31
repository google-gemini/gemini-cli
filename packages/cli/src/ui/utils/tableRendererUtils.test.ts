/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  extractPrefixByDisplayWidth,
  splitContentIntoEqualWidthLines,
} from './tableRendererUtils.js';

describe('extractPrefixByDisplayWidth', () => {
  it('should return prefix and remaining part correctly', () => {
    const { prefix, remainingPart } = extractPrefixByDisplayWidth(
      'This is a sample text',
      5,
    );
    expect(prefix).toBe('This ');
    expect(remainingPart).toBe('is a sample text');
  });

  it('should return everything in prefix if width is higher than string width', () => {
    const { prefix, remainingPart } = extractPrefixByDisplayWidth(
      'Test this',
      10,
    );
    expect(prefix).toBe('Test this');
    expect(remainingPart).toBe('');
  });
});

describe('splitContentIntoEqualWidthLines', () => {
  it('should split content into provided no of lines with each string having provided width', () => {
    const text = 'This is a sample content';
    let lines = splitContentIntoEqualWidthLines(text, 5, 5);
    expect(lines).toEqual(['This ', 'is a ', 'sampl', 'e con', 'te...']);
    lines = splitContentIntoEqualWidthLines(text, 10, 5);
    expect(lines).toEqual([
      'This is a ',
      'sample con',
      'tent      ',
      '          ',
      '          ',
    ]);
  });
});
