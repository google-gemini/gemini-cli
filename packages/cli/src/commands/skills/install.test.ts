/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';
import { handleInstall, installCommand } from './install.js';
import {
  SettingScope,
  type LoadableSettingScope,
} from '../../config/settings.js';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { extractFile } from '../../config/extensions/github.js';

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
    MockStorage as unknown as { getGlobalGeminiDir: unknown }
  ).getGlobalGeminiDir = actual.Storage.getGlobalGeminiDir;
  (
    MockStorage as unknown as { getGlobalSettingsPath: unknown }
  ).getGlobalSettingsPath = actual.Storage.getGlobalSettingsPath;

  return {
    ...actual,
    debugLogger,
    Storage: MockStorage,
  };
});

// Re-verify Storage mock within the test suite
import { Storage as MockedStorage } from '@google/gemini-cli-core';

vi.mock('../../config/settings.js');
vi.mock('../../config/extensions/github.js');
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('node:fs/promises');
vi.mock('node:fs');

describe('skills install command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MockedStorage.getUserSkillsDir).mockReturnValue('/user/skills');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleInstall', () => {
    it('should install a skill directory to user scope', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as unknown as fsSync.Stats);
      vi.mocked(fsSync.existsSync).mockReturnValue(false);

      await handleInstall({
        source: 'my-skill',
        scope: SettingScope.User as LoadableSettingScope,
      });

      expect(fs.mkdir).toHaveBeenCalledWith('/user/skills', {
        recursive: true,
      });
      expect(fs.cp).toHaveBeenCalledWith('my-skill', '/user/skills/my-skill', {
        recursive: true,
      });
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining('successfully installed'),
      );
    });

    it('should install a .skill file to user scope', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
      } as unknown as fsSync.Stats);
      vi.mocked(fsSync.existsSync).mockReturnValue(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      await handleInstall({
        source: 'my-skill.skill',
        scope: SettingScope.User as LoadableSettingScope,
      });

      expect(extractFile).toHaveBeenCalled();
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining('successfully installed'),
      );
    });

    it('should throw error if source not found', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('not found'));

      await expect(
        handleInstall({
          source: 'missing',
          scope: SettingScope.User as LoadableSettingScope,
        }),
      ).rejects.toThrow('Install source not found: missing');
    });

    it('should throw error if skill already installed', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as unknown as fsSync.Stats);
      vi.mocked(fsSync.existsSync).mockReturnValue(true);

      await expect(
        handleInstall({
          source: 'my-skill',
          scope: SettingScope.User as LoadableSettingScope,
        }),
      ).rejects.toThrow('already installed');
    });
  });

  describe('installCommand', () => {
    it('should have correct command and describe', () => {
      expect(installCommand.command).toBe('install <source>');
      expect(installCommand.describe).toBe(
        'Installs an agent skill from a local path or .skill file.',
      );
    });
  });
});
