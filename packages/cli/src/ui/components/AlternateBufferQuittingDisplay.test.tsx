/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { AlternateBufferQuittingDisplay } from './AlternateBufferQuittingDisplay.js';
import { ToolCallStatus } from '../types.js';
import type { HistoryItem, HistoryItemWithoutId } from '../types.js';
import { Text } from 'ink';
import { renderWithProviders } from '../../test-utils/render.js';
import type { Config } from '@google/gemini-cli-core';
import type { ToolMessageProps } from './messages/ToolMessage.js';

vi.mock('../contexts/AppContext.js', () => ({
  useAppContext: () => ({
    version: '0.10.0',
  }),
}));

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

vi.mock('./messages/ToolMessage.js', () => ({
  ToolMessage: (props: ToolMessageProps) => (
    <Text>
      ToolMessage: {props.name} - {props.status}
    </Text>
  ),
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

const mockConfig = {
  getScreenReader: () => false,
  getEnableInteractiveShell: () => false,
  getModel: () => 'gemini-pro',
  getTargetDir: () => '/tmp',
  getDebugMode: () => false,
  getGeminiMdFileCount: () => 0,
} as unknown as Config;

describe('AlternateBufferQuittingDisplay', () => {
  it('renders with active and pending tool messages', () => {
    const { lastFrame } = renderWithProviders(
      <AlternateBufferQuittingDisplay />,
      {
        uiState: {
          history: mockHistory,
          pendingHistoryItems: mockPendingHistoryItems,
          terminalWidth: 80,
          mainAreaWidth: 80,
          slashCommands: [],
          activePtyId: undefined,
          embeddedShellFocused: false,
          renderMarkdown: false,
        },
        config: mockConfig,
      },
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
