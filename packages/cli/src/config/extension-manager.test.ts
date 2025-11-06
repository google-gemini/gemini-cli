/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock OS and FS before importing modules that use them
vi.mock('node:fs');
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn(() => '/mock/home/user'),
  };
});
vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(() => ({ isTrusted: true })),
  loadTrustedFolders: vi.fn(() => []),
  TrustLevel: { Full: 'full', Partial: 'partial' },
}));
vi.mock('./extensions/github.js');

import { ExtensionManager } from './extension-manager.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtensionStorage } from './extensions/storage.js';
import { EXTENSION_CONFIG_SETTINGS_FILENAME } from './extensions/variables.js';
import type { Settings } from './settings.js';

describe('ExtensionManager', () => {
  let extensionManager: ExtensionManager;
  const mockRequestConsent = vi.fn();
  const mockRequestSetting = vi.fn();

  beforeEach(() => {
    extensionManager = new ExtensionManager({
      settings: {} as Settings,
      requestConsent: mockRequestConsent,
      requestSetting: mockRequestSetting,
      workspaceDir: '/test/workspace',
    });
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        name: 'test-extension',
        version: '1.0.0',
        context: {
          includeDirectories: ['test'],
        },
        hooks: {
          beforeTool: 'echo "test"',
        },
      }),
    );
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write settings to extension-settings.json on install', async () => {
    mockRequestConsent.mockResolvedValue(true);
    const installMetadata = {
      source: '/test/extension',
      type: 'local' as const,
    };

    // Load extensions first (required before install/update)
    await extensionManager.loadExtensions();

    await extensionManager.installOrUpdateExtension(installMetadata);

    const expectedSettings = {
      context: {
        includeDirectories: ['test'],
      },
      hooks: {
        beforeTool: 'echo "test"',
      },
    };
    const extensionDir = new ExtensionStorage(
      'test-extension',
    ).getExtensionDir();
    const settingsPath = path.join(
      extensionDir,
      EXTENSION_CONFIG_SETTINGS_FILENAME,
    );

    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      settingsPath,
      JSON.stringify(expectedSettings, null, 2),
    );
  });
});
