/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

// Mock 'os' first.
import * as osActual from 'node:os'; // Import for type info for the mock factory

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
    platform: vi.fn(() => 'linux'),
  };
});

// Mock './settings.js' to ensure it uses the mocked 'os.homedir()' for its internal constants.
vi.mock('./settings.js', async (importActual) => {
  const originalModule = await importActual<typeof import('./settings.js')>();
  return {
    __esModule: true, // Ensure correct module shape
    ...originalModule, // Re-export all original members
    // We are relying on originalModule's USER_SETTINGS_PATH being constructed with mocked os.homedir()
  };
});

// Mock trustedFolders
import * as trustedFolders from './trustedFolders.js';
vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(),
  isFolderTrustEnabled: vi.fn(),
  loadTrustedFolders: vi.fn(),
}));

vi.mock('./settingsSchema.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settingsSchema.js')>();
  return {
    ...actual,
    getSettingsSchema: vi.fn(actual.getSettingsSchema),
  };
});

// NOW import everything else, including the (now effectively re-exported) settings.js
import * as path from 'node:path'; // Restored for MOCK_WORKSPACE_SETTINGS_PATH
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs'; // fs will be mocked separately
import stripJsonComments from 'strip-json-comments'; // Will be mocked separately
import { isWorkspaceTrusted } from './trustedFolders.js';

// These imports will get the versions from the vi.mock('./settings.js', ...) factory.
import {
  loadSettings,
  USER_SETTINGS_PATH, // This IS the mocked path.
  getSystemSettingsPath,
  getSystemDefaultsPath,
  type Settings,
  type SettingsFile,
  saveSettings,
  getDefaultsFromSchema,
  loadEnvironment,
  migrateDeprecatedSettings,
  SettingScope,
  LoadedSettings,
  sanitizeEnvVar,
} from './settings.js';
import {
  FatalConfigError,
  GEMINI_DIR,
  type MCPServerConfig,
} from '@google/gemini-cli-core';
import { updateSettingsFilePreservingFormat } from '../utils/commentJson.js';
import {
  getSettingsSchema,
  MergeStrategy,
  type SettingsSchema,
} from './settingsSchema.js';
import { createMockSettings } from '../test-utils/settings.js';

const MOCK_WORKSPACE_DIR = '/mock/workspace';
// Use the (mocked) GEMINI_DIR for consistency
const MOCK_WORKSPACE_SETTINGS_PATH = path.join(
  MOCK_WORKSPACE_DIR,
  GEMINI_DIR,
  'settings.json',
);

// A more flexible type for test data that allows arbitrary properties.
type TestSettings = Settings & { [key: string]: unknown };

vi.mock('fs', async (importOriginal) => {
  // Get all the functions from the real 'fs' module
  const actualFs = await importOriginal<typeof fs>();

  return {
    ...actualFs, // Keep all the real functions
    // Now, just override the ones we need for the test
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
  };
});

vi.mock('./extension.js');

