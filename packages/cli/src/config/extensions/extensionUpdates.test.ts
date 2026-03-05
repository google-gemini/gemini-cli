/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

// --- Mocks (Hoisted) ---

const { MockExtensionStorage } = vi.hoisted(() => ({
  MockExtensionStorage: class {
    constructor(public name: string) {}
    getExtensionDir() {
      return `/mock/extensions/${this.name}`;
    }
    static getUserExtensionsDir() {
      return '/mock/extensions';
    }
    static async createTmpDir() {
      return '/mock/tmp';
    }
  },
}));

vi.mock('./storage.js', () => ({
  ExtensionStorage: MockExtensionStorage,
}));

// Now we can import the rest
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
import { updateExtension } from './update.js';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import * as extensionModule from '../extension.js';
import { ExtensionIntegrityManager, IntegrityStatus } from './integrity.js';
import * as trustedFolders from '../trustedFolders.js';

// --- Other Mocks ---

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal<any>();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      statSync: vi.fn(),
      lstatSync: vi.fn(),
      realpathSync: vi.fn((p) => p),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    lstatSync: vi.fn(),
    realpathSync: vi.fn((p) => p),
    promises: {
      ...actual.promises,
      mkdir: vi.fn(),
      readdir: vi.fn(),
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
    applyAdminAllowlist: vi.fn().mockResolvedValue({
      blockedServerNames: [],
    }),
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
    loadExtensionPolicies: vi.fn().mockResolvedValue({
      rules: [],
      checkers: [],
      errors: [],
    }),
    loadAgentsFromDirectory: vi.fn().mockResolvedValue({
      agents: [],
      errors: [],
    }),
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
    getMissingSettings: vi.fn(),
  };
});

vi.mock('../trustedFolders.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../trustedFolders.js')>();
  return {
    ...actual,
    isWorkspaceTrusted: vi.fn(),
  };
});

vi.mock('../extension.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../extension.js')>();
  return {
    ...actual,
    loadInstallMetadata: vi.fn(),
  };
});

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
    vi.mocked(fs.promises.readdir).mockResolvedValue([]);
    vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined);
    vi.mocked(fs.promises.cp).mockResolvedValue(undefined);
    vi.mocked(fs.readFileSync).mockReturnValue('');

    // Allow directories to exist by default to satisfy Config/WorkspaceContext checks
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (
        typeof p === 'string' &&
        (p.endsWith('integrity.key') || p.endsWith('extension_integrity.json'))
      ) {
        return false;
      }
      return true;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);

    vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'mock' as trustedFolders.TrustResult['source'],
    });

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
      await manager.loadExtensions();
      vi.spyOn(manager, 'loadExtensionConfig').mockResolvedValue(newConfig);
      vi.spyOn(manager, 'getExtensions').mockReturnValue([
        {
          name: 'test-ext',
          version: '1.0.0',
          installMetadata,
          path: '/mock/extensions/test-ext',
          isActive: true,
        } as GeminiCLIExtension,
      ]);
      vi.spyOn(manager, 'uninstallExtension').mockResolvedValue(undefined);

      // Mock installOrUpdateExtension to simulate the side effects we want to test
      vi.spyOn(manager, 'installOrUpdateExtension').mockImplementation(
        async () => {
          debugLogger.warn('Extension "test-ext" has missing settings: s1');
          coreEvents.emitFeedback(
            'warning',
            'Please run "gemini extensions config test-ext [setting-name]"',
          );
          return { name: 'test-ext', version: '1.1.0' } as GeminiCLIExtension;
        },
      );

      // Mock storeIntegrity to prevent errors
      vi.spyOn(
        ExtensionIntegrityManager.prototype,
        'storeIntegrity',
      ).mockResolvedValue(undefined);

      // 4. Mock External Helpers
      vi.mocked(getMissingSettings).mockResolvedValue([
        {
          name: 's1',
          description: 'd1',
          envVar: 'VAR1',
        },
      ]);

      // 5. Execute (bypass some internal FS checks)
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue(['test-ext']);

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

  describe('updateExtension integrity', () => {
    it('should throw security alert if integrity verification fails due to tampering', async () => {
      const extension = {
        name: 'tampered-ext',
        path: '/mock/extensions/tampered-ext',
        version: '1.0.0',
      } as GeminiCLIExtension;

      const manager = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
        settings: createTestMergedSettings(),
        requestConsent: vi.fn(),
        requestSetting: null,
      });
      await manager.loadExtensions();

      vi.mocked(extensionModule.loadInstallMetadata).mockReturnValue({
        source: '/mock/source',
        type: 'local',
      });

      const verifyIntegritySpy = vi
        .spyOn(ExtensionIntegrityManager.prototype, 'verifyIntegrity')
        .mockRejectedValue(
          new Error('Extension integrity store has been tampered with!'),
        );

      const dispatch = vi.fn();

      await expect(
        updateExtension(
          extension,
          manager,
          ExtensionUpdateState.UPDATE_AVAILABLE,
          dispatch,
        ),
      ).rejects.toThrow(
        'Security Alert: Extension integrity store has been tampered with!',
      );

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: { name: 'tampered-ext', state: ExtensionUpdateState.ERROR },
      });

      verifyIntegritySpy.mockRestore();
    });

    it('should fail update and instruct to reinstall if integrity is missing', async () => {
      const extension = {
        name: 'new-ext',
        path: '/mock/extensions/new-ext',
        version: '1.0.0',
      } as GeminiCLIExtension;

      const manager = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
        settings: createTestMergedSettings(),
        requestConsent: vi.fn(),
        requestSetting: null,
      });
      await manager.loadExtensions();

      vi.mocked(extensionModule.loadInstallMetadata).mockReturnValue({
        source: '/mock/source',
        type: 'local',
      });

      // Returns NOT_FOUND for missing integrity data
      const verifyIntegritySpy = vi
        .spyOn(ExtensionIntegrityManager.prototype, 'verifyIntegrity')
        .mockResolvedValue(IntegrityStatus.NOT_FOUND);

      const dispatch = vi.fn();

      await expect(
        updateExtension(
          extension,
          manager,
          ExtensionUpdateState.UPDATE_AVAILABLE,
          dispatch,
        ),
      ).rejects.toThrow(
        'Security Alert: No integrity data found for new-ext. To establish trust, please reinstall this extension.',
      );

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: { name: 'new-ext', state: ExtensionUpdateState.ERROR },
      });

      verifyIntegritySpy.mockRestore();
    });
  });
});
