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
import { discoverMcpTools, sanitizeParameters } from './mcp-client.js';
import { Schema, Type } from '@google/genai';
import { Config, MCPServerConfig } from '../config/config.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parse, ParseEntry } from 'shell-quote';

// Mock dependencies
vi.mock('shell-quote');

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const MockedClient = vi.fn();
  MockedClient.prototype.connect = vi.fn();
  MockedClient.prototype.listTools = vi.fn();
  // Ensure instances have an onerror property that can be spied on or assigned to
  MockedClient.mockImplementation(() => ({
    connect: MockedClient.prototype.connect,
    listTools: MockedClient.prototype.listTools,
    onerror: vi.fn(), // Each instance gets its own onerror mock
  }));
  return { Client: MockedClient };
});

// Define a global mock for stderr.on that can be cleared and checked
const mockGlobalStdioStderrOn = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  // This is the constructor for StdioClientTransport
  const MockedStdioTransport = vi.fn().mockImplementation(function (
    this: any,
    options: any,
  ) {
    // Always return a new object with a fresh reference to the global mock for .on
    this.options = options;
    this.stderr = { on: mockGlobalStdioStderrOn };
    this.close = vi.fn().mockResolvedValue(undefined); // Add mock close method
    return this;
  });
  return { StdioClientTransport: MockedStdioTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  const MockedSSETransport = vi.fn().mockImplementation(function (this: any) {
    this.close = vi.fn().mockResolvedValue(undefined); // Add mock close method
    return this;
  });
  return { SSEClientTransport: MockedSSETransport };
});

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  const MockedStreamableHTTPTransport = vi.fn().mockImplementation(function (
    this: any,
  ) {
    this.close = vi.fn().mockResolvedValue(undefined); // Add mock close method
    return this;
  });
  return { StreamableHTTPClientTransport: MockedStreamableHTTPTransport };
});

const mockToolRegistryInstance = {
  registerTool: vi.fn(),
  getToolsByServer: vi.fn().mockReturnValue([]), // Default to empty array
  // Add other methods if they are called by the code under test, with default mocks
  getTool: vi.fn(),
  getAllTools: vi.fn().mockReturnValue([]),
  getFunctionDeclarations: vi.fn().mockReturnValue([]),
  discoverTools: vi.fn().mockResolvedValue(undefined),
};
vi.mock('./tool-registry.js', () => ({
  ToolRegistry: vi.fn(() => mockToolRegistryInstance),
}));

