/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  maybePromptForSettings,
  promptForSetting,
  type ExtensionSetting,
} from './extensionSettings.js';
import type { ExtensionConfig } from '../extension.js';
import { ExtensionStorage } from './storage.js';
import prompts from 'prompts';
import * as fsPromises from 'node:fs/promises';
import * as fs from 'node:fs';
import { KeychainTokenStorage } from '@google/gemini-cli-core';

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
    KeychainTokenStorage: vi.fn().mockImplementation(() => ({
      getSecret: vi.fn(),
      setSecret: vi.fn(),
      deleteSecret: vi.fn(),
      listSecrets: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
  };
});

interface MockKeychainStorage {
  getSecret: ReturnType<typeof vi.fn>;
  setSecret: ReturnType<typeof vi.fn>;
  deleteSecret: ReturnType<typeof vi.fn>;
  listSecrets: ReturnType<typeof vi.fn>;
  isAvailable: ReturnType<typeof vi.fn>;
}

describe('extensionSettings', () => {
  let tempHomeDir: string;
  let extensionDir: string;
  let mockKeychainStorage: MockKeychainStorage;
  let keychainData: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    keychainData = {};
    mockKeychainStorage = {
      getSecret: vi
        .fn()
        .mockImplementation(async (key: string) => keychainData[key] || null),
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
    };
    (
      KeychainTokenStorage as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => mockKeychainStorage);

    tempHomeDir = os.tmpdir() + path.sep + `gemini-cli-test-home-${Date.now()}`;
    extensionDir = path.join(tempHomeDir, '.gemini', 'extensions', 'test-ext');
    // Spy and mock the method, but also create the directory so we can write to it.
    vi.spyOn(ExtensionStorage.prototype, 'getExtensionDir').mockReturnValue(
      extensionDir,
    );
    fs.mkdirSync(extensionDir, { recursive: true });
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.mocked(prompts).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
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
  });
});
