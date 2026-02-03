/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Box, Text } from 'ink';
import type { AnsiOutput } from '@google/gemini-cli-core';

// Mock child components to simplify testing
vi.mock('./DiffRenderer.js', () => ({
  DiffRenderer: ({
    diffContent,
    filename,
  }: {
    diffContent: string;
    filename: string;
  }) => (
    <Box>
      <Text>
        DiffRenderer: {filename} - {diffContent}
      </Text>
    </Box>
  ),
}));

// Mock UIStateContext
const mockUseUIState = vi.fn();
vi.mock('../../contexts/UIStateContext.js', () => ({
  useUIState: () => mockUseUIState(),
}));

// Mock useAlternateBuffer
const mockUseAlternateBuffer = vi.fn();
vi.mock('../../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: () => mockUseAlternateBuffer(),
}));

// Mock useSettings
vi.mock('../../contexts/SettingsContext.js', () => ({
  useSettings: () => ({
    merged: {
      ui: {
        useAlternateBuffer: false,
      },
    },
  }),
}));

// Mock useOverflowActions
vi.mock('../../contexts/OverflowContext.js', () => ({
  useOverflowActions: () => ({
    addOverflowingId: vi.fn(),
    removeOverflowingId: vi.fn(),
  }),
  useOverflowState: () => ({
    overflowingIds: new Set(),
  }),
}));

// Mock Scrollable
vi.mock('../shared/Scrollable.js', () => ({
  Scrollable: ({ children }: { children: React.ReactNode }) => (
    <Box flexDirection="column">
      <Text>Scrollable Container</Text>
      {children}
    </Box>
  ),
}));

// Mock ScrollableList
vi.mock('../shared/ScrollableList.js', () => ({
  ScrollableList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
  }) => (
    <Box flexDirection="column">
      <Text>ScrollableList Container</Text>
      {data.map((item, index) => (
        <Box key={index}>{renderItem({ item, index })}</Box>
      ))}
    </Box>
  ),
}));

describe('ToolResultDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUIState.mockReturnValue({ renderMarkdown: true });
    mockUseAlternateBuffer.mockReturnValue(false);
  });

  it('uses ScrollableList for ANSI output in alternate buffer mode', () => {
    mockUseAlternateBuffer.mockReturnValue(true);
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
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={10}
      />,
    );
    const output = lastFrame();

    expect(output).toContain('ScrollableList Container');
    expect(output).toContain('ansi content');
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

    expect(output).toContain('Scrollable Container');
    expect(output).toContain('Markdown content');
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

  it('does not truncate ANSI output when availableTerminalHeight is undefined', () => {
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

    // In unconstrained mode, it should NOT truncate to 25 lines
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 50');
  });
});
