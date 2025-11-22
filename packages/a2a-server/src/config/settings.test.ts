/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';

// Mock os module before importing settings to ensure homedir() is mocked during module initialization
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: {
      ...actual,
      homedir: vi.fn(() => '/home/testuser'),
    },
    homedir: vi.fn(() => '/home/testuser'),
  };
});

vi.mock('node:fs');

import * as fs from 'node:fs';
import { homedir } from 'node:os';
import {
  loadSettings,
  USER_SETTINGS_DIR,
  USER_SETTINGS_PATH,
  SETTINGS_DIRECTORY_NAME,
} from './settings.js';

describe('settings', () => {
  const mockHomedir = '/home/testuser';
  const mockWorkspaceDir = '/workspace/test';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(homedir).mockReturnValue(mockHomedir);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constants', () => {
    it('should define correct settings directory name', () => {
      expect(SETTINGS_DIRECTORY_NAME).toBe('.gemini');
    });

    it('should define correct user settings directory', () => {
      expect(USER_SETTINGS_DIR).toBe(path.join(mockHomedir, '.gemini'));
    });

    it('should define correct user settings path', () => {
      expect(USER_SETTINGS_PATH).toBe(
        path.join(mockHomedir, '.gemini', 'settings.json'),
      );
    });
  });

  describe('loadSettings', () => {
    it('should return empty settings when no files exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toEqual({});
    });

    it('should load user settings when file exists', () => {
      const userSettings = {
        mcpServers: { test: { command: 'test' } },
        coreTools: ['tool1'],
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath) => filePath === USER_SETTINGS_PATH);

      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath === USER_SETTINGS_PATH) {
          return JSON.stringify(userSettings);
        }
        throw new Error('File not found');
      });

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toEqual(userSettings);
    });

    it('should load workspace settings when file exists', () => {
      const workspaceSettings = {
        excludeTools: ['excluded-tool'],
        showMemoryUsage: true,
      };

      const workspaceSettingsPath = path.join(
        mockWorkspaceDir,
        '.gemini',
        'settings.json',
      );

      vi.mocked(fs.existsSync).mockImplementation((filePath) => filePath === workspaceSettingsPath);

      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath === workspaceSettingsPath) {
          return JSON.stringify(workspaceSettings);
        }
        throw new Error('File not found');
      });

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toEqual(workspaceSettings);
    });

    it('should merge user and workspace settings with workspace taking priority', () => {
      const userSettings = {
        coreTools: ['user-tool'],
        showMemoryUsage: false,
      };

      const workspaceSettings = {
        showMemoryUsage: true,
        excludeTools: ['workspace-tool'],
      };

      const workspaceSettingsPath = path.join(
        mockWorkspaceDir,
        '.gemini',
        'settings.json',
      );

      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath === USER_SETTINGS_PATH) {
          return JSON.stringify(userSettings);
        }
        if (filePath === workspaceSettingsPath) {
          return JSON.stringify(workspaceSettings);
        }
        throw new Error('Unexpected file');
      });

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toEqual({
        coreTools: ['user-tool'],
        showMemoryUsage: true,
        excludeTools: ['workspace-tool'],
      });
    });

    it('should handle JSON with comments', () => {
      const settingsWithComments = `{
        // This is a comment
        "coreTools": ["tool1"],
        /* Block comment */
        "showMemoryUsage": true
      }`;

      vi.mocked(fs.existsSync).mockImplementation((filePath) => filePath === USER_SETTINGS_PATH);

      vi.mocked(fs.readFileSync).mockReturnValue(settingsWithComments);

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toMatchObject({
        coreTools: ['tool1'],
        showMemoryUsage: true,
      });
    });

    it('should resolve environment variables in settings', () => {
      process.env.TEST_VAR = 'test-value';
      process.env.TEST_PATH = '/test/path';

      const settingsWithEnv = {
        mcpServers: {
          test: {
            command: '$TEST_VAR',
            args: ['${TEST_PATH}/file'],
          },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(settingsWithEnv),
      );

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toMatchObject({
        mcpServers: {
          test: {
            command: 'test-value',
            args: ['/test/path/file'],
          },
        },
      });

      delete process.env.TEST_VAR;
      delete process.env.TEST_PATH;
    });

    it('should leave unresolved env vars unchanged', () => {
      const settingsWithEnv = {
        value: '$NONEXISTENT_VAR',
        nested: {
          path: '${ALSO_NONEXISTENT}/file',
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(settingsWithEnv),
      );

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toEqual({
        value: '$NONEXISTENT_VAR',
        nested: {
          path: '${ALSO_NONEXISTENT}/file',
        },
      });
    });

    it('should handle parse errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');

      const result = loadSettings(mockWorkspaceDir);

      expect(console.error).toHaveBeenCalledWith('Errors loading settings:');
      expect(result).toEqual({});
    });

    it('should log errors for invalid user settings', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => filePath === USER_SETTINGS_PATH);

      vi.mocked(fs.readFileSync).mockImplementation(() => 'invalid json');

      loadSettings(mockWorkspaceDir);

      expect(console.error).toHaveBeenCalledWith('Errors loading settings:');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(`  Path: ${USER_SETTINGS_PATH}`),
      );
    });

    it('should handle arrays in settings', () => {
      const settings = {
        coreTools: ['tool1', 'tool2', '$ENV_TOOL'],
        excludeTools: ['excluded'],
      };

      process.env.ENV_TOOL = 'env-tool';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(settings));

      const result = loadSettings(mockWorkspaceDir);

      expect(result.coreTools).toEqual(['tool1', 'tool2', 'env-tool']);

      delete process.env.ENV_TOOL;
    });

    it('should handle nested objects with env vars', () => {
      const settings = {
        mcpServers: {
          server1: {
            command: '$COMMAND',
            env: {
              VAR1: '$VALUE1',
              VAR2: 'static',
            },
          },
        },
      };

      process.env.COMMAND = 'test-command';
      process.env.VALUE1 = 'test-value';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(settings));

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toMatchObject({
        mcpServers: {
          server1: {
            command: 'test-command',
            env: {
              VAR1: 'test-value',
              VAR2: 'static',
            },
          },
        },
      });

      delete process.env.COMMAND;
      delete process.env.VALUE1;
    });

    it('should handle boolean and number values correctly', () => {
      const settings = {
        showMemoryUsage: true,
        folderTrust: false,
        someNumber: 42,
        someNull: null,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(settings));

      const result = loadSettings(mockWorkspaceDir);

      expect(result).toEqual(settings);
    });
  });
});
