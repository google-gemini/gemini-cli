/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExtensionStorage } from './storage.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  EXTENSION_SETTINGS_FILENAME,
  EXTENSIONS_CONFIG_FILENAME,
} from './variables.js';
import { Storage } from '@google/gemini-cli-core';

vi.mock('node:os');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdtemp: vi.fn(),
    },
  };
});
vi.mock('@google/gemini-cli-core');

describe('ExtensionStorage', () => {
  const mockHomeDir = '/mock/home';
  const extensionName = 'test-extension';
  let storage: ExtensionStorage;

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
    vi.mocked(Storage).mockImplementation(
      () =>
        ({
          getExtensionsDir: () =>
            path.join(mockHomeDir, '.gemini', 'extensions'),
        }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    storage = new ExtensionStorage(extensionName);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the correct extension directory', () => {
    const expectedDir = path.join(
      mockHomeDir,
      '.gemini',
      'extensions',
      extensionName,
    );
    expect(storage.getExtensionDir()).toBe(expectedDir);
  });

  it('should return the correct config path', () => {
    const expectedPath = path.join(
      mockHomeDir,
      '.gemini',
      'extensions',
      extensionName,
      EXTENSIONS_CONFIG_FILENAME, // EXTENSIONS_CONFIG_FILENAME
    );
    expect(storage.getConfigPath()).toBe(expectedPath);
  });

  it('should return the correct env file path', () => {
    const expectedPath = path.join(
      mockHomeDir,
      '.gemini',
      'extensions',
      extensionName,
      EXTENSION_SETTINGS_FILENAME, // EXTENSION_SETTINGS_FILENAME
    );
    expect(storage.getEnvFilePath()).toBe(expectedPath);
  });

  it('should return the correct user extensions directory', () => {
    const expectedDir = path.join(mockHomeDir, '.gemini', 'extensions');
    expect(ExtensionStorage.getUserExtensionsDir()).toBe(expectedDir);
  });

  it('should create a temporary directory', async () => {
    const mockTmpDir = '/tmp/gemini-extension-123';
    vi.mocked(fs.promises.mkdtemp).mockResolvedValue(mockTmpDir);
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');

    const result = await ExtensionStorage.createTmpDir();

    expect(fs.promises.mkdtemp).toHaveBeenCalledWith(
      path.join('/tmp', 'gemini-extension'),
    );
    expect(result).toBe(mockTmpDir);
  });
});
