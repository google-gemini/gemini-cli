/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoreToolScheduler } from './coreToolScheduler.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ApprovalMode,
  PolicyDecision,
} from '../index.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type {
  Config,
  ToolRegistry,
  ToolInvocation,
  ToolResult,
  MessageBus,
  DeclarativeTool,
} from '../index.js';

class MockParallelTool extends BaseDeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    name: string,
    isReadOnly: boolean,
    messageBus: MessageBus,
    private executeFn: (name: string) => Promise<ToolResult>,
  ) {
    super(
      name,
      name,
      'Mock tool for parallel testing',
      isReadOnly ? Kind.Read : Kind.Edit,
      {},
      messageBus,
      true,
      false,
      undefined,
      undefined,
      isReadOnly,
    );
  }

  protected createInvocation(
    params: Record<string, unknown>,
    messageBus: MessageBus,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new MockParallelInvocation(
      this.name,
      params,
      messageBus,
      this.executeFn,
    );
  }
}

class MockParallelInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private name: string,
    params: Record<string, unknown>,
    messageBus: MessageBus,
    private executeFn: (name: string) => Promise<ToolResult>,
  ) {
    super(params, messageBus);
  }
  getDescription() {
    return 'Mock invocation';
  }
  async execute() {
    return this.executeFn(this.name);
  }
}

function createMockConfig(overrides: Partial<Config> = {}): Config {
  const baseConfig = {
    getApprovalMode: () => ApprovalMode.DEFAULT,
    isInteractive: () => true,
    getUsageStatisticsEnabled: () => false,
    getDebugMode: () => false,
    getMessageBus: () => createMockMessageBus(),
    getPolicyEngine: () => ({
      check: async () => ({ decision: PolicyDecision.ALLOW }),
    }),
    getToolRegistry: () => ({
      getTool: (_name: string) => undefined,
    }),
    getHookSystem: () => undefined,
    getShellExecutionConfig: () => ({
      terminalWidth: 80,
      terminalHeight: 24,
      sanitizationConfig: {
        enableEnvironmentVariableRedaction: true,
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
      },
    }),
    getTruncateToolOutputThreshold: () => 10000,
    storage: {
      getProjectTempDir: () => '/tmp',
    },
  } as unknown as Config;
  return { ...baseConfig, ...overrides } as Config;
}

