/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import {
  makeFakeConfig,
  CoreToolCallStatus,
  ApprovalMode,
  WRITE_FILE_DISPLAY_NAME,
  Kind,
} from '@google/gemini-cli-core';
import os from 'node:os';
import { createMockSettings } from '../../../test-utils/settings.js';
import type { IndividualToolCallDisplay } from '../../types.js';

describe('ToolGroupMessage Regression Tests', () => {
  const baseMockConfig = makeFakeConfig({
    model: 'gemini-pro',
    targetDir: os.tmpdir(),
  });
  const fullVerbositySettings = createMockSettings({
    ui: { errorVerbosity: 'full' },
  });

  const createToolCall = (
    overrides: Partial<IndividualToolCallDisplay> = {},
  ): IndividualToolCallDisplay =>
    ({
      callId: 'tool-123',
      name: 'test-tool',
      status: CoreToolCallStatus.Success,
      ...overrides,
    }) as IndividualToolCallDisplay;

  const createItem = (tools: IndividualToolCallDisplay[]) => ({
    id: 1,
    type: 'tool_group' as const,
    tools,
  });

  it('Plan Mode: suppresses phantom tool group (hidden tools)', async () => {
    const toolCalls = [
      createToolCall({
        name: WRITE_FILE_DISPLAY_NAME,
        approvalMode: ApprovalMode.PLAN,
        status: CoreToolCallStatus.Success,
      }),
    ];
    const item = createItem(toolCalls);

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolGroupMessage
        terminalWidth={80}
        item={item}
        toolCalls={toolCalls}
        borderBottom={true}
      />,
      { config: baseMockConfig, settings: fullVerbositySettings },
    );

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('Agent Case: suppresses the bottom border box for ongoing agents (no vertical ticks)', async () => {
    const toolCalls = [
      createToolCall({
        name: 'agent',
        kind: Kind.Agent,
        status: CoreToolCallStatus.Executing,
        resultDisplay: {
          isSubagentProgress: true,
          agentName: 'TestAgent',
          state: 'running',
          recentActivity: [],
        },
      }),
    ];
    const item = createItem(toolCalls);

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolGroupMessage
        terminalWidth={80}
        item={item}
        toolCalls={toolCalls}
        borderBottom={false} // Ongoing
      />,
      { config: baseMockConfig, settings: fullVerbositySettings },
    );

    const output = lastFrame();
    expect(output).toContain('Running Agent...');
    // It should render side borders from the content
    expect(output).toContain('│');
    // It should NOT render the bottom border box (no corners ╰ ╯)
    expect(output).not.toContain('╰');
    expect(output).not.toContain('╯');
    unmount();
  });

  it('Agent Case: renders a bottom border horizontal line for completed agents', async () => {
    const toolCalls = [
      createToolCall({
        name: 'agent',
        kind: Kind.Agent,
        status: CoreToolCallStatus.Success,
        resultDisplay: {
          isSubagentProgress: true,
          agentName: 'TestAgent',
          state: 'completed',
          recentActivity: [],
        },
      }),
    ];
    const item = createItem(toolCalls);

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolGroupMessage
        terminalWidth={80}
        item={item}
        toolCalls={toolCalls}
        borderBottom={true} // Completed
      />,
      { config: baseMockConfig, settings: fullVerbositySettings },
    );

    const output = lastFrame();
    // Verify it rendered subagent content
    expect(output).toContain('Agent');
    // It should render the bottom horizontal line
    expect(output).toContain(
      '╰──────────────────────────────────────────────────────────────────────────╯',
    );
    unmount();
  });

  it('Bridges: still renders a bridge if it has a top border', async () => {
    const toolCalls: IndividualToolCallDisplay[] = [];
    const item = createItem(toolCalls);

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolGroupMessage
        terminalWidth={80}
        item={item}
        toolCalls={toolCalls}
        borderTop={true}
        borderBottom={true}
      />,
      { config: baseMockConfig, settings: fullVerbositySettings },
    );

    expect(lastFrame({ allowEmpty: true })).not.toBe('');
    unmount();
  });
});
