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
  InstallLocation,
  annotateActiveExtensions,
  disableExtension,
  enableExtension,
  installExtension,
  loadExtension,
  loadExtensions,
  performWorkspaceExtensionMigration,
  uninstallExtension,
  updateExtension,
} from './extension.js';
import {
  type GeminiCLIExtension,
  type MCPServerConfig,
} from '@google/gemini-cli-core';
import { execSync } from 'node:child_process';
import { type SimpleGit, simpleGit } from 'simple-git';
import {
  SettingScope,
  loadSettings,
  getSystemSettingsBasePath,
} from './settings.js';

vi.mock('./settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings.js')>();
  return {
    ...actual,
    getSystemSettingsBasePath: vi.fn(),
  };
});

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

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const EXTENSIONS_DIRECTORY_NAME = path.join('.gemini', 'extensions');

describe('loadExtensions', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;
  let tempSystemDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-system-'),
    );
    vi.mocked(getSystemSettingsBasePath).mockReturnValue(tempSystemDir);
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should include extension path in loaded extension', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

    const extensionDir = path.join(workspaceExtensionsDir, 'test-extension');
    fs.mkdirSync(extensionDir, { recursive: true });

    const config = {
      name: 'test-extension',
      version: '1.0.0',
    };
    fs.writeFileSync(
      path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify(config),
    );

    const extensions = loadExtensions(tempWorkspaceDir);
    expect(extensions).toHaveLength(1);
    expect(extensions[0].path).toBe(extensionDir);
    expect(extensions[0].config.name).toBe('test-extension');
  });

  it('should load context file path when GEMINI.md is present', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(workspaceExtensionsDir, 'ext1', '1.0.0', true);
    createExtension(workspaceExtensionsDir, 'ext2', '2.0.0');

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
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(
      workspaceExtensionsDir,
      'ext1',
      '1.0.0',
      false,
      'my-context-file.md',
    );

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(1);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    expect(ext1?.contextFiles).toEqual([
      path.join(workspaceExtensionsDir, 'ext1', 'my-context-file.md'),
    ]);
  });

  it('should filter out disabled extensions', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

    createExtension(workspaceExtensionsDir, 'ext1', '1.0.0');
    createExtension(workspaceExtensionsDir, 'ext2', '2.0.0');

    const settingsDir = path.join(tempWorkspaceDir, '.gemini');
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

  it('should prioritize system extensions over user extensions', () => {
    const userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    createExtension(userExtensionsDir, 'test-extension', '1.0.0');

    const systemExtensionsDir = path.join(
      tempSystemDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(systemExtensionsDir, { recursive: true });
    createExtension(systemExtensionsDir, 'test-extension', '2.0.0');

    const extensions = loadExtensions(tempWorkspaceDir);
    expect(extensions).toHaveLength(1);
    expect(extensions[0].config.name).toBe('test-extension');
    expect(extensions[0].config.version).toBe('2.0.0');
  });

  it('should hydrate variables', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

    createExtension(
      workspaceExtensionsDir,
      'test-extension',
      '1.0.0',
      false,
      undefined,
      {
        'test-server': {
          cwd: '${extensionPath}${/}server',
        },
      },
    );

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
});

describe('annotateActiveExtensions', () => {
  const extensions = [
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
  let tempSystemDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, '.gemini', 'extensions');
    tempSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-system-'),
    );
    vi.mocked(getSystemSettingsBasePath).mockReturnValue(tempSystemDir);
    // Clean up before each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should install an extension from a local path', async () => {
    const sourceExtDir = createExtension(
      tempHomeDir,
      'my-local-extension',
      '1.0.0',
    );
    const targetExtDir = path.join(userExtensionsDir, 'my-local-extension');
    const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);

    await installExtension(
      { source: sourceExtDir, type: 'local' },
      InstallLocation.User,
    );

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
    const sourceExtDir = createExtension(
      tempHomeDir,
      'my-local-extension',
      '1.0.0',
    );
    await installExtension(
      { source: sourceExtDir, type: 'local' },
      InstallLocation.User,
    );
    await expect(
      installExtension(
        { source: sourceExtDir, type: 'local' },
        InstallLocation.User,
      ),
    ).rejects.toThrow(
      'Extension "my-local-extension" is already installed. Please uninstall it first.',
    );
  });

  it('should throw an error and cleanup if gemini-extension.json is missing', async () => {
    const sourceExtDir = path.join(tempHomeDir, 'bad-extension');
    fs.mkdirSync(sourceExtDir, { recursive: true });

    await expect(
      installExtension(
        { source: sourceExtDir, type: 'local' },
        InstallLocation.User,
      ),
    ).rejects.toThrow(
      `Invalid extension at ${sourceExtDir}. Please make sure it has a valid gemini-extension.json file.`,
    );

    const targetExtDir = path.join(userExtensionsDir, 'bad-extension');
    expect(fs.existsSync(targetExtDir)).toBe(false);
  });

  it('should throw an error if installing a user extension that already exists as a system extension', async () => {
    const systemExtensionsDir = path.join(
      tempSystemDir,
      '.gemini',
      'extensions',
    );
    fs.mkdirSync(systemExtensionsDir, { recursive: true });
    createExtension(systemExtensionsDir, 'my-local-extension', '1.0.0');

    const sourceExtDir = createExtension(
      tempHomeDir,
      'my-local-extension',
      '2.0.0',
    );

    await expect(
      installExtension(
        { source: sourceExtDir, type: 'local' },
        InstallLocation.User,
      ),
    ).rejects.toThrow(
      'Extension "my-local-extension" is already installed at the system level.',
    );
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

    await installExtension(
      { source: gitUrl, type: 'git' },
      InstallLocation.User,
    );

    expect(fs.existsSync(targetExtDir)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(true);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    expect(metadata).toEqual({
      source: gitUrl,
      type: 'git',
    });
    fs.rmSync(targetExtDir, { recursive: true, force: true });
  });
});

