/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { RenderInline, getPlainTextLength } from './InlineMarkdownRenderer.js';
import stringWidth from 'string-width';

const stripAnsi = (str: string) =>
  str.replace(
    // This regex is designed to strip ANSI escape codes from the output of the
    // rendering library. These codes control terminal colors and formatting.
    // The `no-control-regex` rule is disabled because ANSI escape sequences,
    // by definition, begin with control characters like `\u001b`.
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]?[0-9]{1,4}(?:;[0-9]{0,4})*[0-9A-ORZcf-nqry=><]/g,
    '',
  );

describe('RenderInline', () => {
  it('renders a markdown https link as text', () => {
    const { lastFrame } = render(
      <RenderInline text="This is a [link](https://example.com)." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a markdown javascript URI as plain text', () => {
    const { lastFrame } = render(
      <RenderInline text="[malicious link](javascript:alert(1))" />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toBe('malicious link (javascript:alert(1))');
  });

  it('renders a markdown mailto link as text', () => {
    const { lastFrame } = render(
      <RenderInline text="Contact us at [email](mailto:team@example.com)." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a markdown ftp link as text', () => {
    const { lastFrame } = render(
      <RenderInline text="Download from [ftp](ftp://example.com/file)." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a bare http link as text with its URL', () => {
    const { lastFrame } = render(
      <RenderInline text="Go to https://example.com for more info." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a bare ftp link as text with its URL', () => {
    const { lastFrame } = render(
      <RenderInline text="Go to ftp://example.com/file for the file." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a bare mailto link as text with its URL', () => {
    const { lastFrame } = render(
      <RenderInline text="Contact mailto:team@example.com for details." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders bold text correctly', () => {
    const { lastFrame } = render(<RenderInline text="This is **bold**." />);
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders italic text correctly', () => {
    const { lastFrame } = render(<RenderInline text="This is *italic*." />);
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders strikethrough text correctly', () => {
    const { lastFrame } = render(
      <RenderInline text="This is ~~strikethrough~~." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders inline code correctly', () => {
    const { lastFrame } = render(<RenderInline text="This is `code`." />);
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders underline text correctly', () => {
    const { lastFrame } = render(
      <RenderInline text="This is <u>underline</u>." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
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

  it('should handle empty strings', () => {
    expect(getPlainTextLength('')).toBe(0);
  });

  it('should handle strings with only markdown', () => {
    expect(getPlainTextLength('**bold**')).toBe(4);
  });
});

describe('RenderInline Edge Cases', () => {
  it('handles mixed and adjacent markdown types', () => {
    const { lastFrame } = render(
      <RenderInline text="**bold**[link](https://a.com)_italic_" />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('handles empty markdown content', () => {
    const { lastFrame } = render(
      <RenderInline text="A []() link and **** bold." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('handles unclosed markdown as plain text', () => {
    const { lastFrame } = render(
      <RenderInline text="This is an **unclosed bold tag." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toBe('This is an **unclosed bold tag.');
  });
});
