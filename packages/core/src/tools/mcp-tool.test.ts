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
  generateValidName,
  hasCycleInSchema,
} from './mcp-tool.js'; // Added getStringifiedResultForDisplay
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

  describe('with cyclic schema', () => {
    const cyclicSchema = {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/data' },
          },
        },
      },
    };

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    it('should be marked as cyclic and have a modified description', () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        cyclicSchema,
      );
      expect(tool.isCyclic).toBe(true);
      expect(tool.description).toBe(
        `[DISABLED - CYCLIC SCHEMA] ${baseDescription}`,
      );
      expect(console.warn).toHaveBeenCalledWith(
        `Tool "${serverToolName}" from server "${serverName}" has a cyclic schema and will be disabled.`,
      );
    });
  });
});

describe('hasCycleInSchema', () => {
  it('should detect a simple direct cycle', () => {
    const schema = {
      properties: {
        data: {
          $ref: '#/properties/data',
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle from object properties referencing parent properties', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/data' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle from array items referencing parent properties', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              child: { $ref: '#/properties/data/items' },
            },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle between sibling properties', () => {
    const schema = {
      type: 'object',
      properties: {
        a: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/b' },
          },
        },
        b: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/a' },
          },
        },
      },
    };;
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should not detect a cycle in a valid schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { $ref: '#/definitions/address' },
      },
      definitions: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should handle non-cyclic sibling refs', () => {
    const schema = {
      properties: {
        a: { $ref: '#/definitions/stringDef' },
        b: { $ref: '#/definitions/stringDef' },
      },
      definitions: {
        stringDef: { type: 'string' },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should handle nested but not cyclic refs', () => {
    const schema = {
      properties: {
        a: { $ref: '#/definitions/defA' },
      },
      definitions: {
        defA: { properties: { b: { $ref: '#/definitions/defB' } } },
        defB: { type: 'string' },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should return false for an empty schema', () => {
    expect(hasCycleInSchema({})).toBe(false);
  });
});
