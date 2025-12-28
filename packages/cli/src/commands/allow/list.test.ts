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
import { listCommand } from './list.js';
import { loadSettings } from '../../config/settings.js';
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

describe('allow list command', () => {
  let parser: Argv;
  let debugLoggerLogSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    const yargsInstance = yargs([]).command(listCommand);
    parser = yargsInstance;
    debugLoggerLogSpy = vi
      .spyOn(debugLogger, 'log')
      .mockImplementation(() => {});
  });

  it('should list allowed tools', async () => {
    mockedLoadSettings.mockReturnValue({
      merged: { tools: { allowed: ['tool1', 'tool2'] } },
    });

    await parser.parseAsync('list');

    expect(debugLoggerLogSpy).toHaveBeenCalledWith('Allowed tools:');
    expect(debugLoggerLogSpy).toHaveBeenCalledWith('- tool1');
    expect(debugLoggerLogSpy).toHaveBeenCalledWith('- tool2');
  });

  it('should show message when no tools are allowed', async () => {
    mockedLoadSettings.mockReturnValue({
      merged: { tools: { allowed: [] } },
    });

    await parser.parseAsync('list');

    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'No allowed tools configured.',
    );
  });
});
