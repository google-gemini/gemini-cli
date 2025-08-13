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
} from '../../config/settings.js';

vi.mock('../../config/settings.js');

const mockedLoadSettings = loadSettings as Mock;

describe('extensions disable command', () => {
  let consoleSpy: vi.SpyInstance;
  let mockSetValue: vi.Mock;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockSetValue = vi.fn();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should disable an extension in the workspace', async () => {
    const mockSettings = {
      forScope: () => ({
        settings: {
          extensions: {
            disabled: [],
          },
        },
      }),
      setValue: mockSetValue,
    } as unknown as LoadedSettings;
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

  it('should disable an extension globally', async () => {
    const mockSettings = {
      forScope: () => ({
        settings: {
          extensions: {
            disabled: [],
          },
        },
      }),
      setValue: mockSetValue,
    } as unknown as LoadedSettings;
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
    const mockSettings = {
      forScope: () => ({
        settings: {
          extensions: {
            disabled: ['my-extension'],
          },
        },
      }),
      setValue: mockSetValue,
    } as unknown as LoadedSettings;
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
