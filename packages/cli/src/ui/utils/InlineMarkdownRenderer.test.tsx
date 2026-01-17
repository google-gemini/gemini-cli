/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlainTextLength, RenderInline } from './InlineMarkdownRenderer.js';
import { describe, it, expect } from 'vitest';
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

describe('RenderInline - URL handling with trailing punctuation', () => {
  it('should strip trailing periods from URLs', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Visit https://example.com." />,
    );
    expect(lastFrame()).toContain('https://example.com');
    expect(lastFrame()).not.toContain('https://example.com.');
  });

  it('should strip trailing commas from URLs', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Check https://google.com," />,
    );
    expect(lastFrame()).toContain('https://google.com');
    expect(lastFrame()).not.toContain('https://google.com,');
  });

  it('should strip trailing Chinese punctuation (full stop)', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Visit https://github.com。" />,
    );
    expect(lastFrame()).toContain('https://github.com');
    expect(lastFrame()).not.toContain('https://github.com。');
  });

  it('should strip trailing Chinese punctuation (comma)', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Check https://example.com，" />,
    );
    expect(lastFrame()).toContain('https://example.com');
    expect(lastFrame()).not.toContain('https://example.com，');
  });

  it('should strip multiple trailing punctuation marks', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Visit https://example.com.!)" />,
    );
    expect(lastFrame()).toContain('https://example.com');
    expect(lastFrame()).not.toContain('https://example.com.!)');
  });

  it('should strip trailing question mark from URLs', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Go to https://example.com?" />,
    );
    expect(lastFrame()).toContain('https://example.com');
    expect(lastFrame()).not.toContain('https://example.com?');
  });

  it('should strip trailing Chinese question mark', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Visit https://example.com？" />,
    );
    expect(lastFrame()).toContain('https://example.com');
    expect(lastFrame()).not.toContain('https://example.com？');
  });

  it('should not strip punctuation that is part of the URL', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="https://example.com/path?query=value" />,
    );
    expect(lastFrame()).toContain('https://example.com/path?query=value');
  });

  it('should handle URLs without trailing punctuation', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Visit https://example.com" />,
    );
    expect(lastFrame()).toContain('https://example.com');
  });

  it('should preserve balanced parentheses in URLs (Wikipedia style)', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="See https://en.wikipedia.org/wiki/State_(computer_science)" />,
    );
    expect(lastFrame()).toContain(
      'https://en.wikipedia.org/wiki/State_(computer_science)',
    );
  });

  it('should strip extra punctuation but preserve balanced parentheses', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Check https://en.wikipedia.org/wiki/State_(computer_science))." />,
    );
    expect(lastFrame()).toContain(
      'https://en.wikipedia.org/wiki/State_(computer_science)',
    );
    expect(lastFrame()).not.toContain(
      'https://en.wikipedia.org/wiki/State_(computer_science)).',
    );
  });

  it('should render URLs in mixed content', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Check out https://github.com/google-gemini/gemini-cli。 This is great!" />,
    );
    expect(lastFrame()).toContain(
      'https://github.com/google-gemini/gemini-cli',
    );
    expect(lastFrame()).not.toContain(
      'https://github.com/google-gemini/gemini-cli。',
    );
  });
});
