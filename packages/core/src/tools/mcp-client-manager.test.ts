/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedObject,
} from 'vitest';
import { McpClientManager } from './mcp-client-manager.js';
import { McpClient, MCPDiscoveryState } from './mcp-client.js';
import type { ToolRegistry } from './tool-registry.js';
import type { Config } from '../config/config.js';

vi.mock('./mcp-client.js', async () => {
  const originalModule = await vi.importActual('./mcp-client.js');
  return {
    ...originalModule,
    McpClient: vi.fn(),
  };
});

describe('McpClientManager', () => {
  let mockedMcpClient: MockedObject<McpClient>;
  let mockConfig: MockedObject<Config>;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockedMcpClient = vi.mockObject({
      connect: vi.fn(),
      discover: vi.fn(),
      disconnect: vi.fn(),
      getStatus: vi.fn(),
      getServerConfig: vi.fn(),
    } as unknown as McpClient);
    vi.mocked(McpClient).mockReturnValue(mockedMcpClient);
    mockConfig = vi.mockObject({
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getMcpServers: vi.fn().mockReturnValue({}),
      getPromptRegistry: () => {},
      getResourceRegistry: () => {},
      getDebugMode: () => false,
      getWorkspaceContext: () => {},
      getAllowedMcpServers: vi.fn().mockReturnValue([]),
      getBlockedMcpServers: vi.fn().mockReturnValue([]),
      getMcpServerCommand: vi.fn().mockReturnValue(''),
      getGeminiClient: vi.fn().mockReturnValue({
        isInitialized: vi.fn(),
      }),
    } as unknown as Config);
    toolRegistry = {} as ToolRegistry;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should discover tools from all configured', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    const manager = new McpClientManager(toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
  });

  it('should update global discovery state', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    const manager = new McpClientManager(toolRegistry, mockConfig);
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.NOT_STARTED);
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
  });

  it('should not discover tools if folder is not trusted', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.isTrustedFolder.mockReturnValue(false);
    const manager = new McpClientManager(toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should not start blocked servers', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);
    const manager = new McpClientManager(toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should only start allowed servers if allow list is not empty', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
      'another-server': {},
    });
    mockConfig.getAllowedMcpServers.mockReturnValue(['another-server']);
    const manager = new McpClientManager(toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
  });

  it('should start servers from extensions', async () => {
    const manager = new McpClientManager(toolRegistry, mockConfig);
    await manager.startExtension({
      name: 'test-extension',
      mcpServers: {
        'test-server': {},
      },
      isActive: true,
      version: '1.0.0',
      path: '/some-path',
      contextFiles: [],
      id: '123',
    });
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
  });

  it('should not start servers from disabled extensions', async () => {
    const manager = new McpClientManager(toolRegistry, mockConfig);
    await manager.startExtension({
      name: 'test-extension',
      mcpServers: {
        'test-server': {},
      },
      isActive: false,
      version: '1.0.0',
      path: '/some-path',
      contextFiles: [],
      id: '123',
    });
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should add blocked servers to the blockedMcpServers list', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);
    const manager = new McpClientManager(toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(manager.getBlockedMcpServers()).toEqual([
      { name: 'test-server', extensionName: '' },
    ]);
  });

  describe('restart', () => {
    it('should restart all running servers', async () => {
      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });
      mockedMcpClient.getServerConfig.mockReturnValue({});
      const manager = new McpClientManager(toolRegistry, mockConfig);
      await manager.startConfiguredMcpServers();

      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(1);
      await manager.restart();

      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(2);
    });
  });

  describe('restartServer', () => {
    it('should restart the specified server', async () => {
      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });
      mockedMcpClient.getServerConfig.mockReturnValue({});
      const manager = new McpClientManager(toolRegistry, mockConfig);
      await manager.startConfiguredMcpServers();

      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(1);

      await manager.restartServer('test-server');

      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(2);
    });

    it('should throw an error if the server does not exist', async () => {
      const manager = new McpClientManager(toolRegistry, mockConfig);
      await expect(manager.restartServer('non-existent')).rejects.toThrow(
        'No MCP server registered with the name "non-existent"',
      );
    });
  });

  describe('getMcpInstructions', () => {
    it('should not return instructions for servers that do not have instructions', async () => {
      vi.mocked(McpClient).mockImplementation(
        (name, config) =>
          ({
            connect: vi.fn(),
            discover: vi.fn(),
            disconnect: vi.fn(),
            getServerConfig: vi.fn().mockReturnValue(config),
            getInstructions: vi
              .fn()
              .mockReturnValue(
                name === 'server-with-instructions'
                  ? `Instructions for ${name}`
                  : '',
              ),
          }) as unknown as McpClient,
      );

      const manager = new McpClientManager({} as ToolRegistry, mockConfig);

      mockConfig.getMcpServers.mockReturnValue({
        'server-with-instructions': {},
        'server-without-instructions': {},
      });
      await manager.startConfiguredMcpServers();

      const instructions = manager.getMcpInstructions();

      expect(instructions).toContain(
        "# Instructions for MCP Server 'server-with-instructions'",
      );
      expect(instructions).toContain(
        'Instructions for server-with-instructions',
      );

      expect(instructions).not.toContain(
        "# Instructions for MCP Server 'server-without-instructions'",
      );
    });
  });

  describe('Promise rejection handling', () => {
    it('should handle errors thrown during client initialization', async () => {
      vi.mocked(McpClient).mockImplementation(() => {
        throw new Error('Client initialization failed');
      });

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });

      const manager = new McpClientManager({} as ToolRegistry, mockConfig);

      await expect(manager.startConfiguredMcpServers()).resolves.not.toThrow();
    });

    it('should handle errors thrown in the async IIFE before try block', async () => {
      let disconnectCallCount = 0;
      mockedMcpClient.disconnect.mockImplementation(async () => {
        disconnectCallCount++;
        if (disconnectCallCount === 1) {
          throw new Error('Disconnect failed unexpectedly');
        }
      });
      mockedMcpClient.getServerConfig.mockReturnValue({});

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });

      const manager = new McpClientManager({} as ToolRegistry, mockConfig);
      await manager.startConfiguredMcpServers();

      await expect(manager.restartServer('test-server')).resolves.not.toThrow();
    });
  });
});
