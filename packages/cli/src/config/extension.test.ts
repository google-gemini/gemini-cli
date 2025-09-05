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
  updateExtension,
  type Extension,
} from './extension.js';
import {
  GEMINI_DIR,
  type GeminiCLIExtension,
  type MCPServerConfig,
} from '@google/gemini-cli-core';
import { execSync } from 'node:child_process';
import { SettingScope, loadSettings } from './settings.js';
import { type SimpleGit, simpleGit } from 'simple-git';
import { isWorkspaceTrusted } from './trustedFolders.js';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof os>();
  return {
    ...os,
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

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const EXTENSIONS_DIRECTORY_NAME = path.join(GEMINI_DIR, 'extensions');

describe('loadExtensions', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;
  let workspaceExtensionsDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);

    workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('ignores extensions in untrusted workspaces', () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue(false);

    const extensionDir = path.join(workspaceExtensionsDir, 'test-extension');
    fs.mkdirSync(extensionDir, { recursive: true });
    createExtension({
      extensionsDir: workspaceExtensionsDir,
      name: 'ext1',
      version: '1.0.0',
      addContextFile: true,
    });
    const extensions = loadExtensions(tempWorkspaceDir);
    expect(extensions.length).toBe(0);
  });

  it('should include extension path in loaded extension', () => {
    const extensionDir = path.join(workspaceExtensionsDir, 'test-extension');
    fs.mkdirSync(extensionDir, { recursive: true });

    createExtension({
      extensionsDir: workspaceExtensionsDir,
      name: 'test-extension',
      version: '1.0.0',
    });

    const extensions = loadExtensions(tempWorkspaceDir);
    expect(extensions).toHaveLength(1);
    expect(extensions[0].path).toBe(extensionDir);
    expect(extensions[0].config.name).toBe('test-extension');
  });

  it('should load context file path when GEMINI.md is present', () => {
    createExtension({
      extensionsDir: workspaceExtensionsDir,
      name: 'ext1',
      version: '1.0.0',
      addContextFile: true,
    });
    createExtension({
      extensionsDir: workspaceExtensionsDir,
      name: 'ext2',
      version: '2.0.0',
    });

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(2);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    const ext2 = extensions.find((e) => e.config.name === 'ext2');
    expect(ext1?.contextFiles).toEqual([
      path.join(workspaceExtensionsDir, 'ext1', 'GEMINI.md'),
    ]);
    expect(ext2?.contextFiles).toEqual([]);
  });

  it('should load context file path from the extension config', () => {
    createExtension({
      extensionsDir: workspaceExtensionsDir,
      name: 'ext1',
      version: '1.0.0',
      addContextFile: false,
      contextFileName: 'my-context-file.md',
    });

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(1);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    expect(ext1?.contextFiles).toEqual([
      path.join(workspaceExtensionsDir, 'ext1', 'my-context-file.md'),
    ]);
  });

  it('should filter out disabled extensions', () => {
    createExtension({
      extensionsDir: workspaceExtensionsDir,
      name: 'ext1',
      version: '1.0.0',
    });
    createExtension({
      extensionsDir: workspaceExtensionsDir,
      name: 'ext2',
      version: '2.0.0',
    });

    const settingsDir = path.join(tempWorkspaceDir, GEMINI_DIR);
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ extensions: { disabled: ['ext1'] } }),
    );

    const extensions = loadExtensions(tempWorkspaceDir);
    const activeExtensions = annotateActiveExtensions(
      extensions,
      [],
      tempWorkspaceDir,
    ).filter((e) => e.isActive);
    expect(activeExtensions).toHaveLength(1);
    expect(activeExtensions[0].name).toBe('ext2');
  });

  it('should hydrate variables', () => {
    createExtension({
      extensionsDir: workspaceExtensionsDir,
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

    const extensions = loadExtensions(tempWorkspaceDir);
    expect(extensions).toHaveLength(1);
    const loadedConfig = extensions[0].config;
    const expectedCwd = path.join(
      workspaceExtensionsDir,
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
    const extensions = loadExtensions(tempHomeDir);
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
      const workspaceExtensionsDir = path.join(
        tempWorkspaceDir,
        EXTENSIONS_DIRECTORY_NAME,
      );
      fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

      const extDir = path.join(workspaceExtensionsDir, 'test-extension');
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

      const extensions = loadExtensions(tempWorkspaceDir);

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
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

    const extDir = path.join(workspaceExtensionsDir, 'test-extension');
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

    const extensions = loadExtensions(tempWorkspaceDir);

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
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    annotateActiveExtensions(extensions, ['ext4'], '/path/to/workspace');
    expect(consoleSpy).toHaveBeenCalledWith('Extension not found: ext4');
    consoleSpy.mockRestore();
  });
});

describe('installExtension', () => {
  let tempHomeDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    // Clean up before each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);
    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
  });

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

    const clone = vi.fn().mockImplementation(async (_, destination) => {
      fs.mkdirSync(destination, { recursive: true });
      fs.writeFileSync(
        path.join(destination, EXTENSIONS_CONFIG_FILENAME),
        JSON.stringify({ name: extensionName, version: '1.0.0' }),
      );
    });

    const mockedSimpleGit = simpleGit as vi.MockedFunction<typeof simpleGit>;
    mockedSimpleGit.mockReturnValue({ clone } as unknown as SimpleGit);

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
});

