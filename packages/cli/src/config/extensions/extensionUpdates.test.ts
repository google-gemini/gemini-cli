/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { getMissingSettings } from './extensionSettings.js';
import type { ExtensionConfig } from '../extension.js';
import {
  debugLogger,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
  coreEvents,
} from '@google/gemini-cli-core';
import { ExtensionManager } from '../extension-manager.js';
import { createTestMergedSettings } from '../settings.js';

// --- Mocks ---

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal<any>();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(),
      statSync: vi.fn(),
      lstatSync: vi.fn(),
      realpathSync: vi.fn((p) => p),
    },
    existsSync: vi.fn(),
    statSync: vi.fn(),
    lstatSync: vi.fn(),
    realpathSync: vi.fn((p) => p),
    promises: {
      ...actual.promises,
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      rm: vi.fn(),
      cp: vi.fn(),
      readFile: vi.fn(),
    },
  };
});

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
      emitFeedback: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emitConsoleLog: vi.fn(),
    },
    loadSkillsFromDir: vi.fn().mockResolvedValue([]),
    loadAgentsFromDirectory: vi
      .fn()
      .mockResolvedValue({ agents: [], errors: [] }),
    logExtensionInstallEvent: vi.fn().mockResolvedValue(undefined),
    logExtensionUpdateEvent: vi.fn().mockResolvedValue(undefined),
    logExtensionUninstall: vi.fn().mockResolvedValue(undefined),
    logExtensionEnable: vi.fn().mockResolvedValue(undefined),
    logExtensionDisable: vi.fn().mockResolvedValue(undefined),
    Config: vi.fn().mockImplementation(() => ({
      getEnableExtensionReloading: vi.fn().mockReturnValue(true),
    })),
  };
});

vi.mock('./consent.js', () => ({
  maybeRequestConsentOrFail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./extensionSettings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./extensionSettings.js')>();
  return {
    ...actual,
    getEnvContents: vi.fn().mockResolvedValue({}),
    getMissingSettings: vi.fn(), // We will mock this implementation per test
  };
});

vi.mock('../trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn().mockReturnValue({ isTrusted: true }), // Default to trusted to simplify flow
  loadTrustedFolders: vi.fn().mockReturnValue({
    setValue: vi.fn().mockResolvedValue(undefined),
  }),
  TrustLevel: { TRUST_FOLDER: 'TRUST_FOLDER' },
}));

// Mock ExtensionStorage to avoid real FS paths
vi.mock('./storage.js', () => ({
  ExtensionStorage: class {
    constructor(public name: string) {}
    getExtensionDir() {
      return `/mock/extensions/${this.name}`;
    }
    static getUserExtensionsDir() {
      return '/mock/extensions';
    }
    static createTmpDir() {
      return Promise.resolve('/mock/tmp');
    }
  },
}));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof import('node:os')>();
  return {
    ...mockedOs,
    homedir: vi.fn().mockReturnValue('/mock/home'),
  };
});

describe('extensionUpdates', () => {
  let tempWorkspaceDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default fs mocks
    vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined);
    vi.mocked(fs.promises.cp).mockResolvedValue(undefined);

    // Allow directories to exist by default to satisfy Config/WorkspaceContext checks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);

    tempWorkspaceDir = '/mock/workspace';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ExtensionManager integration', () => {
    it('should warn about missing settings after update', async () => {
      // 1. Setup Data
      const newConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.1.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'VAR1' }],
      };

      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [],
      };

      const installMetadata: ExtensionInstallMetadata = {
        source: '/mock/source',
        type: 'local',
        autoUpdate: true,
      };

      // 2. Setup Manager
      const manager = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
        settings: createTestMergedSettings({
          telemetry: { enabled: false },
          experimental: { extensionConfig: true },
        }),
        requestConsent: vi.fn().mockResolvedValue(true),
        requestSetting: null,
      });

      // 3. Mock Internal Manager Methods
      vi.spyOn(manager, 'loadExtensionConfig').mockResolvedValue(newConfig);
      vi.spyOn(manager, 'getExtensions').mockReturnValue([
        {
          name: 'test-ext',
          version: '1.0.0',
          installMetadata,
          path: '/mock/extensions/test-ext',
          contextFiles: [],
          mcpServers: {},
          hooks: undefined,
          isActive: true,
          id: 'test-id',
          settings: [],
          resolvedSettings: [],
          skills: [],
        } as unknown as GeminiCLIExtension,
      ]);
      vi.spyOn(manager, 'uninstallExtension').mockResolvedValue(undefined);
      // Mock loadExtension to return something so the method doesn't crash at the end
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(manager as any, 'loadExtension').mockResolvedValue({
        name: 'test-ext',
        version: '1.1.0',
      } as GeminiCLIExtension);

      // 4. Mock External Helpers
      // This is the key fix: we explicitly mock `getMissingSettings` to return
      // the result we expect, avoiding any real FS or logic execution during the update.
      vi.mocked(getMissingSettings).mockResolvedValue([
        {
          name: 's1',
          description: 'd1',
          envVar: 'VAR1',
        },
      ]);

      // 5. Execute
      await manager.installOrUpdateExtension(installMetadata, previousConfig);

      // 6. Assert
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Extension "test-ext" has missing settings: s1',
        ),
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'Please run "gemini extensions config test-ext [setting-name]"',
        ),
      );
    });
  });
});
