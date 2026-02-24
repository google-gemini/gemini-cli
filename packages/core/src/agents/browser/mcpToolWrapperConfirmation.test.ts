/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import type { BrowserManager } from './browserManager.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { MessageBusType } from '../../confirmation-bus/types.js';
import {
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
  type PolicyUpdateOptions,
} from '../../tools/tools.js';

interface TestableConfirmation {
  getConfirmationDetails(
    signal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;
  getPolicyUpdateOptions(
    outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined;
}

describe('mcpToolWrapper Confirmation', () => {
  let mockBrowserManager: BrowserManager;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockBrowserManager = {
      getDiscoveredTools: vi
        .fn()
        .mockResolvedValue([
          { name: 'test_tool', description: 'desc', inputSchema: {} },
        ]),
      callTool: vi.fn(),
    } as unknown as BrowserManager;

    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  it('getConfirmationDetails returns specific MCP details', async () => {
    const tools = await createMcpDeclarativeTools(
      mockBrowserManager,
      mockMessageBus,
    );
    const invocation = tools[0].build({}) as unknown as TestableConfirmation;

    const details = await invocation.getConfirmationDetails(
      new AbortController().signal,
    );

    expect(details).toEqual(
      expect.objectContaining({
        type: 'mcp',
        serverName: 'browser-agent',
        toolName: 'test_tool',
      }),
    );

    // Verify onConfirm publishes policy update
    const outcome = ToolConfirmationOutcome.ProceedAlways;

    if (details && typeof details === 'object' && 'onConfirm' in details) {
      await details.onConfirm(outcome);
    }

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.UPDATE_POLICY,
        mcpName: 'browser-agent',
        persist: false,
      }),
    );
  });

  it('getPolicyUpdateOptions returns correct options', async () => {
    const tools = await createMcpDeclarativeTools(
      mockBrowserManager,
      mockMessageBus,
    );
    const invocation = tools[0].build({}) as unknown as TestableConfirmation;

    const options = invocation.getPolicyUpdateOptions(
      ToolConfirmationOutcome.ProceedAlways,
    );

    expect(options).toEqual({
      mcpName: 'browser-agent',
    });
  });
});
