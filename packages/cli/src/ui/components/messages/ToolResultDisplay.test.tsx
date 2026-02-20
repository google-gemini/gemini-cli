/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnsiOutput } from '@google/gemini-cli-core';

// Mock UIStateContext partially
const mockUseUIState = vi.fn();
vi.mock('../../contexts/UIStateContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../contexts/UIStateContext.js')>();
  return {
    ...actual,
    useUIState: () => mockUseUIState(),
  };
});

// Mock useAlternateBuffer
const mockUseAlternateBuffer = vi.fn();
vi.mock('../../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: () => mockUseAlternateBuffer(),
}));

describe('ToolResultDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUIState.mockReturnValue({ renderMarkdown: true });
    mockUseAlternateBuffer.mockReturnValue(false);
  });

  it('uses ScrollableList for ANSI output in alternate buffer mode', async () => {
    mockUseAlternateBuffer.mockReturnValue(true);
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
        },
      ],
    ];
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={10}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain(content);
    unmount();
  });

  it('uses Scrollable for non-ANSI output in alternate buffer mode', async () => {
    mockUseAlternateBuffer.mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Markdown content**"
        terminalWidth={80}
        maxLines={10}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    // With real components, we check for the content itself
    expect(output).toContain('Markdown content');
    unmount();
  });

  it('passes hasFocus prop to scrollable components', async () => {
    mockUseAlternateBuffer.mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay="Some result"
        terminalWidth={80}
        hasFocus={true}
      />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Some result');
    unmount();
  });

  it('renders string result as markdown by default', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay resultDisplay="**Some result**" terminalWidth={80} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders string result as plain text when renderOutputAsMarkdown is false', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={false}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('truncates very long string results', { timeout: 20000 }, async () => {
    const longString = 'a'.repeat(1000005);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={longString}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
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
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={diffResult}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
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
        },
      ],
    ];
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult as unknown as AnsiOutput}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
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
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={todoResult}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
    );
    await waitUntilReady();
    const output = lastFrame({ allowEmpty: true });

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('does not fall back to plain text if availableHeight is set and not in alternate buffer', async () => {
    mockUseAlternateBuffer.mockReturnValue(false);
    // availableHeight calculation: 20 - 1 - 5 = 14 > 3
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('keeps markdown if in alternate buffer even with availableHeight', async () => {
    mockUseAlternateBuffer.mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
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
        },
      ],
    ];
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        availableTerminalHeight={20}
        maxLines={3}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).not.toContain('Line 1');
    expect(output).not.toContain('Line 2');
    expect(output).not.toContain('Line 3');
    expect(output).toContain('Line 4');
    expect(output).toContain('Line 5');
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
      },
    ]);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={25}
        availableTerminalHeight={undefined}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    // It SHOULD truncate to 25 lines because maxLines is provided
    expect(output).not.toContain('Line 1');
    expect(output).toContain('Line 50');
    unmount();
  });
});
