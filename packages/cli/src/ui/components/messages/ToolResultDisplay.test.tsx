/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import { describe, it, expect, vi } from 'vitest';
import { makeFakeConfig, type AnsiOutput } from '@google/gemini-cli-core';

describe('ToolResultDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses ScrollableList for ANSI output in alternate buffer mode', async () => {
    const content = 'ansi content';
    const ansiResult: AnsiOutput = [
      [
        {
          text: content,
          fg: 'red',
          bg: 'black',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
          isUninitialized: false,
        },
      ],
    ];
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={10}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: true }),
        settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain(content);
    unmount();
  });

  it('uses Scrollable for non-ANSI output in alternate buffer mode', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Markdown content**"
        terminalWidth={80}
        maxLines={10}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: true }),
        settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    // With real components, we check for the content itself
    expect(output).toContain('Markdown content');
    unmount();
  });

  it('passes hasFocus prop to scrollable components', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay="Some result"
        terminalWidth={80}
        hasFocus={true}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: true }),
        settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Some result');
    unmount();
  });

  it('renders string result as markdown by default', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay resultDisplay="**Some result**" terminalWidth={80} />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders string result as plain text when renderOutputAsMarkdown is false', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={false}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        uiState: { constrainHeight: true },
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('truncates very long string results', { timeout: 20000 }, async () => {
    const longString = 'a'.repeat(1000005);
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={longString}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        uiState: { constrainHeight: true },
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders file diff result', async () => {
    const diffResult = {
      fileDiff: 'diff content',
      fileName: 'test.ts',
    };
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={diffResult}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders ANSI output result', async () => {
    const ansiResult: AnsiOutput = [
      [
        {
          text: 'ansi content',
          fg: 'red',
          bg: 'black',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
          isUninitialized: false,
        },
      ],
    ];
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult as unknown as AnsiOutput}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders nothing for todos result', async () => {
    const todoResult = {
      todos: [],
    };
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={todoResult}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame({ allowEmpty: true });

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('does not fall back to plain text if availableHeight is set and not in alternate buffer', async () => {
    // availableHeight calculation: 20 - 1 - 5 = 14 > 3
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        uiState: { constrainHeight: true },
      },
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('keeps markdown if in alternate buffer even with availableHeight', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: true }),
        settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('truncates ANSI output when maxLines is provided', async () => {
    const ansiResult: AnsiOutput = [
      [
        {
          text: 'Line 1',
          fg: '',
          bg: '',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
          isUninitialized: false,
        },
      ],
      [
        {
          text: 'Line 2',
          fg: '',
          bg: '',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
          isUninitialized: false,
        },
      ],
      [
        {
          text: 'Line 3',
          fg: '',
          bg: '',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
          isUninitialized: false,
        },
      ],
      [
        {
          text: 'Line 4',
          fg: '',
          bg: '',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
          isUninitialized: false,
        },
      ],
      [
        {
          text: 'Line 5',
          fg: '',
          bg: '',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
          isUninitialized: false,
        },
      ],
    ];
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        availableTerminalHeight={20}
        maxLines={3}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        uiState: { constrainHeight: true },
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).not.toContain('Line 1');
    expect(output).not.toContain('Line 2');
    expect(output).not.toContain('Line 3');
    expect(output).toContain('Line 4');
    expect(output).toContain('Line 5');
    expect(output).toContain('hidden');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('truncates ANSI output when maxLines is provided, even if availableTerminalHeight is undefined', async () => {
    const ansiResult: AnsiOutput = Array.from({ length: 50 }, (_, i) => [
      {
        text: `Line ${i + 1}`,
        fg: '',
        bg: '',
        bold: false,
        italic: false,
        underline: false,
        dim: false,
        inverse: false,
        isUninitialized: false,
      },
    ]);
    const renderResult = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={25}
        availableTerminalHeight={undefined}
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        uiState: { constrainHeight: true },
      },
    );
    const { waitUntilReady, unmount } = renderResult;
    await waitUntilReady();

    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('stays scrolled to the bottom when lines are incrementally added', async () => {
    const createAnsiLine = (text: string) => [
      {
        text,
        fg: '',
        bg: '',
        bold: false,
        italic: false,
        underline: false,
        dim: false,
        inverse: false,
        isUninitialized: false,
      },
    ];

    let currentLines: AnsiOutput = [];

    // Start with 3 lines, max lines 5. It should fit without scrolling.
    for (let i = 1; i <= 3; i++) {
      currentLines.push(createAnsiLine(`Line ${i}`));
    }

    const renderResult = await renderWithProviders(
      <ToolResultDisplay
        resultDisplay={currentLines}
        terminalWidth={80}
        maxLines={5}
        availableTerminalHeight={5}
        overflowDirection="top"
      />,
      {
        config: makeFakeConfig({ useAlternateBuffer: false }),
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        uiState: { constrainHeight: true, terminalHeight: 10 },
      },
    );

    const { waitUntilReady, rerender, lastFrame, unmount } = renderResult;
    await waitUntilReady();

    // Verify initial render has the first 3 lines
    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 3');

    // Incrementally add lines up to 8. Max lines is 5.
    // So by the end, it should only show lines 4-8.
    for (let i = 4; i <= 8; i++) {
      currentLines = [...currentLines, createAnsiLine(`Line ${i}`)];
      rerender(
        <ToolResultDisplay
          resultDisplay={currentLines}
          terminalWidth={80}
          maxLines={5}
          availableTerminalHeight={5}
          overflowDirection="top"
        />,
      );
      // Wait for the new line to be rendered
      await waitFor(() => {
        expect(lastFrame()).toContain(`Line ${i}`);
      });
    }

    await waitUntilReady();
    const output = lastFrame();

    // The component should have automatically scrolled to the bottom.
    // Lines 1, 2, 3, 4 should be scrolled out of view.
    expect(output).not.toContain('Line 1');
    expect(output).not.toContain('Line 2');
    expect(output).not.toContain('Line 3');
    expect(output).not.toContain('Line 4');
    // Lines 5, 6, 7, 8 should be visible along with the truncation indicator.
    expect(output).toContain('hidden');
    expect(output).toContain('Line 5');
    expect(output).toContain('Line 8');

    expect(output).toMatchSnapshot();

    unmount();
  });
});
