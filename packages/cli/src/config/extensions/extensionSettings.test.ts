/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  maybePromptForSettings,
  promptForSetting,
  type ExtensionSetting,
} from './extensionSettings.js';
import type { ExtensionConfig } from '../extension.js';
import { ExtensionStorage } from '../extension.js';
import prompts from 'prompts';

vi.mock('node:fs/promises');
vi.mock('prompts');

// Mock readline, as it's tricky to test directly
const mockReadline = {
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn((_query, callback) => callback('test-answer')),
    close: vi.fn(),
  }),
};
vi.mock('node:readline', () => ({
  default: mockReadline,
  createInterface: mockReadline.createInterface,
}));

describe('extensionSettings', () => {
  let tempHomeDir: string;
  let extensionDir: string;

  beforeEach(() => {
    tempHomeDir = os.tmpdir() + path.sep + `gemini-cli-test-home-${Date.now()}`;
    extensionDir = path.join(tempHomeDir, '.gemini', 'extensions', 'test-ext');
    vi.spyOn(ExtensionStorage.prototype, 'getExtensionDir').mockReturnValue(
      extensionDir,
    );
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(prompts).mockClear();
    mockReadline.createInterface.mockClear();
  });

  afterEach(() => {
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
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should do nothing if settings are empty', async () => {
      const config: ExtensionConfig = {
        name: 'test-ext',
        version: '1.0.0',
        settings: [],
      };
      await maybePromptForSettings(config, mockRequestSetting);
      expect(mockRequestSetting).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
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
      const expectedContent = 'VAR1=mock-VAR1\nVAR2=mock-VAR2\n';

      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedEnvPath,
        expectedContent,
      );
    });
  });

  describe('promptForSetting', () => {
    it('should use prompts for sensitive settings', async () => {
      const setting: ExtensionSetting = {
        name: 'API Key',
        description: 'Your secret key',
        envVar: 'API_KEY',
        sensitive: true,
      };
      vi.mocked(prompts).mockResolvedValue({ value: 'secret-key' });

      const result = await promptForSetting(setting);

      expect(prompts).toHaveBeenCalledWith({
        type: 'password',
        name: 'value',
        message: 'API Key\nYour secret key',
      });
      expect(result).toBe('secret-key');
      expect(mockReadline.createInterface).not.toHaveBeenCalled();
    });

    it('should use readline for non-sensitive settings', async () => {
      const setting: ExtensionSetting = {
        name: 'Username',
        description: 'Your public username',
        envVar: 'USERNAME',
        sensitive: false,
      };

      const result = await promptForSetting(setting);

      expect(mockReadline.createInterface).toHaveBeenCalled();
      const mockInterface = mockReadline.createInterface.mock.results[0].value;
      expect(mockInterface.question).toHaveBeenCalledWith(
        'Username\nYour public username\n> ',
        expect.any(Function),
      );
      expect(result).toBe('test-answer');
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should default to non-sensitive if sensitive is undefined', async () => {
      const setting: ExtensionSetting = {
        name: 'Username',
        description: 'Your public username',
        envVar: 'USERNAME',
      };

      const result = await promptForSetting(setting);

      expect(mockReadline.createInterface).toHaveBeenCalled();
      expect(result).toBe('test-answer');
      expect(prompts).not.toHaveBeenCalled();
    });
  });
});
