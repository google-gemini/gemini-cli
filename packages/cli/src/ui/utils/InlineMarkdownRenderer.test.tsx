/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { RenderInline, getPlainTextLength } from './InlineMarkdownRenderer.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { Text } from 'ink';

describe('InlineMarkdownRenderer', () => {
  describe('getPlainTextLength', () => {
    it.each([
      ['**Primary Go', 12],
      ['*Primary Go', 11],
      ['**Primary Go**', 10],
      ['*Primary Go*', 10],
      ['**', 2],
      ['*', 1],
      ['compile-time**', 14],
      ['$\\rightarrow$', 1],
      ['Sign Out $\\rightarrow$ Sign In', 18],
      ['[Google](https://google.com)', 27],
      ['Preceding [Link](url)', 20],
    ])(
      'should measure markdown text length correctly for "%s"',
      (input, expected) => {
        expect(getPlainTextLength(input)).toBe(expected);
      },
    );
  });

  describe('<RenderInline />', () => {
    it('renders LaTeX rightarrow correctly', () => {
      const text = 'Sign Out $\\rightarrow$ Sign In';
      const { lastFrame } = renderWithProviders(
        <Text>
          <RenderInline text={text} />
        </Text>,
      );
      expect(lastFrame()).toContain('Sign Out → Sign In');
    });

    it('renders other LaTeX arrows correctly', () => {
      const text = '$\\leftarrow$ $\\uparrow$ $\\downarrow$';
      const { lastFrame } = renderWithProviders(
        <Text>
          <RenderInline text={text} />
        </Text>,
      );
      expect(lastFrame()).toContain('← ↑ ↓');
    });
  });
});