describe('discoverMcpTools', () => {
  let mockConfig: Mocked<Config>;
  // Use the instance from the module mock
  let mockToolRegistry: typeof mockToolRegistryInstance;

  beforeEach(() => {
    // Assign the shared mock instance to the test-scoped variable
    mockToolRegistry = mockToolRegistryInstance;
    // Reset individual spies on the shared instance before each test
    mockToolRegistry.registerTool.mockClear();
    mockToolRegistry.getToolsByServer.mockClear().mockReturnValue([]); // Reset to default
    mockToolRegistry.getTool.mockClear().mockReturnValue(undefined); // Default to no existing tool
    mockToolRegistry.getAllTools.mockClear().mockReturnValue([]);
    mockToolRegistry.getFunctionDeclarations.mockClear().mockReturnValue([]);
    mockToolRegistry.discoverTools.mockClear().mockResolvedValue(undefined);

    mockConfig = {
      getMcpServers: vi.fn().mockReturnValue({}),
      getMcpServerCommand: vi.fn().mockReturnValue(undefined),
      // getToolRegistry should now return the same shared mock instance
      getToolRegistry: vi.fn(() => mockToolRegistry),
    } as any;

    vi.mocked(parse).mockClear();
    vi.mocked(Client).mockClear();
    vi.mocked(Client.prototype.connect)
      .mockClear()
      .mockResolvedValue(undefined);
    vi.mocked(Client.prototype.listTools)
      .mockClear()
      .mockResolvedValue({ tools: [] });

    vi.mocked(StdioClientTransport).mockClear();
    // Ensure the StdioClientTransport mock constructor returns an object with a close method
    vi.mocked(StdioClientTransport).mockImplementation(function (
      this: any,
      options: any,
    ) {
      this.options = options;
      this.stderr = { on: mockGlobalStdioStderrOn };
      this.close = vi.fn().mockResolvedValue(undefined);
      return this;
    });
    mockGlobalStdioStderrOn.mockClear(); // Clear the global mock in beforeEach

    vi.mocked(SSEClientTransport).mockClear();
    // Ensure the SSEClientTransport mock constructor returns an object with a close method
    vi.mocked(SSEClientTransport).mockImplementation(function (this: any) {
      this.close = vi.fn().mockResolvedValue(undefined);
      return this;
    });

    vi.mocked(StreamableHTTPClientTransport).mockClear();
    // Ensure the StreamableHTTPClientTransport mock constructor returns an object with a close method
    vi.mocked(StreamableHTTPClientTransport).mockImplementation(function (
      this: any,
    ) {
      this.close = vi.fn().mockResolvedValue(undefined);
      return this;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should do nothing if no MCP servers or command are configured', async () => {
    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );
    expect(mockConfig.getMcpServers).toHaveBeenCalledTimes(1);
    expect(mockConfig.getMcpServerCommand).toHaveBeenCalledTimes(1);
    expect(Client).not.toHaveBeenCalled();
    expect(mockToolRegistry.registerTool).not.toHaveBeenCalled();
  });

  it('should discover tools via mcpServerCommand', async () => {
    const commandString = 'my-mcp-server --start';
    const parsedCommand = ['my-mcp-server', '--start'] as ParseEntry[];
    mockConfig.getMcpServerCommand.mockReturnValue(commandString);
    vi.mocked(parse).mockReturnValue(parsedCommand);

    const mockTool = {
      name: 'tool1',
      description: 'desc1',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    // PRE-MOCK getToolsByServer for the expected server name
    // In this case, listTools fails, so no tools are registered.
    // The default mock `mockReturnValue([])` from beforeEach should apply.

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(parse).toHaveBeenCalledWith(commandString, process.env);
    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: parsedCommand[0],
      args: parsedCommand.slice(1),
      env: expect.any(Object),
      cwd: undefined,
      stderr: 'pipe',
    });
    expect(Client.prototype.connect).toHaveBeenCalledTimes(1);
    expect(Client.prototype.listTools).toHaveBeenCalledTimes(1);
    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(1);
    expect(mockToolRegistry.registerTool).toHaveBeenCalledWith(
      expect.any(DiscoveredMCPTool),
    );
    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    expect(registeredTool.name).toBe('tool1');
    expect(registeredTool.serverToolName).toBe('tool1');
  });

  it('should discover tools via mcpServers config (stdio)', async () => {
    const serverConfig: MCPServerConfig = {
      command: './mcp-stdio',
      args: ['arg1'],
    };
    mockConfig.getMcpServers.mockReturnValue({ 'stdio-server': serverConfig });

    const mockTool = {
      name: 'tool-stdio',
      description: 'desc-stdio',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    // PRE-MOCK getToolsByServer for the expected server name
    mockToolRegistry.getToolsByServer.mockReturnValueOnce([
      expect.any(DiscoveredMCPTool),
    ]);

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: serverConfig.command,
      args: serverConfig.args,
      env: expect.any(Object),
      cwd: undefined,
      stderr: 'pipe',
    });
    expect(mockToolRegistry.registerTool).toHaveBeenCalledWith(
      expect.any(DiscoveredMCPTool),
    );
    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    expect(registeredTool.name).toBe('tool-stdio');
  });

  it('should discover tools via mcpServers config (sse)', async () => {
    const serverConfig: MCPServerConfig = { url: 'http://localhost:1234/sse' };
    mockConfig.getMcpServers.mockReturnValue({ 'sse-server': serverConfig });

    const mockTool = {
      name: 'tool-sse',
      description: 'desc-sse',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    // PRE-MOCK getToolsByServer for the expected server name
    mockToolRegistry.getToolsByServer.mockReturnValueOnce([
      expect.any(DiscoveredMCPTool),
    ]);

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(SSEClientTransport).toHaveBeenCalledWith(new URL(serverConfig.url!));
    expect(mockToolRegistry.registerTool).toHaveBeenCalledWith(
      expect.any(DiscoveredMCPTool),
    );
    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    expect(registeredTool.name).toBe('tool-sse');
  });

  it('should discover tools via mcpServers config (streamable http)', async () => {
    const serverConfig: MCPServerConfig = {
      httpUrl: 'http://localhost:3000/mcp',
    };
    mockConfig.getMcpServers.mockReturnValue({ 'http-server': serverConfig });

    const mockTool = {
      name: 'tool-http',
      description: 'desc-http',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    mockToolRegistry.getToolsByServer.mockReturnValueOnce([
      expect.any(DiscoveredMCPTool),
    ]);

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL(serverConfig.httpUrl!),
      {},
    );
    expect(mockToolRegistry.registerTool).toHaveBeenCalledWith(
      expect.any(DiscoveredMCPTool),
    );
    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    expect(registeredTool.name).toBe('tool-http');
  });

  describe('StreamableHTTPClientTransport headers', () => {
    const setupHttpTest = async (headers?: Record<string, string>) => {
      const serverConfig: MCPServerConfig = {
        httpUrl: 'http://localhost:3000/mcp',
        ...(headers && { headers }),
      };
      const serverName = headers
        ? 'http-server-with-headers'
        : 'http-server-no-headers';
      const toolName = headers ? 'tool-http-headers' : 'tool-http-no-headers';

      mockConfig.getMcpServers.mockReturnValue({ [serverName]: serverConfig });

      const mockTool = {
        name: toolName,
        description: `desc-${toolName}`,
        inputSchema: { type: 'object' as const, properties: {} },
      };
      vi.mocked(Client.prototype.listTools).mockResolvedValue({
        tools: [mockTool],
      });
      mockToolRegistry.getToolsByServer.mockReturnValueOnce([
        expect.any(DiscoveredMCPTool),
      ]);

      await discoverMcpTools(
        mockConfig.getMcpServers() ?? {},
        mockConfig.getMcpServerCommand(),
        mockToolRegistry as any,
      );

      return { serverConfig };
    };

    it('should pass headers when provided', async () => {
      const headers = {
        Authorization: 'Bearer test-token',
        'X-Custom-Header': 'custom-value',
      };
      const { serverConfig } = await setupHttpTest(headers);

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL(serverConfig.httpUrl!),
        { requestInit: { headers } },
      );
    });

    it('should work without headers (backwards compatibility)', async () => {
      const { serverConfig } = await setupHttpTest();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL(serverConfig.httpUrl!),
        {},
      );
    });
  });

  it('should prefix tool names if multiple MCP servers are configured', async () => {
    const serverConfig1: MCPServerConfig = { command: './mcp1' };
    const serverConfig2: MCPServerConfig = { url: 'http://mcp2/sse' };
    mockConfig.getMcpServers.mockReturnValue({
      server1: serverConfig1,
      server2: serverConfig2,
    });

    const mockTool1 = {
      name: 'toolA', // Same original name
      description: 'd1',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    const mockTool2 = {
      name: 'toolA', // Same original name
      description: 'd2',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    const mockToolB = {
      name: 'toolB',
      description: 'dB',
      inputSchema: { type: 'object' as const, properties: {} },
    };

    vi.mocked(Client.prototype.listTools)
      .mockResolvedValueOnce({ tools: [mockTool1, mockToolB] }) // Tools for server1
      .mockResolvedValueOnce({ tools: [mockTool2] }); // Tool for server2 (toolA)

    const effectivelyRegisteredTools = new Map<string, any>();

    mockToolRegistry.getTool.mockImplementation((toolName: string) =>
      effectivelyRegisteredTools.get(toolName),
    );

    // Store the original spy implementation if needed, or just let the new one be the behavior.
    // The mockToolRegistry.registerTool is already a vi.fn() from mockToolRegistryInstance.
    // We are setting its behavior for this test.
    mockToolRegistry.registerTool.mockImplementation((toolToRegister: any) => {
      // Simulate the actual registration name being stored for getTool to find
      effectivelyRegisteredTools.set(toolToRegister.name, toolToRegister);
      // If it's the first time toolA is registered (from server1, not prefixed),
      // also make it findable by its original name for the prefixing check of server2/toolA.
      if (
        toolToRegister.serverName === 'server1' &&
        toolToRegister.serverToolName === 'toolA' &&
        toolToRegister.name === 'toolA'
      ) {
        effectivelyRegisteredTools.set('toolA', toolToRegister);
      }
      // The spy call count is inherently tracked by mockToolRegistry.registerTool itself.
    });

    // PRE-MOCK getToolsByServer for the expected server names
    // This is for the final check in connectAndDiscover to see if any tools were registered *from that server*
    mockToolRegistry.getToolsByServer.mockImplementation(
      (serverName: string) => {
        if (serverName === 'server1')
          return [
            expect.objectContaining({ name: 'toolA' }),
            expect.objectContaining({ name: 'toolB' }),
          ];
        if (serverName === 'server2')
          return [expect.objectContaining({ name: 'server2__toolA' })];
        return [];
      },
    );

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(3);
    const registeredArgs = mockToolRegistry.registerTool.mock.calls.map(
      (call) => call[0],
    ) as DiscoveredMCPTool[];

    // The order of server processing by Promise.all is not guaranteed.
    // One 'toolA' will be unprefixed, the other will be prefixed.
    const toolA_from_server1 = registeredArgs.find(
      (t) => t.serverToolName === 'toolA' && t.serverName === 'server1',
    );
    const toolA_from_server2 = registeredArgs.find(
      (t) => t.serverToolName === 'toolA' && t.serverName === 'server2',
    );
    const toolB_from_server1 = registeredArgs.find(
      (t) => t.serverToolName === 'toolB' && t.serverName === 'server1',
    );

    expect(toolA_from_server1).toBeDefined();
    expect(toolA_from_server2).toBeDefined();
    expect(toolB_from_server1).toBeDefined();

    expect(toolB_from_server1?.name).toBe('toolB'); // toolB is unique

    // Check that one of toolA is prefixed and the other is not, and the prefixed one is correct.
    if (toolA_from_server1?.name === 'toolA') {
      expect(toolA_from_server2?.name).toBe('server2__toolA');
    } else {
      expect(toolA_from_server1?.name).toBe('server1__toolA');
      expect(toolA_from_server2?.name).toBe('toolA');
    }
  });

  it('should clean schema properties ($schema, additionalProperties)', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-clean' };
    mockConfig.getMcpServers.mockReturnValue({ 'clean-server': serverConfig });

    const rawSchema = {
      type: 'object' as const,
      $schema: 'http://json-schema.org/draft-07/schema#',
      additionalProperties: true,
      properties: {
        prop1: { type: 'string', $schema: 'remove-this' },
        prop2: {
          type: 'object' as const,
          additionalProperties: false,
          properties: { nested: { type: 'number' } },
        },
      },
    };
    const mockTool = {
      name: 'cleanTool',
      description: 'd',
      inputSchema: JSON.parse(JSON.stringify(rawSchema)),
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });
    // PRE-MOCK getToolsByServer for the expected server name
    mockToolRegistry.getToolsByServer.mockReturnValueOnce([
      expect.any(DiscoveredMCPTool),
    ]);

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(1);
    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    const cleanedParams = registeredTool.schema.parameters as any;

    expect(cleanedParams).not.toHaveProperty('$schema');
    expect(cleanedParams).not.toHaveProperty('additionalProperties');
    expect(cleanedParams.properties.prop1).not.toHaveProperty('$schema');
    expect(cleanedParams.properties.prop2).not.toHaveProperty(
      'additionalProperties',
    );
    expect(cleanedParams.properties.prop2.properties.nested).not.toHaveProperty(
      '$schema',
    );
    expect(cleanedParams.properties.prop2.properties.nested).not.toHaveProperty(
      'additionalProperties',
    );
  });

  it('should handle error if mcpServerCommand parsing fails', async () => {
    const commandString = 'my-mcp-server "unterminated quote';
    mockConfig.getMcpServerCommand.mockReturnValue(commandString);
    vi.mocked(parse).mockImplementation(() => {
      throw new Error('Parsing failed');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      discoverMcpTools(
        mockConfig.getMcpServers() ?? {},
        mockConfig.getMcpServerCommand(),
        mockToolRegistry as any,
      ),
    ).rejects.toThrow('Parsing failed');
    expect(mockToolRegistry.registerTool).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should log error and skip server if config is invalid (missing url and command)', async () => {
    mockConfig.getMcpServers.mockReturnValue({ 'bad-server': {} as any });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "MCP server 'bad-server' has invalid configuration",
      ),
    );
    // Client constructor should not be called if config is invalid before instantiation
    expect(Client).not.toHaveBeenCalled();
  });

  it('should log error and skip server if mcpClient.connect fails', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-fail-connect' };
    mockConfig.getMcpServers.mockReturnValue({
      'fail-connect-server': serverConfig,
    });
    vi.mocked(Client.prototype.connect).mockRejectedValue(
      new Error('Connection refused'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "failed to start or connect to MCP server 'fail-connect-server'",
      ),
    );
    expect(Client.prototype.listTools).not.toHaveBeenCalled();
    expect(mockToolRegistry.registerTool).not.toHaveBeenCalled();
  });

  it('should log error and skip server if mcpClient.listTools fails', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-fail-list' };
    mockConfig.getMcpServers.mockReturnValue({
      'fail-list-server': serverConfig,
    });
    vi.mocked(Client.prototype.listTools).mockRejectedValue(
      new Error('ListTools error'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to list or register tools for MCP server 'fail-list-server'",
      ),
    );
    expect(mockToolRegistry.registerTool).not.toHaveBeenCalled();
  });

  it('should assign mcpClient.onerror handler', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-onerror' };
    mockConfig.getMcpServers.mockReturnValue({
      'onerror-server': serverConfig,
    });
    // PRE-MOCK getToolsByServer for the expected server name
    mockToolRegistry.getToolsByServer.mockReturnValueOnce([
      expect.any(DiscoveredMCPTool),
    ]);

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    const clientInstances = vi.mocked(Client).mock.results;
    expect(clientInstances.length).toBeGreaterThan(0);
    const lastClientInstance =
      clientInstances[clientInstances.length - 1]?.value;
    expect(lastClientInstance?.onerror).toEqual(expect.any(Function));
  });
});

