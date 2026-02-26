/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { type HistoryItem } from '../types.js';
import { MessageType } from '../types.js';
import { SessionStatsProvider } from '../contexts/SessionContext.js';
import {
  type Config,
  type ToolExecuteConfirmationDetails,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';

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

  it('renders UserMessage for "user" type', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: 'Hello',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Hello');
    unmount();
  });

  it('renders HintMessage for "hint" type', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'hint',
      text: 'Try using ripgrep first',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Try using ripgrep first');
    unmount();
  });

  it('renders UserMessage for "user" type with slash command', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: '/theme',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('/theme');
    unmount();
  });

  it.each([true, false])(
    'renders InfoMessage for "info" type with multi-line text (alternateBuffer=%s)',
    async (useAlternateBuffer) => {
      const item: HistoryItem = {
        ...baseItem,
        type: MessageType.INFO,
        text: '⚡ Line 1\n⚡ Line 2\n⚡ Line 3',
      };
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <HistoryItemDisplay {...baseItem} item={item} />,
        { useAlternateBuffer },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    },
  );

  it('renders AgentsStatus for "agents_list" type', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.AGENTS_LIST,
      agents: [
        {
          name: 'local_agent',
          displayName: 'Local Agent',
          description: '  Local agent description.\n    Second line.',
          kind: 'local',
        },
        {
          name: 'remote_agent',
          description: 'Remote agent description.',
          kind: 'remote',
        },
      ],
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders StatsDisplay for "stats" type', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.STATS,
      duration: '1s',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Stats');
    unmount();
  });

  it('renders AboutBox for "about" type', async () => {
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
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('About Gemini CLI');
    unmount();
  });

  it('renders ModelStatsDisplay for "model_stats" type', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'model_stats',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(
      'No API calls have been made in this session.',
    );
    unmount();
  });

  it('renders ToolStatsDisplay for "tool_stats" type', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'tool_stats',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(
      'No tool calls have been made in this session.',
    );
    unmount();
  });

  it('renders SessionSummaryDisplay for "quit" type', async () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'quit',
      duration: '1s',
    };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Agent powering down. Goodbye!');
    unmount();
  });

  it('should escape ANSI codes in text content', async () => {
    const historyItem: HistoryItem = {
      id: 1,
      type: 'user',
      text: 'Hello, \u001b[31mred\u001b[0m world!',
    };

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <HistoryItemDisplay
        item={historyItem}
        terminalWidth={80}
        isPending={false}
      />,
    );
    await waitUntilReady();

    // The ANSI codes should be escaped for display.
    expect(lastFrame()).toContain('Hello, \\u001b[31mred\\u001b[0m world!');
    // The raw ANSI codes should not be present.
    expect(lastFrame()).not.toContain('Hello, \u001b[31mred\u001b[0m world!');
    unmount();
  });

  it('should escape ANSI codes in tool confirmation details', async () => {
    const historyItem: HistoryItem = {
      id: 1,
      type: 'tool_group',
      tools: [
        {
          callId: '123',
          name: 'run_shell_command',
          description: 'Run a shell command',
          resultDisplay: 'blank',
          status: CoreToolCallStatus.AwaitingApproval,
          confirmationDetails: {
            type: 'exec',
            title: 'Run Shell Command',
            command: 'echo "\u001b[31mhello\u001b[0m"',
            rootCommand: 'echo',
            rootCommands: ['echo'],
          },
        },
      ],
    };

    const { waitUntilReady, unmount } = renderWithProviders(
      <HistoryItemDisplay
        item={historyItem}
        terminalWidth={80}
        isPending={false}
      />,
    );
    await waitUntilReady();

    const passedProps = vi.mocked(ToolGroupMessage).mock.calls[0][0];
    const confirmationDetails = passedProps.toolCalls[0]
      .confirmationDetails as ToolExecuteConfirmationDetails;

    expect(confirmationDetails.command).toBe(
      'echo "\\u001b[31mhello\\u001b[0m"',
    );
    unmount();
  });

  describe('thinking items', () => {
    it('renders thinking item when enabled', async () => {
      const item: HistoryItem = {
        ...baseItem,
        type: 'thinking',
        thought: { subject: 'Thinking', description: 'test' },
      };
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <HistoryItemDisplay {...baseItem} item={item} />,
        {
          settings: createMockSettings({
            merged: { ui: { inlineThinkingMode: 'full' } },
          }),
        },
      );
      await waitUntilReady();

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('does not render thinking item when disabled', async () => {
      const item: HistoryItem = {
        ...baseItem,
        type: 'thinking',
        thought: { subject: 'Thinking', description: 'test' },
      };
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <HistoryItemDisplay {...baseItem} item={item} />,
        {
          settings: createMockSettings({
            merged: { ui: { inlineThinkingMode: 'off' } },
          }),
        },
      );
      await waitUntilReady();

      expect(lastFrame({ allowEmpty: true })).toBe('');
      unmount();
    });
  });

  describe.each([true, false])(
    'gemini items (alternateBuffer=%s)',
    (useAlternateBuffer) => {
      const longCode =
        '# Example code block:\n' +
        '```python\n' +
        Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join('\n') +
        '\n```';

      it('should render a truncated gemini item', async () => {
        const item: HistoryItem = {
          id: 1,
          type: 'gemini',
          text: longCode,
        };
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <HistoryItemDisplay
            item={item}
            isPending={false}
            terminalWidth={80}
            availableTerminalHeight={10}
          />,
          { useAlternateBuffer },
        );
        await waitUntilReady();

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      });

      it('should render a full gemini item when using availableTerminalHeightGemini', async () => {
        const item: HistoryItem = {
          id: 1,
          type: 'gemini',
          text: longCode,
        };
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <HistoryItemDisplay
            item={item}
            isPending={false}
            terminalWidth={80}
            availableTerminalHeight={10}
            availableTerminalHeightGemini={Number.MAX_SAFE_INTEGER}
          />,
          { useAlternateBuffer },
        );
        await waitUntilReady();

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      });

      it('should render a truncated gemini_content item', async () => {
        const item: HistoryItem = {
          id: 1,
          type: 'gemini_content',
          text: longCode,
        };
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <HistoryItemDisplay
            item={item}
            isPending={false}
            terminalWidth={80}
            availableTerminalHeight={10}
          />,
          { useAlternateBuffer },
        );
        await waitUntilReady();

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      });

      it('should render a full gemini_content item when using availableTerminalHeightGemini', async () => {
        const item: HistoryItem = {
          id: 1,
          type: 'gemini_content',
          text: longCode,
        };
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <HistoryItemDisplay
            item={item}
            isPending={false}
            terminalWidth={80}
            availableTerminalHeight={10}
            availableTerminalHeightGemini={Number.MAX_SAFE_INTEGER}
          />,
          { useAlternateBuffer },
        );
        await waitUntilReady();

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      });
    },
  );
});
