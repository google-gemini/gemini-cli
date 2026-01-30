/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getPlainTextLength,
  stripTrailingPunctuation,
} from './InlineMarkdownRenderer.js';
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

describe('stripTrailingPunctuation', () => {
  it.each([
    // ASCII punctuation
    ['https://example.com.', 'https://example.com', '.'],
    ['https://example.com,', 'https://example.com', ','],
    ['https://example.com!', 'https://example.com', '!'],
    ['https://example.com?', 'https://example.com', '?'],
    ['https://example.com;', 'https://example.com', ';'],
    ['https://example.com:', 'https://example.com', ':'],
    // Chinese/CJK punctuation
    ['https://example.com。', 'https://example.com', '。'],
    ['https://example.com，', 'https://example.com', '，'],
    ['https://example.com！', 'https://example.com', '！'],
    ['https://example.com？', 'https://example.com', '？'],
    ['https://example.com；', 'https://example.com', '；'],
    // Multiple trailing punctuation
    ['https://example.com..', 'https://example.com', '..'],
    ['https://example.com。。', 'https://example.com', '。。'],
    // No trailing punctuation
    ['https://example.com', 'https://example.com', ''],
    ['https://example.com/path', 'https://example.com/path', ''],
    // Balanced parentheses (Wikipedia URLs)
    [
      'https://en.wikipedia.org/wiki/Foo_(bar)',
      'https://en.wikipedia.org/wiki/Foo_(bar)',
      '',
    ],
    [
      'https://en.wikipedia.org/wiki/State_(computer_science)',
      'https://en.wikipedia.org/wiki/State_(computer_science)',
      '',
    ],
    // Unbalanced parentheses should be stripped
    [
      'https://en.wikipedia.org/wiki/Foo_(bar))',
      'https://en.wikipedia.org/wiki/Foo_(bar)',
      ')',
    ],
    // URL with query params ending in punctuation
    ['https://example.com?q=test.', 'https://example.com?q=test', '.'],
  ])(
    'should strip trailing punctuation from "%s"',
    (input, expectedUrl, expectedTrailing) => {
      const result = stripTrailingPunctuation(input);
      expect(result.url).toBe(expectedUrl);
      expect(result.trailing).toBe(expectedTrailing);
    },
  );
});