const mockCoreEvents = vi.hoisted(() => ({
  emitFeedback: vi.fn(),
  emitSettingsChanged: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const os = await import('node:os');
  return {
    ...actual,
    coreEvents: mockCoreEvents,
    homedir: vi.fn(() => os.homedir()),
  };
});

vi.mock('../utils/commentJson.js', () => ({
  updateSettingsFilePreservingFormat: vi.fn(),
}));

vi.mock('strip-json-comments', () => ({
  default: vi.fn((content) => content),
}));

describe('Settings Loading and Merging', () => {
  let mockFsExistsSync: Mocked<typeof fs.existsSync>;
  let mockStripJsonComments: Mocked<typeof stripJsonComments>;
  let mockFsMkdirSync: Mocked<typeof fs.mkdirSync>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockFsExistsSync = vi.mocked(fs.existsSync);
    mockFsMkdirSync = vi.mocked(fs.mkdirSync);
    mockStripJsonComments = vi.mocked(stripJsonComments);

    vi.mocked(osActual.homedir).mockReturnValue('/mock/home/user');
    (mockStripJsonComments as unknown as Mock).mockImplementation(
      (jsonString: string) => jsonString,
    );
    (mockFsExistsSync as Mock).mockReturnValue(false);
    (fs.readFileSync as Mock).mockReturnValue('{}'); // Return valid empty JSON
    (mockFsMkdirSync as Mock).mockImplementation(() => undefined);
    vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadSettings', () => {
    it.each([
      {
        scope: 'system',
        path: getSystemSettingsPath(),
        content: {
          ui: { theme: 'system-default' },
          tools: { sandbox: false },
        },
      },
      {
        scope: 'user',
        path: USER_SETTINGS_PATH,
        content: {
          ui: { theme: 'dark' },
          context: { fileName: 'USER_CONTEXT.md' },
        },
      },
      {
        scope: 'workspace',
        path: MOCK_WORKSPACE_SETTINGS_PATH,
        content: {
          tools: { sandbox: true },
          context: { fileName: 'WORKSPACE_CONTEXT.md' },
        },
      },
    ])(
      'should load $scope settings if only $scope file exists',
      ({ scope, path, content }) => {
        (mockFsExistsSync as Mock).mockImplementation(
          (p: fs.PathLike) => p === path,
        );
        (fs.readFileSync as Mock).mockImplementation(
          (p: fs.PathOrFileDescriptor) => {
            if (p === path) return JSON.stringify(content);
            return '{}';
          },
        );

        const settings = loadSettings(MOCK_WORKSPACE_DIR);

        expect(fs.readFileSync).toHaveBeenCalledWith(path, 'utf-8');
        expect(
          settings[scope as 'system' | 'user' | 'workspace'].settings,
        ).toEqual(content);
        expect(settings.merged).toMatchObject(content);
      },
    );

    it('should merge system, user and workspace settings, with system taking precedence over workspace, and workspace over user', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) =>
          p === getSystemSettingsPath() ||
          p === USER_SETTINGS_PATH ||
          p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const systemSettingsContent = {
        ui: {
          theme: 'system-theme',
        },
        tools: {
          sandbox: false,
        },
        mcp: {
          allowed: ['server1', 'server2'],
        },
        telemetry: { enabled: false },
      };
      const userSettingsContent = {
        ui: {
          theme: 'dark',
        },
        tools: {
          sandbox: true,
        },
        context: {
          fileName: 'USER_CONTEXT.md',
        },
      };
      const workspaceSettingsContent = {
        tools: {
          sandbox: false,
          core: ['tool1'],
        },
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
        },
        mcp: {
          allowed: ['server1', 'server2', 'server3'],
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.system.settings).toEqual(systemSettingsContent);
      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toMatchObject({
        ui: {
          theme: 'system-theme',
        },
        tools: {
          sandbox: false,
          core: ['tool1'],
        },
        telemetry: { enabled: false },
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
        },
        mcp: {
          allowed: ['server1', 'server2'],
        },
      });
    });

    it('should merge all settings files with the correct precedence', () => {
      // Mock schema to test defaults application
      const mockSchema = {
        ui: { type: 'object', default: {}, properties: {} },
        tools: { type: 'object', default: {}, properties: {} },
        context: {
          type: 'object',
          default: {},
          properties: {
            discoveryMaxDirs: { type: 'number', default: 200 },
            includeDirectories: {
              type: 'array',
              default: [],
              mergeStrategy: MergeStrategy.CONCAT,
            },
          },
        },
        mcpServers: { type: 'object', default: {} },
      };

      (getSettingsSchema as Mock).mockReturnValue(
        mockSchema as unknown as SettingsSchema,
      );

      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemDefaultsContent = {
        ui: {
          theme: 'default-theme',
        },
        tools: {
          sandbox: true,
        },
        telemetry: true,
        context: {
          includeDirectories: ['/system/defaults/dir'],
        },
      };
      const userSettingsContent = {
        ui: {
          theme: 'user-theme',
        },
        context: {
          fileName: 'USER_CONTEXT.md',
          includeDirectories: ['/user/dir1', '/user/dir2'],
        },
      };
      const workspaceSettingsContent = {
        tools: {
          sandbox: false,
        },
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
          includeDirectories: ['/workspace/dir'],
        },
      };
      const systemSettingsContent = {
        ui: {
          theme: 'system-theme',
        },
        telemetry: false,
        context: {
          includeDirectories: ['/system/dir'],
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemDefaultsPath())
            return JSON.stringify(systemDefaultsContent);
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.systemDefaults.settings).toEqual(systemDefaultsContent);
      expect(settings.system.settings).toEqual(systemSettingsContent);
      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toEqual({
        context: {
          discoveryMaxDirs: 200,
          includeDirectories: [
            '/system/defaults/dir',
            '/user/dir1',
            '/user/dir2',
            '/workspace/dir',
            '/system/dir',
          ],
          fileName: 'WORKSPACE_CONTEXT.md',
        },
        mcpServers: {},
        ui: { theme: 'system-theme' },
        tools: { sandbox: false },
        telemetry: false,
      });
    });

    it('should use folderTrust from workspace settings when trusted', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      };
      const workspaceSettingsContent = {
        security: {
          folderTrust: {
            enabled: false, // This should be used
          },
        },
      };
      const systemSettingsContent = {
        // No folderTrust here
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.security?.folderTrust?.enabled).toBe(false); // Workspace setting should be used
    });

    it('should use system folderTrust over user setting', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        security: {
          folderTrust: {
            enabled: false,
          },
        },
      };
      const workspaceSettingsContent = {
        security: {
          folderTrust: {
            enabled: true, // This should be ignored
          },
        },
      };
      const systemSettingsContent = {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.security?.folderTrust?.enabled).toBe(true); // System setting should be used
    });

    it('should not allow user or workspace to override system disableYoloMode', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        security: {
          disableYoloMode: false,
        },
      };
      const workspaceSettingsContent = {
        security: {
          disableYoloMode: false, // This should be ignored
        },
      };
      const systemSettingsContent = {
        security: {
          disableYoloMode: true,
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.security?.disableYoloMode).toBe(true); // System setting should be used
    });

    it.each([
      {
        description: 'contextFileName in user settings',
        path: USER_SETTINGS_PATH,
        content: { context: { fileName: 'CUSTOM.md' } },
        expected: { key: 'context.fileName', value: 'CUSTOM.md' },
      },
      {
        description: 'contextFileName in workspace settings',
        path: MOCK_WORKSPACE_SETTINGS_PATH,
        content: { context: { fileName: 'PROJECT_SPECIFIC.md' } },
        expected: { key: 'context.fileName', value: 'PROJECT_SPECIFIC.md' },
      },
      {
        description: 'excludedProjectEnvVars in user settings',
        path: USER_SETTINGS_PATH,
        content: {
          advanced: { excludedEnvVars: ['DEBUG', 'NODE_ENV', 'CUSTOM_VAR'] },
        },
        expected: {
          key: 'advanced.excludedEnvVars',
          value: ['DEBUG', 'DEBUG_MODE', 'NODE_ENV', 'CUSTOM_VAR'],
        },
      },
      {
        description: 'excludedProjectEnvVars in workspace settings',
        path: MOCK_WORKSPACE_SETTINGS_PATH,
        content: {
          advanced: { excludedEnvVars: ['WORKSPACE_DEBUG', 'WORKSPACE_VAR'] },
        },
        expected: {
          key: 'advanced.excludedEnvVars',
          value: ['DEBUG', 'DEBUG_MODE', 'WORKSPACE_DEBUG', 'WORKSPACE_VAR'],
        },
      },
    ])(
      'should handle $description correctly',
      ({ path, content, expected }) => {
        (mockFsExistsSync as Mock).mockImplementation(
          (p: fs.PathLike) => p === path,
        );
        (fs.readFileSync as Mock).mockImplementation(
          (p: fs.PathOrFileDescriptor) => {
            if (p === path) return JSON.stringify(content);
            return '{}';
          },
        );

        const settings = loadSettings(MOCK_WORKSPACE_DIR);
        const keys = expected.key.split('.');
        let result: unknown = settings.merged;
        for (const key of keys) {
          result = (result as { [key: string]: unknown })[key];
        }
        expect(result).toEqual(expected.value);
      },
    );

    it('should merge excludedProjectEnvVars with workspace taking precedence over user', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) =>
          p === USER_SETTINGS_PATH || p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const userSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['DEBUG', 'NODE_ENV', 'USER_VAR'] },
      };
      const workspaceSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['WORKSPACE_DEBUG', 'WORKSPACE_VAR'] },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'USER_VAR',
      ]);
      expect(settings.workspace.settings.advanced?.excludedEnvVars).toEqual([
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'DEBUG_MODE',
        'NODE_ENV',
        'USER_VAR',
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
    });

    it('should default contextFileName to undefined if not in any settings file', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) =>
          p === USER_SETTINGS_PATH || p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const userSettingsContent = { ui: { theme: 'dark' } };
      const workspaceSettingsContent = { tools: { sandbox: true } };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.context?.fileName).toBeUndefined();
    });

    it.each([
      {
        scope: 'user',
        path: USER_SETTINGS_PATH,
        content: { telemetry: { enabled: true } },
        expected: true,
      },
      {
        scope: 'workspace',
        path: MOCK_WORKSPACE_SETTINGS_PATH,
        content: { telemetry: { enabled: false } },
        expected: false,
      },
    ])(
      'should load telemetry setting from $scope settings',
      ({ path, content, expected }) => {
        (mockFsExistsSync as Mock).mockImplementation(
          (p: fs.PathLike) => p === path,
        );
        (fs.readFileSync as Mock).mockImplementation(
          (p: fs.PathOrFileDescriptor) => {
            if (p === path) return JSON.stringify(content);
            return '{}';
          },
        );
        const settings = loadSettings(MOCK_WORKSPACE_DIR);
        expect(settings.merged.telemetry?.enabled).toBe(expected);
      },
    );

    it('should prioritize workspace telemetry setting over user setting', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = { telemetry: { enabled: true } };
      const workspaceSettingsContent = { telemetry: { enabled: false } };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry?.enabled).toBe(false);
    });

    it('should have telemetry as undefined if not in any settings file', () => {
      (mockFsExistsSync as Mock).mockReturnValue(false); // No settings files exist
      (fs.readFileSync as Mock).mockReturnValue('{}');
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry).toBeUndefined();
      expect(settings.merged.ui).toBeDefined();
      expect(settings.merged.mcpServers).toEqual({});
    });

    it('should merge MCP servers correctly, with workspace taking precedence', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) =>
          p === USER_SETTINGS_PATH || p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const userSettingsContent = {
        mcpServers: {
          'user-server': {
            command: 'user-command',
            args: ['--user-arg'],
            description: 'User MCP server',
          },
          'shared-server': {
            command: 'user-shared-command',
            description: 'User shared server config',
          },
        },
      };
      const workspaceSettingsContent = {
        mcpServers: {
          'workspace-server': {
            command: 'workspace-command',
            args: ['--workspace-arg'],
            description: 'Workspace MCP server',
          },
          'shared-server': {
            command: 'workspace-shared-command',
            description: 'Workspace shared server config',
          },
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged.mcpServers).toEqual({
        'user-server': {
          command: 'user-command',
          args: ['--user-arg'],
          description: 'User MCP server',
        },
        'workspace-server': {
          command: 'workspace-command',
          args: ['--workspace-arg'],
          description: 'Workspace MCP server',
        },
        'shared-server': {
          command: 'workspace-shared-command',
          description: 'Workspace shared server config',
        },
      });
    });

    it.each([
      {
        scope: 'user',
        path: USER_SETTINGS_PATH,
        content: {
          mcpServers: {
            'user-only-server': {
              command: 'user-only-command',
              description: 'User only server',
            },
          },
        },
        expected: {
          'user-only-server': {
            command: 'user-only-command',
            description: 'User only server',
          },
        },
      },
      {
        scope: 'workspace',
        path: MOCK_WORKSPACE_SETTINGS_PATH,
        content: {
          mcpServers: {
            'workspace-only-server': {
              command: 'workspace-only-command',
              description: 'Workspace only server',
            },
          },
        },
        expected: {
          'workspace-only-server': {
            command: 'workspace-only-command',
            description: 'Workspace only server',
          },
        },
      },
    ])(
      'should handle MCP servers when only in $scope settings',
      ({ path, content, expected }) => {
        (mockFsExistsSync as Mock).mockImplementation(
          (p: fs.PathLike) => p === path,
        );
        (fs.readFileSync as Mock).mockImplementation(
          (p: fs.PathOrFileDescriptor) => {
            if (p === path) return JSON.stringify(content);
            return '{}';
          },
        );

        const settings = loadSettings(MOCK_WORKSPACE_DIR);
        expect(settings.merged.mcpServers).toEqual(expected);
      },
    );

    it('should have mcpServers as undefined if not in any settings file', () => {
      (mockFsExistsSync as Mock).mockReturnValue(false); // No settings files exist
      (fs.readFileSync as Mock).mockReturnValue('{}');
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.mcpServers).toEqual({});
    });

    it('should merge MCP servers from system, user, and workspace with system taking precedence', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemSettingsContent = {
        mcpServers: {
          'shared-server': {
            command: 'system-command',
            args: ['--system-arg'],
          },
          'system-only-server': {
            command: 'system-only-command',
          },
        },
      };
      const userSettingsContent = {
        mcpServers: {
          'user-server': {
            command: 'user-command',
          },
          'shared-server': {
            command: 'user-command',
            description: 'from user',
          },
        },
      };
      const workspaceSettingsContent = {
        mcpServers: {
          'workspace-server': {
            command: 'workspace-command',
          },
          'shared-server': {
            command: 'workspace-command',
            args: ['--workspace-arg'],
          },
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged.mcpServers).toEqual({
        'user-server': {
          command: 'user-command',
        },
        'workspace-server': {
          command: 'workspace-command',
        },
        'system-only-server': {
          command: 'system-only-command',
        },
        'shared-server': {
          command: 'system-command',
          args: ['--system-arg'],
        },
      });
    });

    it('should merge mcp allowed/excluded lists with system taking precedence over workspace', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemSettingsContent = {
        mcp: {
          allowed: ['system-allowed'],
        },
      };
      const userSettingsContent = {
        mcp: {
          allowed: ['user-allowed'],
          excluded: ['user-excluded'],
        },
      };
      const workspaceSettingsContent = {
        mcp: {
          allowed: ['workspace-allowed'],
          excluded: ['workspace-excluded'],
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged.mcp).toEqual({
        allowed: ['system-allowed'],
        excluded: ['workspace-excluded'],
      });
    });

    describe('compressionThreshold settings', () => {
      it.each([
        {
          description:
            'should be taken from user settings if only present there',
          userContent: { model: { compressionThreshold: 0.5 } },
          workspaceContent: {},
          expected: 0.5,
        },
        {
          description:
            'should be taken from workspace settings if only present there',
          userContent: {},
          workspaceContent: { model: { compressionThreshold: 0.8 } },
          expected: 0.8,
        },
        {
          description:
            'should prioritize workspace settings over user settings',
          userContent: { model: { compressionThreshold: 0.5 } },
          workspaceContent: { model: { compressionThreshold: 0.8 } },
          expected: 0.8,
        },
        {
          description: 'should be default if not in any settings file',
          userContent: {},
          workspaceContent: {},
          expected: 0.5,
        },
      ])('$description', ({ userContent, workspaceContent, expected }) => {
        (mockFsExistsSync as Mock).mockReturnValue(true);
        (fs.readFileSync as Mock).mockImplementation(
          (p: fs.PathOrFileDescriptor) => {
            if (p === USER_SETTINGS_PATH) return JSON.stringify(userContent);
            if (p === MOCK_WORKSPACE_SETTINGS_PATH)
              return JSON.stringify(workspaceContent);
            return '{}';
          },
        );

        const settings = loadSettings(MOCK_WORKSPACE_DIR);
        expect(settings.merged.model?.compressionThreshold).toEqual(expected);
      });
    });

    it('should use user compressionThreshold if workspace does not define it', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        general: {},
        model: { compressionThreshold: 0.5 },
      };
      const workspaceSettingsContent = {
        general: {},
        model: {},
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged.model?.compressionThreshold).toEqual(0.5);
    });

    it('should merge includeDirectories from all scopes', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemSettingsContent = {
        context: { includeDirectories: ['/system/dir'] },
      };
      const systemDefaultsContent = {
        context: { includeDirectories: ['/system/defaults/dir'] },
      };
      const userSettingsContent = {
        context: { includeDirectories: ['/user/dir1', '/user/dir2'] },
      };
      const workspaceSettingsContent = {
        context: { includeDirectories: ['/workspace/dir'] },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          if (p === getSystemDefaultsPath())
            return JSON.stringify(systemDefaultsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged.context?.includeDirectories).toEqual([
        '/system/defaults/dir',
        '/user/dir1',
        '/user/dir2',
        '/workspace/dir',
        '/system/dir',
      ]);
    });

    it('should handle JSON parsing errors gracefully', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true); // Both files "exist"
      const invalidJsonContent = 'invalid json';
      const userReadError = new SyntaxError(
        "Expected ',' or '}' after property value in JSON at position 10",
      );
      const workspaceReadError = new SyntaxError(
        'Unexpected token i in JSON at position 0',
      );

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH) {
            // Simulate JSON.parse throwing for user settings
            vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
              throw userReadError;
            });
            return invalidJsonContent; // Content that would cause JSON.parse to throw
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            // Simulate JSON.parse throwing for workspace settings
            vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
              throw workspaceReadError;
            });
            return invalidJsonContent;
          }
          return '{}'; // Default for other reads
        },
      );

      try {
        loadSettings(MOCK_WORKSPACE_DIR);
        throw new Error('loadSettings should have thrown a FatalConfigError');
      } catch (e) {
        expect(e).toBeInstanceOf(FatalConfigError);
        const error = e as FatalConfigError;
        expect(error.message).toContain(
          `Error in ${USER_SETTINGS_PATH}: ${userReadError.message}`,
        );
        expect(error.message).toContain(
          `Error in ${MOCK_WORKSPACE_SETTINGS_PATH}: ${workspaceReadError.message}`,
        );
        expect(error.message).toContain(
          'Please fix the configuration file(s) and try again.',
        );
      }

      // Restore JSON.parse mock if it was spied on specifically for this test
      vi.restoreAllMocks(); // Or more targeted restore if needed
    });

    it('should resolve environment variables in user settings', () => {
      process.env['TEST_API_KEY'] = 'user_api_key_from_env';
      const userSettingsContent: TestSettings = {
        apiKey: '$TEST_API_KEY',
        someUrl: 'https://test.com/${TEST_API_KEY}',
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect((settings.user.settings as TestSettings)['apiKey']).toBe(
        'user_api_key_from_env',
      );
      expect((settings.user.settings as TestSettings)['someUrl']).toBe(
        'https://test.com/user_api_key_from_env',
      );
      expect((settings.merged as TestSettings)['apiKey']).toBe(
        'user_api_key_from_env',
      );
      delete process.env['TEST_API_KEY'];
    });

    it('should resolve environment variables in workspace settings', () => {
      process.env['WORKSPACE_ENDPOINT'] = 'workspace_endpoint_from_env';
      const workspaceSettingsContent: TestSettings = {
        endpoint: '${WORKSPACE_ENDPOINT}/api',
        nested: { value: '$WORKSPACE_ENDPOINT' },
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect((settings.workspace.settings as TestSettings)['endpoint']).toBe(
        'workspace_endpoint_from_env/api',
      );
      const nested = (settings.workspace.settings as TestSettings)[
        'nested'
      ] as Record<string, unknown>;
      expect(nested['value']).toBe('workspace_endpoint_from_env');
      expect((settings.merged as TestSettings)['endpoint']).toBe(
        'workspace_endpoint_from_env/api',
      );
      delete process.env['WORKSPACE_ENDPOINT'];
    });

    it('should correctly resolve and merge env variables from different scopes', () => {
      process.env['SYSTEM_VAR'] = 'system_value';
      process.env['USER_VAR'] = 'user_value';
      process.env['WORKSPACE_VAR'] = 'workspace_value';
      process.env['SHARED_VAR'] = 'final_value';

      const systemSettingsContent: TestSettings = {
        configValue: '$SHARED_VAR',
        systemOnly: '$SYSTEM_VAR',
      };
      const userSettingsContent: TestSettings = {
        configValue: '$SHARED_VAR',
        userOnly: '$USER_VAR',
        ui: {
          theme: 'dark',
        },
      };
      const workspaceSettingsContent: TestSettings = {
        configValue: '$SHARED_VAR',
        workspaceOnly: '$WORKSPACE_VAR',
        ui: {
          theme: 'light',
        },
      };

      (mockFsExistsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath()) {
            return JSON.stringify(systemSettingsContent);
          }
          if (p === USER_SETTINGS_PATH) {
            return JSON.stringify(userSettingsContent);
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            return JSON.stringify(workspaceSettingsContent);
          }
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // Check resolved values in individual scopes
      expect((settings.system.settings as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect((settings.system.settings as TestSettings)['systemOnly']).toBe(
        'system_value',
      );
      expect((settings.user.settings as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect((settings.user.settings as TestSettings)['userOnly']).toBe(
        'user_value',
      );
      expect((settings.workspace.settings as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect(
        (settings.workspace.settings as TestSettings)['workspaceOnly'],
      ).toBe('workspace_value');

      // Check merged values (system > workspace > user)
      expect((settings.merged as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect((settings.merged as TestSettings)['systemOnly']).toBe(
        'system_value',
      );
      expect((settings.merged as TestSettings)['userOnly']).toBe('user_value');
      expect((settings.merged as TestSettings)['workspaceOnly']).toBe(
        'workspace_value',
      );
      expect(settings.merged.ui?.theme).toBe('light'); // workspace overrides user

      delete process.env['SYSTEM_VAR'];
      delete process.env['USER_VAR'];
      delete process.env['WORKSPACE_VAR'];
      delete process.env['SHARED_VAR'];
    });

    it('should correctly merge dnsResolutionOrder with workspace taking precedence', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        advanced: { dnsResolutionOrder: 'ipv4first' },
      };
      const workspaceSettingsContent = {
        advanced: { dnsResolutionOrder: 'verbatim' },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.advanced?.dnsResolutionOrder).toBe('verbatim');
    });

    it('should use user dnsResolutionOrder if workspace is not defined', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = {
        advanced: { dnsResolutionOrder: 'verbatim' },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.advanced?.dnsResolutionOrder).toBe('verbatim');
    });

    it('should leave unresolved environment variables as is', () => {
      const userSettingsContent: TestSettings = { apiKey: '$UNDEFINED_VAR' };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect((settings.user.settings as TestSettings)['apiKey']).toBe(
        '$UNDEFINED_VAR',
      );
      expect((settings.merged as TestSettings)['apiKey']).toBe(
        '$UNDEFINED_VAR',
      );
    });

    it('should resolve multiple environment variables in a single string', () => {
      process.env['VAR_A'] = 'valueA';
      process.env['VAR_B'] = 'valueB';
      const userSettingsContent: TestSettings = {
        path: '/path/$VAR_A/${VAR_B}/end',
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect((settings.user.settings as TestSettings)['path']).toBe(
        '/path/valueA/valueB/end',
      );
      delete process.env['VAR_A'];
      delete process.env['VAR_B'];
    });

    it('should resolve environment variables in arrays', () => {
      process.env['ITEM_1'] = 'item1_env';
      process.env['ITEM_2'] = 'item2_env';
      const userSettingsContent: TestSettings = {
        list: ['$ITEM_1', '${ITEM_2}', 'literal'],
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect((settings.user.settings as TestSettings)['list']).toEqual([
        'item1_env',
        'item2_env',
        'literal',
      ]);
      delete process.env['ITEM_1'];
      delete process.env['ITEM_2'];
    });

    it('should correctly pass through null, boolean, and number types, and handle undefined properties', () => {
      process.env['MY_ENV_STRING'] = 'env_string_value';
      process.env['MY_ENV_STRING_NESTED'] = 'env_string_nested_value';

      const userSettingsContent: TestSettings = {
        nullVal: null,
        trueVal: true,
        falseVal: false,
        numberVal: 123.45,
        stringVal: '$MY_ENV_STRING',
        nestedObj: {
          nestedNull: null,
          nestedBool: true,
          nestedNum: 0,
          nestedString: 'literal',
          anotherEnv: '${MY_ENV_STRING_NESTED}',
        },
      };

      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect((settings.user.settings as TestSettings)['nullVal']).toBeNull();
      expect((settings.user.settings as TestSettings)['trueVal']).toBe(true);
      expect((settings.user.settings as TestSettings)['falseVal']).toBe(false);
      expect((settings.user.settings as TestSettings)['numberVal']).toBe(
        123.45,
      );
      expect((settings.user.settings as TestSettings)['stringVal']).toBe(
        'env_string_value',
      );
      expect(
        (settings.user.settings as TestSettings)['undefinedVal'],
      ).toBeUndefined();

      const nestedObj = (settings.user.settings as TestSettings)[
        'nestedObj'
      ] as Record<string, unknown>;
      expect(nestedObj['nestedNull']).toBeNull();
      expect(nestedObj['nestedBool']).toBe(true);
      expect(nestedObj['nestedNum']).toBe(0);
      expect(nestedObj['nestedString']).toBe('literal');
      expect(nestedObj['anotherEnv']).toBe('env_string_nested_value');

      delete process.env['MY_ENV_STRING'];
      delete process.env['MY_ENV_STRING_NESTED'];
    });

    it('should resolve multiple concatenated environment variables in a single string value', () => {
      process.env['TEST_HOST'] = 'myhost';
      process.env['TEST_PORT'] = '9090';
      const userSettingsContent: TestSettings = {
        serverAddress: '${TEST_HOST}:${TEST_PORT}/api',
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect((settings.user.settings as TestSettings)['serverAddress']).toBe(
        'myhost:9090/api',
      );

      delete process.env['TEST_HOST'];
      delete process.env['TEST_PORT'];
    });

    describe('when GEMINI_CLI_SYSTEM_SETTINGS_PATH is set', () => {
      const MOCK_ENV_SYSTEM_SETTINGS_PATH = '/mock/env/system/settings.json';

      beforeEach(() => {
        process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] =
          MOCK_ENV_SYSTEM_SETTINGS_PATH;
      });

      afterEach(() => {
        delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
      });

      it('should load system settings from the path specified in the environment variable', () => {
        (mockFsExistsSync as Mock).mockImplementation(
          (p: fs.PathLike) => p === MOCK_ENV_SYSTEM_SETTINGS_PATH,
        );
        const systemSettingsContent = {
          ui: { theme: 'env-var-theme' },
          tools: { sandbox: true },
        };
        (fs.readFileSync as Mock).mockImplementation(
          (p: fs.PathOrFileDescriptor) => {
            if (p === MOCK_ENV_SYSTEM_SETTINGS_PATH)
              return JSON.stringify(systemSettingsContent);
            return '{}';
          },
        );

        const settings = loadSettings(MOCK_WORKSPACE_DIR);

        expect(fs.readFileSync).toHaveBeenCalledWith(
          MOCK_ENV_SYSTEM_SETTINGS_PATH,
          'utf-8',
        );
        expect(settings.system.path).toBe(MOCK_ENV_SYSTEM_SETTINGS_PATH);
        expect(settings.system.settings).toEqual(systemSettingsContent);
        expect(settings.merged).toMatchObject({
          ...systemSettingsContent,
        });
      });
    });

    it('should correctly skip workspace-level loading if workspaceDir is a symlink to home', () => {
      const mockHomeDir = '/mock/home/user';
      const mockSymlinkDir = '/mock/symlink/to/home';
      const mockWorkspaceSettingsPath = path.join(
        mockSymlinkDir,
        GEMINI_DIR,
        'settings.json',
      );

      vi.mocked(osActual.homedir).mockReturnValue(mockHomeDir);
      vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => {
        const pStr = p.toString();
        const resolved = path.resolve(pStr);
        if (
          resolved === path.resolve(mockSymlinkDir) ||
          resolved === path.resolve(mockHomeDir)
        ) {
          return mockHomeDir;
        }
        return pStr;
      });

      (mockFsExistsSync as Mock).mockImplementation(
        (p: string) =>
          // Only return true for workspace settings path to see if it gets loaded
          p === mockWorkspaceSettingsPath,
      );

      const settings = loadSettings(mockSymlinkDir);

      // Verify that even though the file exists, it was NOT loaded because realpath matched home
      expect(fs.readFileSync).not.toHaveBeenCalledWith(
        mockWorkspaceSettingsPath,
        'utf-8',
      );
      expect(settings.workspace.settings).toEqual({});
    });
  });

  describe('excludedProjectEnvVars integration', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should exclude DEBUG and DEBUG_MODE from project .env files by default', () => {
      // Create a workspace settings file with excludedProjectEnvVars
      const workspaceSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['DEBUG', 'DEBUG_MODE'] },
      };

      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      // Mock findEnvFile to return a project .env file
      const originalFindEnvFile = (
        loadSettings as unknown as { findEnvFile: () => string }
      ).findEnvFile;
      (loadSettings as unknown as { findEnvFile: () => string }).findEnvFile =
        () => '/mock/project/.env';

      // Mock fs.readFileSync for .env file content
      const originalReadFileSync = fs.readFileSync;
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === '/mock/project/.env') {
            return 'DEBUG=true\nDEBUG_MODE=1\nGEMINI_API_KEY=test-key';
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            return JSON.stringify(workspaceSettingsContent);
          }
          return '{}';
        },
      );

      try {
        // This will call loadEnvironment internally with the merged settings
        const settings = loadSettings(MOCK_WORKSPACE_DIR);

        // Verify the settings were loaded correctly
        expect(settings.merged.advanced?.excludedEnvVars).toEqual([
          'DEBUG',
          'DEBUG_MODE',
        ]);

        // Note: We can't directly test process.env changes here because the mocking
        // prevents the actual file system operations, but we can verify the settings
        // are correctly merged and passed to loadEnvironment
      } finally {
        (loadSettings as unknown as { findEnvFile: () => string }).findEnvFile =
          originalFindEnvFile;
        (fs.readFileSync as Mock).mockImplementation(originalReadFileSync);
      }
    });

    it('should respect custom excludedProjectEnvVars from user settings', () => {
      const userSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['NODE_ENV', 'DEBUG'] },
      };

      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.user.settings.advanced?.excludedEnvVars).toEqual([
        'NODE_ENV',
        'DEBUG',
      ]);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'DEBUG_MODE',
        'NODE_ENV',
      ]);
    });

    it('should merge excludedProjectEnvVars with workspace taking precedence', () => {
      const userSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['DEBUG', 'NODE_ENV', 'USER_VAR'] },
      };
      const workspaceSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['WORKSPACE_DEBUG', 'WORKSPACE_VAR'] },
      };

      (mockFsExistsSync as Mock).mockReturnValue(true);

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'USER_VAR',
      ]);
      expect(settings.workspace.settings.advanced?.excludedEnvVars).toEqual([
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'DEBUG_MODE',
        'NODE_ENV',
        'USER_VAR',
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
    });
  });

  describe('with workspace trust', () => {
    it('should merge workspace settings when workspace is trusted', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        ui: { theme: 'dark' },
        tools: { sandbox: false },
      };
      const workspaceSettingsContent = {
        tools: { sandbox: true },
        context: { fileName: 'WORKSPACE.md' },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.tools?.sandbox).toBe(true);
      expect(settings.merged.context?.fileName).toBe('WORKSPACE.md');
      expect(settings.merged.ui?.theme).toBe('dark');
    });

    it('should NOT merge workspace settings when workspace is not trusted', () => {
      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        ui: { theme: 'dark' },
        tools: { sandbox: false },
        context: { fileName: 'USER.md' },
      };
      const workspaceSettingsContent = {
        tools: { sandbox: true },
        context: { fileName: 'WORKSPACE.md' },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged.tools?.sandbox).toBe(false); // User setting
      expect(settings.merged.context?.fileName).toBe('USER.md'); // User setting
      expect(settings.merged.ui?.theme).toBe('dark'); // User setting
    });

    it('should NOT merge workspace settings when workspace trust is undefined', () => {
      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted: undefined,
        source: undefined,
      });
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        ui: { theme: 'dark' },
        tools: { sandbox: false },
        context: { fileName: 'USER.md' },
      };
      const workspaceSettingsContent = {
        tools: { sandbox: true },
        context: { fileName: 'WORKSPACE.md' },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged.tools?.sandbox).toBe(false); // User setting
      expect(settings.merged.context?.fileName).toBe('USER.md'); // User setting
    });
  });

  describe('loadEnvironment', () => {
    function setup({
      isFolderTrustEnabled = true,
      isWorkspaceTrustedValue = true as boolean | undefined,
    }) {
      delete process.env['GEMINI_API_KEY']; // reset
      delete process.env['TESTTEST']; // reset
      const geminiEnvPath = path.resolve(
        path.join(MOCK_WORKSPACE_DIR, GEMINI_DIR, '.env'),
      );

      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted: isWorkspaceTrustedValue,
        source: 'file',
      });
      (mockFsExistsSync as Mock).mockImplementation((p: fs.PathLike) => {
        const normalizedP = path.resolve(p.toString());
        return [path.resolve(USER_SETTINGS_PATH), geminiEnvPath].includes(
          normalizedP,
        );
      });
      const userSettingsContent: Settings = {
        ui: {
          theme: 'dark',
        },
        security: {
          folderTrust: {
            enabled: isFolderTrustEnabled,
          },
        },
        context: {
          fileName: 'USER_CONTEXT.md',
        },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          const normalizedP = path.resolve(p.toString());
          if (normalizedP === path.resolve(USER_SETTINGS_PATH))
            return JSON.stringify(userSettingsContent);
          if (normalizedP === geminiEnvPath)
            return 'TESTTEST=1234\nGEMINI_API_KEY=test-key';
          return '{}';
        },
      );
    }

    it('sets environment variables from .env files', () => {
      setup({ isFolderTrustEnabled: false, isWorkspaceTrustedValue: true });
      const settings = {
        security: { folderTrust: { enabled: false } },
      } as Settings;
      loadEnvironment(settings, MOCK_WORKSPACE_DIR, isWorkspaceTrusted);

      expect(process.env['TESTTEST']).toEqual('1234');
      expect(process.env['GEMINI_API_KEY']).toEqual('test-key');
    });

    it('does not load env files from untrusted spaces', () => {
      setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: false });
      const settings = {
        security: { folderTrust: { enabled: true } },
      } as Settings;
      loadEnvironment(settings, MOCK_WORKSPACE_DIR, isWorkspaceTrusted);

      expect(process.env['TESTTEST']).not.toEqual('1234');
    });

    it('does not load env files when trust is undefined', () => {
      delete process.env['TESTTEST'];
      // isWorkspaceTrusted returns {isTrusted: undefined} for matched rules with no trust value, or no matching rules.
      setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: undefined });
      const settings = {
        security: { folderTrust: { enabled: true } },
      } as Settings;

      const mockTrustFn = vi.fn().mockReturnValue({ isTrusted: undefined });
      loadEnvironment(settings, MOCK_WORKSPACE_DIR, mockTrustFn);

      expect(process.env['TESTTEST']).not.toEqual('1234');
      expect(process.env['GEMINI_API_KEY']).not.toEqual('test-key');
    });

    it('loads whitelisted env files from untrusted spaces if sandboxing is enabled', () => {
      setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: false });
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      settings.merged.tools.sandbox = true;
      loadEnvironment(settings.merged, MOCK_WORKSPACE_DIR);

      // GEMINI_API_KEY is in the whitelist, so it should be loaded.
      expect(process.env['GEMINI_API_KEY']).toEqual('test-key');
      // TESTTEST is NOT in the whitelist, so it should be blocked.
      expect(process.env['TESTTEST']).not.toEqual('1234');
    });

    it('loads whitelisted env files from untrusted spaces if sandboxing is enabled via CLI flag', () => {
      const originalArgv = [...process.argv];
      process.argv.push('-s');
      try {
        setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: false });
        const settings = loadSettings(MOCK_WORKSPACE_DIR);
        // Ensure sandbox is NOT in settings to test argv sniffing
        settings.merged.tools.sandbox = undefined;
        loadEnvironment(settings.merged, MOCK_WORKSPACE_DIR);

        expect(process.env['GEMINI_API_KEY']).toEqual('test-key');
        expect(process.env['TESTTEST']).not.toEqual('1234');
      } finally {
        process.argv = originalArgv;
      }
    });
  });

  describe('migrateDeprecatedSettings', () => {
    let mockFsExistsSync: Mock;
    let mockFsReadFileSync: Mock;

    beforeEach(() => {
      vi.resetAllMocks();
      mockFsExistsSync = vi.mocked(fs.existsSync);
      mockFsExistsSync.mockReturnValue(true);
      mockFsReadFileSync = vi.mocked(fs.readFileSync);
      mockFsReadFileSync.mockReturnValue('{}');
      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted: true,
        source: undefined,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should not do anything if there are no deprecated settings', () => {
      const userSettingsContent = {
        extensions: {
          enabled: ['user-ext-1'],
        },
      };
      const workspaceSettingsContent = {
        someOtherSetting: 'value',
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const setValueSpy = vi.spyOn(LoadedSettings.prototype, 'setValue');
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      setValueSpy.mockClear();

      migrateDeprecatedSettings(loadedSettings, true);

      expect(setValueSpy).not.toHaveBeenCalled();
    });

    it('should migrate general.disableAutoUpdate to general.enableAutoUpdate with inverted value', () => {
      const userSettingsContent = {
        general: {
          disableAutoUpdate: true,
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const setValueSpy = vi.spyOn(LoadedSettings.prototype, 'setValue');
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      migrateDeprecatedSettings(loadedSettings, true);

      // Should set new value to false (inverted from true)
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.User,
        'general',
        expect.objectContaining({ enableAutoUpdate: false }),
      );
    });

    it('should migrate all 4 inverted boolean settings', () => {
      const userSettingsContent = {
        general: {
          disableAutoUpdate: false,
          disableUpdateNag: true,
        },
        context: {
          fileFiltering: {
            disableFuzzySearch: false,
          },
        },
        ui: {
          accessibility: {
            disableLoadingPhrases: true,
          },
        },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const setValueSpy = vi.spyOn(LoadedSettings.prototype, 'setValue');
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      migrateDeprecatedSettings(loadedSettings, true);

      // Check that general settings were migrated with inverted values
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.User,
        'general',
        expect.objectContaining({ enableAutoUpdate: true }),
      );
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.User,
        'general',
        expect.objectContaining({ enableAutoUpdateNotification: false }),
      );

      // Check context.fileFiltering was migrated
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.User,
        'context',
        expect.objectContaining({
          fileFiltering: expect.objectContaining({ enableFuzzySearch: true }),
        }),
      );

      // Check ui.accessibility was migrated
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.User,
        'ui',
        expect.objectContaining({
          accessibility: expect.objectContaining({
            enableLoadingPhrases: false,
          }),
        }),
      );
    });

    it('should prioritize new settings over deprecated ones and respect removeDeprecated flag', () => {
      const userSettingsContent = {
        general: {
          disableAutoUpdate: true,
          enableAutoUpdate: true, // Trust this (true) over disableAutoUpdate (true -> false)
        },
        context: {
          fileFiltering: {
            disableFuzzySearch: false,
            enableFuzzySearch: false, // Trust this (false) over disableFuzzySearch (false -> true)
          },
        },
      };

      const loadedSettings = createMockSettings(userSettingsContent);

      const setValueSpy = vi.spyOn(loadedSettings, 'setValue');

      // 1. removeDeprecated = false (default)
      migrateDeprecatedSettings(loadedSettings);

      // Should still have old settings
      expect(
        loadedSettings.forScope(SettingScope.User).settings.general,
      ).toHaveProperty('disableAutoUpdate');
      expect(
        (
          loadedSettings.forScope(SettingScope.User).settings.context as {
            fileFiltering: { disableFuzzySearch: boolean };
          }
        ).fileFiltering,
      ).toHaveProperty('disableFuzzySearch');

      // 2. removeDeprecated = true
      migrateDeprecatedSettings(loadedSettings, true);

      // Should remove disableAutoUpdate and trust enableAutoUpdate: true
      expect(setValueSpy).toHaveBeenCalledWith(SettingScope.User, 'general', {
        enableAutoUpdate: true,
      });

      // Should remove disableFuzzySearch and trust enableFuzzySearch: false
      expect(setValueSpy).toHaveBeenCalledWith(SettingScope.User, 'context', {
        fileFiltering: { enableFuzzySearch: false },
      });
    });

    it('should trigger migration automatically during loadSettings', () => {
      mockFsExistsSync.mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = {
        general: {
          disableAutoUpdate: true,
        },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // Verify it was migrated in the merged settings
      expect(settings.merged.general?.enableAutoUpdate).toBe(false);

      // Verify it was saved back to disk (via setValue calling updateSettingsFilePreservingFormat)
      expect(updateSettingsFilePreservingFormat).toHaveBeenCalledWith(
        USER_SETTINGS_PATH,
        expect.objectContaining({
          general: expect.objectContaining({ enableAutoUpdate: false }),
        }),
      );
    });

    it('should migrate disableUpdateNag to enableAutoUpdateNotification in memory but not save for system and system defaults settings', () => {
      const systemSettingsContent = {
        general: {
          disableUpdateNag: true,
        },
      };
      const systemDefaultsContent = {
        general: {
          disableUpdateNag: false,
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath()) {
            return JSON.stringify(systemSettingsContent);
          }
          if (p === getSystemDefaultsPath()) {
            return JSON.stringify(systemDefaultsContent);
          }
          return '{}';
        },
      );

      const feedbackSpy = mockCoreEvents.emitFeedback;
      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // Verify system settings were migrated in memory
      expect(settings.system.settings.general).toHaveProperty(
        'enableAutoUpdateNotification',
      );
      expect(
        (settings.system.settings.general as Record<string, unknown>)[
          'enableAutoUpdateNotification'
        ],
      ).toBe(false);

      // Verify system defaults settings were migrated in memory
      expect(settings.systemDefaults.settings.general).toHaveProperty(
        'enableAutoUpdateNotification',
      );
      expect(
        (settings.systemDefaults.settings.general as Record<string, unknown>)[
          'enableAutoUpdateNotification'
        ],
      ).toBe(true);

      // Merged should also reflect it (system overrides defaults, but both are migrated)
      expect(settings.merged.general?.enableAutoUpdateNotification).toBe(false);

      // Verify it was NOT saved back to disk
      expect(updateSettingsFilePreservingFormat).not.toHaveBeenCalledWith(
        getSystemSettingsPath(),
        expect.anything(),
      );
      expect(updateSettingsFilePreservingFormat).not.toHaveBeenCalledWith(
        getSystemDefaultsPath(),
        expect.anything(),
      );

      // Verify warnings were shown
      expect(feedbackSpy).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'The system configuration contains deprecated settings',
        ),
      );
      expect(feedbackSpy).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'The system default configuration contains deprecated settings',
        ),
      );
    });

    it('should migrate experimental agent settings in system scope in memory but not save', () => {
      const systemSettingsContent = {
        experimental: {
          codebaseInvestigatorSettings: {
            enabled: true,
          },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath()) {
            return JSON.stringify(systemSettingsContent);
          }
          return '{}';
        },
      );

      const feedbackSpy = mockCoreEvents.emitFeedback;
      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // Verify it was migrated in memory
      expect(settings.system.settings.agents?.overrides).toMatchObject({
        codebase_investigator: {
          enabled: true,
        },
      });

      // Verify it was NOT saved back to disk
      expect(updateSettingsFilePreservingFormat).not.toHaveBeenCalledWith(
        getSystemSettingsPath(),
        expect.anything(),
      );

      // Verify warnings were shown
      expect(feedbackSpy).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'The system configuration contains deprecated settings: [experimental.codebaseInvestigatorSettings]',
        ),
      );
    });

    it('should migrate experimental agent settings to agents overrides', () => {
      const userSettingsContent = {
        experimental: {
          codebaseInvestigatorSettings: {
            enabled: true,
            maxNumTurns: 15,
            maxTimeMinutes: 5,
            thinkingBudget: 16384,
            model: 'gemini-1.5-pro',
          },
          cliHelpAgentSettings: {
            enabled: false,
          },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // Verify migration to agents.overrides
      expect(settings.user.settings.agents?.overrides).toMatchObject({
        codebase_investigator: {
          enabled: true,
          runConfig: {
            maxTurns: 15,
            maxTimeMinutes: 5,
          },
          modelConfig: {
            model: 'gemini-1.5-pro',
            generateContentConfig: {
              thinkingConfig: {
                thinkingBudget: 16384,
              },
            },
          },
        },
        cli_help: {
          enabled: false,
        },
      });
    });
  });

  describe('saveSettings', () => {
    it('should save settings using updateSettingsFilePreservingFormat', () => {
      const mockUpdateSettings = vi.mocked(updateSettingsFilePreservingFormat);
      const settingsFile = createMockSettings({ ui: { theme: 'dark' } }).user;
      settingsFile.path = '/mock/settings.json';

      saveSettings(settingsFile);

      expect(mockUpdateSettings).toHaveBeenCalledWith('/mock/settings.json', {
        ui: { theme: 'dark' },
      });
    });

    it('should create directory if it does not exist', () => {
      const mockFsExistsSync = vi.mocked(fs.existsSync);
      const mockFsMkdirSync = vi.mocked(fs.mkdirSync);
      mockFsExistsSync.mockReturnValue(false);

      const settingsFile = createMockSettings({}).user;
      settingsFile.path = '/mock/new/dir/settings.json';

      saveSettings(settingsFile);

      expect(mockFsExistsSync).toHaveBeenCalledWith('/mock/new/dir');
      expect(mockFsMkdirSync).toHaveBeenCalledWith('/mock/new/dir', {
        recursive: true,
      });
    });

    it('should emit error feedback if saving fails', () => {
      const mockUpdateSettings = vi.mocked(updateSettingsFilePreservingFormat);
      const error = new Error('Write failed');
      mockUpdateSettings.mockImplementation(() => {
        throw error;
      });

      const settingsFile = createMockSettings({}).user;
      settingsFile.path = '/mock/settings.json';

      saveSettings(settingsFile);

      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'There was an error saving your latest settings changes.',
        error,
      );
    });
  });

  describe('LoadedSettings and remote admin settings', () => {
    it('should prioritize remote admin settings over file-based admin settings', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemSettingsContent = {
        admin: {
          // These should be ignored
          secureModeEnabled: true,
          mcp: { enabled: false },
          extensions: { enabled: false },
        },
        // A non-admin setting to ensure it's still processed
        ui: { theme: 'system-theme' },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath()) {
            return JSON.stringify(systemSettingsContent);
          }
          return '{}';
        },
      );

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // 1. Verify that on initial load, file-based admin settings are ignored
      //    and schema defaults are used instead.
      expect(loadedSettings.merged.admin?.secureModeEnabled).toBe(false); // default: false
      expect(loadedSettings.merged.admin?.mcp?.enabled).toBe(true); // default: true
      expect(loadedSettings.merged.admin?.extensions?.enabled).toBe(true); // default: true
      expect(loadedSettings.merged.ui?.theme).toBe('system-theme'); // non-admin setting should be loaded

      // 2. Now, set remote admin settings.
      loadedSettings.setRemoteAdminSettings({
        strictModeDisabled: false,
        mcpSetting: { mcpEnabled: false, mcpConfig: {} },
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
      });

      // 3. Verify that remote admin settings take precedence.
      expect(loadedSettings.merged.admin?.secureModeEnabled).toBe(true);
      expect(loadedSettings.merged.admin?.mcp?.enabled).toBe(false);
      expect(loadedSettings.merged.admin?.extensions?.enabled).toBe(false);
      // non-admin setting should remain unchanged
      expect(loadedSettings.merged.ui?.theme).toBe('system-theme');
    });

    it('should set remote admin settings and recompute merged settings', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemSettingsContent = {
        admin: {
          secureModeEnabled: false,
          mcp: { enabled: false },
          extensions: { enabled: false },
        },
        ui: { theme: 'initial-theme' },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath()) {
            return JSON.stringify(systemSettingsContent);
          }
          return '{}';
        },
      );

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      // Ensure initial state from defaults (as file-based admin settings are ignored)
      expect(loadedSettings.merged.admin?.secureModeEnabled).toBe(false);
      expect(loadedSettings.merged.admin?.mcp?.enabled).toBe(true);
      expect(loadedSettings.merged.admin?.extensions?.enabled).toBe(true);
      expect(loadedSettings.merged.ui?.theme).toBe('initial-theme');

      const newRemoteSettings = {
        strictModeDisabled: false,
        mcpSetting: { mcpEnabled: false, mcpConfig: {} },
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
      };

      loadedSettings.setRemoteAdminSettings(newRemoteSettings);

      // Verify that remote admin settings are applied
      expect(loadedSettings.merged.admin?.secureModeEnabled).toBe(true);
      expect(loadedSettings.merged.admin?.mcp?.enabled).toBe(false);
      expect(loadedSettings.merged.admin?.extensions?.enabled).toBe(false);
      // Non-admin settings should remain untouched
      expect(loadedSettings.merged.ui?.theme).toBe('initial-theme');
    });

    it('should correctly handle undefined remote admin settings', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemSettingsContent = {
        ui: { theme: 'initial-theme' },
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath()) {
            return JSON.stringify(systemSettingsContent);
          }
          return '{}';
        },
      );

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      // Should have default admin settings
      expect(loadedSettings.merged.admin?.secureModeEnabled).toBe(false);
      expect(loadedSettings.merged.admin?.mcp?.enabled).toBe(true);
      expect(loadedSettings.merged.admin?.extensions?.enabled).toBe(true);

      loadedSettings.setRemoteAdminSettings({}); // Set empty remote settings

      // Admin settings should revert to defaults because there are no remote overrides
      expect(loadedSettings.merged.admin?.secureModeEnabled).toBe(false);
      expect(loadedSettings.merged.admin?.mcp?.enabled).toBe(true);
      expect(loadedSettings.merged.admin?.extensions?.enabled).toBe(true);
    });

    it('should un-nest MCP configuration from remote settings', () => {
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      const mcpServers: Record<string, MCPServerConfig> = {
        'admin-server': {
          url: 'http://admin-mcp.com',
          type: 'sse',
          trust: true,
        },
      };

      loadedSettings.setRemoteAdminSettings({
        mcpSetting: {
          mcpEnabled: true,
          mcpConfig: {
            mcpServers,
          },
        },
      });

      expect(loadedSettings.merged.admin?.mcp?.config).toEqual(mcpServers);
    });

    it('should set skills based on unmanagedCapabilitiesEnabled', () => {
      const loadedSettings = loadSettings();
      loadedSettings.setRemoteAdminSettings({
        cliFeatureSetting: {
          unmanagedCapabilitiesEnabled: true,
        },
      });
      expect(loadedSettings.merged.admin.skills?.enabled).toBe(true);

      loadedSettings.setRemoteAdminSettings({
        cliFeatureSetting: {
          unmanagedCapabilitiesEnabled: false,
        },
      });
      expect(loadedSettings.merged.admin.skills?.enabled).toBe(false);
    });

    it('should handle completely empty remote admin settings response', () => {
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      loadedSettings.setRemoteAdminSettings({});

      // Should default to schema defaults (standard defaults)
      expect(loadedSettings.merged.admin?.secureModeEnabled).toBe(false);
      expect(loadedSettings.merged.admin?.mcp?.enabled).toBe(true);
      expect(loadedSettings.merged.admin?.extensions?.enabled).toBe(true);
    });
  });

  describe('getDefaultsFromSchema', () => {
    it('should extract defaults from a schema', () => {
      const mockSchema = {
        prop1: {
          type: 'string',
          default: 'default1',
          label: 'Prop 1',
          category: 'General',
          requiresRestart: false,
        },
        nested: {
          type: 'object',
          label: 'Nested',
          category: 'General',
          requiresRestart: false,
          default: {},
          properties: {
            prop2: {
              type: 'number',
              default: 42,
              label: 'Prop 2',
              category: 'General',
              requiresRestart: false,
            },
          },
        },
      };

      const defaults = getDefaultsFromSchema(mockSchema as SettingsSchema);
      expect(defaults).toEqual({
        prop1: 'default1',
        nested: {
          prop2: 42,
        },
      });
    });
  });

  describe('Security and Sandbox', () => {
    let originalArgv: string[];
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalArgv = [...process.argv];
      originalEnv = { ...process.env };
      // Clear relevant env vars
      delete process.env['GEMINI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_LOCATION'];
      delete process.env['CLOUD_SHELL'];
      delete process.env['MALICIOUS_VAR'];
      delete process.env['FOO'];
      vi.resetAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    afterEach(() => {
      process.argv = originalArgv;
      process.env = originalEnv;
    });

    describe('sandbox detection', () => {
      it('should detect sandbox when -s is a real flag', () => {
        process.argv = ['node', 'gemini', '-s', 'some prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(
          'FOO=bar\nGEMINI_API_KEY=secret',
        );

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        // If sandboxed and untrusted, FOO should NOT be loaded, but GEMINI_API_KEY should be.
        expect(process.env['FOO']).toBeUndefined();
        expect(process.env['GEMINI_API_KEY']).toBe('secret');
      });

      it('should detect sandbox when --sandbox is a real flag', () => {
        process.argv = ['node', 'gemini', '--sandbox', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=secret');

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GEMINI_API_KEY']).toBe('secret');
      });

      it('should ignore sandbox flags if they appear after --', () => {
        process.argv = ['node', 'gemini', '--', '-s', 'some prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockImplementation((path) =>
          path.toString().endsWith('.env'),
        );
        vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=secret');

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GEMINI_API_KEY']).toBeUndefined();
      });

      it('should NOT be tricked by positional arguments that look like flags', () => {
        process.argv = ['node', 'gemini', 'my -s prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockImplementation((path) =>
          path.toString().endsWith('.env'),
        );
        vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=secret');

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GEMINI_API_KEY']).toBeUndefined();
      });
    });

    describe('env var sanitization', () => {
      it('should strictly enforce whitelist in untrusted/sandboxed mode', () => {
        process.argv = ['node', 'gemini', '-s', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockImplementation((path) =>
          path.toString().endsWith('.env'),
        );
        vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=secret-key
MALICIOUS_VAR=should-be-ignored
GOOGLE_API_KEY=another-secret
    `);

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GEMINI_API_KEY']).toBe('secret-key');
        expect(process.env['GOOGLE_API_KEY']).toBe('another-secret');
        expect(process.env['MALICIOUS_VAR']).toBeUndefined();
      });

      it('should sanitize shell injection characters in whitelisted env vars in untrusted mode', () => {
        process.argv = ['node', 'gemini', '--sandbox', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockImplementation((path) =>
          path.toString().endsWith('.env'),
        );

        const maliciousPayload = 'key-$(whoami)-`id`-&|;><*?[]{}';
        vi.mocked(fs.readFileSync).mockReturnValue(
          `GEMINI_API_KEY=${maliciousPayload}`,
        );

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        // sanitizeEnvVar: value.replace(/[^a-zA-Z0-9\-_./]/g, '')
        expect(process.env['GEMINI_API_KEY']).toBe('key-whoami-id-');
      });

      it('should allow . and / in whitelisted env vars but sanitize other characters in untrusted mode', () => {
        process.argv = ['node', 'gemini', '--sandbox', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockImplementation((path) =>
          path.toString().endsWith('.env'),
        );

        const complexPayload = 'secret-123/path.to/somewhere;rm -rf /';
        vi.mocked(fs.readFileSync).mockReturnValue(
          `GEMINI_API_KEY=${complexPayload}`,
        );

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GEMINI_API_KEY']).toBe(
          'secret-123/path.to/somewhererm-rf/',
        );
      });

      it('should NOT sanitize variables from trusted sources', () => {
        process.argv = ['node', 'gemini', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: true,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockReturnValue(true);

        vi.mocked(fs.readFileSync).mockReturnValue('FOO=$(bar)');

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        // Trusted source, no sanitization
        expect(process.env['FOO']).toBe('$(bar)');
      });

      it('should load environment variables normally when workspace is TRUSTED even if "sandboxed"', () => {
        process.argv = ['node', 'gemini', '-s', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: true,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockImplementation((path) =>
          path.toString().endsWith('.env'),
        );
        vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=un-sanitized;key!
MALICIOUS_VAR=allowed-because-trusted
    `);

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GEMINI_API_KEY']).toBe('un-sanitized;key!');
        expect(process.env['MALICIOUS_VAR']).toBe('allowed-because-trusted');
      });

      it('should sanitize value in sanitizeEnvVar helper', () => {
        expect(sanitizeEnvVar('$(calc)')).toBe('calc');
        expect(sanitizeEnvVar('`rm -rf /`')).toBe('rm-rf/');
        expect(sanitizeEnvVar('normal-project-123')).toBe('normal-project-123');
        expect(sanitizeEnvVar('us-central1')).toBe('us-central1');
      });
    });

    describe('Cloud Shell security', () => {
      it('should handle Cloud Shell special defaults securely when untrusted', () => {
        process.env['CLOUD_SHELL'] = 'true';
        process.argv = ['node', 'gemini', '-s', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });

        // No .env file
        vi.mocked(fs.existsSync).mockReturnValue(false);

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('cloudshell-gca');
      });

      it('should sanitize GOOGLE_CLOUD_PROJECT in Cloud Shell when loaded from .env in untrusted mode', () => {
        process.env['CLOUD_SHELL'] = 'true';
        process.argv = ['node', 'gemini', '-s', 'prompt'];
        vi.mocked(isWorkspaceTrusted).mockReturnValue({
          isTrusted: false,
          source: 'file',
        });
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(
          'GOOGLE_CLOUD_PROJECT=attacker-project;inject',
        );

        loadEnvironment(
          createMockSettings({ tools: { sandbox: false } }).merged,
          MOCK_WORKSPACE_DIR,
        );

        expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe(
          'attacker-projectinject',
        );
      });
    });
  });
});

