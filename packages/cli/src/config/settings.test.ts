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
vi.mock('./settings.js', async (importActual) => {
  const originalModule = await importActual<typeof import('./settings.js')>();
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

// Global mock variables that can be used across all describe blocks
let mockFsExistsSync: Mocked<typeof fs.existsSync>;
let mockStripJsonComments: Mocked<typeof stripJsonComments>;
let mockFsMkdirSync: Mocked<typeof fs.mkdirSync>;

describe('Settings Loading and Merging', () => {
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
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
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
      const userSettingsContent = { telemetry: true };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry).toBe(true);
    });

    it('should load telemetry setting from workspace settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = { telemetry: false };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry).toBe(false);
    });

    it('should prioritize workspace telemetry setting over user setting', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = { telemetry: true };
      const workspaceSettingsContent = { telemetry: false };
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
      expect(settings.merged.telemetry).toBe(false);
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

    it('should resolve environment variables in user settings', () => {
      process.env.TEST_API_KEY = 'user_api_key_from_env';
      const userSettingsContent = {
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
      expect(settings.user.settings.apiKey).toBe('user_api_key_from_env');
      expect(settings.user.settings.someUrl).toBe(
        'https://test.com/user_api_key_from_env',
      );
      expect(settings.merged.apiKey).toBe('user_api_key_from_env');
      delete process.env.TEST_API_KEY;
    });

    it('should resolve environment variables in workspace settings', () => {
      process.env.WORKSPACE_ENDPOINT = 'workspace_endpoint_from_env';
      const workspaceSettingsContent = {
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
      expect(settings.workspace.settings.endpoint).toBe(
        'workspace_endpoint_from_env/api',
      );
      expect(settings.workspace.settings.nested.value).toBe(
        'workspace_endpoint_from_env',
      );
      expect(settings.merged.endpoint).toBe('workspace_endpoint_from_env/api');
      delete process.env.WORKSPACE_ENDPOINT;
    });

    it('should prioritize workspace env variables over user env variables if keys clash after resolution', () => {
      const userSettingsContent = { configValue: '$SHARED_VAR' };
      const workspaceSettingsContent = { configValue: '$SHARED_VAR' };

      (mockFsExistsSync as Mock).mockReturnValue(true);
      const originalSharedVar = process.env.SHARED_VAR;
      // Temporarily delete to ensure a clean slate for the test's specific manipulations
      delete process.env.SHARED_VAR;

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'user_value_for_user_read'; // Set for user settings read
            return JSON.stringify(userSettingsContent);
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'workspace_value_for_workspace_read'; // Set for workspace settings read
            return JSON.stringify(workspaceSettingsContent);
          }
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings.configValue).toBe(
        'user_value_for_user_read',
      );
      expect(settings.workspace.settings.configValue).toBe(
        'workspace_value_for_workspace_read',
      );
      // Merged should take workspace's resolved value
      expect(settings.merged.configValue).toBe(
        'workspace_value_for_workspace_read',
      );

      // Restore original environment variable state
      if (originalSharedVar !== undefined) {
        process.env.SHARED_VAR = originalSharedVar;
      } else {
        delete process.env.SHARED_VAR; // Ensure it's deleted if it wasn't there before
      }
    });

    it('should leave unresolved environment variables as is', () => {
      const userSettingsContent = { apiKey: '$UNDEFINED_VAR' };
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
      expect(settings.user.settings.apiKey).toBe('$UNDEFINED_VAR');
      expect(settings.merged.apiKey).toBe('$UNDEFINED_VAR');
    });

    it('should resolve multiple environment variables in a single string', () => {
      process.env.VAR_A = 'valueA';
      process.env.VAR_B = 'valueB';
      const userSettingsContent = { path: '/path/$VAR_A/${VAR_B}/end' };
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
      expect(settings.user.settings.path).toBe('/path/valueA/valueB/end');
      delete process.env.VAR_A;
      delete process.env.VAR_B;
    });

    it('should resolve environment variables in arrays', () => {
      process.env.ITEM_1 = 'item1_env';
      process.env.ITEM_2 = 'item2_env';
      const userSettingsContent = { list: ['$ITEM_1', '${ITEM_2}', 'literal'] };
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
      expect(settings.user.settings.list).toEqual([
        'item1_env',
        'item2_env',
        'literal',
      ]);
      delete process.env.ITEM_1;
      delete process.env.ITEM_2;
    });

    it('should correctly pass through null, boolean, and number types, and handle undefined properties', () => {
      process.env.MY_ENV_STRING = 'env_string_value';
      process.env.MY_ENV_STRING_NESTED = 'env_string_nested_value';

      const userSettingsContent = {
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

      expect(settings.user.settings.nullVal).toBeNull();
      expect(settings.user.settings.trueVal).toBe(true);
      expect(settings.user.settings.falseVal).toBe(false);
      expect(settings.user.settings.numberVal).toBe(123.45);
      expect(settings.user.settings.stringVal).toBe('env_string_value');
      expect(settings.user.settings.undefinedVal).toBeUndefined();

      expect(settings.user.settings.nestedObj.nestedNull).toBeNull();
      expect(settings.user.settings.nestedObj.nestedBool).toBe(true);
      expect(settings.user.settings.nestedObj.nestedNum).toBe(0);
      expect(settings.user.settings.nestedObj.nestedString).toBe('literal');
      expect(settings.user.settings.nestedObj.anotherEnv).toBe(
        'env_string_nested_value',
      );

      delete process.env.MY_ENV_STRING;
      delete process.env.MY_ENV_STRING_NESTED;
    });

    it('should resolve multiple concatenated environment variables in a single string value', () => {
      process.env.TEST_HOST = 'myhost';
      process.env.TEST_PORT = '9090';
      const userSettingsContent = {
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
      expect(settings.user.settings.serverAddress).toBe('myhost:9090/api');

      delete process.env.TEST_HOST;
      delete process.env.TEST_PORT;
    });
  });

  describe('LoadedSettings class', () => {
    it('setValue should update the correct scope and recompute merged settings', () => {
      (mockFsExistsSync as Mock).mockReturnValue(false);
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      // mkdirSync is mocked in beforeEach to return undefined, which is fine for void usage

      loadedSettings.setValue(SettingScope.User, 'theme', 'matrix');
      expect(loadedSettings.user.settings.theme).toBe('matrix');
      expect(loadedSettings.merged.theme).toBe('matrix');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        USER_SETTINGS_PATH,
        JSON.stringify({ theme: 'matrix' }, null, 2),
        'utf-8',
      );

      loadedSettings.setValue(
        SettingScope.Workspace,
        'contextFileName',
        'MY_AGENTS.md',
      );
      expect(loadedSettings.workspace.settings.contextFileName).toBe(
        'MY_AGENTS.md',
      );
      expect(loadedSettings.merged.contextFileName).toBe('MY_AGENTS.md');
      expect(loadedSettings.merged.theme).toBe('matrix'); // User setting should still be there
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        MOCK_WORKSPACE_SETTINGS_PATH,
        JSON.stringify({ contextFileName: 'MY_AGENTS.md' }, null, 2),
        'utf-8',
      );

      // Workspace theme overrides user theme
      loadedSettings.setValue(SettingScope.Workspace, 'theme', 'ocean');

      expect(loadedSettings.workspace.settings.theme).toBe('ocean');
      expect(loadedSettings.merged.theme).toBe('ocean');
    });
  });
});

