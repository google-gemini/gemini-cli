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
import { Config, ConfigParameters, ApprovalMode } from '../config/config.js';
import {
  ToolRegistry,
  DiscoveredTool,
  sanitizeParameters,
} from './tool-registry.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { BaseTool, Icon, ToolResult } from './tools.js';
import {
  FunctionDeclaration,
  CallableTool,
  mcpToTool,
  Type,
  Schema,
} from '@google/genai';
import { spawn } from 'node:child_process';

// Use vi.hoisted to define the mock function so it can be used in the vi.mock factory
const mockDiscoverMcpTools = vi.hoisted(() => vi.fn());

// Mock ./mcp-client.js to control its behavior within tool-registry tests
vi.mock('./mcp-client.js', () => ({
  discoverMcpTools: mockDiscoverMcpTools,
}));

// Mock node:child_process
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
  };
});

// Mock MCP SDK Client and Transports
const mockMcpClientConnect = vi.fn();
const mockMcpClientOnError = vi.fn();
const mockStdioTransportClose = vi.fn();
const mockSseTransportClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const MockClient = vi.fn().mockImplementation(() => ({
    connect: mockMcpClientConnect,
    set onerror(handler: any) {
      mockMcpClientOnError(handler);
    },
  }));
  return { Client: MockClient };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  const MockStdioClientTransport = vi.fn().mockImplementation(() => ({
    stderr: {
      on: vi.fn(),
    },
    close: mockStdioTransportClose,
  }));
  return { StdioClientTransport: MockStdioClientTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  const MockSSEClientTransport = vi.fn().mockImplementation(() => ({
    close: mockSseTransportClose,
  }));
  return { SSEClientTransport: MockSSEClientTransport };
});

// Mock @google/genai mcpToTool
vi.mock('@google/genai', async () => {
  const actualGenai =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actualGenai,
    mcpToTool: vi.fn().mockImplementation(() => ({
      tool: vi.fn().mockResolvedValue({ functionDeclarations: [] }),
      callTool: vi.fn(),
    })),
  };
});

// Helper to create a mock CallableTool for specific test needs
const createMockCallableTool = (
  toolDeclarations: FunctionDeclaration[],
): Mocked<CallableTool> => ({
  tool: vi.fn().mockResolvedValue({ functionDeclarations: toolDeclarations }),
  callTool: vi.fn(),
});

class MockTool extends BaseTool<{ param: string }, ToolResult> {
  constructor(
    name = 'mock-tool',
    displayName = 'A mock tool',
    description = 'A mock tool description',
  ) {
    super(name, displayName, description, Icon.Hammer, {
      type: Type.OBJECT,
      properties: {
        param: { type: Type.STRING },
      },
      required: ['param'],
    });
  }
  async execute(params: { param: string }): Promise<ToolResult> {
    return {
      llmContent: `Executed with ${params.param}`,
      returnDisplay: `Executed with ${params.param}`,
    };
  }
}

const baseConfigParams: ConfigParameters = {
  cwd: '/tmp',
  model: 'test-model',
  embeddingModel: 'test-embedding-model',
  sandbox: undefined,
  targetDir: '/test/dir',
  debugMode: false,
  userMemory: '',
  geminiMdFileCount: 0,
  approvalMode: ApprovalMode.DEFAULT,
  sessionId: 'test-session-id',
};

