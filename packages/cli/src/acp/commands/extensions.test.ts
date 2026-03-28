/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config, GeminiCLIExtension } from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';
import {
  DisableExtensionCommand,
  EnableExtensionCommand,
  ExploreExtensionsCommand,
  ExtensionsCommand,
  InstallExtensionCommand,
  LinkExtensionCommand,
  ListExtensionsCommand,
  RestartExtensionCommand,
  UninstallExtensionCommand,
  UpdateExtensionCommand,
} from './extensions.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { SettingScope } from '../../config/settings.js';

const mockListExtensions = vi.hoisted(() => vi.fn());
const mockGetErrorMessage = vi.hoisted(() => vi.fn());
const mockInferInstallMetadata = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());
const mockAutoEnableServers = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    listExtensions: mockListExtensions,
    getErrorMessage: mockGetErrorMessage,
  };
});

vi.mock('../../config/extension-manager.js', () => {
  class MockExtensionManager {
    extensions: Array<
      Pick<GeminiCLIExtension, 'name' | 'isActive' | 'mcpServers'>
    > = [];
    enableExtension = vi.fn(async () => undefined);
    disableExtension = vi.fn(async () => undefined);
    installOrUpdateExtension = vi.fn(async () => ({ name: 'test-extension' }));
    uninstallExtension = vi.fn(async () => undefined);
    restartExtension = vi.fn(async () => undefined);
    getExtensions = vi.fn(() => this.extensions);
  }

  return {
    ExtensionManager: MockExtensionManager,
    inferInstallMetadata: mockInferInstallMetadata,
  };
});

vi.mock('../../config/mcp/mcpServerEnablement.js', () => ({
  McpServerEnablementManager: {
    getInstance: vi.fn(() => ({
      autoEnableServers: mockAutoEnableServers,
    })),
  },
}));

vi.mock('node:fs/promises', () => ({
  stat: mockStat,
}));

type TestExtensionManager = InstanceType<typeof ExtensionManager> & {
  extensions: Array<
    Pick<GeminiCLIExtension, 'name' | 'isActive' | 'mcpServers'>
  >;
  enableExtension: ReturnType<typeof vi.fn>;
  disableExtension: ReturnType<typeof vi.fn>;
  installOrUpdateExtension: ReturnType<typeof vi.fn>;
  uninstallExtension: ReturnType<typeof vi.fn>;
  restartExtension: ReturnType<typeof vi.fn>;
  getExtensions: ReturnType<typeof vi.fn>;
};

function createExtensionManager(
  extensions: Array<
    Pick<GeminiCLIExtension, 'name' | 'isActive' | 'mcpServers'>
  > = [],
): TestExtensionManager {
  const manager = new ExtensionManager({} as never) as TestExtensionManager;
  manager.extensions = extensions;
  return manager;
}

