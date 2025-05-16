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
  ToolRegistry,
  DiscoveredTool,
  DiscoveredMCPTool,
} from './tool-registry.js';
import { Config } from '../config/config.js';
import { BaseTool, ToolResult } from './tools.js';
import { FunctionDeclaration } from '@google/genai';
import { execSync, spawn } from 'node:child_process'; // Import spawn here
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Mock node:child_process
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
  };
});

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const Client = vi.fn();
  Client.prototype.connect = vi.fn();
  Client.prototype.listTools = vi.fn();
  Client.prototype.callTool = vi.fn();
  return { Client };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  const StdioClientTransport = vi.fn();
  StdioClientTransport.prototype.stderr = {
    on: vi.fn(),
  };
  return { StdioClientTransport };
});

class MockTool extends BaseTool<{ param: string }, ToolResult> {
  constructor(name = 'mock-tool', description = 'A mock tool') {
    super(name, name, description, {
      type: 'object',
      properties: {
        param: { type: 'string' },
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

describe('ToolRegistry', () => {
  let config: Config;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    // Provide a mock target directory for Config initialization
    const mockTargetDir = '/test/dir';
    config = new Config(
      'test-api-key',
      'test-model',
      false, // sandbox
      mockTargetDir, // targetDir
      false, // debugMode
      undefined, // question
      false, // fullContext
      undefined, // toolDiscoveryCommand
      undefined, // toolCallCommand
      undefined, // mcpServerCommand
      undefined, // mcpServers
      'TestAgent/1.0', // userAgent
    );
    toolRegistry = new ToolRegistry(config);
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress console.warn
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

    it('should overwrite an existing tool with the same name and log a warning', () => {
      const tool1 = new MockTool('tool1');
      const tool2 = new MockTool('tool1'); // Same name
      toolRegistry.registerTool(tool1);
      toolRegistry.registerTool(tool2);
      expect(toolRegistry.getTool('tool1')).toBe(tool2);
      expect(console.warn).toHaveBeenCalledWith(
        'Tool with name "tool1" is already registered. Overwriting.',
      );
    });
  });

  describe('getFunctionDeclarations', () => {
    it('should return an empty array if no tools are registered', () => {
      expect(toolRegistry.getFunctionDeclarations()).toEqual([]);
    });

    it('should return function declarations for registered tools', () => {
      const tool1 = new MockTool('tool1');
      const tool2 = new MockTool('tool2');
      toolRegistry.registerTool(tool1);
      toolRegistry.registerTool(tool2);
      const declarations = toolRegistry.getFunctionDeclarations();
      expect(declarations).toHaveLength(2);
      expect(declarations.map((d: FunctionDeclaration) => d.name)).toContain(
        'tool1',
      );
      expect(declarations.map((d: FunctionDeclaration) => d.name)).toContain(
        'tool2',
      );
    });
  });

  describe('getAllTools', () => {
    it('should return an empty array if no tools are registered', () => {
      expect(toolRegistry.getAllTools()).toEqual([]);
    });

    it('should return all registered tools', () => {
      const tool1 = new MockTool('tool1');
      const tool2 = new MockTool('tool2');
      toolRegistry.registerTool(tool1);
      toolRegistry.registerTool(tool2);
      const tools = toolRegistry.getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
    });
  });

  describe('getTool', () => {
    it('should return undefined if the tool is not found', () => {
      expect(toolRegistry.getTool('non-existent-tool')).toBeUndefined();
    });

    it('should return the tool if found', () => {
      const tool = new MockTool();
      toolRegistry.registerTool(tool);
      expect(toolRegistry.getTool('mock-tool')).toBe(tool);
    });
  });

  describe('discoverTools', () => {
    let mockConfigGetToolDiscoveryCommand: ReturnType<typeof vi.spyOn>;
    let mockConfigGetMcpServers: ReturnType<typeof vi.spyOn>;
    let mockConfigGetMcpServerCommand: ReturnType<typeof vi.spyOn>;
    let mockExecSync: ReturnType<typeof vi.mocked<typeof execSync>>;

    beforeEach(() => {
      mockConfigGetToolDiscoveryCommand = vi.spyOn(
        config,
        'getToolDiscoveryCommand',
      );
      mockConfigGetMcpServers = vi.spyOn(config, 'getMcpServers');
      mockConfigGetMcpServerCommand = vi.spyOn(config, 'getMcpServerCommand');
      mockExecSync = vi.mocked(execSync);

      // Clear any tools registered by previous tests in this describe block
      toolRegistry = new ToolRegistry(config);
    });

    it('should discover tools using discovery command', () => {
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);
      const mockToolDeclarations: FunctionDeclaration[] = [
        {
          name: 'discovered-tool-1',
          description: 'A discovered tool',
          parameters: { type: 'object', properties: {} } as Record<
            string,
            unknown
          >,
        },
      ];
      mockExecSync.mockReturnValue(
        Buffer.from(
          JSON.stringify([{ function_declarations: mockToolDeclarations }]),
        ),
      );

      toolRegistry.discoverTools();

      expect(execSync).toHaveBeenCalledWith(discoveryCommand);
      const discoveredTool = toolRegistry.getTool('discovered-tool-1');
      expect(discoveredTool).toBeInstanceOf(DiscoveredTool);
      expect(discoveredTool?.name).toBe('discovered-tool-1');
      expect(discoveredTool?.description).toContain('A discovered tool');
      expect(discoveredTool?.description).toContain(discoveryCommand);
    });

    it('should remove previously discovered tools before discovering new ones', () => {
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);
      mockExecSync.mockReturnValueOnce(
        Buffer.from(
          JSON.stringify([
            {
              function_declarations: [
                {
                  name: 'old-discovered-tool',
                  description: 'old',
                  parameters: { type: 'object' },
                },
              ],
            },
          ]),
        ),
      );
      toolRegistry.discoverTools();
      expect(toolRegistry.getTool('old-discovered-tool')).toBeInstanceOf(
        DiscoveredTool,
      );

      mockExecSync.mockReturnValueOnce(
        Buffer.from(
          JSON.stringify([
            {
              function_declarations: [
                {
                  name: 'new-discovered-tool',
                  description: 'new',
                  parameters: { type: 'object' },
                },
              ],
            },
          ]),
        ),
      );
      toolRegistry.discoverTools();
      expect(toolRegistry.getTool('old-discovered-tool')).toBeUndefined();
      expect(toolRegistry.getTool('new-discovered-tool')).toBeInstanceOf(
        DiscoveredTool,
      );
    });

    it('should discover tools using MCP servers defined in getMcpServers', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined); // No regular discovery
      mockConfigGetMcpServerCommand.mockReturnValue(undefined); // No command-based MCP
      mockConfigGetMcpServers.mockReturnValue({
        'my-mcp-server': {
          command: 'mcp-server-cmd',
          args: ['--port', '1234'],
        },
      });

      const mockMcpClientInstance = vi.mocked(Client.prototype);
      mockMcpClientInstance.listTools.mockResolvedValue({
        tools: [
          {
            name: 'mcp-tool-1',
            description: 'An MCP tool',
            inputSchema: { type: 'object' },
          }, // Corrected: Add type: 'object'
        ],
      });
      mockMcpClientInstance.connect.mockResolvedValue(undefined);

      // discoverTools has an async IIFE, so we need to wait for it.
      // A simple way is to use a short timeout, but a more robust way would be to
      // have discoverTools return a promise that resolves when all async operations are done.
      // For now, using a timeout.
      toolRegistry.discoverTools();
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations

      expect(Client).toHaveBeenCalledTimes(1);
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'mcp-server-cmd',
        args: ['--port', '1234'],
        env: expect.any(Object),
        stderr: 'pipe',
      });
      expect(mockMcpClientInstance.connect).toHaveBeenCalled();
      expect(mockMcpClientInstance.listTools).toHaveBeenCalled();

      const discoveredTool = toolRegistry.getTool('mcp-tool-1'); // Name is not prefixed if only one MCP server from getMcpServers
      expect(discoveredTool).toBeInstanceOf(DiscoveredMCPTool);
      expect(discoveredTool?.name).toBe('mcp-tool-1');
      expect(discoveredTool?.description).toContain('An MCP tool');
      expect(discoveredTool?.description).toContain('mcp-tool-1');
    });

