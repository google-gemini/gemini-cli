/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as SdkClientStdioLib from '@modelcontextprotocol/sdk/client/stdio.js';
import { createTransport, type McpContext } from './mcp-client.js';
import type { GeminiCLIExtension, MCPServerConfig } from '../config/config.js';

vi.mock('@modelcontextprotocol/sdk/client/stdio.js');

describe('MCP Plugin Variable Expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMcpContext: Partial<McpContext> = {
    sanitizationConfig: {
      allowedEnvironmentVariables: [],
      blockedEnvironmentVariables: [],
      enableEnvironmentVariableRedaction: false,
    },
    isTrustedFolder: () => true,
    emitMcpDiagnostic: () => {},
  };

  it('should expand ${PLUGIN_ROOT} in command, args, and cwd', async () => {
    const mockExtension: GeminiCLIExtension = {
      name: 'test-plugin',
      path: '/path/to/plugin',
      isActive: true,
      id: 'test-id',
      version: '1.0.0',
    } as GeminiCLIExtension;

    const config: MCPServerConfig = {
      command: 'node',
      args: ['${PLUGIN_ROOT}/index.js'],
      cwd: '${PLUGIN_ROOT}/src',
      extension: mockExtension,
    };

    await createTransport(
      'test-server',
      config,
      false,
      mockMcpContext as McpContext,
    );

    expect(SdkClientStdioLib.StdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'node',
        args: ['/path/to/plugin/index.js'],
        cwd: '/path/to/plugin/src',
        env: expect.objectContaining({
          PLUGIN_ROOT: '/path/to/plugin',
        }),
      }),
    );
  });

  it('should expand ${PLUGIN_ROOT} in env values', async () => {
    const mockExtension: GeminiCLIExtension = {
      name: 'test-plugin',
      path: '/path/to/plugin',
      isActive: true,
      id: 'test-id',
      version: '1.0.0',
    } as GeminiCLIExtension;

    const config: MCPServerConfig = {
      command: 'node',
      args: [],
      env: {
        PLUGIN_PATH: '${PLUGIN_ROOT}/lib',
      },
      extension: mockExtension,
    };

    await createTransport(
      'test-server',
      config,
      false,
      mockMcpContext as McpContext,
    );

    expect(SdkClientStdioLib.StdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          PLUGIN_ROOT: '/path/to/plugin',
          PLUGIN_PATH: '/path/to/plugin/lib',
        }),
      }),
    );
  });
});