function createContext(
  extensionLoader: unknown,
  mcpClientManager?: { restartServer: ReturnType<typeof vi.fn> },
): CommandContext {
  return {
    config: {
      getExtensionLoader: vi.fn().mockReturnValue(extensionLoader),
      getMcpClientManager: vi.fn().mockReturnValue(mcpClientManager),
    } as unknown as Config,
    settings: {} as CommandContext['settings'],
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ACP extensions commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetErrorMessage.mockImplementation((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
    mockAutoEnableServers.mockResolvedValue([]);
  });

  describe('ExtensionsCommand', () => {
    it('delegates to list command', async () => {
      const command = new ExtensionsCommand();
      const context = createContext({});
      const extensions = [{ name: 'ext-a' }];
      mockListExtensions.mockReturnValue(extensions);

      const result = await command.execute(context, []);

      expect(result).toEqual({ name: 'extensions list', data: extensions });
      expect(mockListExtensions).toHaveBeenCalledWith(context.config);
    });
  });

  describe('ListExtensionsCommand', () => {
    it('returns no extensions message', async () => {
      const command = new ListExtensionsCommand();
      const context = createContext({});
      mockListExtensions.mockReturnValue([]);

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions list',
        data: 'No extensions installed.',
      });
    });
  });

  describe('ExploreExtensionsCommand', () => {
    it('returns the extensions gallery URL', async () => {
      const command = new ExploreExtensionsCommand();
      const context = createContext({});

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions explore',
        data: 'View or install available extensions at https://geminicli.com/extensions/',
      });
    });
  });

  describe('EnableExtensionCommand', () => {
    it('returns an environment error when extension loader is unsupported', async () => {
      const command = new EnableExtensionCommand();
      const context = createContext({});

      const result = await command.execute(context, ['ext-a']);

      expect(result).toEqual({
        name: 'extensions enable',
        data: 'Cannot enable extensions in this environment.',
      });
    });

    it('returns usage when no arguments are provided', async () => {
      const command = new EnableExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions enable',
        data: 'Usage: /extensions enable <extension> [--scope=<user|workspace|session>]',
      });
    });

    it('enables an extension with workspace scope', async () => {
      const command = new EnableExtensionCommand();
      const extensionManager = createExtensionManager([
        { name: 'ext-a', isActive: false },
      ]);
      const context = createContext(extensionManager);

      const result = await command.execute(context, [
        '--scope=workspace',
        'ext-a',
      ]);

      expect(extensionManager.enableExtension).toHaveBeenCalledWith(
        'ext-a',
        SettingScope.Workspace,
      );
      expect(result).toEqual({
        name: 'extensions enable',
        data: `Extension "ext-a" enabled for scope "${SettingScope.Workspace}".`,
      });
    });

    it('enables only inactive extensions for --all', async () => {
      const command = new EnableExtensionCommand();
      const extensionManager = createExtensionManager([
        { name: 'inactive-ext', isActive: false },
        { name: 'active-ext', isActive: true },
      ]);
      const context = createContext(extensionManager);

      await command.execute(context, ['--all']);

      expect(extensionManager.enableExtension).toHaveBeenCalledTimes(1);
      expect(extensionManager.enableExtension).toHaveBeenCalledWith(
        'inactive-ext',
        SettingScope.User,
      );
    });

    it('auto-enables and restarts extension MCP servers', async () => {
      const command = new EnableExtensionCommand();
      const extensionManager = createExtensionManager([
        {
          name: 'ext-a',
          isActive: false,
          mcpServers: { serverA: {}, serverB: {} },
        },
      ]);
      const restartServer = vi.fn().mockImplementation((serverName: string) => {
        if (serverName === 'serverB') {
          return Promise.reject(new Error('restart failed'));
        }
        return Promise.resolve();
      });
      const context = createContext(extensionManager, { restartServer });
      mockAutoEnableServers.mockResolvedValue(['serverA', 'serverB']);

      const result = await command.execute(context, ['ext-a']);

      expect(mockAutoEnableServers).toHaveBeenCalledWith([
        'serverA',
        'serverB',
      ]);
      expect(restartServer).toHaveBeenCalledTimes(2);
      expect(result.name).toBe('extensions enable');
      expect(result.data).toContain(
        'Extension "ext-a" enabled for scope "User".',
      );
      expect(result.data).toContain(
        "Failed to restart MCP server 'serverB': restart failed",
      );
      expect(result.data).toContain('Re-enabled MCP servers: serverA, serverB');
    });

    it('returns error when enabling fails', async () => {
      const command = new EnableExtensionCommand();
      const extensionManager = createExtensionManager([
        { name: 'ext-a', isActive: false },
      ]);
      extensionManager.enableExtension.mockRejectedValue(new Error('boom'));
      const context = createContext(extensionManager);

      const result = await command.execute(context, ['ext-a']);

      expect(result).toEqual({
        name: 'extensions enable',
        data: 'Failed to enable "ext-a": boom',
      });
    });
  });

  describe('DisableExtensionCommand', () => {
    it('returns an environment error when extension loader is unsupported', async () => {
      const command = new DisableExtensionCommand();
      const context = createContext({});

      const result = await command.execute(context, ['ext-a']);

      expect(result).toEqual({
        name: 'extensions disable',
        data: 'Cannot disable extensions in this environment.',
      });
    });

    it('disables only active extensions for --all', async () => {
      const command = new DisableExtensionCommand();
      const extensionManager = createExtensionManager([
        { name: 'active-ext', isActive: true },
        { name: 'inactive-ext', isActive: false },
      ]);
      const context = createContext(extensionManager);

      const result = await command.execute(context, [
        '--all',
        '--scope=session',
      ]);

      expect(extensionManager.disableExtension).toHaveBeenCalledTimes(1);
      expect(extensionManager.disableExtension).toHaveBeenCalledWith(
        'active-ext',
        SettingScope.Session,
      );
      expect(result).toEqual({
        name: 'extensions disable',
        data: `Extension "active-ext" disabled for scope "${SettingScope.Session}".`,
      });
    });

    it('returns error when disabling fails', async () => {
      const command = new DisableExtensionCommand();
      const extensionManager = createExtensionManager([
        { name: 'missing-ext', isActive: true },
      ]);
      extensionManager.disableExtension.mockRejectedValue(
        new Error('Extension not found.'),
      );
      const context = createContext(extensionManager);

      const result = await command.execute(context, ['missing-ext']);

      expect(result).toEqual({
        name: 'extensions disable',
        data: 'Failed to disable "missing-ext": Extension not found.',
      });
    });
  });

  describe('InstallExtensionCommand', () => {
    it('returns usage when source is missing', async () => {
      const command = new InstallExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions install',
        data: 'Usage: /extensions install <source>',
      });
    });

    it('rejects disallowed characters in source', async () => {
      const command = new InstallExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, ['repo;rm -rf']);

      expect(result).toEqual({
        name: 'extensions install',
        data: 'Invalid source: contains disallowed characters.',
      });
    });

    it('installs extension with inferred metadata', async () => {
      const command = new InstallExtensionCommand();
      const extensionManager = createExtensionManager();
      const context = createContext(extensionManager);
      mockInferInstallMetadata.mockResolvedValue({
        source: 'owner/repo',
        type: 'git',
      });
      extensionManager.installOrUpdateExtension.mockResolvedValue({
        name: 'ext-a',
      });

      const result = await command.execute(context, ['owner/repo']);

      expect(mockInferInstallMetadata).toHaveBeenCalledWith('owner/repo');
      expect(extensionManager.installOrUpdateExtension).toHaveBeenCalledWith({
        source: 'owner/repo',
        type: 'git',
      });
      expect(result).toEqual({
        name: 'extensions install',
        data: 'Extension "ext-a" installed successfully.',
      });
    });
  });

  describe('LinkExtensionCommand', () => {
    it('returns invalid source when path is missing', async () => {
      const command = new LinkExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions link',
        data: 'Usage: /extensions link <source>',
      });
    });

    it('returns invalid source when stat fails', async () => {
      const command = new LinkExtensionCommand();
      const context = createContext(createExtensionManager());
      mockStat.mockRejectedValue(new Error('ENOENT'));

      const result = await command.execute(context, ['/missing/path']);

      expect(result).toEqual({
        name: 'extensions link',
        data: 'Invalid source: /missing/path',
      });
    });

    it('links extension from local path', async () => {
      const command = new LinkExtensionCommand();
      const extensionManager = createExtensionManager();
      const context = createContext(extensionManager);
      mockStat.mockResolvedValue({});
      extensionManager.installOrUpdateExtension.mockResolvedValue({
        name: 'ext-a',
      });

      const result = await command.execute(context, ['/valid/path']);

      expect(extensionManager.installOrUpdateExtension).toHaveBeenCalledWith({
        source: '/valid/path',
        type: 'link',
      });
      expect(result).toEqual({
        name: 'extensions link',
        data: 'Extension "ext-a" linked successfully.',
      });
    });
  });

  describe('UninstallExtensionCommand', () => {
    it('returns usage when no extension names are provided', async () => {
      const command = new UninstallExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions uninstall',
        data: 'Usage: /extensions uninstall <extension-names...>|--all',
      });
    });

    it('returns no extensions installed for --all when extension list is empty', async () => {
      const command = new UninstallExtensionCommand();
      const context = createContext(createExtensionManager([]));

      const result = await command.execute(context, ['--all']);

      expect(result).toEqual({
        name: 'extensions uninstall',
        data: 'No extensions installed.',
      });
    });

    it('uninstalls selected extensions and reports failures', async () => {
      const command = new UninstallExtensionCommand();
      const extensionManager = createExtensionManager();
      extensionManager.uninstallExtension.mockImplementation(
        async (extensionName: string) => {
          if (extensionName === 'bad-ext') {
            throw new Error('cannot uninstall');
          }
        },
      );
      const context = createContext(extensionManager);

      const result = await command.execute(context, ['good-ext', 'bad-ext']);

      expect(extensionManager.uninstallExtension).toHaveBeenNthCalledWith(
        1,
        'good-ext',
        false,
      );
      expect(extensionManager.uninstallExtension).toHaveBeenNthCalledWith(
        2,
        'bad-ext',
        false,
      );
      expect(result.data).toContain(
        'Extension "good-ext" uninstalled successfully.',
      );
      expect(result.data).toContain(
        'Failed to uninstall extension "bad-ext": cannot uninstall',
      );
    });

    it('returns error when uninstalling a non-existent extension', async () => {
      const command = new UninstallExtensionCommand();
      const extensionManager = createExtensionManager();
      extensionManager.uninstallExtension.mockRejectedValue(
        new Error('Extension not found.'),
      );
      const context = createContext(extensionManager);

      const result = await command.execute(context, ['non-existent-ext']);

      expect(result).toEqual({
        name: 'extensions uninstall',
        data: 'Failed to uninstall extension "non-existent-ext": Extension not found.',
      });
    });
  });

  describe('RestartExtensionCommand', () => {
    it('returns usage when no extension names are provided', async () => {
      const command = new RestartExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions restart',
        data: 'Usage: /extensions restart <extension-names>|--all',
      });
    });

    it('returns no matching active extensions for request', async () => {
      const command = new RestartExtensionCommand();
      const extensionManager = createExtensionManager([
        { name: 'inactive-ext', isActive: false },
      ]);
      const context = createContext(extensionManager);

      const result = await command.execute(context, ['inactive-ext']);

      expect(result).toEqual({
        name: 'extensions restart',
        data: 'No active extensions matched the request.',
      });
    });

    it('restarts active extensions and reports failures', async () => {
      const command = new RestartExtensionCommand();
      const extensionManager = createExtensionManager([
        { name: 'good-ext', isActive: true },
        { name: 'bad-ext', isActive: true },
        { name: 'inactive-ext', isActive: false },
      ]);
      extensionManager.restartExtension.mockImplementation(
        async (extension: { name: string }) => {
          if (extension.name === 'bad-ext') {
            throw new Error('restart failed');
          }
        },
      );
      const context = createContext(extensionManager);

      const result = await command.execute(context, ['good-ext', 'bad-ext']);

      expect(extensionManager.restartExtension).toHaveBeenCalledTimes(2);
      expect(result.data).toContain('Restarted "good-ext".');
      expect(result.data).toContain(
        'Failed to restart "bad-ext": restart failed',
      );
    });
  });

  describe('UpdateExtensionCommand', () => {
    it('returns usage when no extension names are provided', async () => {
      const command = new UpdateExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, []);

      expect(result).toEqual({
        name: 'extensions update',
        data: 'Usage: /extensions update <extension-names>|--all',
      });
    });

    it('returns headless update message', async () => {
      const command = new UpdateExtensionCommand();
      const context = createContext(createExtensionManager());

      const result = await command.execute(context, ['--all']);

      expect(result).toEqual({
        name: 'extensions update',
        data: 'Headless extension updating requires internal UI dispatches. Please use `gemini extensions update` directly in the terminal.',
      });
    });
  });
});