    it('should discover tools using MCP server command from getMcpServerCommand', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      mockConfigGetMcpServers.mockReturnValue({}); // No direct MCP servers
      mockConfigGetMcpServerCommand.mockReturnValue(
        'mcp-server-start-command --param',
      );

      const mockMcpClientInstance = vi.mocked(Client.prototype);
      mockMcpClientInstance.listTools.mockResolvedValue({
        tools: [
          {
            name: 'mcp-tool-cmd',
            description: 'An MCP tool from command',
            inputSchema: { type: 'object' },
          }, // Corrected: Add type: 'object'
        ],
      });
      mockMcpClientInstance.connect.mockResolvedValue(undefined);

      toolRegistry.discoverTools();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(Client).toHaveBeenCalledTimes(1);
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'mcp-server-start-command',
        args: ['--param'],
        env: expect.any(Object),
        stderr: 'pipe',
      });
      expect(mockMcpClientInstance.connect).toHaveBeenCalled();
      expect(mockMcpClientInstance.listTools).toHaveBeenCalled();

      const discoveredTool = toolRegistry.getTool('mcp-tool-cmd'); // Name is not prefixed if only one MCP server
      expect(discoveredTool).toBeInstanceOf(DiscoveredMCPTool);
      expect(discoveredTool?.name).toBe('mcp-tool-cmd');
    });

    it('should handle errors during MCP tool discovery gracefully', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      mockConfigGetMcpServers.mockReturnValue({
        'failing-mcp': { command: 'fail-cmd' },
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockMcpClientInstance = vi.mocked(Client.prototype);
      mockMcpClientInstance.connect.mockRejectedValue(
        new Error('Connection failed'),
      );

      // Need to await the async IIFE within discoverTools.
      // Since discoverTools itself isn't async, we can't directly await it.
      // We'll check the console.error mock.
      toolRegistry.discoverTools();
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations

      expect(console.error).toHaveBeenCalledWith(
        `failed to start or connect to MCP server 'failing-mcp' ${JSON.stringify({ command: 'fail-cmd' })}; \nError: Connection failed`,
      );
      expect(toolRegistry.getAllTools()).toHaveLength(0); // No tools should be registered
    });
  });
});