describe('ToolRegistry', () => {
  let config: Config;
  let toolRegistry: ToolRegistry;
  let mockConfigGetToolDiscoveryCommand: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    config = new Config(baseConfigParams);
    toolRegistry = new ToolRegistry(config);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockMcpClientConnect.mockReset().mockResolvedValue(undefined);
    mockStdioTransportClose.mockReset();
    mockSseTransportClose.mockReset();
    vi.mocked(mcpToTool).mockClear();
    vi.mocked(mcpToTool).mockReturnValue(createMockCallableTool([]));

    mockConfigGetToolDiscoveryCommand = vi.spyOn(
      config,
      'getToolDiscoveryCommand',
    );
    vi.spyOn(config, 'getMcpServers');
    vi.spyOn(config, 'getMcpServerCommand');
    mockDiscoverMcpTools.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerTool', () => {
    it('should register a new tool', () => {
      const tool = new MockTool();
      toolRegistry.registerTool(tool);
      expect(toolRegistry.getTool('mock-tool')).toBe(tool);
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools sorted alphabetically by displayName', () => {
      // Register tools with displayNames in non-alphabetical order
      const toolC = new MockTool('c-tool', 'Tool C');
      const toolA = new MockTool('a-tool', 'Tool A');
      const toolB = new MockTool('b-tool', 'Tool B');

      toolRegistry.registerTool(toolC);
      toolRegistry.registerTool(toolA);
      toolRegistry.registerTool(toolB);

      const allTools = toolRegistry.getAllTools();
      const displayNames = allTools.map((t) => t.displayName);

      // Assert that the returned array is sorted by displayName
      expect(displayNames).toEqual(['Tool A', 'Tool B', 'Tool C']);
    });
  });

  describe('getToolsByServer', () => {
    it('should return an empty array if no tools match the server name', () => {
      toolRegistry.registerTool(new MockTool());
      expect(toolRegistry.getToolsByServer('any-mcp-server')).toEqual([]);
    });

    it('should return only tools matching the server name, sorted by name', async () => {
      const server1Name = 'mcp-server-uno';
      const server2Name = 'mcp-server-dos';
      const mockCallable = {} as CallableTool;
      const mcpTool1_c = new DiscoveredMCPTool(
        mockCallable,
        server1Name,
        'zebra-tool',
        'd1',
        {},
      );
      const mcpTool1_a = new DiscoveredMCPTool(
        mockCallable,
        server1Name,
        'apple-tool',
        'd2',
        {},
      );
      const mcpTool1_b = new DiscoveredMCPTool(
        mockCallable,
        server1Name,
        'banana-tool',
        'd3',
        {},
      );

      const mcpTool2 = new DiscoveredMCPTool(
        mockCallable,
        server2Name,
        'tool-on-server2',
        'd4',
        {},
      );
      const nonMcpTool = new MockTool('regular-tool');

      toolRegistry.registerTool(mcpTool1_c);
      toolRegistry.registerTool(mcpTool1_a);
      toolRegistry.registerTool(mcpTool1_b);
      toolRegistry.registerTool(mcpTool2);
      toolRegistry.registerTool(nonMcpTool);

      const toolsFromServer1 = toolRegistry.getToolsByServer(server1Name);
      const toolNames = toolsFromServer1.map((t) => t.name);

      // Assert that the array has the correct tools and is sorted by name
      expect(toolsFromServer1).toHaveLength(3);
      expect(toolNames).toEqual(['apple-tool', 'banana-tool', 'zebra-tool']);

      // Assert that all returned tools are indeed from the correct server
      for (const tool of toolsFromServer1) {
        expect((tool as DiscoveredMCPTool).serverName).toBe(server1Name);
      }

      // Assert that the other server's tools are returned correctly
      const toolsFromServer2 = toolRegistry.getToolsByServer(server2Name);
      expect(toolsFromServer2).toHaveLength(1);
      expect(toolsFromServer2[0].name).toBe(mcpTool2.name);
    });
  });

  describe('discoverTools', () => {
    it('should sanitize tool parameters during discovery from command', async () => {
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);

      const unsanitizedToolDeclaration: FunctionDeclaration = {
        name: 'tool-with-bad-format',
        description: 'A tool with an invalid format property',
        parameters: {
          type: Type.OBJECT,
          properties: {
            some_string: {
              type: Type.STRING,
              format: 'uuid', // This is an unsupported format
            },
          },
        },
      };

      const mockSpawn = vi.mocked(spawn);
      const mockChildProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockChildProcess as any);

      // Simulate stdout data
      mockChildProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(
            Buffer.from(
              JSON.stringify([
                { function_declarations: [unsanitizedToolDeclaration] },
              ]),
            ),
          );
        }
        return mockChildProcess as any;
      });

      // Simulate process close
      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0);
        }
        return mockChildProcess as any;
      });

      await toolRegistry.discoverAllTools();

      const discoveredTool = toolRegistry.getTool('tool-with-bad-format');
      expect(discoveredTool).toBeDefined();

      const registeredParams = (discoveredTool as DiscoveredTool).schema
        .parameters as Schema;
      expect(registeredParams.properties?.['some_string']).toBeDefined();
      expect(registeredParams.properties?.['some_string']).toHaveProperty(
        'format',
        undefined,
      );
    });

    it('should discover tools using MCP servers defined in getMcpServers', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      vi.spyOn(config, 'getMcpServerCommand').mockReturnValue(undefined);
      const mcpServerConfigVal = {
        'my-mcp-server': {
          command: 'mcp-server-cmd',
          args: ['--port', '1234'],
          trust: true,
        },
      };
      vi.spyOn(config, 'getMcpServers').mockReturnValue(mcpServerConfigVal);

      await toolRegistry.discoverAllTools();

      expect(mockDiscoverMcpTools).toHaveBeenCalledWith(
        mcpServerConfigVal,
        undefined,
        toolRegistry,
        undefined,
        false,
      );
    });

    it('should discover tools using MCP servers defined in getMcpServers', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      vi.spyOn(config, 'getMcpServerCommand').mockReturnValue(undefined);
      const mcpServerConfigVal = {
        'my-mcp-server': {
          command: 'mcp-server-cmd',
          args: ['--port', '1234'],
          trust: true,
        },
      };
      vi.spyOn(config, 'getMcpServers').mockReturnValue(mcpServerConfigVal);

      await toolRegistry.discoverAllTools();

      expect(mockDiscoverMcpTools).toHaveBeenCalledWith(
        mcpServerConfigVal,
        undefined,
        toolRegistry,
        undefined,
        false,
      );
    });
  });
});