describe('uninstallExtension', () => {
  let tempHomeDir: string;
  let userExtensionsDir: string;
  let tempSystemDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, '.gemini', 'extensions');
    tempSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-system-'),
    );
    vi.mocked(getSystemSettingsBasePath).mockReturnValue(tempSystemDir);
    // Clean up before each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should uninstall an extension by name', async () => {
    const sourceExtDir = createExtension(
      userExtensionsDir,
      'my-local-extension',
      '1.0.0',
    );

    await uninstallExtension('my-local-extension', InstallLocation.User);

    expect(fs.existsSync(sourceExtDir)).toBe(false);
  });

  it('should uninstall an extension by name and retain existing extensions', async () => {
    const sourceExtDir = createExtension(
      userExtensionsDir,
      'my-local-extension',
      '1.0.0',
    );
    const otherExtDir = createExtension(
      userExtensionsDir,
      'other-extension',
      '1.0.0',
    );

    await uninstallExtension('my-local-extension', InstallLocation.User);

    expect(fs.existsSync(sourceExtDir)).toBe(false);
    expect(loadExtensions(tempHomeDir)).toHaveLength(1);
    expect(fs.existsSync(otherExtDir)).toBe(true);
  });

  it('should throw an error if the extension does not exist', async () => {
    await expect(
      uninstallExtension('nonexistent-extension', InstallLocation.User),
    ).rejects.toThrow('Extension "nonexistent-extension" not found.');
  });
});

describe('performWorkspaceExtensionMigration', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;
  let tempSystemDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-system-'),
    );
    vi.mocked(getSystemSettingsBasePath).mockReturnValue(tempSystemDir);
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should install the extensions in the user directory', async () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    const ext1Path = createExtension(workspaceExtensionsDir, 'ext1', '1.0.0');
    const ext2Path = createExtension(workspaceExtensionsDir, 'ext2', '1.0.0');
    const extensionsToMigrate = [
      loadExtension(ext1Path)!,
      loadExtension(ext2Path)!,
    ];
    const failed =
      await performWorkspaceExtensionMigration(extensionsToMigrate);

    expect(failed).toEqual([]);

    const userExtensionsDir = path.join(tempHomeDir, '.gemini', 'extensions');
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
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    const ext1Path = createExtension(workspaceExtensionsDir, 'ext1', '1.0.0');
    const extensionsToMigrate = [
      loadExtension(ext1Path)!,
      {
        path: '/ext/path/2',
        config: { name: 'ext2', version: '1.0.0' },
        contextFiles: [],
      },
    ];

    const failed =
      await performWorkspaceExtensionMigration(extensionsToMigrate);
    expect(failed).toEqual(['ext2']);
  });
});

