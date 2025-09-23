/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { RenderInline, getPlainTextLength } from './InlineMarkdownRenderer.js';
import stringWidth from 'string-width';
import { Text } from 'ink';
import type { Mock } from 'vitest';
import { theme } from '../semantic-colors.js';
import React from 'react';

// Mock the 'ink' library to inspect props passed to the Text component.
vi.mock('ink');

describe('RenderInline', () => {
  beforeEach(() => {
    // Clear mock calls before each test
    (Text as Mock).mockClear();
  });

  it('renders a markdown link as styled text and its URL', () => {
    render(<RenderInline text="[a link](https://example.com)" />);

    // Expect one parent <Text> call.
    expect((Text as Mock).mock.calls).toHaveLength(1);
    const textCall = (Text as Mock).mock.calls.at(0);
    const children = React.Children.toArray(textCall?.at(0).children);

    // The parent's children should be the link text and the linkComponent.
    expect(children).toHaveLength(2);
    expect(children.at(0)).toBe('a link');

    // The second child is the linkComponent, which is another <Text> component.
    const linkComponent = children[1] as React.ReactElement<{
      color: string;
      children: React.ReactNode[];
    }>;
    expect(linkComponent.type).toBe(Text);
    expect(linkComponent.props.color).toBe(theme.text.link);
    expect(linkComponent.props.children).toEqual([
      ' (',
      'https://example.com',
      ')',
    ]);
  });

  it('renders a markdown javascript URI as plain text for security', () => {
    render(<RenderInline text="[a malicious link](javascript:alert(1))" />);

    // Expect only one call to <Text>, rendering the whole thing as plain text.
    expect((Text as Mock).mock.calls).toHaveLength(1);

    const textCall = (Text as Mock).mock.calls.at(0);
    expect(textCall?.at(0).children).toContain('a malicious link');
    expect(textCall?.at(0).children).toContain(' (javascript:alert(1))');
    // Crucially, the children should not contain a nested React element.
    const children = React.Children.toArray(textCall?.at(0).children);
    expect(children.some((child) => typeof child !== 'string')).toBe(false);
  });

  it('renders bold text with correct styling', () => {
    render(<RenderInline text="This is **some bold text**." />);
    const boldCalls = (Text as Mock).mock.calls.filter(
      (call) => call?.at(0).bold === true,
    );
    expect(boldCalls).toHaveLength(1);
    expect(boldCalls.at(0)?.at(0).children).toBe('some bold text');
  });

  it('renders italic text with correct styling', () => {
    render(<RenderInline text="This is *some italic text*." />);
    const italicCalls = (Text as Mock).mock.calls.filter(
      (call) => call[0].italic === true,
    );
    expect(italicCalls).toHaveLength(1);
    expect(italicCalls.at(0)?.at(0).children).toBe('some italic text');
  });

  it('renders strikethrough text with correct styling', () => {
    render(<RenderInline text="This is ~~some strikethrough text~~." />);
    const strikethroughCalls = (Text as Mock).mock.calls.filter(
      (call) => call[0].strikethrough === true,
    );
    expect(strikethroughCalls).toHaveLength(1);
    expect(strikethroughCalls.at(0)?.at(0).children).toBe(
      'some strikethrough text',
    );
  });

  it('renders underline text with correct styling', () => {
    render(<RenderInline text="This is <u>some underline text</u>." />);
    const underlineCalls = (Text as Mock).mock.calls.filter(
      (call) => call[0].underline === true,
    );
    expect(underlineCalls).toHaveLength(1);
    expect(underlineCalls.at(0)?.at(0).children).toBe('some underline text');
  });

  it('renders inline code with correct styling', () => {
    render(<RenderInline text="This is `some inline code`." />);
    const codeCalls = (Text as Mock).mock.calls.filter(
      (call) => call[0].color === theme.text.accent,
    );
    expect(codeCalls).toHaveLength(1);
    expect(codeCalls.at(0)?.at(0).children).toBe('some inline code');
  });
});

describe('getPlainTextLength', () => {
  it('should return the correct length for plain text', () => {
    const text = 'Hello, world!';
    expect(getPlainTextLength(text)).toBe(stringWidth(text));
  });

  it('should strip all markdown to calculate the correct length', () => {
    const markdownText = 'This is **bold** and a [link](https://a.com). `code`';
    const plainText = 'This is bold and a link. code';
    const expectedLength = stringWidth(plainText);
    expect(getPlainTextLength(markdownText)).toBe(expectedLength);
  });
});
