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
import { removeCommand } from './remove.js';
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

describe('allow remove command', () => {
  let parser: Argv;
  let mockSetValue: Mock;
  let debugLoggerLogSpy: MockInstance;
  let debugLoggerWarnSpy: MockInstance;
  let debugLoggerErrorSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    const yargsInstance = yargs([]).command(removeCommand);
    parser = yargsInstance;
    mockSetValue = vi.fn();
    debugLoggerLogSpy = vi
      .spyOn(debugLogger, 'log')
      .mockImplementation(() => {});
    debugLoggerWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: { tools: { allowed: ['my_tool'] } } }),
      setValue: mockSetValue,
      workspace: { path: '/path/to/project' },
      user: { path: '/home/user' },
    });
  });

  it('should remove a tool from project settings', async () => {
    await parser.parseAsync('remove my_tool');

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'tools.allowed',
      [],
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Tool "my_tool" removed from allowed list in project settings.',
    );
  });

  it('should remove a tool from user settings', async () => {
    await parser.parseAsync('remove --scope user my_tool');

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.User,
      'tools.allowed',
      [],
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Tool "my_tool" removed from allowed list in user settings.',
    );
  });

  it('should warn if tool is not found', async () => {
    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: { tools: { allowed: [] } } }),
      setValue: mockSetValue,
      workspace: { path: '/path/to/project' },
      user: { path: '/home/user' },
    });

    await parser.parseAsync('remove my_tool');

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
      'Tool "my_tool" is not found in project allowed list.',
    );
  });

  it('should error when removing from project scope while in home directory', async () => {
    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: { tools: { allowed: ['my_tool'] } } }),
      setValue: mockSetValue,
      workspace: { path: '/home/user' },
      user: { path: '/home/user' },
    });

    const mockProcessExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: number | string | null) => never);

    await expect(parser.parseAsync('remove my_tool')).rejects.toThrow(
      'process.exit called',
    );

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      'Error: Please use --scope user to edit settings in the home directory.',
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(mockSetValue).not.toHaveBeenCalled();
  });
});
