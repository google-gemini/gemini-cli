/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExtensionManager } from './extension-manager.js';
import { createTestMergedSettings } from './settings.js';
import { EXTENSIONS_DIRECTORY_NAME } from './extensions/variables.js';

const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/mock-home'));
const mockIntegrityManager = vi.hoisted(() => ({
  verify: vi.fn().mockResolvedValue('verified'),
  store: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: mockHomedir,
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: mockHomedir,
    ExtensionIntegrityManager: vi
      .fn()
      .mockImplementation(() => mockIntegrityManager),
  };
});

describe('Open Plugin MCP Support', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;
  let extensionManager: ExtensionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-mcp-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
    );
    mockHomedir.mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings(),
      workspaceDir: tempWorkspaceDir,
      requestConsent: vi.fn().mockResolvedValue(true),
      requestSetting: null,
      integrityManager: mockIntegrityManager,
    });
  });

  it('should discover MCP servers from .mcp.json', async () => {
    const pluginDir = path.join(userExtensionsDir, 'mcp-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });

    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'mcp-plugin',
        version: '1.0.0',
      }),
    );

    fs.writeFileSync(
      path.join(pluginDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'mcp-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.mcpServers).toBeDefined();
    expect(plugin?.mcpServers?.['test-server']).toBeDefined();
    expect(plugin?.mcpServers?.['test-server'].command).toBe('node');
  });

  it('should support explicit mcpServers path in plugin.json', async () => {
    const pluginDir = path.join(userExtensionsDir, 'explicit-mcp-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });

    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'explicit-mcp-plugin',
        version: '1.0.0',
        mcpServers: 'custom-mcp.json',
      }),
    );

    fs.writeFileSync(
      path.join(pluginDir, 'custom-mcp.json'),
      JSON.stringify({
        mcpServers: {
          'custom-server': {
            command: 'node',
            args: ['custom.js'],
          },
        },
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'explicit-mcp-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.mcpServers).toBeDefined();
    expect(plugin?.mcpServers?.['custom-server']).toBeDefined();
  });
});
