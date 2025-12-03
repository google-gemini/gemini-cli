/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlainTextLength } from './InlineMarkdownRenderer.js';
import { describe, it, expect } from 'vitest';

describe('getPlainTextLength', () => {
  it.each([
    ['**Primary Go', 12],
    ['*Primary Go', 11],
    ['**Primary Go**', 10],
    ['*Primary Go*', 10],
    ['**', 2],
    ['*', 1],
    ['compile-time**', 14],
  ])(
    'should measure markdown text length correctly for "%s"',
    (input, expected) => {
      expect(getPlainTextLength(input)).toBe(expected);
    },
  );
});