describe('sanitizeParameters', () => {
  it('should do nothing for an undefined schema', () => {
    const schema = undefined;
    sanitizeParameters(schema);
  });

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
});

// Additional comprehensive test cases for discoverMcpTools
describe('discoverMcpTools - Additional Edge Cases', () => {
  it('should handle servers returning empty tool lists', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-empty' };
    mockConfig.getMcpServers.mockReturnValue({ 'empty-server': serverConfig });

    vi.mocked(Client.prototype.listTools).mockResolvedValue({ tools: [] });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(Client.prototype.listTools).toHaveBeenCalledTimes(1);
    expect(mockToolRegistry.registerTool).not.toHaveBeenCalled();
  });

  it('should handle malformed tool objects (missing name)', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-malformed' };
    mockConfig.getMcpServers.mockReturnValue({
      'malformed-server': serverConfig,
    });

    const malformedTool = {
      // name is missing
      description: 'desc',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [malformedTool as any],
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to list or register tools'),
    );
    expect(mockToolRegistry.registerTool).not.toHaveBeenCalled();
  });

  it('should handle malformed tool objects (missing inputSchema)', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-no-schema' };
    mockConfig.getMcpServers.mockReturnValue({
      'no-schema-server': serverConfig,
    });

    const toolWithoutSchema = {
      name: 'tool-no-schema',
      description: 'desc',
      // inputSchema is missing
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [toolWithoutSchema as any],
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to list or register tools'),
    );
  });

  it('should handle transport close() failures gracefully', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-close-fail' };
    mockConfig.getMcpServers.mockReturnValue({
      'close-fail-server': serverConfig,
    });

    // Mock transport close to throw an error
    vi.mocked(StdioClientTransport).mockImplementation(function (
      this: any,
      options: any,
    ) {
      this.options = options;
      this.stderr = { on: mockGlobalStdioStderrOn };
      this.close = vi.fn().mockRejectedValue(new Error('Close failed'));
      return this;
    });

    const mockTool = {
      name: 'tool1',
      description: 'desc1',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    // Should still register the tool despite close() failure
    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(1);
    // Should not log error for close failure (it's handled silently)
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should handle invalid URL for SSE transport', async () => {
    const serverConfig: MCPServerConfig = { url: 'invalid-url-not-http' };
    mockConfig.getMcpServers.mockReturnValue({
      'invalid-sse-server': serverConfig,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to start or connect to MCP server'),
    );
  });

  it('should handle invalid URL for HTTP transport', async () => {
    const serverConfig: MCPServerConfig = { httpUrl: 'not-a-valid-url' };
    mockConfig.getMcpServers.mockReturnValue({
      'invalid-http-server': serverConfig,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to start or connect to MCP server'),
    );
  });

  it('should handle stdio stderr events properly', async () => {
    const serverConfig: MCPServerConfig = {
      command: './mcp-stderr',
      args: ['--verbose'],
    };
    mockConfig.getMcpServers.mockReturnValue({ 'stderr-server': serverConfig });

    const mockTool = {
      name: 'stderr-tool',
      description: 'tool that produces stderr',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    // Verify stderr.on was called to set up data handler
    expect(mockGlobalStdioStderrOn).toHaveBeenCalledWith(
      'data',
      expect.any(Function),
    );
    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(1);
  });

  it('should handle environment variable expansion in commands', async () => {
    const commandString = 'echo $HOME/mcp-server --port=$PORT';
    const parsedCommand = [
      'echo',
      '/home/user/mcp-server',
      '--port=3000',
    ] as ParseEntry[];

    mockConfig.getMcpServerCommand.mockReturnValue(commandString);
    vi.mocked(parse).mockReturnValue(parsedCommand);

    const mockTool = {
      name: 'env-tool',
      description: 'tool with env vars',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(parse).toHaveBeenCalledWith(commandString, process.env);
    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: 'echo',
      args: ['/home/user/mcp-server', '--port=3000'],
      env: expect.any(Object),
      cwd: undefined,
      stderr: 'pipe',
    });
  });

  it('should handle cwd parameter in server config', async () => {
    const serverConfig: MCPServerConfig = {
      command: './relative-mcp-server',
      cwd: '/specific/working/directory',
    };
    mockConfig.getMcpServers.mockReturnValue({ 'cwd-server': serverConfig });

    const mockTool = {
      name: 'cwd-tool',
      description: 'tool with custom cwd',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: serverConfig.command,
      args: undefined,
      env: expect.any(Object),
      cwd: '/specific/working/directory',
      stderr: 'pipe',
    });
  });

  it('should handle tools with complex nested schemas', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-complex-schema' };
    mockConfig.getMcpServers.mockReturnValue({
      'complex-server': serverConfig,
    });

    const complexSchema = {
      type: 'object' as const,
      properties: {
        users: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              profile: {
                type: 'object' as const,
                additionalProperties: true,
                properties: {
                  preferences: {
                    type: 'object' as const,
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    properties: {
                      nested: { type: 'boolean' as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
      $schema: 'http://json-schema.org/draft-07/schema#',
      additionalProperties: false,
    };

    const mockTool = {
      name: 'complexTool',
      description: 'tool with complex schema',
      inputSchema: JSON.parse(JSON.stringify(complexSchema)),
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    const cleanedParams = registeredTool.schema.parameters as any;

    // Verify deep cleaning of $schema and additionalProperties
    expect(cleanedParams).not.toHaveProperty('$schema');
    expect(cleanedParams).not.toHaveProperty('additionalProperties');
    expect(
      cleanedParams.properties.users.items.properties.profile,
    ).not.toHaveProperty('additionalProperties');
    expect(
      cleanedParams.properties.users.items.properties.profile.properties
        .preferences,
    ).not.toHaveProperty('$schema');
  });

  it('should handle very large number of tools from single server', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-many-tools' };
    mockConfig.getMcpServers.mockReturnValue({
      'many-tools-server': serverConfig,
    });

    // Generate 100 mock tools
    const manyTools = Array.from({ length: 100 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Description for tool ${i}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          param: {
            type: 'string' as const,
            description: `Param for tool ${i}`,
          },
        },
      },
    }));

    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: manyTools,
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(100);

    // Verify all tools were registered with correct names
    const registeredCalls = mockToolRegistry.registerTool.mock.calls;
    for (let i = 0; i < 100; i++) {
      const registeredTool = registeredCalls[i][0] as DiscoveredMCPTool;
      expect(registeredTool.name).toBe(`tool_${i}`);
      expect(registeredTool.serverToolName).toBe(`tool_${i}`);
    }
  });

  it('should handle concurrent server processing correctly', async () => {
    const serverConfig1: MCPServerConfig = { command: './mcp1' };
    const serverConfig2: MCPServerConfig = { url: 'http://mcp2/sse' };
    const serverConfig3: MCPServerConfig = { httpUrl: 'http://mcp3/http' };

    mockConfig.getMcpServers.mockReturnValue({
      concurrent1: serverConfig1,
      concurrent2: serverConfig2,
      concurrent3: serverConfig3,
    });

    const mockTool1 = {
      name: 'concurrent-tool-1',
      description: 'd1',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    const mockTool2 = {
      name: 'concurrent-tool-2',
      description: 'd2',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    const mockTool3 = {
      name: 'concurrent-tool-3',
      description: 'd3',
      inputSchema: { type: 'object' as const, properties: {} },
    };

    vi.mocked(Client.prototype.listTools)
      .mockResolvedValueOnce({ tools: [mockTool1] })
      .mockResolvedValueOnce({ tools: [mockTool2] })
      .mockResolvedValueOnce({ tools: [mockTool3] });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(3);
    expect(Client.prototype.connect).toHaveBeenCalledTimes(3);
    expect(Client.prototype.listTools).toHaveBeenCalledTimes(3);

    // Verify all three transport types were used
    expect(StdioClientTransport).toHaveBeenCalledTimes(1);
    expect(SSEClientTransport).toHaveBeenCalledTimes(1);
    expect(StreamableHTTPClientTransport).toHaveBeenCalledTimes(1);
  });

  it('should handle null and undefined parameters gracefully', async () => {
    // Test with null servers config
    await discoverMcpTools(null as any, undefined, mockToolRegistry as any);
    expect(mockConfig.getMcpServers).not.toHaveBeenCalled();
    expect(Client).not.toHaveBeenCalled();

    // Test with empty object but null command
    await discoverMcpTools({}, null as any, mockToolRegistry as any);
    expect(Client).not.toHaveBeenCalled();
  });

  it('should handle registration errors gracefully', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-reg-error' };
    mockConfig.getMcpServers.mockReturnValue({
      'reg-error-server': serverConfig,
    });

    const mockTool = {
      name: 'failing-tool',
      description: 'tool that fails to register',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    // Make registerTool throw an error
    mockToolRegistry.registerTool.mockImplementation(() => {
      throw new Error('Registration failed');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to list or register tools'),
    );
  });

  it('should handle tool name sanitization for invalid characters', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-invalid-chars' };
    mockConfig.getMcpServers.mockReturnValue({
      'invalid-chars-server': serverConfig,
    });

    const mockTool = {
      name: 'tool@with#invalid$chars%and&spaces',
      description: 'tool with invalid characters in name',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    // Invalid characters should be replaced with underscores
    expect(registeredTool.name).toBe('tool_with_invalid_chars_and_spaces');
    expect(registeredTool.serverToolName).toBe(
      'tool@with#invalid$chars%and&spaces',
    ); // Original name preserved
  });

  it('should handle tool name truncation for very long names', async () => {
    const serverConfig: MCPServerConfig = { command: './mcp-long-name' };
    mockConfig.getMcpServers.mockReturnValue({
      'long-name-server': serverConfig,
    });

    const veryLongName = 'a'.repeat(80); // 80 characters, exceeds 63 limit
    const mockTool = {
      name: veryLongName,
      description: 'tool with very long name',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    // Name should be truncated to 63 characters with middle replacement
    expect(registeredTool.name.length).toBe(63);
    expect(registeredTool.name).toContain('___'); // Middle replacement
    expect(registeredTool.serverToolName).toBe(veryLongName); // Original name preserved
  });

  it('should handle custom environment variables in server config', async () => {
    const serverConfig: MCPServerConfig = {
      command: './mcp-env',
      env: { CUSTOM_VAR: 'custom_value', ANOTHER_VAR: 'another_value' },
    };
    mockConfig.getMcpServers.mockReturnValue({ 'env-server': serverConfig });

    const mockTool = {
      name: 'env-aware-tool',
      description: 'tool that uses environment variables',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: serverConfig.command,
      args: undefined,
      env: expect.objectContaining({
        CUSTOM_VAR: 'custom_value',
        ANOTHER_VAR: 'another_value',
      }),
      cwd: undefined,
      stderr: 'pipe',
    });
  });

  it('should handle timeout configuration', async () => {
    const serverConfig: MCPServerConfig = {
      command: './mcp-timeout',
      timeout: 5000,
    };
    mockConfig.getMcpServers.mockReturnValue({
      'timeout-server': serverConfig,
    });

    const mockTool = {
      name: 'timeout-tool',
      description: 'tool with custom timeout',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    expect(registeredTool.timeout).toBe(5000);
  });

  it('should handle trust configuration', async () => {
    const serverConfig: MCPServerConfig = {
      command: './mcp-trusted',
      trust: true,
    };
    mockConfig.getMcpServers.mockReturnValue({
      'trusted-server': serverConfig,
    });

    const mockTool = {
      name: 'trusted-tool',
      description: 'trusted tool',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    vi.mocked(Client.prototype.listTools).mockResolvedValue({
      tools: [mockTool],
    });

    await discoverMcpTools(
      mockConfig.getMcpServers() ?? {},
      mockConfig.getMcpServerCommand(),
      mockToolRegistry as any,
    );

    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    expect(registeredTool.trust).toBe(true);
  });
});

// Additional comprehensive test cases for sanitizeParameters
describe('sanitizeParameters - Additional Edge Cases', () => {
  it('should handle null schema input', () => {
    expect(() => sanitizeParameters(null as any)).not.toThrow();
  });

  it('should handle schema with no anyOf but with default', () => {
    const schema: Schema = {
      type: Type.STRING,
      default: 'hello',
    };
    sanitizeParameters(schema);
    expect(schema.default).toBe('hello'); // Should remain unchanged
  });

  it('should handle empty anyOf array', () => {
    const schema: Schema = {
      anyOf: [],
      default: 'hello',
    };
    sanitizeParameters(schema);
    expect(schema.default).toBeUndefined();
    expect(schema.anyOf).toEqual([]); // anyOf should remain unchanged
  });

  it('should handle schemas with both items and properties', () => {
    const schema: Schema = {
      items: {
        anyOf: [{ type: Type.STRING }],
        default: 'item-default',
      },
      properties: {
        prop1: {
          anyOf: [{ type: Type.NUMBER }],
          default: 42,
        },
      },
    };
    sanitizeParameters(schema);
    expect(schema.items!.default).toBeUndefined();
    expect(schema.properties!.prop1.default).toBeUndefined();
  });

  it('should handle very deeply nested schemas', () => {
    const deepSchema: Schema = {
      properties: {
        level1: {
          properties: {
            level2: {
              properties: {
                level3: {
                  properties: {
                    level4: {
                      properties: {
                        level5: {
                          anyOf: [{ type: Type.STRING }],
                          default: 'deep-default',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    sanitizeParameters(deepSchema);

    const level5 =
      deepSchema.properties!.level1.properties!.level2.properties!.level3
        .properties!.level4.properties!.level5;
    expect(level5.default).toBeUndefined();
  });

  it('should handle schemas with multiple levels of anyOf', () => {
    const schema: Schema = {
      anyOf: [
        {
          anyOf: [
            {
              anyOf: [{ type: Type.STRING }],
              default: 'nested-anyOf-default',
            },
          ],
          default: 'middle-anyOf-default',
        },
      ],
      default: 'top-level-default',
    };

    sanitizeParameters(schema);

    expect(schema.default).toBeUndefined();
    expect(schema.anyOf![0].default).toBeUndefined();
    expect(schema.anyOf![0].anyOf![0].default).toBeUndefined();
  });

  it('should handle schemas with array items containing anyOf', () => {
    const schema: Schema = {
      type: Type.ARRAY,
      items: {
        type: Type.ARRAY,
        items: {
          anyOf: [{ type: Type.STRING }, { type: Type.NUMBER }],
          default: 'array-item-default',
        },
      },
    };

    sanitizeParameters(schema);
    expect(schema.items!.items!.default).toBeUndefined();
  });

  it('should preserve other schema properties while sanitizing', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      title: 'Test Schema',
      description: 'A test schema',
      required: ['prop1'],
      anyOf: [{ type: Type.STRING }],
      default: 'should-be-removed',
      properties: {
        prop1: {
          type: Type.STRING,
          description: 'Property 1',
          anyOf: [{ type: Type.STRING }],
          default: 'also-should-be-removed',
        },
        prop2: {
          type: Type.NUMBER,
          minimum: 0,
          maximum: 100,
          default: 'should-remain', // No anyOf, so default should stay
        },
      },
    };

    sanitizeParameters(schema);

    // Check that other properties are preserved
    expect(schema.type).toBe(Type.OBJECT);
    expect(schema.title).toBe('Test Schema');
    expect(schema.description).toBe('A test schema');
    expect(schema.required).toEqual(['prop1']);

    // Check sanitization worked
    expect(schema.default).toBeUndefined();
    expect(schema.properties!.prop1.default).toBeUndefined();
    expect(schema.properties!.prop2.default).toBe('should-remain');

    // Check that other properties in nested objects are preserved
    expect(schema.properties!.prop1.description).toBe('Property 1');
    expect(schema.properties!.prop2.minimum).toBe(0);
    expect(schema.properties!.prop2.maximum).toBe(100);
  });

  it('should handle schema with undefined properties', () => {
    const schema: Schema = {
      anyOf: [{ type: Type.STRING }],
      default: 'test',
      properties: undefined,
      items: undefined,
    };

    expect(() => sanitizeParameters(schema)).not.toThrow();
    expect(schema.default).toBeUndefined();
  });

  it('should handle performance with large schema objects', () => {
    // Create a schema with many properties
    const largeSchema: Schema = {
      properties: {},
    };

    // Add 1000 properties, some with anyOf
    for (let i = 0; i < 1000; i++) {
      largeSchema.properties![`prop${i}`] = {
        type: Type.STRING,
        ...(i % 2 === 0 && {
          anyOf: [{ type: Type.STRING }],
          default: `default-${i}`,
        }),
      };
    }

    const startTime = Date.now();
    sanitizeParameters(largeSchema);
    const endTime = Date.now();

    // Should complete in reasonable time (less than 1 second)
    expect(endTime - startTime).toBeLessThan(1000);

    // Verify sanitization worked for anyOf properties
    for (let i = 0; i < 1000; i += 2) {
      expect(largeSchema.properties![`prop${i}`].default).toBeUndefined();
    }

    // Verify non-anyOf properties were not affected
    for (let i = 1; i < 1000; i += 2) {
      expect(largeSchema.properties![`prop${i}`]).not.toHaveProperty('default');
    }
  });

  it('should handle circular references gracefully', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {},
    };

    // Create a circular reference
    schema.properties!.self = schema;
    schema.anyOf = [{ type: Type.STRING }];
    schema.default = 'circular-default';

    // Should not cause infinite recursion
    expect(() => sanitizeParameters(schema)).not.toThrow();
    expect(schema.default).toBeUndefined();
  });

  it('should handle mixed schema types in anyOf', () => {
    const schema: Schema = {
      anyOf: [
        { type: Type.STRING, default: 'string-default' },
        { type: Type.NUMBER, default: 42 },
        {
          type: Type.OBJECT,
          properties: {
            nested: { anyOf: [{ type: Type.BOOLEAN }], default: true },
          },
        },
        {
          type: Type.ARRAY,
          items: {
            anyOf: [{ type: Type.STRING }],
            default: 'array-item-default',
          },
        },
      ],
      default: 'root-default',
    };

    sanitizeParameters(schema);

    expect(schema.default).toBeUndefined();
    expect(schema.anyOf![0].default).toBeUndefined();
    expect(schema.anyOf![1].default).toBeUndefined();
    expect(schema.anyOf![2].properties!.nested.default).toBeUndefined();
    expect(schema.anyOf![3].items!.default).toBeUndefined();
  });
});
