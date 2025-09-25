/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { type HistoryItem, ToolCallStatus } from '../types.js';
import { MessageType } from '../types.js';
import { SessionStatsProvider } from '../contexts/SessionContext.js';
import type {
  Config,
  ToolExecuteConfirmationDetails,
} from '@google/gemini-cli-core';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';

// Mock child components
vi.mock('./messages/ToolGroupMessage.js', () => ({
  ToolGroupMessage: vi.fn(() => <div />),
}));

describe('<HistoryItemDisplay />', () => {
  const mockConfig = {} as unknown as Config;
  const baseItem = {
    id: 1,
    timestamp: 12345,
    isPending: false,
    terminalWidth: 80,
    config: mockConfig,
  };

  it('renders UserMessage for "user" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: 'Hello',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('Hello');
  });

  it('renders UserMessage for "user" type with slash command', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: '/theme',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('/theme');
  });

  it('renders StatsDisplay for "stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.STATS,
      duration: '1s',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain('Stats');
  });

  it('renders AboutBox for "about" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.ABOUT,
      cliVersion: '1.0.0',
      osVersion: 'test-os',
      sandboxEnv: 'test-env',
      modelVersion: 'test-model',
      selectedAuthType: 'test-auth',
      gcpProject: 'test-project',
      ideClient: 'test-ide',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('About Gemini CLI');
  });

  it('renders ModelStatsDisplay for "model_stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'model_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain(
      'No API calls have been made in this session.',
    );
  });

  it('renders ToolStatsDisplay for "tool_stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'tool_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain(
      'No tool calls have been made in this session.',
    );
  });

  it('renders SessionSummaryDisplay for "quit" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'quit',
      duration: '1s',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain('Agent powering down. Goodbye!');
  });

  it('should escape ANSI codes in text content', () => {
    const historyItem: HistoryItem = {
      id: 1,
      type: 'user',
      text: 'Hello, \u001b[31mred\u001b[0m world!',
    };

    const { lastFrame } = render(
      <HistoryItemDisplay
        item={historyItem}
        terminalWidth={80}
        isPending={false}
      />,
    );

    // The ANSI codes should be escaped for display.
    expect(lastFrame()).toContain('Hello, \\u001b[31mred\\u001b[0m world!');
    // The raw ANSI codes should not be present.
    expect(lastFrame()).not.toContain('Hello, \u001b[31mred\u001b[0m world!');
  });

  it('should escape ANSI codes in tool confirmation details', () => {
    const historyItem: HistoryItem = {
      id: 1,
      type: 'tool_group',
      tools: [
        {
          callId: '123',
          name: 'run_shell_command',
          description: 'Run a shell command',
          resultDisplay: 'blank',
          status: ToolCallStatus.Confirming,
          confirmationDetails: {
            type: 'exec',
            title: 'Run Shell Command',
            command: 'echo "\u001b[31mhello\u001b[0m"',
            rootCommand: 'echo',
            onConfirm: async () => {},
          },
        },
      ],
    };

    render(
      <HistoryItemDisplay
        item={historyItem}
        terminalWidth={80}
        isPending={false}
      />,
    );

    const passedProps = vi.mocked(ToolGroupMessage).mock.calls[0][0];
    const confirmationDetails = passedProps.toolCalls[0]
      .confirmationDetails as ToolExecuteConfirmationDetails;

    expect(confirmationDetails.command).toBe(
      'echo "\\u001b[31mhello\\u001b[0m"',
    );
  });
});
