/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadSettings, USER_SETTINGS_PATH } from './settings.js';
import { debugLogger } from '@google/gemini-cli-core';

const mocks = vi.hoisted(() => {
  const suffix = Math.random().toString(36).slice(2);
  return {
    suffix,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const path = await import('node:path');
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), `gemini-home-${mocks.suffix}`),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const path = await import('node:path');
  const os = await import('node:os');
  return {
    ...actual,
    GEMINI_DIR: '.gemini',
    debugLogger: {
      error: vi.fn(),
    },
    getErrorMessage: (error: unknown) => String(error),
    homedir: () => path.join(os.tmpdir(), `gemini-home-${mocks.suffix}`),
  };
});

describe('loadSettings', () => {
  const mockHomeDir = path.join(os.tmpdir(), `gemini-home-${mocks.suffix}`);
  const mockWorkspaceDir = path.join(
    os.tmpdir(),
    `gemini-workspace-${mocks.suffix}`,
  );
  const mockGeminiHomeDir = path.join(mockHomeDir, '.gemini');
  const mockGeminiWorkspaceDir = path.join(mockWorkspaceDir, '.gemini');

  beforeEach(() => {
    vi.clearAllMocks();
    // Create the directories using the real fs
    if (!fs.existsSync(mockGeminiHomeDir)) {
      fs.mkdirSync(mockGeminiHomeDir, { recursive: true });
    }
    if (!fs.existsSync(mockGeminiWorkspaceDir)) {
      fs.mkdirSync(mockGeminiWorkspaceDir, { recursive: true });
    }

    // Clean up settings files before each test
    if (fs.existsSync(USER_SETTINGS_PATH)) {
      fs.rmSync(USER_SETTINGS_PATH);
    }
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    if (fs.existsSync(workspaceSettingsPath)) {
      fs.rmSync(workspaceSettingsPath);
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(mockHomeDir)) {
        fs.rmSync(mockHomeDir, { recursive: true, force: true });
      }
      if (fs.existsSync(mockWorkspaceDir)) {
        fs.rmSync(mockWorkspaceDir, { recursive: true, force: true });
      }
    } catch (e) {
      debugLogger.error('Failed to cleanup temp dirs', e);
    }
    vi.restoreAllMocks();
  });

  it('should load nested previewFeatures from user settings', () => {
    const settings = {
      general: {
        previewFeatures: true,
      },
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.general?.previewFeatures).toBe(true);
  });

  it('should load nested previewFeatures from workspace settings', () => {
    const settings = {
      general: {
        previewFeatures: true,
      },
    };
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.general?.previewFeatures).toBe(true);
  });

  it('should prioritize workspace settings over user settings', () => {
    const userSettings = {
      general: {
        previewFeatures: false,
      },
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

    const workspaceSettings = {
      general: {
        previewFeatures: true,
      },
    };
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, JSON.stringify(workspaceSettings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.general?.previewFeatures).toBe(true);
  });

  it('should handle missing previewFeatures', () => {
    const settings = {
      general: {},
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.general?.previewFeatures).toBeUndefined();
  });

  it('should load other top-level settings correctly', () => {
    const settings = {
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
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.showMemoryUsage).toBe(true);
    expect(result.coreTools).toEqual(['tool1', 'tool2']);
    expect(result.mcpServers).toHaveProperty('server1');
    expect(result.fileFiltering?.respectGitIgnore).toBe(true);
  });

  it('should overwrite top-level settings from workspace (shallow merge)', () => {
    const userSettings = {
      showMemoryUsage: false,
      fileFiltering: {
        respectGitIgnore: true,
        enableRecursiveFileSearch: true,
      },
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

    const workspaceSettings = {
      showMemoryUsage: true,
      fileFiltering: {
        respectGitIgnore: false,
      },
    };
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, JSON.stringify(workspaceSettings));

    const result = loadSettings(mockWorkspaceDir);
    // Primitive value overwritten
    expect(result.showMemoryUsage).toBe(true);

    // Object value completely replaced (shallow merge behavior)
    expect(result.fileFiltering?.respectGitIgnore).toBe(false);
    expect(result.fileFiltering?.enableRecursiveFileSearch).toBeUndefined();
  });
});
