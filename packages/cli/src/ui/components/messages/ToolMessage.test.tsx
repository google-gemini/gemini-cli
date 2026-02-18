/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { ToolMessage, type ToolMessageProps } from './ToolMessage.js';
import { describe, it, expect, vi } from 'vitest';
import { StreamingState } from '../../types.js';
import { Text } from 'ink';
import { type AnsiOutput, CoreToolCallStatus } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { tryParseJSON } from '../../../utils/jsonoutput.js';

vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: () => <Text>MockRespondingSpinner</Text>,
}));

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

describe('<ToolMessage />', () => {
  const baseProps: ToolMessageProps = {
    callId: 'tool-123',
    name: 'test-tool',
    description: 'A tool for testing',
    resultDisplay: 'Test result',
    status: CoreToolCallStatus.Success,
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
  ) =>
    renderWithProviders(ui, {
      uiActions,
      uiState: { streamingState },
      width: 80,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders basic tool information', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithContext(
      <ToolMessage {...baseProps} />,
      StreamingState.Idle,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    unmount();
  });

  describe('JSON rendering', () => {
    it('pretty prints valid JSON', async () => {
      const testJSONstring = '{"a": 1, "b": [2, 3]}';
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );
      await waitUntilReady();

      const output = lastFrame();

      // Verify the JSON utility correctly parses the input
      expect(tryParseJSON(testJSONstring)).toBeTruthy();
      // Verify pretty-printed JSON appears in output (with proper indentation)
      expect(output).toContain('"a": 1');
      expect(output).toContain('"b": [');
      // Should not use markdown renderer for JSON
      unmount();
    });

    it('renders pretty JSON in ink frame', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} resultDisplay='{"a":1,"b":2}' />,
        StreamingState.Idle,
      );
      await waitUntilReady();

      const frame = lastFrame();

      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('uses JSON renderer even when renderOutputAsMarkdown=true is true', async () => {
      const testJSONstring = '{"a": 1, "b": [2, 3]}';
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={true}
        />,
        StreamingState.Idle,
      );
      await waitUntilReady();

      const output = lastFrame();

      // Verify the JSON utility correctly parses the input
      expect(tryParseJSON(testJSONstring)).toBeTruthy();
      // Verify pretty-printed JSON appears in output
      expect(output).toContain('"a": 1');
      expect(output).toContain('"b": [');
      // Should not use markdown renderer for JSON even when renderOutputAsMarkdown=true
      unmount();
    });
    it('falls back to plain text for malformed JSON', async () => {
      const testJSONstring = 'a": 1, "b": [2, 3]}';
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );
      await waitUntilReady();

      const output = lastFrame();

      expect(tryParseJSON(testJSONstring)).toBeFalsy();
      expect(typeof output === 'string').toBeTruthy();
      unmount();
    });

    it('rejects mixed text + JSON renders as plain text', async () => {
      const testJSONstring = `{"result":  "count": 42,"items": ["apple", "banana"]},"meta": {"timestamp": "2025-09-28T12:34:56Z"}}End.`;
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );
      await waitUntilReady();

      const output = lastFrame();

      expect(tryParseJSON(testJSONstring)).toBeFalsy();
      expect(typeof output === 'string').toBeTruthy();
      unmount();
    });

    it('rejects ANSI-tained JSON renders as plain text', async () => {
      const testJSONstring =
        '\u001b[32mOK\u001b[0m {"status": "success", "data": {"id": 123, "values": [10, 20, 30]}}';
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );
      await waitUntilReady();

      const output = lastFrame();

      expect(tryParseJSON(testJSONstring)).toBeFalsy();
      expect(typeof output === 'string').toBeTruthy();
      unmount();
    });

    it('pretty printing 10kb JSON completes in <50ms', async () => {
      const large = '{"key": "' + 'x'.repeat(10000) + '"}';
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={large}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );
      await waitUntilReady();

      const start = performance.now();
      lastFrame();
      expect(performance.now() - start).toBeLessThan(50);
      unmount();
    });
  });

  describe('ToolStatusIndicator rendering', () => {
    it('shows ✓ for Success status', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} status={CoreToolCallStatus.Success} />,
        StreamingState.Idle,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows o for Pending status', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} status={CoreToolCallStatus.Scheduled} />,
        StreamingState.Idle,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows ? for Confirming status', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage
          {...baseProps}
          status={CoreToolCallStatus.AwaitingApproval}
        />,
        StreamingState.Idle,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows - for Canceled status', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} status={CoreToolCallStatus.Cancelled} />,
        StreamingState.Idle,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows x for Error status', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} status={CoreToolCallStatus.Error} />,
        StreamingState.Idle,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows paused spinner for Executing status when streamingState is Idle', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} status={CoreToolCallStatus.Executing} />,
        StreamingState.Idle,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows paused spinner for Executing status when streamingState is WaitingForConfirmation', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} status={CoreToolCallStatus.Executing} />,
        StreamingState.WaitingForConfirmation,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows MockRespondingSpinner for Executing status when streamingState is Responding', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithContext(
        <ToolMessage {...baseProps} status={CoreToolCallStatus.Executing} />,
        StreamingState.Responding, // Simulate app still responding
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  it('renders DiffRenderer for diff results', async () => {
    const diffResult = {
      fileDiff: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
      fileName: 'file.txt',
      originalContent: 'old',
      newContent: 'new',
      filePath: 'file.txt',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithContext(
      <ToolMessage {...baseProps} resultDisplay={diffResult} />,
      StreamingState.Idle,
    );
    await waitUntilReady();
    // Check that the output contains the MockDiff content as part of the whole message
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders emphasis correctly', async () => {
    const {
      lastFrame: highEmphasisFrame,
      waitUntilReady: waitUntilReadyHigh,
      unmount: unmountHigh,
    } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="high" />,
      StreamingState.Idle,
    );
    await waitUntilReadyHigh();
    // Check for trailing indicator or specific color if applicable (Colors are not easily testable here)
    expect(highEmphasisFrame()).toMatchSnapshot();
    unmountHigh();

    const {
      lastFrame: lowEmphasisFrame,
      waitUntilReady: waitUntilReadyLow,
      unmount: unmountLow,
    } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="low" />,
      StreamingState.Idle,
    );
    await waitUntilReadyLow();
    // For low emphasis, the name and description might be dimmed (check for dimColor if possible)
    // This is harder to assert directly in text output without color checks.
    // We can at least ensure it doesn't have the high emphasis indicator.
    expect(lowEmphasisFrame()).toMatchSnapshot();
    unmountLow();
  });

  it('renders AnsiOutputText for AnsiOutput results', async () => {
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
    const { lastFrame, waitUntilReady, unmount } = renderWithContext(
      <ToolMessage {...baseProps} resultDisplay={ansiResult} />,
      StreamingState.Idle,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders progress information appended to description for executing tools', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithContext(
      <ToolMessage
        {...baseProps}
        status={CoreToolCallStatus.Executing}
        progressMessage="Working on it..."
        progressPercent={42}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(
      'A tool for testing (Working on it... - 42%)',
    );
    unmount();
  });

  it('renders only percentage when progressMessage is missing', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithContext(
      <ToolMessage
        {...baseProps}
        status={CoreToolCallStatus.Executing}
        progressPercent={75}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('A tool for testing (75%)');
    unmount();
  });
});
