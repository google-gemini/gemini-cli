/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderWithProviders,
  createMockSettings,
} from '../../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import type { IndividualToolCallDisplay } from '../../types.js';
import { ToolCallStatus } from '../../types.js';
import { Scrollable } from '../shared/Scrollable.js';

describe('<ToolGroupMessage />', () => {
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
    isFocused: true,
  };

  describe('Golden Snapshots', () => {
    it('renders single successful tool call', () => {
      const toolCalls = [createToolCall()];
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          availableTerminalHeight={10}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders when not focused', () => {
      const toolCalls = [createToolCall()];
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          isFocused={false}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders with narrow terminal width', () => {
      const toolCalls = [
        createToolCall({
          name: 'very-long-tool-name-that-might-wrap',
          description:
            'This is a very long description that might cause wrapping issues',
        }),
      ];
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          terminalWidth={40}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders empty tool calls array', () => {
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={[]} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders header when scrolled', () => {
      const toolCalls = [
        createToolCall({
          callId: '1',
          name: 'tool-1',
          description:
            'Description 1. This is a long description that will need to be truncated if the terminal width is small.',
          resultDisplay: 'line1\nline2\nline3\nline4\nline5',
        }),
        createToolCall({
          callId: '2',
          name: 'tool-2',
          description: 'Description 2',
          resultDisplay: 'line1\nline2',
        }),
      ];
      const { lastFrame, unmount } = renderWithProviders(
        <Scrollable height={10} hasFocus={true} scrollToBottom={true}>
          <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />
        </Scrollable>,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders tool call with outputFile', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-output-file',
          name: 'tool-with-file',
          description: 'Tool that saved output to file',
          status: ToolCallStatus.Success,
          outputFile: '/path/to/output.txt',
        }),
      ];
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders two tool groups where only the last line of the previous group is visible', () => {
      const toolCalls1 = [
        createToolCall({
          callId: '1',
          name: 'tool-1',
          description: 'Description 1',
          resultDisplay: 'line1\nline2\nline3\nline4\nline5',
        }),
      ];
      const toolCalls2 = [
        createToolCall({
          callId: '2',
          name: 'tool-2',
          description: 'Description 2',
          resultDisplay: 'line1',
        }),
      ];

      const { lastFrame, unmount } = renderWithProviders(
        <Scrollable height={6} hasFocus={true} scrollToBottom={true}>
          <ToolGroupMessage {...baseProps} toolCalls={toolCalls1} />
          <ToolGroupMessage {...baseProps} toolCalls={toolCalls2} />
        </Scrollable>,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  describe('Border Color Logic', () => {
    it('uses yellow border when tools are pending', () => {
      const toolCalls = [createToolCall({ status: ToolCallStatus.Pending })];
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      // The snapshot will capture the visual appearance including border color
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('uses yellow border for shell commands even when successful', () => {
      const toolCalls = [
        createToolCall({
          name: 'run_shell_command',
          status: ToolCallStatus.Success,
        }),
      ];
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          availableTerminalHeight={20}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
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
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
      );
      // Should only show confirmation for the first tool
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders confirmation with permanent approval enabled', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'confirm-tool',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm Tool',
            prompt: 'Do you want to proceed?',
            onConfirm: vi.fn(),
          },
        }),
      ];
      const settings = createMockSettings({
        security: { enablePermanentToolApproval: true },
      });
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        { settings },
      );
      expect(lastFrame()).toContain('Allow for all future sessions');
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders confirmation with permanent approval disabled', () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'confirm-tool',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm Tool',
            prompt: 'Do you want to proceed?',
            onConfirm: vi.fn(),
          },
        }),
      ];
      const settings = createMockSettings({
        security: { enablePermanentToolApproval: false },
      });
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        { settings },
      );
      expect(lastFrame()).not.toContain('Allow for all future sessions');
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });
});