describe('DiscoveredTool', () => {
  let config: Config;
  const toolName = 'my-discovered-tool';
  const toolDescription = 'Does something cool.';
  const toolParamsSchema = {
    type: 'object',
    properties: { path: { type: 'string' } },
  };
  let mockSpawnInstance: Partial<ReturnType<typeof spawn>>;

  beforeEach(() => {
    const mockTargetDir = '/test/dir';
    config = new Config(
      'test-api-key',
      'test-model',
      false, // sandbox
      mockTargetDir, // targetDir
      false, // debugMode
      undefined, // question
      false, // fullContext
      undefined, // toolDiscoveryCommand
      undefined, // toolCallCommand
      undefined, // mcpServerCommand
      undefined, // mcpServers
      'TestAgent/1.0', // userAgent
    );
    vi.spyOn(config, 'getToolDiscoveryCommand').mockReturnValue(
      'discovery-cmd',
    );
    vi.spyOn(config, 'getToolCallCommand').mockReturnValue('call-cmd');

    const mockStdin = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      writable: true,
    } as any;

    const mockStdout = {
      on: vi.fn(),
      read: vi.fn(),
      readable: true,
    } as any;

    const mockStderr = {
      on: vi.fn(),
      read: vi.fn(),
      readable: true,
    } as any;

    mockSpawnInstance = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: vi.fn(), // For process events like 'close', 'error'
      kill: vi.fn(),
      pid: 123,
      connected: true,
      disconnect: vi.fn(),
      ref: vi.fn(),
      unref: vi.fn(),
      spawnargs: [],
      spawnfile: '',
      channel: null,
      exitCode: null,
      signalCode: null,
      killed: false,
      stdio: [mockStdin, mockStdout, mockStderr, null, null] as any,
    };
    vi.mocked(spawn).mockReturnValue(mockSpawnInstance as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor should set up properties correctly and enhance description', () => {
    const tool = new DiscoveredTool(
      config,
      toolName,
      toolDescription,
      toolParamsSchema,
    );
    expect(tool.name).toBe(toolName);
    expect(tool.schema.description).toContain(toolDescription);
    expect(tool.schema.description).toContain('discovery-cmd');
    expect(tool.schema.description).toContain('call-cmd my-discovered-tool');
    expect(tool.schema.parameters).toEqual(toolParamsSchema);
  });

  it('execute should call spawn with correct command and params, and return stdout on success', async () => {
    const tool = new DiscoveredTool(
      config,
      toolName,
      toolDescription,
      toolParamsSchema,
    );
    const params = { path: '/foo/bar' };
    const expectedOutput = JSON.stringify({ result: 'success' });

    // Simulate successful execution
    (mockSpawnInstance.stdout!.on as Mocked<any>).mockImplementation(
      (event: string, callback: (data: string) => void) => {
        if (event === 'data') {
          callback(expectedOutput);
        }
      },
    );
    (mockSpawnInstance.on as Mocked<any>).mockImplementation(
      (
        event: string,
        callback: (code: number | null, signal: NodeJS.Signals | null) => void,
      ) => {
        if (event === 'close') {
          callback(0, null); // Success
        }
      },
    );

    const result = await tool.execute(params);

    expect(spawn).toHaveBeenCalledWith('call-cmd', [toolName]);
    expect(mockSpawnInstance.stdin!.write).toHaveBeenCalledWith(
      JSON.stringify(params),
    );
    expect(mockSpawnInstance.stdin!.end).toHaveBeenCalled();
    expect(result.llmContent).toBe(expectedOutput);
    expect(result.returnDisplay).toBe(expectedOutput);
  });

  it('execute should return error details if spawn results in an error', async () => {
    const tool = new DiscoveredTool(
      config,
      toolName,
      toolDescription,
      toolParamsSchema,
    );
    const params = { path: '/foo/bar' };
    const stderrOutput = 'Something went wrong';
    const error = new Error('Spawn error');

    // Simulate error during spawn
    (mockSpawnInstance.stderr!.on as Mocked<any>).mockImplementation(
      (event: string, callback: (data: string) => void) => {
        if (event === 'data') {
          callback(stderrOutput);
        }
      },
    );
    (mockSpawnInstance.on as Mocked<any>).mockImplementation(
      (
        event: string,
        callback:
          | ((code: number | null, signal: NodeJS.Signals | null) => void)
          | ((error: Error) => void),
      ) => {
        if (event === 'error') {
          (callback as (error: Error) => void)(error); // Simulate 'error' event
        }
        if (event === 'close') {
          (
            callback as (
              code: number | null,
              signal: NodeJS.Signals | null,
            ) => void
          )(1, null); // Non-zero exit code
        }
      },
    );

    const result = await tool.execute(params);

    expect(result.llmContent).toContain(`Stderr: ${stderrOutput}`);
    expect(result.llmContent).toContain(`Error: ${error.toString()}`);
    expect(result.llmContent).toContain('Exit Code: 1');
    expect(result.returnDisplay).toBe(result.llmContent);
  });
});

