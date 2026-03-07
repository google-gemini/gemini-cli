/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import type { BrowserManager, McpToolCallResult } from './browserManager.js';
import type { Config } from '../../config/config.js';
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
      {
        name: 'click_at',
        description: 'Click at a specific coordinate',
        inputSchema: {
          type: 'object',
          properties: {
            coordinate: { type: 'array', items: { type: 'number' } },
          },
        },
      },
      {
        name: 'press_key',
        description: 'Press a specific key',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
          },
        },
      },
    ];

    const mockConfig = {
      getBrowserAgentConfig: vi.fn().mockReturnValue({
        customConfig: {
          showCursorAnimations: true,
          headless: false,
        },
      }),
    } as unknown as Config;

    // Setup mock browser manager
    mockBrowserManager = {
      getDiscoveredTools: vi.fn().mockResolvedValue(mockMcpTools),
      getConfig: vi.fn().mockReturnValue(mockConfig),
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

      expect(tools).toHaveLength(5);
      expect(tools[0].name).toBe('take_snapshot');
      expect(tools[1].name).toBe('click');
      expect(tools[2].name).toBe('click_at');
      expect(tools[3].name).toBe('press_key');
      expect(tools[4].name).toBe('type_text');
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
    it('should inject animation for click by uid', async () => {
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

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('[data-uid="elem-123"]'),
        }),
        expect.any(AbortSignal),
      );
    });

    it('should inject animation for click_at', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[2].build({ coordinate: [100, 200] });
      await invocation.execute(new AbortController().signal);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'click_at',
        { coordinate: [100, 200] },
        expect.any(AbortSignal),
      );

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('__gemini_click'),
        }),
        expect.any(AbortSignal),
      );
    });

    it('should inject animation for click_at with zero coordinates', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[2].build({ coordinate: [0, 0] });
      await invocation.execute(new AbortController().signal);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('__gemini_click'),
        }),
        expect.any(AbortSignal),
      );
    });

    it('should inject animation for press_key with scroll key', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[3].build({ key: 'PageDown' });
      await invocation.execute(new AbortController().signal);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('__gemini_scroll_down'),
        }),
        expect.any(AbortSignal),
      );
    });

    it('should NOT inject animation if headless=true', async () => {
      const headlessConfig = {
        getBrowserAgentConfig: vi.fn().mockReturnValue({
          customConfig: { showCursorAnimations: true, headless: true },
        }),
      } as unknown as Config;
      vi.mocked(mockBrowserManager.getConfig).mockReturnValue(headlessConfig);

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[2].build({ coordinate: [100, 200] });
      await invocation.execute(new AbortController().signal);

      // It should only be called once, for click_at, but NOT for evaluate_script
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(1);
    });

    it('should NOT inject animation if showCursorAnimations=false', async () => {
      const noAnimConfig = {
        getBrowserAgentConfig: vi.fn().mockReturnValue({
          customConfig: { showCursorAnimations: false, headless: false },
        }),
      } as unknown as Config;
      vi.mocked(mockBrowserManager.getConfig).mockReturnValue(noAnimConfig);

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
      );

      const invocation = tools[2].build({ coordinate: [100, 200] });
      await invocation.execute(new AbortController().signal);

      // It should only be called once, for click_at, but NOT for evaluate_script
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(1);
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
