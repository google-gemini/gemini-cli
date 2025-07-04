/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

// Mock 'os' first.
import * as osActual from 'os'; // Import for type info for the mock factory
vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
  };
});

// Mock './settings.js' to ensure it uses the mocked 'os.homedir()' for its internal constants.
vi.mock('./settings.js', async (_importOriginal) => {
  const originalModule =
    await vi.importActual<typeof import('./settings.js')>('./settings.js');
  return {
    __esModule: true, // Ensure correct module shape
    ...originalModule, // Re-export all original members
    // We are relying on originalModule's USER_SETTINGS_PATH being constructed with mocked os.homedir()
  };
});

// NOW import everything else, including the (now effectively re-exported) settings.js
import * as pathActual from 'path'; // Restored for MOCK_WORKSPACE_SETTINGS_PATH
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
import * as fs from 'fs'; // fs will be mocked separately
import stripJsonComments from 'strip-json-comments'; // Will be mocked separately

// These imports will get the versions from the vi.mock('./settings.js', ...) factory.
import {
  loadSettings,
  USER_SETTINGS_PATH, // This IS the mocked path.
  SETTINGS_DIRECTORY_NAME, // This is from the original module, but used by the mock.
  SettingScope,
  LoadedSettings,
} from './settings.js';

const MOCK_WORKSPACE_DIR = '/mock/workspace';
// Use the (mocked) SETTINGS_DIRECTORY_NAME for consistency
const MOCK_WORKSPACE_SETTINGS_PATH = pathActual.join(
  MOCK_WORKSPACE_DIR,
  SETTINGS_DIRECTORY_NAME,
  'settings.json',
);

vi.mock('fs');
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadSettings', () => {
    it('should load empty settings if no files exist', () => {
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual({});
      expect(settings.errors.length).toBe(0);
    });

    it('should load user settings if only user file exists', () => {
      const expectedUserSettingsPath = USER_SETTINGS_PATH; // Use the path actually resolved by the (mocked) module

      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === expectedUserSettingsPath,
      );
      const userSettingsContent = {
        theme: 'dark',
        contextFileName: 'USER_CONTEXT.md',
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === expectedUserSettingsPath)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expectedUserSettingsPath,
        'utf-8',
      );
      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual(userSettingsContent);
    });

    it('should load workspace settings if only workspace file exists', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        sandbox: true,
        contextFileName: 'WORKSPACE_CONTEXT.md',
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        MOCK_WORKSPACE_SETTINGS_PATH,
        'utf-8',
      );
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toEqual(workspaceSettingsContent);
    });

    it('should merge user and workspace settings, with workspace taking precedence', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        theme: 'dark',
        sandbox: false,
        contextFileName: 'USER_CONTEXT.md',
      };
      const workspaceSettingsContent = {
        sandbox: true,
        coreTools: ['tool1'],
        contextFileName: 'WORKSPACE_CONTEXT.md',
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
      expect(settings.merged).toEqual({
        theme: 'dark',
        sandbox: true,
        coreTools: ['tool1'],
        contextFileName: 'WORKSPACE_CONTEXT.md',
      });
    });

    it('should handle contextFileName correctly when only in user settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = { contextFileName: 'CUSTOM.md' };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.contextFileName).toBe('CUSTOM.md');
    });

    it('should handle contextFileName correctly when only in workspace settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        contextFileName: 'PROJECT_SPECIFIC.md',
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.contextFileName).toBe('PROJECT_SPECIFIC.md');
    });

    it('should default contextFileName to undefined if not in any settings file', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = { theme: 'dark' };
      const workspaceSettingsContent = { sandbox: true };
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
      expect(settings.merged.contextFileName).toBeUndefined();
    });

    it('should load telemetry setting from user settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = { telemetry: { enabled: true } };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry?.enabled).toBe(true);
    });

    it('should load telemetry setting from workspace settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = { telemetry: { enabled: false } };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry?.enabled).toBe(false);
    });

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

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // Check that settings are empty due to parsing errors
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual({});

      // Check that error objects are populated in settings.errors
      expect(settings.errors).toBeDefined();
      // Assuming both user and workspace files cause errors and are added in order
      expect(settings.errors.length).toEqual(2);

      const userError = settings.errors.find(
        (e) => e.path === USER_SETTINGS_PATH,
      );
      expect(userError).toBeDefined();
      expect(userError?.message).toBe(userReadError.message);

      const workspaceError = settings.errors.find(
        (e) => e.path === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      expect(workspaceError).toBeDefined();
      expect(workspaceError?.message).toBe(workspaceReadError.message);

      // Restore JSON.parse mock if it was spied on specifically for this test
      vi.restoreAllMocks(); // Or more targeted restore if needed
    });
  });

  describe('LoadedSettings class', () => {
    it('setValue should update the correct scope and recompute merged settings', async () => {
      (mockFsExistsSync as Mock).mockReturnValue(false);
      const loadedSettings = new LoadedSettings(
        { path: USER_SETTINGS_PATH, settings: {} },
        { path: MOCK_WORKSPACE_SETTINGS_PATH, settings: {} },
        [],
      );

      vi.mocked(fs.promises.writeFile).mockImplementation(() =>
        Promise.resolve(),
      );
      // mkdirSync is mocked in beforeEach to return undefined, which is fine for void usage

      await loadedSettings.setValue(SettingScope.User, 'theme', 'matrix');
      expect(loadedSettings.user.settings.theme).toBe('matrix');
      expect(loadedSettings.merged.theme).toBe('matrix');
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        USER_SETTINGS_PATH,
        JSON.stringify({ theme: 'matrix' }, null, 2),
        'utf-8',
      );

      await loadedSettings.setValue(
        SettingScope.Workspace,
        'contextFileName',
        'MY_AGENTS.md',
      );
      expect(loadedSettings.workspace.settings.contextFileName).toBe(
        'MY_AGENTS.md',
      );
      expect(loadedSettings.merged.contextFileName).toBe('MY_AGENTS.md');
      expect(loadedSettings.merged.theme).toBe('matrix'); // User setting should still be there
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        MOCK_WORKSPACE_SETTINGS_PATH,
        JSON.stringify({ contextFileName: 'MY_AGENTS.md' }, null, 2),
        'utf-8',
      );

      // Workspace theme overrides user theme
      await loadedSettings.setValue(SettingScope.Workspace, 'theme', 'ocean');

      expect(loadedSettings.workspace.settings.theme).toBe('ocean');
      expect(loadedSettings.merged.theme).toBe('ocean');
    });
  });
});
