/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type Mock, beforeEach } from 'vitest';
import { MarkdownDisplay } from './MarkdownDisplay.js';
import { LoadedSettings } from '../../config/settings.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { useIsScreenReaderEnabled } from 'ink';

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

describe('<MarkdownDisplay />', () => {
  const baseProps = {
    isPending: false,
    terminalWidth: 80,
    availableTerminalHeight: 40,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);
  });

  it('renders nothing for empty text', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <MarkdownDisplay {...baseProps} text="" />,
    );
    expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
    unmount();
  });

  it('renders a simple paragraph', async () => {
    const text = 'Hello, world.';
    const { lastFrame, unmount } = await renderWithProviders(
      <MarkdownDisplay {...baseProps} text={text} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  const lineEndings = [
    { name: 'Windows', eol: '\r\n' },
    { name: 'Unix', eol: '\n' },
  ];

  describe.each(lineEndings)('with $name line endings', ({ eol }) => {
    it('renders headers with correct levels', async () => {
      const text = `
# Header 1
## Header 2
### Header 3
#### Header 4
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders a fenced code block with a language', async () => {
      const text = '```javascript\nconst x = 1;\nconsole.log(x);\n```'.replace(
        /\n/g,
        eol,
      );
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders a fenced code block without a language', async () => {
      const text = '```\nplain text\n```'.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('handles unclosed (pending) code blocks', async () => {
      const text = '```typescript\nlet y = 2;'.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} isPending={true} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders unordered lists with different markers', async () => {
      const text = `
- item A
* item B
+ item C
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders nested unordered lists', async () => {
      const text = `
* Level 1
  * Level 2
    * Level 3
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders ordered lists', async () => {
      const text = `
1. First item
2. Second item
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders horizontal rules', async () => {
      const text = `
Hello
---
World
***
Test
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders tables correctly', async () => {
      const text = `
| Header 1 | Header 2 |
|----------|:--------:|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('handles a table at the end of the input', async () => {
      const text = `
Some text before.
| A | B |
|---|
| 1 | 2 |`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('inserts a single space between paragraphs', async () => {
      const text = `Paragraph 1.

Paragraph 2.`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('correctly parses a mix of markdown elements', async () => {
      const text = `
# Main Title

Here is a paragraph.

- List item 1
- List item 2

\`\`\`
some code
\`\`\`

Another paragraph.
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('hides line numbers in code blocks when showLineNumbers is false', async () => {
      const text = '```javascript\nconst x = 1;\n```'.replace(/\n/g, eol);
      const settings = new LoadedSettings(
        { path: '', settings: {}, originalSettings: {} },
        { path: '', settings: {}, originalSettings: {} },
        {
          path: '',
          settings: { ui: { showLineNumbers: false } },
          originalSettings: { ui: { showLineNumbers: false } },
        },
        { path: '', settings: {}, originalSettings: {} },
        true,
        [],
      );

      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
        { settings },
      );
      expect(lastFrame()).toMatchSnapshot();
      expect(lastFrame()).not.toContain('1 const x = 1;');
      unmount();
    });

    it('shows line numbers in code blocks by default', async () => {
      const text = '```javascript\nconst x = 1;\n```'.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      expect(lastFrame()).toContain('1 const x = 1;');
      unmount();
    });

    it('renders tables as plain text in screenReader mode', async () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(true);
      const text = `
| Name | Value |
|------|-------|
| foo  | bar   |
| baz  | qux   |
`.replace(/\n/g, eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      const frame = lastFrame();
      // Plain-text pipe-separated output — no box-drawing characters
      expect(frame).toContain('Name | Value');
      expect(frame).toContain('--- | ---');
      expect(frame).toContain('foo | bar');
      expect(frame).toContain('baz | qux');
      expect(frame).not.toContain('┌');
      expect(frame).not.toContain('┬');
      unmount();
    });

    it('sanitizes ANSI escapes and markdown markers in screenReader table cells', async () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(true);
      const ansiRed = '\u001b[31m';
      const ansiReset = '\u001b[0m';
      const text = [
        `| **Header** | _Status_ |`,
        `|------------|----------|`,
        `| ${ansiRed}injected${ansiReset} | \`code\` |`,
      ].join(eol);
      const { lastFrame, unmount } = await renderWithProviders(
        <MarkdownDisplay {...baseProps} text={text} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('Header | Status');
      expect(frame).toContain('injected | code');
      expect(frame).not.toContain('\u001b[');
      expect(frame).not.toContain('**');
      expect(frame).not.toContain('_');
      expect(frame).not.toContain('`');
      unmount();
    });
  });
});
