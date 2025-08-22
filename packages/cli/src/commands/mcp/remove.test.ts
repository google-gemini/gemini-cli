/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import yargs from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { removeCommand } from './remove.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../../config/settings.js', async () => {
  const actual = await vi.importActual('../../config/settings.js');
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

const mockedLoadSettings = loadSettings as vi.Mock;

describe('mcp remove command', () => {
  let parser: yargs.Argv;
  let mockSetValue: vi.Mock;
  let mockSettings: Record<string, unknown>;

  beforeEach(() => {
    vi.resetAllMocks();
    const yargsInstance = yargs([]).command(removeCommand);
    parser = yargsInstance;
    mockSetValue = vi.fn();
    mockSettings = {
      mcpServers: {
        'test-server': {
          command: 'echo "hello"',
        },
      },
    };
    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: mockSettings }),
      setValue: mockSetValue,
    });
  });

  it('should remove a server from project settings', async () => {
    await parser.parseAsync('remove test-server');

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'mcpServers',
      {},
    );
  });

  it('should show a message if server not found', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await parser.parseAsync('remove non-existent-server');

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Server "non-existent-server" not found in project settings.',
    );
  });
});
