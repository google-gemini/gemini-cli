/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';
import { handleList, listCommand } from './list.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { loadCliConfig } from '../../config/config.js';
import { getErrorMessage } from '../../utils/errors.js';
import type { Config } from '@google/gemini-cli-core';
import chalk from 'chalk';

// Mock dependencies
const emitConsoleLog = vi.hoisted(() => vi.fn());
const debugLogger = vi.hoisted(() => ({
  log: vi.fn((message, ...args) => {
    emitConsoleLog('log', format(message, ...args));
  }),
  error: vi.fn((message, ...args) => {
    emitConsoleLog('error', format(message, ...args));
  }),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: {
      emitConsoleLog,
    },
    debugLogger,
  };
});

vi.mock('../../config/settings.js');
vi.mock('../../config/config.js');
vi.mock('../../utils/errors.js');
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('skills list command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockLoadCliConfig = vi.mocked(loadCliConfig);
  const mockGetErrorMessage = vi.mocked(getErrorMessage);

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleList', () => {
    it('should log a message if no skills are discovered', async () => {
      const mockConfig = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getSkillManager: vi.fn().mockReturnValue({
          getAllSkills: vi.fn().mockReturnValue([]),
        }),
      };
      mockLoadCliConfig.mockResolvedValue(mockConfig as unknown as Config);

      await handleList();

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'No skills discovered.',
      );
    });

    it('should list all discovered skills', async () => {
      const skills = [
        {
          name: 'skill1',
          description: 'desc1',
          disabled: false,
          location: '/path/to/skill1',
        },
        {
          name: 'skill2',
          description: 'desc2',
          disabled: true,
          location: '/path/to/skill2',
        },
      ];
      const mockConfig = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getSkillManager: vi.fn().mockReturnValue({
          getAllSkills: vi.fn().mockReturnValue(skills),
        }),
      };
      mockLoadCliConfig.mockResolvedValue(mockConfig as unknown as Config);

      await handleList();

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        chalk.bold('Discovered Agent Skills:'),
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining('skill1'),
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining(chalk.green('[Enabled]')),
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining('skill2'),
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining(chalk.red('[Disabled]')),
      );
    });

    it('should log an error message and exit with code 1 when listing fails', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);

      mockLoadCliConfig.mockRejectedValue(new Error('List failed'));
      mockGetErrorMessage.mockReturnValue('List failed message');

      await handleList();

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'List failed message',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('listCommand', () => {
    const command = listCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('list');
      expect(command.describe).toBe('Lists discovered agent skills.');
    });
  });
});
