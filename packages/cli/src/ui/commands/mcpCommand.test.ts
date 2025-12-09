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
} from '@google/gemini-cli-core';

import type { CallableTool } from '@google/genai';
import { Type } from '@google/genai';
import { MessageType } from '../types.js';

// Define a type for the mocked parts of McpClientManager
type MockMcpClientManager = {
  getMcpServers: ReturnType<typeof vi.fn<[], Record<string, unknown>>>;
  getAllMcpServerNames: ReturnType<typeof vi.fn<[], string[]>>;
  getBlockedMcpServers: ReturnType<typeof vi.fn<[], Array<{ name: string }>>>;
  getServerConfig: ReturnType<typeof vi.fn>;
  disconnectServer: ReturnType<typeof vi.fn>;
  maybeDiscoverMcpServer: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  restartServer: ReturnType<typeof vi.fn>;
};

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
    description || `Description for ${name}`,
    { type: Type.OBJECT, properties: {} },
  );

// Define a type for the mocked parts of SettingsService
type MockSettings = {
  merged: {
    mcp: {
      disabled: string[];
    };
  };
  user: {
    settings: {
      mcp: {
        disabled: string[];
      };
    };
  };
  workspace: {
    settings: {
      mcp: {
        disabled: string[];
      };
    };
  };
  setValue: ReturnType<typeof vi.fn>;
};

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
      getPromptRegistry: vi.fn().mockResolvedValue({
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

  describe('server management actions', () => {
    let mockMcpClientManager: MockMcpClientManager;
    let mockSettings: MockSettings;

    beforeEach(() => {
      mockMcpClientManager = {
        getMcpServers: vi.fn().mockReturnValue({}),
        getAllMcpServerNames: vi.fn().mockReturnValue(['server1', 'server2']),
        getBlockedMcpServers: vi.fn().mockReturnValue([]),
        getServerConfig: vi.fn(),
        disconnectServer: vi.fn(),
        maybeDiscoverMcpServer: vi.fn(),
        restart: vi.fn(),
        restartServer: vi.fn(),
      };

      mockConfig.getMcpClientManager = vi
        .fn()
        .mockReturnValue(mockMcpClientManager);

      mockSettings = {
        merged: {
          mcp: {
            disabled: [],
          },
        },
        user: {
          settings: {
            mcp: {
              disabled: [],
            },
          },
        },
        workspace: {
          settings: {
            mcp: {
              disabled: [],
            },
          },
        },
        setValue: vi.fn(),
      };
      mockContext.services.settings = mockSettings;
    });

    describe('enableAction', () => {
      const enableCommand = mcpCommand.subCommands!.find(
        (c) => c.name === 'enable',
      )!;

      it('should enable a disabled server in User scope', async () => {
        mockSettings.merged.mcp.disabled = ['server1'];
        mockSettings.user.settings.mcp.disabled = ['server1'];
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });

        const result = await enableCommand.action!(mockContext, 'server1');

        expect(mockSettings.setValue).toHaveBeenCalledWith(
          'User',
          'mcp.disabled',
          [],
        );
        expect(
          mockMcpClientManager.maybeDiscoverMcpServer,
        ).toHaveBeenCalledWith('server1', expect.any(Object), {
          forceConnect: true,
        });
        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('enabled successfully'),
          }),
        );
      });

      it('should enable a disabled server in Workspace scope', async () => {
        mockSettings.merged.mcp.disabled = ['server1'];
        mockSettings.workspace.settings.mcp.disabled = ['server1'];
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });

        const result = await enableCommand.action!(mockContext, 'server1');

        expect(mockSettings.setValue).toHaveBeenCalledWith(
          'Workspace',
          'mcp.disabled',
          [],
        );
        expect(
          mockMcpClientManager.maybeDiscoverMcpServer,
        ).toHaveBeenCalledWith('server1', expect.any(Object), {
          forceConnect: true,
        });
        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('enabled successfully'),
          }),
        );
      });

      it('should enable a disabled server in BOTH scopes', async () => {
        mockSettings.merged.mcp.disabled = ['server1'];
        mockSettings.user.settings.mcp.disabled = ['server1'];
        mockSettings.workspace.settings.mcp.disabled = ['server1'];
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });

        const result = await enableCommand.action!(mockContext, 'server1');

        expect(mockSettings.setValue).toHaveBeenCalledWith(
          'User',
          'mcp.disabled',
          [],
        );
        expect(mockSettings.setValue).toHaveBeenCalledWith(
          'Workspace',
          'mcp.disabled',
          [],
        );
        expect(
          mockMcpClientManager.maybeDiscoverMcpServer,
        ).toHaveBeenCalledWith('server1', expect.any(Object), {
          forceConnect: true,
        });
        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('enabled successfully'),
          }),
        );
      });

      it('should warn if server is not disabled', async () => {
        mockSettings.merged.mcp.disabled = [];

        const result = await enableCommand.action!(mockContext, 'server1');

        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('is not disabled'),
          }),
        );
        expect(mockSettings.setValue).not.toHaveBeenCalled();
      });

      it('should warn if server is blocked', async () => {
        mockSettings.merged.mcp.disabled = ['server1'];
        mockSettings.user.settings.mcp.disabled = ['server1'];
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });
        mockMcpClientManager.getBlockedMcpServers.mockReturnValue([
          { name: 'server1' },
        ]);

        const result = await enableCommand.action!(mockContext, 'server1');

        expect(result).toEqual(
          expect.objectContaining({
            content: expect.stringContaining(
              'Warning: This server appears to be blocked',
            ),
          }),
        );
      });
    });

    describe('disableAction', () => {
      const disableCommand = mcpCommand.subCommands!.find(
        (c) => c.name === 'disable',
      )!;

      it('should disable an enabled server', async () => {
        mockSettings.merged.mcp.disabled = [];

        const result = await disableCommand.action!(mockContext, 'server1');

        expect(mockSettings.setValue).toHaveBeenCalledWith(
          expect.any(String),
          'mcp.disabled',
          ['server1'],
        );
        expect(mockMcpClientManager.disconnectServer).toHaveBeenCalledWith(
          'server1',
        );
        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('disabled successfully'),
          }),
        );
      });

      it('should warn if server is already disabled', async () => {
        mockSettings.merged.mcp.disabled = ['server1'];

        const result = await disableCommand.action!(mockContext, 'server1');

        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('is already disabled'),
          }),
        );
        expect(mockSettings.setValue).not.toHaveBeenCalled();
      });
    });

    describe('mountAction', () => {
      const mountCommand = mcpCommand.subCommands!.find(
        (c) => c.name === 'mount',
      )!;

      it('should mount a server', async () => {
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });

        const result = await mountCommand.action!(mockContext, 'server1');

        expect(
          mockContext.session.setSessionMountedMcpServers,
        ).toHaveBeenCalled();
        expect(
          mockMcpClientManager.maybeDiscoverMcpServer,
        ).toHaveBeenCalledWith('server1', expect.any(Object), {
          forceConnect: true,
        });
        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('mounted for this session'),
          }),
        );
      });

      it('should mount a disabled server', async () => {
        mockSettings.merged.mcp.disabled = ['server1'];
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });

        const result = await mountCommand.action!(mockContext, 'server1');

        expect(
          mockContext.session.setSessionMountedMcpServers,
        ).toHaveBeenCalled();
        expect(
          mockMcpClientManager.maybeDiscoverMcpServer,
        ).toHaveBeenCalledWith('server1', expect.any(Object), {
          forceConnect: true,
        });
        expect(result).toEqual(
          expect.objectContaining({
            content: expect.stringContaining(
              'will return to disabled on restart',
            ),
          }),
        );
      });

      it('should warn if server is blocked', async () => {
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });
        mockMcpClientManager.getBlockedMcpServers.mockReturnValue([
          { name: 'server1' },
        ]);

        const result = await mountCommand.action!(mockContext, 'server1');

        expect(result).toEqual(
          expect.objectContaining({
            content: expect.stringContaining('Warning: This server is blocked'),
          }),
        );
      });

      it('should warn if server is already connected', async () => {
        mockMcpClientManager.getServerConfig.mockReturnValue({
          command: 'cmd',
        });
        mockMcpClientManager.getMcpServers.mockReturnValue({
          server1: {},
        });

        const result = await mountCommand.action!(mockContext, 'server1');

        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('is already connected'),
          }),
        );
        expect(
          mockMcpClientManager.maybeDiscoverMcpServer,
        ).not.toHaveBeenCalled();
      });
    });

    describe('unmountAction', () => {
      const unmountCommand = mcpCommand.subCommands!.find(
        (c) => c.name === 'unmount',
      )!;

      it('should unmount a connected server', async () => {
        mockMcpClientManager.getMcpServers.mockReturnValue({
          server1: {},
        });

        const result = await unmountCommand.action!(mockContext, 'server1');

        expect(
          mockContext.session.setSessionUnmountedMcpServers,
        ).toHaveBeenCalled();
        expect(mockMcpClientManager.disconnectServer).toHaveBeenCalledWith(
          'server1',
        );
        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('unmounted for this session'),
          }),
        );
      });

      it('should warn if server is already unmounted', async () => {
        mockContext.session.sessionUnmountedMcpServers.add('server1');

        const result = await unmountCommand.action!(mockContext, 'server1');

        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('already unmounted'),
          }),
        );
        expect(mockMcpClientManager.disconnectServer).not.toHaveBeenCalled();
      });

      it('should warn if server is not connected', async () => {
        mockMcpClientManager.getMcpServers.mockReturnValue({});

        const result = await unmountCommand.action!(mockContext, 'server1');

        expect(result).toEqual(
          expect.objectContaining({
            messageType: 'info',
            content: expect.stringContaining('not currently connected'),
          }),
        );
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
        expect.any(Number),
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
        expect.any(Number),
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
        expect.any(Number),
      );
    });
  });
});
