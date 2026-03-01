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
import type { Config, GeminiCLIExtension } from '../config/config.js';

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
      getMcpEnablementCallbacks: vi.fn().mockReturnValue(undefined),
      getGeminiClient: vi.fn().mockReturnValue({
        isInitialized: vi.fn(),
      }),
      refreshMcpContext: vi.fn(),
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
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
    expect(mockConfig.refreshMcpContext).toHaveBeenCalledOnce();
  });

  it('should batch context refresh when starting multiple servers', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'server-1': {},
      'server-2': {},
      'server-3': {},
    });
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();

    // Each client should be connected/discovered
    expect(mockedMcpClient.connect).toHaveBeenCalledTimes(3);
    expect(mockedMcpClient.discover).toHaveBeenCalledTimes(3);

    // But context refresh should happen only once
    expect(mockConfig.refreshMcpContext).toHaveBeenCalledOnce();
  });

  it('should update global discovery state', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.NOT_STARTED);
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
  });

  it('should mark discovery completed when all configured servers are user-disabled', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.getMcpEnablementCallbacks.mockReturnValue({
      isSessionDisabled: vi.fn().mockReturnValue(false),
      isFileEnabled: vi.fn().mockResolvedValue(false),
    });

    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;

    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
    expect(manager.getMcpServerCount()).toBe(0);
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should mark discovery completed when all configured servers are blocked', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);

    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;

    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
    expect(manager.getMcpServerCount()).toBe(0);
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should not discover tools if folder is not trusted', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.isTrustedFolder.mockReturnValue(false);
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should not start blocked servers', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
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
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
  });

  it('should start servers from extensions', async () => {
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
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
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
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
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
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
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
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
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      await manager.startConfiguredMcpServers();

      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(1);

      await manager.restartServer('test-server');

      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(2);
    });

    it('should throw an error if the server does not exist', async () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      await expect(manager.restartServer('non-existent')).rejects.toThrow(
        'No MCP server registered with the name "non-existent"',
      );
    });

    it('should create a new McpClient with updated config on restart', async () => {
      const originalConfig = { command: 'node', args: ['--port', '8000'] };
      const updatedConfig = { command: 'node', args: ['--port', '9000'] };

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': originalConfig,
      });

      // Track McpClient constructor calls
      const constructorCalls: unknown[][] = [];
      vi.mocked(McpClient).mockImplementation((...args: unknown[]) => {
        constructorCalls.push(args);
        return mockedMcpClient;
      });
      mockedMcpClient.getServerConfig.mockReturnValue(originalConfig);

      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      await manager.startConfiguredMcpServers();

      // First call should use the original config
      expect(constructorCalls).toHaveLength(1);
      expect(constructorCalls[0][1]).toBe(originalConfig);

      // Simulate config file change and hot-reload
      mockConfig.getMcpServers.mockReturnValue({
        'test-server': updatedConfig,
      });
      await manager.startConfiguredMcpServers();

      // A NEW McpClient should have been constructed with the updated config
      expect(constructorCalls).toHaveLength(2);
      expect(constructorCalls[1][1]).toBe(updatedConfig);
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

      const manager = new McpClientManager(
        '0.0.1',
        {} as ToolRegistry,
        mockConfig,
      );

      mockConfig.getMcpServers.mockReturnValue({
        'server-with-instructions': {},
        'server-without-instructions': {},
      });
      await manager.startConfiguredMcpServers();

      const instructions = manager.getMcpInstructions();

      expect(instructions).toContain(
        "The following are instructions provided by the tool server 'server-with-instructions':",
      );
      expect(instructions).toContain('---[start of server instructions]---');
      expect(instructions).toContain(
        'Instructions for server-with-instructions',
      );
      expect(instructions).toContain('---[end of server instructions]---');

      expect(instructions).not.toContain(
        "The following are instructions provided by the tool server 'server-without-instructions':",
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

      const manager = new McpClientManager(
        '0.0.1',
        {} as ToolRegistry,
        mockConfig,
      );

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

      const manager = new McpClientManager(
        '0.0.1',
        {} as ToolRegistry,
        mockConfig,
      );
      await manager.startConfiguredMcpServers();

      await expect(manager.restartServer('test-server')).resolves.not.toThrow();
    });
  });

  describe('Extension handling', () => {
    it('should remove mcp servers from allServerConfigs when stopExtension is called', async () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      const mcpServers = {
        'test-server': { command: 'node', args: ['server.js'] },
      };
      const extension: GeminiCLIExtension = {
        name: 'test-extension',
        mcpServers,
        isActive: true,
        version: '1.0.0',
        path: '/some-path',
        contextFiles: [],
        id: '123',
      };

      await manager.startExtension(extension);
      expect(manager.getMcpServers()).toHaveProperty('test-server');

      await manager.stopExtension(extension);
      expect(manager.getMcpServers()).not.toHaveProperty('test-server');
    });

    it('should ignore an extension attempting to register a server with an existing name', async () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      const userConfig = { command: 'node', args: ['user-server.js'] };

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': userConfig,
      });
      mockedMcpClient.getServerConfig.mockReturnValue(userConfig);

      await manager.startConfiguredMcpServers();
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);

      const extension: GeminiCLIExtension = {
        name: 'test-extension',
        mcpServers: {
          'test-server': { command: 'node', args: ['ext-server.js'] },
        },
        isActive: true,
        version: '1.0.0',
        path: '/some-path',
        contextFiles: [],
        id: '123',
      };

      await manager.startExtension(extension);

      expect(mockedMcpClient.disconnect).not.toHaveBeenCalled();
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should remove servers from blockedMcpServers when stopExtension is called', async () => {
      mockConfig.getBlockedMcpServers.mockReturnValue(['blocked-server']);
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      const mcpServers = {
        'blocked-server': { command: 'node', args: ['server.js'] },
      };
      const extension: GeminiCLIExtension = {
        name: 'test-extension',
        mcpServers,
        isActive: true,
        version: '1.0.0',
        path: '/some-path',
        contextFiles: [],
        id: '123',
      };

      await manager.startExtension(extension);
      expect(manager.getBlockedMcpServers()).toContainEqual({
        name: 'blocked-server',
        extensionName: 'test-extension',
      });

      await manager.stopExtension(extension);
      expect(manager.getBlockedMcpServers()).not.toContainEqual({
        name: 'blocked-server',
        extensionName: 'test-extension',
      });
    });
  });

  describe('diagnostic reporting', () => {
    let coreEventsMock: typeof import('../utils/events.js').coreEvents;

    beforeEach(async () => {
      const eventsModule = await import('../utils/events.js');
      coreEventsMock = eventsModule.coreEvents;
      vi.spyOn(coreEventsMock, 'emitFeedback').mockImplementation(() => {});
    });

    it('should emit hint instead of full error when user has not interacted with MCP', () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      manager.emitDiagnostic(
        'error',
        'Something went wrong',
        new Error('boom'),
      );

      expect(coreEventsMock.emitFeedback).toHaveBeenCalledWith(
        'info',
        'MCP issues detected. Run /mcp list for status.',
      );
      expect(coreEventsMock.emitFeedback).not.toHaveBeenCalledWith(
        'error',
        'Something went wrong',
        expect.anything(),
      );
    });

    it('should emit full error when user has interacted with MCP', () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      manager.setUserInteractedWithMcp();
      manager.emitDiagnostic(
        'error',
        'Something went wrong',
        new Error('boom'),
      );

      expect(coreEventsMock.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Something went wrong',
        expect.any(Error),
      );
    });

    it('should still deduplicate diagnostic messages after user interaction', () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      manager.setUserInteractedWithMcp();

      manager.emitDiagnostic('error', 'Same error');
      manager.emitDiagnostic('error', 'Same error');

      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(1);
    });

    it('should only show hint once per session', () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);

      manager.emitDiagnostic('error', 'Error 1');
      manager.emitDiagnostic('error', 'Error 2');

      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(1);
      expect(coreEventsMock.emitFeedback).toHaveBeenCalledWith(
        'info',
        'MCP issues detected. Run /mcp list for status.',
      );
    });

    it('should capture last error for a server even when silenced', () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);

      manager.emitDiagnostic(
        'error',
        'Error in server (test-server)',
        undefined,
        'test-server',
      );

      expect(manager.getLastError('test-server')).toBe(
        'Error in server (test-server)',
      );
    });

    it('should show previously deduplicated errors after interaction clears state', () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);

      manager.emitDiagnostic('error', 'Same error');
      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(1); // The hint

      manager.setUserInteractedWithMcp();
      manager.emitDiagnostic('error', 'Same error');
      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(2); // Now the actual error
    });
  });
});
