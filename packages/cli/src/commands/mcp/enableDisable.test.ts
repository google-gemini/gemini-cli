/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import yargs, { type Argv } from 'yargs';
import { enableCommand, disableCommand } from './enableDisable.js';
import { debugLogger } from '@google/gemini-cli-core';

// --- Mocks ---

vi.mock('./list.js', () => ({
  getMcpServersFromConfig: vi.fn(),
}));

vi.mock('../../config/settings.js', () => ({
  loadSettings: vi.fn(),
}));

vi.mock('../../config/mcp/mcpServerEnablement.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../config/mcp/mcpServerEnablement.js')
    >();
  return {
    ...actual,
    // Replace the singleton class with a mock that only exposes getInstance
    McpServerEnablementManager: {
      getInstance: vi.fn(),
    },
    canLoadServer: vi.fn(),
  };
});

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

// --- Import mocked modules ---

import { getMcpServersFromConfig } from './list.js';
import { loadSettings } from '../../config/settings.js';
import {
  McpServerEnablementManager,
  canLoadServer,
} from '../../config/mcp/mcpServerEnablement.js';

const mockedGetMcpServersFromConfig = getMcpServersFromConfig as Mock;
const mockedLoadSettings = loadSettings as Mock;
const mockedGetInstance = McpServerEnablementManager.getInstance as Mock;
const mockedCanLoadServer = canLoadServer as Mock;

describe('mcp enable/disable commands', () => {
  let parser: Argv;
  let mockManager: {
    enable: Mock;
    disable: Mock;
    disableForSession: Mock;
    clearSessionDisable: Mock;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(debugLogger, 'log').mockImplementation(() => {});

    parser = yargs([]).command(enableCommand).command(disableCommand);

    mockManager = {
      enable: vi.fn(),
      disable: vi.fn(),
      disableForSession: vi.fn(),
      clearSessionDisable: vi.fn(),
    };

    mockedGetInstance.mockReturnValue(mockManager);

    // Default: a single server exists, not blocked, loading allowed
    mockedGetMcpServersFromConfig.mockResolvedValue({
      mcpServers: { 'my-server': { command: '/path/to/server' } },
      blockedServerNames: [],
    });

    mockedLoadSettings.mockReturnValue({
      merged: {
        admin: { mcp: { enabled: true } },
        mcp: {},
      },
    });

    mockedCanLoadServer.mockResolvedValue({ allowed: true });
  });

  // -------------------------------------------------------------------
  // Regression: before the fix, getMcpServersFromConfig returned
  // { mcpServers, blockedServerNames } but the handlers passed the
  // wrapper directly to Object.keys(), so every server name was
  // reported as "not found".
  // -------------------------------------------------------------------

  describe('enable command', () => {
    it('should enable a server that exists in mcpServers', async () => {
      await parser.parseAsync('enable my-server');

      expect(mockManager.enable).toHaveBeenCalledWith('my-server');
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("MCP server 'my-server' enabled"),
      );
    });

    it('should clear session disable when --session flag is used', async () => {
      await parser.parseAsync('enable my-server --session');

      expect(mockManager.clearSessionDisable).toHaveBeenCalledWith('my-server');
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("Session disable cleared for 'my-server'"),
      );
    });

    it('should show error when server is not found', async () => {
      await parser.parseAsync('enable unknown-server');

      expect(mockManager.enable).not.toHaveBeenCalled();
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("Server 'unknown-server' not found"),
      );
    });

    it('should show error when server is blocked by administrator', async () => {
      mockedGetMcpServersFromConfig.mockResolvedValue({
        mcpServers: { 'allowed-server': { command: '/path/to/server' } },
        blockedServerNames: ['blocked-server'],
      });

      await parser.parseAsync('enable blocked-server');

      expect(mockManager.enable).not.toHaveBeenCalled();
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "MCP server 'blocked-server' is blocked by administrator",
        ),
      );
    });

    it('should show error when server is on settings allowlist block', async () => {
      mockedCanLoadServer.mockResolvedValue({
        allowed: false,
        reason: "Server 'my-server' is not in mcp.allowed list.",
        blockType: 'allowlist',
      });

      await parser.parseAsync('enable my-server');

      expect(mockManager.enable).not.toHaveBeenCalled();
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Server 'my-server' is not in mcp.allowed list.",
        ),
      );
    });

    it('should show error when server is on settings excludelist', async () => {
      mockedCanLoadServer.mockResolvedValue({
        allowed: false,
        reason: "Server 'my-server' is blocked by mcp.excluded.",
        blockType: 'excludelist',
      });

      await parser.parseAsync('enable my-server');

      expect(mockManager.enable).not.toHaveBeenCalled();
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Server 'my-server' is blocked by mcp.excluded.",
        ),
      );
    });

    it('should still enable but warn when admin has globally disabled MCP', async () => {
      mockedCanLoadServer.mockResolvedValue({
        allowed: false,
        blockType: 'admin',
      });

      await parser.parseAsync('enable my-server');

      // Enable goes through even when admin block is in effect
      expect(mockManager.enable).toHaveBeenCalledWith('my-server');
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('MCP servers are disabled by administrator'),
      );
    });

    it('should handle case-insensitive server name matching', async () => {
      mockedGetMcpServersFromConfig.mockResolvedValue({
        mcpServers: { 'My-Server': { command: '/path/to/server' } },
        blockedServerNames: [],
      });

      await parser.parseAsync('enable my-server');

      expect(mockManager.enable).toHaveBeenCalledWith('my-server');
    });
  });

  describe('disable command', () => {
    it('should disable a server that exists in mcpServers', async () => {
      await parser.parseAsync('disable my-server');

      expect(mockManager.disable).toHaveBeenCalledWith('my-server');
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("MCP server 'my-server' disabled"),
      );
    });

    it('should disable for session when --session flag is used', async () => {
      await parser.parseAsync('disable my-server --session');

      expect(mockManager.disableForSession).toHaveBeenCalledWith('my-server');
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "MCP server 'my-server' disabled for this session",
        ),
      );
    });

    it('should show error when server is not found', async () => {
      await parser.parseAsync('disable unknown-server');

      expect(mockManager.disable).not.toHaveBeenCalled();
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("Server 'unknown-server' not found"),
      );
    });

    it('should show error when server is blocked by administrator', async () => {
      mockedGetMcpServersFromConfig.mockResolvedValue({
        mcpServers: { 'allowed-server': { command: '/path/to/server' } },
        blockedServerNames: ['blocked-server'],
      });

      await parser.parseAsync('disable blocked-server');

      expect(mockManager.disable).not.toHaveBeenCalled();
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "MCP server 'blocked-server' is blocked by administrator",
        ),
      );
    });

    it('should handle case-insensitive server name matching', async () => {
      mockedGetMcpServersFromConfig.mockResolvedValue({
        mcpServers: { 'My-Server': { command: '/path/to/server' } },
        blockedServerNames: [],
      });

      await parser.parseAsync('disable my-server');

      expect(mockManager.disable).toHaveBeenCalledWith('my-server');
    });
  });
});