describe('DiscoveredMCPTool', () => {
  let config: Config;
  let mockMcpClient: Client;
  const toolName = 'my-mcp-tool';
  const toolDescription = 'An MCP-discovered tool.';
  const toolInputSchema = {
    type: 'object',
    properties: { data: { type: 'string' } },
  };

  beforeEach(() => {
    const mockTargetDir = '/test/dir';
    config = new Config(
      'test-api-key',
      'test-model',
      false, // sandbox
      mockTargetDir, // targetDir
      false, // debugMode
      undefined, // question
      false, // fullContext
      undefined, // toolDiscoveryCommand
      undefined, // toolCallCommand
      undefined, // mcpServerCommand
      undefined, // mcpServers
      'TestAgent/1.0', // userAgent
    );
    mockMcpClient = new Client({
      name: 'test-client',
      version: '0.0.0',
    }) as Mocked<Client>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor should set up properties correctly and enhance description', () => {
    const tool = new DiscoveredMCPTool(
      mockMcpClient,
      config,
      toolName,
      toolDescription,
      toolInputSchema,
    );
    expect(tool.name).toBe(toolName);
    expect(tool.schema.description).toContain(toolDescription);
    expect(tool.schema.description).toContain('tools/call');
    expect(tool.schema.description).toContain(toolName);
    expect(tool.schema.parameters).toEqual(toolInputSchema);
  });

  it('execute should call mcpClient.callTool with correct params and return serialized result', async () => {
    const tool = new DiscoveredMCPTool(
      mockMcpClient,
      config,
      toolName,
      toolDescription,
      toolInputSchema,
    );
    const params = { data: 'test_data' };
    const mcpResult = { success: true, value: 'processed' };

    vi.mocked(mockMcpClient.callTool).mockResolvedValue(mcpResult);

    const result = await tool.execute(params);

    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: toolName,
      arguments: params,
    });
    const expectedOutput = JSON.stringify(mcpResult, null, 2);
    expect(result.llmContent).toBe(expectedOutput);
    expect(result.returnDisplay).toBe(expectedOutput);
  });
});
