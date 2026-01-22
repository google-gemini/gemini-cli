/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { configureCommand } from './configure.js';
import yargs from 'yargs';
import { debugLogger } from '@google/gemini-cli-core';
import {
  updateSetting,
  promptForSetting,
  getScopedEnvContents,
  type ExtensionSetting,
} from '../../config/extensions/extensionSettings.js';
import prompts from 'prompts';

const {
  mockExtensionManager,
  mockGetExtensionAndManager,
  mockGetExtensionManager,
  mockLoadSettings,
} = vi.hoisted(() => {
  const extensionManager = {
    loadExtensionConfig: vi.fn(),
    getExtensions: vi.fn(),
    loadExtensions: vi.fn(),
    getSettings: vi.fn(),
  };
  return {
    mockExtensionManager: extensionManager,
    mockGetExtensionAndManager: vi.fn(),
    mockGetExtensionManager: vi.fn(),
    mockLoadSettings: vi.fn().mockReturnValue({ merged: {} }),
  };
});

vi.mock('../../config/extension-manager.js', () => ({
  ExtensionManager: vi.fn().mockImplementation(() => mockExtensionManager),
}));

vi.mock('../../config/extensions/extensionSettings.js', () => ({
  updateSetting: vi.fn(),
  promptForSetting: vi.fn(),
  getScopedEnvContents: vi.fn(),
  ExtensionSettingScope: {
    USER: 'user',
    WORKSPACE: 'workspace',
  },
}));

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  getExtensionAndManager: mockGetExtensionAndManager,
  getExtensionManager: mockGetExtensionManager,
}));

vi.mock('prompts');

vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: vi.fn(),
}));

import { ExtensionManager } from '../../config/extension-manager.js';

vi.mock('../../config/settings.js', () => ({
  loadSettings: mockLoadSettings,
}));

