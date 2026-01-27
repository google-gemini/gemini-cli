/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderWithProviders,
  persistentStateMock,
} from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlternateBufferQuittingDisplay } from './AlternateBufferQuittingDisplay.js';
import { ToolCallStatus } from '../types.js';
import type { HistoryItem, HistoryItemWithoutId } from '../types.js';
import { Text } from 'ink';

vi.mock('../utils/terminalSetup.js', () => ({
  getTerminalProgram: () => null,
}));

vi.mock('../contexts/AppContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/AppContext.js')>();
  return {
    ...actual,
    useAppContext: () => ({
      version: '0.10.0',
    }),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getMCPServerStatus: vi.fn(),
  };
});

vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: () => <Text>Spinner</Text>,
}));

const mockHistory: HistoryItem[] = [
  {
    id: 1,
    type: 'tool_group',
    tools: [
      {
        callId: 'call1',
        name: 'tool1',
        description: 'Description for tool 1',
        status: ToolCallStatus.Success,
        resultDisplay: undefined,
        confirmationDetails: undefined,
      },
    ],
  },
  {
    id: 2,
    type: 'tool_group',
    tools: [
      {
        callId: 'call2',
        name: 'tool2',
        description: 'Description for tool 2',
        status: ToolCallStatus.Success,
        resultDisplay: undefined,
        confirmationDetails: undefined,
      },
    ],
  },
];

const mockPendingHistoryItems: HistoryItemWithoutId[] = [
  {
    type: 'tool_group',
    tools: [
      {
        callId: 'call3',
        name: 'tool3',
        description: 'Description for tool 3',
        status: ToolCallStatus.Pending,
        resultDisplay: undefined,
        confirmationDetails: undefined,
      },
    ],
  },
];

describe('AlternateBufferQuittingDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const baseUIState = {
    terminalWidth: 80,
    mainAreaWidth: 80,
    slashCommands: [],
    activePtyId: undefined,
    embeddedShellFocused: false,
    renderMarkdown: false,
    bannerData: {
      defaultText: '',
      warningText: '',
    },
  };

  it('renders with active and pending tool messages', () => {
    persistentStateMock.setData({ tipsShown: 0 });
    const { lastFrame } = renderWithProviders(
      <AlternateBufferQuittingDisplay />,
      {
        uiState: {
          ...baseUIState,
          history: mockHistory,
          pendingHistoryItems: mockPendingHistoryItems,
        },
      },
    );
    expect(lastFrame()).toMatchSnapshot('with_history_and_pending');
  });

  it('renders with empty history and no pending items', () => {
    persistentStateMock.setData({ tipsShown: 0 });
    const { lastFrame } = renderWithProviders(
      <AlternateBufferQuittingDisplay />,
      {
        uiState: {
          ...baseUIState,
          history: [],
          pendingHistoryItems: [],
        },
      },
    );
    expect(lastFrame()).toMatchSnapshot('empty');
  });

  it('renders with history but no pending items', () => {
    persistentStateMock.setData({ tipsShown: 0 });
    const { lastFrame } = renderWithProviders(
      <AlternateBufferQuittingDisplay />,
      {
        uiState: {
          ...baseUIState,
          history: mockHistory,
          pendingHistoryItems: [],
        },
      },
    );
    expect(lastFrame()).toMatchSnapshot('with_history_no_pending');
  });

  it('renders with pending items but no history', () => {
    persistentStateMock.setData({ tipsShown: 0 });
    const { lastFrame } = renderWithProviders(
      <AlternateBufferQuittingDisplay />,
      {
        uiState: {
          ...baseUIState,
          history: [],
          pendingHistoryItems: mockPendingHistoryItems,
        },
      },
    );
    expect(lastFrame()).toMatchSnapshot('with_pending_no_history');
  });

  it('renders with a tool awaiting confirmation', () => {
    persistentStateMock.setData({ tipsShown: 0 });
    const pendingHistoryItems: HistoryItemWithoutId[] = [
      {
        type: 'tool_group',
        tools: [
          {
            callId: 'call4',
            name: 'confirming_tool',
            description: 'Confirming tool description',
            status: ToolCallStatus.Confirming,
            resultDisplay: undefined,
            confirmationDetails: {
              type: 'info',
              title: 'Confirm Tool',
              prompt: 'Confirm this action?',
              onConfirm: async () => {},
            },
          },
        ],
      },
    ];
    const { lastFrame } = renderWithProviders(
      <AlternateBufferQuittingDisplay />,
      {
        uiState: {
          ...baseUIState,
          history: [],
          pendingHistoryItems,
        },
      },
    );
    const output = lastFrame();
    expect(output).toContain('Action Required (was prompted):');
    expect(output).toContain('confirming_tool');
    expect(output).toContain('Confirming tool description');
    expect(output).toMatchSnapshot('with_confirming_tool');
  });

  it('renders with user and gemini messages', () => {
    persistentStateMock.setData({ tipsShown: 0 });
    const history: HistoryItem[] = [
      { id: 1, type: 'user', text: 'Hello Gemini' },
      { id: 2, type: 'gemini', text: 'Hello User!' },
    ];
    const { lastFrame } = renderWithProviders(
      <AlternateBufferQuittingDisplay />,
      {
        uiState: {
          ...baseUIState,
          history,
          pendingHistoryItems: [],
        },
      },
    );
    expect(lastFrame()).toMatchSnapshot('with_user_gemini_messages');
  });
});