describe('LoadedSettings Isolation and Serializability', () => {
  let loadedSettings: LoadedSettings;

  interface TestData {
    a: {
      b: number;
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();

    // Create a minimal LoadedSettings instance
    const emptyScope = {
      path: '/mock/settings.json',
      settings: {},
      originalSettings: {},
    } as unknown as SettingsFile;

    loadedSettings = new LoadedSettings(
      emptyScope, // system
      emptyScope, // systemDefaults
      { ...emptyScope }, // user
      emptyScope, // workspace
      true, // isTrusted
    );
  });

  describe('setValue Isolation', () => {
    it('should isolate state between settings and originalSettings', () => {
      const complexValue: TestData = { a: { b: 1 } };
      loadedSettings.setValue(SettingScope.User, 'test', complexValue);

      const userSettings = loadedSettings.forScope(SettingScope.User);
      const settingsValue = (userSettings.settings as Record<string, unknown>)[
        'test'
      ] as TestData;
      const originalValue = (
        userSettings.originalSettings as Record<string, unknown>
      )['test'] as TestData;

      // Verify they are equal but different references
      expect(settingsValue).toEqual(complexValue);
      expect(originalValue).toEqual(complexValue);
      expect(settingsValue).not.toBe(complexValue);
      expect(originalValue).not.toBe(complexValue);
      expect(settingsValue).not.toBe(originalValue);

      // Modify the in-memory setting object
      settingsValue.a.b = 2;

      // originalSettings should NOT be affected
      expect(originalValue.a.b).toBe(1);
    });

    it('should not share references between settings and originalSettings (original servers test)', () => {
      const mcpServers = {
        'test-server': { command: 'echo' },
      };

      loadedSettings.setValue(SettingScope.User, 'mcpServers', mcpServers);

      // Modify the original object
      delete (mcpServers as Record<string, unknown>)['test-server'];

      // The settings in LoadedSettings should still have the server
      const userSettings = loadedSettings.forScope(SettingScope.User);
      expect(
        (userSettings.settings.mcpServers as Record<string, unknown>)[
          'test-server'
        ],
      ).toBeDefined();
      expect(
        (userSettings.originalSettings.mcpServers as Record<string, unknown>)[
          'test-server'
        ],
      ).toBeDefined();

      // They should also be different objects from each other
      expect(userSettings.settings.mcpServers).not.toBe(
        userSettings.originalSettings.mcpServers,
      );
    });
  });

  describe('setValue Serializability', () => {
    it('should preserve Map/Set types (via structuredClone)', () => {
      const mapValue = { myMap: new Map([['key', 'value']]) };
      loadedSettings.setValue(SettingScope.User, 'test', mapValue);

      const userSettings = loadedSettings.forScope(SettingScope.User);
      const settingsValue = (userSettings.settings as Record<string, unknown>)[
        'test'
      ] as { myMap: Map<string, string> };

      // Map is preserved by structuredClone
      expect(settingsValue.myMap).toBeInstanceOf(Map);
      expect(settingsValue.myMap.get('key')).toBe('value');

      // But it should be a different reference
      expect(settingsValue.myMap).not.toBe(mapValue.myMap);
    });

    it('should handle circular references (structuredClone supports them, but deepMerge may not)', () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular['self'] = circular;

      // structuredClone(circular) works, but LoadedSettings.setValue calls
      // computeMergedSettings() -> customDeepMerge() which blows up on circularity.
      expect(() => {
        loadedSettings.setValue(SettingScope.User, 'test', circular);
      }).toThrow(/Maximum call stack size exceeded/);
    });
  });
});
