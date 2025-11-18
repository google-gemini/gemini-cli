/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import type { ToolMessageProps } from './ToolMessage.js';
import { ToolMessage } from './ToolMessage.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { Text } from 'ink';
import { StreamingContext } from '../../contexts/StreamingContext.js';
import type { AnsiOutput, Config } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SHELL_TOOL_NAME } from '@google/gemini-cli-core';
import { SHELL_COMMAND_NAME } from '../../constants.js';

vi.mock('../TerminalOutput.js', () => ({
  TerminalOutput: function MockTerminalOutput({
    cursor,
  }: {
    cursor: { x: number; y: number } | null;
  }) {
    return (
      <Text>
        MockCursor:({cursor?.x},{cursor?.y})
      </Text>
    );
  },
}));

vi.mock('../AnsiOutput.js', () => ({
  AnsiOutputText: function MockAnsiOutputText({ data }: { data: AnsiOutput }) {
    // Simple serialization for snapshot stability
    const serialized = data
      .map((line) => line.map((token) => token.text || '').join(''))
      .join('\n');
    return <Text>MockAnsiOutput:{serialized}</Text>;
  },
}));

// Mock child components or utilities if they are complex or have side effects
vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: ({
    nonRespondingDisplay,
  }: {
    nonRespondingDisplay?: string;
  }) => {
    const streamingState = React.useContext(StreamingContext)!;
    if (streamingState === StreamingState.Responding) {
      return <Text>MockRespondingSpinner</Text>;
    }
    return nonRespondingDisplay ? <Text>{nonRespondingDisplay}</Text> : null;
  },
}));
vi.mock('./DiffRenderer.js', () => ({
  DiffRenderer: function MockDiffRenderer({
    diffContent,
  }: {
    diffContent: string;
  }) {
    return <Text>MockDiff:{diffContent}</Text>;
  },
}));
vi.mock('../../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: function MockMarkdownDisplay({ text }: { text: string }) {
    return <Text>MockMarkdown:{text}</Text>;
  },
}));

