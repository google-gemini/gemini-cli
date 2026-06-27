/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  deepMergeSettings,
  loadSettings,
  USER_SETTINGS_PATH,
} from './settings.js';
import { debugLogger, checkPathTrust } from '@google/gemini-cli-core';

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
    checkPathTrust: vi.fn(() => ({ isTrusted: false })),
    isHeadlessMode: vi.fn(() => true),
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
      tools: {
        core: ['tool1', 'tool2'],
      },
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
    expect(result.tools?.core).toEqual(['tool1', 'tool2']);
    expect(result.mcpServers).toHaveProperty('server1');
    expect(result.fileFiltering?.respectGitIgnore).toBe(true);
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

  it('should deep-merge nested settings from workspace', () => {
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

    const result = loadSettings(mockWorkspaceDir, true);
    // Primitive value overwritten
    expect(result.showMemoryUsage).toBe(true);

    // Nested object is deep-merged: the workspace overrides only the key it
    // defines, and the user's unrelated nested key is preserved.
    expect(result.fileFiltering?.respectGitIgnore).toBe(false);
    expect(result.fileFiltering?.enableRecursiveFileSearch).toBe(true);
  });

  it('deep-merges multiple nested sections independently', () => {
    const userSettings = {
      tools: { core: ['core-tool'], allowed: ['user-tool'] },
      fileFiltering: {
        respectGitIgnore: true,
        enableRecursiveFileSearch: true,
      },
    };
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

    const workspaceSettings = {
      tools: { allowed: ['workspace-tool'] },
      fileFiltering: { respectGitIgnore: false },
    };
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, JSON.stringify(workspaceSettings));

    const result = loadSettings(mockWorkspaceDir, true);

    // User-only nested keys are preserved across both sections.
    expect(result.tools?.core).toEqual(['core-tool']);
    expect(result.fileFiltering?.enableRecursiveFileSearch).toBe(true);
    // Workspace overrides only the specific key it defines.
    expect(result.fileFiltering?.respectGitIgnore).toBe(false);
    // Arrays are replaced wholesale, not concatenated.
    expect(result.tools?.allowed).toEqual(['workspace-tool']);
  });

  it('does not allow prototype pollution through merged settings', () => {
    fs.writeFileSync(
      USER_SETTINGS_PATH,
      JSON.stringify({ showMemoryUsage: true }),
    );
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    // Raw JSON: JSON.parse turns __proto__ into an own property.
    fs.writeFileSync(
      workspaceSettingsPath,
      '{ "__proto__": { "polluted": true } }',
    );

    const result = loadSettings(mockWorkspaceDir, true);

    expect(
      (Object.prototype as Record<string, unknown>)['polluted'],
    ).toBeUndefined();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(result.showMemoryUsage).toBe(true);
  });

  it('does not crash when the user settings file contains null', () => {
    // JSON.parse("null") returns null, which would otherwise crash downstream
    // property access and the deep merge.
    fs.writeFileSync(USER_SETTINGS_PATH, 'null');

    expect(() => loadSettings(mockWorkspaceDir)).not.toThrow();
    const result = loadSettings(mockWorkspaceDir);
    expect(result).toEqual({
      policyPaths: undefined,
      adminPolicyPaths: undefined,
    });
  });

  it('does not crash when the workspace settings file contains null', () => {
    fs.writeFileSync(
      USER_SETTINGS_PATH,
      JSON.stringify({ showMemoryUsage: true }),
    );
    const workspaceSettingsPath = path.join(
      mockGeminiWorkspaceDir,
      'settings.json',
    );
    fs.writeFileSync(workspaceSettingsPath, 'null');

    expect(() => loadSettings(mockWorkspaceDir, true)).not.toThrow();
    const result = loadSettings(mockWorkspaceDir, true);
    expect(result.showMemoryUsage).toBe(true);
  });

  describe('security', () => {
    it('should NOT load workspace settings if workspace is NOT trusted', () => {
      const userSettings = { showMemoryUsage: false };
      fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

      const workspaceSettings = { showMemoryUsage: true };
      const workspaceSettingsPath = path.join(
        mockGeminiWorkspaceDir,
        'settings.json',
      );
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettings),
      );

      // checkPathTrust is mocked to return isTrusted: false by default
      const result = loadSettings(mockWorkspaceDir);
      expect(result.showMemoryUsage).toBe(false);
    });

    it('should load workspace settings if workspace IS trusted', () => {
      vi.mocked(checkPathTrust).mockReturnValueOnce({
        isTrusted: true,
        source: 'file',
      });
      const userSettings = { showMemoryUsage: false };
      fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

      const workspaceSettings = { showMemoryUsage: true };
      const workspaceSettingsPath = path.join(
        mockGeminiWorkspaceDir,
        'settings.json',
      );
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettings),
      );

      const result = loadSettings(mockWorkspaceDir);
      expect(result.showMemoryUsage).toBe(true);
    });

    it('should NOT allow workspace settings to override adminPolicyPaths or policyPaths even if trusted', () => {
      vi.mocked(checkPathTrust).mockReturnValueOnce({
        isTrusted: true,
        source: 'file',
      });
      const userSettings = {
        adminPolicyPaths: ['/trusted/admin'],
        policyPaths: ['/trusted/user'],
      };
      fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(userSettings));

      const workspaceSettings = {
        adminPolicyPaths: ['./malicious/admin'],
        policyPaths: ['./malicious/user'],
        showMemoryUsage: true,
      };
      const workspaceSettingsPath = path.join(
        mockGeminiWorkspaceDir,
        'settings.json',
      );
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettings),
      );

      const result = loadSettings(mockWorkspaceDir);
      expect(result.showMemoryUsage).toBe(true);
      expect(result.adminPolicyPaths).toEqual(['/trusted/admin']);
      expect(result.policyPaths).toEqual(['/trusted/user']);
    });
  });
});

