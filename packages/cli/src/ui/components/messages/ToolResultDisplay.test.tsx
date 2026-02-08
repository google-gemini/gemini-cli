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

  // Helper to use renderWithProviders
  const render = (ui: React.ReactElement) => renderWithProviders(ui);

  it('uses ScrollableList for ANSI output in alternate buffer mode', () => {
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
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={10}
      />,
    );
    const output = lastFrame();

    expect(output).toContain(content);
  });

  it('uses Scrollable for non-ANSI output in alternate buffer mode', () => {
    mockUseAlternateBuffer.mockReturnValue(true);
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="**Markdown content**"
        terminalWidth={80}
        maxLines={10}
      />,
    );
    const output = lastFrame();

    // With real components, we check for the content itself
    expect(output).toContain('Markdown content');
  });

  it('passes hasFocus prop to scrollable components', () => {
    mockUseAlternateBuffer.mockReturnValue(true);
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="Some result"
        terminalWidth={80}
        hasFocus={true}
      />,
    );

    expect(lastFrame()).toContain('Some result');
  });

  it('renders string result as markdown by default', () => {
    const { lastFrame } = render(
      <ToolResultDisplay resultDisplay="**Some result**" terminalWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders string result as plain text when renderOutputAsMarkdown is false', () => {
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={false}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('truncates very long string results', { timeout: 20000 }, () => {
    const longString = 'a'.repeat(1000005);
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={longString}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders file diff result', () => {
    const diffResult = {
      fileDiff: 'diff content',
      fileName: 'test.ts',
    };
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={diffResult}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders ANSI output result', () => {
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
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={ansiResult as unknown as AnsiOutput}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders nothing for todos result', () => {
    const todoResult = {
      todos: [],
    };
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={todoResult}
        terminalWidth={80}
        availableTerminalHeight={20}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('does not fall back to plain text if availableHeight is set and not in alternate buffer', () => {
    mockUseAlternateBuffer.mockReturnValue(false);
    // availableHeight calculation: 20 - 1 - 5 = 14 > 3
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
    );
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });

  it('keeps markdown if in alternate buffer even with availableHeight', () => {
    mockUseAlternateBuffer.mockReturnValue(true);
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="**Some result**"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('truncates ANSI output when maxLines is provided', () => {
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
    ];
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        availableTerminalHeight={20}
        maxLines={2}
      />,
    );
    const output = lastFrame();

    expect(output).not.toContain('Line 1');
    expect(output).toContain('Line 2');
    expect(output).toContain('Line 3');
  });

  it('truncates ANSI output when maxLines is provided, even if availableTerminalHeight is undefined', () => {
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
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={25}
        availableTerminalHeight={undefined}
      />,
    );
    const output = lastFrame();

    // It SHOULD truncate to 25 lines because maxLines is provided
    expect(output).not.toContain('Line 1');
    expect(output).toContain('Line 50');
  });
});
