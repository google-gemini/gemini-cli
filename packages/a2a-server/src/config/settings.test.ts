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
  loadSettings,
  USER_SETTINGS_PATH,
  resolveEnvVarsInString,
} from './settings.js';
import {
  debugLogger,
  checkPathTrust,
  Config,
  SimpleExtensionLoader,
} from '@google/gemini-cli-core';
import * as core from '@google/gemini-cli-core';
import { loadConfig } from './config.js';

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
  const systemSettingsPath = path.join(mockHomeDir, 'system-settings.json');
  const systemDefaultsPath = path.join(mockHomeDir, 'system-defaults.json');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_CLI_SYSTEM_SETTINGS_PATH', systemSettingsPath);
    vi.stubEnv('GEMINI_CLI_SYSTEM_DEFAULTS_PATH', systemDefaultsPath);
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
    vi.unstubAllEnvs();
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

  describe('system settings layers', () => {
    it.each([
      { layers: 1, trusted: true, expected: 'defaults' },
      { layers: 2, trusted: true, expected: 'user' },
      { layers: 3, trusted: true, expected: 'workspace' },
      { layers: 3, trusted: false, expected: 'user' },
      { layers: 4, trusted: true, expected: 'system' },
      { layers: 4, trusted: false, expected: 'system' },
    ])(
      'uses $expected with $layers layers and trusted=$trusted',
      ({ layers, trusted, expected }) => {
        const files = [
          [systemDefaultsPath, 'defaults'],
          [USER_SETTINGS_PATH, 'user'],
          [path.join(mockGeminiWorkspaceDir, 'settings.json'), 'workspace'],
          [systemSettingsPath, 'system'],
        ];
        for (const [filePath, name] of files.slice(0, layers)) {
          fs.writeFileSync(
            filePath,
            JSON.stringify({
              model: { name },
              tools: { core: [name], exclude: [`${name}-excluded`] },
            }),
          );
        }

        const result = loadSettings(mockWorkspaceDir, trusted);
        expect(result.model?.name).toBe(expected);
        expect(result.tools?.core).toEqual([expected]);
        expect(result.tools?.exclude).toEqual([`${expected}-excluded`]);
      },
    );

    it('migrates and resolves environment variables in system files while preserving nested defaults', () => {
      vi.stubEnv('A2A_TEST_TOOL', 'read_file');
      fs.writeFileSync(
        systemDefaultsPath,
        JSON.stringify({
          coreTools: ['${A2A_TEST_TOOL}'],
          fileFiltering: { respectGitIgnore: true, respectGeminiIgnore: true },
        }),
      );
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify({
          excludeTools: ['run_shell_command'],
          fileFiltering: { respectGitIgnore: false },
        }),
      );

      const result = loadSettings(mockWorkspaceDir);
      expect(result.tools?.core).toEqual(['read_file']);
      expect(result.tools?.exclude).toEqual(['run_shell_command']);
      expect(result.context?.fileFiltering?.respectGitIgnore).toBe(false);
      expect(result.context?.fileFiltering?.respectGeminiIgnore).toBe(true);
    });

    it.each(['defaults', 'system'])(
      'reports malformed %s files and continues loading user settings',
      (layer) => {
        const invalidPath =
          layer === 'defaults' ? systemDefaultsPath : systemSettingsPath;
        fs.writeFileSync(invalidPath, '{ invalid json');
        fs.writeFileSync(
          USER_SETTINGS_PATH,
          JSON.stringify({ model: { name: 'user' } }),
        );

        expect(loadSettings(mockWorkspaceDir).model?.name).toBe('user');
        expect(debugLogger.error).toHaveBeenCalledWith(
          `  Path: ${invalidPath}`,
        );
      },
    );

    it('unions policy paths from system and user layers, excluding workspace paths', () => {
      for (const [filePath, name] of [
        [systemDefaultsPath, 'defaults'],
        [USER_SETTINGS_PATH, 'user'],
        [systemSettingsPath, 'system'],
        [path.join(mockGeminiWorkspaceDir, 'settings.json'), 'workspace'],
      ]) {
        fs.writeFileSync(
          filePath,
          JSON.stringify({
            policyPaths: [name, 'shared'],
            adminPolicyPaths: [`${name}-admin`, 'shared-admin'],
          }),
        );
      }

      const result = loadSettings(mockWorkspaceDir, true);
      expect(result.policyPaths).toEqual([
        'defaults',
        'shared',
        'user',
        'system',
      ]);
      expect(result.adminPolicyPaths).toEqual([
        'defaults-admin',
        'shared-admin',
        'user-admin',
        'system-admin',
      ]);
    });

    it.each([true, false])(
      'preserves system and user settings through runtime configuration with trusted=%s',
      async (trusted) => {
        vi.stubEnv('GEMINI_API_KEY', 'test-key');
        vi.spyOn(Config.prototype, 'initialize').mockResolvedValue(undefined);
        vi.spyOn(Config.prototype, 'waitForMcpInit').mockResolvedValue(
          undefined,
        );
        const policySpy = vi.spyOn(core, 'createPolicyEngineConfig');
        const layers = [
          [systemDefaultsPath, 'defaults'],
          [USER_SETTINGS_PATH, 'user'],
          [path.join(mockGeminiWorkspaceDir, 'settings.json'), 'workspace'],
          [systemSettingsPath, 'system'],
        ];
        for (const [filePath, name] of layers) {
          fs.writeFileSync(
            filePath,
            JSON.stringify({
              tools: { core: [name], exclude: [`${name}-excluded`] },
              policyPaths: [path.join(mockHomeDir, `${name}-policies`)],
              adminPolicyPaths: [path.join(mockHomeDir, `${name}-admin`)],
              mcpServers: { [name]: { command: name } },
              telemetry: { otlpEndpoint: `http://${name}:4317` },
            }),
          );
        }

        // Even if a caller supplies workspace settings, restricted mode must
        // recover the machine/user fields rather than discard them entirely.
        const settings = loadSettings(mockWorkspaceDir, true);
        const config = await loadConfig(
          settings,
          new SimpleExtensionLoader([]),
          'system-settings-test',
          trusted,
          mockWorkspaceDir,
        );

        expect(config.getCoreTools()).toEqual(['system']);
        expect(config.getExcludeTools()).toContain('system-excluded');
        expect(config.getTelemetryOtlpEndpoint()).toBe('http://system:4317');
        const policySettings = policySpy.mock.calls[0][0];
        expect(policySettings.tools?.core).toEqual(['system']);
        expect(policySettings.tools?.exclude).toEqual(['system-excluded']);
        for (const key of ['policyPaths', 'adminPolicyPaths'] as const) {
          const suffix = key === 'policyPaths' ? 'policies' : 'admin';
          expect(policySettings[key]).toEqual(
            ['defaults', 'user', 'system'].map((name) =>
              path.join(mockHomeDir, `${name}-${suffix}`),
            ),
          );
        }
        expect(Object.keys(config.getMcpServers() ?? {})).toEqual(
          trusted
            ? ['defaults', 'user', 'workspace', 'system']
            : ['defaults', 'user', 'system'],
        );
      },
    );

    it('uses system overrides when determining whether folder trust is enabled', () => {
      fs.writeFileSync(
        USER_SETTINGS_PATH,
        JSON.stringify({ security: { folderTrust: { enabled: false } } }),
      );
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify({ security: { folderTrust: { enabled: true } } }),
      );
      fs.writeFileSync(
        path.join(mockGeminiWorkspaceDir, 'settings.json'),
        JSON.stringify({ model: { name: 'workspace' } }),
      );

      expect(loadSettings(mockWorkspaceDir).model?.name).toBeUndefined();
      expect(checkPathTrust).toHaveBeenCalledWith(
        expect.objectContaining({ isFolderTrustEnabled: true }),
      );
    });
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

    it('should use default value in resolveEnvVarsInString when variable is set but empty', () => {
      vi.stubEnv('A2A_EMPTY_VAR', '');

      expect(
        resolveEnvVarsInString('${A2A_EMPTY_VAR:-http://localhost:8080}'),
      ).toBe('http://localhost:8080');
      expect(
        resolveEnvVarsInString('${A2A_UNSET_VAR:-http://localhost:8080}'),
      ).toBe('http://localhost:8080');
      expect(resolveEnvVarsInString('${A2A_EMPTY_VAR}')).toBe('');
    });
  });
});