describe('uninstallExtension', () => {
  let tempHomeDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    // Clean up before each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

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
    expect(loadExtensions(tempHomeDir)).toHaveLength(1);
    expect(fs.existsSync(otherExtDir)).toBe(true);
  });

  it('should throw an error if the extension does not exist', async () => {
    await expect(uninstallExtension('nonexistent-extension')).rejects.toThrow(
      'Extension "nonexistent-extension" not found.',
    );
  });
});

describe('performWorkspaceExtensionMigration', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;
  let workspaceExtensionsDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);

    workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
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
        loadExtension(ext1Path)!,
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

      await performWorkspaceExtensionMigration([loadExtension(ext1Path)!]);

      const userExtensionsDir = path.join(
        tempHomeDir,
        GEMINI_DIR,
        'extensions',
      );

      expect(() => fs.readdirSync(userExtensionsDir)).toThrow();
    });

    it('does not load any extensions in the workspace config', async () => {
      vi.mocked(isWorkspaceTrusted).mockReturnValue(false);
      const ext1Path = createExtension({
        extensionsDir: workspaceExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });

      await performWorkspaceExtensionMigration([loadExtension(ext1Path)!]);
      const extensions = loadExtensions(tempWorkspaceDir);

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
      loadExtension(ext1Path)!,
      loadExtension(ext2Path)!,
    ];
    const failed =
      await performWorkspaceExtensionMigration(extensionsToMigrate);

    expect(failed).toEqual([]);

    const userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    const userExt1Path = path.join(userExtensionsDir, 'ext1');
    const extensions = loadExtensions(tempWorkspaceDir);

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
      loadExtension(ext1Path)!,
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

function createExtension({
  extensionsDir = 'extensions-dir',
  name = 'my-extension',
  version = '1.0.0',
  addContextFile = false,
  contextFileName = undefined as string | undefined,
  mcpServers = {} as Record<string, MCPServerConfig>,
} = {}): string {
  const extDir = path.join(extensionsDir, name);
  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(
    path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
    JSON.stringify({ name, version, contextFileName, mcpServers }),
  );

  if (addContextFile) {
    fs.writeFileSync(path.join(extDir, 'GEMINI.md'), 'context');
  }

  if (contextFileName) {
    const contextPath = path.join(extDir, contextFileName);
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, 'context');
  }
  return extDir;
}

describe('updateExtension', () => {
  let tempHomeDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    // Clean up before each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);

    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should update a git-installed extension', async () => {
    const gitUrl = 'https://github.com/google/gemini-extensions.git';
    const extensionName = 'gemini-extensions';
    const targetExtDir = path.join(userExtensionsDir, extensionName);
    const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);

    fs.mkdirSync(targetExtDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetExtDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify({ name: extensionName, version: '1.0.0' }),
    );
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({ source: gitUrl, type: 'git' }),
    );

    const clone = vi.fn().mockImplementation(async (_, destination) => {
      fs.mkdirSync(destination, { recursive: true });
      fs.writeFileSync(
        path.join(destination, EXTENSIONS_CONFIG_FILENAME),
        JSON.stringify({ name: extensionName, version: '1.1.0' }),
      );
    });

    const mockedSimpleGit = simpleGit as vi.MockedFunction<typeof simpleGit>;
    mockedSimpleGit.mockReturnValue({
      clone,
    } as unknown as SimpleGit);

    const updateInfo = await updateExtension(loadExtension(targetExtDir));

    expect(updateInfo).toEqual({
      name: 'gemini-extensions',
      originalVersion: '1.0.0',
      updatedVersion: '1.1.0',
    });

    const updatedConfig = JSON.parse(
      fs.readFileSync(
        path.join(targetExtDir, EXTENSIONS_CONFIG_FILENAME),
        'utf-8',
      ),
    );
    expect(updatedConfig.version).toBe('1.1.0');
  });
});

describe('disableExtension', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should disable an extension at the user scope', () => {
    disableExtension('my-extension', SettingScope.User);
    const settings = loadSettings(tempWorkspaceDir);
    expect(
      settings.forScope(SettingScope.User).settings.extensions?.disabled,
    ).toEqual(['my-extension']);
  });

  it('should disable an extension at the workspace scope', () => {
    disableExtension('my-extension', SettingScope.Workspace);
    const settings = loadSettings(tempWorkspaceDir);
    expect(
      settings.forScope(SettingScope.Workspace).settings.extensions?.disabled,
    ).toEqual(['my-extension']);
  });

  it('should handle disabling the same extension twice', () => {
    disableExtension('my-extension', SettingScope.User);
    disableExtension('my-extension', SettingScope.User);
    const settings = loadSettings(tempWorkspaceDir);
    expect(
      settings.forScope(SettingScope.User).settings.extensions?.disabled,
    ).toEqual(['my-extension']);
  });

  it('should throw an error if you request system scope', () => {
    expect(() => disableExtension('my-extension', SettingScope.System)).toThrow(
      'System and SystemDefaults scopes are not supported.',
    );
  });
});

describe('enableExtension', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const getActiveExtensions = (): GeminiCLIExtension[] => {
    const extensions = loadExtensions(tempWorkspaceDir);
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

    enableExtension('ext1', [SettingScope.User]);
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

    enableExtension('ext1', [SettingScope.Workspace]);
    activeExtensions = getActiveExtensions();
    expect(activeExtensions).toHaveLength(1);
    expect(activeExtensions[0].name).toBe('ext1');
  });
});