describe('Additional Edge Cases and Error Handling', () => {
  it('should handle file system read permission errors gracefully', () => {
    (mockFsExistsSync as Mock).mockReturnValue(true);
    const readError = new Error('EACCES: permission denied, open');
    readError.name = 'EACCES';
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) {
          throw readError;
        }
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);

    expect(settings.user.settings).toEqual({});
    expect(settings.workspace.settings).toEqual({});
    expect(settings.merged).toEqual({});
    expect(settings.errors.length).toBe(1);
    expect(settings.errors[0].path).toBe(USER_SETTINGS_PATH);
    expect(settings.errors[0].message).toBe(readError.message);
  });

  it('should handle workspace file read errors while user file succeeds', () => {
    const userSettings = { theme: 'dark' };
    const workspaceReadError = new Error('ENOENT: no such file or directory');

    (mockFsExistsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) {
          return JSON.stringify(userSettings);
        }
        if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
          throw workspaceReadError;
        }
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);

    expect(settings.user.settings).toEqual(userSettings);
    expect(settings.workspace.settings).toEqual({});
    expect(settings.merged).toEqual(userSettings);
    expect(settings.errors.length).toBe(1);
    expect(settings.errors[0].path).toBe(MOCK_WORKSPACE_SETTINGS_PATH);
  });

  it('should handle directory creation failures in setValue', () => {
    (mockFsExistsSync as Mock).mockReturnValue(false);
    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    const mkdirError = new Error('EACCES: permission denied, mkdir');
    (mockFsMkdirSync as Mock).mockImplementation(() => {
      throw mkdirError;
    });

    // Mock console.error to capture the error
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // setValue doesn't throw errors, it catches them and logs to console
    loadedSettings.setValue(SettingScope.User, 'theme', 'dark');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error saving user settings file:',
      mkdirError,
    );

    consoleErrorSpy.mockRestore();
  });

  it('should handle writeFileSync failures in setValue', () => {
    // Mock fs.existsSync to simulate that the directory exists but writeFileSync will fail
    (mockFsExistsSync as Mock).mockImplementation((p: fs.PathLike) => {
      // For the settings directory check, return true to indicate directory exists
      const pathStr = p.toString();
      return pathStr.includes('.gemini') && !pathStr.includes('settings.json');
    });

    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    const writeError = new Error('EACCES: permission denied, open');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw writeError;
    });

    // Mock console.error to capture the error
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // setValue doesn't throw errors, it catches them and logs to console
    loadedSettings.setValue(SettingScope.User, 'theme', 'dark');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error saving user settings file:',
      writeError,
    );

    consoleErrorSpy.mockRestore();
  });

  it('should handle empty workspace directory path', () => {
    const settings = loadSettings('');
    expect(settings.user.settings).toEqual({});
    expect(settings.workspace.settings).toEqual({});
    expect(settings.merged).toEqual({});
    expect(settings.errors).toEqual([]);
  });

  it('should handle deeply nested settings objects', () => {
    const deepSettings = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                value: 'deep_value',
                envVar: '$DEEP_TEST_VAR',
                array: ['item1', '$DEEP_ARRAY_VAR'],
                boolean: true,
                number: 42,
              },
            },
          },
        },
      },
    };

    process.env.DEEP_TEST_VAR = 'resolved_deep_value';
    process.env.DEEP_ARRAY_VAR = 'resolved_array_item';

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(deepSettings);
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);
    const deepObj = settings.user.settings.level1.level2.level3.level4.level5;
    expect(deepObj.value).toBe('deep_value');
    expect(deepObj.envVar).toBe('resolved_deep_value');
    expect(deepObj.array).toEqual(['item1', 'resolved_array_item']);
    expect(deepObj.boolean).toBe(true);
    expect(deepObj.number).toBe(42);

    delete process.env.DEEP_TEST_VAR;
    delete process.env.DEEP_ARRAY_VAR;
  });

  it('should handle completely empty JSON files', () => {
    (mockFsExistsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue('');

    const settings = loadSettings(MOCK_WORKSPACE_DIR);
    expect(settings.user.settings).toEqual({});
    expect(settings.workspace.settings).toEqual({});
    expect(settings.merged).toEqual({});
    expect(settings.errors.length).toBeGreaterThan(0);
  });

  it('should handle whitespace-only JSON files', () => {
    (mockFsExistsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue('   \n\t\r  ');

    const settings = loadSettings(MOCK_WORKSPACE_DIR);
    expect(settings.user.settings).toEqual({});
    expect(settings.workspace.settings).toEqual({});
    expect(settings.merged).toEqual({});
    expect(settings.errors.length).toBeGreaterThan(0);
  });

  it('should handle very large settings objects without performance degradation', () => {
    const largeSettings: Record<string, unknown> = {};
    const arrayData: Array<{ index: number; value: string }> = [];

    // Create a large settings object
    for (let i = 0; i < 1000; i++) {
      largeSettings[`key${i}`] = `value${i}`;
      largeSettings[`nested${i}`] = {
        subkey: `subvalue${i}`,
        envVar: i < 5 ? `$TEST_VAR_${i}` : `literal_${i}`, // Only first 5 use env vars
        metadata: {
          id: i,
          active: i % 2 === 0,
          tags: [`tag${i}`, `category${i % 10}`],
        },
      };
      arrayData.push({ index: i, value: `item_${i}` });
    }
    largeSettings.arrayData = arrayData;

    // Set a few environment variables
    for (let i = 0; i < 5; i++) {
      process.env[`TEST_VAR_${i}`] = `env_value_${i}`;
    }

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(largeSettings);
        return '{}';
      },
    );

    const startTime = Date.now();
    const settings = loadSettings(MOCK_WORKSPACE_DIR);
    const endTime = Date.now();

    // Verify the settings were loaded correctly
    expect(settings.user.settings.key0).toBe('value0');
    expect(settings.user.settings.key999).toBe('value999');
    expect(settings.user.settings.nested0.envVar).toBe('env_value_0');
    expect(settings.user.settings.nested5.envVar).toBe('literal_5');
    expect(settings.user.settings.arrayData.length).toBe(1000);
    expect(settings.user.settings.arrayData[999].value).toBe('item_999');

    // Performance should be reasonable (less than 1 second for 1000 items)
    expect(endTime - startTime).toBeLessThan(1000);

    // Clean up environment variables
    for (let i = 0; i < 5; i++) {
      delete process.env[`TEST_VAR_${i}`];
    }
  });
});

