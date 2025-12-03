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

vi.mock('../../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: ({ text }: { text: string }) => (
    <Box>
      <Text>MarkdownDisplay: {text}</Text>
    </Box>
  ),
}));

vi.mock('../AnsiOutput.js', () => ({
  AnsiOutputText: ({ data }: { data: unknown }) => (
    <Box>
      <Text>AnsiOutputText: {JSON.stringify(data)}</Text>
    </Box>
  ),
}));

vi.mock('../shared/MaxSizedBox.js', () => ({
  MaxSizedBox: ({ children }: { children: React.ReactNode }) => (
    <Box>
      <Text>MaxSizedBox:</Text>
      {children}
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

describe('ToolResultDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUIState.mockReturnValue({ renderMarkdown: true });
    mockUseAlternateBuffer.mockReturnValue(false);
  });

  it('renders string result as markdown by default', () => {
    const { lastFrame } = render(
      <ToolResultDisplay resultDisplay="Some result" terminalWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders string result as plain text when renderOutputAsMarkdown is false', () => {
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="Some result"
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
    const ansiResult = {
      text: 'ansi content',
    };
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

  it('falls back to plain text if availableHeight is set and not in alternate buffer', () => {
    mockUseAlternateBuffer.mockReturnValue(false);
    // availableHeight calculation: 20 - 1 - 5 = 14 > 3
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="Some result"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
    );
    const output = lastFrame();

    // Should force renderOutputAsMarkdown to false
    expect(output).toMatchSnapshot();
  });

  it('keeps markdown if in alternate buffer even with availableHeight', () => {
    mockUseAlternateBuffer.mockReturnValue(true);
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay="Some result"
        terminalWidth={80}
        availableTerminalHeight={20}
        renderOutputAsMarkdown={true}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });
});
