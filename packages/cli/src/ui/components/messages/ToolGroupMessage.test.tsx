/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import { type IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import type {
  Config,
  ToolCallConfirmationDetails,
} from '@google/gemini-cli-core';
import { TOOL_STATUS } from '../../constants.js';

// Mock child components to isolate ToolGroupMessage behavior
vi.mock('./ToolMessage.js', () => ({
  ToolMessage: function MockToolMessage({
    callId,
    name,
    description,
    status,
    emphasis,
  }: {
    callId: string;
    name: string;
    description: string;
    status: ToolCallStatus;
    emphasis: string;
  }) {
    // Use the same constants as the real component
    const statusSymbolMap: Record<ToolCallStatus, string> = {
      [ToolCallStatus.Success]: TOOL_STATUS.SUCCESS,
      [ToolCallStatus.Pending]: TOOL_STATUS.PENDING,
      [ToolCallStatus.Executing]: TOOL_STATUS.EXECUTING,
      [ToolCallStatus.Confirming]: TOOL_STATUS.CONFIRMING,
      [ToolCallStatus.Canceled]: TOOL_STATUS.CANCELED,
      [ToolCallStatus.Error]: TOOL_STATUS.ERROR,
    };
    const statusSymbol = statusSymbolMap[status] || '?';
    return (
      <Text>
        MockTool[{callId}]: {statusSymbol} {name} - {description} ({emphasis})
      </Text>
    );
  },
}));

vi.mock('./ToolConfirmationMessage.js', () => ({
  ToolConfirmationMessage: function MockToolConfirmationMessage({
    confirmationDetails,
  }: {
    confirmationDetails: ToolCallConfirmationDetails;
  }) {
    const displayText =
      confirmationDetails?.type === 'info'
        ? (confirmationDetails as { prompt: string }).prompt
        : confirmationDetails?.title || 'confirm';
    return <Text>MockConfirmation: {displayText}</Text>;
  },
}));

describe('<ToolGroupMessage />', () => {
  const mockConfig: Config = {} as Config;

  const createToolCall = (
    overrides: Partial<IndividualToolCallDisplay> = {},
  ): IndividualToolCallDisplay => ({
    callId: 'tool-123',
    name: 'test-tool',
    description: 'A tool for testing',
    resultDisplay: 'Test result',
    status: ToolCallStatus.Success,
    confirmationDetails: undefined,
    renderOutputAsMarkdown: false,
    ...overrides,
  });

  const baseProps = {
    groupId: 1,
    terminalWidth: 80,
    config: mockConfig,
    isFocused: true,
  };

  describe('Golden Snapshots', () => {
    it('renders single successful tool call', () => {
      const toolCalls = [createToolCall()];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders multiple tool calls with different statuses', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'successful-tool',
          description: 'This tool succeeded',
          status: ToolCallStatus.Success,
        }),
        createToolCall({
          callId: 'tool-2',
          name: 'pending-tool',
          description: 'This tool is pending',
          status: ToolCallStatus.Pending,
        }),
        createToolCall({
          callId: 'tool-3',
          name: 'error-tool',
          description: 'This tool failed',
          status: ToolCallStatus.Error,
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders tool call awaiting confirmation', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-confirm',
          name: 'confirmation-tool',
          description: 'This tool needs confirmation',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm Tool Execution',
            prompt: 'Are you sure you want to proceed?',
            onConfirm: vi.fn(),
          },
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders shell command with yellow border', () => {
      const toolCalls = [
        createToolCall({
          callId: 'shell-1',
          name: 'run_shell_command',
          description: 'Execute shell command',
          status: ToolCallStatus.Success,
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders mixed tool calls including shell command', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'read_file',
          description: 'Read a file',
          status: ToolCallStatus.Success,
        }),
        createToolCall({
          callId: 'tool-2',
          name: 'run_shell_command',
          description: 'Run command',
          status: ToolCallStatus.Executing,
        }),
        createToolCall({
          callId: 'tool-3',
          name: 'write_file',
          description: 'Write to file',
          status: ToolCallStatus.Pending,
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders with limited terminal height', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'tool-with-result',
          description: 'Tool with output',
          resultDisplay:
            'This is a long result that might need height constraints',
        }),
        createToolCall({
          callId: 'tool-2',
          name: 'another-tool',
          description: 'Another tool',
          resultDisplay: 'More output here',
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          availableTerminalHeight={10}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders when not focused', () => {
      const toolCalls = [createToolCall()];
      const { lastFrame } = render(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          isFocused={false}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders with narrow terminal width', () => {
      const toolCalls = [
        createToolCall({
          name: 'very-long-tool-name-that-might-wrap',
          description:
            'This is a very long description that might cause wrapping issues',
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          terminalWidth={40}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders empty tool calls array', () => {
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={[]} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('Border Color Logic', () => {
    it('uses yellow border when tools are pending', () => {
      const toolCalls = [createToolCall({ status: ToolCallStatus.Pending })];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      // The snapshot will capture the visual appearance including border color
      expect(lastFrame()).toMatchSnapshot();
    });

    it('uses yellow border for shell commands even when successful', () => {
      const toolCalls = [
        createToolCall({
          name: 'run_shell_command',
          status: ToolCallStatus.Success,
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('uses gray border when all tools are successful and no shell commands', () => {
      const toolCalls = [
        createToolCall({ status: ToolCallStatus.Success }),
        createToolCall({
          callId: 'tool-2',
          name: 'another-tool',
          status: ToolCallStatus.Success,
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('Height Calculation', () => {
    it('calculates available height correctly with multiple tools with results', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          resultDisplay: 'Result 1',
        }),
        createToolCall({
          callId: 'tool-2',
          resultDisplay: 'Result 2',
        }),
        createToolCall({
          callId: 'tool-3',
          resultDisplay: '', // No result
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          availableTerminalHeight={20}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('Confirmation Handling', () => {
    it('shows confirmation dialog for first confirming tool only', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'first-confirm',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm First Tool',
            prompt: 'Confirm first tool',
            onConfirm: vi.fn(),
          },
        }),
        createToolCall({
          callId: 'tool-2',
          name: 'second-confirm',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm Second Tool',
            prompt: 'Confirm second tool',
            onConfirm: vi.fn(),
          },
        }),
      ];
      const { lastFrame } = render(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      // Should only show confirmation for the first tool
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