describe('Advanced Environment Variable Resolution', () => {
  it('should handle environment variables with special characters', () => {
    process.env.SPECIAL_VAR = 'value with spaces and $pecial ch@rs & symbols!';
    process.env.JSON_LIKE = '{"key": "value", "array": [1,2,3]}';

    const settings = {
      testValue: '$SPECIAL_VAR',
      jsonValue: '$JSON_LIKE',
      combined: 'prefix_${SPECIAL_VAR}_suffix',
    };

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(settings);
        return '{}';
      },
    );

    const result = loadSettings(MOCK_WORKSPACE_DIR);
    expect(result.user.settings.testValue).toBe(
      'value with spaces and $pecial ch@rs & symbols!',
    );
    expect(result.user.settings.jsonValue).toBe(
      '{"key": "value", "array": [1,2,3]}',
    );
    expect(result.user.settings.combined).toBe(
      'prefix_value with spaces and $pecial ch@rs & symbols!_suffix',
    );

    delete process.env.SPECIAL_VAR;
    delete process.env.JSON_LIKE;
  });

  it('should handle environment variables with empty and whitespace values', () => {
    process.env.EMPTY_VAR = '';
    process.env.WHITESPACE_VAR = '   \t\n  ';

    const settings = {
      emptyValue: '$EMPTY_VAR',
      whitespaceValue: '$WHITESPACE_VAR',
      prefixedEmpty: 'prefix_${EMPTY_VAR}_suffix',
      prefixedWhitespace: 'prefix_${WHITESPACE_VAR}_suffix',
    };

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(settings);
        return '{}';
      },
    );

    const result = loadSettings(MOCK_WORKSPACE_DIR);
    expect(result.user.settings.emptyValue).toBe('');
    expect(result.user.settings.whitespaceValue).toBe('   \t\n  ');
    expect(result.user.settings.prefixedEmpty).toBe('prefix__suffix');
    expect(result.user.settings.prefixedWhitespace).toBe(
      'prefix_   \t\n  _suffix',
    );

    delete process.env.EMPTY_VAR;
    delete process.env.WHITESPACE_VAR;
  });

  it('should handle malformed environment variable syntax gracefully', () => {
    const settings = {
      incomplete1: '${',
      incomplete2: '${}',
      incomplete3: '${INCOMPLETE',
      incomplete4: 'INCOMPLETE}',
      nested: '${{NESTED}}',
      dollar: '$$VALUE',
      mixed: '${VALID}_$INVALID_${}_end',
      multipleIncomplete: '${ONE ${TWO} ${THREE',
    };

    process.env.VALID = 'valid_value';

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(settings);
        return '{}';
      },
    );

    const result = loadSettings(MOCK_WORKSPACE_DIR);
    expect(result.user.settings.incomplete1).toBe('${');
    expect(result.user.settings.incomplete2).toBe('${}');
    expect(result.user.settings.incomplete3).toBe('${INCOMPLETE');
    expect(result.user.settings.incomplete4).toBe('INCOMPLETE}');
    expect(result.user.settings.nested).toBe('${{NESTED}}');
    expect(result.user.settings.dollar).toBe('$$VALUE');
    expect(result.user.settings.mixed).toBe('valid_value_$INVALID_${}_end');
    expect(result.user.settings.multipleIncomplete).toBe(
      '${ONE ${TWO} ${THREE',
    );

    delete process.env.VALID;
  });

  it('should handle environment variables in different data structures', () => {
    process.env.TEST_STRING = 'string_value';
    process.env.TEST_NUM = '42';
    process.env.TEST_BOOL = 'true';

    const settings = {
      array: ['$TEST_STRING', 'literal', '${TEST_NUM}', '${TEST_BOOL}'],
      nestedArray: [
        { key: '$TEST_STRING' },
        { nested: { deep: '${TEST_NUM}' } },
        ['${TEST_STRING}', { inner: '$TEST_NUM' }],
      ],
      object: {
        prop1: '$TEST_STRING',
        prop2: {
          nested: '${TEST_NUM}',
          deeper: {
            deep: '${TEST_BOOL}',
          },
        },
      },
    };

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(settings);
        return '{}';
      },
    );

    const result = loadSettings(MOCK_WORKSPACE_DIR);
    expect(result.user.settings.array).toEqual([
      'string_value',
      'literal',
      '42',
      'true',
    ]);
    expect(result.user.settings.nestedArray[0].key).toBe('string_value');
    expect(result.user.settings.nestedArray[1].nested.deep).toBe('42');
    expect(result.user.settings.nestedArray[2][0]).toBe('string_value');
    expect(result.user.settings.nestedArray[2][1].inner).toBe('42');
    expect(result.user.settings.object.prop1).toBe('string_value');
    expect(result.user.settings.object.prop2.nested).toBe('42');
    expect(result.user.settings.object.prop2.deeper.deep).toBe('true');

    delete process.env.TEST_STRING;
    delete process.env.TEST_NUM;
    delete process.env.TEST_BOOL;
  });

  it('should handle rapid environment variable changes during resolution', () => {
    const settings = {
      dynamic1: '$DYNAMIC_VAR',
      dynamic2: '${DYNAMIC_VAR}',
      combined: 'prefix_${DYNAMIC_VAR}_suffix',
    };

    let readCount = 0;
    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) {
          // Change the environment variable value each time the file is read
          process.env.DYNAMIC_VAR = `value_${++readCount}`;
          return JSON.stringify(settings);
        }
        return '{}';
      },
    );

    const result = loadSettings(MOCK_WORKSPACE_DIR);
    // Should use the value that was set during the read
    expect(result.user.settings.dynamic1).toBe('value_1');
    expect(result.user.settings.dynamic2).toBe('value_1');
    expect(result.user.settings.combined).toBe('prefix_value_1_suffix');

    delete process.env.DYNAMIC_VAR;
  });
});

