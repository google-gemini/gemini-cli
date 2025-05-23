/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { ToolMessage, ToolMessageProps } from './ToolMessage.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { Text } from 'ink';

// Mock child components or utilities if they are complex or have side effects
vi.mock('ink-spinner', () => ({
  default: () => <Text>MockSpinner</Text>,
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
    availableTerminalHeight: 20,
    confirmationDetails: undefined,
    emphasis: 'medium',
    streamingState: StreamingState.Idle,
  };

  it('renders basic tool information', () => {
    const { lastFrame } = render(<ToolMessage {...baseProps} />);
    const output = lastFrame();
    expect(output).toContain('✔'); // Success indicator
    expect(output).toContain('test-tool');
    expect(output).toContain('A tool for testing');
    expect(output).toContain('MockMarkdown:Test result');
  });

  describe('ToolStatusIndicator rendering', () => {
    it('shows ✔ for Success status', () => {
      const { lastFrame } = render(
        <ToolMessage {...baseProps} status={ToolCallStatus.Success} />,
      );
      expect(lastFrame()).toContain('✔');
    });

    it('shows o for Pending status', () => {
      const { lastFrame } = render(
        <ToolMessage {...baseProps} status={ToolCallStatus.Pending} />,
      );
      expect(lastFrame()).toContain('o');
    });

    it('shows ? for Confirming status', () => {
      const { lastFrame } = render(
        <ToolMessage {...baseProps} status={ToolCallStatus.Confirming} />,
      );
      expect(lastFrame()).toContain('?');
    });

    it('shows - for Canceled status', () => {
      const { lastFrame } = render(
        <ToolMessage {...baseProps} status={ToolCallStatus.Canceled} />,
      );
      expect(lastFrame()).toContain('-');
    });

    it('shows x for Error status', () => {
      const { lastFrame } = render(
        <ToolMessage {...baseProps} status={ToolCallStatus.Error} />,
      );
      expect(lastFrame()).toContain('x');
    });

    it('shows MockSpinner for Executing status when streamingState is Idle', () => {
      const { lastFrame } = render(
        <ToolMessage
          {...baseProps}
          status={ToolCallStatus.Executing}
          streamingState={StreamingState.Idle}
        />,
      );
      expect(lastFrame()).toContain('MockSpinner');
      expect(lastFrame()).not.toContain('✔');
    });

    it('shows MockSpinner for Executing status when streamingState is undefined (default behavior)', () => {
      const { lastFrame } = render(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
      );
      expect(lastFrame()).toContain('MockSpinner');
      expect(lastFrame()).not.toContain('✔');
    });

    it('shows ✔ (paused/confirmed look) for Executing status when streamingState is Responding', () => {
      // This is the key change from the commit: if the overall app is still responding
      // (e.g., waiting for other tool confirmations), an already confirmed and executing tool
      // should show a static checkmark to avoid spinner flicker.
      const { lastFrame } = render(
        <ToolMessage
          {...baseProps}
          status={ToolCallStatus.Executing}
          streamingState={StreamingState.Responding} // Simulate app still responding
        />,
      );
      expect(lastFrame()).toContain('✔'); // Should be a checkmark, not spinner
      expect(lastFrame()).not.toContain('MockSpinner');
    });
  });

  it('renders DiffRenderer for diff results', () => {
    const diffResult = {
      fileDiff: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
      fileName: 'file.txt',
    };
    const { lastFrame } = render(
      <ToolMessage {...baseProps} resultDisplay={diffResult} />,
    );
    // Check that the output contains the MockDiff content as part of the whole message
    expect(lastFrame()).toMatch(/MockDiff:--- a\/file\.txt/);
  });

  it('renders emphasis correctly', () => {
    const { lastFrame: highEmphasisFrame } = render(
      <ToolMessage {...baseProps} emphasis="high" />,
    );
    // Check for trailing indicator or specific color if applicable (Colors are not easily testable here)
    expect(highEmphasisFrame()).toContain('←'); // Trailing indicator for high emphasis

    const { lastFrame: lowEmphasisFrame } = render(
      <ToolMessage {...baseProps} emphasis="low" />,
    );
    // For low emphasis, the name and description might be dimmed (check for dimColor if possible)
    // This is harder to assert directly in text output without color checks.
    // We can at least ensure it doesn't have the high emphasis indicator.
    expect(lowEmphasisFrame()).not.toContain('←');
  });
});
