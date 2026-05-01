/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { loadSettings, SettingScope } from '../../config/settings.js';

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

import type { CallableTool } from '@google/genai';
import { MessageType, type HistoryItemMcpStatus } from '../types.js';

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
    undefined, // isReadOnly
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
    setUserInteractedWithMcp: ReturnType<typeof vi.fn>;
    getLastMcpError: ReturnType<typeof vi.fn>;
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
        getBlockedMcpServers: vi.fn().mockReturnValue([]),
        getMcpServers: vi.fn().mockReturnValue({}),
        getLastError: vi.fn().mockReturnValue(undefined),
      })),
      getResourceRegistry: vi.fn().mockReturnValue({
        getAllResources: vi.fn().mockReturnValue([]),
      }),
      setUserInteractedWithMcp: vi.fn(),
      getLastMcpError: vi.fn().mockReturnValue(undefined),
    };

    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: mockConfig,
          toolRegistry: mockConfig.getToolRegistry(),
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should show an error if config is not available', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          agentContext: null,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockContext.services.agentContext as any).toolRegistry = undefined;

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
        getLastError: vi.fn().mockReturnValue(undefined),
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

      const mockToolRegistry = {
        getAllTools: vi.fn().mockReturnValue(allTools),
      };
      mockConfig.getToolRegistry = vi.fn().mockReturnValue(mockToolRegistry);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockContext.services.agentContext as any).toolRegistry =
        mockToolRegistry;

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

    it('should filter servers by name when an argument is provided to list', async () => {
      await mcpCommand.action!(mockContext, 'list server1');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.MCP_STATUS,
          servers: expect.objectContaining({
            server1: expect.any(Object),
          }),
        }),
      );

      // Should NOT contain server2 or server3
      const call = vi.mocked(mockContext.ui.addItem).mock
        .calls[0][0] as HistoryItemMcpStatus;
      expect(Object.keys(call.servers)).toEqual(['server1']);
    });

    it('should filter servers by name and show descriptions when an argument is provided to desc', async () => {
      await mcpCommand.action!(mockContext, 'desc server2');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.MCP_STATUS,
          showDescriptions: true,
          servers: expect.objectContaining({
            server2: expect.any(Object),
          }),
        }),
      );

      const call = vi.mocked(mockContext.ui.addItem).mock
        .calls[0][0] as HistoryItemMcpStatus;
      expect(Object.keys(call.servers)).toEqual(['server2']);
    });
  });

  describe('remove subcommand', () => {
    const findRemove = () =>
      mcpCommand.subCommands!.find((c) => c.name === 'remove')!;

    let setValueMock: ReturnType<typeof vi.fn>;
    let restartMock: ReturnType<typeof vi.fn>;
    let scopeContents: Record<string, Record<string, unknown>>;

    const installSettingsMock = () => {
      vi.mocked(loadSettings).mockReturnValue({
        forScope: (scope: SettingScope) => ({
          settings: { mcpServers: scopeContents[scope] ?? {} },
        }),
        setValue: setValueMock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    };

    beforeEach(() => {
      setValueMock = vi.fn();
      restartMock = vi.fn().mockResolvedValue(undefined);

      const mockMcpServers = {
        server1: { command: 'cmd1' },
        ext1: { command: 'cmd2', extension: { name: 'my-ext' } },
      };
      mockConfig.getMcpClientManager = vi.fn().mockReturnValue({
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
        getBlockedMcpServers: vi.fn().mockReturnValue([]),
        getLastError: vi.fn().mockReturnValue(undefined),
        restart: restartMock,
      });

      // Default: server1 only in workspace
      scopeContents = {
        [SettingScope.Workspace]: { server1: { command: 'cmd1' } },
        [SettingScope.User]: {},
      };
      installSettingsMock();
    });

    it('errors when no server name is provided', async () => {
      const result = await findRemove().action!(mockContext, '');
      expect(result).toMatchObject({
        messageType: 'error',
        content: expect.stringContaining('Server name required'),
      });
    });

    it('errors when server is not configured', async () => {
      const result = await findRemove().action!(mockContext, 'unknown');
      expect(result).toMatchObject({
        messageType: 'error',
        content: expect.stringContaining("'unknown' not found"),
      });
    });

    it('errors when server is provided by an extension', async () => {
      const result = await findRemove().action!(mockContext, 'ext1');
      expect(result).toMatchObject({
        messageType: 'error',
        content: expect.stringContaining('extension'),
      });
      expect(setValueMock).not.toHaveBeenCalled();
    });

    it('removes the server from workspace settings and reloads', async () => {
      const result = await findRemove().action!(mockContext, 'server1');
      expect(setValueMock).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'mcpServers',
        {},
      );
      expect(restartMock).toHaveBeenCalled();
      expect(mockContext.ui.reloadCommands).toHaveBeenCalled();
      expect(result).toMatchObject({
        messageType: 'info',
        content: expect.stringContaining("'server1' removed"),
      });
    });

    it('errors when server is not in user or workspace settings (e.g. system scope only)', async () => {
      scopeContents = {
        [SettingScope.Workspace]: {},
        [SettingScope.User]: {},
      };
      installSettingsMock();
      const result = await findRemove().action!(mockContext, 'server1');
      expect(result).toMatchObject({
        messageType: 'error',
        content: expect.stringContaining('not defined in user or workspace'),
      });
      expect(setValueMock).not.toHaveBeenCalled();
    });

    it('refuses to delete when server exists in both scopes without explicit --scope', async () => {
      scopeContents = {
        [SettingScope.Workspace]: { server1: { command: 'cmd1' } },
        [SettingScope.User]: { server1: { command: 'cmd1-user' } },
      };
      installSettingsMock();
      const result = await findRemove().action!(mockContext, 'server1');
      expect(result).toMatchObject({
        messageType: 'error',
        content: expect.stringContaining('BOTH workspace and user'),
      });
      expect(setValueMock).not.toHaveBeenCalled();
    });

    it('removes from user scope when --scope user is given', async () => {
      scopeContents = {
        [SettingScope.Workspace]: { server1: { command: 'cmd1' } },
        [SettingScope.User]: { server1: { command: 'cmd1-user' } },
      };
      installSettingsMock();
      const result = await findRemove().action!(
        mockContext,
        'server1 --scope user',
      );
      expect(setValueMock).toHaveBeenCalledTimes(1);
      expect(setValueMock).toHaveBeenCalledWith(
        SettingScope.User,
        'mcpServers',
        {},
      );
      expect(result).toMatchObject({ messageType: 'info' });
    });

    it('removes from both scopes when --scope all is given', async () => {
      scopeContents = {
        [SettingScope.Workspace]: { server1: { command: 'cmd1' } },
        [SettingScope.User]: { server1: { command: 'cmd1-user' } },
      };
      installSettingsMock();
      const result = await findRemove().action!(
        mockContext,
        'server1 --scope all',
      );
      expect(setValueMock).toHaveBeenCalledTimes(2);
      expect(setValueMock).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'mcpServers',
        {},
      );
      expect(setValueMock).toHaveBeenCalledWith(
        SettingScope.User,
        'mcpServers',
        {},
      );
      expect(result).toMatchObject({
        messageType: 'info',
        content: expect.stringContaining('workspace and user'),
      });
    });

    it('errors when --scope user is given but server is not in user scope', async () => {
      // Default scopeContents: only in workspace
      const result = await findRemove().action!(
        mockContext,
        'server1 --scope user',
      );
      expect(result).toMatchObject({
        messageType: 'error',
        content: expect.stringContaining('not defined in user settings'),
      });
      expect(setValueMock).not.toHaveBeenCalled();
    });

    it('errors on invalid --scope value', async () => {
      const result = await findRemove().action!(
        mockContext,
        'server1 --scope global',
      );
      expect(result).toMatchObject({
        messageType: 'error',
        content: expect.stringContaining('Invalid --scope value'),
      });
    });

    it('completion returns servers without extension origin matching prefix', async () => {
      const out = await findRemove().completion!(mockContext, 'ser');
      expect(out).toEqual(['server1']);
    });
  });
});