describe('Complex Settings Merging Scenarios', () => {
  it('should handle merging with arrays of different types', () => {
    const userSettings = {
      tools: ['tool1', 'tool2'],
      numbers: [1, 2, 3],
      mixed: [1, 'string', true, null, { nested: 'object' }],
      nested: { array: [1, 2] },
    };
    const workspaceSettings = {
      tools: ['tool3', 'tool4', 'tool5'],
      numbers: [4, 5],
      mixed: ['replaced'],
      nested: { array: [3, 4, 5, 6] },
    };

    (mockFsExistsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(userSettings);
        if (p === MOCK_WORKSPACE_SETTINGS_PATH)
          return JSON.stringify(workspaceSettings);
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);
    // Workspace should completely override arrays
    expect(settings.merged.tools).toEqual(['tool3', 'tool4', 'tool5']);
    expect(settings.merged.numbers).toEqual([4, 5]);
    expect(settings.merged.mixed).toEqual(['replaced']);
    expect(settings.merged.nested.array).toEqual([3, 4, 5, 6]);
  });

  it('should handle merging with null and undefined values at various levels', () => {
    const userSettings = {
      setting1: 'value1',
      setting2: 'value2',
      setting3: { nested: 'nested_value', other: 'other_value' },
      setting4: [1, 2, 3],
      setting5: { deep: { value: 'deep_value' } },
    };
    const workspaceSettings = {
      setting1: null,
      setting2: undefined,
      setting3: null,
      setting4: null,
      setting5: { deep: null },
    };

    (mockFsExistsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(userSettings);
        if (p === MOCK_WORKSPACE_SETTINGS_PATH)
          return JSON.stringify(workspaceSettings);
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);
    expect(settings.merged.setting1).toBeNull();
    expect(settings.merged.setting2).toBe('value2'); // undefined doesn't override
    expect(settings.merged.setting3).toBeNull();
    expect(settings.merged.setting4).toBeNull();
    expect(settings.merged.setting5.deep).toBeNull();
  });

  it('should handle extremely complex nested object merging', () => {
    const userSettings = {
      api: {
        endpoints: {
          primary: 'https://user.api.com',
          secondary: 'https://user-backup.api.com',
        },
        timeout: 5000,
        retries: 3,
        headers: {
          'User-Agent': 'user-app',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        auth: {
          method: 'bearer',
          token: '$USER_TOKEN',
        },
      },
      features: {
        analytics: true,
        debug: false,
        experimental: {
          newFeature: false,
          betaFeature: true,
        },
      },
    };

    const workspaceSettings = {
      api: {
        endpoints: {
          primary: 'https://workspace.api.com',
          tertiary: 'https://workspace-extra.api.com',
        },
        headers: {
          Authorization: 'Bearer ${WORKSPACE_TOKEN}',
          Accept: 'application/xml',
          'X-Workspace': 'true',
        },
        auth: {
          method: 'oauth',
          clientId: '${CLIENT_ID}',
        },
        cache: {
          enabled: true,
          ttl: 3600,
        },
      },
      features: {
        debug: true,
        experimental: {
          newFeature: true,
          anotherFeature: true,
        },
      },
    };

    process.env.USER_TOKEN = 'user-token-123';
    process.env.WORKSPACE_TOKEN = 'workspace-token-456';
    process.env.CLIENT_ID = 'client-id-789';

    (mockFsExistsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(userSettings);
        if (p === MOCK_WORKSPACE_SETTINGS_PATH)
          return JSON.stringify(workspaceSettings);
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);

    // Check endpoint merging
    expect(settings.merged.api.endpoints.primary).toBe(
      'https://workspace.api.com',
    );
    expect(settings.merged.api.endpoints.secondary).toBe(
      'https://user-backup.api.com',
    );
    expect(settings.merged.api.endpoints.tertiary).toBe(
      'https://workspace-extra.api.com',
    );

    // Check other API settings
    expect(settings.merged.api.timeout).toBe(5000); // From user
    expect(settings.merged.api.retries).toBe(3); // From user

    // Check header merging with environment variable resolution
    expect(settings.merged.api.headers['User-Agent']).toBe('user-app');
    expect(settings.merged.api.headers['Authorization']).toBe(
      'Bearer workspace-token-456',
    );
    expect(settings.merged.api.headers['Accept']).toBe('application/xml'); // Workspace wins
    expect(settings.merged.api.headers['Content-Type']).toBe(
      'application/json',
    ); // From user
    expect(settings.merged.api.headers['X-Workspace']).toBe('true'); // From workspace

    // Check auth merging
    expect(settings.merged.api.auth.method).toBe('oauth'); // Workspace wins
    expect(settings.merged.api.auth.token).toBe('user-token-123'); // From user
    expect(settings.merged.api.auth.clientId).toBe('client-id-789'); // From workspace

    // Check cache (only in workspace)
    expect(settings.merged.api.cache.enabled).toBe(true);
    expect(settings.merged.api.cache.ttl).toBe(3600);

    // Check features merging
    expect(settings.merged.features.analytics).toBe(true); // From user
    expect(settings.merged.features.debug).toBe(true); // Workspace wins
    expect(settings.merged.features.experimental.newFeature).toBe(true); // Workspace wins
    expect(settings.merged.features.experimental.betaFeature).toBe(true); // From user
    expect(settings.merged.features.experimental.anotherFeature).toBe(true); // From workspace

    delete process.env.USER_TOKEN;
    delete process.env.WORKSPACE_TOKEN;
    delete process.env.CLIENT_ID;
  });
});

describe('strip-json-comments Integration', () => {
  it('should use strip-json-comments to remove various comment types', () => {
    const jsonWithComments = `{
        // Single line comment
        "theme": "dark", /* inline block comment */
        /* Multi-line
           block comment */
        "sandbox": true, // Another inline comment
        "nested": {
          // Nested comment
          "value": "test" /* trailing comment */
        }
      }`;

    const cleanJson = `{
        
        "theme": "dark", 
        
           
        "sandbox": true, 
        "nested": {
          
          "value": "test" 
        }
      }`;

    (mockStripJsonComments as unknown as Mock).mockReturnValue(cleanJson);
    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return jsonWithComments;
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);

    expect(mockStripJsonComments).toHaveBeenCalledWith(jsonWithComments);
    expect(settings.user.settings.theme).toBe('dark');
    expect(settings.user.settings.sandbox).toBe(true);
    expect(settings.user.settings.nested.value).toBe('test');
  });

  it('should handle strip-json-comments throwing an error', () => {
    const stripError = new Error(
      'Failed to strip comments: Invalid comment syntax',
    );
    (mockStripJsonComments as unknown as Mock).mockImplementation(() => {
      throw stripError;
    });
    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockReturnValue('{"test": "value"}');

    const settings = loadSettings(MOCK_WORKSPACE_DIR);

    expect(settings.user.settings).toEqual({});
    expect(settings.errors.length).toBe(1);
    expect(settings.errors[0].message).toBe(stripError.message);
    expect(settings.errors[0].path).toBe(USER_SETTINGS_PATH);
  });

  it('should handle strip-json-comments returning malformed JSON', () => {
    const malformedResult = '{ "test": "value" missing quote}';
    (mockStripJsonComments as unknown as Mock).mockReturnValue(malformedResult);
    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockReturnValue('// Comment\n{"test": "value"}');

    const settings = loadSettings(MOCK_WORKSPACE_DIR);

    expect(settings.user.settings).toEqual({});
    expect(settings.errors.length).toBe(1);
    expect(settings.errors[0].path).toBe(USER_SETTINGS_PATH);
  });
});

