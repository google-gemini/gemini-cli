/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
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

vi.mock('prompts');
vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: vi.fn(),
  };
});

describe('extensionSettings', () => {
  let tempHomeDir: string;
  let extensionDir: string;

  beforeEach(() => {
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
      await maybePromptForSettings(config, mockRequestSetting);
      expect(mockRequestSetting).not.toHaveBeenCalled();
    });

    it('should do nothing if settings are empty', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [],
      };
      await maybePromptForSettings(config, mockRequestSetting);
      expect(mockRequestSetting).not.toHaveBeenCalled();
    });

    it('should call requestSetting for each setting', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2' },
        ],
      };
      await maybePromptForSettings(config, mockRequestSetting);
      expect(mockRequestSetting).toHaveBeenCalledTimes(2);
      expect(mockRequestSetting).toHaveBeenCalledWith(config.settings![0]);
      expect(mockRequestSetting).toHaveBeenCalledWith(config.settings![1]);
    });

    it('should write the .env file with the correct content', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [
          { name: 's1', description: 'd1', envVar: 'VAR1' },
          { name: 's2', description: 'd2', envVar: 'VAR2' },
        ],
      };
      await maybePromptForSettings(config, mockRequestSetting);

      const expectedEnvPath = path.join(extensionDir, '.env');
      const actualContent = await fsPromises.readFile(expectedEnvPath, 'utf-8');
      const expectedContent = 'VAR1=mock-VAR1\nVAR2=mock-VAR2\n';

      expect(actualContent).toBe(expectedContent);
    });
  });

  describe('promptForSetting', () => {
    // it('should use prompts with type "password" for sensitive settings', async () => {
    //   const setting: ExtensionSetting = {
    //     name: 'API Key',
    //     description: 'Your secret key',
    //     envVar: 'API_KEY',
    //     sensitive: true,
    //   };
    //   vi.mocked(prompts).mockResolvedValue({ value: 'secret-key' });

    //   const result = await promptForSetting(setting);

    //   expect(prompts).toHaveBeenCalledWith({
    //     type: 'password',
    //     name: 'value',
    //     message: 'API Key\nYour secret key',
    //   });
    //   expect(result).toBe('secret-key');
    // });

    it('should use prompts with type "text" for non-sensitive settings', async () => {
      const setting: ExtensionSetting = {
        name: 'Username',
        description: 'Your public username',
        envVar: 'USERNAME',
        // sensitive: false,
      };
      vi.mocked(prompts).mockResolvedValue({ value: 'test-user' });

      const result = await promptForSetting(setting);

      expect(prompts).toHaveBeenCalledWith({
        type: 'text',
        name: 'value',
        message: 'Username\nYour public username',
      });
      expect(result).toBe('test-user');
    });

    it('should default to "text" if sensitive is undefined', async () => {
      const setting: ExtensionSetting = {
        name: 'Username',
        description: 'Your public username',
        envVar: 'USERNAME',
      };
      vi.mocked(prompts).mockResolvedValue({ value: 'test-user' });

      const result = await promptForSetting(setting);

      expect(prompts).toHaveBeenCalledWith({
        type: 'text',
        name: 'value',
        message: 'Username\nYour public username',
      });
      expect(result).toBe('test-user');
    });
  });
});
