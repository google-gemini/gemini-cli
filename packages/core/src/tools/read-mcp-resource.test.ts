/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ReadMcpResourceTool } from './read-mcp-resource.js';
import { ToolErrorType } from './tool-error.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('ReadMcpResourceTool', () => {
  let tool: ReadMcpResourceTool;
  let mockContext: {
    config: {
      getMcpClientManager: Mock;
    };
  };
  let mockMcpManager: {
    findResourceByUri: Mock;
    getClient: Mock;
  };
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    mockMcpManager = {
      findResourceByUri: vi.fn(),
      getClient: vi.fn(),
    };

    mockContext = {
      config: {
        getMcpClientManager: vi.fn().mockReturnValue(mockMcpManager),
      },
    };

    tool = new ReadMcpResourceTool(
      mockContext as unknown as AgentLoopContext,
      createMockMessageBus(),
    );
  });

  it('should successfully read a resource', async () => {
    const uri = 'protocol://resource';
    const serverName = 'test-server';
    const resourceName = 'Test Resource';
    const resourceContent = 'Resource Content';

    mockMcpManager.findResourceByUri.mockReturnValue({
      uri,
      serverName,
      name: resourceName,
    });

    const mockClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [{ text: resourceContent }],
      }),
    };
    mockMcpManager.getClient.mockReturnValue(mockClient);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          getDescription: () => string;
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({ uri });

    // Verify description
    expect(invocation.getDescription()).toBe(
      `Read MCP resource "${resourceName}" from server "${serverName}"`,
    );

    const result = (await invocation.execute({ abortSignal })) as {
      llmContent: string;
      returnDisplay: string;
    };

    expect(mockMcpManager.findResourceByUri).toHaveBeenCalledWith(uri);
    expect(mockMcpManager.getClient).toHaveBeenCalledWith(serverName);
    expect(mockClient.readResource).toHaveBeenCalledWith(uri);
    expect(result).toEqual({
      llmContent: resourceContent + '\n',
      returnDisplay: `Successfully read resource "${resourceName}" from server "${serverName}"`,
    });
  });

  it('should pass raw URI to client when using qualified URI', async () => {
    const qualifiedUri = 'test-server:protocol://resource';
    const rawUri = 'protocol://resource';
    const serverName = 'test-server';
    const resourceName = 'Test Resource';
    const resourceContent = 'Resource Content';

    mockMcpManager.findResourceByUri.mockReturnValue({
      uri: rawUri,
      serverName,
      name: resourceName,
    });

    const mockClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [{ text: resourceContent }],
      }),
    };
    mockMcpManager.getClient.mockReturnValue(mockClient);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({ uri: qualifiedUri });

    const result = (await invocation.execute({ abortSignal })) as {
      llmContent: string;
      returnDisplay: string;
    };

    expect(mockMcpManager.findResourceByUri).toHaveBeenCalledWith(qualifiedUri);
    expect(mockMcpManager.getClient).toHaveBeenCalledWith(serverName);
    expect(mockClient.readResource).toHaveBeenCalledWith(rawUri);
    expect(result.llmContent).toBe(resourceContent + '\n');
  });

  it('should return error if MCP Client Manager not available', async () => {
    mockContext.config.getMcpClientManager.mockReturnValue(undefined);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({ uri: 'uri' });
    const result = (await invocation.execute({ abortSignal })) as {
      error: { type: string; message: string };
    };

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toContain('MCP Client Manager not available');
  });

  it('should return error if resource not found', async () => {
    mockMcpManager.findResourceByUri.mockReturnValue(undefined);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({ uri: 'uri' });
    const result = (await invocation.execute({ abortSignal })) as {
      error: { type: string; message: string };
    };

    expect(result.error?.type).toBe(ToolErrorType.MCP_RESOURCE_NOT_FOUND);
    expect(result.error?.message).toContain('Resource not found');
  });

  it('should return error if reading fails', async () => {
    const uri = 'protocol://resource';
    const serverName = 'test-server';

    mockMcpManager.findResourceByUri.mockReturnValue({
      uri,
      serverName,
    });

    const mockClient = {
      readResource: vi.fn().mockRejectedValue(new Error('Failed to read')),
    };
    mockMcpManager.getClient.mockReturnValue(mockClient);

    const invocation = (
      tool as unknown as {
        createInvocation: (params: Record<string, unknown>) => {
          execute: (options: { abortSignal: AbortSignal }) => Promise<unknown>;
        };
      }
    ).createInvocation({ uri });
    const result = (await invocation.execute({ abortSignal })) as {
      error: { type: string; message: string };
    };

    expect(result.error?.type).toBe(ToolErrorType.MCP_TOOL_ERROR);
    expect(result.error?.message).toContain('Failed to read resource');
  });
});
