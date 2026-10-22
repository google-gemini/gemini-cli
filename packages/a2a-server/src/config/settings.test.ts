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
    expect(result.ui?.showMemoryUsage).toBe(true);
    expect(result.tools?.core).toEqual(['tool1', 'tool2']);
    expect(result.mcpServers).toHaveProperty('server1');
    expect(result.context?.fileFiltering?.respectGitIgnore).toBe(true);
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

  it('should deep merge nested settings from workspace without overwriting sibling properties', () => {
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
    expect(result.ui?.showMemoryUsage).toBe(true);

    // Nested object values deep-merged across user and workspace scopes
    expect(result.context?.fileFiltering?.respectGitIgnore).toBe(false);
    expect(result.context?.fileFiltering?.enableRecursiveFileSearch).toBe(true);
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
      expect(result.ui?.showMemoryUsage).toBe(false);
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
      expect(result.ui?.showMemoryUsage).toBe(true);
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
      expect(result.ui?.showMemoryUsage).toBe(true);
      expect(result.adminPolicyPaths).toEqual(['/trusted/admin']);
      expect(result.policyPaths).toEqual(['/trusted/user']);
    });
  });

  describe('V1 to V2 migration and validation', () => {
    it('should convert a 100% V1 file to V2 in memory and pass Zod schema validation', async () => {
      const settingsMod = await import('./settings.js');
      const v1Settings = {
        telemetryDisabled: true,
        logLevel: 'debug',
        coreTools: ['read_file'],
        excludeTools: ['shell'],
        allowedTools: ['fetch'],
        showMemoryUsage: true,
        folderTrust: true,
        checkpointing: { enabled: true },
        fileFiltering: { respectGitIgnore: true },
      };
      fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(v1Settings));

      const result = loadSettings(mockWorkspaceDir);
      expect(result.telemetry?.enabled).toBe(false);
      expect(result.logging?.level).toBe('debug');
      expect(result.tools?.core).toEqual(['read_file']);
      expect(result.tools?.exclude).toEqual(['shell']);
      expect(result.tools?.allowed).toEqual(['fetch']);
      expect(result.ui?.showMemoryUsage).toBe(true);
      expect(result.security?.folderTrust?.enabled).toBe(true);
      expect(result.general?.checkpointing?.enabled).toBe(true);
      expect(result.context?.fileFiltering?.respectGitIgnore).toBe(true);

      // Ensure physical file on disk was NOT modified
      const diskContent = JSON.parse(
        fs.readFileSync(USER_SETTINGS_PATH, 'utf-8'),
      );
      expect(diskContent).toEqual(v1Settings);

      // Validate with Zod V2 schema
      expect(
        'validateSettings' in settingsMod &&
          typeof settingsMod.validateSettings === 'function' &&
          settingsMod.validateSettings(result).success,
      ).toBe(true);
    });

    it('should keep a 100% V2 file structure intact and deep merge nested objects across scopes', () => {
      const v2UserSettings = {
        telemetry: { enabled: false },
        logging: { level: 'debug' },
        context: {
          fileFiltering: {
            respectGitIgnore: true,
            enableRecursiveFileSearch: true,
          },
        },
      };
      fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(v2UserSettings));

      const v2WorkspaceSettings = {
        context: {
          fileFiltering: {
            respectGitIgnore: false,
          },
        },
      };
      const workspaceSettingsPath = path.join(
        mockGeminiWorkspaceDir,
        'settings.json',
      );
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(v2WorkspaceSettings),
      );

      const result = loadSettings(mockWorkspaceDir, true);
      expect(result.telemetry?.enabled).toBe(false);
      expect(result.logging?.level).toBe('debug');
      expect(result.context?.fileFiltering?.respectGitIgnore).toBe(false);
      expect(result.context?.fileFiltering?.enableRecursiveFileSearch).toBe(
        true,
      );
    });

    it('should protect customDeepMerge against Prototype Pollution', async () => {
      const settingsMod = await import('./settings.js');
      expect('customDeepMerge' in settingsMod).toBe(true);
      const customDeepMerge = (
        settingsMod as unknown as {
          customDeepMerge: (
            ...sources: Array<Record<string, unknown>>
          ) => Record<string, unknown>;
        }
      ).customDeepMerge;

      const maliciousPayload = JSON.parse(
        '{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"polluted": "yes"}}}',
      ) as Record<string, unknown>;

      const merged = customDeepMerge({}, maliciousPayload);
      expect(merged).toEqual({});
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('should resolve environment variables within nested V2 objects', () => {
      vi.stubEnv('A2A_LOG_LEVEL', 'warn');
      const v2Settings = {
        logging: {
          level: '${A2A_LOG_LEVEL}',
        },
      };
      fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(v2Settings));

      const result = loadSettings(mockWorkspaceDir);
      expect(result.logging?.level).toBe('warn');
      vi.unstubAllEnvs();
    });

    it('should remove deprecated V1 root keys after migrating to V2 nested paths', () => {
      const v1Settings = {
        telemetryDisabled: true,
        logLevel: 'debug',
        coreTools: ['read_file'],
        excludeTools: ['shell'],
        allowedTools: ['fetch'],
        showMemoryUsage: true,
        theme: 'DefaultDark',
        folderTrust: true,
        checkpointing: { enabled: true },
        vimMode: true,
        fileFiltering: { respectGitIgnore: true },
      };
      fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(v1Settings));

      const result = loadSettings(mockWorkspaceDir) as Record<string, unknown>;
      expect(result['telemetryDisabled']).toBeUndefined();
      expect(result['logLevel']).toBeUndefined();
      expect(result['coreTools']).toBeUndefined();
      expect(result['excludeTools']).toBeUndefined();
      expect(result['allowedTools']).toBeUndefined();
      expect(result['showMemoryUsage']).toBeUndefined();
      expect(result['theme']).toBeUndefined();
      expect(result['folderTrust']).toBeUndefined();
      expect(result['checkpointing']).toBeUndefined();
      expect(result['vimMode']).toBeUndefined();
      expect(result['fileFiltering']).toBeUndefined();
    });

    it('should handle edge cases: boolean checkpointing, hybrid V1+V2 precedence, and non-object inputs', async () => {
      const { migrateDeprecatedSettings, validateSettings } = await import(
        './settings.js'
      );

      // Safe on null/undefined
      expect(
        migrateDeprecatedSettings(
          undefined as unknown as Record<string, unknown>,
        ),
      ).toEqual({});

      // Hybrid file with boolean checkpointing, object chatCompression, and conflicting V1/V2 keys
      const hybridSettings = {
        checkpointing: true,
        chatCompression: { contextPercentageThreshold: 0.75 },
        telemetryDisabled: true,
        telemetry: { enabled: true, target: 'gcp' },
        showMemoryUsage: false,
        ui: { showMemoryUsage: true, theme: 'DefaultLight' },
      };
      const migrated = migrateDeprecatedSettings(hybridSettings);

      // Boolean checkpointing normalized to { enabled: true }
      expect(migrated.general?.checkpointing).toEqual({ enabled: true });
      // Object chatCompression normalized to numeric threshold
      expect(migrated.model?.compressionThreshold).toBe(0.75);
      // V2 explicit keys take precedence over deprecated V1 keys
      expect(migrated.telemetry?.enabled).toBe(true);
      expect(migrated.telemetry?.target).toBe('gcp');
      expect(migrated.ui?.showMemoryUsage).toBe(true);
      expect(migrated.ui?.theme).toBe('DefaultLight');
      expect(validateSettings(migrated).success).toBe(true);
    });

    it('should reject unmigrated V1 settings when passed directly to validateSettings', async () => {
      const { validateSettings } = await import('./settings.js');
      const v1Config = {
        telemetryDisabled: true,
        logLevel: 'debug',
        coreTools: ['read_file'],
        excludeTools: ['shell'],
        allowedTools: ['fetch'],
        folderTrust: false,
        showMemoryUsage: true,
        checkpointing: { enabled: true },
        fileFiltering: { respectGitIgnore: true },
      };

      const validation = validateSettings(v1Config);
      expect(validation.success).toBe(false);
      expect(validation.error?.issues.length).toBeGreaterThan(0);
    });

    it('should pass validateSettings when a V1 configuration is migrated using migrateDeprecatedSettings', async () => {
      const { migrateDeprecatedSettings, validateSettings } = await import(
        './settings.js'
      );
      const v1Config = {
        telemetryDisabled: true,
        logLevel: 'debug',
        coreTools: ['read_file'],
        excludeTools: ['shell'],
        allowedTools: ['fetch'],
        folderTrust: false,
        showMemoryUsage: true,
        checkpointing: { enabled: true },
        fileFiltering: { respectGitIgnore: true },
      };

      const migratedConfig = migrateDeprecatedSettings(v1Config);
      const validation = validateSettings(migratedConfig);

      expect(validation.success).toBe(true);
      expect(migratedConfig.telemetry?.enabled).toBe(false);
      expect(migratedConfig.logging?.level).toBe('debug');
      expect(migratedConfig.tools?.core).toEqual(['read_file']);
      expect(migratedConfig.tools?.exclude).toEqual(['shell']);
      expect(migratedConfig.tools?.allowed).toEqual(['fetch']);
      expect(migratedConfig.security?.folderTrust?.enabled).toBe(false);
      expect(migratedConfig.ui?.showMemoryUsage).toBe(true);
      expect(migratedConfig.general?.checkpointing?.enabled).toBe(true);
      expect(migratedConfig.context?.fileFiltering?.respectGitIgnore).toBe(
        true,
      );
    });

    it('should preserve non-plain objects (such as Date and RegExp) without stripping their prototypes in customDeepMerge and resolveEnvVarsInObject', async () => {
      const { customDeepMerge, resolveEnvVarsInObject } = await import(
        './settings.js'
      );
      vi.stubEnv('A2A_TEST_HOST', 'localhost');

      const dateInstance = new Date('2026-09-24T00:00:00.000Z');
      const regexInstance = /^gemini-.*$/i;

      const resolved = resolveEnvVarsInObject({
        endpoint: 'http://${A2A_TEST_HOST}:8080',
        createdAt: dateInstance,
        pattern: regexInstance,
      });

      expect(resolved.endpoint).toBe('http://localhost:8080');
      expect(resolved.createdAt).toBe(dateInstance);
      expect(resolved.createdAt).toBeInstanceOf(Date);
      expect(resolved.pattern).toBe(regexInstance);
      expect(resolved.pattern).toBeInstanceOf(RegExp);

      const merged = customDeepMerge(
        () => undefined,
        {
          nested: { createdAt: new Date('2025-01-01T00:00:00.000Z'), keep: 1 },
        },
        { nested: { createdAt: dateInstance, pattern: regexInstance } },
      ) as { nested: { createdAt: Date; pattern: RegExp; keep: number } };

      expect(merged.nested.keep).toBe(1);
      expect(merged.nested.createdAt).toBe(dateInstance);
      expect(merged.nested.createdAt).toBeInstanceOf(Date);
      expect(merged.nested.pattern).toBe(regexInstance);
      expect(merged.nested.pattern).toBeInstanceOf(RegExp);

      vi.unstubAllEnvs();
    });
  });
});
