/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { disableCommand } from './disable.js';
import {
  loadSettings,
  LoadedSettings,
  SettingScope,
  SettingsFile,
} from '../../config/settings.js';

vi.mock('../../config/settings.js');

const mockedLoadSettings = loadSettings as Mock;

describe('extensions disable command', () => {
  let consoleSpy: vi.SpyInstance;
  let mockSetValue: vi.Mock;
  let mockSettingsFile: SettingsFile;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockSetValue = vi.fn();
    mockSettingsFile = {
      path: '/fake/path/settings.json',
      settings: {
        extensions: {
          disabled: [],
        },
      },
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const getMockSettings = (
    initialDisabled: string[],
  ): Partial<LoadedSettings> => {
    mockSettingsFile.settings.extensions!.disabled = initialDisabled;
    return {
      forScope: () => mockSettingsFile,
      setValue: mockSetValue,
    };
  };

  it('should disable an extension and save the settings', async () => {
    const mockSettings = getMockSettings([]) as LoadedSettings;
    mockedLoadSettings.mockReturnValue(mockSettings);

    await disableCommand.handler({
      name: 'my-extension',
      global: false,
      $0: '',
      _: [],
    });

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'extensions',
      {
        disabled: ['my-extension'],
      },
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Extension "my-extension" has been disabled.',
    );
  });

  it('should disable an extension globally and save the settings', async () => {
    const mockSettings = getMockSettings([]) as LoadedSettings;
    mockedLoadSettings.mockReturnValue(mockSettings);

    await disableCommand.handler({
      name: 'my-extension',
      global: true,
      $0: '',
      _: [],
    });

    expect(mockSetValue).toHaveBeenCalledWith(SettingScope.User, 'extensions', {
      disabled: ['my-extension'],
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      'Extension "my-extension" has been disabled.',
    );
  });

  it('should not disable an already disabled extension', async () => {
    const mockSettings = getMockSettings(['my-extension']) as LoadedSettings;
    mockedLoadSettings.mockReturnValue(mockSettings);

    await disableCommand.handler({
      name: 'my-extension',
      global: false,
      $0: '',
      _: [],
    });

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Extension "my-extension" is already disabled.',
    );
  });
});
