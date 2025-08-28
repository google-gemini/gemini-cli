/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkdownDisplay } from './MarkdownDisplay.js';
import { LoadedSettings } from '../../config/settings.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { EOL } from 'node:os';

describe('<MarkdownDisplay />', () => {
  const baseProps = {
    isPending: false,
    terminalWidth: 80,
    availableTerminalHeight: 40,
  };

  const mockSettings = new LoadedSettings(
    { path: '', settings: {} },
    { path: '', settings: {} },
    { path: '', settings: {} },
    { path: '', settings: {} },
    [],
    true,
    new Set(),
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing for empty text', () => {
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text="" />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a simple paragraph', () => {
    const text = 'Hello, world.';
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders headers with correct levels', () => {
    const text = `
# Header 1
## Header 2
### Header 3
#### Header 4
`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a fenced code block with a language', () => {
    const text = '```javascript\nconst x = 1;\nconsole.log(x);\n```'.replace(
      /\n/g,
      EOL,
    );
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a fenced code block without a language', () => {
    const text = '```\nplain text\n```'.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles unclosed (pending) code blocks', () => {
    const text = '```typescript\nlet y = 2;'.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} isPending={true} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders unordered lists with different markers', () => {
    const text = `
- item A
* item B
+ item C
`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders nested unordered lists', () => {
    const text = `
* Level 1
  * Level 2
    * Level 3
`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders ordered lists', () => {
    const text = `
1. First item
2. Second item
`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders horizontal rules', () => {
    const text = `
Hello
---
World
***
Test
`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders tables correctly', () => {
    const text = `
| Header 1 | Header 2 |
|----------|:--------:|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles a table at the end of the input', () => {
    const text = `
Some text before.
| A | B |
|---|
| 1 | 2 |`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('inserts a single space between paragraphs', () => {
    const text = `Paragraph 1.

Paragraph 2.`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('correctly parses a mix of markdown elements', () => {
    const text = `
# Main Title

Here is a paragraph.

- List item 1
- List item 2

\`\`\`
some code
\`\`\`

Another paragraph.
`.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('hides line numbers in code blocks when showLineNumbers is false', () => {
    const text = '```javascript\nconst x = 1;\n```'.replace(/\n/g, EOL);
    const settings = new LoadedSettings(
      { path: '', settings: {} },
      { path: '', settings: {} },
      { path: '', settings: { ui: { showLineNumbers: false } } },
      { path: '', settings: {} },
      [],
      true,
      new Set(),
    );

    const { lastFrame } = render(
      <SettingsContext.Provider value={settings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).not.toContain(' 1 ');
  });

  it('shows line numbers in code blocks by default', () => {
    const text = '```javascript\nconst x = 1;\n```'.replace(/\n/g, EOL);
    const { lastFrame } = render(
      <SettingsContext.Provider value={mockSettings}>
        <MarkdownDisplay {...baseProps} text={text} />
      </SettingsContext.Provider>,
    );
    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).toContain(' 1 ');
  });
});