function createExtension(
  extensionsDir: string,
  name: string,
  version: string,
  addContextFile = false,
  contextFileName?: string,
  mcpServers?: Record<string, MCPServerConfig>,
): string {
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
    fs.writeFileSync(path.join(extDir, contextFileName), 'context');
  }
  return extDir;
}

describe('updateExtension', () => {
  let tempHomeDir: string;
  let userExtensionsDir: string;
  let tempSystemDir: string;
  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    tempSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-system-'),
    );
    vi.mocked(getSystemSettingsBasePath).mockReturnValue(tempSystemDir);

    userExtensionsDir = path.join(tempHomeDir, '.gemini', 'extensions');
    // Clean up before each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should update a git-installed extension', async () => {
    // 1. "Install" an extension
    const gitUrl = 'https://github.com/google/gemini-extensions.git';
    const extensionName = 'gemini-extensions';
    const targetExtDir = path.join(userExtensionsDir, extensionName);
    const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);

    // Create the "installed" extension directory and files
    fs.mkdirSync(targetExtDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetExtDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify({ name: extensionName, version: '1.0.0' }),
    );
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({ source: gitUrl, type: 'git' }),
    );

    // 2. Mock the git clone for the update
    const clone = vi.fn().mockImplementation(async (_, destination) => {
      fs.mkdirSync(destination, { recursive: true });
      // This is the "updated" version
      fs.writeFileSync(
        path.join(destination, EXTENSIONS_CONFIG_FILENAME),
        JSON.stringify({ name: extensionName, version: '1.1.0' }),
      );
    });

    const mockedSimpleGit = simpleGit as vi.MockedFunction<typeof simpleGit>;
    mockedSimpleGit.mockReturnValue({
      clone,
    } as unknown as SimpleGit);

    // 3. Call updateExtension
    const updateInfo = await updateExtension(
      extensionName,
      InstallLocation.User,
    );

    // 4. Assertions
    expect(updateInfo).toEqual({
      originalVersion: '1.0.0',
      updatedVersion: '1.1.0',
    });

    // Check that the config file reflects the new version
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
  let tempSystemDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-system-'),
    );
    vi.mocked(getSystemSettingsBasePath).mockReturnValue(tempSystemDir);
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
});

describe('enableExtension', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;
  let userExtensionsDir: string;
  let tempSystemDir: string;
  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    userExtensionsDir = path.join(tempHomeDir, '.gemini', 'extensions');
    tempSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-system-'),
    );
    vi.mocked(getSystemSettingsBasePath).mockReturnValue(tempSystemDir);

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
    createExtension(userExtensionsDir, 'ext1', '1.0.0');
    disableExtension('ext1', SettingScope.User);
    let activeExtensions = getActiveExtensions();
    expect(activeExtensions).toHaveLength(0);

    enableExtension('ext1', [SettingScope.User]);
    activeExtensions = getActiveExtensions();
    expect(activeExtensions).toHaveLength(1);
    expect(activeExtensions[0].name).toBe('ext1');
  });

  it('should enable an extension at the workspace scope', () => {
    createExtension(userExtensionsDir, 'ext1', '1.0.0');
    disableExtension('ext1', SettingScope.Workspace);
    let activeExtensions = getActiveExtensions();
    expect(activeExtensions).toHaveLength(0);

    enableExtension('ext1', [SettingScope.Workspace]);
    activeExtensions = getActiveExtensions();
    expect(activeExtensions).toHaveLength(1);
    expect(activeExtensions[0].name).toBe('ext1');
  });
});
