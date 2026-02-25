/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Text } from 'ink';
import {
  parseInlineMarkdown,
  stripInlineMarkdown,
  RenderInline,
} from './InlineMarkdownRenderer.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('InlineMarkdownRenderer', () => {
  describe('parseInlineMarkdown', () => {
    it('returns a single text segment for plain text', () => {
      expect(parseInlineMarkdown('hello world')).toEqual([
        { type: 'text', content: 'hello world' },
      ]);
    });

    it('parses bold markers', () => {
      const segments = parseInlineMarkdown('some **bold** text');
      expect(segments).toEqual([
        { type: 'text', content: 'some ' },
        { type: 'bold', content: 'bold' },
        { type: 'text', content: ' text' },
      ]);
    });

    it('parses inline code with backticks', () => {
      const segments = parseInlineMarkdown('run `/help` now');
      expect(segments).toEqual([
        { type: 'text', content: 'run ' },
        { type: 'code', content: '/help' },
        { type: 'text', content: ' now' },
      ]);
    });

    it('parses double backtick code', () => {
      const segments = parseInlineMarkdown('use ``code`` here');
      expect(segments).toEqual([
        { type: 'text', content: 'use ' },
        { type: 'code', content: 'code' },
        { type: 'text', content: ' here' },
      ]);
    });

    it('parses strikethrough', () => {
      const segments = parseInlineMarkdown('~~removed~~');
      expect(segments).toEqual([{ type: 'strikethrough', content: 'removed' }]);
    });

    it('parses underline tags', () => {
      const segments = parseInlineMarkdown('<u>underlined</u>');
      expect(segments).toEqual([{ type: 'underline', content: 'underlined' }]);
    });

    it('parses markdown links', () => {
      const segments = parseInlineMarkdown('[click](https://example.com)');
      expect(segments).toEqual([
        { type: 'link', text: 'click', url: 'https://example.com' },
      ]);
    });

    it('parses bare URLs', () => {
      const segments = parseInlineMarkdown('visit https://example.com today');
      expect(segments).toEqual([
        { type: 'text', content: 'visit ' },
        { type: 'url', content: 'https://example.com' },
        { type: 'text', content: ' today' },
      ]);
    });

    it('parses multiple mixed markers', () => {
      const segments = parseInlineMarkdown('`/help` and **bold**');
      expect(segments).toEqual([
        { type: 'code', content: '/help' },
        { type: 'text', content: ' and ' },
        { type: 'bold', content: 'bold' },
      ]);
    });

    it('treats italic-like markers adjacent to word chars as text', () => {
      const segments = parseInlineMarkdown('a_name_b');
      expect(segments).toEqual([
        { type: 'text', content: 'a' },
        { type: 'text', content: '_name_' },
        { type: 'text', content: 'b' },
      ]);
    });
  });

  describe('stripInlineMarkdown', () => {
    it('returns plain text unchanged', () => {
      expect(stripInlineMarkdown('hello world')).toBe('hello world');
    });

    it('strips backticks from inline code', () => {
      expect(stripInlineMarkdown('`/help`')).toBe('/help');
      expect(stripInlineMarkdown('run `/help` now')).toBe('run /help now');
    });

    it('strips double backticks from inline code', () => {
      expect(stripInlineMarkdown('``code``')).toBe('code');
    });

    it('strips bold markers', () => {
      expect(stripInlineMarkdown('**bold**')).toBe('bold');
      expect(stripInlineMarkdown('some **bold** text')).toBe('some bold text');
    });

    it('strips strikethrough markers', () => {
      expect(stripInlineMarkdown('~~strike~~')).toBe('strike');
    });

    it('strips underline tags', () => {
      expect(stripInlineMarkdown('<u>underline</u>')).toBe('underline');
    });

    it('converts links to text with URL', () => {
      expect(stripInlineMarkdown('[click](https://example.com)')).toBe(
        'click (https://example.com)',
      );
    });

    it('preserves bare URLs', () => {
      expect(stripInlineMarkdown('visit https://example.com today')).toBe(
        'visit https://example.com today',
      );
    });

    it('handles multiple inline markers in one string', () => {
      expect(stripInlineMarkdown('`/help` and **bold** text')).toBe(
        '/help and bold text',
      );
    });
  });

  describe('RenderInline', () => {
    it('renders plain text correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="hello world" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('hello world');
      unmount();
    });

    it('renders bold text correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="some **bold** text" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders inline code correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="run `/help` now" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders italic text correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="*italic*" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders strikethrough text correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="~~removed~~" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders links correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="[click](https://example.com)" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders raw URLs correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="visit https://example.com" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders underline correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="<u>underlined</u>" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders mixed markdown correctly', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="`/help` and **bold** text" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('respects defaultColor prop', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Text>
          <RenderInline text="colored" defaultColor="#ff0000" />
        </Text>,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });
});
