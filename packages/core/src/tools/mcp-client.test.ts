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
import { discoverMcpTools } from './mcp-client.js';
import { Config, MCPServerConfig } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
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
    return this;
  });
  return { StdioClientTransport: MockedStdioTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  const MockedSSETransport = vi.fn();
  return { SSEClientTransport: MockedSSETransport };
});

vi.mock('./tool-registry.js');

describe('discoverMcpTools', () => {
  let mockConfig: Mocked<Config>;
  let mockToolRegistry: Mocked<ToolRegistry>;

  beforeEach(() => {
    mockConfig = {
      getMcpServers: vi.fn().mockReturnValue({}),
      getMcpServerCommand: vi.fn().mockReturnValue(undefined),
    } as any;

    mockToolRegistry = new (ToolRegistry as any)(
      mockConfig,
    ) as Mocked<ToolRegistry>;
    mockToolRegistry.registerTool = vi.fn();

    vi.mocked(parse).mockClear();
    vi.mocked(Client).mockClear();
    vi.mocked(Client.prototype.connect)
      .mockClear()
      .mockResolvedValue(undefined);
    vi.mocked(Client.prototype.listTools)
      .mockClear()
      .mockResolvedValue({ tools: [] });

    vi.mocked(StdioClientTransport).mockClear();
    mockGlobalStdioStderrOn.mockClear(); // Clear the global mock in beforeEach

    vi.mocked(SSEClientTransport).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should do nothing if no MCP servers or command are configured', async () => {
    await discoverMcpTools(mockConfig, mockToolRegistry);
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

    await discoverMcpTools(mockConfig, mockToolRegistry);

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

    await discoverMcpTools(mockConfig, mockToolRegistry);

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

    await discoverMcpTools(mockConfig, mockToolRegistry);

    expect(SSEClientTransport).toHaveBeenCalledWith(new URL(serverConfig.url!));
    expect(mockToolRegistry.registerTool).toHaveBeenCalledWith(
      expect.any(DiscoveredMCPTool),
    );
    const registeredTool = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    expect(registeredTool.name).toBe('tool-sse');
  });

  it('should prefix tool names if multiple MCP servers are configured', async () => {
    const serverConfig1: MCPServerConfig = { command: './mcp1' };
    const serverConfig2: MCPServerConfig = { url: 'http://mcp2/sse' };
    mockConfig.getMcpServers.mockReturnValue({
      server1: serverConfig1,
      server2: serverConfig2,
    });

    const mockTool1 = {
      name: 'toolA',
      description: 'd1',
      inputSchema: { type: 'object' as const, properties: {} },
    };
    const mockTool2 = {
      name: 'toolB',
      description: 'd2',
      inputSchema: { type: 'object' as const, properties: {} },
    };

    vi.mocked(Client.prototype.listTools)
      .mockResolvedValueOnce({ tools: [mockTool1] })
      .mockResolvedValueOnce({ tools: [mockTool2] });

    await discoverMcpTools(mockConfig, mockToolRegistry);

    expect(mockToolRegistry.registerTool).toHaveBeenCalledTimes(2);
    const registeredTool1 = mockToolRegistry.registerTool.mock
      .calls[0][0] as DiscoveredMCPTool;
    const registeredTool2 = mockToolRegistry.registerTool.mock
      .calls[1][0] as DiscoveredMCPTool;

    expect(registeredTool1.name).toBe('server1__toolA');
    expect(registeredTool1.serverToolName).toBe('toolA');
    expect(registeredTool2.name).toBe('server2__toolB');
    expect(registeredTool2.serverToolName).toBe('toolB');
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

    await discoverMcpTools(mockConfig, mockToolRegistry);

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
      discoverMcpTools(mockConfig, mockToolRegistry),
    ).rejects.toThrow('Parsing failed');
    expect(mockToolRegistry.registerTool).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should log error and skip server if config is invalid (missing url and command)', async () => {
    mockConfig.getMcpServers.mockReturnValue({ 'bad-server': {} as any });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await discoverMcpTools(mockConfig, mockToolRegistry);

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

    await discoverMcpTools(mockConfig, mockToolRegistry);

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

    await discoverMcpTools(mockConfig, mockToolRegistry);

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

    await discoverMcpTools(mockConfig, mockToolRegistry);

    const clientInstances = vi.mocked(Client).mock.results;
    expect(clientInstances.length).toBeGreaterThan(0);
    const lastClientInstance =
      clientInstances[clientInstances.length - 1]?.value;
    expect(lastClientInstance?.onerror).toEqual(expect.any(Function));
  });
});
