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
import {
  debugLogger,
  validateUserDirectoryEnvironment,
} from '@google/gemini-cli-core';

const mocks = vi.hoisted(() => {
  const suffix = Math.random().toString(36).slice(2);
  return {
    suffix,
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      error: vi.fn(),
    },
    getErrorMessage: (error: unknown) => String(error),
    validateUserDirectoryEnvironment: vi.fn(),
    Storage: class extends actual.Storage {
      static override getGlobalGeminiDir() {
        return path.join(
          os.tmpdir(),
          `gemini-home-${mocks.suffix}`,
          '.config',
          'gemini-cli',
        );
      }
    },
  };
});

describe('loadSettings', () => {
  const mockHomeDir = path.join(os.tmpdir(), `gemini-home-${mocks.suffix}`);
  const mockWorkspaceDir = path.join(
    os.tmpdir(),
    `gemini-workspace-${mocks.suffix}`,
  );
  const mockGeminiHomeDir = path.join(mockHomeDir, '.config', 'gemini-cli');
  const mockGeminiWorkspaceDir = path.join(mockWorkspaceDir, '.gemini');

  beforeEach(() => {
    vi.clearAllMocks();
    expect(USER_SETTINGS_PATH).toBe(
      path.join(mockGeminiHomeDir, 'settings.json'),
    );
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
    expect(validateUserDirectoryEnvironment).toHaveBeenCalled();
  });

  it('should load experimental settings correctly', () => {
    const settings = {
      experimental: {
        enableAgents: true,
      },
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.experimental?.enableAgents).toBe(true);
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