describe('<ToolMessage />', () => {
  const baseProps: ToolMessageProps = {
    callId: 'tool-123',
    name: 'test-tool',
    description: 'A tool for testing',
    resultDisplay: 'Test result',
    status: ToolCallStatus.Success,
    terminalWidth: 80,
    confirmationDetails: undefined,
    emphasis: 'medium',
    isFirst: true,
    borderColor: 'green',
    borderDimColor: false,
  };

  const mockSetEmbeddedShellFocused = vi.fn();
  const uiActions = {
    setEmbeddedShellFocused: mockSetEmbeddedShellFocused,
  };

  // Helper to render with context
  const renderWithContext = (
    ui: React.ReactElement,
    streamingState: StreamingState,
  ) => {
    const contextValue: StreamingState = streamingState;
    return renderWithProviders(
      <StreamingContext.Provider value={contextValue}>
        {ui}
      </StreamingContext.Provider>,
      { uiActions },
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders basic tool information', () => {
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} />,
      StreamingState.Idle,
    );
    const output = lastFrame();
    expect(output).toContain('✓'); // Success indicator
    expect(output).toContain('test-tool');
    expect(output).toContain('A tool for testing');
    expect(output).toContain('MockMarkdown:Test result');
  });

  describe('ToolStatusIndicator rendering', () => {
    it('shows ✓ for Success status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Success} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('✓');
    });

    it('shows o for Pending status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Pending} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('o');
    });

    it('shows ? for Confirming status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Confirming} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('?');
    });

    it('shows - for Canceled status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Canceled} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('-');
    });

    it('shows x for Error status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Error} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('x');
    });

    it('shows paused spinner for Executing status when streamingState is Idle', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('⊷');
      expect(lastFrame()).not.toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✓');
    });

    it('shows paused spinner for Executing status when streamingState is WaitingForConfirmation', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.WaitingForConfirmation,
      );
      expect(lastFrame()).toContain('⊷');
      expect(lastFrame()).not.toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✓');
    });

    it('shows MockRespondingSpinner for Executing status when streamingState is Responding', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.Responding, // Simulate app still responding
      );
      expect(lastFrame()).toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✓');
    });
  });

  it('renders DiffRenderer for diff results', () => {
    const diffResult = {
      fileDiff: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
      fileName: 'file.txt',
      originalContent: 'old',
      newContent: 'new',
    };
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} resultDisplay={diffResult} />,
      StreamingState.Idle,
    );
    // Check that the output contains the MockDiff content as part of the whole message
    expect(lastFrame()).toMatch(/MockDiff:--- a\/file\.txt/);
  });

  it('renders emphasis correctly', () => {
    const { lastFrame: highEmphasisFrame } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="high" />,
      StreamingState.Idle,
    );
    // Check for trailing indicator or specific color if applicable (Colors are not easily testable here)
    expect(highEmphasisFrame()).toContain('←'); // Trailing indicator for high emphasis

    const { lastFrame: lowEmphasisFrame } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="low" />,
      StreamingState.Idle,
    );
    // For low emphasis, the name and description might be dimmed (check for dimColor if possible)
    // This is harder to assert directly in text output without color checks.
    // We can at least ensure it doesn't have the high emphasis indicator.
    expect(lowEmphasisFrame()).not.toContain('←');
  });

  it('renders AnsiOutputText for AnsiOutput results', () => {
    const ansiResult: AnsiOutput = [
      [
        {
          text: 'hello',
          fg: '#ffffff',
          bg: '#000000',
          bold: false,
          italic: false,
          underline: false,
          dim: false,
          inverse: false,
        },
      ],
    ];
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} resultDisplay={ansiResult} />,
      StreamingState.Idle,
    );
    expect(lastFrame()).toContain('MockAnsiOutput:hello');
  });

  describe('interactive shell focus', () => {
    const shellProps: ToolMessageProps = {
      ...baseProps,
      name: SHELL_COMMAND_NAME,
      status: ToolCallStatus.Executing,
      config: {
        getEnableInteractiveShell: () => true,
      } as unknown as Config,
    };

    it('clicks inside the shell area sets focus to true', async () => {
      const { stdin, lastFrame } = renderWithProviders(
        <ToolMessage {...shellProps} />,
        {
          mouseEventsEnabled: true,
          uiActions,
        },
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('A tool for testing'); // Wait for render
      });

      await act(async () => {
        // Simulate a click inside the shell box
        // Assuming the box starts at (0,0) because it's the root component in the test
        stdin.write('\x1b[<0;2;2M'); // Click at column 2, row 2 (1-based)
      });

      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(true);
      });
    });

    it('handles focus for SHELL_TOOL_NAME (core shell tool)', async () => {
      const coreShellProps: ToolMessageProps = {
        ...shellProps,
        name: SHELL_TOOL_NAME,
      };

      const { stdin, lastFrame } = renderWithProviders(
        <ToolMessage {...coreShellProps} />,
        {
          mouseEventsEnabled: true,
          uiActions,
        },
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('A tool for testing');
      });

      await act(async () => {
        stdin.write('\x1b[<0;2;2M');
      });

      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(true);
      });
    });

    it('clicks outside the shell area sets focus to false', async () => {
      const { stdin, lastFrame } = renderWithProviders(
        <ToolMessage {...shellProps} />,
        {
          mouseEventsEnabled: true,
          uiActions,
        },
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('A tool for testing'); // Wait for render
      });

      await act(async () => {
        // Simulate a click outside the shell box
        stdin.write('\x1b[<0;100;100M'); // Click at column 100, row 100
      });

      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(false);
      });
    });

    it('resets focus when shell finishes', async () => {
      let updateStatus: (s: ToolCallStatus) => void = () => {};

      const Wrapper = () => {
        const [status, setStatus] = React.useState(ToolCallStatus.Executing);
        updateStatus = setStatus;
        return (
          <ToolMessage
            {...shellProps}
            status={status}
            embeddedShellFocused={true}
            activeShellPtyId={1}
            ptyId={1}
          />
        );
      };

      const { lastFrame } = renderWithContext(<Wrapper />, StreamingState.Idle);

      // Verify it is initially focused
      await waitFor(() => {
        expect(lastFrame()).toContain('(Focused)');
      });

      // Now update status to Success
      await act(async () => {
        updateStatus(ToolCallStatus.Success);
      });

      // Should call setEmbeddedShellFocused(false) because isThisShellFocused became false
      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(false);
      });
    });
  });
});