describe('LoadedSettings setValue Advanced Scenarios', () => {
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
    (fs.readFileSync as Mock).mockReturnValue('{}');
    (mockFsMkdirSync as Mock).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  it('should handle setValue with complex nested objects and arrays', () => {
    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    const complexValue = {
      nested: {
        array: [1, 2, { deep: 'value', deeper: [true, false] }],
        object: {
          key: 'value',
          subObj: {
            items: ['a', 'b', 'c'],
            config: { enabled: true, count: 10 },
          },
        },
      },
      topLevelArray: [
        { id: 1, name: 'first' },
        { id: 2, name: 'second', tags: ['tag1', 'tag2'] },
      ],
    };

    loadedSettings.setValue(SettingScope.User, 'complex', complexValue);

    expect(loadedSettings.user.settings.complex).toEqual(complexValue);
    expect(loadedSettings.merged.complex).toEqual(complexValue);
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      USER_SETTINGS_PATH,
      JSON.stringify({ complex: complexValue }, null, 2),
      'utf-8',
    );
  });

  it('should handle setValue with special values (null, undefined, functions)', () => {
    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    loadedSettings.setValue(SettingScope.User, 'nullValue', null);
    loadedSettings.setValue(SettingScope.User, 'undefinedValue', undefined);
    loadedSettings.setValue(SettingScope.User, 'zeroValue', 0);
    loadedSettings.setValue(SettingScope.User, 'falseValue', false);
    loadedSettings.setValue(SettingScope.User, 'emptyString', '');
    loadedSettings.setValue(SettingScope.User, 'emptyArray', []);
    loadedSettings.setValue(SettingScope.User, 'emptyObject', {});

    expect(loadedSettings.user.settings.nullValue).toBeNull();
    expect(loadedSettings.user.settings.undefinedValue).toBeUndefined();
    expect(loadedSettings.user.settings.zeroValue).toBe(0);
    expect(loadedSettings.user.settings.falseValue).toBe(false);
    expect(loadedSettings.user.settings.emptyString).toBe('');
    expect(loadedSettings.user.settings.emptyArray).toEqual([]);
    expect(loadedSettings.user.settings.emptyObject).toEqual({});

    const expectedSettings = {
      nullValue: null,
      undefinedValue: undefined,
      zeroValue: 0,
      falseValue: false,
      emptyString: '',
      emptyArray: [],
      emptyObject: {},
    };

    expect(vi.mocked(fs.writeFileSync)).toHaveBeenLastCalledWith(
      USER_SETTINGS_PATH,
      JSON.stringify(expectedSettings, null, 2),
      'utf-8',
    );
  });

  it('should preserve existing settings when setting new ones with complex merging', () => {
    const existingUserSettings = {
      theme: 'dark',
      api: {
        endpoint: 'https://api.com',
        timeout: 5000,
      },
      features: ['feature1', 'feature2'],
      metadata: {
        version: '1.0',
        author: 'user',
      },
    };

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH)
          return JSON.stringify(existingUserSettings);
        return '{}';
      },
    );

    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    // Verify the settings were loaded correctly
    expect(loadedSettings.user.settings.theme).toBe('dark');
    expect(loadedSettings.user.settings.api.endpoint).toBe('https://api.com');

    // Add new settings
    loadedSettings.setValue(SettingScope.User, 'newSetting', 'newValue');
    loadedSettings.setValue(SettingScope.User, 'anotherSetting', {
      complex: true,
    });

    // Verify all settings are preserved
    expect(loadedSettings.user.settings.theme).toBe('dark');
    expect(loadedSettings.user.settings.api.endpoint).toBe('https://api.com');
    expect(loadedSettings.user.settings.api.timeout).toBe(5000);
    expect(loadedSettings.user.settings.features).toEqual([
      'feature1',
      'feature2',
    ]);
    expect(loadedSettings.user.settings.metadata.version).toBe('1.0');
    expect(loadedSettings.user.settings.metadata.author).toBe('user');
    expect(loadedSettings.user.settings.newSetting).toBe('newValue');
    expect(loadedSettings.user.settings.anotherSetting).toEqual({
      complex: true,
    });

    const expectedFinalSettings = {
      ...existingUserSettings,
      newSetting: 'newValue',
      anotherSetting: { complex: true },
    };

    expect(vi.mocked(fs.writeFileSync)).toHaveBeenLastCalledWith(
      USER_SETTINGS_PATH,
      JSON.stringify(expectedFinalSettings, null, 2),
      'utf-8',
    );
  });

  it('should handle rapid successive setValue calls', () => {
    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    // Make many rapid setValue calls
    for (let i = 0; i < 100; i++) {
      loadedSettings.setValue(SettingScope.User, `key${i}`, `value${i}`);
      loadedSettings.setValue(
        SettingScope.Workspace,
        `wsKey${i}`,
        `wsValue${i}`,
      );
    }

    // Verify all settings were set correctly
    for (let i = 0; i < 100; i++) {
      expect(loadedSettings.user.settings[`key${i}`]).toBe(`value${i}`);
      expect(loadedSettings.workspace.settings[`wsKey${i}`]).toBe(
        `wsValue${i}`,
      );
      expect(loadedSettings.merged[`key${i}`]).toBe(`value${i}`);
      expect(loadedSettings.merged[`wsKey${i}`]).toBe(`wsValue${i}`);
    }

    // Should have been called 200 times (100 user + 100 workspace)
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledTimes(200);
  });
});

