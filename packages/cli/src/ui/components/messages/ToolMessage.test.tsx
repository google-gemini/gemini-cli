/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { ToolMessage, ToolMessageProps } from './ToolMessage.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { Text } from 'ink';
import { StreamingContext } from '../../contexts/StreamingContext.js';

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

// Helper to render with context
const renderWithContext = (
  ui: React.ReactElement,
  streamingState: StreamingState,
) => {
  const contextValue: StreamingState = streamingState;
  return render(
    <StreamingContext.Provider value={contextValue}>
      {ui}
    </StreamingContext.Provider>,
  );
};

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
  };

  it('renders basic tool information', () => {
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} />,
      StreamingState.Idle,
    );
    const output = lastFrame();
    expect(output).toContain('✔'); // Success indicator
    expect(output).toContain('test-tool');
    expect(output).toContain('A tool for testing');
    expect(output).toContain('MockMarkdown:Test result');
  });

  describe('ToolStatusIndicator rendering', () => {
    it('shows ✔ for Success status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Success} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('✔');
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
      expect(lastFrame()).not.toContain('✔');
    });

    it('shows paused spinner for Executing status when streamingState is WaitingForConfirmation', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.WaitingForConfirmation,
      );
      expect(lastFrame()).toContain('⊷');
      expect(lastFrame()).not.toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✔');
    });

    it('shows MockRespondingSpinner for Executing status when streamingState is Responding', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.Responding, // Simulate app still responding
      );
      expect(lastFrame()).toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✔');
    });
  });

  // Tests for the ToolInfo component refactoring
  describe('ToolInfo component layout changes', () => {
    it('renders tool name with space prefix as namePrefix', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} name="my-tool" />,
        StreamingState.Idle,
      );
      const output = lastFrame();
      // The namePrefix should be "my-tool " (name + space)
      expect(output).toContain('my-tool ');
    });

    it('handles different tool name lengths for namePrefix calculation', () => {
      const shortName = 'ls';
      const longName = 'very-long-tool-name';

      const { lastFrame: shortFrame } = renderWithContext(
        <ToolMessage {...baseProps} name={shortName} />,
        StreamingState.Idle,
      );
      const { lastFrame: longFrame } = renderWithContext(
        <ToolMessage {...baseProps} name={longName} />,
        StreamingState.Idle,
      );

      // Both should render with space suffix
      expect(shortFrame()).toContain('ls ');
      expect(longFrame()).toContain('very-long-tool-name ');
    });

    it('renders name and description separately in new layout structure', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          name="tool1"
          description="This is a description that can wrap"
        />,
        StreamingState.Idle,
      );
      const output = lastFrame();
      // Both name and description should be present
      expect(output).toContain('tool1 ');
      expect(output).toContain('This is a description that can wrap');
    });

    it('displays short descriptions fully without truncation', () => {
      const shortDescription = 'A short tool description';
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          description={shortDescription}
          terminalWidth={80}
        />,
        StreamingState.Idle,
      );
      const output = lastFrame();
      expect(output).toContain(shortDescription);
      expect(output).not.toContain('...');
    });

    it('displays medium-length descriptions with wrapping', () => {
      const mediumDescription =
        'This is a longer description that should wrap across multiple lines but still display fully without being truncated by the smart limiting logic';
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          description={mediumDescription}
          terminalWidth={80}
        />,
        StreamingState.Idle,
      );
      const output = lastFrame();
      expect(output).toContain('This is a longer description');
      expect(output).toContain('logic');
      expect(output).not.toContain('...');
    });

    it('truncates extremely long descriptions to prevent layout issues', () => {
      const baseAvailableWidth = 80 - 2 - 3 - 'test-tool '.length - 2; // ~65 chars
      const maxReasonableLength = baseAvailableWidth * 8; // ~520 chars
      const baseDescription = 'A'.repeat(maxReasonableLength + 50);
      const uniqueEnding = 'UNIQUE_ENDING_MARKER';
      const extremelyLongDescription = baseDescription + uniqueEnding;

      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          description={extremelyLongDescription}
          terminalWidth={80}
        />,
        StreamingState.Idle,
      );
      const output = lastFrame();
      expect(output).toContain('AAA');
      expect(output).toContain('...');
      expect(output).not.toContain('UNIQUE_ENDING_MARKER');
    });

    it('calculates truncation based on terminal width', () => {
      const longDescription = 'A'.repeat(1000);

      // Test with narrow terminal
      const { lastFrame: narrowFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          description={longDescription}
          terminalWidth={40}
        />,
        StreamingState.Idle,
      );

      // Test with wide terminal
      const { lastFrame: wideFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          description={longDescription}
          terminalWidth={120}
        />,
        StreamingState.Idle,
      );

      const narrowOutput = narrowFrame();
      const wideOutput = wideFrame();

      expect(narrowOutput).toContain('...');
      expect(wideOutput).toContain('...');
      expect(wideOutput.length).toBeGreaterThan(narrowOutput.length);
    });
  });

  it('renders DiffRenderer for diff results', () => {
    const diffResult = {
      fileDiff: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
      fileName: 'file.txt',
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
});
