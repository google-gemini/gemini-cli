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

  describe('Input blocker re-injection', () => {
    it('should remove and re-inject input blocker around navigate_page when shouldDisableInput is true', async () => {
      // Add navigate_page to discovered tools
      mockMcpTools.push({
        name: 'navigate_page',
        description: 'Navigate to URL',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
      });

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        true, // shouldDisableInput
      );

      const navigateTool = tools.find((t) => t.name === 'navigate_page')!;
      const invocation = navigateTool.build({ url: 'https://example.com' });
      await invocation.execute(new AbortController().signal);

      // callTool is called 3 times: remove blocker, navigate_page, re-inject blocker
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(3);

      // First call: remove blocker
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        1,
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('__gemini_input_blocker'),
        }),
      );

      // Second call: navigate_page
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        2,
        'navigate_page',
        { url: 'https://example.com' },
        expect.any(AbortSignal),
      );

      // Third call: re-inject blocker
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        3,
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('__gemini_input_blocker'),
        }),
      );
    });

    it('should remove and re-inject input blocker around take_snapshot too', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        true, // shouldDisableInput
      );

      const snapshotTool = tools.find((t) => t.name === 'take_snapshot')!;
      const invocation = snapshotTool.build({});
      await invocation.execute(new AbortController().signal);

      // callTool is called 3 times: remove blocker, take_snapshot, re-inject blocker
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(3);
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        2,
        'take_snapshot',
        {},
        expect.any(AbortSignal),
      );
    });

    it('should NOT remove/re-inject input blocker when shouldDisableInput is false', async () => {
      mockMcpTools.push({
        name: 'navigate_page',
        description: 'Navigate to URL',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
      });

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false, // shouldDisableInput disabled
      );

      const navigateTool = tools.find((t) => t.name === 'navigate_page')!;
      const invocation = navigateTool.build({ url: 'https://example.com' });
      await invocation.execute(new AbortController().signal);

      // callTool should only be called once for navigate_page
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(1);
    });

    it('should remove and re-inject input blocker around click when shouldDisableInput is true', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        true, // shouldDisableInput
      );

      const clickTool = tools.find((t) => t.name === 'click')!;
      const invocation = clickTool.build({ uid: 'elem-42' });
      await invocation.execute(new AbortController().signal);

      // callTool: remove blocker + click + re-inject blocker
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(3);

      // Verify the actual click happened in the middle
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        2,
        'click',
        { uid: 'elem-42' },
        expect.any(AbortSignal),
      );
    });

    it('should re-inject input blocker even when tool execution fails', async () => {
      vi.mocked(mockBrowserManager.callTool)
        .mockResolvedValueOnce({ content: [] }) // remove blocker succeeds
        .mockRejectedValueOnce(new Error('Click failed')) // tool fails
        .mockResolvedValueOnce({ content: [] }); // re-inject succeeds

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        true, // shouldDisableInput
      );

      const clickTool = tools.find((t) => t.name === 'click')!;
      const invocation = clickTool.build({ uid: 'bad-elem' });
      const result = await invocation.execute(new AbortController().signal);

      // Should return error, not throw
      expect(result.error).toBeDefined();
      // Should still try to re-inject
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(3);
    });
  });
});
