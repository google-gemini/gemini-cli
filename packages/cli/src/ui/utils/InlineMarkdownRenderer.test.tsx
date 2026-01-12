/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getPlainTextLength, RenderInline } from './InlineMarkdownRenderer.js';
import { renderWithProviders } from '../../test-utils/render.js';

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

describe('RenderInline', () => {
  it('renders URLs correctly without trailing punctuation', () => {
    const text = 'Check https://google.com.';
    const { lastFrame } = renderWithProviders(<RenderInline text={text} />);
    expect(lastFrame()).toContain('https://google.com');
  });
  it('renders URLs correctly without trailing Chinese punctuation', () => {
    const text = 'Check https://google.com。';
    const { lastFrame } = renderWithProviders(<RenderInline text={text} />);
    expect(lastFrame()).toContain('https://google.com');
  });

  it('renders paths correctly', () => {
    const text = 'File is path/to/file.txt';
    const { lastFrame } = renderWithProviders(<RenderInline text={text} />);
    expect(lastFrame()).toContain('path/to/file.txt');
  });

  it('renders paths with dots in directory correctly', () => {
    const text = 'File is path/to/dir.with.dots/file.txt';
    const { lastFrame } = renderWithProviders(<RenderInline text={text} />);
    expect(lastFrame()).toContain('path/to/dir.with.dots/file.txt');
  });

  it('handles ReDoS URL input gracefully (performance check)', () => {
    const longString = 'https://' + 'a'.repeat(5000) + '.';
    const start = Date.now();
    renderWithProviders(<RenderInline text={longString} />);
    const end = Date.now();
    expect(end - start).toBeLessThan(500); // Should be very fast (< 10ms usually)
  });

  it('handles ReDoS Path input gracefully (performance check)', () => {
    // Create a path-like string that would cause ReDoS in old regex
    // [\w./-]+ overlapping with \.
    const longString = 'path/to/' + '.'.repeat(5000);
    const start = Date.now();
    renderWithProviders(<RenderInline text={longString} />);
    const end = Date.now();
    expect(end - start).toBeLessThan(500);
  });
});
