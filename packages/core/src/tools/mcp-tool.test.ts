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
import { DiscoveredMCPTool, generateValidName } from './mcp-tool.js'; // Added getStringifiedResultForDisplay
import { ToolResult, ToolConfirmationOutcome } from './tools.js'; // Added ToolConfirmationOutcome
import { CallableTool, Part } from '@google/genai';

// Mock @google/genai mcpToTool and CallableTool
// We only need to mock the parts of CallableTool that DiscoveredMCPTool uses.
const mockCallTool = vi.fn();
const mockToolMethod = vi.fn();

const mockCallableToolInstance: Mocked<CallableTool> = {
  tool: mockToolMethod as any, // Not directly used by DiscoveredMCPTool instance methods
  callTool: mockCallTool as any,
  // Add other methods if DiscoveredMCPTool starts using them
};

describe('generateValidName', () => {
  it('should return a valid name for a simple function', () => {
    expect(generateValidName('myFunction')).toBe('myFunction');
  });

  it('should replace invalid characters with underscores', () => {
    expect(generateValidName('invalid-name with spaces')).toBe(
      'invalid-name_with_spaces',
    );
  });

  it('should truncate long names', () => {
    expect(generateValidName('x'.repeat(80))).toBe(
      'xxxxxxxxxxxxxxxxxxxxxxxxxxxx___xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    );
  });

  it('should handle names with only invalid characters', () => {
    expect(generateValidName('!@#$%^&*()')).toBe('__________');
  });

  it('should handle names that are exactly 63 characters long', () => {
    expect(generateValidName('a'.repeat(63)).length).toBe(63);
  });

  it('should handle names that are exactly 64 characters long', () => {
    expect(generateValidName('a'.repeat(64)).length).toBe(63);
  });

  it('should handle names that are longer than 64 characters', () => {
    expect(generateValidName('a'.repeat(80)).length).toBe(63);
  });
});

describe('DiscoveredMCPTool', () => {
  const serverName = 'mock-mcp-server';
  const serverToolName = 'actual-server-tool-name';
  const baseDescription = 'A test MCP tool.';
  const inputSchema: Record<string, unknown> = {
    type: 'object' as const,
    properties: { param: { type: 'string' } },
    required: ['param'],
  };

  beforeEach(() => {
    mockCallTool.mockClear();
    mockToolMethod.mockClear();
    // Clear allowlist before each relevant test, especially for shouldConfirmExecute
    (DiscoveredMCPTool as any).allowlist.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should set properties correctly', () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );

      expect(tool.name).toBe(serverToolName);
      expect(tool.schema.name).toBe(serverToolName);
      expect(tool.schema.description).toBe(baseDescription);
      expect(tool.schema.parameters).toBeUndefined();
      expect(tool.schema.parametersJsonSchema).toEqual(inputSchema);
      expect(tool.serverToolName).toBe(serverToolName);
      expect(tool.timeout).toBeUndefined();
    });

    it('should accept and store a custom timeout', () => {
      const customTimeout = 5000;
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
        customTimeout,
      );
      expect(tool.timeout).toBe(customTimeout);
    });
  });

  describe('execute', () => {
    it('should call mcpTool.callTool with correct parameters and format display output', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const params = { param: 'testValue' };
      const mockToolSuccessResultObject = {
        success: true,
        details: 'executed',
      };
      const mockFunctionResponseContent: Part[] = [
        { text: JSON.stringify(mockToolSuccessResultObject) },
      ];
      const mockMcpToolResponseParts: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: { content: mockFunctionResponseContent },
          },
        },
      ];
      mockCallTool.mockResolvedValue(mockMcpToolResponseParts);

      const toolResult: ToolResult = await tool.execute(params);

      expect(mockCallTool).toHaveBeenCalledWith([
        { name: serverToolName, args: params },
      ]);
      expect(toolResult.llmContent).toEqual(mockMcpToolResponseParts);

      const stringifiedResponseContent = JSON.stringify(
        mockToolSuccessResultObject,
      );
      expect(toolResult.returnDisplay).toBe(stringifiedResponseContent);
    });

    it('should handle empty result from getStringifiedResultForDisplay', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const params = { param: 'testValue' };
      const mockMcpToolResponsePartsEmpty: Part[] = [];
      mockCallTool.mockResolvedValue(mockMcpToolResponsePartsEmpty);
      const toolResult: ToolResult = await tool.execute(params);
      expect(toolResult.returnDisplay).toBe('```json\n[]\n```');
    });

    it('should propagate rejection if mcpTool.callTool rejects', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const params = { param: 'failCase' };
      const expectedError = new Error('MCP call failed');
      mockCallTool.mockRejectedValue(expectedError);

      await expect(tool.execute(params)).rejects.toThrow(expectedError);
    });
  });

  describe('shouldConfirmExecute', () => {
    // beforeEach is already clearing allowlist

    it('should return false if trust is true', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
        undefined,
        true,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
    });

    it('should return false if server is allowlisted', async () => {
      (DiscoveredMCPTool as any).allowlist.add(serverName);
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
    });

    it('should return false if tool is allowlisted', async () => {
      const toolAllowlistKey = `${serverName}.${serverToolName}`;
      (DiscoveredMCPTool as any).allowlist.add(toolAllowlistKey);
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
    });

    it('should return confirmation details if not trusted and not allowlisted', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (confirmation && confirmation.type === 'mcp') {
        // Type guard for ToolMcpConfirmationDetails
        expect(confirmation.type).toBe('mcp');
        expect(confirmation.serverName).toBe(serverName);
        expect(confirmation.toolName).toBe(serverToolName);
      } else if (confirmation) {
        // Handle other possible confirmation types if necessary, or strengthen test if only MCP is expected
        throw new Error(
          'Confirmation was not of expected type MCP or was false',
        );
      } else {
        throw new Error(
          'Confirmation details not in expected format or was false',
        );
      }
    });

    it('should add server to allowlist on ProceedAlwaysServer', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(
          ToolConfirmationOutcome.ProceedAlwaysServer,
        );
        expect((DiscoveredMCPTool as any).allowlist.has(serverName)).toBe(true);
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should add tool to allowlist on ProceedAlwaysTool', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const toolAllowlistKey = `${serverName}.${serverToolName}`;
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedAlwaysTool);
        expect((DiscoveredMCPTool as any).allowlist.has(toolAllowlistKey)).toBe(
          true,
        );
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should handle Cancel confirmation outcome', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        // Cancel should not add anything to allowlist
        await confirmation.onConfirm(ToolConfirmationOutcome.Cancel);
        expect((DiscoveredMCPTool as any).allowlist.has(serverName)).toBe(
          false,
        );
        expect(
          (DiscoveredMCPTool as any).allowlist.has(
            `${serverName}.${serverToolName}`,
          ),
        ).toBe(false);
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should handle ProceedOnce confirmation outcome', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        // ProceedOnce should not add anything to allowlist
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedOnce);
        expect((DiscoveredMCPTool as any).allowlist.has(serverName)).toBe(
          false,
        );
        expect(
          (DiscoveredMCPTool as any).allowlist.has(
            `${serverName}.${serverToolName}`,
          ),
        ).toBe(false);
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });
  });
});
