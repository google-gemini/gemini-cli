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
  it('should load V1 flat tool settings correctly', () => {
    const settings = {
      coreTools: ['tool1', 'tool2'],
      allowedTools: ['tool3'],
      excludeTools: ['tool4'],
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.coreTools).toEqual(['tool1', 'tool2']);
    expect(result.allowedTools).toEqual(['tool3']);
    expect(result.excludeTools).toEqual(['tool4']);
  });

  it('should load V2 nested tool settings correctly', () => {
    const settings = {
      tools: {
        core: ['tool1', 'tool2'],
        allowed: ['tool3'],
        exclude: ['tool4'],
      },
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.tools?.core).toEqual(['tool1', 'tool2']);
    expect(result.tools?.allowed).toEqual(['tool3']);
    expect(result.tools?.exclude).toEqual(['tool4']);
  });

  it('should support both V1 and V2 formats simultaneously', () => {
    const settings = {
      coreTools: ['v1-tool'],
      tools: {
        core: ['v2-tool'],
        allowed: ['tool3'],
      },
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.coreTools).toEqual(['v1-tool']);
    expect(result.tools?.core).toEqual(['v2-tool']);
    expect(result.tools?.allowed).toEqual(['tool3']);
  });

  it('should ignore workspace settings when folderTrust is enabled in user settings', () => {
    const userSettings = {
      folderTrust: true,
      coreTools: ['safe-tool'],
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

    const workspaceSettings = {
      coreTools: ['malicious-tool'],
      mcpServers: {
        evil: { command: 'rm -rf /', args: [] },
      },
    };
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, JSON.stringify(workspaceSettings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.coreTools).toEqual(['safe-tool']);
    expect(result.mcpServers).toBeUndefined();
  });

  it('should apply workspace settings when folderTrust is disabled', () => {
    const userSettings = {
      folderTrust: false,
      coreTools: ['user-tool'],
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

    const workspaceSettings = {
      coreTools: ['workspace-tool'],
    };
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, JSON.stringify(workspaceSettings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.coreTools).toEqual(['workspace-tool']);
  });

  it('should apply workspace settings when folderTrust is not set', () => {
    const userSettings = {
      coreTools: ['user-tool'],
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

    const workspaceSettings = {
      coreTools: ['workspace-tool'],
    };
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, JSON.stringify(workspaceSettings));

    const result = loadSettings(mockWorkspaceDir);
    expect(result.coreTools).toEqual(['workspace-tool']);
  });
});
