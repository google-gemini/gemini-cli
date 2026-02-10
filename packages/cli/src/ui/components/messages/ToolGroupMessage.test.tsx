/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import type { IndividualToolCallDisplay } from '../../types.js';
import { ToolCallStatus } from '../../types.js';
import { Scrollable } from '../shared/Scrollable.js';
import { ASK_USER_DISPLAY_NAME, makeFakeConfig } from '@google/gemini-cli-core';
import os from 'node:os';

describe('<ToolGroupMessage />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  const baseMockConfig = makeFakeConfig({
    model: 'gemini-pro',
    targetDir: os.tmpdir(),
    debugMode: false,
    folderTrust: false,
    ideMode: false,
    enableInteractiveShell: true,
    enableEventDrivenScheduler: true,
  });

  describe('Golden Snapshots', () => {
    it('renders single successful tool call', () => {
      const toolCalls = [createToolCall()];
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
      const mockConfig = makeFakeConfig({
        model: 'gemini-pro',
        targetDir: os.tmpdir(),
        enableEventDrivenScheduler: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        {
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
      const mockConfig = makeFakeConfig({
        model: 'gemini-pro',
        targetDir: os.tmpdir(),
        enableEventDrivenScheduler: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        {
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
      const mockConfig = makeFakeConfig({
        model: 'gemini-pro',
        targetDir: os.tmpdir(),
        enableEventDrivenScheduler: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        {
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders empty tool calls array', () => {
      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={[]} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: [] }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              { type: 'tool_group', tools: toolCalls1 },
              { type: 'tool_group', tools: toolCalls2 },
            ],
          },
        },
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  describe('Border Color Logic', () => {
    it('uses yellow border when tools are pending', () => {
      const toolCalls = [createToolCall({ status: ToolCallStatus.Pending })];
      const mockConfig = makeFakeConfig({
        model: 'gemini-pro',
        targetDir: os.tmpdir(),
        enableEventDrivenScheduler: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        {
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
      const mockConfig = makeFakeConfig({
        model: 'gemini-pro',
        targetDir: os.tmpdir(),
        enableEventDrivenScheduler: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        {
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
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
      const mockConfig = makeFakeConfig({
        model: 'gemini-pro',
        targetDir: os.tmpdir(),
        enableEventDrivenScheduler: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        {
          settings,
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
          },
        },
      );
      expect(lastFrame()).toContain('Allow for all future sessions');
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders confirmation with permanent approval disabled', () => {
      const toolCalls = [
        createToolCall({
          callId: 'confirm-tool',
          name: 'confirm-tool',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm tool',
            prompt: 'Do you want to proceed?',
            onConfirm: vi.fn(),
          },
        }),
      ];

      const mockConfig = makeFakeConfig({
        model: 'gemini-pro',
        targetDir: os.tmpdir(),
        enableEventDrivenScheduler: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        { config: mockConfig },
      );
      expect(lastFrame()).not.toContain('Allow for all future sessions');
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  describe('Event-Driven Scheduler', () => {
    it('hides confirming tools when event-driven scheduler is enabled', () => {
      const toolCalls = [
        createToolCall({
          callId: 'confirm-tool',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm tool',
            prompt: 'Do you want to proceed?',
            onConfirm: vi.fn(),
          },
        }),
      ];

      const mockConfig = baseMockConfig;

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        { config: mockConfig },
      );

      // Should render nothing because all tools in the group are confirming
      expect(lastFrame()).toBe('');
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('shows only successful tools when mixed with confirming tools', () => {
      const toolCalls = [
        createToolCall({
          callId: 'success-tool',
          name: 'success-tool',
          status: ToolCallStatus.Success,
        }),
        createToolCall({
          callId: 'confirm-tool',
          name: 'confirm-tool',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm tool',
            prompt: 'Do you want to proceed?',
            onConfirm: vi.fn(),
          },
        }),
      ];

      const mockConfig = baseMockConfig;

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        { config: mockConfig },
      );

      const output = lastFrame();
      expect(output).toContain('success-tool');
      expect(output).not.toContain('confirm-tool');
      expect(output).not.toContain('Do you want to proceed?');
      expect(output).toMatchSnapshot();
      unmount();
    });

    it('renders nothing when only tool is in-progress AskUser with borderBottom=false', () => {
      // AskUser tools in progress are rendered by AskUserDialog, not ToolGroupMessage.
      // When AskUser is the only tool and borderBottom=false (no border to close),
      // the component should render nothing.
      const toolCalls = [
        createToolCall({
          callId: 'ask-user-tool',
          name: 'Ask User',
          status: ToolCallStatus.Executing,
        }),
      ];

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          toolCalls={toolCalls}
          borderBottom={false}
        />,
        { config: baseMockConfig },
      );
      // AskUser tools in progress are rendered by AskUserDialog, so we expect nothing.
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  describe('Ask User Filtering', () => {
    it.each([
      ToolCallStatus.Pending,
      ToolCallStatus.Executing,
      ToolCallStatus.Confirming,
    ])('filters out ask_user when status is %s', (status) => {
      const toolCalls = [
        createToolCall({
          callId: `ask-user-${status}`,
          name: ASK_USER_DISPLAY_NAME,
          status,
        }),
      ];

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        { config: baseMockConfig },
      );

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it.each([ToolCallStatus.Success, ToolCallStatus.Error])(
      'does NOT filter out ask_user when status is %s',
      (status) => {
        const toolCalls = [
          createToolCall({
            callId: `ask-user-${status}`,
            name: ASK_USER_DISPLAY_NAME,
            status,
          }),
        ];

        const { lastFrame, unmount } = renderWithProviders(
          <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
          { config: baseMockConfig },
        );

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      },
    );

    it('shows other tools when ask_user is filtered out', () => {
      const toolCalls = [
        createToolCall({
          callId: 'other-tool',
          name: 'other-tool',
          status: ToolCallStatus.Success,
        }),
        createToolCall({
          callId: 'ask-user-pending',
          name: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Pending,
        }),
      ];

      const { lastFrame, unmount } = renderWithProviders(
        <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
        { config: baseMockConfig },
      );

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });
});