describe('deepMergeSettings', () => {
  it('does not throw when either side is null', () => {
    const nullValue = null as unknown as Record<string, unknown>;
    expect(() => deepMergeSettings(nullValue, { a: 1 })).not.toThrow();
    expect(() => deepMergeSettings({ a: 1 }, nullValue)).not.toThrow();
    expect(() => deepMergeSettings(nullValue, nullValue)).not.toThrow();

    expect(deepMergeSettings(nullValue, { a: 1 })).toEqual({ a: 1 });
    expect(deepMergeSettings({ a: 1 }, nullValue)).toEqual({ a: 1 });
    expect(deepMergeSettings(nullValue, nullValue)).toEqual({});
  });

  it('deep-clones nested source objects so the result does not share references', () => {
    // `target` has no `nested` key, so `source.nested` would previously be
    // assigned by reference, letting later mutations of the result leak back
    // into the source object.
    const source = { nested: { keep: true } };
    const result = deepMergeSettings<Record<string, unknown>>({}, source);

    expect(result['nested']).toEqual({ keep: true });
    expect(result['nested']).not.toBe(source.nested);

    // Mutating the merged result must not affect the original source object.
    (result['nested'] as Record<string, unknown>)['keep'] = false;
    expect(source.nested.keep).toBe(true);
  });

  it('deep-clones nested objects even when the target value is a primitive', () => {
    const source = { section: { value: 1 } };
    const result = deepMergeSettings<Record<string, unknown>>(
      { section: 'not-an-object' },
      source,
    );

    expect(result['section']).toEqual({ value: 1 });
    expect(result['section']).not.toBe(source.section);
  });

  it('clones arrays so the result does not share references with the source', () => {
    // Arrays replace the target value wholesale, but the merged result must not
    // share the array reference with the original source object.
    const source = { customIgnoreFilePaths: ['a', 'b'] };
    const result = deepMergeSettings<Record<string, unknown>>(
      { customIgnoreFilePaths: ['old'] },
      source,
    );

    expect(result['customIgnoreFilePaths']).toEqual(['a', 'b']);
    expect(result['customIgnoreFilePaths']).not.toBe(
      source.customIgnoreFilePaths,
    );

    // Mutating the merged array must not affect the original source array.
    (result['customIgnoreFilePaths'] as string[]).push('c');
    expect(source.customIgnoreFilePaths).toEqual(['a', 'b']);
  });
});
