/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mocked, MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConfigParameters } from '../config/config.js';
import { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';

import {
  ToolRegistry,
  DiscoveredTool,
  DISCOVERED_TOOL_PREFIX,
} from './tool-registry.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import type { FunctionDeclaration, CallableTool } from '@google/genai';
import { mcpToTool } from '@google/genai';
import { spawn } from 'node:child_process';

import fs from 'node:fs';
import { MockTool } from '../test-utils/mock-tool.js';
import { ToolErrorType } from './tool-error.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

vi.mock('node:fs');

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
  let mockConfigGetExcludedTools: MockInstance<
    typeof Config.prototype.getExcludeTools
  >;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
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
    mockConfigGetExcludedTools = vi.spyOn(config, 'getExcludeTools');
    vi.spyOn(config, 'getMcpServers');
    vi.spyOn(config, 'getMcpServerCommand');
    vi.spyOn(config, 'getPromptRegistry').mockReturnValue({
      clear: vi.fn(),
      removePromptsByServer: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerTool', () => {
    it('should register a new tool', () => {
      const tool = new MockTool({ name: 'mock-tool' });
      toolRegistry.registerTool(tool);
      expect(toolRegistry.getTool('mock-tool')).toBe(tool);
    });
  });

  describe('excluded tools', () => {
    const simpleTool = new MockTool({
      name: 'tool-a',
      displayName: 'Tool a',
    });
    const excludedTool = new ExcludedMockTool({
      name: 'excluded-tool-class',
      displayName: 'Excluded Tool Class',
    });
    const mockCallable = {} as CallableTool;
    const mcpTool = new DiscoveredMCPTool(
      mockCallable,
      'mcp-server',
      'excluded-mcp-tool',
      'description',
      {},
    );
    const allowedTool = new MockTool({
      name: 'allowed-tool',
      displayName: 'Allowed Tool',
    });

    it.each([
      {
        name: 'should match simple names',
        tools: [simpleTool],
        excludedTools: ['tool-a'],
      },
      {
        name: 'should match simple MCP tool names, when qualified or unqualified',
        tools: [mcpTool, mcpTool.asFullyQualifiedTool()],
        excludedTools: [mcpTool.name],
      },
      {
        name: 'should match qualified MCP tool names when qualified or unqualified',
        tools: [mcpTool, mcpTool.asFullyQualifiedTool()],
        excludedTools: [`${mcpTool.getFullyQualifiedPrefix()}${mcpTool.name}`],
      },
      {
        name: 'should match class names',
        tools: [excludedTool],
        excludedTools: ['ExcludedMockTool'],
      },
    ])('$name', ({ tools, excludedTools }) => {
      toolRegistry.registerTool(allowedTool);
      for (const tool of tools) {
        toolRegistry.registerTool(tool);
      }
      mockConfigGetExcludedTools.mockReturnValue(new Set(excludedTools));

      expect(toolRegistry.getAllTools()).toEqual([allowedTool]);
      expect(toolRegistry.getAllToolNames()).toEqual([allowedTool.name]);
      expect(toolRegistry.getFunctionDeclarations()).toEqual(
        toolRegistry.getFunctionDeclarationsFiltered([allowedTool.name]),
      );
      for (const tool of tools) {
        expect(toolRegistry.getTool(tool.name)).toBeUndefined();
        expect(
          toolRegistry.getFunctionDeclarationsFiltered([tool.name]),
        ).toHaveLength(0);
        if (tool instanceof DiscoveredMCPTool) {
          expect(toolRegistry.getToolsByServer(tool.serverName)).toHaveLength(
            0,
          );
        }
      }
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools sorted alphabetically by displayName', () => {
      // Register tools with displayNames in non-alphabetical order
      const toolC = new MockTool({ name: 'c-tool', displayName: 'Tool C' });
      const toolA = new MockTool({ name: 'a-tool', displayName: 'Tool A' });
      const toolB = new MockTool({ name: 'b-tool', displayName: 'Tool B' });

      toolRegistry.registerTool(toolC);
      toolRegistry.registerTool(toolA);
      toolRegistry.registerTool(toolB);

      const allTools = toolRegistry.getAllTools();
      const displayNames = allTools.map((t) => t.displayName);

      // Assert that the returned array is sorted by displayName
      expect(displayNames).toEqual(['Tool A', 'Tool B', 'Tool C']);
    });
  });

  describe('getAllToolNames', () => {
    it('should return all registered tool names', () => {
      // Register tools with displayNames in non-alphabetical order
      const toolC = new MockTool({ name: 'c-tool', displayName: 'Tool C' });
      const toolA = new MockTool({ name: 'a-tool', displayName: 'Tool A' });
      const toolB = new MockTool({ name: 'b-tool', displayName: 'Tool B' });

      toolRegistry.registerTool(toolC);
      toolRegistry.registerTool(toolA);
      toolRegistry.registerTool(toolB);

      const toolNames = toolRegistry.getAllToolNames();

      // Assert that the returned array contains all tool names
      expect(toolNames).toEqual(['c-tool', 'a-tool', 'b-tool']);
    });
  });

  describe('getToolsByServer', () => {
    it('should return an empty array if no tools match the server name', () => {
      toolRegistry.registerTool(new MockTool({ name: 'mock-tool' }));
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
      const nonMcpTool = new MockTool({ name: 'regular-tool' });

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

  describe('sortTools', () => {
    it('should sort tools by priority: built-in, discovered, then MCP (by server name)', () => {
      const builtIn1 = new MockTool({ name: 'builtin-1' });
      const builtIn2 = new MockTool({ name: 'builtin-2' });
      const discovered1 = new DiscoveredTool(
        config,
        'discovered-1',
        DISCOVERED_TOOL_PREFIX + 'discovered-1',
        'desc',
        {},
      );
      const mockCallable = {} as CallableTool;
      const mcpZebra = new DiscoveredMCPTool(
        mockCallable,
        'zebra-server',
        'mcp-zebra',
        'desc',
        {},
      );
      const mcpApple = new DiscoveredMCPTool(
        mockCallable,
        'apple-server',
        'mcp-apple',
        'desc',
        {},
      );

      // Register in mixed order
      toolRegistry.registerTool(mcpZebra);
      toolRegistry.registerTool(discovered1);
      toolRegistry.registerTool(builtIn1);
      toolRegistry.registerTool(mcpApple);
      toolRegistry.registerTool(builtIn2);

      toolRegistry.sortTools();

      expect(toolRegistry.getAllToolNames()).toEqual([
        'builtin-1',
        'builtin-2',
        DISCOVERED_TOOL_PREFIX + 'discovered-1',
        'mcp-apple',
        'mcp-zebra',
      ]);
    });
  });

  describe('discoverTools', () => {
    it('should will preserve tool parametersJsonSchema during discovery from command', async () => {
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);

      const unsanitizedToolDeclaration: FunctionDeclaration = {
        name: 'tool-with-bad-format',
        description: 'A tool with an invalid format property',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            some_string: {
              type: 'string',
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

      const discoveredTool = toolRegistry.getTool(
        DISCOVERED_TOOL_PREFIX + 'tool-with-bad-format',
      );
      expect(discoveredTool).toBeDefined();

      const registeredParams = (discoveredTool as DiscoveredTool).schema
        .parametersJsonSchema;
      expect(registeredParams).toStrictEqual({
        type: 'object',
        properties: {
          some_string: {
            type: 'string',
            format: 'uuid',
          },
        },
      });
    });

    it('should return a DISCOVERED_TOOL_EXECUTION_ERROR on tool failure', async () => {
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);
      vi.spyOn(config, 'getToolCallCommand').mockReturnValue('my-call-command');

      const toolDeclaration: FunctionDeclaration = {
        name: 'failing-tool',
        description: 'A tool that fails',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      };

      const mockSpawn = vi.mocked(spawn);
      // --- Discovery Mock ---
      const discoveryProcess = {
        stdout: { on: vi.fn(), removeListener: vi.fn() },
        stderr: { on: vi.fn(), removeListener: vi.fn() },
        on: vi.fn(),
      };
      mockSpawn.mockReturnValueOnce(discoveryProcess as any);

      discoveryProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(
            Buffer.from(
              JSON.stringify([{ functionDeclarations: [toolDeclaration] }]),
            ),
          );
        }
      });
      discoveryProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await toolRegistry.discoverAllTools();
      const discoveredTool = toolRegistry.getTool(
        DISCOVERED_TOOL_PREFIX + 'failing-tool',
      );
      expect(discoveredTool).toBeDefined();

      // --- Execution Mock ---
      const executionProcess = {
        stdout: { on: vi.fn(), removeListener: vi.fn() },
        stderr: { on: vi.fn(), removeListener: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        connected: true,
        disconnect: vi.fn(),
        removeListener: vi.fn(),
      };
      mockSpawn.mockReturnValueOnce(executionProcess as any);

      executionProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('Something went wrong'));
        }
      });
      executionProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(1); // Non-zero exit code
        }
      });

      const invocation = (discoveredTool as DiscoveredTool).build({});
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error?.type).toBe(
        ToolErrorType.DISCOVERED_TOOL_EXECUTION_ERROR,
      );
      expect(result.llmContent).toContain('Stderr: Something went wrong');
      expect(result.llmContent).toContain('Exit Code: 1');
    });

    it('should pass MessageBus to DiscoveredTool and its invocations', async () => {
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);

      // Mock MessageBus
      const mockMessageBus = {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      } as unknown as MessageBus;
      toolRegistry.setMessageBus(mockMessageBus);

      const toolDeclaration: FunctionDeclaration = {
        name: 'policy-test-tool',
        description: 'tests policy',
        parametersJsonSchema: { type: 'object', properties: {} },
      };

      const mockSpawn = vi.mocked(spawn);
      const discoveryProcess = {
        stdout: { on: vi.fn(), removeListener: vi.fn() },
        stderr: { on: vi.fn(), removeListener: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValueOnce(discoveryProcess as any);

      discoveryProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(
            Buffer.from(
              JSON.stringify([{ functionDeclarations: [toolDeclaration] }]),
            ),
          );
        }
      });
      discoveryProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await toolRegistry.discoverAllTools();
      const tool = toolRegistry.getTool(
        DISCOVERED_TOOL_PREFIX + 'policy-test-tool',
      );
      expect(tool).toBeDefined();

      // Verify DiscoveredTool has the message bus
      expect((tool as any).messageBus).toBe(mockMessageBus);

      const invocation = tool!.build({});

      // Verify DiscoveredToolInvocation has the message bus
      expect((invocation as any).messageBus).toBe(mockMessageBus);
    });
  });

  describe('DiscoveredToolInvocation', () => {
    it('should return the stringified params from getDescription', () => {
      const tool = new DiscoveredTool(
        config,
        'test-tool',
        DISCOVERED_TOOL_PREFIX + 'test-tool',
        'A test tool',
        {},
      );
      const params = { param: 'testValue' };
      const invocation = tool.build(params);
      const description = invocation.getDescription();
      expect(description).toBe(JSON.stringify(params));
    });
  });
});

/**
 * Used for tests that exclude by class name.
 */
class ExcludedMockTool extends MockTool {
  constructor(options: ConstructorParameters<typeof MockTool>[0]) {
    super(options);
  }
}
