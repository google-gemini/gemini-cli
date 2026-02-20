/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import {
  ScrollableList,
  type ScrollableListRef,
} from '../shared/ScrollableList.js';
import { Box, Text } from 'ink';
import { act, useRef, useEffect } from 'react';
import { waitFor } from '../../../test-utils/async.js';
import { SHELL_COMMAND_NAME } from '../../constants.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

// Mock child components that might be complex
vi.mock('../TerminalOutput.js', () => ({
  TerminalOutput: () => <Text>MockTerminalOutput</Text>,
}));

vi.mock('../AnsiOutput.js', () => ({
  AnsiOutputText: () => <Text>MockAnsiOutput</Text>,
}));

vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: () => <Text>MockRespondingSpinner</Text>,
}));

vi.mock('./DiffRenderer.js', () => ({
  DiffRenderer: () => <Text>MockDiff</Text>,
}));

vi.mock('../../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: ({ text }: { text: string }) => <Text>{text}</Text>,
}));

describe('ToolMessage Sticky Header Regression', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createToolCall = (id: string, name: string, resultPrefix: string) => ({
    callId: id,
    name,
    description: `Description for ${name}`,
    resultDisplay: Array.from(
      { length: 10 },
      (_, i) => `${resultPrefix}-${String(i + 1).padStart(2, '0')}`,
    ).join('\n'),
    status: CoreToolCallStatus.Success,
    confirmationDetails: undefined,
    renderOutputAsMarkdown: false,
  });

  it('verifies that multiple ToolMessages in a ToolGroupMessage in a ScrollableList have sticky headers', async () => {
    const toolCalls = [
      createToolCall('1', 'tool-1', 'c1'),
      createToolCall('2', 'tool-2', 'c2'),
    ];

    const terminalWidth = 80;
    const terminalHeight = 5;

    let listRef: ScrollableListRef<string> | null = null;

    const TestComponent = () => {
      const internalRef = useRef<ScrollableListRef<string>>(null);
      useEffect(() => {
        listRef = internalRef.current;
      }, []);

      return (
        <ScrollableList
          ref={internalRef}
          data={['item1']}
          renderItem={() => (
            <ToolGroupMessage
              item={{ id: 1, type: 'tool_group', tools: toolCalls }}
              toolCalls={toolCalls}
              terminalWidth={terminalWidth - 2} // Account for ScrollableList padding
            />
          )}
          estimatedItemHeight={() => 30}
          keyExtractor={(item) => item}
          hasFocus={true}
        />
      );
    };

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Box height={terminalHeight}>
        <TestComponent />
      </Box>,
      {
        width: terminalWidth,
        uiState: { terminalWidth },
      },
    );
    await waitUntilReady();

    // Initial state: tool-1 should be visible
    await waitFor(() => {
      expect(lastFrame()).toContain('tool-1');
    });
    expect(lastFrame()).toContain('Description for tool-1');
    expect(lastFrame()).toMatchSnapshot();

    // Scroll down so that tool-1's header should be stuck
    await act(async () => {
      listRef?.scrollBy(5);
    });
    await waitUntilReady();

    // tool-1 header should still be visible because it is sticky
    await waitFor(() => {
      expect(lastFrame()).toContain('tool-1');
    });
    expect(lastFrame()).toContain('Description for tool-1');
    // Content lines 1-4 should be scrolled off
    expect(lastFrame()).not.toContain('c1-01');
    expect(lastFrame()).not.toContain('c1-04');
    // Line 6 and 7 should be visible (terminalHeight=5 means only 2 lines of content show below 3-line header)
    expect(lastFrame()).toContain('c1-06');
    expect(lastFrame()).toContain('c1-07');
    expect(lastFrame()).toMatchSnapshot();

    // Scroll further so tool-1 is completely gone and tool-2's header should be stuck
    await act(async () => {
      listRef?.scrollBy(17);
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain('tool-2');
    });
    expect(lastFrame()).toContain('Description for tool-2');
    // tool-1 should be gone now (both header and content)
    expect(lastFrame()).not.toContain('tool-1');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('verifies that ShellToolMessage in a ToolGroupMessage in a ScrollableList has sticky headers', async () => {
    const toolCalls = [
      {
        ...createToolCall('1', SHELL_COMMAND_NAME, 'shell'),
        status: CoreToolCallStatus.Success,
      },
    ];

    const terminalWidth = 80;
    const terminalHeight = 5;

    let listRef: ScrollableListRef<string> | null = null;

    const TestComponent = () => {
      const internalRef = useRef<ScrollableListRef<string>>(null);
      useEffect(() => {
        listRef = internalRef.current;
      }, []);

      return (
        <ScrollableList
          ref={internalRef}
          data={['item1']}
          renderItem={() => (
            <ToolGroupMessage
              item={{ id: 1, type: 'tool_group', tools: toolCalls }}
              toolCalls={toolCalls}
              terminalWidth={terminalWidth - 2}
            />
          )}
          estimatedItemHeight={() => 30}
          keyExtractor={(item) => item}
          hasFocus={true}
        />
      );
    };

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Box height={terminalHeight}>
        <TestComponent />
      </Box>,
      {
        width: terminalWidth,
        uiState: { terminalWidth },
      },
    );
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain(SHELL_COMMAND_NAME);
    });
    expect(lastFrame()).toMatchSnapshot();

    // Scroll down
    await act(async () => {
      listRef?.scrollBy(5);
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain(SHELL_COMMAND_NAME);
    });
    expect(lastFrame()).toContain('shell-06');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
