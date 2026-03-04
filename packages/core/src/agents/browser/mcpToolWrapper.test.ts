/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import type { BrowserManager, McpToolCallResult } from './browserManager.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';

describe('mcpToolWrapper', () => {
  let mockBrowserManager: BrowserManager;
  let mockMessageBus: MessageBus;
  let mockMcpTools: McpTool[];

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup mock MCP tools discovered from server
    mockMcpTools = [
      {
        name: 'take_snapshot',
        description: 'Take a snapshot of the page accessibility tree',
        inputSchema: {
          type: 'object',
          properties: {
            verbose: { type: 'boolean', description: 'Include details' },
          },
        },
      },
      {
        name: 'click',
        description: 'Click on an element by uid',
        inputSchema: {
          type: 'object',
          properties: {
            uid: { type: 'string', description: 'Element uid' },
          },
          required: ['uid'],
        },
      },
    ];

    // Setup mock browser manager
    mockBrowserManager = {
      getDiscoveredTools: vi.fn().mockResolvedValue(mockMcpTools),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tool result' }],
      } as McpToolCallResult),
    } as unknown as BrowserManager;

    // Setup mock message bus
    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createMcpDeclarativeTools', () => {
    it('should create declarative tools from discovered MCP tools', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe('take_snapshot');
      expect(tools[1].name).toBe('click');
      expect(tools[2].name).toBe('type_text');
    });

    it('should return tools with correct description', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      // Descriptions include augmented hints, so we check they contain the original
      expect(tools[0].description).toContain(
        'Take a snapshot of the page accessibility tree',
      );
      expect(tools[1].description).toContain('Click on an element by uid');
    });

    it('should return tools with proper FunctionDeclaration schema', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const schema = tools[0].schema;
      expect(schema.name).toBe('take_snapshot');
      expect(schema.parametersJsonSchema).toBeDefined();
    });
  });

  describe('McpDeclarativeTool.build', () => {
    it('should create invocation that can be executed', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[0].build({ verbose: true });

      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual({ verbose: true });
    });

    it('should return invocation with correct description', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[0].build({});

      expect(invocation.getDescription()).toContain('take_snapshot');
    });
  });

  describe('McpToolInvocation.execute', () => {
    it('should call browserManager.callTool with correct params', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[1].build({ uid: 'elem-123' });
      await invocation.execute(new AbortController().signal);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'click',
        {
          uid: 'elem-123',
        },
        expect.any(AbortSignal),
      );
    });

    it('should return success result from MCP tool', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[0].build({ verbose: true });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toBe('Tool result');
      expect(result.error).toBeUndefined();
    });

    it('should handle MCP tool errors', async () => {
      vi.mocked(mockBrowserManager.callTool).mockResolvedValue({
        content: [{ type: 'text', text: 'Element not found' }],
        isError: true,
      } as McpToolCallResult);

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[1].build({ uid: 'invalid' });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Element not found');
    });

    it('should handle exceptions during tool call', async () => {
      vi.mocked(mockBrowserManager.callTool).mockRejectedValue(
        new Error('Connection lost'),
      );

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[0].build({});
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Connection lost');
    });
  });
});
