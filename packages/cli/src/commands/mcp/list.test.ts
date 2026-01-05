/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { listMcpServers } from './list.js';
import { loadSettings } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { ExtensionStorage } from '../../config/extensions/storage.js';
import { ExtensionManager } from '../../config/extension-manager.js';

vi.mock('../../config/settings.js', () => ({
  loadSettings: vi.fn(),
}));
vi.mock('../../config/extensions/storage.js', () => ({
  ExtensionStorage: {
    getUserExtensionsDir: vi.fn(),
  },
}));
vi.mock('../../config/extension-manager.js');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    Storage: vi.fn().mockImplementation((_cwd: string) => ({
      getGlobalSettingsPath: () => '/tmp/gemini/settings.json',
      getWorkspaceSettingsPath: () => '/tmp/gemini/workspace-settings.json',
      getProjectTempDir: () => '/test/home/.gemini/tmp/mocked_hash',
    })),
    GEMINI_DIR: '.gemini',
    getErrorMessage: (e: unknown) =>
      e instanceof Error ? e.message : String(e),
  };
});

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

const mockedGetUserExtensionsDir =
  ExtensionStorage.getUserExtensionsDir as Mock;
const mockedLoadSettings = loadSettings as Mock;
const MockedExtensionManager = ExtensionManager as Mock;

interface MockExtensionManager {
  loadExtensions: Mock;
}

describe('mcp list command', () => {
  let mockExtensionManager: MockExtensionManager;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(debugLogger, 'log').mockImplementation(() => {});

    mockExtensionManager = {
      loadExtensions: vi.fn(),
    };

    MockedExtensionManager.mockImplementation(() => mockExtensionManager);
    mockExtensionManager.loadExtensions.mockReturnValue([]);
    mockedGetUserExtensionsDir.mockReturnValue('/mocked/extensions/dir');
  });

  it('should display message when no servers configured', async () => {
    mockedLoadSettings.mockReturnValue({ merged: { mcpServers: {} } });

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith('No MCP servers configured.');
  });

  it('should display different server types', async () => {
    mockedLoadSettings.mockReturnValue({
      merged: {
        mcpServers: {
          'stdio-server': { command: '/path/to/server', args: ['arg1'] },
          'sse-server': { url: 'https://example.com/sse' },
          'http-server': { httpUrl: 'https://example.com/http' },
        },
      },
    });

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith('Configured MCP servers:\n');
    expect(debugLogger.log).toHaveBeenCalledWith(
      'stdio-server: /path/to/server arg1 (stdio)',
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      'sse-server: https://example.com/sse (sse)',
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      'http-server: https://example.com/http (http)',
    );
  });

  it('should merge extension servers with config servers', async () => {
    mockedLoadSettings.mockReturnValue({
      merged: {
        mcpServers: { 'config-server': { command: '/config/server' } },
      },
    });

    mockExtensionManager.loadExtensions.mockReturnValue([
      {
        name: 'test-extension',
        mcpServers: { 'extension-server': { command: '/ext/server' } },
      },
    ]);

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      'config-server: /config/server  (stdio)',
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      'extension-server (from test-extension): /ext/server  (stdio)',
    );
  });
});
