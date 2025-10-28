/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ToolMessageProps } from './ToolMessage.js';
import { describe, it, expect, vi } from 'vitest';
import { ToolMessage } from './ToolMessage.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { Text } from 'ink';
import { StreamingContext } from '../../contexts/StreamingContext.js';
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

    expect(output).toContain('✓'); // Success indicator
    expect(output).toContain('test-tool');
    expect(output).toContain('A tool for testing');
    expect(output).toContain('MockMarkdown:Test result');
  });

  describe('JSON rendering', () => {
    const extractJSON = (output: string | undefined): string => {
      if (!output) return '';
      const start = output.indexOf('{');
      const end = output.indexOf('}');
      if (start >= 0 && end >= start) {
        return output.slice(start, end + 1);
      } else {
        return '';
      }
    };

    it('pretty prints valid JSON', () => {
      const testJSONstring = '{"a": 1, "b": [2, 3]}';
      const testJSON = JSON.parse(testJSONstring);
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={false}
        />,
        StreamingState.Idle,
      );

      const output = lastFrame();
      const extractedOutput = JSON.parse(extractJSON(output));

      expect(tryParseJSON(testJSONstring)).toBeTruthy();
      expect(extractedOutput).toStrictEqual(testJSON);
    });

    it('renders pretty JSON in ink frame', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} resultDisplay='{"a":1,"b":2}' />,
        StreamingState.Idle,
      );

      const frame = lastFrame();

      expect(frame).toMatchSnapshot();
      expect(frame).not.toContain('MockMarkdown:');
      expect(frame).not.toContain('MockAnsiOutput:');
      expect(frame).not.toMatch(/MockDiff:/);
    });

    it('uses JSON renderer even when renderOutputAsMarkdown=true is true', () => {
      const testJSONstring = '{"a": 1, "b": [2, 3]}';
      const testJSON = JSON.parse(testJSONstring);
      const { lastFrame } = renderWithContext(
        <ToolMessage
          {...baseProps}
          resultDisplay={testJSONstring}
          renderOutputAsMarkdown={true}
        />,
        StreamingState.Idle,
      );

      const output = lastFrame();
      const extractedOutput = JSON.parse(extractJSON(output));

      expect(tryParseJSON(testJSONstring)).toBeTruthy();
      expect(extractedOutput).toStrictEqual(testJSON);
      expect(output).not.toContain('MockMarkDown:');
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
});
