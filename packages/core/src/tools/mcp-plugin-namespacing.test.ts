/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClientManager } from './mcp-client-manager.js';
import type {
  Config,
  GeminiCLIExtension,
  MCPServerConfig,
} from '../config/config.js';

interface McpClientManagerInternals {
  maybeDiscoverMcpServer(name: string, config: MCPServerConfig): Promise<void>;
}

describe('MCP Plugin Namespacing', () => {
  let mcpClientManager: McpClientManager;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      isTrustedFolder: () => true,
      getMcpServers: () => ({}),
      getMcpServerCommand: () => undefined,
      getMcpEnablementCallbacks: () => undefined,
      getAllowedMcpServers: () => [],
      getBlockedMcpServers: () => [],
      getDebugMode: () => false,
      getWorkspaceContext: () => ({}),
    } as unknown as Config;
    mcpClientManager = new McpClientManager('1.0.0', mockConfig);
  });

  it('should use pluginName:mcpServerName for single MCP server in Open Plugin', async () => {
    const extension: GeminiCLIExtension = {
      name: 'my-plugin',
      manifestType: 'open-plugin',
      mcpServers: {
        'original-name': {
          command: 'node',
          args: ['index.js'],
        },
      },
      id: 'test-id',
      isActive: true,
    } as unknown as GeminiCLIExtension;

    const maybeDiscoverSpy = vi
      .spyOn(
        mcpClientManager as unknown as McpClientManagerInternals,
        'maybeDiscoverMcpServer',
      )
      .mockResolvedValue(undefined);

    await mcpClientManager.startExtension(extension);

    expect(maybeDiscoverSpy).toHaveBeenCalledWith(
      'my-plugin:original-name',
      expect.objectContaining({
        command: 'node',
        extension,
      }),
    );
  });

  it('should use pluginName:mcpServerName for multiple MCP servers in Open Plugin', async () => {
    const extension: GeminiCLIExtension = {
      name: 'multi-plugin',
      manifestType: 'open-plugin',
      mcpServers: {
        s1: { command: 'node', args: ['s1.js'] },
        s2: { command: 'node', args: ['s2.js'] },
      },
      id: 'test-id',
      isActive: true,
    } as unknown as GeminiCLIExtension;

    const maybeDiscoverSpy = vi
      .spyOn(
        mcpClientManager as unknown as McpClientManagerInternals,
        'maybeDiscoverMcpServer',
      )
      .mockResolvedValue(undefined);

    await mcpClientManager.startExtension(extension);

    expect(maybeDiscoverSpy).toHaveBeenCalledWith(
      'multi-plugin:s1',
      expect.objectContaining({
        command: 'node',
        extension,
      }),
    );
    expect(maybeDiscoverSpy).toHaveBeenCalledWith(
      'multi-plugin:s2',
      expect.objectContaining({
        command: 'node',
        extension,
      }),
    );
  });

  it('should NOT use plugin name for Gemini extensions', async () => {
    const extension: GeminiCLIExtension = {
      name: 'gemini-extension',
      manifestType: 'gemini',
      mcpServers: {
        'original-name': {
          command: 'node',
          args: ['index.js'],
        },
      },
      id: 'test-id',
      isActive: true,
    } as unknown as GeminiCLIExtension;

    const maybeDiscoverSpy = vi
      .spyOn(
        mcpClientManager as unknown as McpClientManagerInternals,
        'maybeDiscoverMcpServer',
      )
      .mockResolvedValue(undefined);

    await mcpClientManager.startExtension(extension);

    expect(maybeDiscoverSpy).toHaveBeenCalledWith(
      'original-name',
      expect.objectContaining({
        command: 'node',
        extension,
      }),
    );
  });
});
