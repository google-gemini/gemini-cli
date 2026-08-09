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
        false,
      );

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('take_snapshot');
      expect(tools[1].name).toBe('click');
    });

    it('should return tools with correct description', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false,
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
        false,
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
        false,
      );

      const invocation = tools[0].build({ verbose: true });

      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual({ verbose: true });
    });

    it('should return invocation with correct description', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false,
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
        false,
      );

      const invocation = tools[1].build({ uid: 'elem-123' });
      await invocation.execute({ abortSignal: new AbortController().signal });

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
        false,
      );

      const invocation = tools[0].build({ verbose: true });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

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
        false,
      );

      const invocation = tools[1].build({ uid: 'invalid' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

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
        false,
      );

      const invocation = tools[0].build({});
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Connection lost');
    });
  });

  describe('Input blocker suspend/resume', () => {
    it('should suspend and resume input blocker around click (interactive tool)', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        true, // shouldDisableInput
      );

      const clickTool = tools.find((t) => t.name === 'click')!;
      const invocation = clickTool.build({ uid: 'elem-42' });
      await invocation.execute({ abortSignal: new AbortController().signal });

      // callTool: suspend blocker + click + resume blocker
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(3);

      // First call: suspend blocker (pointer-events: none)
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        1,
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('__gemini_input_blocker'),
        }),
        expect.any(AbortSignal),
        true,
      );

      // Second call: click
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        2,
        'click',
        { uid: 'elem-42' },
        expect.any(AbortSignal),
      );

      // Third call: resume blocker (pointer-events: auto)
      expect(mockBrowserManager.callTool).toHaveBeenNthCalledWith(
        3,
        'evaluate_script',
        expect.objectContaining({
          function: expect.stringContaining('__gemini_input_blocker'),
        }),
        expect.any(AbortSignal),
        true,
      );
    });

    it('should NOT suspend/resume for take_snapshot (read-only tool)', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        true, // shouldDisableInput
      );

      const snapshotTool = tools.find((t) => t.name === 'take_snapshot')!;
      const invocation = snapshotTool.build({});
      await invocation.execute({ abortSignal: new AbortController().signal });

      // callTool should only be called once for take_snapshot — no suspend/resume
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(1);
      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'take_snapshot',
        {},
        expect.any(AbortSignal),
      );
    });

    it('should NOT suspend/resume when shouldDisableInput is false', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false, // shouldDisableInput disabled
      );

      const clickTool = tools.find((t) => t.name === 'click')!;
      const invocation = clickTool.build({ uid: 'elem-42' });
      await invocation.execute({ abortSignal: new AbortController().signal });

      // callTool should only be called once for click — no suspend/resume
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(1);
    });

    it('should resume blocker even when interactive tool fails', async () => {
      vi.mocked(mockBrowserManager.callTool)
        .mockResolvedValueOnce({ content: [] }) // suspend blocker succeeds
        .mockRejectedValueOnce(new Error('Click failed')) // tool fails
        .mockResolvedValueOnce({ content: [] }); // resume succeeds

      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        true, // shouldDisableInput
      );

      const clickTool = tools.find((t) => t.name === 'click')!;
      const invocation = clickTool.build({ uid: 'bad-elem' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      // Should return error, not throw
      expect(result.error).toBeDefined();
      // Should still try to resume
      expect(mockBrowserManager.callTool).toHaveBeenCalledTimes(3);
    });
  });

  describe('Hard Block: upload_file', () => {
    beforeEach(() => {
      mockMcpTools.push({
        name: 'upload_file',
        description: 'Upload a file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      });
    });

    it('should block upload_file when blockFileUploads is true', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false,
        true, // blockFileUploads
      );

      const uploadTool = tools.find((t) => t.name === 'upload_file')!;
      const invocation = uploadTool.build({ path: 'test.txt' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('File uploads are blocked');
      expect(mockBrowserManager.callTool).not.toHaveBeenCalled();
    });

    it('should NOT block upload_file when blockFileUploads is false', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false,
        false, // blockFileUploads
      );

      const uploadTool = tools.find((t) => t.name === 'upload_file')!;
      const invocation = uploadTool.build({ path: 'test.txt' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toBe('Tool result');
      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'upload_file',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