describe('Unicode and International Character Support', () => {
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
    (fs.readFileSync as Mock).mockReturnValue('{}');
    (mockFsMkdirSync as Mock).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  it('should handle Unicode characters in settings keys and values', () => {
    const unicodeSettings = {
      '🌟greeting': '🚀 Hello 世界! こんにちは',
      café: 'résumé naïve café',
      символы: 'тест на русском языке',
      中文键: '中文值',
      한국어: '안녕하세요',
      العربية: 'مرحبا بالعالم',
      emojis: '✅ ❌ ⚠️ 🔥 💯 🎉',
      symbols: '©®™€£¥₹₽¢',
    };

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(unicodeSettings);
        return '{}';
      },
    );

    const settings = loadSettings(MOCK_WORKSPACE_DIR);
    expect(settings.user.settings['🌟greeting']).toBe(
      '🚀 Hello 世界! こんにちは',
    );
    expect(settings.user.settings['café']).toBe('résumé naïve café');
    expect(settings.user.settings['символы']).toBe('тест на русском языке');
    expect(settings.user.settings['中文键']).toBe('中文值');
    expect(settings.user.settings['한국어']).toBe('안녕하세요');
    expect(settings.user.settings['العربية']).toBe('مرحبا بالعالم');
    expect(settings.user.settings['emojis']).toBe('✅ ❌ ⚠️ 🔥 💯 🎉');
    expect(settings.user.settings['symbols']).toBe('©®™€£¥₹₽¢');
    expect(settings.merged['🌟greeting']).toBe('🚀 Hello 世界! こんにちは');
  });

  it('should handle Unicode in environment variables', () => {
    process.env.UNICODE_VAR = '🌟 Unicode value 世界 тест العربية';
    process.env.EMOJI_VAR = '🚀🎉✨';

    const settings = {
      unicodeFromEnv: '$UNICODE_VAR',
      emojiFromEnv: '${EMOJI_VAR}',
      combined: 'prefix_${UNICODE_VAR}_${EMOJI_VAR}_suffix',
    };

    (mockFsExistsSync as Mock).mockImplementation(
      (p: fs.PathLike) => p === USER_SETTINGS_PATH,
    );
    (fs.readFileSync as Mock).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === USER_SETTINGS_PATH) return JSON.stringify(settings);
        return '{}';
      },
    );

    const result = loadSettings(MOCK_WORKSPACE_DIR);
    expect(result.user.settings.unicodeFromEnv).toBe(
      '🌟 Unicode value 世界 тест العربية',
    );
    expect(result.user.settings.emojiFromEnv).toBe('🚀🎉✨');
    expect(result.user.settings.combined).toBe(
      'prefix_🌟 Unicode value 世界 тест العربية_🚀🎉✨_suffix',
    );
    expect(result.merged.unicodeFromEnv).toBe(
      '🌟 Unicode value 世界 тест العربية',
    );

    delete process.env.UNICODE_VAR;
    delete process.env.EMOJI_VAR;
  });

  it('should handle Unicode in setValue operations', () => {
    (mockFsExistsSync as Mock).mockReturnValue(false);
    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    // Clear the mock call history
    const writeFilesSpy = vi
      .mocked(fs.writeFileSync)
      .mockImplementation(() => {});
    writeFilesSpy.mockClear();

    const unicodeKey = '🔧settings';
    const unicodeValue = '🎨 Custom theme with émojis and 中文';

    loadedSettings.setValue(SettingScope.User, unicodeKey, unicodeValue);

    expect(loadedSettings.user.settings[unicodeKey]).toBe(unicodeValue);
    expect(loadedSettings.merged[unicodeKey]).toBe(unicodeValue);

    const expectedSettings = {
      [unicodeKey]: unicodeValue,
    };

    expect(writeFilesSpy).toHaveBeenCalledWith(
      USER_SETTINGS_PATH,
      JSON.stringify(expectedSettings, null, 2),
      'utf-8',
    );
  });
});

