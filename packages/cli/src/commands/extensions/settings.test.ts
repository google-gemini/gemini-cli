/**
 * @license
 * Copyright 2025 Google LLC
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
import { settingsCommand } from './settings.js';
import yargs from 'yargs';
import { debugLogger, type GeminiCLIExtension } from '@google/gemini-cli-core';
import type { getExtensionAndManager } from './utils.js';
import type {
  updateSetting,
  getScopedEnvContents,
} from '../../config/extensions/extensionSettings.js';
import {
  promptForSetting,
  ExtensionSettingScope,
} from '../../config/extensions/extensionSettings.js';
import type { exitCli } from '../utils.js';
import type { ExtensionManager } from '../../config/extension-manager.js';

const mockGetExtensionAndManager: Mock<typeof getExtensionAndManager> =
  vi.hoisted(() => vi.fn());
const mockUpdateSetting: Mock<typeof updateSetting> = vi.hoisted(() => vi.fn());
const mockGetScopedEnvContents: Mock<typeof getScopedEnvContents> = vi.hoisted(
  () => vi.fn(),
);
const mockExitCli: Mock<typeof exitCli> = vi.hoisted(() => vi.fn());

vi.mock('./utils.js', () => ({
  getExtensionAndManager: mockGetExtensionAndManager,
}));

vi.mock('../../config/extensions/extensionSettings.js', () => ({
  updateSetting: mockUpdateSetting,
  promptForSetting: vi.fn(),
  ExtensionSettingScope: {
    USER: 'user',
    WORKSPACE: 'workspace',
  },
  getScopedEnvContents: mockGetScopedEnvContents,
}));

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils.js', () => ({
  exitCli: mockExitCli,
}));

describe('settings command', () => {
  let debugLogSpy: Mock;
  let debugErrorSpy: Mock;

  beforeEach(() => {
    debugLogSpy = debugLogger.log as Mock;
    debugErrorSpy = debugLogger.error as Mock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('set command', () => {
    it('should log error and exit if extension is not found', async () => {
      mockGetExtensionAndManager.mockResolvedValue({
        extension: null,
        extensionManager: null,
      });

      await yargs([])
        .command(settingsCommand)
        .parseAsync('settings set foo bar');

      expect(mockExitCli).toHaveBeenCalled();
    });

    it('should log error and exit if extension config is not found', async () => {
      const mockExtensionManager = {
        loadExtensionConfig: vi.fn().mockResolvedValue(null),
      } as unknown as ExtensionManager;
      mockGetExtensionAndManager.mockResolvedValue({
        extension: { path: '/path/to/ext' } as unknown as GeminiCLIExtension,
        extensionManager: mockExtensionManager,
      });

      await yargs([])
        .command(settingsCommand)
        .parseAsync('settings set foo bar');

      expect(debugErrorSpy).toHaveBeenCalledWith(
        'Could not find configuration for extension "foo".',
      );
      expect(mockExitCli).toHaveBeenCalled();
    });

    it('should call updateSetting with correct arguments', async () => {
      const mockExtensionManager = {
        loadExtensionConfig: vi.fn().mockResolvedValue({}),
      } as unknown as ExtensionManager;
      const extension = { path: '/path/to/ext', id: 'ext-id' };
      mockGetExtensionAndManager.mockResolvedValue({
        extension: extension as unknown as GeminiCLIExtension,
        extensionManager: mockExtensionManager,
      });

      await yargs([])
        .command(settingsCommand)
        .parseAsync('settings set foo bar --scope workspace');

      expect(mockUpdateSetting).toHaveBeenCalledWith(
        {},
        'ext-id',
        'bar',
        promptForSetting,
        ExtensionSettingScope.WORKSPACE,
      );
      expect(mockExitCli).toHaveBeenCalled();
    });
  });

  describe('list command', () => {
    it('should log error and exit if extension is not found', async () => {
      mockGetExtensionAndManager.mockResolvedValue({
        extension: null,
        extensionManager: null,
      });

      await yargs([]).command(settingsCommand).parseAsync('settings list foo');

      expect(mockExitCli).toHaveBeenCalled();
    });

    it('should log message and exit if extension has no settings', async () => {
      const mockExtensionManager = {
        loadExtensionConfig: vi.fn().mockResolvedValue({ settings: [] }),
      } as unknown as ExtensionManager;
      mockGetExtensionAndManager.mockResolvedValue({
        extension: { path: '/path/to/ext' } as unknown as GeminiCLIExtension,
        extensionManager: mockExtensionManager,
      });

      await yargs([]).command(settingsCommand).parseAsync('settings list foo');

      expect(debugLogSpy).toHaveBeenCalledWith(
        'Extension "foo" has no settings to configure.',
      );
      expect(mockExitCli).toHaveBeenCalled();
    });

    it('should list settings correctly', async () => {
      const mockExtensionManager = {
        loadExtensionConfig: vi.fn().mockResolvedValue({
          settings: [
            {
              name: 'Setting 1',
              envVar: 'SETTING_1',
              description: 'Desc 1',
              sensitive: false,
            },
            {
              name: 'Setting 2',
              envVar: 'SETTING_2',
              description: 'Desc 2',
              sensitive: true,
            },
            {
              name: 'Setting 3',
              envVar: 'SETTING_3',
              description: 'Desc 3',
              sensitive: false,
            },
          ],
        }),
      } as unknown as ExtensionManager;
      const extension = { path: '/path/to/ext', id: 'ext-id' };
      mockGetExtensionAndManager.mockResolvedValue({
        extension: extension as unknown as GeminiCLIExtension,
        extensionManager: mockExtensionManager,
      });

      mockGetScopedEnvContents.mockImplementation((_config, _id, scope) => {
        if (scope === ExtensionSettingScope.USER) {
          return Promise.resolve({
            SETTING_1: 'val1',
            SETTING_2: 'val2',
          });
        }
        if (scope === ExtensionSettingScope.WORKSPACE) {
          return Promise.resolve({
            SETTING_3: 'val3',
          });
        }
        return Promise.resolve({});
      });

      await yargs([]).command(settingsCommand).parseAsync('settings list foo');

      expect(debugLogSpy).toHaveBeenCalledWith('Settings for "foo":');
      // Setting 1 (User)
      expect(debugLogSpy).toHaveBeenCalledWith('\n- Setting 1 (SETTING_1)');
      expect(debugLogSpy).toHaveBeenCalledWith('  Description: Desc 1');
      expect(debugLogSpy).toHaveBeenCalledWith('  Value: val1 (user)');
      // Setting 2 (Sensitive)
      expect(debugLogSpy).toHaveBeenCalledWith('\n- Setting 2 (SETTING_2)');
      expect(debugLogSpy).toHaveBeenCalledWith('  Description: Desc 2');
      expect(debugLogSpy).toHaveBeenCalledWith(
        '  Value: [value stored in keychain] (user)',
      );
      // Setting 3 (Workspace)
      expect(debugLogSpy).toHaveBeenCalledWith('\n- Setting 3 (SETTING_3)');
      expect(debugLogSpy).toHaveBeenCalledWith('  Description: Desc 3');
      expect(debugLogSpy).toHaveBeenCalledWith('  Value: val3 (workspace)');

      expect(mockExitCli).toHaveBeenCalled();
    });
  });
});
