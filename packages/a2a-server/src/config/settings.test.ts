/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadSettings, USER_SETTINGS_PATH } from './settings.js';

vi.mock('node:fs');
vi.mock('node:os', () => ({
  homedir: () => '/mock/home',
}));
vi.mock('@google/gemini-cli-core', () => ({
  GEMINI_DIR: '.gemini',
  debugLogger: {
    error: vi.fn(),
  },
  getErrorMessage: (error: unknown) => String(error),
}));

describe('loadSettings', () => {
  const mockWorkspaceDir = '/mock/workspace';
  const mockWorkspaceSettingsPath = path.join(
    mockWorkspaceDir,
    '.gemini',
    'settings.json',
  );

  beforeEach(() => {
    vi.resetAllMocks();
    // Default mock implementation for fs.existsSync to return false
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load nested previewFeatures from user settings', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === USER_SETTINGS_PATH,
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === USER_SETTINGS_PATH) {
        return JSON.stringify({
          general: {
            previewFeatures: true,
          },
        });
      }
      return '';
    });

    const settings = loadSettings(mockWorkspaceDir);
    expect(settings.general?.previewFeatures).toBe(true);
  });

  it('should load nested previewFeatures from workspace settings', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === mockWorkspaceSettingsPath,
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === mockWorkspaceSettingsPath) {
        return JSON.stringify({
          general: {
            previewFeatures: true,
          },
        });
      }
      return '';
    });

    const settings = loadSettings(mockWorkspaceDir);
    expect(settings.general?.previewFeatures).toBe(true);
  });

  it('should prioritize workspace settings over user settings', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === USER_SETTINGS_PATH) {
        return JSON.stringify({
          general: {
            previewFeatures: false,
          },
        });
      }
      if (p === mockWorkspaceSettingsPath) {
        return JSON.stringify({
          general: {
            previewFeatures: true,
          },
        });
      }
      return '';
    });

    const settings = loadSettings(mockWorkspaceDir);
    expect(settings.general?.previewFeatures).toBe(true);
  });

  it('should handle missing previewFeatures', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === USER_SETTINGS_PATH,
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === USER_SETTINGS_PATH) {
        return JSON.stringify({
          general: {},
        });
      }
      return '';
    });

    const settings = loadSettings(mockWorkspaceDir);
    expect(settings.general?.previewFeatures).toBeUndefined();
  });

  it('should load other top-level settings correctly', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === USER_SETTINGS_PATH,
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === USER_SETTINGS_PATH) {
        return JSON.stringify({
          showMemoryUsage: true,
          coreTools: ['tool1', 'tool2'],
          mcpServers: {
            server1: {
              command: 'cmd',
              args: ['arg'],
            },
          },
          fileFiltering: {
            respectGitIgnore: true,
          },
        });
      }
      return '';
    });

    const settings = loadSettings(mockWorkspaceDir);
    expect(settings.showMemoryUsage).toBe(true);
    expect(settings.coreTools).toEqual(['tool1', 'tool2']);
    expect(settings.mcpServers).toHaveProperty('server1');
    expect(settings.fileFiltering?.respectGitIgnore).toBe(true);
  });

  it('should overwrite top-level settings from workspace (shallow merge)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === USER_SETTINGS_PATH) {
        return JSON.stringify({
          showMemoryUsage: false,
          fileFiltering: {
            respectGitIgnore: true,
            enableRecursiveFileSearch: true,
          },
        });
      }
      if (p === mockWorkspaceSettingsPath) {
        return JSON.stringify({
          showMemoryUsage: true,
          fileFiltering: {
            respectGitIgnore: false,
          },
        });
      }
      return '';
    });

    const settings = loadSettings(mockWorkspaceDir);
    // Primitive value overwritten
    expect(settings.showMemoryUsage).toBe(true);

    // Object value completely replaced (shallow merge behavior)
    expect(settings.fileFiltering?.respectGitIgnore).toBe(false);
    expect(settings.fileFiltering?.enableRecursiveFileSearch).toBeUndefined();
  });
});
