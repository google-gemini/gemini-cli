/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkdownDisplay } from './MarkdownDisplay.js';
import { LoadedSettings } from '../../config/settings.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('<MarkdownDisplay />', () => {
  const baseProps = {
    isPending: false,
    terminalWidth: 80,
    availableTerminalHeight: 40,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

  async function renderFrame(text: string) {
    const { lastFrame, unmount } = await renderWithProviders(
      <MarkdownDisplay {...baseProps} text={text} />,
    );
    try {
      return lastFrame();
    } finally {
      unmount();
    }
  }

  describe('fence boundaries', () => {
    it.each([
      'c++',
      'cpp',
      'c#',
      'objective-c',
      'javascript {title="demo.js"}',
      'javascript title="a.js"',
      '{r}',
      'gemini-test-unregistered-language',
    ])('preserves both code lines with info string %s', async (infoString) => {
      const frame = await renderFrame(
        [
          '```' + infoString,
          'const char* name = "*literal*";',
          'int value = 42;',
          '```',
          '',
          'AFTER',
        ].join('\n'),
      );
      expect(frame).toContain('const char* name = "*literal*";');
      expect(frame).toMatch(/\b1 +const char/);
      expect(frame).toMatch(/\b2 +int value = 42;/);
      expect(frame).not.toContain('`' + infoString);
      expect(frame.split('\n')).toContain('AFTER');
    });

    it('keeps a fence with an info string inside the code block', async () => {
      const frame = await renderFrame(
        '```text\nBEFORE_IN_BLOCK\n```javascript\nAFTER_IN_BLOCK\n```\n\nAFTER_BLOCK',
      );
      expect(frame).toContain('```javascript');
      expect(frame).toContain('AFTER_IN_BLOCK');
      expect(frame.split('\n')).toContain('AFTER_BLOCK');
    });

    it.each([false, true])(
      'renders a table before its following fence (blank line: %s)',
      async (blankLine) => {
        const table = '| Item | Size |\n| --- | --- |\n| FIRST_TABLE | 1 |';
        const code = '```text\nSECOND_CODE\n```';
        const frame = await renderFrame(
          table + (blankLine ? '\n\n' : '\n') + code,
        );
        expect(frame).toContain('FIRST_TABLE');
        expect(frame).toContain('SECOND_CODE');
        expect(frame.indexOf('FIRST_TABLE')).toBeLessThan(
          frame.indexOf('SECOND_CODE'),
        );
      },
    );

    it('preserves shorter fences inside a longer fence', async () => {
      const frame = await renderFrame(
        '````text\n```\nINNER_CODE\n```\n`````\t\nAFTER',
      );
      expect(frame.match(/```/g)).toHaveLength(2);
      expect(frame).toContain('INNER_CODE');
      expect(frame.split('\n')).toContain('AFTER');
    });

    it('requires the same marker when closing a tilde fence', async () => {
      const frame = await renderFrame('~~~text\n```\nINNER_CODE\n~~~\nAFTER');
      expect(frame).toContain('```');
      expect(frame).toContain('INNER_CODE');
      expect(frame.split('\n')).toContain('AFTER');
    });

    it('does not open a block for a line that starts with inline backticks', async () => {
      const frame = await renderFrame('```inline code```\nAFTER');
      expect(frame.split('\n')).toContain('AFTER');
    });
  });

  describe('blocks after a table', () => {
    it.each([
      ['header', '## NEXT_HEADER', 'NEXT_HEADER'],
      ['unordered list', '+   NEXT_BULLET', ' + NEXT_BULLET'],
      ['ordered list', '7.   NEXT_ITEM', ' 7. NEXT_ITEM'],
      ['horizontal rule', '***', '---'],
      ['plain text', 'NEXT_TEXT', 'NEXT_TEXT'],
      ['blank line then text', '\nNEXT_TEXT', 'NEXT_TEXT'],
    ])(
      'renders %s immediately after the table',
      async (_kind, input, expected) => {
        const table = '| A | B |\n| --- | --- |\n| 1 | 2 |';
        const frame = await renderFrame(`${table}\n${input}`);
        const [tableBottom, nextLine] = frame.trimEnd().split('\n').slice(-2);
        expect(tableBottom).toMatch(/^└[─┴]+┘$/);
        expect(nextLine).toBe(expected);
      },
    );
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
  });
});
