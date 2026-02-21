/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
} from '../../types.js';
import { Scrollable } from '../shared/Scrollable.js';
import {
  makeFakeConfig,
  CoreToolCallStatus,
  ApprovalMode,
  ASK_USER_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  EDIT_DISPLAY_NAME,
  READ_FILE_DISPLAY_NAME,
  GLOB_DISPLAY_NAME,
} from '@google/gemini-cli-core';
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
    status: CoreToolCallStatus.Success,
    confirmationDetails: undefined,
    renderOutputAsMarkdown: false,
    ...overrides,
  });

  const baseProps = {
    terminalWidth: 80,
  };

  const createItem = (
    tools: IndividualToolCallDisplay[],
  ): HistoryItem | HistoryItemWithoutId => ({
    id: 1,
    type: 'tool_group',
    tools,
  });

  const baseMockConfig = makeFakeConfig({
    model: 'gemini-pro',
    targetDir: os.tmpdir(),
    debugMode: false,
    folderTrust: false,
    ideMode: false,
    enableInteractiveShell: true,
  });

  describe('Golden Snapshots', () => {
    it('renders single successful tool call', async () => {
      const toolCalls = [createToolCall()];
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('hides confirming tools (standard behavior)', async () => {
      const toolCalls = [
        createToolCall({
          callId: 'confirm-tool',
          status: CoreToolCallStatus.AwaitingApproval,
          confirmationDetails: {
            type: 'info',
            title: 'Confirm tool',
            prompt: 'Do you want to proceed?',
          },
        }),
      ];
      const item = createItem(toolCalls);

      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        { config: baseMockConfig },
      );

      // Should render nothing because all tools in the group are confirming
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toBe('');
      unmount();
    });

    it('renders multiple tool calls with different statuses (only visible ones)', async () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'successful-tool',
          description: 'This tool succeeded',
          status: CoreToolCallStatus.Success,
        }),
        createToolCall({
          callId: 'tool-2',
          name: 'pending-tool',
          description: 'This tool is pending',
          status: CoreToolCallStatus.Scheduled,
        }),
        createToolCall({
          callId: 'tool-3',
          name: 'error-tool',
          description: 'This tool failed',
          status: CoreToolCallStatus.Error,
        }),
      ];
      const item = createItem(toolCalls);

      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      // pending-tool should be hidden
      await waitUntilReady();
      const output = lastFrame();
      expect(output).toContain('successful-tool');
      expect(output).not.toContain('pending-tool');
      expect(output).toContain('error-tool');
      expect(output).toMatchSnapshot();
      unmount();
    });

    it('renders mixed tool calls including shell command', async () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-1',
          name: 'read_file',
          description: 'Read a file',
          status: CoreToolCallStatus.Success,
        }),
        createToolCall({
          callId: 'tool-2',
          name: 'run_shell_command',
          description: 'Run command',
          status: CoreToolCallStatus.Executing,
        }),
        createToolCall({
          callId: 'tool-3',
          name: 'write_file',
          description: 'Write to file',
          status: CoreToolCallStatus.Scheduled,
        }),
      ];
      const item = createItem(toolCalls);

      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      // write_file (Pending) should be hidden
      await waitUntilReady();
      const output = lastFrame();
      expect(output).toContain('read_file');
      expect(output).toContain('run_shell_command');
      expect(output).not.toContain('write_file');
      expect(output).toMatchSnapshot();
      unmount();
    });

    it('renders with limited terminal height', async () => {
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
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={item}
          toolCalls={toolCalls}
          availableTerminalHeight={10}
        />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('renders with narrow terminal width', async () => {
      const toolCalls = [
        createToolCall({
          name: 'very-long-tool-name-that-might-wrap',
          description:
            'This is a very long description that might cause wrapping issues',
        }),
      ];
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={item}
          toolCalls={toolCalls}
          terminalWidth={40}
        />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('renders empty tool calls array', async () => {
      const toolCalls: IndividualToolCallDisplay[] = [];
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: [],
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('renders header when scrolled', async () => {
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
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <Scrollable height={10} hasFocus={true} scrollToBottom={true}>
          <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />
        </Scrollable>,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('renders tool call with outputFile', async () => {
      const toolCalls = [
        createToolCall({
          callId: 'tool-output-file',
          name: 'tool-with-file',
          description: 'Tool that saved output to file',
          status: CoreToolCallStatus.Success,
          outputFile: '/path/to/output.txt',
        }),
      ];
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('renders two tool groups where only the last line of the previous group is visible', async () => {
      const toolCalls1 = [
        createToolCall({
          callId: '1',
          name: 'tool-1',
          description: 'Description 1',
          resultDisplay: 'line1\nline2\nline3\nline4\nline5',
        }),
      ];
      const item1 = createItem(toolCalls1);
      const toolCalls2 = [
        createToolCall({
          callId: '2',
          name: 'tool-2',
          description: 'Description 2',
          resultDisplay: 'line1',
        }),
      ];
      const item2 = createItem(toolCalls2);

      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <Scrollable height={6} hasFocus={true} scrollToBottom={true}>
          <ToolGroupMessage
            {...baseProps}
            item={item1}
            toolCalls={toolCalls1}
          />
          <ToolGroupMessage
            {...baseProps}
            item={item2}
            toolCalls={toolCalls2}
          />
        </Scrollable>,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls1,
              },
              {
                type: 'tool_group',
                tools: toolCalls2,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });
  });

  describe('Border Color Logic', () => {
    it('uses yellow border for shell commands even when successful', async () => {
      const toolCalls = [
        createToolCall({
          name: 'run_shell_command',
          status: CoreToolCallStatus.Success,
        }),
      ];
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('uses gray border when all tools are successful and no shell commands', async () => {
      const toolCalls = [
        createToolCall({ status: CoreToolCallStatus.Success }),
        createToolCall({
          callId: 'tool-2',
          name: 'another-tool',
          status: CoreToolCallStatus.Success,
        }),
      ];
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });
  });

  describe('Height Calculation', () => {
    it('calculates available height correctly with multiple tools with results', async () => {
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
      const item = createItem(toolCalls);
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={item}
          toolCalls={toolCalls}
          availableTerminalHeight={20}
        />,
        {
          config: baseMockConfig,
          uiState: {
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: toolCalls,
              },
            ],
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });
  });

  describe('Ask User Filtering', () => {
    it.each([
      {
        status: CoreToolCallStatus.Scheduled,
        resultDisplay: 'test result',
        shouldHide: true,
      },
      {
        status: CoreToolCallStatus.Executing,
        resultDisplay: 'test result',
        shouldHide: true,
      },
      {
        status: CoreToolCallStatus.AwaitingApproval,
        resultDisplay: 'test result',
        shouldHide: true,
      },
      {
        status: CoreToolCallStatus.Success,
        resultDisplay: 'test result',
        shouldHide: false,
      },
      { status: CoreToolCallStatus.Error, resultDisplay: '', shouldHide: true },
      {
        status: CoreToolCallStatus.Error,
        resultDisplay: 'error message',
        shouldHide: false,
      },
    ])(
      'filtering logic for status=$status and hasResult=$resultDisplay',
      async ({ status, resultDisplay, shouldHide }) => {
        const toolCalls = [
          createToolCall({
            callId: `ask-user-${status}`,
            name: ASK_USER_DISPLAY_NAME,
            status,
            resultDisplay,
          }),
        ];
        const item = createItem(toolCalls);

        const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
          <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
          { config: baseMockConfig },
        );
        await waitUntilReady();

        if (shouldHide) {
          expect(lastFrame({ allowEmpty: true })).toBe('');
        } else {
          expect(lastFrame()).toMatchSnapshot();
        }
        unmount();
      },
    );

    it('shows other tools when ask_user is filtered out', async () => {
      const toolCalls = [
        createToolCall({
          callId: 'other-tool',
          name: 'other-tool',
          status: CoreToolCallStatus.Success,
        }),
        createToolCall({
          callId: 'ask-user-pending',
          name: ASK_USER_DISPLAY_NAME,
          status: CoreToolCallStatus.Scheduled,
        }),
      ];
      const item = createItem(toolCalls);

      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
        { config: baseMockConfig },
      );

      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot();
      unmount();
    });

    it('renders nothing when only tool is in-progress AskUser with borderBottom=false', async () => {
      // AskUser tools in progress are rendered by AskUserDialog, not ToolGroupMessage.
      // When AskUser is the only tool and borderBottom=false (no border to close),
      // the component should render nothing.
      const toolCalls = [
        createToolCall({
          callId: 'ask-user-tool',
          name: ASK_USER_DISPLAY_NAME,
          status: CoreToolCallStatus.Executing,
        }),
      ];
      const item = createItem(toolCalls);

      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={item}
          toolCalls={toolCalls}
          borderBottom={false}
        />,
        { config: baseMockConfig },
      );
      // AskUser tools in progress are rendered by AskUserDialog, so we expect nothing.
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toBe('');
      unmount();
    });
  });

  describe('Plan Mode Filtering', () => {
    it.each([
      {
        name: WRITE_FILE_DISPLAY_NAME,
        mode: ApprovalMode.PLAN,
        visible: false,
      },
      { name: EDIT_DISPLAY_NAME, mode: ApprovalMode.PLAN, visible: false },
      {
        name: WRITE_FILE_DISPLAY_NAME,
        mode: ApprovalMode.DEFAULT,
        visible: true,
      },
      { name: READ_FILE_DISPLAY_NAME, mode: ApprovalMode.PLAN, visible: true },
      { name: GLOB_DISPLAY_NAME, mode: ApprovalMode.PLAN, visible: true },
    ])(
      'filtering logic for $name in $mode mode',
      async ({ name, mode, visible }) => {
        const toolCalls = [
          createToolCall({
            callId: 'test-call',
            name,
            approvalMode: mode,
          }),
        ];
        const item = createItem(toolCalls);

        const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
          <ToolGroupMessage {...baseProps} item={item} toolCalls={toolCalls} />,
          { config: baseMockConfig },
        );

        await waitUntilReady();

        if (visible) {
          expect(lastFrame()).toContain(name);
        } else {
          expect(lastFrame({ allowEmpty: true })).toBe('');
        }
        unmount();
      },
    );
  });

  describe('Manual Overflow Detection', () => {
    it('detects overflow for string results exceeding available height', async () => {
      const toolCalls = [
        createToolCall({
          resultDisplay: 'line 1\nline 2\nline 3\nline 4\nline 5',
        }),
      ];
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={6} // Very small height
          isExpandable={true}
        />,
        {
          config: baseMockConfig,
          useAlternateBuffer: true,
          uiState: {
            constrainHeight: true,
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame()?.toLowerCase()).toContain(
        'press ctrl+o to show more lines',
      );
      unmount();
    });

    it('detects overflow for array results exceeding available height', async () => {
      // resultDisplay when array is expected to be AnsiLine[]
      // AnsiLine is AnsiToken[]
      const toolCalls = [
        createToolCall({
          resultDisplay: Array(5).fill([{ text: 'line', fg: 'default' }]),
        }),
      ];
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={6}
          isExpandable={true}
        />,
        {
          config: baseMockConfig,
          useAlternateBuffer: true,
          uiState: {
            constrainHeight: true,
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame()?.toLowerCase()).toContain(
        'press ctrl+o to show more lines',
      );
      unmount();
    });

    it('respects ACTIVE_SHELL_MAX_LINES for focused shell tools', async () => {
      const toolCalls = [
        createToolCall({
          name: 'run_shell_command',
          status: CoreToolCallStatus.Executing,
          ptyId: 1,
          resultDisplay: Array(20).fill('line').join('\n'), // 20 lines > 15 (limit)
        }),
      ];
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={100} // Plenty of terminal height
          isExpandable={true}
        />,
        {
          config: baseMockConfig,
          useAlternateBuffer: true,
          uiState: {
            constrainHeight: true,
            activePtyId: 1,
            embeddedShellFocused: true,
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame()?.toLowerCase()).toContain(
        'press ctrl+o to show more lines',
      );
      unmount();
    });

    it('does not show expansion hint when content is within limits', async () => {
      const toolCalls = [
        createToolCall({
          resultDisplay: 'small result',
        }),
      ];
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={20}
          isExpandable={true}
        />,
        {
          config: baseMockConfig,
          useAlternateBuffer: true,
          uiState: {
            constrainHeight: true,
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame()).not.toContain('Press Ctrl+O to show more lines');
      unmount();
    });

    it('hides expansion hint when constrainHeight is false', async () => {
      const toolCalls = [
        createToolCall({
          resultDisplay: 'line 1\nline 2\nline 3\nline 4\nline 5',
        }),
      ];
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          {...baseProps}
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={6}
          isExpandable={true}
        />,
        {
          config: baseMockConfig,
          useAlternateBuffer: true,
          uiState: {
            constrainHeight: false,
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame()).not.toContain('Press Ctrl+O to show more lines');
      unmount();
    });

    it('isolates overflow hint in ASB mode (ignores global overflow state)', async () => {
      // In this test, the tool output is SHORT (no local overflow).
      // We will inject a dummy ID into the global overflow state.
      // ToolGroupMessage should still NOT show the hint because it calculates
      // overflow locally and passes it as a prop.
      const toolCalls = [
        createToolCall({
          resultDisplay: 'short result',
        }),
      ];
      const { lastFrame, unmount, waitUntilReady, capturedOverflowActions } =
        renderWithProviders(
          <ToolGroupMessage
            {...baseProps}
            item={{ id: 1, type: 'tool_group', tools: toolCalls }}
            toolCalls={toolCalls}
            availableTerminalHeight={100}
            isExpandable={true}
          />,
          {
            config: baseMockConfig,
            useAlternateBuffer: true,
            uiState: {
              constrainHeight: true,
            },
          },
        );
      await waitUntilReady();

      // Manually trigger a global overflow
      act(() => {
        expect(capturedOverflowActions).toBeDefined();
        capturedOverflowActions!.addOverflowingId('unrelated-global-id');
      });

      // The hint should NOT appear because ToolGroupMessage is isolated by its prop logic
      expect(lastFrame()).not.toContain('Press Ctrl+O to show more lines');
      unmount();
    });
  });
});