describe('Performance and Memory Management', () => {
  it('should handle repeated loadSettings calls efficiently', () => {
    (mockFsExistsSync as Mock).mockReturnValue(false);

    const startTime = Date.now();

    // Call loadSettings many times
    for (let i = 0; i < 1000; i++) {
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged).toEqual({});
    }

    const endTime = Date.now();

    // Should complete in reasonable time (less than 2 seconds for 1000 calls)
    expect(endTime - startTime).toBeLessThan(2000);
  });

  it('should handle multiple setValue calls efficiently without memory leaks', () => {
    (mockFsExistsSync as Mock).mockReturnValue(false);
    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    const startTime = Date.now();

    // Set many values rapidly
    for (let i = 0; i < 1000; i++) {
      loadedSettings.setValue(SettingScope.User, `key${i}`, `value${i}`);
      loadedSettings.setValue(SettingScope.Workspace, `wsKey${i}`, {
        id: i,
        data: `data${i}`,
      });
    }

    const endTime = Date.now();

    // Verify all values are set correctly
    expect(Object.keys(loadedSettings.user.settings)).toHaveLength(1000);
    expect(Object.keys(loadedSettings.workspace.settings)).toHaveLength(1000);
    expect(Object.keys(loadedSettings.merged)).toHaveLength(2000);

    // Should complete in reasonable time
    expect(endTime - startTime).toBeLessThan(5000);

    // Verify some random values are correct
    expect(loadedSettings.user.settings.key500).toBe('value500');
    expect(loadedSettings.workspace.settings.wsKey999.id).toBe(999);
    expect(loadedSettings.merged.key250).toBe('value250');
    expect(loadedSettings.merged.wsKey750.data).toBe('data750');
  });

  it('should handle concurrent access patterns', () => {
    (mockFsExistsSync as Mock).mockReturnValue(false);
    const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

    // Simulate concurrent access by rapidly switching between different operations
    for (let i = 0; i < 100; i++) {
      loadedSettings.setValue(
        SettingScope.User,
        `userKey${i}`,
        `userValue${i}`,
      );
      loadedSettings.setValue(
        SettingScope.Workspace,
        `workspaceKey${i}`,
        `workspaceValue${i}`,
      );

      // Read values immediately after setting them
      expect(loadedSettings.user.settings[`userKey${i}`]).toBe(`userValue${i}`);
      expect(loadedSettings.workspace.settings[`workspaceKey${i}`]).toBe(
        `workspaceValue${i}`,
      );
      expect(loadedSettings.merged[`userKey${i}`]).toBe(`userValue${i}`);
      expect(loadedSettings.merged[`workspaceKey${i}`]).toBe(
        `workspaceValue${i}`,
      );
    }

    // Final verification
    expect(Object.keys(loadedSettings.user.settings)).toHaveLength(100);
    expect(Object.keys(loadedSettings.workspace.settings)).toHaveLength(100);
    expect(Object.keys(loadedSettings.merged)).toHaveLength(200);
  });
});
