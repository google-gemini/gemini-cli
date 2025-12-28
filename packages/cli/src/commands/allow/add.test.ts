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
  type Mock,
  type MockInstance,
} from 'vitest';
import yargs, { type Argv } from 'yargs';
import { addCommand } from './add.js';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('../../config/settings.js', async () => {
  const actual = await vi.importActual('../../config/settings.js');
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

const mockedLoadSettings = loadSettings as Mock;

describe('allow add command', () => {
  let parser: Argv;
  let mockSetValue: Mock;
  let debugLoggerLogSpy: MockInstance;
  let debugLoggerErrorSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    const yargsInstance = yargs([]).command(addCommand);
    parser = yargsInstance;
    mockSetValue = vi.fn();
    debugLoggerLogSpy = vi
      .spyOn(debugLogger, 'log')
      .mockImplementation(() => {});
    debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: { tools: { allowed: [] } } }),
      setValue: mockSetValue,
      workspace: { path: '/path/to/project' },
      user: { path: '/home/user' },
    });
  });

  it('should add a tool to project settings by default', async () => {
    await parser.parseAsync('add my_tool');

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'tools.allowed',
      ['my_tool'],
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Tool "my_tool" added to allowed list in project settings.',
    );
  });

  it('should add a tool to user settings when --scope user is used', async () => {
    await parser.parseAsync('add --scope user my_tool');

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.User,
      'tools.allowed',
      ['my_tool'],
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Tool "my_tool" added to allowed list in user settings.',
    );
  });

  it('should not add a tool if it is already allowed', async () => {
    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: { tools: { allowed: ['my_tool'] } } }),
      setValue: mockSetValue,
      workspace: { path: '/path/to/project' },
      user: { path: '/home/user' },
    });

    await parser.parseAsync('add my_tool');

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Tool "my_tool" is already allowed in project settings.',
    );
  });

  it('should error when adding to project scope while in home directory', async () => {
    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: { tools: { allowed: [] } } }),
      setValue: mockSetValue,
      workspace: { path: '/home/user' },
      user: { path: '/home/user' },
    });

    const { exitCli } = await import('../utils.js');

    await parser.parseAsync('add my_tool');

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      'Error: Please use --scope user to edit settings in the home directory.',
    );
    expect(exitCli).toHaveBeenCalledWith(1);
    expect(mockSetValue).not.toHaveBeenCalled();
  });
});
