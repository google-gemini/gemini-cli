/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { ToolMessage, type ToolMessageProps } from './ToolMessage.js';
import { describe, it, expect, vi } from 'vitest';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { Text } from 'ink';
import type { AnsiOutput } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { tryParseJSON } from '../../../utils/jsonoutput.js';

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
  ) =>
    renderWithProviders(ui, {
      uiActions,
      uiState: { streamingState },
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders basic tool information', () => {
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} />,
      StreamingState.Idle,
    );
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });

  describe('JSON rendering', () => {
    it('pretty prints valid JSON', () => {
      const testJSONstring = '{"a": 1, "b": [2, 3]}';
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );

      const output = lastFrame();

      // Verify the JSON utility correctly parses the input
      expect(tryParseJSON(testJSONstring)).toBeTruthy();
      // Verify pretty-printed JSON appears in output (with proper indentation)
      expect(output).toContain('"a": 1');
      expect(output).toContain('"b": [');
      // Should not use markdown renderer for JSON
    });

    it('renders pretty JSON in ink frame', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} resultDisplay='{"a":1,"b":2}' />,
        StreamingState.Idle,
      );

      const frame = lastFrame();

      expect(frame).toMatchSnapshot();
    });

    it('uses JSON renderer even when renderOutputAsMarkdown=true is true', () => {
      const testJSONstring = '{"a": 1, "b": [2, 3]}';
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={true}
        />,
        StreamingState.Idle,
      );

      const output = lastFrame();

      // Verify the JSON utility correctly parses the input
      expect(tryParseJSON(testJSONstring)).toBeTruthy();
      // Verify pretty-printed JSON appears in output
      expect(output).toContain('"a": 1');
      expect(output).toContain('"b": [');
      // Should not use markdown renderer for JSON even when renderOutputAsMarkdown=true
    });
    it('falls back to plain text for malformed JSON', () => {
      const testJSONstring = 'a": 1, "b": [2, 3]}';
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );

      const output = lastFrame();

      expect(tryParseJSON(testJSONstring)).toBeFalsy();
      expect(typeof output === 'string').toBeTruthy();
    });

    it('rejects mixed text + JSON renders as plain text', () => {
      const testJSONstring = `{"result":  "count": 42,"items": ["apple", "banana"]},"meta": {"timestamp": "2025-09-28T12:34:56Z"}}End.`;
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );

      const output = lastFrame();

      expect(tryParseJSON(testJSONstring)).toBeFalsy();
      expect(typeof output === 'string').toBeTruthy();
    });

    it('rejects ANSI-tained JSON renders as plain text', () => {
      const testJSONstring =
        '\u001b[32mOK\u001b[0m {"status": "success", "data": {"id": 123, "values": [10, 20, 30]}}';
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );

      const output = lastFrame();

      expect(tryParseJSON(testJSONstring)).toBeFalsy();
      expect(typeof output === 'string').toBeTruthy();
    });

    it('pretty printing 10kb JSON completes in <50ms', () => {
      const large = '{"key": "' + 'x'.repeat(10000) + '"}';
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={large}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );

      const start = performance.now();
      lastFrame();
      expect(performance.now() - start).toBeLessThan(50);
    });
  });

  describe('ToolStatusIndicator rendering', () => {
    it('shows ✓ for Success status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Success} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows o for Pending status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Pending} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows ? for Confirming status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Confirming} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows - for Canceled status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Canceled} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows x for Error status', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Error} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows paused spinner for Executing status when streamingState is Idle', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows paused spinner for Executing status when streamingState is WaitingForConfirmation', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.WaitingForConfirmation,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows MockRespondingSpinner for Executing status when streamingState is Responding', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.Responding, // Simulate app still responding
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  it('renders DiffRenderer for diff results', () => {
    const diffResult = {
      fileDiff: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
      fileName: 'file.txt',
      originalContent: 'old',
      newContent: 'new',
      filePath: 'file.txt',
    };
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} resultDisplay={diffResult} />,
      StreamingState.Idle,
    );
    // Check that the output contains the MockDiff content as part of the whole message
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders emphasis correctly', () => {
    const { lastFrame: highEmphasisFrame } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="high" />,
      StreamingState.Idle,
    );
    // Check for trailing indicator or specific color if applicable (Colors are not easily testable here)
    expect(highEmphasisFrame()).toMatchSnapshot();

    const { lastFrame: lowEmphasisFrame } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="low" />,
      StreamingState.Idle,
    );
    // For low emphasis, the name and description might be dimmed (check for dimColor if possible)
    // This is harder to assert directly in text output without color checks.
    // We can at least ensure it doesn't have the high emphasis indicator.
    expect(lowEmphasisFrame()).toMatchSnapshot();
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
    expect(lastFrame()).toMatchSnapshot();
  });
});