describe('CoreToolScheduler Parallel Execution Flow', () => {
  let executionLog: string[] = [];

  beforeEach(() => {
    executionLog = [];
  });

  const createDelayedExecute = (delayMs: number) => async (name: string) => {
    executionLog.push(`start:${name}`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    executionLog.push(`end:${name}`);
    return {
      llmContent: `done:${name}`,
      returnDisplay: `done:${name}`,
    } as ToolResult;
  };

  it('should execute [read, read, write, read, read] in the correct waves', async () => {
    const messageBus = createMockMessageBus();
    const execute = createDelayedExecute(50);

    const toolRead1 = new MockParallelTool('read1', true, messageBus, execute);
    const toolRead2 = new MockParallelTool('read2', true, messageBus, execute);
    const toolWrite1 = new MockParallelTool(
      'write1',
      false,
      messageBus,
      execute,
    );
    const toolRead3 = new MockParallelTool('read3', true, messageBus, execute);
    const toolRead4 = new MockParallelTool('read4', true, messageBus, execute);

    const registry = {
      getTool: (name: string) => {
        switch (name) {
          case 'read1':
            return toolRead1;
          case 'read2':
            return toolRead2;
          case 'write1':
            return toolWrite1;
          case 'read3':
            return toolRead3;
          case 'read4':
            return toolRead4;
          default:
        }
        return undefined;
      },
    } as unknown as ToolRegistry;

    const config = createMockConfig({
      getToolRegistry: () => registry,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const onAllToolCallsComplete = vi.fn();
    const scheduler = new CoreToolScheduler({
      config,
      onAllToolCallsComplete,
      getPreferredEditor: () => 'vscode',
    });

    const requests = [
      {
        callId: '1',
        name: 'read1',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test-prompt',
      },
      {
        callId: '2',
        name: 'read2',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test-prompt',
      },
      {
        callId: '3',
        name: 'write1',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test-prompt',
      },
      {
        callId: '4',
        name: 'read3',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test-prompt',
      },
      {
        callId: '5',
        name: 'read4',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test-prompt',
      },
    ];

    await scheduler.schedule(requests, new AbortController().signal);

    expect(onAllToolCallsComplete).toHaveBeenCalledTimes(1);

    // Check Wave 1: read1 and read2 overlap
    const start1 = executionLog.indexOf('start:read1');
    const start2 = executionLog.indexOf('start:read2');
    const end1 = executionLog.indexOf('end:read1');
    const end2 = executionLog.indexOf('end:read2');

    expect(start1).toBeLessThan(2); // First wave
    expect(start2).toBeLessThan(2);
    expect(Math.max(start1, start2)).toBeLessThan(Math.min(end1, end2)); // Overlap

    // Check Wave 2: write1 starts after Wave 1 ends
    const startWrite = executionLog.indexOf('start:write1');
    const endWrite = executionLog.indexOf('end:write1');
    expect(startWrite).toBeGreaterThan(Math.max(end1, end2));

    // Check Wave 3: read3 and read4 start after Wave 2 ends and overlap
    const start3 = executionLog.indexOf('start:read3');
    const start4 = executionLog.indexOf('start:read4');
    const end3 = executionLog.indexOf('end:read3');
    const end4 = executionLog.indexOf('end:read4');

    expect(start3).toBeGreaterThan(endWrite);
    expect(start4).toBeGreaterThan(endWrite);
    expect(Math.max(start3, start4)).toBeLessThan(Math.min(end3, end4)); // Overlap
  });

  it('should parallelize DiscoveredMCPTools if marked as read-only', async () => {
    const execute = createDelayedExecute(50);

    // We mock the MCP tool behavior
    const mcpTool1 = {
      name: 'mcp_read1',
      description: 'MCP Read 1',
      isReadOnly: true,
      build: () => ({
        execute: () => execute('mcp_read1'),
        shouldConfirmExecute: async () => undefined,
        getDescription: () => 'MCP Read 1',
      }),
    } as unknown as DeclarativeTool<object, ToolResult>;

    const mcpTool2 = {
      name: 'mcp_read2',
      description: 'MCP Read 2',
      isReadOnly: true,
      build: () => ({
        execute: () => execute('mcp_read2'),
        shouldConfirmExecute: async () => undefined,
        getDescription: () => 'MCP Read 2',
      }),
    } as unknown as DeclarativeTool<object, ToolResult>;

    const registry = {
      getTool: (name: string) => {
        if (name === 'mcp_read1') return mcpTool1;
        if (name === 'mcp_read2') return mcpTool2;
        return undefined;
      },
    } as unknown as ToolRegistry;

    const config = createMockConfig({
      getToolRegistry: () => registry,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const scheduler = new CoreToolScheduler({
      config,
      onAllToolCallsComplete: vi.fn(),
      getPreferredEditor: () => 'vscode',
    });

    const requests = [
      {
        callId: '1',
        name: 'mcp_read1',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test',
      },
      {
        callId: '2',
        name: 'mcp_read2',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test',
      },
    ];

    await scheduler.schedule(requests, new AbortController().signal);

    const start1 = executionLog.indexOf('start:mcp_read1');
    const start2 = executionLog.indexOf('start:mcp_read2');
    const end1 = executionLog.indexOf('end:mcp_read1');
    const end2 = executionLog.indexOf('end:mcp_read2');

    expect(Math.max(start1, start2)).toBeLessThan(Math.min(end1, end2)); // Overlap
  });
});