describe('extensions configure command', () => {
  beforeEach(() => {
    vi.spyOn(debugLogger, 'log');
    vi.spyOn(debugLogger, 'error');
    vi.clearAllMocks();

    // Default behaviors
    mockLoadSettings.mockReturnValue({ merged: {} });
    mockGetExtensionAndManager.mockResolvedValue({
      extension: null,
      extensionManager: null,
    });
    mockGetExtensionManager.mockResolvedValue(mockExtensionManager);
    (ExtensionManager as unknown as Mock).mockImplementation(
      () => mockExtensionManager,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runCommand = async (command: string) => {
    const parser = yargs().command(configureCommand).help(false).version(false);
    await parser.parse(command);
  };

  const setupExtension = (
    name: string,
    settings: Array<Partial<ExtensionSetting>> = [],
    id = 'test-id',
    path = '/test/path',
  ) => {
    const extension = { name, path, id };
    mockGetExtensionAndManager.mockImplementation(async (n) => {
      if (n === name)
        return { extension, extensionManager: mockExtensionManager };
      return { extension: null, extensionManager: null };
    });

    mockExtensionManager.getExtensions.mockReturnValue([extension]);
    mockExtensionManager.loadExtensionConfig.mockResolvedValue({
      name,
      settings,
    });
    return extension;
  };

  describe('Specific setting configuration', () => {
    it('should configure a specific setting', async () => {
      setupExtension('test-ext', [
        { name: 'Test Setting', envVar: 'TEST_VAR' },
      ]);
      (updateSetting as Mock).mockResolvedValue(undefined);

      await runCommand('config test-ext TEST_VAR');

      expect(updateSetting).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-ext' }),
        'test-id',
        'TEST_VAR',
        promptForSetting,
        'user',
      );
    });

    it('should handle missing extension', async () => {
      mockGetExtensionAndManager.mockResolvedValue({
        extension: null,
        extensionManager: null,
      });

      await runCommand('config missing-ext TEST_VAR');

      expect(updateSetting).not.toHaveBeenCalled();
    });

    it('should reject invalid extension names', async () => {
      await runCommand('config ../invalid TEST_VAR');
      expect(debugLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid extension name'),
      );

      await runCommand('config ext/with/slash TEST_VAR');
      expect(debugLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid extension name'),
      );
    });
  });

  describe('Extension configuration (all settings)', () => {
    it('should configure all settings for an extension', async () => {
      const settings = [{ name: 'Setting 1', envVar: 'VAR_1' }];
      setupExtension('test-ext', settings);
      (getScopedEnvContents as Mock).mockResolvedValue({});
      (updateSetting as Mock).mockResolvedValue(undefined);

      await runCommand('config test-ext');

      expect(debugLogger.log).toHaveBeenCalledWith(
        'Configuring settings for "test-ext"...',
      );
      expect(updateSetting).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-ext' }),
        'test-id',
        'VAR_1',
        promptForSetting,
        'user',
      );
    });

    it('should verify overwrite if setting is already set', async () => {
      const settings = [{ name: 'Setting 1', envVar: 'VAR_1' }];
      setupExtension('test-ext', settings);
      (getScopedEnvContents as Mock).mockImplementation(
        async (_config, _id, scope) => {
          if (scope === 'user') return { VAR_1: 'existing' };
          return {};
        },
      );
      (prompts as unknown as Mock).mockResolvedValue({ overwrite: true });
      (updateSetting as Mock).mockResolvedValue(undefined);

      await runCommand('config test-ext');

      expect(prompts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'confirm',
          message: expect.stringContaining('is already set. Overwrite?'),
        }),
      );
      expect(updateSetting).toHaveBeenCalled();
    });

    it('should note if setting is configured in workspace', async () => {
      const settings = [{ name: 'Setting 1', envVar: 'VAR_1' }];
      setupExtension('test-ext', settings);
      (getScopedEnvContents as Mock).mockImplementation(
        async (_config, _id, scope) => {
          if (scope === 'workspace') return { VAR_1: 'workspace_value' };
          return {};
        },
      );
      (updateSetting as Mock).mockResolvedValue(undefined);

      await runCommand('config test-ext');

      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('is already configured in the workspace scope'),
      );
    });

    it('should skip update if user denies overwrite', async () => {
      const settings = [{ name: 'Setting 1', envVar: 'VAR_1' }];
      setupExtension('test-ext', settings);
      (getScopedEnvContents as Mock).mockResolvedValue({ VAR_1: 'existing' });
      (prompts as unknown as Mock).mockResolvedValue({ overwrite: false });

      await runCommand('config test-ext');

      expect(prompts).toHaveBeenCalled();
      expect(updateSetting).not.toHaveBeenCalled();
    });
  });

  describe('Configure all extensions', () => {
    it('should configure settings for all installed extensions', async () => {
      const ext1 = {
        name: 'ext1',
        path: '/p1',
        id: 'id1',
        settings: [{ envVar: 'V1' }],
      };
      const ext2 = {
        name: 'ext2',
        path: '/p2',
        id: 'id2',
        settings: [{ envVar: 'V2' }],
      };
      mockExtensionManager.getExtensions.mockReturnValue([ext1, ext2]);

      mockExtensionManager.loadExtensionConfig.mockImplementation(
        async (path) => {
          if (path === '/p1')
            return { name: 'ext1', settings: [{ name: 'S1', envVar: 'V1' }] };
          if (path === '/p2')
            return { name: 'ext2', settings: [{ name: 'S2', envVar: 'V2' }] };
          return null;
        },
      );

      (getScopedEnvContents as Mock).mockResolvedValue({});
      (updateSetting as Mock).mockResolvedValue(undefined);

      await runCommand('config');

      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Configuring settings for "ext1"'),
      );
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Configuring settings for "ext2"'),
      );
      expect(updateSetting).toHaveBeenCalledTimes(2);
    });

    it('should log if no extensions installed', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([]);
      await runCommand('config');
      expect(debugLogger.log).toHaveBeenCalledWith('No extensions installed.');
    });
  });
});
