/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  EXTENSIONS_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
  annotateActiveExtensions,
  installExtension,
  loadExtensions,
  uninstallExtension,
  updateExtension,
} from './extension.js';
import { execSync } from 'child_process';
import { SimpleGit, simpleGit } from 'simple-git';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
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

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
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
});

describe('annotateActiveExtensions', () => {
  const extensions = [
    { config: { name: 'ext1', version: '1.0.0' }, contextFiles: [] },
    { config: { name: 'ext2', version: '1.0.0' }, contextFiles: [] },
    { config: { name: 'ext3', version: '1.0.0' }, contextFiles: [] },
  ];

  it('should mark all extensions as active if no enabled extensions are provided', () => {
    const activeExtensions = annotateActiveExtensions(extensions, []);
    expect(activeExtensions).toHaveLength(3);
    expect(activeExtensions.every((e) => e.isActive)).toBe(true);
  });

  it('should mark only the enabled extensions as active', () => {
    const activeExtensions = annotateActiveExtensions(extensions, [
      'ext1',
      'ext3',
    ]);
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
    const activeExtensions = annotateActiveExtensions(extensions, ['none']);
    expect(activeExtensions).toHaveLength(3);
    expect(activeExtensions.every((e) => !e.isActive)).toBe(true);
  });

  it('should handle case-insensitivity', () => {
    const activeExtensions = annotateActiveExtensions(extensions, ['EXT1']);
    expect(activeExtensions.find((e) => e.name === 'ext1')?.isActive).toBe(
      true,
    );
  });

  it('should log an error for unknown extensions', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    annotateActiveExtensions(extensions, ['ext4']);
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
    userExtensionsDir = path.join(tempHomeDir, '.gemini', 'extensions');
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
    const sourceExtDir = createExtension(
      tempHomeDir,
      'my-local-extension',
      '1.0.0',
    );
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
    mockedSimpleGit.mockReturnValue({
      clone,
    } as unknown as SimpleGit);

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
});

describe('uninstallExtension', () => {
  let tempHomeDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, '.gemini', 'extensions');
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

    await uninstallExtension('my-local-extension');

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

function createExtension(
  extensionsDir: string,
  name: string,
  version: string,
  addContextFile = false,
  contextFileName?: string,
): string {
  const extDir = path.join(extensionsDir, name);
  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(
    path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
    JSON.stringify({ name, version, contextFileName }),
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

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
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
    const updateInfo = await updateExtension(extensionName);

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
