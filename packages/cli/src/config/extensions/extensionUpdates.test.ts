/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { getMissingSettings } from './extensionSettings.js';
import type { ExtensionConfig } from '../extension.js';
import { ExtensionStorage } from './storage.js';
import {
  KeychainTokenStorage,
  debugLogger,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
  coreEvents,
} from '@google/gemini-cli-core';
import { EXTENSION_SETTINGS_FILENAME, EXTENSIONS_CONFIG_FILENAME } from './variables.js';
import { ExtensionManager } from '../extension-manager.js';
import { createTestMergedSettings } from '../settings.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    KeychainTokenStorage: vi.fn(),
    debugLogger: {
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    },
    coreEvents: {
      ...actual.coreEvents,
      emitFeedback: vi.fn(),
    },
  };
});

// Mock os.homedir because ExtensionStorage uses it
vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: vi.fn(),
  };
});

describe('extensionUpdates', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let mockKeychainData: Record<string, Record<string, string>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKeychainData = {};

    // Mock Keychain
    vi.mocked(KeychainTokenStorage).mockImplementation(
      (serviceName: string) => {
        if (!mockKeychainData[serviceName]) {
          mockKeychainData[serviceName] = {};
        }
        const keychainData = mockKeychainData[serviceName];
        return {
          getSecret: vi
            .fn()
            .mockImplementation(
              async (key: string) => keychainData[key] || null,
            ),
          setSecret: vi
            .fn()
            .mockImplementation(async (key: string, value: string) => {
              keychainData[key] = value;
            }),
          deleteSecret: vi.fn().mockImplementation(async (key: string) => {
            delete keychainData[key];
          }),
          listSecrets: vi
            .fn()
            .mockImplementation(async () => Object.keys(keychainData)),
          isAvailable: vi.fn().mockResolvedValue(true),
        } as unknown as KeychainTokenStorage;
      },
    );

    // Setup Temp Dirs
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );

    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createExtension = (config: ExtensionConfig, sourceDir: string) => {
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify(config),
    );
  };

  describe('getMissingSettings', () => {
    it('should return empty list if all settings are present', async () => {
      const extensionName = 'test-ext';
      const config: ExtensionConfig = {
        name: extensionName,
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2', sensitive: true },
        ],
      };
      const extensionId = '12345';

      const extensionStorage = new ExtensionStorage(extensionName);
      const extensionDir = extensionStorage.getExtensionDir();
      fs.mkdirSync(extensionDir, { recursive: true });

      // Setup User Env
      const userEnvPath = extensionStorage.getEnvFilePath();
      fs.writeFileSync(userEnvPath, 'VAR1=val1');

      // Setup Keychain
      const userKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions ${extensionName} ${extensionId}`,
      );
      await userKeychain.setSecret('VAR2', 'val2');

      const missing = await getMissingSettings(
        config,
        extensionId,
        tempWorkspaceDir,
      );
      expect(missing).toEqual([]);
    });

    it('should identify missing non-sensitive settings', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'UNIQUE_VAR_1' }],
      };
      const extensionId = '12345';

      const missing = await getMissingSettings(
        config,
        extensionId,
        tempWorkspaceDir,
      );
      expect(missing).toHaveLength(1);
      expect(missing[0].name).toBe('s1');
    });

    it('should identify missing sensitive settings', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's2', description: 'd2', envVar: 'UNIQUE_VAR_2', sensitive: true },
        ],
      };
      const extensionId = '12345';

      const missing = await getMissingSettings(
        config,
        extensionId,
        tempWorkspaceDir,
      );
      expect(missing).toHaveLength(1);
      expect(missing[0].name).toBe('s2');
    });

    it('should respect settings present in workspace', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'UNIQUE_VAR_3' }],
      };
      const extensionId = '12345';

      // Setup Workspace Env
      const workspaceEnvPath = path.join(
        tempWorkspaceDir,
        EXTENSION_SETTINGS_FILENAME,
      );
      fs.writeFileSync(workspaceEnvPath, 'UNIQUE_VAR_3=val1');

      const missing = await getMissingSettings(
        config,
        extensionId,
        tempWorkspaceDir,
      );
      expect(missing).toEqual([]);
    });
  });

  describe('ExtensionManager integration', () => {
    it('should warn about missing settings after update', async () => {
      const extensionName = 'test-ext';
      const sourceDir = path.join(tempWorkspaceDir, 'test-ext-source');
      const newConfig: ExtensionConfig = {
        name: extensionName,
        version: '1.1.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'UNIQUE_VAR_4' }],
      };

      const previousConfig: ExtensionConfig = {
        name: extensionName,
        version: '1.0.0',
        settings: [],
      };

      createExtension(newConfig, sourceDir);

      const installMetadata: ExtensionInstallMetadata = {
        source: sourceDir,
        type: 'local',
        autoUpdate: true,
      };

      const manager = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
        settings: createTestMergedSettings({
          telemetry: { enabled: false },
          experimental: { extensionConfig: true },
          hooksConfig: { enabled: false },
        }),
        requestConsent: vi.fn().mockResolvedValue(true),
        requestSetting: null,
      });

      // We still need to mock some things because a full "live" load involves many moving parts (themes, MCP, etc.)
      // but we are using much more of the real manager logic.
      vi.spyOn(manager, 'getExtensions').mockReturnValue([
        {
          name: extensionName,
          version: '1.0.0',
          installMetadata,
          path: sourceDir, // Mocking the path to point to our temp source
          isActive: true,
          id: 'test-id',
          settings: [],
          resolvedSettings: [],
          skills: [],
          contextFiles: [],
          mcpServers: {},
        } as unknown as GeminiCLIExtension,
      ]);

      // Mock things that would touch global state or fail in restricted environment
      vi.spyOn(manager as any, 'loadExtension').mockResolvedValue({
        name: extensionName,
        id: 'test-id',
      } as unknown as GeminiCLIExtension);
      vi.spyOn(manager, 'enableExtension').mockResolvedValue(undefined);
      vi.spyOn(manager, 'uninstallExtension').mockResolvedValue(undefined);

      await manager.installOrUpdateExtension(installMetadata, previousConfig);

      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `Extension "${extensionName}" has missing settings: s1`,
        ),
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          `Please run "gemini extensions config ${extensionName} [setting-name]"`,
        ),
      );
    });
  });
});
