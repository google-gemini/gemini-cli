/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ListMcpResourcesTool } from './list-mcp-resources.js';
import { ToolErrorType } from './tool-error.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('ListMcpResourcesTool', () => {
  let tool: ListMcpResourcesTool;
  let mockContext: {
    config: {
      getMcpClientManager: Mock;
    };
  };
  let mockMcpManager: {
    getAllResources: Mock;
  };
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    mockMcpManager = {
      getAllResources: vi.fn(),
    };

    mockContext = {
      config: {
        getMcpClientManager: vi.fn().mockReturnValue(mockMcpManager),
      },
    };

    tool = new ListMcpResourcesTool(
      mockContext as unknown as AgentLoopContext,
      createMockMessageBus(),
    );
  });

  it('should successfully list all resources', async () => {
    const resources = [
      {
        uri: 'protocol://r1',
        serverName: 'server1',
        name: 'R1',
        description: 'D1',
      },
      { uri: 'protocol://r2', serverName: 'server2', name: 'R2' },
    ];
    mockMcpManager.getAllResources.mockReturnValue(resources);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({});
    const result = (await invocation.execute({ abortSignal })) as {
      llmContent: string;
      returnDisplay: string;
    };

    expect(mockMcpManager.getAllResources).toHaveBeenCalled();
    expect(result.llmContent).toContain('Available MCP Resources:');
    expect(result.llmContent).toContain('protocol://r1');
    expect(result.llmContent).toContain('protocol://r2');
    expect(result.returnDisplay).toBe('Listed 2 resources.');
  });

  it('should filter by server name', async () => {
    const resources = [
      { uri: 'protocol://r1', serverName: 'server1', name: 'R1' },
      { uri: 'protocol://r2', serverName: 'server2', name: 'R2' },
    ];
    mockMcpManager.getAllResources.mockReturnValue(resources);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({ serverName: 'server1' });
    const result = (await invocation.execute({ abortSignal })) as {
      llmContent: string;
      returnDisplay: string;
    };

    expect(result.llmContent).toContain('protocol://r1');
    expect(result.llmContent).not.toContain('protocol://r2');
    expect(result.returnDisplay).toBe('Listed 1 resources.');
  });

  it('should return message if no resources found', async () => {
    mockMcpManager.getAllResources.mockReturnValue([]);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({});
    const result = (await invocation.execute({ abortSignal })) as {
      llmContent: string;
      returnDisplay: string;
    };

    expect(result.llmContent).toBe('No MCP resources found.');
    expect(result.returnDisplay).toBe('No MCP resources found.');
  });

  it('should return message if no resources found for server', async () => {
    mockMcpManager.getAllResources.mockReturnValue([]);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({ serverName: 'nonexistent' });
    const result = (await invocation.execute({ abortSignal })) as {
      llmContent: string;
      returnDisplay: string;
    };

    expect(result.llmContent).toBe(
      'No resources found for server: nonexistent',
    );
    expect(result.returnDisplay).toBe(
      'No resources found for server: nonexistent',
    );
  });

  it('should return error if MCP Client Manager not available', async () => {
    mockContext.config.getMcpClientManager.mockReturnValue(undefined);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({});
    const result = (await invocation.execute({ abortSignal })) as {
      error: { type: string; message: string };
    };

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toContain('MCP Client Manager not available');
  });
});
