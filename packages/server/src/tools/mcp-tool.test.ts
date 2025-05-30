/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  Mocked,
} from 'vitest';
import {
  DiscoveredMCPTool,
  MCP_TOOL_DEFAULT_TIMEOUT_MSEC,
} from './mcp-tool.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ToolResult } from './tools.js';

// Mock MCP SDK Client
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const MockClient = vi.fn();
  MockClient.prototype.callTool = vi.fn();
  return { Client: MockClient };
});

describe('DiscoveredMCPTool', () => {
  let mockMcpClient: Mocked<Client>;
  const toolName = 'test-mcp-tool';
  const serverToolName = 'actual-server-tool-name';
  const baseDescription = 'A test MCP tool.';
  const inputSchema = {
    type: 'object' as const,
    properties: { param: { type: 'string' } },
  };

  beforeEach(() => {
    // Create a new mock client for each test to reset call history
    mockMcpClient = new (Client as any)({
      name: 'test-client',
      version: '0.0.1',
    }) as Mocked<Client>;
    vi.mocked(mockMcpClient.callTool).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should set properties correctly and augment description', () => {
      const tool = new DiscoveredMCPTool(
        mockMcpClient,
        'mock-mcp-server',
        toolName,
        baseDescription,
        inputSchema,
        serverToolName,
      );

      expect(tool.name).toBe(toolName);
      expect(tool.schema.name).toBe(toolName);
      expect(tool.schema.description).toContain(baseDescription);
      expect(tool.schema.description).toContain('This MCP tool was discovered');
      // Corrected assertion for backticks and template literal
      expect(tool.schema.description).toContain(
        `tools/call\` method for tool name \`${toolName}\``,
      );
      expect(tool.schema.parameters).toEqual(inputSchema);
      expect(tool.serverToolName).toBe(serverToolName);
      expect(tool.timeout).toBeUndefined();
    });

    it('should accept and store a custom timeout', () => {
      const customTimeout = 5000;
      const tool = new DiscoveredMCPTool(
        mockMcpClient,
        'mock-mcp-server',
        toolName,
        baseDescription,
        inputSchema,
        serverToolName,
        customTimeout,
      );
      expect(tool.timeout).toBe(customTimeout);
    });
  });

  describe('execute', () => {
    it('should call mcpClient.callTool with correct parameters and default timeout', async () => {
      const tool = new DiscoveredMCPTool(
        mockMcpClient,
        'mock-mcp-server',
        toolName,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'testValue' };
      const expectedMcpResult = { success: true, details: 'executed' };
      vi.mocked(mockMcpClient.callTool).mockResolvedValue(expectedMcpResult);

      const result: ToolResult = await tool.execute(params);

      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        {
          name: serverToolName,
          arguments: params,
        },
        undefined,
        {
          timeout: MCP_TOOL_DEFAULT_TIMEOUT_MSEC,
        },
      );
      const expectedOutput =
        '```json\n' + JSON.stringify(expectedMcpResult, null, 2) + '\n```';
      expect(result.llmContent).toBe(expectedOutput);
      expect(result.returnDisplay).toBe(expectedOutput);
    });

    it('should call mcpClient.callTool with custom timeout if provided', async () => {
      const customTimeout = 15000;
      const tool = new DiscoveredMCPTool(
        mockMcpClient,
        'mock-mcp-server',
        toolName,
        baseDescription,
        inputSchema,
        serverToolName,
        customTimeout,
      );
      const params = { param: 'anotherValue' };
      const expectedMcpResult = { result: 'done' };
      vi.mocked(mockMcpClient.callTool).mockResolvedValue(expectedMcpResult);

      await tool.execute(params);

      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        {
          timeout: customTimeout,
        },
      );
    });

    it('should propagate rejection if mcpClient.callTool rejects', async () => {
      const tool = new DiscoveredMCPTool(
        mockMcpClient,
        'mock-mcp-server',
        toolName,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'failCase' };
      const expectedError = new Error('MCP call failed');
      vi.mocked(mockMcpClient.callTool).mockRejectedValue(expectedError);

      await expect(tool.execute(params)).rejects.toThrow(expectedError);
    });
  });
});
