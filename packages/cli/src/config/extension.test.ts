/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EXTENSIONS_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
  annotateActiveExtensions,
  disableExtension,
  enableExtension,
  installExtension,
  loadExtension,
  loadExtensions,
  performWorkspaceExtensionMigration,
  uninstallExtension,
  type Extension,
} from './extension.js';
import {
  GEMINI_DIR,
  type GeminiCLIExtension,
  ClearcutLogger,
  type Config,
  ExtensionUninstallEvent,
} from '@google/gemini-cli-core';
import { execSync } from 'node:child_process';
import { SettingScope } from './settings.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import { createExtension } from '../test-utils/createExtension.js';
import { ExtensionEnablementManager } from './extensions/extensionEnablement.js';

const mockGit = {
  clone: vi.fn(),
  getRemotes: vi.fn(),
  fetch: vi.fn(),
  checkout: vi.fn(),
  listRemote: vi.fn(),
  revparse: vi.fn(),
  // Not a part of the actual API, but we need to use this to do the correct
  // file system interactions.
  path: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn((path: string) => {
    mockGit.path.mockReturnValue(path);
    return mockGit;
  }),
}));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: vi.fn(),
  };
});

vi.mock('./trustedFolders.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./trustedFolders.js')>();
  return {
    ...actual,
    isWorkspaceTrusted: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const mockLogExtensionInstallEvent = vi.fn();
  const mockLogExtensionUninstallEvent = vi.fn();
  return {
    ...actual,
    ClearcutLogger: {
      getInstance: vi.fn(() => ({
        logExtensionInstallEvent: mockLogExtensionInstallEvent,
        logExtensionUninstallEvent: mockLogExtensionUninstallEvent,
      })),
    },
    Config: vi.fn(),
    ExtensionInstallEvent: vi.fn(),
    ExtensionUninstallEvent: vi.fn(),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const mockQuestion = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

const EXTENSIONS_DIRECTORY_NAME = path.join(GEMINI_DIR, 'extensions');

describe('extension tests', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
    );
    userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
    mockQuestion.mockImplementation((_query, callback) => callback('y'));
    vi.mocked(execSync).mockClear();
    Object.values(mockGit).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    mockQuestion.mockClear();
    mockClose.mockClear();
  });

  describe('loadExtensions', () => {
    it('should include extension path in loaded extension', () => {
      const extensionDir = path.join(userExtensionsDir, 'test-extension');
      fs.mkdirSync(extensionDir, { recursive: true });

      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'test-extension',
        version: '1.0.0',
      });

      const extensions = loadExtensions();
      expect(extensions).toHaveLength(1);
      expect(extensions[0].path).toBe(extensionDir);
      expect(extensions[0].config.name).toBe('test-extension');
    });

    it('should load context file path when GEMINI.md is present', () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
        addContextFile: true,
      });
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext2',
        version: '2.0.0',
      });

      const extensions = loadExtensions();

      expect(extensions).toHaveLength(2);
      const ext1 = extensions.find((e) => e.config.name === 'ext1');
      const ext2 = extensions.find((e) => e.config.name === 'ext2');
      expect(ext1?.contextFiles).toEqual([
        path.join(userExtensionsDir, 'ext1', 'GEMINI.md'),
      ]);
      expect(ext2?.contextFiles).toEqual([]);
    });

    it('should load context file path from the extension config', () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
        addContextFile: false,
        contextFileName: 'my-context-file.md',
      });

      const extensions = loadExtensions();

      expect(extensions).toHaveLength(1);
      const ext1 = extensions.find((e) => e.config.name === 'ext1');
      expect(ext1?.contextFiles).toEqual([
        path.join(userExtensionsDir, 'ext1', 'my-context-file.md'),
      ]);
    });

    it('should filter out disabled extensions', () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'disabled-extension',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'enabled-extension',
        version: '2.0.0',
      });
      disableExtension(
        'disabled-extension',
        SettingScope.User,
        tempWorkspaceDir,
      );
      const extensions = loadExtensions();
      const activeExtensions = annotateActiveExtensions(
        extensions,
        [],
        tempWorkspaceDir,
      ).filter((e) => e.isActive);
      expect(activeExtensions).toHaveLength(1);
      expect(activeExtensions[0].name).toBe('enabled-extension');
    });

    it('should hydrate variables', () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'test-extension',
        version: '1.0.0',
        addContextFile: false,
        contextFileName: undefined,
        mcpServers: {
          'test-server': {
            cwd: '${extensionPath}${/}server',
          },
        },
      });

      const extensions = loadExtensions();
      expect(extensions).toHaveLength(1);
      const loadedConfig = extensions[0].config;
      const expectedCwd = path.join(
        userExtensionsDir,
        'test-extension',
        'server',
      );
      expect(loadedConfig.mcpServers?.['test-server'].cwd).toBe(expectedCwd);
    });

    it('should load a linked extension correctly', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempWorkspaceDir,
        name: 'my-linked-extension',
        version: '1.0.0',
        contextFileName: 'context.md',
      });
      fs.writeFileSync(path.join(sourceExtDir, 'context.md'), 'linked context');

      const extensionName = await installExtension({
        source: sourceExtDir,
        type: 'link',
      });

      expect(extensionName).toEqual('my-linked-extension');
      const extensions = loadExtensions();
      expect(extensions).toHaveLength(1);

      const linkedExt = extensions[0];
      expect(linkedExt.config.name).toBe('my-linked-extension');

      expect(linkedExt.path).toBe(sourceExtDir);
      expect(linkedExt.installMetadata).toEqual({
        source: sourceExtDir,
        type: 'link',
      });
      expect(linkedExt.contextFiles).toEqual([
        path.join(sourceExtDir, 'context.md'),
      ]);
    });

    it('should resolve environment variables in extension configuration', () => {
      process.env.TEST_API_KEY = 'test-api-key-123';
      process.env.TEST_DB_URL = 'postgresql://localhost:5432/testdb';

      try {
        const userExtensionsDir = path.join(
          tempHomeDir,
          EXTENSIONS_DIRECTORY_NAME,
        );
        fs.mkdirSync(userExtensionsDir, { recursive: true });

        const extDir = path.join(userExtensionsDir, 'test-extension');
        fs.mkdirSync(extDir);

        // Write config to a separate file for clarity and good practices
        const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
        const extensionConfig = {
          name: 'test-extension',
          version: '1.0.0',
          mcpServers: {
            'test-server': {
              command: 'node',
              args: ['server.js'],
              env: {
                API_KEY: '$TEST_API_KEY',
                DATABASE_URL: '${TEST_DB_URL}',
                STATIC_VALUE: 'no-substitution',
              },
            },
          },
        };
        fs.writeFileSync(configPath, JSON.stringify(extensionConfig));

        const extensions = loadExtensions();

        expect(extensions).toHaveLength(1);
        const extension = extensions[0];
        expect(extension.config.name).toBe('test-extension');
        expect(extension.config.mcpServers).toBeDefined();

        const serverConfig = extension.config.mcpServers?.['test-server'];
        expect(serverConfig).toBeDefined();
        expect(serverConfig?.env).toBeDefined();
        expect(serverConfig?.env?.API_KEY).toBe('test-api-key-123');
        expect(serverConfig?.env?.DATABASE_URL).toBe(
          'postgresql://localhost:5432/testdb',
        );
        expect(serverConfig?.env?.STATIC_VALUE).toBe('no-substitution');
      } finally {
        delete process.env.TEST_API_KEY;
        delete process.env.TEST_DB_URL;
      }
    });

    it('should handle missing environment variables gracefully', () => {
      const userExtensionsDir = path.join(
        tempHomeDir,
        EXTENSIONS_DIRECTORY_NAME,
      );
      fs.mkdirSync(userExtensionsDir, { recursive: true });

      const extDir = path.join(userExtensionsDir, 'test-extension');
      fs.mkdirSync(extDir);

      const extensionConfig = {
        name: 'test-extension',
        version: '1.0.0',
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            env: {
              MISSING_VAR: '$UNDEFINED_ENV_VAR',
              MISSING_VAR_BRACES: '${ALSO_UNDEFINED}',
            },
          },
        },
      };

      fs.writeFileSync(
        path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
        JSON.stringify(extensionConfig),
      );

      const extensions = loadExtensions();

      expect(extensions).toHaveLength(1);
      const extension = extensions[0];
      const serverConfig = extension.config.mcpServers!['test-server'];
      expect(serverConfig.env).toBeDefined();
      expect(serverConfig.env!.MISSING_VAR).toBe('$UNDEFINED_ENV_VAR');
      expect(serverConfig.env!.MISSING_VAR_BRACES).toBe('${ALSO_UNDEFINED}');
    });
  });

  describe('annotateActiveExtensions', () => {
    const extensions: Extension[] = [
      {
        path: '/path/to/ext1',
        config: { name: 'ext1', version: '1.0.0' },
        contextFiles: [],
      },
      {
        path: '/path/to/ext2',
        config: { name: 'ext2', version: '1.0.0' },
        contextFiles: [],
      },
      {
        path: '/path/to/ext3',
        config: { name: 'ext3', version: '1.0.0' },
        contextFiles: [],
      },
    ];

    it('should mark all extensions as active if no enabled extensions are provided', () => {
      const activeExtensions = annotateActiveExtensions(
        extensions,
        [],
        '/path/to/workspace',
      );
      expect(activeExtensions).toHaveLength(3);
      expect(activeExtensions.every((e) => e.isActive)).toBe(true);
    });

    it('should mark only the enabled extensions as active', () => {
      const activeExtensions = annotateActiveExtensions(
        extensions,
        ['ext1', 'ext3'],
        '/path/to/workspace',
      );
      expect(activeExtensions).toHaveLength(3);
      expect(activeExtensions.find((e) => e.name === 'ext1')?.isActive).toBe(
        true,
      );
      expect(activeExtensions.find((e) => e.name === 'ext2')?.isActive).toBe(
        false,
      );
      expect(activeExtensions.find((e) => e.name === 'ext3')?.isActive).toBe(
        true,
      );
    });

    it('should mark all extensions as inactive when "none" is provided', () => {
      const activeExtensions = annotateActiveExtensions(
        extensions,
        ['none'],
        '/path/to/workspace',
      );
      expect(activeExtensions).toHaveLength(3);
      expect(activeExtensions.every((e) => !e.isActive)).toBe(true);
    });

    it('should handle case-insensitivity', () => {
      const activeExtensions = annotateActiveExtensions(
        extensions,
        ['EXT1'],
        '/path/to/workspace',
      );
      expect(activeExtensions.find((e) => e.name === 'ext1')?.isActive).toBe(
        true,
      );
    });

    it('should log an error for unknown extensions', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      annotateActiveExtensions(extensions, ['ext4'], '/path/to/workspace');
      expect(consoleSpy).toHaveBeenCalledWith('Extension not found: ext4');
      consoleSpy.mockRestore();
    });

    describe('autoUpdate', () => {
      it('should be false if autoUpdate is not set in install metadata', () => {
        const activeExtensions = annotateActiveExtensions(
          extensions,
          [],
          tempHomeDir,
        );
        expect(
          activeExtensions.every(
            (e) => e.installMetadata?.autoUpdate === false,
          ),
        ).toBe(false);
      });

      it('should be true if autoUpdate is true in install metadata', () => {
        const extensionsWithAutoUpdate: Extension[] = extensions.map((e) => ({
          ...e,
          installMetadata: {
            ...e.installMetadata!,
            autoUpdate: true,
          },
        }));
        const activeExtensions = annotateActiveExtensions(
          extensionsWithAutoUpdate,
          [],
          tempHomeDir,
        );
        expect(
          activeExtensions.every((e) => e.installMetadata?.autoUpdate === true),
        ).toBe(true);
      });

      it('should respect the per-extension settings from install metadata', () => {
        const extensionsWithAutoUpdate: Extension[] = [
          {
            path: '/path/to/ext1',
            config: { name: 'ext1', version: '1.0.0' },
            contextFiles: [],
            installMetadata: {
              source: 'test',
              type: 'local',
              autoUpdate: true,
            },
          },
          {
            path: '/path/to/ext2',
            config: { name: 'ext2', version: '1.0.0' },
            contextFiles: [],
            installMetadata: {
              source: 'test',
              type: 'local',
              autoUpdate: false,
            },
          },
          {
            path: '/path/to/ext3',
            config: { name: 'ext3', version: '1.0.0' },
            contextFiles: [],
          },
        ];
        const activeExtensions = annotateActiveExtensions(
          extensionsWithAutoUpdate,
          [],
          tempHomeDir,
        );
        expect(
          activeExtensions.find((e) => e.name === 'ext1')?.installMetadata
            ?.autoUpdate,
        ).toBe(true);
        expect(
          activeExtensions.find((e) => e.name === 'ext2')?.installMetadata
            ?.autoUpdate,
        ).toBe(false);
        expect(
          activeExtensions.find((e) => e.name === 'ext3')?.installMetadata
            ?.autoUpdate,
        ).toBe(undefined);
      });
    });
  });

  describe('installExtension', () => {
    it('should install an extension from a local path', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
      });
      const targetExtDir = path.join(userExtensionsDir, 'my-local-extension');
      const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);

      await installExtension({ source: sourceExtDir, type: 'local' });

      expect(fs.existsSync(targetExtDir)).toBe(true);
      expect(fs.existsSync(metadataPath)).toBe(true);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      expect(metadata).toEqual({
        source: sourceExtDir,
        type: 'local',
      });
      fs.rmSync(targetExtDir, { recursive: true, force: true });
    });

    it('should throw an error if the extension already exists', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
      });
      await installExtension({ source: sourceExtDir, type: 'local' });
      await expect(
        installExtension({ source: sourceExtDir, type: 'local' }),
      ).rejects.toThrow(
        'Extension "my-local-extension" is already installed. Please uninstall it first.',
      );
    });

    it('should throw an error and cleanup if gemini-extension.json is missing', async () => {
      const sourceExtDir = path.join(tempHomeDir, 'bad-extension');
      fs.mkdirSync(sourceExtDir, { recursive: true });

      await expect(
        installExtension({ source: sourceExtDir, type: 'local' }),
      ).rejects.toThrow(
        `Invalid extension at ${sourceExtDir}. Please make sure it has a valid gemini-extension.json file.`,
      );

      const targetExtDir = path.join(userExtensionsDir, 'bad-extension');
      expect(fs.existsSync(targetExtDir)).toBe(false);
    });

    it('should install an extension from a git URL', async () => {
      const gitUrl = 'https://github.com/google/gemini-extensions.git';
      const extensionName = 'gemini-extensions';
      const targetExtDir = path.join(userExtensionsDir, extensionName);
      const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);

      mockGit.clone.mockImplementation(async (_, destination) => {
        fs.mkdirSync(path.join(mockGit.path(), destination), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(mockGit.path(), destination, EXTENSIONS_CONFIG_FILENAME),
          JSON.stringify({ name: extensionName, version: '1.0.0' }),
        );
      });
      mockGit.getRemotes.mockResolvedValue([{ name: 'origin' }]);

      await installExtension({ source: gitUrl, type: 'git' });

      expect(fs.existsSync(targetExtDir)).toBe(true);
      expect(fs.existsSync(metadataPath)).toBe(true);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      expect(metadata).toEqual({
        source: gitUrl,
        type: 'git',
      });
      fs.rmSync(targetExtDir, { recursive: true, force: true });
    });

    it('should install a linked extension', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-linked-extension',
        version: '1.0.0',
      });
      const targetExtDir = path.join(userExtensionsDir, 'my-linked-extension');
      const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);
      const configPath = path.join(targetExtDir, EXTENSIONS_CONFIG_FILENAME);

      await installExtension({ source: sourceExtDir, type: 'link' });

      expect(fs.existsSync(targetExtDir)).toBe(true);
      expect(fs.existsSync(metadataPath)).toBe(true);

      expect(fs.existsSync(configPath)).toBe(false);

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      expect(metadata).toEqual({
        source: sourceExtDir,
        type: 'link',
      });
      fs.rmSync(targetExtDir, { recursive: true, force: true });
    });

    it('should log to clearcut on successful install', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
      });

      await installExtension({ source: sourceExtDir, type: 'local' });

      const logger = ClearcutLogger.getInstance({} as Config);
      expect(logger?.logExtensionInstallEvent).toHaveBeenCalled();
    });

    it('should show users information on their mcp server when installing', async () => {
      const consoleInfoSpy = vi.spyOn(console, 'info');
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            description: 'a local mcp server',
          },
          'test-server-2': {
            description: 'a remote mcp server',
            httpUrl: 'https://google.com',
          },
        },
      });

      mockQuestion.mockImplementation((_query, callback) => callback('y'));

      await expect(
        installExtension({ source: sourceExtDir, type: 'local' }, true),
      ).resolves.toBe('my-local-extension');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'This extension will run the following MCP servers: ',
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '  * test-server (local): a local mcp server',
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '  * test-server-2 (remote): a remote mcp server',
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'The extension will append info to your gemini.md context',
      );
    });

    it('should continue installation if user accepts prompt for local extension with mcp servers', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      });

      mockQuestion.mockImplementation((_query, callback) => callback('y'));

      await expect(
        installExtension({ source: sourceExtDir, type: 'local' }, true),
      ).resolves.toBe('my-local-extension');

      expect(mockQuestion).toHaveBeenCalledWith(
        expect.stringContaining('Do you want to continue? (y/n)'),
        expect.any(Function),
      );
    });

    it('should cancel installation if user declines prompt for local extension with mcp servers', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      });

      mockQuestion.mockImplementation((_query, callback) => callback('n'));

      await expect(
        installExtension({ source: sourceExtDir, type: 'local' }, true),
      ).rejects.toThrow('Installation cancelled by user.');

      expect(mockQuestion).toHaveBeenCalledWith(
        expect.stringContaining('Do you want to continue? (y/n)'),
        expect.any(Function),
      );
    });

    it('should save the autoUpdate flag to the install metadata', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
      });
      const targetExtDir = path.join(userExtensionsDir, 'my-local-extension');
      const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);

      await installExtension({
        source: sourceExtDir,
        type: 'local',
        autoUpdate: true,
      });

      expect(fs.existsSync(targetExtDir)).toBe(true);
      expect(fs.existsSync(metadataPath)).toBe(true);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      expect(metadata).toEqual({
        source: sourceExtDir,
        type: 'local',
        autoUpdate: true,
      });
      fs.rmSync(targetExtDir, { recursive: true, force: true });
    });

    it('should ignore consent flow if not required', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: tempHomeDir,
        name: 'my-local-extension',
        version: '1.0.0',
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      });

      await expect(
        installExtension({ source: sourceExtDir, type: 'local' }, false),
      ).resolves.toBe('my-local-extension');
    });
  });

  describe('uninstallExtension', () => {
    it('should uninstall an extension by name', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'my-local-extension',
        version: '1.0.0',
      });

      await uninstallExtension('my-local-extension');

      expect(fs.existsSync(sourceExtDir)).toBe(false);
    });

    it('should uninstall an extension by name and retain existing extensions', async () => {
      const sourceExtDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'my-local-extension',
        version: '1.0.0',
      });
      const otherExtDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'other-extension',
        version: '1.0.0',
      });

      await uninstallExtension('my-local-extension');

      expect(fs.existsSync(sourceExtDir)).toBe(false);
      expect(loadExtensions()).toHaveLength(1);
      expect(fs.existsSync(otherExtDir)).toBe(true);
    });

    it('should throw an error if the extension does not exist', async () => {
      await expect(uninstallExtension('nonexistent-extension')).rejects.toThrow(
        'Extension not found.',
      );
    });

    it('should log uninstall event', async () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'my-local-extension',
        version: '1.0.0',
      });

      await uninstallExtension('my-local-extension');

      const logger = ClearcutLogger.getInstance({} as Config);
      expect(logger?.logExtensionUninstallEvent).toHaveBeenCalledWith(
        new ExtensionUninstallEvent('my-local-extension', 'success'),
      );
    });

    it('should uninstall an extension by its source URL', async () => {
      const gitUrl = 'https://github.com/google/gemini-sql-extension.git';
      const sourceExtDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'gemini-sql-extension',
        version: '1.0.0',
        installMetadata: {
          source: gitUrl,
          type: 'git',
        },
      });

      await uninstallExtension(gitUrl);

      expect(fs.existsSync(sourceExtDir)).toBe(false);
      const logger = ClearcutLogger.getInstance({} as Config);
      expect(logger?.logExtensionUninstallEvent).toHaveBeenCalledWith(
        new ExtensionUninstallEvent('gemini-sql-extension', 'success'),
      );
    });

    it('should fail to uninstall by URL if an extension has no install metadata', async () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'no-metadata-extension',
        version: '1.0.0',
        // No installMetadata provided
      });

      await expect(
        uninstallExtension('https://github.com/google/no-metadata-extension'),
      ).rejects.toThrow('Extension not found.');
    });
  });

  describe('performWorkspaceExtensionMigration', () => {
    let workspaceExtensionsDir: string;

    beforeEach(() => {
      workspaceExtensionsDir = path.join(
        tempWorkspaceDir,
        EXTENSIONS_DIRECTORY_NAME,
      );
      fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(workspaceExtensionsDir, { recursive: true, force: true });
    });

    describe('folder trust', () => {
      it('refuses to install extensions from untrusted folders', async () => {
        vi.mocked(isWorkspaceTrusted).mockReturnValue(false);
        const ext1Path = createExtension({
          extensionsDir: workspaceExtensionsDir,
          name: 'ext1',
          version: '1.0.0',
        });

        const failed = await performWorkspaceExtensionMigration([
          loadExtension({
            extensionDir: ext1Path,
            workspaceDir: tempWorkspaceDir,
          })!,
        ]);

        expect(failed).toEqual(['ext1']);
      });

      it('does not copy extensions to the user dir', async () => {
        vi.mocked(isWorkspaceTrusted).mockReturnValue(false);
        const ext1Path = createExtension({
          extensionsDir: workspaceExtensionsDir,
          name: 'ext1',
          version: '1.0.0',
        });

        await performWorkspaceExtensionMigration([
          loadExtension({
            extensionDir: ext1Path,
            workspaceDir: tempWorkspaceDir,
          })!,
        ]);

        const userExtensionsDir = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'extensions',
        );
        expect(fs.readdirSync(userExtensionsDir).length).toBe(0);
      });

      it('does not load any extensions in the workspace config', async () => {
        vi.mocked(isWorkspaceTrusted).mockReturnValue(false);
        const ext1Path = createExtension({
          extensionsDir: workspaceExtensionsDir,
          name: 'ext1',
          version: '1.0.0',
        });

        await performWorkspaceExtensionMigration([
          loadExtension({
            extensionDir: ext1Path,
            workspaceDir: tempWorkspaceDir,
          })!,
        ]);
        const extensions = loadExtensions();

        expect(extensions).toEqual([]);
      });
    });

    it('should install the extensions in the user directory', async () => {
      const ext1Path = createExtension({
        extensionsDir: workspaceExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });
      const ext2Path = createExtension({
        extensionsDir: workspaceExtensionsDir,
        name: 'ext2',
        version: '1.0.0',
      });
      const extensionsToMigrate: Extension[] = [
        loadExtension({
          extensionDir: ext1Path,
          workspaceDir: tempWorkspaceDir,
        })!,
        loadExtension({
          extensionDir: ext2Path,
          workspaceDir: tempWorkspaceDir,
        })!,
      ];
      const failed =
        await performWorkspaceExtensionMigration(extensionsToMigrate);

      expect(failed).toEqual([]);

      const userExtensionsDir = path.join(
        tempHomeDir,
        GEMINI_DIR,
        'extensions',
      );
      const userExt1Path = path.join(userExtensionsDir, 'ext1');
      const extensions = loadExtensions();

      expect(extensions).toHaveLength(2);
      const metadataPath = path.join(userExt1Path, INSTALL_METADATA_FILENAME);
      expect(fs.existsSync(metadataPath)).toBe(true);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      expect(metadata).toEqual({
        source: ext1Path,
        type: 'local',
      });
    });

    it('should return the names of failed installations', async () => {
      const ext1Path = createExtension({
        extensionsDir: workspaceExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });

      const extensions: Extension[] = [
        loadExtension({
          extensionDir: ext1Path,
          workspaceDir: tempWorkspaceDir,
        })!,
        {
          path: '/ext/path/1',
          config: { name: 'ext2', version: '1.0.0' },
          contextFiles: [],
        },
      ];

      const failed = await performWorkspaceExtensionMigration(extensions);
      expect(failed).toEqual(['ext2']);
    });
  });

  describe('disableExtension', () => {
    it('should disable an extension at the user scope', () => {
      disableExtension('my-extension', SettingScope.User);
      expect(
        isEnabled({
          name: 'my-extension',
          configDir: userExtensionsDir,
          enabledForPath: tempWorkspaceDir,
        }),
      ).toBe(false);
    });

    it('should disable an extension at the workspace scope', () => {
      disableExtension(
        'my-extension',
        SettingScope.Workspace,
        tempWorkspaceDir,
      );
      expect(
        isEnabled({
          name: 'my-extension',
          configDir: userExtensionsDir,
          enabledForPath: tempHomeDir,
        }),
      ).toBe(true);
      expect(
        isEnabled({
          name: 'my-extension',
          configDir: userExtensionsDir,
          enabledForPath: tempWorkspaceDir,
        }),
      ).toBe(false);
    });

    it('should handle disabling the same extension twice', () => {
      disableExtension('my-extension', SettingScope.User);
      disableExtension('my-extension', SettingScope.User);
      expect(
        isEnabled({
          name: 'my-extension',
          configDir: userExtensionsDir,
          enabledForPath: tempWorkspaceDir,
        }),
      ).toBe(false);
    });

    it('should throw an error if you request system scope', () => {
      expect(() =>
        disableExtension('my-extension', SettingScope.System),
      ).toThrow('System and SystemDefaults scopes are not supported.');
    });
  });

  describe('enableExtension', () => {
    afterAll(() => {
      vi.restoreAllMocks();
    });

    const getActiveExtensions = (): GeminiCLIExtension[] => {
      const extensions = loadExtensions();
      const activeExtensions = annotateActiveExtensions(
        extensions,
        [],
        tempWorkspaceDir,
      );
      return activeExtensions.filter((e) => e.isActive);
    };

    it('should enable an extension at the user scope', () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });
      disableExtension('ext1', SettingScope.User);
      let activeExtensions = getActiveExtensions();
      expect(activeExtensions).toHaveLength(0);

      enableExtension('ext1', SettingScope.User);
      activeExtensions = getActiveExtensions();
      expect(activeExtensions).toHaveLength(1);
      expect(activeExtensions[0].name).toBe('ext1');
    });

    it('should enable an extension at the workspace scope', () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });
      disableExtension('ext1', SettingScope.Workspace);
      let activeExtensions = getActiveExtensions();
      expect(activeExtensions).toHaveLength(0);

      enableExtension('ext1', SettingScope.Workspace);
      activeExtensions = getActiveExtensions();
      expect(activeExtensions).toHaveLength(1);
      expect(activeExtensions[0].name).toBe('ext1');
    });
  });
});

function isEnabled(options: {
  name: string;
  configDir: string;
  enabledForPath: string;
}) {
  const manager = new ExtensionEnablementManager(options.configDir);
  return manager.isEnabled(options.name, options.enabledForPath);
}
