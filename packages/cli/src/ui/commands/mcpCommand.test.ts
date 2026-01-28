/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mcpCommand } from './mcpCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  MCPServerStatus,
  MCPDiscoveryState,
  getMCPServerStatus,
  getMCPDiscoveryState,
  DiscoveredMCPTool,
  type MessageBus,
} from '@google/gemini-cli-core';

import type { CallableTool } from '@google/genai';
import { MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const mockAuthenticate = vi.fn();
  return {
    ...actual,
    getMCPServerStatus: vi.fn(),
    getMCPDiscoveryState: vi.fn(),
    MCPOAuthProvider: vi.fn(() => ({
      authenticate: mockAuthenticate,
    })),
    MCPOAuthTokenStorage: vi.fn(() => ({
      getToken: vi.fn(),
      isTokenExpired: vi.fn(),
    })),
  };
});

const mockMessageBus = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
} as unknown as MessageBus;

// Helper function to create a mock DiscoveredMCPTool
const createMockMCPTool = (
  name: string,
  serverName: string,
  description?: string,
) =>
  new DiscoveredMCPTool(
    {
      callTool: vi.fn(),
      tool: vi.fn(),
    } as unknown as CallableTool,
    serverName,
    name,
    description || 'Mock tool description',
    { type: 'object', properties: {} },
    mockMessageBus,
    undefined, // trust
    undefined, // nameOverride
    undefined, // cliConfig
    undefined, // extensionName
    undefined, // extensionId
  );

describe('mcpCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;
  let mockConfig: {
    getToolRegistry: ReturnType<typeof vi.fn>;
    getMcpServers: ReturnType<typeof vi.fn>;
    getBlockedMcpServers: ReturnType<typeof vi.fn>;
    getPromptRegistry: ReturnType<typeof vi.fn>;
    getGeminiClient: ReturnType<typeof vi.fn>;
    getMcpClientManager: ReturnType<typeof vi.fn>;
    getResourceRegistry: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock environment
    vi.unstubAllEnvs();

    // Default mock implementations
    vi.mocked(getMCPServerStatus).mockReturnValue(MCPServerStatus.CONNECTED);
    vi.mocked(getMCPDiscoveryState).mockReturnValue(
      MCPDiscoveryState.COMPLETED,
    );

    // Create mock config with all necessary methods
    mockConfig = {
      getToolRegistry: vi.fn().mockReturnValue({
        getAllTools: vi.fn().mockReturnValue([]),
      }),
      getMcpServers: vi.fn().mockReturnValue({}),
      getBlockedMcpServers: vi.fn().mockReturnValue([]),
      getPromptRegistry: vi.fn().mockReturnValue({
        getAllPrompts: vi.fn().mockReturnValue([]),
        getPromptsByServer: vi.fn().mockReturnValue([]),
      }),
      getGeminiClient: vi.fn(),
      getMcpClientManager: vi.fn().mockImplementation(() => ({
        getBlockedMcpServers: vi.fn(),
        getMcpServers: vi.fn(),
      })),
      getResourceRegistry: vi.fn().mockReturnValue({
        getAllResources: vi.fn().mockReturnValue([]),
      }),
    };

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });
  });

  describe('basic functionality', () => {
    it('should show an error if config is not available', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const result = await mcpCommand.action!(contextWithoutConfig, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should show an error if tool registry is not available', async () => {
      mockConfig.getToolRegistry = vi.fn().mockReturnValue(undefined);

      const result = await mcpCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Could not retrieve tool registry.',
      });
    });
  });

  describe('with configured MCP servers', () => {
    beforeEach(() => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
        server3: { command: 'cmd3' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);
      mockConfig.getMcpClientManager = vi.fn().mockReturnValue({
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
        getBlockedMcpServers: vi.fn().mockReturnValue([]),
      });
    });

    it('should display configured MCP servers with status indicators and their tools', async () => {
      // Setup getMCPServerStatus mock implementation
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTED;
        return MCPServerStatus.DISCONNECTED; // server3
      });

      // Mock tools from each server using actual DiscoveredMCPTool instances
      const mockServer1Tools = [
        createMockMCPTool('server1_tool1', 'server1'),
        createMockMCPTool('server1_tool2', 'server1'),
      ];
      const mockServer2Tools = [createMockMCPTool('server2_tool1', 'server2')];
      const mockServer3Tools = [createMockMCPTool('server3_tool1', 'server3')];

      const allTools = [
        ...mockServer1Tools,
        ...mockServer2Tools,
        ...mockServer3Tools,
      ];

      mockConfig.getToolRegistry = vi.fn().mockReturnValue({
        getAllTools: vi.fn().mockReturnValue(allTools),
      });

      const resourcesByServer: Record<
        string,
        Array<{ name: string; uri: string }>
      > = {
        server1: [
          {
            name: 'Server1 Resource',
            uri: 'file:///server1/resource1.txt',
          },
        ],
        server2: [],
        server3: [],
      };
      mockConfig.getResourceRegistry = vi.fn().mockReturnValue({
        getAllResources: vi.fn().mockReturnValue(
          Object.entries(resourcesByServer).flatMap(([serverName, resources]) =>
            resources.map((entry) => ({
              serverName,
              ...entry,
            })),
          ),
        ),
      });

      await mcpCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.MCP_STATUS,
          tools: allTools.map((tool) => ({
            serverName: tool.serverName,
            name: tool.name,
            description: tool.description,
            schema: tool.schema,
          })),
          resources: expect.arrayContaining([
            expect.objectContaining({
              serverName: 'server1',
              uri: 'file:///server1/resource1.txt',
            }),
          ]),
        }),
      );
    });

    it('should display tool descriptions when desc argument is used', async () => {
      const descSubCommand = mcpCommand.subCommands!.find(
        (c) => c.name === 'desc',
      );
      await descSubCommand!.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.MCP_STATUS,
          showDescriptions: true,
        }),
      );
    });

    it('should not display descriptions when nodesc argument is used', async () => {
      const listSubCommand = mcpCommand.subCommands!.find(
        (c) => c.name === 'list',
      );
      await listSubCommand!.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.MCP_STATUS,
          showDescriptions: false,
        }),
      );
    });
  });
});
