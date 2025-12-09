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
  /*
   * Testing strategy for ToolResultDisplay
   *
   * Partition on `resultDisplay`:
   *    - type: string, object (diff), object (ansi), object (todos)
   *    - string length: small, > MAXIMUM_RESULT_DISPLAY_CHARACTERS
   *    - string content: single line, multi-line
   *
   * Partition on `renderOutputAsMarkdown`: true, false
   *
   * Partition on `availableTerminalHeight` (affects display):
   *    - undefined
   *    - sufficient height for content
   *    - insufficient height (triggers manual truncation if !isAlternateBuffer)
   *
   * Partition on `isAlternateBuffer` (affects manual truncation):
   *    - true (alternate buffer active)
   *    - false (inline rendering)
   *
   * Cartesian product of interest:
   *    - String content + !AlernateBuffer + Insufficient Height -> Manual Line Truncation
   *    - String content + AlternateBuffer + Insufficient Height -> No Truncation
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUIState.mockReturnValue({ renderMarkdown: true });
    mockUseAlternateBuffer.mockReturnValue(false);
  });

  // Coverage: String Results
  it('renders string result as markdown by default', () => {
    const { lastFrame } = render(
      <ToolResultDisplay resultDisplay="Some result" terminalWidth={80} />,
    );
    expect(lastFrame()).toMatchSnapshot();
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
    expect(lastFrame()).toMatchSnapshot();
  });

  // Coverage: Truncation logic (Boundary Analysis)
  it(
    'truncates very long string results (character limit)',
    { timeout: 20000 },
    () => {
      const longString = 'a'.repeat(1000005);
      const { lastFrame } = render(
        <ToolResultDisplay
          resultDisplay={longString}
          terminalWidth={80}
          availableTerminalHeight={20}
        />,
      );
      // Should show truncated text + "..."
      expect(lastFrame()).toMatchSnapshot();
    },
  );

  it('manually truncates multi-line strings when availableHeight is exceeded (!isAlternateBuffer)', () => {
    /*
     * Partition:
     * - content: multi-line (20 lines)
     * - availableHeight: 10 (effective ~4 lines)
     * - isAlternateBuffer: false
     * Expected: Truncation
     */
    mockUseAlternateBuffer.mockReturnValue(false);
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    const multiLineString = lines.join('\n');

    // availableHeight logic: 10 - 1 (STATIC) - 5 (RESERVED) = 4 lines.
    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={multiLineString}
        terminalWidth={80}
        availableTerminalHeight={10}
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    // Manual verification of boundary
    expect(output).toContain('Line 20'); // Should show end
    expect(output).toContain('...'); // Should show indicator
    expect(output).not.toContain('Line 1\n'); // Should truncate start
  });

  it('accounts for visual line wrapping when truncating', () => {
    /*
     * Partition:
     * - content: 3 lines, but middle line is very long
     * - terminalWidth: 10 (narrow)
     * - availableHeight: 5
     *
     * Line 1: "Short" (1 visual)
     * Line 2: "12345678901234567890" (20 chars / 6 effective width -> ~4 visual lines)
     * Line 3: "End" (1 visual)
     *
     * Total needed: 1 + 4 + 1 = 6 visual lines.
     * Available: 5.
     * Expected: Line 1 should be truncated because Line 2 + Line 3 take ~5 lines.
     * Actually, padding is 4. childWidth = 10 - 4 = 6.
     * Line 2 (20 chars) / 6 = 3.33 -> 4 visual lines.
     * Line 3 (3 chars) / 6 = 0.5 -> 1 visual line.
     * Total for L2+L3 = 5.
     * So L2 and L3 should fit exactly in 5 lines. L1 should be dropped.
     */
    mockUseAlternateBuffer.mockReturnValue(false);
    const line2 = '12345678901234567890'; // 20 chars
    const text = `Start\n${line2}\nEnd`;

    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={text}
        terminalWidth={10} // childWidth = 6
        availableTerminalHeight={5 + 1 + 5} // 5 effective lines (height - 1 - 5)
      />,
    );
    const output = lastFrame();

    expect(output).toContain('...');
    expect(output).toContain('End');
    // The long line is wrapped in the output, so we check for parts of it
    expect(output).toContain('123456');
    expect(output).toContain('789012');
    expect(output).not.toContain('Start');
  });

  it('does NOT truncate lines when in alternate buffer', () => {
    /*
     * Partition:
     * - content: multi-line
     * - availableHeight: exceeded
     * - isAlternateBuffer: true
     * Expected: No truncation
     */
    mockUseAlternateBuffer.mockReturnValue(true);
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    const multiLineString = lines.join('\n');

    const { lastFrame } = render(
      <ToolResultDisplay
        resultDisplay={multiLineString}
        terminalWidth={80}
        availableTerminalHeight={10} // Would trigger truncation if not alt buffer
      />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    // Verify no truncation
    expect(output).toContain('Line 1'); // Should be present
  });

  // Coverage: Object Results types
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
    expect(lastFrame()).toMatchSnapshot();
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
    expect(lastFrame()).toMatchSnapshot();
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
    expect(lastFrame()).toMatchSnapshot();
  });
});
