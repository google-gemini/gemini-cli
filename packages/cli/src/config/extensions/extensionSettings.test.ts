/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  getEnvContents,
  maybePromptForSettings,
  promptForSetting,
  type ExtensionSetting,
  updateSetting,
  ExtensionSettingScope,
  getScopedEnvContents,
} from './extensionSettings.js';
import type { ExtensionConfig } from '../extension.js';
import { ExtensionStorage } from './storage.js';
import prompts from 'prompts';
import * as fsPromises from 'node:fs/promises';
import * as fs from 'node:fs';
import { KeychainTokenStorage } from '@google/gemini-cli-core';
import { EXTENSION_SETTINGS_FILENAME } from './variables.js';

vi.mock('prompts');
vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    KeychainTokenStorage: vi.fn(),
  };
});

describe('extensionSettings', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let extensionDir: string;
  let mockKeychainData: Record<string, Record<string, string>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKeychainData = {};
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
    tempHomeDir = os.tmpdir() + path.sep + `gemini-cli-test-home-${Date.now()}`;
    tempWorkspaceDir = path.join(
      os.tmpdir(),
      `gemini-cli-test-workspace-${Date.now()}`,
    );
    extensionDir = path.join(tempHomeDir, '.gemini', 'extensions', 'test-ext');
    // Spy and mock the method, but also create the directory so we can write to it.
    vi.spyOn(ExtensionStorage.prototype, 'getExtensionDir').mockReturnValue(
      extensionDir,
    );
    fs.mkdirSync(extensionDir, { recursive: true });
    fs.mkdirSync(tempWorkspaceDir, { recursive: true });
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
    vi.mocked(prompts).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('maybePromptForSettings', () => {
    const mockRequestSetting = vi.fn(
      async (setting: ExtensionSetting) => `mock-${setting.envVar}`,
    );

    beforeEach(() => {
      mockRequestSetting.mockClear();
    });

    it('should do nothing if settings are undefined', async () => {
      const config: ExtensionConfig = { name: 'test-ext', version: '1.0.0' };
      await maybePromptForSettings(
        config,
        '12345',
        mockRequestSetting,
        undefined,
        undefined,
      );
      expect(mockRequestSetting).not.toHaveBeenCalled();
    });

    it('should do nothing if settings are empty', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [],
      };
      await maybePromptForSettings(
        config,
        '12345',
        mockRequestSetting,
        undefined,
        undefined,
      );
      expect(mockRequestSetting).not.toHaveBeenCalled();
    });

    it('should prompt for all settings if there is no previous config', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2' },
        ],
      };
      await maybePromptForSettings(
        config,
        '12345',
        mockRequestSetting,
        undefined,
        undefined,
      );
      expect(mockRequestSetting).toHaveBeenCalledTimes(2);
      expect(mockRequestSetting).toHaveBeenCalledWith(config.settings![0]);
      expect(mockRequestSetting).toHaveBeenCalledWith(config.settings![1]);
    });

    it('should only prompt for new settings', async () => {
      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'VAR1' }],
      };
      const newConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2' },
        ],
      };
      const previousSettings = { VAR1: 'previous-VAR1' };

      await maybePromptForSettings(
        newConfig,
        '12345',
        mockRequestSetting,
        previousConfig,
        previousSettings,
      );

      expect(mockRequestSetting).toHaveBeenCalledTimes(1);
      expect(mockRequestSetting).toHaveBeenCalledWith(newConfig.settings![1]);

      const expectedEnvPath = path.join(extensionDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      const expectedContent = 'VAR1=previous-VAR1\nVAR2=mock-VAR2\n';
      expect(actualContent).toBe(expectedContent);
    });

    it('should clear settings if new config has no settings', async () => {
      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          {
            name: 's2',
            description: 'd2',
            envVar: 'SENSITIVE_VAR',
            sensitive: true,
          },
        ],
      };
      const newConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [],
      };
      const previousSettings = {
        VAR1: 'previous-VAR1',
        SENSITIVE_VAR: 'secret',
      };
      const userKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext 12345`,
      );
      await userKeychain.setSecret('SENSITIVE_VAR', 'secret');
      const envPath = path.join(extensionDir, '.env');
      await fsPromises.writeFile(envPath, 'VAR1=previous-VAR1');

      await maybePromptForSettings(
        newConfig,
        '12345',
        mockRequestSetting,
        previousConfig,
        previousSettings,
      );

      expect(mockRequestSetting).not.toHaveBeenCalled();
      const actualContent = await fsPromises.readFile(envPath, 'utf-8');
      expect(actualContent).toBe('');
      expect(await userKeychain.getSecret('SENSITIVE_VAR')).toBeNull();
    });

    it('should remove sensitive settings from keychain', async () => {
      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          {
            name: 's1',
            description: 'd1',
            envVar: 'SENSITIVE_VAR',
            sensitive: true,
          },
        ],
      };
      const newConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [],
      };
      const previousSettings = { SENSITIVE_VAR: 'secret' };
      const userKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext 12345`,
      );
      await userKeychain.setSecret('SENSITIVE_VAR', 'secret');

      await maybePromptForSettings(
        newConfig,
        '12345',
        mockRequestSetting,
        previousConfig,
        previousSettings,
      );

      expect(await userKeychain.getSecret('SENSITIVE_VAR')).toBeNull();
    });

    it('should remove settings that are no longer in the config', async () => {
      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2' },
        ],
      };
      const newConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'VAR1' }],
      };
      const previousSettings = {
        VAR1: 'previous-VAR1',
        VAR2: 'previous-VAR2',
      };

      await maybePromptForSettings(
        newConfig,
        '12345',
        mockRequestSetting,
        previousConfig,
        previousSettings,
      );

      expect(mockRequestSetting).not.toHaveBeenCalled();

      const expectedEnvPath = path.join(extensionDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      const expectedContent = 'VAR1=previous-VAR1\n';
      expect(actualContent).toBe(expectedContent);
    });

    it('should reprompt if a setting changes sensitivity', async () => {
      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1', sensitive: false },
        ],
      };
      const newConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1', sensitive: true },
        ],
      };
      const previousSettings = { VAR1: 'previous-VAR1' };

      await maybePromptForSettings(
        newConfig,
        '12345',
        mockRequestSetting,
        previousConfig,
        previousSettings,
      );

      expect(mockRequestSetting).toHaveBeenCalledTimes(1);
      expect(mockRequestSetting).toHaveBeenCalledWith(newConfig.settings![0]);

      // The value should now be in keychain, not the .env file.
      const expectedEnvPath = path.join(extensionDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      expect(actualContent).toBe('');
    });

    it('should not prompt if settings are identical', async () => {
      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2' },
        ],
      };
      const newConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2' },
        ],
      };
      const previousSettings = {
        VAR1: 'previous-VAR1',
        VAR2: 'previous-VAR2',
      };

      await maybePromptForSettings(
        newConfig,
        '12345',
        mockRequestSetting,
        previousConfig,
        previousSettings,
      );

      expect(mockRequestSetting).not.toHaveBeenCalled();
      const expectedEnvPath = path.join(extensionDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      const expectedContent = 'VAR1=previous-VAR1\nVAR2=previous-VAR2\n';
      expect(actualContent).toBe(expectedContent);
    });

    it('should wrap values with spaces in quotes', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'VAR1' }],
      };
      mockRequestSetting.mockResolvedValue('a value with spaces');

      await maybePromptForSettings(
        config,
        '12345',
        mockRequestSetting,
        undefined,
        undefined,
      );

      const expectedEnvPath = path.join(extensionDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      expect(actualContent).toBe('VAR1="a value with spaces"\n');
    });

    it('should not attempt to clear secrets if keychain is unavailable', async () => {
      // Arrange
      const mockIsAvailable = vi.fn().mockResolvedValue(false);
      const mockListSecrets = vi.fn();

      vi.mocked(KeychainTokenStorage).mockImplementation(
        () =>
          ({
            isAvailable: mockIsAvailable,
            listSecrets: mockListSecrets,
            deleteSecret: vi.fn(),
            getSecret: vi.fn(),
            setSecret: vi.fn(),
          }) as unknown as KeychainTokenStorage,
      );

      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [], // Empty settings triggers clearSettings
      };

      const previousConfig: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [{ name: 's1', description: 'd1', envVar: 'VAR1' }],
      };

      // Act
      await maybePromptForSettings(
        config,
        '12345',
        mockRequestSetting,
        previousConfig,
        undefined,
      );

      // Assert
      expect(mockIsAvailable).toHaveBeenCalled();
      expect(mockListSecrets).not.toHaveBeenCalled();
    });
  });

  describe('promptForSetting', () => {
    it.each([
      {
        description:
          'should use prompts with type "password" for sensitive settings',
        setting: {
          name: 'API Key',
          description: 'Your secret key',
          envVar: 'API_KEY',
          sensitive: true,
        },
        expectedType: 'password',
        promptValue: 'secret-key',
      },
      {
        description:
          'should use prompts with type "text" for non-sensitive settings',
        setting: {
          name: 'Username',
          description: 'Your public username',
          envVar: 'USERNAME',
          sensitive: false,
        },
        expectedType: 'text',
        promptValue: 'test-user',
      },
      {
        description: 'should default to "text" if sensitive is undefined',
        setting: {
          name: 'Username',
          description: 'Your public username',
          envVar: 'USERNAME',
        },
        expectedType: 'text',
        promptValue: 'test-user',
      },
    ])('$description', async ({ setting, expectedType, promptValue }) => {
      vi.mocked(prompts).mockResolvedValue({ value: promptValue });

      const result = await promptForSetting(setting as ExtensionSetting);

      expect(prompts).toHaveBeenCalledWith({
        type: expectedType,
        name: 'value',
        message: `${setting.name}\n${setting.description}`,
      });
      expect(result).toBe(promptValue);
    });

    it('should return undefined if the user cancels the prompt', async () => {
      vi.mocked(prompts).mockResolvedValue({ value: undefined });
      const result = await promptForSetting({
        name: 'Test',
        description: 'Test desc',
        envVar: 'TEST_VAR',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('getScopedEnvContents', () => {
    const config: ExtensionConfig = {
      name: 'test-ext',
      version: '1.0.0',
      settings: [
        { name: 's1', description: 'd1', envVar: 'VAR1' },
        {
          name: 's2',
          description: 'd2',
          envVar: 'SENSITIVE_VAR',
          sensitive: true,
        },
      ],
    };
    const extensionId = '12345';

    it('should return combined contents from user .env and keychain for USER scope', async () => {
      const userEnvPath = path.join(extensionDir, EXTENSION_SETTINGS_FILENAME);
      await fsPromises.writeFile(userEnvPath, 'VAR1=user-value1');
      const userKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext 12345`,
      );
      await userKeychain.setSecret('SENSITIVE_VAR', 'user-secret');

      const contents = await getScopedEnvContents(
        config,
        extensionId,
        ExtensionSettingScope.USER,
        tempWorkspaceDir,
      );

      expect(contents).toEqual({
        VAR1: 'user-value1',
        SENSITIVE_VAR: 'user-secret',
      });
    });

    it('should return combined contents from workspace .env and keychain for WORKSPACE scope', async () => {
      const workspaceEnvPath = path.join(
        tempWorkspaceDir,
        EXTENSION_SETTINGS_FILENAME,
      );
      await fsPromises.writeFile(workspaceEnvPath, 'VAR1=workspace-value1');
      const workspaceKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext 12345 ${tempWorkspaceDir}`,
      );
      await workspaceKeychain.setSecret('SENSITIVE_VAR', 'workspace-secret');

      const contents = await getScopedEnvContents(
        config,
        extensionId,
        ExtensionSettingScope.WORKSPACE,
        tempWorkspaceDir,
      );

      expect(contents).toEqual({
        VAR1: 'workspace-value1',
        SENSITIVE_VAR: 'workspace-secret',
      });
    });
  });

  describe('getEnvContents (merged)', () => {
    const config: ExtensionConfig = {
      name: 'test-ext',
      version: '1.0.0',
      settings: [
        { name: 's1', description: 'd1', envVar: 'VAR1' },
        { name: 's2', description: 'd2', envVar: 'VAR2', sensitive: true },
        { name: 's3', description: 'd3', envVar: 'VAR3' },
      ],
    };
    const extensionId = '12345';

    it('should merge user and workspace settings, with workspace taking precedence', async () => {
      // User settings
      const userEnvPath = path.join(extensionDir, EXTENSION_SETTINGS_FILENAME);
      await fsPromises.writeFile(
        userEnvPath,
        'VAR1=user-value1\nVAR3=user-value3',
      );
      const userKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext ${extensionId}`,
      );
      await userKeychain.setSecret('VAR2', 'user-secret2');

      // Workspace settings
      const workspaceEnvPath = path.join(
        tempWorkspaceDir,
        EXTENSION_SETTINGS_FILENAME,
      );
      await fsPromises.writeFile(workspaceEnvPath, 'VAR1=workspace-value1');
      const workspaceKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext ${extensionId} ${tempWorkspaceDir}`,
      );
      await workspaceKeychain.setSecret('VAR2', 'workspace-secret2');

      const contents = await getEnvContents(
        config,
        extensionId,
        tempWorkspaceDir,
      );

      expect(contents).toEqual({
        VAR1: 'workspace-value1',
        VAR2: 'workspace-secret2',
        VAR3: 'user-value3',
      });
    });
  });

  describe('updateSetting', () => {
    const config: ExtensionConfig = {
      name: 'test-ext',
      version: '1.0.0',
      settings: [
        { name: 's1', description: 'd1', envVar: 'VAR1' },
        { name: 's2', description: 'd2', envVar: 'VAR2', sensitive: true },
      ],
    };
    const mockRequestSetting = vi.fn();

    beforeEach(async () => {
      const userEnvPath = path.join(extensionDir, '.env');
      await fsPromises.writeFile(userEnvPath, 'VAR1=value1\n');
      const userKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext 12345`,
      );
      await userKeychain.setSecret('VAR2', 'value2');
      mockRequestSetting.mockClear();
    });

    it('should update a non-sensitive setting in USER scope', async () => {
      mockRequestSetting.mockResolvedValue('new-value1');

      await updateSetting(
        config,
        '12345',
        'VAR1',
        mockRequestSetting,
        ExtensionSettingScope.USER,
        tempWorkspaceDir,
      );

      const expectedEnvPath = path.join(extensionDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      expect(actualContent).toContain('VAR1=new-value1');
    });

    it('should update a non-sensitive setting in WORKSPACE scope', async () => {
      mockRequestSetting.mockResolvedValue('new-workspace-value');

      await updateSetting(
        config,
        '12345',
        'VAR1',
        mockRequestSetting,
        ExtensionSettingScope.WORKSPACE,
        tempWorkspaceDir,
      );

      const expectedEnvPath = path.join(tempWorkspaceDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      expect(actualContent).toContain('VAR1=new-workspace-value');
    });

    it('should update a sensitive setting in USER scope', async () => {
      mockRequestSetting.mockResolvedValue('new-value2');

      await updateSetting(
        config,
        '12345',
        'VAR2',
        mockRequestSetting,
        ExtensionSettingScope.USER,
        tempWorkspaceDir,
      );

      const userKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext 12345`,
      );
      expect(await userKeychain.getSecret('VAR2')).toBe('new-value2');
    });

    it('should update a sensitive setting in WORKSPACE scope', async () => {
      mockRequestSetting.mockResolvedValue('new-workspace-secret');

      await updateSetting(
        config,
        '12345',
        'VAR2',
        mockRequestSetting,
        ExtensionSettingScope.WORKSPACE,
        tempWorkspaceDir,
      );

      const workspaceKeychain = new KeychainTokenStorage(
        `Gemini CLI Extensions test-ext 12345 ${tempWorkspaceDir}`,
      );
      expect(await workspaceKeychain.getSecret('VAR2')).toBe(
        'new-workspace-secret',
      );
    });

    it('should leave existing, unmanaged .env variables intact when updating in WORKSPACE scope', async () => {
      // Setup a pre-existing .env file in the workspace with unmanaged variables
      const workspaceEnvPath = path.join(tempWorkspaceDir, '.env');
      const originalEnvContent =
        'PROJECT_VAR_1=value_1\nPROJECT_VAR_2=value_2\nVAR1=original-value'; // VAR1 is managed by extension
      await fsPromises.writeFile(workspaceEnvPath, originalEnvContent);

      // Simulate updating an extension-managed non-sensitive setting
      mockRequestSetting.mockResolvedValue('updated-value');
      await updateSetting(
        config,
        '12345',
        'VAR1',
        mockRequestSetting,
        ExtensionSettingScope.WORKSPACE,
        tempWorkspaceDir,
      );

      // Read the .env file after update
      const actualContent = await fsPromises.readFile(
        workspaceEnvPath,
        'utf-8',
      );

      // Assert that original variables are intact and extension variable is updated
      expect(actualContent).toContain('PROJECT_VAR_1=value_1');
      expect(actualContent).toContain('PROJECT_VAR_2=value_2');
      expect(actualContent).toContain('VAR1=updated-value');

      // Ensure no other unexpected changes or deletions
      const lines = actualContent.split('\n').filter((line) => line.length > 0);
      expect(lines).toHaveLength(3); // Should only have the three variables
    });
  });
});
