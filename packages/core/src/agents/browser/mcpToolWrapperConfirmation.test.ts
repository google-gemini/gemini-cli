/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import type { BrowserManager } from './browserManager.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { MessageBusType } from '../../confirmation-bus/types.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';

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

    // We accept any cast here because we are mocking the interface
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
    const invocation = tools[0].build({});

    // Use "any" to access protected method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = await (invocation as any).getConfirmationDetails(
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

    await details.onConfirm(outcome);

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.UPDATE_POLICY,
        mcpName: 'browser-agent',
        persist: false, // ProceedAlwaysServer doesn't persist by default unless specified otherwise in logic?
        // Wait, BaseToolInvocation.publishPolicyUpdate handles logic.
        // If outcome is ProceedAlwaysServer, BaseToolInvocation doesn't do anything by default!
      }),
    );
  });

  it('getPolicyUpdateOptions returns correct options', async () => {
    const tools = await createMcpDeclarativeTools(
      mockBrowserManager,
      mockMessageBus,
    );
    const invocation = tools[0].build({});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (invocation as any).getPolicyUpdateOptions(
      ToolConfirmationOutcome.ProceedAlways,
    );

    expect(options).toEqual({
      mcpName: 'browser-agent',
    });
  });
});
