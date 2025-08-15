/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installCommand, INSTALL_METADATA_FILENAME } from './install.js';
import yargs from 'yargs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import {
  loadExtension,
  loadExtensionsFromDir,
  EXTENSIONS_DIRECTORY_NAME,
} from '../../config/extension.js';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
    tmpdir: vi.fn(),
  };
});

vi.mock('fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('fs')>();
  const realFsPromises = fs.promises;

  return {
    ...fs,
    promises: {
      ...realFsPromises,
      cp: vi.fn(),
      mkdir: vi.fn(),
      mkdtemp: vi.fn().mockImplementation(realFsPromises.mkdtemp),
      rm: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

vi.mock('simple-git');
vi.mock('../../config/extension.js', async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    loadExtension: vi.fn(),
    loadExtensionsFromDir: vi.fn(),
  };
});

describe('extensions install command', () => {
  let tempHomeDir: string;
  let parser: yargs.Argv;
  const tempExtensionPath = '/tmp/gemini-extension';

  beforeEach(() => {
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.mocked(loadExtensionsFromDir).mockReturnValue([]);

    parser = yargs([]).command(installCommand);
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it('should install an extension from a git url', async () => {
    const mockedSimpleGit = simpleGit as vi.MockedFunction<typeof simpleGit>;
    mockedSimpleGit.mockReturnValue({
      clone: vi.fn().mockResolvedValue(undefined),
    } as unknown as SimpleGit);

    const mockedLoadExtension = loadExtension as vi.MockedFunction<
      typeof loadExtension
    >;
    mockedLoadExtension.mockReturnValue({
      path: tempExtensionPath,
      config: { name: 'my-extension', version: '1.0.0' },
      contextFiles: [],
    });

    await parser.parseAsync(
      'install https://github.com/google/gemini-hello-world.git',
    );

    const extensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    const extensionDir = path.join(extensionsDir, 'my-extension');
    const metadataPath = path.join(extensionDir, INSTALL_METADATA_FILENAME);

    expect(simpleGit().clone).toHaveBeenCalledWith(
      'https://github.com/google/gemini-hello-world.git',
      expect.any(String),
      ['--depth', '1'],
    );
    expect(loadExtension).toHaveBeenCalledWith(
      expect.stringContaining(tempExtensionPath),
    );
    expect(fs.existsSync(extensionDir)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(true);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    expect(metadata).toEqual({
      source: 'https://github.com/google/gemini-hello-world.git',
      type: 'git',
    });
  });

  it('should install an extension from a local path', async () => {
    const localExtensionPath = path.join(tempHomeDir, 'my-local-extension');
    fs.mkdirSync(localExtensionPath);

    const mockedLoadExtension = loadExtension as vi.MockedFunction<
      typeof loadExtension
    >;
    mockedLoadExtension.mockReturnValue({
      path: localExtensionPath,
      config: { name: 'my-local-extension', version: '1.0.0' },
      contextFiles: [],
    });

    await parser.parseAsync(`install --path ${localExtensionPath}`);

    const extensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    const extensionDir = path.join(extensionsDir, 'my-local-extension');
    const metadataPath = path.join(extensionDir, INSTALL_METADATA_FILENAME);

    expect(loadExtension).toHaveBeenCalledWith(localExtensionPath);
    expect(fs.existsSync(extensionDir)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(true);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    expect(metadata).toEqual({
      source: localExtensionPath,
      type: 'local',
    });
  });

  it('should fail if the extension is already installed', async () => {
    const mockedSimpleGit = simpleGit as vi.MockedFunction<typeof simpleGit>;
    mockedSimpleGit.mockReturnValue({
      clone: vi.fn().mockResolvedValue(undefined),
    } as unknown as SimpleGit);

    const mockedLoadExtension = loadExtension as vi.MockedFunction<
      typeof loadExtension
    >;
    mockedLoadExtension.mockReturnValue({
      path: tempExtensionPath,
      config: { name: 'my-extension', version: '1.0.0' },
      contextFiles: [],
    });
    const mockedLoadExtensionsFromDir =
      loadExtensionsFromDir as vi.MockedFunction<typeof loadExtensionsFromDir>;
    mockedLoadExtensionsFromDir.mockReturnValue([
      {
        path: '/path/to/installed/extension',
        config: { name: 'my-extension', version: '1.0.0' },
        contextFiles: [],
      },
    ]);

    await expect(
      parser.parseAsync(
        'install https://github.com/google/gemini-hello-world.git',
      ),
    ).rejects.toThrow(
      'Error: Extension "my-extension" is already installed. Please uninstall it first.',
    );
  });

  it('should fail if gemini-extension.json is not found', async () => {
    const mockedSimpleGit = simpleGit as vi.MockedFunction<typeof simpleGit>;
    mockedSimpleGit.mockReturnValue({
      clone: vi.fn().mockResolvedValue(undefined),
    } as unknown as SimpleGit);

    const mockedLoadExtension = loadExtension as vi.MockedFunction<
      typeof loadExtension
    >;
    mockedLoadExtension.mockReturnValue(null);

    await expect(
      parser.parseAsync(
        'install https://github.com/google/gemini-hello-world.git',
      ),
    ).rejects.toThrow(
      `Invalid extension at https://github.com/google/gemini-hello-world.git. Please make sure it has a valid gemini-extension.json file.`,
    );
  });

  it('should overwrite an existing .gemini-extension-install.json from the source', async () => {
    const localExtensionPath = path.join(tempHomeDir, 'my-local-extension');
    fs.mkdirSync(localExtensionPath);
    fs.writeFileSync(
      path.join(localExtensionPath, INSTALL_METADATA_FILENAME),
      JSON.stringify({ source: 'old', type: 'local' }),
    );

    const mockedLoadExtension = loadExtension as vi.MockedFunction<
      typeof loadExtension
    >;
    mockedLoadExtension.mockReturnValue({
      path: localExtensionPath,
      config: { name: 'my-local-extension', version: '1.0.0' },
      contextFiles: [],
    });

    await parser.parseAsync(`install --path ${localExtensionPath}`);

    const extensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    const extensionDir = path.join(extensionsDir, 'my-local-extension');
    const metadataPath = path.join(extensionDir, INSTALL_METADATA_FILENAME);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    expect(metadata).toEqual({
      source: localExtensionPath,
      type: 'local',
    });
  });

  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() => validationParser.parse('install')).toThrow(
      'You must specify a source Git URL or a local path.',
    );
  });

  it('should fail if both git source and local path are provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() =>
      validationParser.parse('install some-url --path /some/path'),
    ).toThrow('You cannot specify both a source Git URL and a local path.');
  });
});
