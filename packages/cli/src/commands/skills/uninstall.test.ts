/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';
import { handleUninstall, uninstallCommand } from './uninstall.js';
import {
  loadSettings,
  SettingScope,
  type LoadedSettings,
  type LoadableSettingScope,
} from '../../config/settings.js';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';

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
  const MockStorage = vi.fn().mockImplementation(() => ({
    getProjectSkillsDir: vi.fn().mockReturnValue('/project/skills'),
  }));
  (MockStorage as unknown as { getUserSkillsDir: unknown }).getUserSkillsDir =
    vi.fn().mockReturnValue('/user/skills');
  (
    MockStorage as unknown as { getGlobalSettingsPath: unknown }
  ).getGlobalSettingsPath = actual.Storage.getGlobalSettingsPath;
  (
    MockStorage as unknown as { getGlobalGeminiDir: unknown }
  ).getGlobalGeminiDir = actual.Storage.getGlobalGeminiDir;

  return {
    ...actual,
    debugLogger,
    Storage: MockStorage,
  };
});

// Re-verify Storage mock within the test suite
import { Storage as MockedStorage } from '@google/gemini-cli-core';

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('node:fs/promises');
vi.mock('node:fs');

describe('skills uninstall command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MockedStorage.getUserSkillsDir).mockReturnValue('/user/skills');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleUninstall', () => {
    it('should uninstall a skill from user scope', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      const mockSettings = {
        forScope: vi.fn().mockReturnValue({
          settings: { skills: { disabled: ['skill1'] } },
        }),
        setValue: vi.fn(),
      };
      mockLoadSettings.mockReturnValue(
        mockSettings as unknown as LoadedSettings,
      );

      await handleUninstall({
        names: ['skill1'],
        scope: SettingScope.User as LoadableSettingScope,
      });

      expect(fs.rm).toHaveBeenCalledWith('/user/skills/skill1', {
        recursive: true,
        force: true,
      });
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'skills.disabled',
        [],
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining('successfully uninstalled'),
      );
    });

    it('should throw error if skill not found', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(false);
      mockLoadSettings.mockReturnValue({
        forScope: vi.fn().mockReturnValue({ settings: {} }),
      } as unknown as LoadedSettings);

      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);

      await handleUninstall({
        names: ['missing'],
        scope: SettingScope.User as LoadableSettingScope,
      });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('not found'),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('uninstallCommand', () => {
    it('should have correct command and describe', () => {
      expect(uninstallCommand.command).toBe('uninstall <names..>');
      expect(uninstallCommand.describe).toBe(
        'Uninstalls one or more agent skills.',
      );
    });
  });
});
