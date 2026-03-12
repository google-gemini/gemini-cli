/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { waitFor } from '../../../test-utils/async.js';
import { render } from '../../../test-utils/render.js';
import { SubagentGroupDisplay } from './SubagentGroupDisplay.js';
import { Kind, CoreToolCallStatus } from '@google/gemini-cli-core';
import type { IndividualToolCallDisplay } from '../../types.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { vi } from 'vitest';
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

  it('renders nothing if there are no agent tool calls', async () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <KeypressProvider>
          <SubagentGroupDisplay
            toolCalls={[]}
            terminalWidth={80}
            availableTerminalHeight={40}
          />
        </KeypressProvider>
      </OverflowProvider>,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
  });

  it('renders collapsed view by default with correct agent counts and states', async () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <KeypressProvider>
          <SubagentGroupDisplay
            toolCalls={mockToolCalls}
            terminalWidth={80}
            availableTerminalHeight={40}
            isExpandable={true}
          />
        </KeypressProvider>
      </OverflowProvider>,
    );
    await waitFor(() => {
      const output = lastFrame() || '';
      expect(output).toContain('2 Agents (1 running, 1 completed)...');
      expect(output).toContain('(ctrl+o to expand)');
      // Agent 1 Check
      expect(output).toContain('api-monitor');
      expect(output).toContain('Action Required');
      expect(output).toContain('!');
      expect(output).toContain('db-manager');
      expect(output).toContain('Completed successfully');
      expect(output).toContain('✓');
    });
  });

  it('expands when availableTerminalHeight is undefined', async () => {
    const { lastFrame, rerender } = render(
      <OverflowProvider>
        <KeypressProvider>
          <SubagentGroupDisplay
            toolCalls={mockToolCalls}
            terminalWidth={80}
            availableTerminalHeight={40}
            isExpandable={true}
          />
        </KeypressProvider>
      </OverflowProvider>,
    );

    // Default collapsed view
    await waitFor(() => {
      expect(lastFrame()).toContain('(ctrl+o to expand)');
    });

    // Expand view
    rerender(
      <OverflowProvider>
        <KeypressProvider>
          <SubagentGroupDisplay
            toolCalls={mockToolCalls}
            terminalWidth={80}
            availableTerminalHeight={undefined}
            isExpandable={true}
          />
        </KeypressProvider>
      </OverflowProvider>,
    );
    await waitFor(() => {
      expect(lastFrame()).toContain('(ctrl+o to collapse)');
    });

    // Collapse view
    rerender(
      <OverflowProvider>
        <KeypressProvider>
          <SubagentGroupDisplay
            toolCalls={mockToolCalls}
            terminalWidth={80}
            availableTerminalHeight={40}
            isExpandable={true}
          />
        </KeypressProvider>
      </OverflowProvider>,
    );
    await waitFor(() => {
      expect(lastFrame()).toContain('(ctrl+o to expand)');
    });
  });
});
