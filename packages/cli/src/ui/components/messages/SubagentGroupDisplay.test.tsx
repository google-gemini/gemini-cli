/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { waitFor } from '../../../test-utils/async.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import { SubagentGroupDisplay } from './SubagentGroupDisplay.js';
import { Kind, CoreToolCallStatus } from '@google/gemini-cli-core';
import type { IndividualToolCallDisplay } from '../../types.js';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';

vi.mock('../../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: ({ text }: { text: string }) => <Text>{text}</Text>,
}));

describe('<SubagentGroupDisplay />', () => {
  const mockToolCalls: IndividualToolCallDisplay[] = [
    {
      callId: 'call-1',
      name: 'agent_1',
      description: 'Test agent 1',
      confirmationDetails: undefined,
      status: CoreToolCallStatus.Executing,
      kind: Kind.Agent,
      resultDisplay: {
        isSubagentProgress: true,
        agentName: 'api-monitor',
        state: 'running',
        recentActivity: [
          {
            id: 'act-1',
            type: 'tool_call',
            status: 'running',
            content: '',
            displayName: 'Action Required',
            description: 'Verify server is running',
          },
        ],
      },
    },
    {
      callId: 'call-2',
      name: 'agent_2',
      description: 'Test agent 2',
      confirmationDetails: undefined,
      status: CoreToolCallStatus.Success,
      kind: Kind.Agent,
      resultDisplay: {
        isSubagentProgress: true,
        agentName: 'db-manager',
        state: 'completed',
        result: 'Database schema validated',
        recentActivity: [
          {
            id: 'act-2',
            type: 'thought',
            status: 'completed',
            content: 'Database schema validated',
          },
        ],
      },
    },
  ];

  const renderSubagentGroup = async (
    toolCallsToRender: IndividualToolCallDisplay[],
    height?: number,
  ) =>
    renderWithProviders(
      <SubagentGroupDisplay
        toolCalls={toolCallsToRender}
        terminalWidth={80}
        availableTerminalHeight={height}
        isExpandable={true}
      />,
    );

  it('renders nothing if there are no agent tool calls', async () => {
    const { lastFrame } = await renderSubagentGroup([], 40);
    expect(lastFrame({ allowEmpty: true })).toBe('');
  });

  it('renders collapsed view by default with correct agent counts and states', async () => {
    const { lastFrame } = await renderSubagentGroup(mockToolCalls, 40);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('expands when availableTerminalHeight is undefined', async () => {
    const { lastFrame, rerender } = await renderSubagentGroup(
      mockToolCalls,
      40,
    );

    // Default collapsed view
    await waitFor(() => {
      expect(lastFrame()).toContain('(ctrl+o to expand)');
    });

    // Expand view
    rerender(
      <SubagentGroupDisplay
        toolCalls={mockToolCalls}
        terminalWidth={80}
        availableTerminalHeight={undefined}
        isExpandable={true}
      />,
    );
    await waitFor(() => {
      expect(lastFrame()).toContain('(ctrl+o to collapse)');
    });

    // Collapse view
    rerender(
      <SubagentGroupDisplay
        toolCalls={mockToolCalls}
        terminalWidth={80}
        availableTerminalHeight={40}
        isExpandable={true}
      />,
    );
    await waitFor(() => {
      expect(lastFrame()).toContain('(ctrl+o to expand)');
    });
  });
});