describe('sanitizeParameters', () => {
  it('should remove default when anyOf is present', () => {
    const schema: Schema = {
      anyOf: [{ type: Type.STRING }, { type: Type.NUMBER }],
      default: 'hello',
    };
    sanitizeParameters(schema);
    expect(schema.default).toBeUndefined();
  });

  it('should recursively sanitize items in anyOf', () => {
    const schema: Schema = {
      anyOf: [
        {
          anyOf: [{ type: Type.STRING }],
          default: 'world',
        },
        { type: Type.NUMBER },
      ],
    };
    sanitizeParameters(schema);
    expect(schema.anyOf![0].default).toBeUndefined();
  });

  it('should recursively sanitize items in items', () => {
    const schema: Schema = {
      items: {
        anyOf: [{ type: Type.STRING }],
        default: 'world',
      },
    };
    sanitizeParameters(schema);
    expect(schema.items!.default).toBeUndefined();
  });

  it('should recursively sanitize items in properties', () => {
    const schema: Schema = {
      properties: {
        prop1: {
          anyOf: [{ type: Type.STRING }],
          default: 'world',
        },
      },
    };
    sanitizeParameters(schema);
    expect(schema.properties!.prop1.default).toBeUndefined();
  });

  it('should handle complex nested schemas', () => {
    const schema: Schema = {
      properties: {
        prop1: {
          items: {
            anyOf: [{ type: Type.STRING }],
            default: 'world',
          },
        },
        prop2: {
          anyOf: [
            {
              properties: {
                nestedProp: {
                  anyOf: [{ type: Type.NUMBER }],
                  default: 123,
                },
              },
            },
          ],
        },
      },
    };
    sanitizeParameters(schema);
    expect(schema.properties!.prop1.items!.default).toBeUndefined();
    const nestedProp =
      schema.properties!.prop2.anyOf![0].properties!.nestedProp;
    expect(nestedProp?.default).toBeUndefined();
  });

  it('should remove unsupported format from a simple string property', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        id: { type: Type.STRING, format: 'uuid' },
      },
    };
    sanitizeParameters(schema);
    expect(schema.properties?.['id']).toHaveProperty('format', undefined);
    expect(schema.properties?.['name']).not.toHaveProperty('format');
  });

  it('should NOT remove supported format values', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, format: 'date-time' },
        role: {
          type: Type.STRING,
          format: 'enum',
          enum: ['admin', 'user'],
        },
      },
    };
    const originalSchema = JSON.parse(JSON.stringify(schema));
    sanitizeParameters(schema);
    expect(schema).toEqual(originalSchema);
  });

  it('should handle arrays of objects', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              itemId: { type: Type.STRING, format: 'uuid' },
            },
          },
        },
      },
    };
    sanitizeParameters(schema);
    expect(
      (schema.properties?.['items']?.items as Schema)?.properties?.['itemId'],
    ).toHaveProperty('format', undefined);
  });

  it('should handle schemas with no properties to sanitize', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        count: { type: Type.NUMBER },
        isActive: { type: Type.BOOLEAN },
      },
    };
    const originalSchema = JSON.parse(JSON.stringify(schema));
    sanitizeParameters(schema);
    expect(schema).toEqual(originalSchema);
  });

  it('should not crash on an empty or undefined schema', () => {
    expect(() => sanitizeParameters({})).not.toThrow();
    expect(() => sanitizeParameters(undefined)).not.toThrow();
  });

  it('should handle complex nested schemas with cycles', () => {
    const userNode: any = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, format: 'uuid' },
        name: { type: Type.STRING },
        manager: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, format: 'uuid' },
          },
        },
      },
    };
    userNode.properties.reports = {
      type: Type.ARRAY,
      items: userNode,
    };

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        ceo: userNode,
      },
    };

    expect(() => sanitizeParameters(schema)).not.toThrow();
    expect(schema.properties?.['ceo']?.properties?.['id']).toHaveProperty(
      'format',
      undefined,
    );
    expect(
      schema.properties?.['ceo']?.properties?.['manager']?.properties?.['id'],
    ).toHaveProperty('format', undefined);
  });
});
