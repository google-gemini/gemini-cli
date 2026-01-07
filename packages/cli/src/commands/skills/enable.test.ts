/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';
import { handleEnable, enableCommand } from './enable.js';
import {
  loadSettings,
  SettingScope,
  type LoadedSettings,
  type LoadableSettingScope,
} from '../../config/settings.js';

const emitConsoleLog = vi.hoisted(() => vi.fn());
const debugLogger = vi.hoisted(() => ({
  log: vi.fn((message, ...args) => {
    emitConsoleLog('log', format(message, ...args));
  }),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger,
  };
});

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(),
    isLoadableSettingScope: vi.fn((s) => s === 'User' || s === 'Workspace'),
  };
});

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('skills enable command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleEnable', () => {
    it('should enable a disabled skill in user scope', async () => {
      const mockSettings = {
        forScope: vi.fn().mockReturnValue({
          settings: { skills: { disabled: ['skill1'] } },
        }),
        setValue: vi.fn(),
      };
      mockLoadSettings.mockReturnValue(
        mockSettings as unknown as LoadedSettings,
      );

      await handleEnable({
        name: 'skill1',
        scope: SettingScope.User as LoadableSettingScope,
      });

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'skills.disabled',
        [],
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Skill "skill1" enabled by removing it from the disabled list in user settings.',
      );
    });

    it('should log a message if the skill is already enabled', async () => {
      const mockSettings = {
        forScope: vi.fn().mockReturnValue({
          settings: { skills: { disabled: [] } },
          path: '/user/settings.json',
        }),
        setValue: vi.fn(),
      };
      vi.mocked(loadSettings).mockReturnValue(
        mockSettings as unknown as LoadedSettings,
      );

      await handleEnable({ name: 'skill1', scope: SettingScope.User });

      expect(mockSettings.setValue).not.toHaveBeenCalled();
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Skill "skill1" is already enabled.',
      );
    });
  });

  describe('enableCommand', () => {
    it('should have correct command and describe', () => {
      expect(enableCommand.command).toBe('enable <name>');
      expect(enableCommand.describe).toBe('Enables an agent skill.');
    });
  });
});
