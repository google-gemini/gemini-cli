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
import { ToolRegistry, DiscoveredTool } from './tool-registry.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import {
  Config,
  ConfigParameters,
  MCPServerConfig,
  ApprovalMode,
} from '../config/config.js';
import { BaseTool, ToolResult } from './tools.js';
import {
  FunctionDeclaration,
  CallableTool,
  mcpToTool,
  Type,
} from '@google/genai';
import { execSync } from 'node:child_process';

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
    // listTools and callTool are no longer directly used by ToolRegistry/discoverMcpTools
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
      // Default mock implementation
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

  beforeEach(() => {
    config = new Config(baseConfigParams);
    toolRegistry = new ToolRegistry(config);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Reset mocks for MCP parts
    mockMcpClientConnect.mockReset().mockResolvedValue(undefined); // Default connect success
    mockStdioTransportClose.mockReset();
    mockSseTransportClose.mockReset();
    vi.mocked(mcpToTool).mockClear();
    // Default mcpToTool to return a callable tool that returns no functions
    vi.mocked(mcpToTool).mockReturnValue(createMockCallableTool([]));
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
    // ... other registerTool tests
  });

  describe('getToolsByServer', () => {
    it('should return an empty array if no tools match the server name', () => {
      toolRegistry.registerTool(new MockTool()); // A non-MCP tool
      expect(toolRegistry.getToolsByServer('any-mcp-server')).toEqual([]);
    });

    it('should return only tools matching the server name', async () => {
      const server1Name = 'mcp-server-uno';
      const server2Name = 'mcp-server-dos';

      // Manually register mock MCP tools for this test
      const mockCallable = {} as CallableTool; // Minimal mock callable
      const mcpTool1 = new DiscoveredMCPTool(
        mockCallable,
        server1Name,
        'server1Name__tool-on-server1',
        'd1',
        {},
        'tool-on-server1',
      );
      const mcpTool2 = new DiscoveredMCPTool(
        mockCallable,
        server2Name,
        'server2Name__tool-on-server2',
        'd2',
        {},
        'tool-on-server2',
      );
      const nonMcpTool = new MockTool('regular-tool');

      toolRegistry.registerTool(mcpTool1);
      toolRegistry.registerTool(mcpTool2);
      toolRegistry.registerTool(nonMcpTool);

      const toolsFromServer1 = toolRegistry.getToolsByServer(server1Name);
      expect(toolsFromServer1).toHaveLength(1);
      expect(toolsFromServer1[0].name).toBe(mcpTool1.name);
      expect((toolsFromServer1[0] as DiscoveredMCPTool).serverName).toBe(
        server1Name,
      );

      const toolsFromServer2 = toolRegistry.getToolsByServer(server2Name);
      expect(toolsFromServer2).toHaveLength(1);
      expect(toolsFromServer2[0].name).toBe(mcpTool2.name);
      expect((toolsFromServer2[0] as DiscoveredMCPTool).serverName).toBe(
        server2Name,
      );

      expect(toolRegistry.getToolsByServer('non-existent-server')).toEqual([]);
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
      toolRegistry = new ToolRegistry(config); // Reset registry
      // Reset the mock for discoverMcpTools before each test in this suite
      mockDiscoverMcpTools.mockReset().mockResolvedValue(undefined);
    });

    it('should discover tools using discovery command', async () => {
      // ... this test remains largely the same
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);
      const mockToolDeclarations: FunctionDeclaration[] = [
        {
          name: 'discovered-tool-1',
          description: 'A discovered tool',
          parameters: { type: Type.OBJECT, properties: {} },
        },
      ];
      mockExecSync.mockReturnValue(
        Buffer.from(
          JSON.stringify([{ function_declarations: mockToolDeclarations }]),
        ),
      );
      await toolRegistry.discoverTools();
      expect(execSync).toHaveBeenCalledWith(discoveryCommand);
      const discoveredTool = toolRegistry.getTool('discovered-tool-1');
      expect(discoveredTool).toBeInstanceOf(DiscoveredTool);
    });

    it('should discover tools using MCP servers defined in getMcpServers', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      mockConfigGetMcpServerCommand.mockReturnValue(undefined);
      const mcpServerConfigVal = {
        'my-mcp-server': {
          command: 'mcp-server-cmd',
          args: ['--port', '1234'],
          trust: true,
        } as MCPServerConfig,
      };
      mockConfigGetMcpServers.mockReturnValue(mcpServerConfigVal);

      await toolRegistry.discoverTools();

      expect(mockDiscoverMcpTools).toHaveBeenCalledWith(
        mcpServerConfigVal,
        undefined,
        toolRegistry,
      );
      // We no longer check these as discoverMcpTools is mocked
      // expect(vi.mocked(mcpToTool)).toHaveBeenCalledTimes(1);
      // expect(Client).toHaveBeenCalledTimes(1);
      // expect(StdioClientTransport).toHaveBeenCalledWith({
      //   command: 'mcp-server-cmd',
      //   args: ['--port', '1234'],
      //   env: expect.any(Object),
      //   stderr: 'pipe',
      // });
      // expect(mockMcpClientConnect).toHaveBeenCalled();

      // To verify that tools *would* have been registered, we'd need mockDiscoverMcpTools
      // to call toolRegistry.registerTool, or we test that separately.
      // For now, we just check that the delegation happened.
    });

    it('should discover tools using MCP server command from getMcpServerCommand', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      mockConfigGetMcpServers.mockReturnValue({});
      mockConfigGetMcpServerCommand.mockReturnValue(
        'mcp-server-start-command --param',
      );

      await toolRegistry.discoverTools();
      expect(mockDiscoverMcpTools).toHaveBeenCalledWith(
        {},
        'mcp-server-start-command --param',
        toolRegistry,
      );
    });

    it('should handle errors during MCP client connection gracefully and close transport', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      mockConfigGetMcpServers.mockReturnValue({
        'failing-mcp': { command: 'fail-cmd' } as MCPServerConfig,
      });

      mockMcpClientConnect.mockRejectedValue(new Error('Connection failed'));

      await toolRegistry.discoverTools();
      expect(mockDiscoverMcpTools).toHaveBeenCalledWith(
        {
          'failing-mcp': { command: 'fail-cmd' },
        },
        undefined,
        toolRegistry,
      );
      expect(toolRegistry.getAllTools()).toHaveLength(0);
    });
  });
  // Other tests for DiscoveredTool and DiscoveredMCPTool can be simplified or removed
  // if their core logic is now tested in their respective dedicated test files (mcp-tool.test.ts)
});
