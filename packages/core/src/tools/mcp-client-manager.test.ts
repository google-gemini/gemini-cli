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
import { McpClient, MCPDiscoveryState, MCPServerStatus } from './mcp-client.js';
import type { ToolRegistry } from './tool-registry.js';
import type { Config, GeminiCLIExtension } from '../config/config.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { ResourceRegistry } from '../resources/resource-registry.js';

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
      discoverInto: vi.fn(),
      disconnect: vi.fn(),
      getStatus: vi.fn().mockReturnValue(MCPServerStatus.DISCONNECTED),
      getServerConfig: vi.fn(),
      getServerName: vi.fn().mockReturnValue('test-server'),
    } as unknown as McpClient);
    vi.mocked(McpClient).mockReturnValue(mockedMcpClient);
    mockConfig = vi.mockObject({
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getMcpServers: vi.fn().mockReturnValue({}),
      getPromptRegistry: vi.fn().mockReturnValue({ registerPrompt: vi.fn() }),
      getResourceRegistry: vi
        .fn()
        .mockReturnValue({ setResourcesForServer: vi.fn() }),
      getDebugMode: () => false,
      getWorkspaceContext: () => ({ getDirectories: () => [] }),
      getAllowedMcpServers: vi.fn().mockReturnValue([]),
      getBlockedMcpServers: vi.fn().mockReturnValue([]),
      getExcludedMcpServers: vi.fn().mockReturnValue([]),
      getMcpServerCommand: vi.fn().mockReturnValue(''),
      getMcpEnablementCallbacks: vi.fn().mockReturnValue(undefined),
      getGeminiClient: vi.fn().mockReturnValue({
        isInitialized: vi.fn(),
      }),
      refreshMcpContext: vi.fn(),
    } as unknown as Config);
    toolRegistry = vi.mockObject({
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
      sortTools: vi.fn(),
      getMessageBus: vi.fn().mockReturnValue({}),
      removeMcpToolsByServer: vi.fn(),
      getToolsByServer: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupManager = (manager: McpClientManager) => {
    manager.setMainRegistries({
      toolRegistry,
      promptRegistry:
        mockConfig.getPromptRegistry() as unknown as PromptRegistry,
      resourceRegistry:
        mockConfig.getResourceRegistry() as unknown as ResourceRegistry,
    });
    return manager;
  };

  it('should discover tools from all configured', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
    });
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discoverInto).toHaveBeenCalledOnce();
    expect(mockConfig.refreshMcpContext).toHaveBeenCalledOnce();
  });

  it('should batch context refresh when starting multiple servers', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'server-1': { command: 'node' },
      'server-2': { command: 'node' },
      'server-3': { command: 'node' },
    });
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startConfiguredMcpServers();

    // Each client should be connected/discovered
    expect(mockedMcpClient.connect).toHaveBeenCalledTimes(3);
    expect(mockedMcpClient.discoverInto).toHaveBeenCalledTimes(3);

    // But context refresh should happen only once
    expect(mockConfig.refreshMcpContext).toHaveBeenCalledOnce();
  });

  it('should update global discovery state', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
    });
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.NOT_STARTED);
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
  });

  it('should mark discovery completed when all configured servers are user-disabled', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
    });
    mockConfig.getMcpEnablementCallbacks.mockReturnValue({
      isSessionDisabled: vi.fn().mockReturnValue(false),
      isFileEnabled: vi.fn().mockResolvedValue(false),
    });

    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;

    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
    expect(manager.getMcpServerCount()).toBe(0);
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discoverInto).not.toHaveBeenCalled();
  });

  it('should NOT set COMPLETED prematurely when startConfiguredMcpServers finishes before parallel extensions', async () => {
    mockConfig.getMcpServers.mockReturnValue({});
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));

    let resolveExtension: (value: void) => void;
    const extensionPromise = new Promise<void>((resolve) => {
      resolveExtension = resolve;
    });

    mockedMcpClient.connect.mockImplementation(async () => {
      await extensionPromise;
    });

    const extensionStartPromise = manager.startExtension({
      name: 'test-extension',
      mcpServers: {
        'extension-server': { command: 'node' },
      },
      isActive: true,
      version: '1.0.0',
      path: '/some-path',
      contextFiles: [],
      id: '123',
    });

    // Wait for the state to become IN_PROGRESS (since maybeDiscoverMcpServer is async)
    await vi.waitFor(() => {
      if (manager.getDiscoveryState() !== MCPDiscoveryState.IN_PROGRESS) {
        throw new Error('Discovery state is not IN_PROGRESS');
      }
    });

    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);

    await manager.startConfiguredMcpServers();

    // discoveryState should still be IN_PROGRESS because the extension is still starting
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);

    resolveExtension!(undefined);
    await extensionStartPromise;

    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
  });

  it('should mark discovery completed when all configured servers are blocked', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);

    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;

    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
    expect(manager.getMcpServerCount()).toBe(0);
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discoverInto).not.toHaveBeenCalled();
  });

  it('should not discover tools if folder is not trusted', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
    });
    mockConfig.isTrustedFolder.mockReturnValue(false);
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discoverInto).not.toHaveBeenCalled();
  });

  it('should not start blocked servers', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discoverInto).not.toHaveBeenCalled();
  });

  it('should only start allowed servers if allow list is not empty', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
      'another-server': { command: 'node' },
    });
    mockConfig.getAllowedMcpServers.mockReturnValue(['another-server']);
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discoverInto).toHaveBeenCalledOnce();
  });

  it('should start servers from extensions', async () => {
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startExtension({
      name: 'test-extension',
      mcpServers: {
        'test-server': { command: 'node' },
      },
      isActive: true,
      version: '1.0.0',
      path: '/some-path',
      contextFiles: [],
      id: '123',
    });
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discoverInto).toHaveBeenCalledOnce();
  });

  it('should not start servers from disabled extensions', async () => {
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startExtension({
      name: 'test-extension',
      mcpServers: {
        'test-server': { command: 'node' },
      },
      isActive: false,
      version: '1.0.0',
      path: '/some-path',
      contextFiles: [],
      id: '123',
    });
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discoverInto).not.toHaveBeenCalled();
  });

  it('should add blocked servers to the blockedMcpServers list', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { command: 'node' },
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startConfiguredMcpServers();
    expect(manager.getBlockedMcpServers()).toEqual([
      { name: 'test-server', extensionName: '' },
    ]);
  });

  it('should skip discovery for servers without connection details', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': { excludeTools: ['dangerous_tool'] },
    });
    const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discoverInto).not.toHaveBeenCalled();

    // But it should still be tracked in allServerConfigs
    expect(manager.getMcpServers()).toHaveProperty('test-server');
  });

  describe('restart', () => {
    it('should restart all running servers', async () => {
      const serverConfig = { command: 'node' };
      mockConfig.getMcpServers.mockReturnValue({
        'test-server': serverConfig,
      });
      mockedMcpClient.getServerConfig.mockReturnValue(serverConfig);
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
      await manager.startConfiguredMcpServers();

      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.discoverInto).toHaveBeenCalledTimes(1);
      await manager.restart();

      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);
      expect(mockedMcpClient.discoverInto).toHaveBeenCalledTimes(2);
    });
  });

  describe('restartServer', () => {
    it('should restart the specified server', async () => {
      const serverConfig = { command: 'node' };
      mockConfig.getMcpServers.mockReturnValue({
        'test-server': serverConfig,
      });
      mockedMcpClient.getServerConfig.mockReturnValue(serverConfig);
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
      await manager.startConfiguredMcpServers();

      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.discoverInto).toHaveBeenCalledTimes(1);

      await manager.restartServer('test-server');

      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);
      expect(mockedMcpClient.discoverInto).toHaveBeenCalledTimes(2);
    });

    it('should throw an error if the server does not exist', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
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

      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
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
      expect(constructorCalls[1][1]).toMatchObject(updatedConfig);
    });
  });

  describe('getMcpInstructions', () => {
    it('should not return instructions for servers that do not have instructions', async () => {
      vi.mocked(McpClient).mockImplementation(
        (name, config) =>
          ({
            connect: vi.fn(),
            discoverInto: vi.fn(),
            disconnect: vi.fn(),
            getServerConfig: vi.fn().mockReturnValue(config),
            getServerName: vi.fn().mockReturnValue(name),
            getInstructions: vi
              .fn()
              .mockReturnValue(
                name === 'server-with-instructions'
                  ? `Instructions for ${name}`
                  : '',
              ),
          }) as unknown as McpClient,
      );
      const manager = new McpClientManager('0.0.1', mockConfig);

      mockConfig.getMcpServers.mockReturnValue({
        'server-with-instructions': { command: 'node' },
        'server-without-instructions': { command: 'node' },
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
        'test-server': { command: 'node' },
      });

      const manager = new McpClientManager('0.0.1', mockConfig);

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
      mockedMcpClient.getServerConfig.mockReturnValue({ command: 'node' });

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': { command: 'node' },
      });

      const manager = new McpClientManager('0.0.1', mockConfig);

      await manager.startConfiguredMcpServers();

      await expect(manager.restartServer('test-server')).resolves.not.toThrow();
    });
  });

  describe('Extension handling', () => {
    it('should remove mcp servers from allServerConfigs when stopExtension is called', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
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

    it('should merge extension configuration with an existing user-configured server', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
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

      // It should disconnect the user-only version and reconnect with the merged version
      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);

      // Verify user settings (command/args) still win in the merged config
      const lastCall = vi.mocked(McpClient).mock.calls[1];
      expect(lastCall[1].command).toBe('node');
      expect(lastCall[1].args).toEqual(['user-server.js']);
      expect(lastCall[1].extension).toEqual(extension);
    });

    it('should securely merge tool lists and env variables regardless of load order', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));

      const userConfig = {
        excludeTools: ['user-tool'],
        includeTools: ['shared-inc', 'user-only-inc'],
        env: { USER_VAR: 'user-val', OVERRIDE_VAR: 'user-override' },
      };

      const extension: GeminiCLIExtension = {
        name: 'test-extension',
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['ext.js'],
            excludeTools: ['ext-tool'],
            includeTools: ['shared-inc', 'ext-only-inc'],
            env: { EXT_VAR: 'ext-val', OVERRIDE_VAR: 'ext-override' },
          },
        },
        isActive: true,
        version: '1.0.0',
        path: '/some-path',
        contextFiles: [],
        id: '123',
      };

      // Case 1: Extension loads first, then User config (e.g. from startConfiguredMcpServers)
      await manager.startExtension(extension);

      mockedMcpClient.getServerConfig.mockReturnValue({
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...extension.mcpServers!['test-server'],
        extension,
      });

      await manager.maybeDiscoverMcpServer('test-server', userConfig);

      let lastCall = vi.mocked(McpClient).mock.calls[1]; // Second call due to re-discovery
      let mergedConfig = lastCall[1];

      // Exclude list should be unioned (most restrictive)
      expect(mergedConfig.excludeTools).toContain('ext-tool');
      expect(mergedConfig.excludeTools).toContain('user-tool');

      // Include list should be intersected (most restrictive)
      expect(mergedConfig.includeTools).toContain('shared-inc');
      expect(mergedConfig.includeTools).not.toContain('user-only-inc');
      expect(mergedConfig.includeTools).not.toContain('ext-only-inc');

      expect(mergedConfig.env!['EXT_VAR']).toBe('ext-val');
      expect(mergedConfig.env!['USER_VAR']).toBe('user-val');
      expect(mergedConfig.env!['OVERRIDE_VAR']).toBe('user-override');
      expect(mergedConfig.extension).toBe(extension); // Extension ID preserved!

      // Reset for Case 2
      vi.mocked(McpClient).mockClear();
      const manager2 = setupManager(new McpClientManager('0.0.1', mockConfig));

      // Case 2: User config loads first, then Extension loads
      // This call will skip discovery because userConfig has no connection details
      await manager2.maybeDiscoverMcpServer('test-server', userConfig);

      // In Case 2, the existing client is NOT created yet because discovery was skipped.
      // So getServerConfig on mockedMcpClient won't be called yet.
      // However, startExtension will call maybeDiscoverMcpServer which will merge.

      await manager2.startExtension(extension);

      lastCall = vi.mocked(McpClient).mock.calls[0];
      mergedConfig = lastCall[1];

      expect(mergedConfig.excludeTools).toContain('ext-tool');
      expect(mergedConfig.excludeTools).toContain('user-tool');
      expect(mergedConfig.includeTools).toContain('shared-inc');
      expect(mergedConfig.includeTools).not.toContain('user-only-inc');
      expect(mergedConfig.includeTools).not.toContain('ext-only-inc');

      expect(mergedConfig.env!['EXT_VAR']).toBe('ext-val');
      expect(mergedConfig.env!['USER_VAR']).toBe('user-val');
      expect(mergedConfig.env!['OVERRIDE_VAR']).toBe('user-override');
      expect(mergedConfig.extension).toBe(extension); // Extension ID preserved!
    });

    it('should result in empty includeTools if intersection is empty', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
      const userConfig = { includeTools: ['user-tool'] };
      const extConfig = {
        command: 'node',
        args: ['ext.js'],
        includeTools: ['ext-tool'],
      };

      await manager.maybeDiscoverMcpServer('test-server', userConfig);
      await manager.maybeDiscoverMcpServer('test-server', extConfig);

      const lastCall = vi.mocked(McpClient).mock.calls[0];
      expect(lastCall[1].includeTools).toEqual([]); // Empty array = no tools allowed
    });

    it('should respect a single allowlist if only one is provided', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
      const userConfig = { includeTools: ['user-tool'] };
      const extConfig = { command: 'node', args: ['ext.js'] };

      await manager.maybeDiscoverMcpServer('test-server', userConfig);
      await manager.maybeDiscoverMcpServer('test-server', extConfig);

      const lastCall = vi.mocked(McpClient).mock.calls[0];
      expect(lastCall[1].includeTools).toEqual(['user-tool']);
    });

    it('should allow partial overrides of connection properties', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
      const extConfig = { command: 'node', args: ['ext.js'], timeout: 1000 };
      const userOverride = { args: ['overridden.js'] };

      // Load extension first
      await manager.maybeDiscoverMcpServer('test-server', extConfig);
      mockedMcpClient.getServerConfig.mockReturnValue(extConfig);

      // Apply partial user override
      await manager.maybeDiscoverMcpServer('test-server', userOverride);

      const lastCall = vi.mocked(McpClient).mock.calls[1];
      const finalConfig = lastCall[1];

      expect(finalConfig.command).toBe('node'); // Preserved from base
      expect(finalConfig.args).toEqual(['overridden.js']); // Overridden
      expect(finalConfig.timeout).toBe(1000); // Preserved from base
    });

    it('should prevent one extension from hijacking another extension server name', async () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));

      const extension1: GeminiCLIExtension = {
        name: 'extension-1',
        isActive: true,
        id: 'ext-1',
        version: '1.0.0',
        path: '/path1',
        contextFiles: [],
        mcpServers: {
          'shared-name': { command: 'node', args: ['server1.js'] },
        },
      };

      const extension2: GeminiCLIExtension = {
        name: 'extension-2',
        isActive: true,
        id: 'ext-2',
        version: '1.0.0',
        path: '/path2',
        contextFiles: [],
        mcpServers: {
          'shared-name': { command: 'node', args: ['server2.js'] },
        },
      };

      // Start extension 1 (discovery begins but is not yet complete)
      const p1 = manager.startExtension(extension1);

      // Immediately attempt to start extension 2 with the same name
      await manager.startExtension(extension2);

      await p1;

      // Only extension 1 should have been initialized
      expect(vi.mocked(McpClient)).toHaveBeenCalledTimes(1);
      const lastCall = vi.mocked(McpClient).mock.calls[0];
      expect(lastCall[1].extension).toBe(extension1);
    });

    it('should remove servers from blockedMcpServers when stopExtension is called', async () => {
      mockConfig.getBlockedMcpServers.mockReturnValue(['blocked-server']);
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
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
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
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
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
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
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));
      manager.setUserInteractedWithMcp();

      manager.emitDiagnostic('error', 'Same error');
      manager.emitDiagnostic('error', 'Same error');

      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(1);
    });

    it('should only show hint once per session', () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));

      manager.emitDiagnostic('error', 'Error 1');
      manager.emitDiagnostic('error', 'Error 2');

      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(1);
      expect(coreEventsMock.emitFeedback).toHaveBeenCalledWith(
        'info',
        'MCP issues detected. Run /mcp list for status.',
      );
    });

    it('should capture last error for a server even when silenced', () => {
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));

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
      const manager = setupManager(new McpClientManager('0.0.1', mockConfig));

      manager.emitDiagnostic('error', 'Same error');
      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(1); // The hint

      manager.setUserInteractedWithMcp();
      manager.emitDiagnostic('error', 'Same error');
      expect(coreEventsMock.emitFeedback).toHaveBeenCalledTimes(2); // Now the actual error
    });
  });
});
