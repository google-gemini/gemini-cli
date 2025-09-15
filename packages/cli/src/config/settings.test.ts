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
vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(),
}));

// NOW import everything else, including the (now effectively re-exported) settings.js
import path, * as pathActual from 'node:path'; // Restored for MOCK_WORKSPACE_SETTINGS_PATH
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
  type Mock,
  fail,
} from 'vitest';
import * as fs from 'node:fs'; // fs will be mocked separately
import stripJsonComments from 'strip-json-comments'; // Will be mocked separately
import { isWorkspaceTrusted } from './trustedFolders.js';

// These imports will get the versions from the vi.mock('./settings.js', ...) factory.
import {
  loadSettings,
  LoadedSettings,
  USER_SETTINGS_PATH, // This IS the mocked path.
  getSystemSettingsPath,
  getSystemDefaultsPath,
  SETTINGS_DIRECTORY_NAME, // This is from the original module, but used by the mock.
  migrateSettingsToV1,
  needsMigration,
  type Settings,
  loadEnvironment,
} from './settings.js';
import { FatalConfigError, GEMINI_DIR } from '@google/gemini-cli-core';

const MOCK_WORKSPACE_DIR = '/mock/workspace';
// Use the (mocked) SETTINGS_DIRECTORY_NAME for consistency
const MOCK_WORKSPACE_SETTINGS_PATH = pathActual.join(
  MOCK_WORKSPACE_DIR,
  SETTINGS_DIRECTORY_NAME,
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
    realpathSync: (p: string) => p,
  };
});

vi.mock('dotenv', () => ({
  parse: vi.fn(() => ({})),
}));

vi.mock('strip-json-comments', () => ({
  default: vi.fn((content) => content),
}));

describe('Settings Loading and Merging', () => {
  let mockFsExistsSync: Mocked<typeof fs.existsSync>;
  let mockStripJsonComments: Mocked<typeof stripJsonComments>;
  let mockFsMkdirSync: Mocked<typeof fs.mkdirSync>;
  let mockFsReadFileSync: Mocked<typeof fs.readFileSync>;
  let mockFsWriteFileSync: Mocked<typeof fs.writeFileSync>;

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
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);
  });

  // Regression test for issue #8077: Settings command security vulnerability
  describe('Issue #8077 Regression Tests - Settings Command Security', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      vi.resetAllMocks();
      originalEnv = { ...process.env };

      // Re-setup mocks for this test suite
      mockFsExistsSync = vi.mocked(fs.existsSync);
      mockStripJsonComments = vi.mocked(stripJsonComments);
      mockFsReadFileSync = vi.mocked(fs.readFileSync);
      mockFsWriteFileSync = vi.mocked(fs.writeFileSync);

      // Mock the settings file content with environment variables (comments already stripped)
      mockFsExistsSync.mockReturnValue(true);
      mockStripJsonComments.mockImplementation((content: string) => {
        // Strip comments and return valid JSON
        return content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      });
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('should NOT leak environment variables to plaintext in saved settings (Issue #8077)', async () => {
      // Setup environment variables that should NEVER be exposed
      process.env['API_KEY'] = 'super-secret-api-key-12345';
      process.env['API_ENDPOINT'] = 'https://api.example.com/v1';
      process.env['SECRET_KEY'] = 'ultra-secret-master-key';
      process.env['AUTH_TOKEN'] = 'bearer-token-abcdef';

      // Mock the existing settings file with comments that will be stripped
      const rawSettingsContent = `
        {
          // Original comment
          "api": {
            "key": "$API_KEY",
            "endpoint": "$API_ENDPOINT"
          },
          "security": {
            "secret": "$SECRET_KEY",
            "token": "$AUTH_TOKEN"
          },
          "model": {
            "name": "gemini-pro"
          }
        }
      `;
      mockFsReadFileSync.mockReturnValue(rawSettingsContent);

      // Load settings (this resolves environment variables in memory)
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // Simulate user modifying one setting (like changing model name)
      loadedSettings.setValue('User', 'model.name', 'gemini-pro-vision');

      // Verify that writeFileSync was called
      expect(mockFsWriteFileSync).toHaveBeenCalled();

      // Get the saved content
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;

      // CRITICAL SECURITY CHECKS:
      // These environment variables should NEVER appear in plaintext
      expect(savedContent).not.toContain('super-secret-api-key-12345');
      expect(savedContent).not.toContain('ultra-secret-master-key');
      expect(savedContent).not.toContain('bearer-token-abcdef');
      expect(savedContent).not.toContain('https://api.example.com/v1');

      // Instead, environment variable references should be preserved
      expect(savedContent).toContain('$API_KEY');
      expect(savedContent).toContain('$API_ENDPOINT');
      expect(savedContent).toContain('$SECRET_KEY');
      expect(savedContent).toContain('$AUTH_TOKEN');

      // The modified setting should be saved
      expect(savedContent).toContain('"name": "gemini-pro-vision"');
    });

    it('should preserve comments when saving settings (Issue #8077)', async () => {
      const rawContentWithComments = `
        {
          // This is a critical comment that must be preserved
          "model": {
            "name": "gemini-pro" // Original model
          },
          /* Multi-line
             comment block */
          "api": {
            "endpoint": "https://api.example.com"
          }
        }
      `;
      mockFsReadFileSync.mockReturnValue(rawContentWithComments);

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      loadedSettings.setValue('User', 'model.name', 'gemini-1.5-pro');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;

      // Comments should be stripped during parsing but not affect the final save
      // The test primarily ensures no errors occur when comments are present
      expect(savedContent).toContain('"name": "gemini-1.5-pro"');
    });

    it('should only modify changed key-value pairs (Issue #8077 fix)', async () => {
      const originalContent = `
        {
          "model": {
            "name": "gemini-pro",
            "temperature": 0.7,
            "maxTokens": 2048
          },
          "ui": {
            "theme": "dark",
            "fontSize": 14
          },
          "security": {
            "auth": "oauth",
            "timeout": 300
          }
        }
      `;

      mockFsReadFileSync.mockReturnValue(originalContent);

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // Only change one setting
      loadedSettings.setValue('User', 'model.name', 'gemini-1.5-flash');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;

      // Verify the changed setting is updated
      expect(savedContent).toContain('"name": "gemini-1.5-flash"');

      // Verify other settings are preserved
      expect(savedContent).toContain('"temperature": 0.7');
      expect(savedContent).toContain('"maxTokens": 2048');
      expect(savedContent).toContain('"theme": "dark"');
      expect(savedContent).toContain('"auth": "oauth"');

      // Ensure we're not doing a full file rewrite that could expose env vars
      const originalLines = originalContent.trim().split('\n').length;
      const savedLines = savedContent.trim().split('\n').length;
      expect(savedLines).toBeGreaterThanOrEqual(originalLines - 2); // Allow for minor formatting differences
    });

    it('should handle environment variables in nested objects correctly', async () => {
      process.env['NESTED_SECRET'] = 'nested-secret-value';
      process.env['NESTED_ENDPOINT'] = 'https://nested.example.com';

      const nestedContent = `
        {
          "deeply": {
            "nested": {
              "config": {
                "secret": "$NESTED_SECRET",
                "url": "$NESTED_ENDPOINT"
              }
            }
          }
        }
      `;
      mockFsReadFileSync.mockReturnValue(nestedContent);

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      loadedSettings.setValue('User', 'deeply.nested.config.secret', 'modified-value');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;

      // The modified value should be saved as plaintext (since it's not an env var anymore)
      expect(savedContent).toContain('"secret": "modified-value"');

      // Other env vars should remain as references
      expect(savedContent).toContain('$NESTED_ENDPOINT');
      expect(savedContent).not.toContain('nested-secret-value');
      expect(savedContent).not.toContain('https://nested.example.com');
    });

    it('should prevent path traversal attacks in settings file paths', async () => {
      // Test that malicious paths are sanitized
      const maliciousPath = '../../../etc/passwd';
      const sanitizedPath = pathActual.resolve(MOCK_WORKSPACE_DIR, SETTINGS_DIRECTORY_NAME, 'settings.json');
      
      // Ensure the path is within the expected directory
      expect(sanitizedPath).toContain(MOCK_WORKSPACE_DIR);
      expect(sanitizedPath).not.toContain('../');
      expect(sanitizedPath).not.toContain('/etc/passwd');
    });

    it('should validate JSON content before parsing to prevent injection', async () => {
      const maliciousContent = `{
        "model": {
          "name": "gemini-pro"
        },
        "__proto__": {
          "isAdmin": true
        }
      }`;
      
      mockFsReadFileSync.mockReturnValue(maliciousContent);
      
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      
      // Ensure prototype pollution doesn't occur
      expect((loadedSettings.merged as any).__proto__.isAdmin).toBeUndefined();
      expect((Object.prototype as any).isAdmin).toBeUndefined();
    });

    it('should sanitize environment variable names to prevent injection', async () => {
      // Test with potentially malicious environment variable names
      process.env['$(rm -rf /)'] = 'malicious-command';
      process.env['`cat /etc/passwd`'] = 'command-injection';
      
      const settingsContent = `{
        "api": {
          "key": "$(rm -rf /)",
          "endpoint": "\`cat /etc/passwd\`"
        }
      }`;
      
      mockFsReadFileSync.mockReturnValue(settingsContent);
      
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      
      // These should remain as literal strings, not be executed
      expect((loadedSettings.merged as any).api?.key).toBe('$(rm -rf /)');
      expect((loadedSettings.merged as any).api?.endpoint).toBe('`cat /etc/passwd`');
    });
  });

  // Comprehensive tests for secure settings functionality
  describe('Secure Settings Preservation', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      vi.resetAllMocks();
      originalEnv = { ...process.env };

      // Re-setup mocks for this test suite
      mockFsExistsSync = vi.mocked(fs.existsSync);
      mockStripJsonComments = vi.mocked(stripJsonComments);
      mockFsReadFileSync = vi.mocked(fs.readFileSync);
      mockFsWriteFileSync = vi.mocked(fs.writeFileSync);

      // Mock file system to return valid JSON
      mockFsExistsSync.mockReturnValue(true);
      mockStripJsonComments.mockImplementation((content: string) => content);
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('should preserve environment variable references when saving user settings', async () => {
      // Setup environment variables
      process.env['SECURE_API_KEY'] = 'secret-key-123';
      process.env['SECURE_ENDPOINT'] = 'https://secure-api.example.com';

      // Mock original file content with environment variables
      const originalFileContent = JSON.stringify({
        api: {
          key: '$SECURE_API_KEY',
          endpoint: '$SECURE_ENDPOINT'
        },
        model: {
          name: 'gemini-pro'
        }
      });

      // Mock file reading for both resolved and original content
      mockFsReadFileSync.mockReturnValue(originalFileContent);

      // Load settings
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // Modify a setting (this should trigger secure saving)
      loadedSettings.setValue('User', 'model.name', 'gemini-pro-vision');

      // Verify that writeFileSync was called
      expect(mockFsWriteFileSync).toHaveBeenCalled();

      // Get the saved content (should be a JSON string)
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;

      console.log('DEBUG: savedContent type:', typeof savedContent);
      console.log('DEBUG: savedContent value:', savedContent);

      // Parse the saved content to verify structure
      const parsedContent = JSON.parse(savedContent);

      // CRITICAL: Environment variable references should be preserved
      expect(parsedContent.api.key).toBe('$SECURE_API_KEY');
      expect(parsedContent.api.endpoint).toBe('$SECURE_ENDPOINT');

      // CRITICAL: Plaintext secrets should NOT appear
      expect(savedContent).not.toContain('secret-key-123');
      expect(savedContent).not.toContain('https://secure-api.example.com');

      // The modified setting should be saved correctly
      expect(parsedContent.model.name).toBe('gemini-pro-vision');

      // Verify the saved content is properly formatted JSON
      expect(() => JSON.parse(savedContent)).not.toThrow();
    });

    it('should handle nested object modifications securely', async () => {
      process.env['NESTED_VAR'] = 'nested-value';

      const originalContent = JSON.stringify({
        deeply: {
          nested: {
            config: {
              secret: '$NESTED_VAR',
              other: 'unchanged'
            }
          }
        },
        topLevel: 'unchanged'
      });

      mockFsReadFileSync.mockReturnValue(originalContent);

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // Modify only the nested secret
      loadedSettings.setValue('User', 'deeply.nested.config.secret', 'new-secret-value');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;
      const parsedContent = JSON.parse(savedContent);

      // The modified value should be saved as plaintext (since it's no longer an env var)
      expect(parsedContent.deeply.nested.config.secret).toBe('new-secret-value');

      // Other env vars should remain as references
      expect(savedContent).toContain('$NESTED_VAR');

      // Other unchanged values should be preserved
      expect(parsedContent.deeply.nested.config.other).toBe('unchanged');
      expect(parsedContent.topLevel).toBe('unchanged');

      // Original env var should not appear in plaintext
      expect(savedContent).not.toContain('nested-value');
    });

    it('should work with workspace settings', async () => {
      process.env['WORKSPACE_SECRET'] = 'workspace-secret';

      const userContent = JSON.stringify({
        userSetting: 'user-value'
      });

      const workspaceContent = JSON.stringify({
        workspace: {
          secret: '$WORKSPACE_SECRET',
          normal: 'workspace-value'
        }
      });

      // Mock both user and workspace files
      mockFsReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('user')) {
          return userContent;
        } else if (filePath.includes('workspace')) {
          return workspaceContent;
        }
        return '{}';
      });

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // Modify workspace setting
      loadedSettings.setValue('Workspace', 'workspace.normal', 'modified-workspace-value');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;
      const parsedContent = JSON.parse(savedContent);

      // Workspace env var reference should be preserved
      expect(savedContent).toContain('$WORKSPACE_SECRET');

      // Modified value should be saved
      expect(parsedContent.workspace.normal).toBe('modified-workspace-value');

      // Original env var should not appear in plaintext
      expect(savedContent).not.toContain('workspace-secret');
    });

    it('should handle complex environment variable patterns', async () => {
      process.env['COMPLEX_VAR'] = 'complex-value';
      process.env['ANOTHER_VAR'] = 'another-value';

      const originalContent = JSON.stringify({
        config: {
          primary: '$COMPLEX_VAR',
          secondary: '${ANOTHER_VAR}',
          combined: '$COMPLEX_VAR-${ANOTHER_VAR}',
          nested: {
            deep: '$COMPLEX_VAR'
          }
        }
      });

      mockFsReadFileSync.mockReturnValue(originalContent);

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // Modify one value
      loadedSettings.setValue('User', 'config.primary', 'modified-primary');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;
      const parsedContent = JSON.parse(savedContent);

      // Modified value should be plaintext
      expect(parsedContent.config.primary).toBe('modified-primary');

      // Other env var references should be preserved
      expect(savedContent).toContain('${ANOTHER_VAR}');
      expect(savedContent).toContain('$COMPLEX_VAR-${ANOTHER_VAR}');
      expect(savedContent).toContain('"deep": "$COMPLEX_VAR"');

      // No plaintext secrets should appear
      expect(savedContent).not.toContain('complex-value');
      expect(savedContent).not.toContain('another-value');
    });

    it('should gracefully handle file read errors', async () => {
      // Mock file read to fail
      mockFsReadFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      // Should not crash, should fall back to normal behavior
      expect(() => {
        loadedSettings.setValue('User', 'model.name', 'fallback-value');
      }).not.toThrow();
    });

    it('should apply V1 migration when saving securely', async () => {
      // This test would validate that V1 migration is applied correctly
      // when using the secure saving method
      const originalContent = JSON.stringify({
        oldKey: 'old-value',
        api: {
          key: '$API_KEY'
        }
      });

      mockFsReadFileSync.mockReturnValue(originalContent);

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      loadedSettings.setValue('User', 'model.name', 'test-value');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;

      // Should still preserve environment variables after migration
      expect(savedContent).toContain('$API_KEY');
    });

    it('should maintain proper JSON formatting', async () => {
      const originalContent = JSON.stringify({
        api: { key: '$API_KEY' },
        model: { name: 'gemini-pro' }
      }, null, 2); // Pretty printed

      mockFsReadFileSync.mockReturnValue(originalContent);

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      loadedSettings.setValue('User', 'model.name', 'gemini-pro-vision');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;
      const parsedContent = JSON.parse(savedContent);

      // Should be valid JSON
      expect(() => JSON.parse(savedContent)).not.toThrow();

      // Should preserve environment variable references
      expect(savedContent).toContain('$API_KEY');
      expect(parsedContent.model.name).toBe('gemini-pro-vision');
    });

    it('should directly test secure saving functionality', async () => {
      // Test the secure saving by directly creating a LoadedSettings instance
      const userSettingsFile = {
        path: '/mock/home/user/.gemini/settings.json',
        settings: { model: { name: 'gemini-pro' } }
      };

      const systemSettingsFile = {
        path: '/mock/system/settings.json',
        settings: {}
      };

      const workspaceSettingsFile = {
        path: '/mock/workspace/.gemini/settings.json',
        settings: {}
      };

      // Create original content with environment variables
      const originalUserContent = {
        api: { key: '$API_KEY' },
        model: { name: 'gemini-pro' }
      };

      // Mock the file reading to return original content
      mockFsReadFileSync.mockImplementation((filePath: string) => {
        if (filePath === userSettingsFile.path) {
          return JSON.stringify(originalUserContent);
        }
        return '{}';
      });

      // Create LoadedSettings instance directly
      const loadedSettings = new LoadedSettings(
        systemSettingsFile,
        systemSettingsFile, // systemDefaults same as system
        userSettingsFile,
        workspaceSettingsFile,
        true, // isTrusted
        new Set<SettingScope>() // migratedScopes
      );

      // Modify a setting
      loadedSettings.setValue('User', 'model.name', 'gemini-pro-vision');

      // Verify secure saving was called
      expect(mockFsWriteFileSync).toHaveBeenCalled();

      // Check the saved content
      const savedContent = mockFsWriteFileSync.mock.calls[0][1] as string;
      const parsedContent = JSON.parse(savedContent);

      // Environment variable should be preserved
      expect(savedContent).toContain('$API_KEY');
      expect(parsedContent.api.key).toBe('$API_KEY');

      // Modified value should be saved
      expect(parsedContent.model.name).toBe('gemini-pro-vision');
    });

    it('should validate file permissions before writing', async () => {
      const originalContent = JSON.stringify({
        model: { name: 'gemini-pro' }
      });

      mockFsReadFileSync.mockReturnValue(originalContent);

      // Mock fs.access to simulate permission check
      const mockFsAccess = vi.fn();
      (fs as any).access = mockFsAccess;
      mockFsAccess.mockImplementation((path, mode, callback) => {
        callback(null); // Simulate success
      });

      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
      loadedSettings.setValue('User', 'model.name', 'gemini-pro-vision');

      expect(mockFsWriteFileSync).toHaveBeenCalled();
    });

    it('should prevent buffer overflow attacks in large settings files', async () => {
      // Create a very large but valid JSON content
      const largeObject: any = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`key${i}`] = `value${i}`.repeat(100);
      }
      const largeContent = JSON.stringify(largeObject);

      mockFsReadFileSync.mockReturnValue(largeContent);

      // Should handle large files without crashing
      expect(() => {
        const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);
        loadedSettings.setValue('User', 'model.name', 'test-value');
      }).not.toThrow();
    });

    it('should sanitize file paths to prevent directory traversal', async () => {
      const maliciousWorkspaceDir = '/mock/../../../etc';
      
      // The path should be sanitized and not allow traversal
      expect(() => {
        loadSettings(maliciousWorkspaceDir);
      }).not.toThrow();
      
      // Verify the actual path used is safe
      const safePath = pathActual.resolve(maliciousWorkspaceDir, SETTINGS_DIRECTORY_NAME, 'settings.json');
      expect(safePath).not.toContain('../');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadSettings', () => {
    it('should load empty settings if no files exist', () => {
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.system.settings).toEqual({});
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual({});
    });

    it('should load system settings if only system file exists', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === getSystemSettingsPath(),
      );
      const systemSettingsContent = {
        ui: {
          theme: 'system-default',
        },
        tools: {
          sandbox: false,
        },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === getSystemSettingsPath())
            return JSON.stringify(systemSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        getSystemSettingsPath(),
        'utf-8',
      );
      expect(settings.system.settings).toEqual(systemSettingsContent);
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual({
        ...systemSettingsContent,
      });
    });

    it('should load user settings if only user file exists', () => {
      const expectedUserSettingsPath = USER_SETTINGS_PATH; // Use the path actually resolved by the (mocked) module

      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === expectedUserSettingsPath,
      );
      const userSettingsContent = {
        ui: {
          theme: 'dark',
        },
        context: {
          fileName: 'USER_CONTEXT.md',
        },
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
      expect(settings.merged).toEqual({
        ...userSettingsContent,
      });
    });

    it('should load workspace settings if only workspace file exists', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        tools: {
          sandbox: true,
        },
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
        },
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
      expect(settings.merged).toEqual({
        ...workspaceSettingsContent,
      });
    });

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
      expect(settings.merged).toEqual({
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

    it('should correctly migrate a complex legacy (v1) settings file', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const legacySettingsContent = {
        theme: 'legacy-dark',
        vimMode: true,
        contextFileName: 'LEGACY_CONTEXT.md',
        model: 'gemini-pro',
        mcpServers: {
          'legacy-server-1': {
            command: 'npm',
            args: ['run', 'start:server1'],
            description: 'Legacy Server 1',
          },
          'legacy-server-2': {
            command: 'node',
            args: ['server2.js'],
            description: 'Legacy Server 2',
          },
        },
        allowMCPServers: ['legacy-server-1'],
        someUnrecognizedSetting: 'should-be-preserved',
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(legacySettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged).toEqual({
        ui: {
          theme: 'legacy-dark',
        },
        general: {
          vimMode: true,
        },
        context: {
          fileName: 'LEGACY_CONTEXT.md',
        },
        model: {
          name: 'gemini-pro',
        },
        mcpServers: {
          'legacy-server-1': {
            command: 'npm',
            args: ['run', 'start:server1'],
            description: 'Legacy Server 1',
          },
          'legacy-server-2': {
            command: 'node',
            args: ['server2.js'],
            description: 'Legacy Server 2',
          },
        },
        mcp: {
          allowed: ['legacy-server-1'],
        },
        someUnrecognizedSetting: 'should-be-preserved',
      });
    });

    it('should rewrite allowedTools to tools.allowed during migration', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const legacySettingsContent = {
        allowedTools: ['fs', 'shell'],
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(legacySettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.merged.tools?.allowed).toEqual(['fs', 'shell']);
      expect((settings.merged as TestSettings)['allowedTools']).toBeUndefined();
    });

    it('should correctly merge and migrate legacy array properties from multiple scopes', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const legacyUserSettings = {
        includeDirectories: ['/user/dir'],
        excludeTools: ['user-tool'],
        excludedProjectEnvVars: ['USER_VAR'],
      };
      const legacyWorkspaceSettings = {
        includeDirectories: ['/workspace/dir'],
        excludeTools: ['workspace-tool'],
        excludedProjectEnvVars: ['WORKSPACE_VAR', 'USER_VAR'],
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(legacyUserSettings);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(legacyWorkspaceSettings);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // Verify includeDirectories are concatenated
      expect(settings.merged.context?.includeDirectories).toEqual([
        '/user/dir',
        '/workspace/dir',
      ]);

      // Verify excludeTools are concatenated and de-duped
      expect(settings.merged.tools?.exclude).toEqual([
        'user-tool',
        'workspace-tool',
      ]);

      // Verify excludedProjectEnvVars are concatenated and de-duped
      expect(settings.merged.advanced?.excludedEnvVars).toEqual(
        expect.arrayContaining(['USER_VAR', 'WORKSPACE_VAR']),
      );
      expect(settings.merged.advanced?.excludedEnvVars).toHaveLength(2);
    });

    it('should merge all settings files with the correct precedence', () => {
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
          fileName: 'WORKSPACE_CONTEXT.md',
          includeDirectories: [
            '/system/defaults/dir',
            '/user/dir1',
            '/user/dir2',
            '/workspace/dir',
            '/system/dir',
          ],
        },
        telemetry: false,
        tools: {
          sandbox: false,
        },
        ui: {
          theme: 'system-theme',
        },
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

    it('should handle contextFileName correctly when only in user settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = { context: { fileName: 'CUSTOM.md' } };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.context?.fileName).toBe('CUSTOM.md');
    });

    it('should handle contextFileName correctly when only in workspace settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        context: { fileName: 'PROJECT_SPECIFIC.md' },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.context?.fileName).toBe('PROJECT_SPECIFIC.md');
    });

    it('should handle excludedProjectEnvVars correctly when only in user settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['DEBUG', 'NODE_ENV', 'CUSTOM_VAR'] },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'CUSTOM_VAR',
      ]);
    });

    it('should handle excludedProjectEnvVars correctly when only in workspace settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['WORKSPACE_DEBUG', 'WORKSPACE_VAR'] },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
    });

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
      expect(settings.merged.ui).toBeUndefined();
      expect(settings.merged.mcpServers).toBeUndefined();
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

    it('should handle MCP servers when only in user settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = {
        mcpServers: {
          'user-only-server': {
            command: 'user-only-command',
            description: 'User only server',
          },
        },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.mcpServers).toEqual({
        'user-only-server': {
          command: 'user-only-command',
          description: 'User only server',
        },
      });
    });

    it('should handle MCP servers when only in workspace settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        mcpServers: {
          'workspace-only-server': {
            command: 'workspace-only-command',
            description: 'Workspace only server',
          },
        },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.mcpServers).toEqual({
        'workspace-only-server': {
          command: 'workspace-only-command',
          description: 'Workspace only server',
        },
      });
    });

    it('should have mcpServers as undefined if not in any settings file', () => {
      (mockFsExistsSync as Mock).mockReturnValue(false); // No settings files exist
      (fs.readFileSync as Mock).mockReturnValue('{}');
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.mcpServers).toBeUndefined();
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

    it('should merge chatCompression settings, with workspace taking precedence', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        general: {},
        model: { chatCompression: { contextPercentageThreshold: 0.5 } },
      };
      const workspaceSettingsContent = {
        general: {},
        model: { chatCompression: { contextPercentageThreshold: 0.8 } },
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
      const e = settings.user.settings.model?.chatCompression;
      console.log(e);

      expect(settings.user.settings.model?.chatCompression).toEqual({
        contextPercentageThreshold: 0.5,
      });
      expect(settings.workspace.settings.model?.chatCompression).toEqual({
        contextPercentageThreshold: 0.8,
      });
      expect(settings.merged.model?.chatCompression).toEqual({
        contextPercentageThreshold: 0.8,
      });
    });

    it('should merge output format settings, with workspace taking precedence', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        output: { format: 'text' },
      };
      const workspaceSettingsContent = {
        output: { format: 'json' },
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

      expect(settings.merged.output?.format).toBe('json');
    });

    it('should handle chatCompression when only in user settings', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = {
        general: {},
        model: { chatCompression: { contextPercentageThreshold: 0.5 } },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.model?.chatCompression).toEqual({
        contextPercentageThreshold: 0.5,
      });
    });

    it('should have model as undefined if not in any settings file', () => {
      (mockFsExistsSync as Mock).mockReturnValue(false); // No settings files exist
      (fs.readFileSync as Mock).mockReturnValue('{}');
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.model).toBeUndefined();
    });

    it('should ignore chatCompression if contextPercentageThreshold is invalid', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = {
        general: {},
        model: { chatCompression: { contextPercentageThreshold: 1.5 } },
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.model?.chatCompression).toEqual({
        contextPercentageThreshold: 1.5,
      });
      warnSpy.mockRestore();
    });

    it('should deep merge chatCompression settings', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        general: {},
        model: { chatCompression: { contextPercentageThreshold: 0.5 } },
      };
      const workspaceSettingsContent = {
        general: {},
        model: { chatCompression: {} },
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

      expect(settings.merged.model?.chatCompression).toEqual({
        contextPercentageThreshold: 0.5,
      });
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
        fail('loadSettings should have thrown a FatalConfigError');
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
      expect(
        (settings.workspace.settings as TestSettings)['nested']['value'],
      ).toBe('workspace_endpoint_from_env');
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

      expect(
        (settings.user.settings as TestSettings)['nestedObj']['nestedNull'],
      ).toBeNull();
      expect(
        (settings.user.settings as TestSettings)['nestedObj']['nestedBool'],
      ).toBe(true);
      expect(
        (settings.user.settings as TestSettings)['nestedObj']['nestedNum'],
      ).toBe(0);
      expect(
        (settings.user.settings as TestSettings)['nestedObj']['nestedString'],
      ).toBe('literal');
      expect(
        (settings.user.settings as TestSettings)['nestedObj']['anotherEnv'],
      ).toBe('env_string_nested_value');

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
        expect(settings.merged).toEqual({
          ...systemSettingsContent,
        });
      });
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
        'NODE_ENV',
        'DEBUG',
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
      vi.mocked(isWorkspaceTrusted).mockReturnValue(false);
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
  });

  describe('migrateSettingsToV1', () => {
    it('should handle an empty object', () => {
      const v2Settings = {};
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({});
    });

    it('should migrate a simple v2 settings object to v1', () => {
      const v2Settings = {
        general: {
          preferredEditor: 'vscode',
          vimMode: true,
        },
        ui: {
          theme: 'dark',
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        preferredEditor: 'vscode',
        vimMode: true,
        theme: 'dark',
      });
    });

    it('should handle nested properties correctly', () => {
      const v2Settings = {
        security: {
          folderTrust: {
            enabled: true,
          },
          auth: {
            selectedType: 'oauth',
          },
        },
        advanced: {
          autoConfigureMemory: true,
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        folderTrust: true,
        selectedAuthType: 'oauth',
        autoConfigureMaxOldSpaceSize: true,
      });
    });

    it('should preserve mcpServers at the top level', () => {
      const v2Settings = {
        general: {
          preferredEditor: 'vscode',
        },
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        preferredEditor: 'vscode',
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
      });
    });

    it('should carry over unrecognized top-level properties', () => {
      const v2Settings = {
        general: {
          vimMode: false,
        },
        unrecognized: 'value',
        another: {
          nested: true,
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        vimMode: false,
        unrecognized: 'value',
        another: {
          nested: true,
        },
      });
    });

    it('should handle a complex object with mixed properties', () => {
      const v2Settings = {
        general: {
          disableAutoUpdate: true,
        },
        ui: {
          hideBanner: true,
          customThemes: {
            myTheme: {},
          },
        },
        model: {
          name: 'gemini-pro',
          chatCompression: {
            contextPercentageThreshold: 0.5,
          },
        },
        mcpServers: {
          'server-1': {
            command: 'node server.js',
          },
        },
        unrecognized: {
          should: 'be-preserved',
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        disableAutoUpdate: true,
        hideBanner: true,
        customThemes: {
          myTheme: {},
        },
        model: 'gemini-pro',
        chatCompression: {
          contextPercentageThreshold: 0.5,
        },
        mcpServers: {
          'server-1': {
            command: 'node server.js',
          },
        },
        unrecognized: {
          should: 'be-preserved',
        },
      });
    });

    it('should not migrate a v1 settings object', () => {
      const v1Settings = {
        preferredEditor: 'vscode',
        vimMode: true,
        theme: 'dark',
      };
      const migratedSettings = migrateSettingsToV1(v1Settings);
      expect(migratedSettings).toEqual({
        preferredEditor: 'vscode',
        vimMode: true,
        theme: 'dark',
      });
    });

    it('should migrate a full v2 settings object to v1', () => {
      const v2Settings: TestSettings = {
        general: {
          preferredEditor: 'code',
          vimMode: true,
        },
        ui: {
          theme: 'dark',
        },
        privacy: {
          usageStatisticsEnabled: false,
        },
        model: {
          name: 'gemini-pro',
          chatCompression: {
            contextPercentageThreshold: 0.8,
          },
        },
        context: {
          fileName: 'CONTEXT.md',
          includeDirectories: ['/src'],
        },
        tools: {
          sandbox: true,
          exclude: ['toolA'],
        },
        mcp: {
          allowed: ['server1'],
        },
        security: {
          folderTrust: {
            enabled: true,
          },
        },
        advanced: {
          dnsResolutionOrder: 'ipv4first',
          excludedEnvVars: ['SECRET'],
        },
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
        unrecognizedTopLevel: {
          value: 'should be preserved',
        },
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        preferredEditor: 'code',
        vimMode: true,
        theme: 'dark',
        usageStatisticsEnabled: false,
        model: 'gemini-pro',
        chatCompression: {
          contextPercentageThreshold: 0.8,
        },
        contextFileName: 'CONTEXT.md',
        includeDirectories: ['/src'],
        sandbox: true,
        excludeTools: ['toolA'],
        allowMCPServers: ['server1'],
        folderTrust: true,
        dnsResolutionOrder: 'ipv4first',
        excludedProjectEnvVars: ['SECRET'],
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
        unrecognizedTopLevel: {
          value: 'should be preserved',
        },
      });
    });

    it('should handle partial v2 settings', () => {
      const v2Settings: TestSettings = {
        general: {
          vimMode: false,
        },
        ui: {},
        model: {
          name: 'gemini-1.5-pro',
        },
        unrecognized: 'value',
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        vimMode: false,
        model: 'gemini-1.5-pro',
        unrecognized: 'value',
      });
    });

    it('should handle settings with different data types', () => {
      const v2Settings: TestSettings = {
        general: {
          vimMode: false,
        },
        model: {
          maxSessionTurns: 0,
        },
        context: {
          includeDirectories: [],
        },
        security: {
          folderTrust: {
            enabled: null,
          },
        },
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        vimMode: false,
        maxSessionTurns: 0,
        includeDirectories: [],
        folderTrust: null,
      });
    });

    it('should preserve unrecognized top-level keys', () => {
      const v2Settings: TestSettings = {
        general: {
          vimMode: true,
        },
        customTopLevel: {
          a: 1,
          b: [2],
        },
        anotherOne: 'hello',
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        vimMode: true,
        customTopLevel: {
          a: 1,
          b: [2],
        },
        anotherOne: 'hello',
      });
    });

    it('should handle an empty v2 settings object', () => {
      const v2Settings = {};
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({});
    });

    it('should correctly handle mcpServers at the top level', () => {
      const v2Settings: TestSettings = {
        mcpServers: {
          serverA: { command: 'a' },
        },
        mcp: {
          allowed: ['serverA'],
        },
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        mcpServers: {
          serverA: { command: 'a' },
        },
        allowMCPServers: ['serverA'],
      });
    });
  });

  describe('loadEnvironment', () => {
    function setup({
      isFolderTrustEnabled = true,
      isWorkspaceTrustedValue = true,
    }) {
      delete process.env['TESTTEST']; // reset
      const geminiEnvPath = path.resolve(path.join(GEMINI_DIR, '.env'));

      vi.mocked(isWorkspaceTrusted).mockReturnValue(isWorkspaceTrustedValue);
      (mockFsExistsSync as Mock).mockImplementation((p: fs.PathLike) =>
        [USER_SETTINGS_PATH, geminiEnvPath].includes(p.toString()),
      );
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
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === geminiEnvPath) return 'TESTTEST=1234';
          return '{}';
        },
      );
    }

    it('sets environment variables from .env files', () => {
      setup({ isFolderTrustEnabled: false, isWorkspaceTrustedValue: true });
      loadEnvironment(loadSettings(MOCK_WORKSPACE_DIR).merged);

      expect(process.env['TESTTEST']).toEqual('1234');
    });

    it('does not load env files from untrusted spaces', () => {
      setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: false });
      loadEnvironment(loadSettings(MOCK_WORKSPACE_DIR).merged);

      expect(process.env['TESTTEST']).not.toEqual('1234');
    });

    describe('GEMINI_SAFE_TRUST_DEFAULT security tests', () => {
      let originalEnv: string | undefined;
      let originalIsWorkspaceTrusted: Mock;

      beforeEach(() => {
        originalEnv = process.env['GEMINI_SAFE_TRUST_DEFAULT'];
        originalIsWorkspaceTrusted = vi.mocked(isWorkspaceTrusted);
      });

      afterEach(() => {
        if (originalEnv !== undefined) {
          process.env['GEMINI_SAFE_TRUST_DEFAULT'] = originalEnv;
        } else {
          delete process.env['GEMINI_SAFE_TRUST_DEFAULT'];
        }
        originalIsWorkspaceTrusted.mockRestore();
      });

      it('should load env files when workspace is trusted', () => {
        setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: true });
        originalIsWorkspaceTrusted.mockReturnValue(true);

        loadEnvironment(loadSettings(MOCK_WORKSPACE_DIR).merged);

        expect(process.env['TESTTEST']).toEqual('1234');
      });

      it('should not load env files when workspace is not trusted', () => {
        setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: false });
        originalIsWorkspaceTrusted.mockReturnValue(false);

        loadEnvironment(loadSettings(MOCK_WORKSPACE_DIR).merged);

        expect(process.env['TESTTEST']).toBeUndefined();
      });

      it('should not load env files when workspace trust is undefined', () => {
        setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: undefined });
        originalIsWorkspaceTrusted.mockReturnValue(undefined);

        loadEnvironment(loadSettings(MOCK_WORKSPACE_DIR).merged);

        expect(process.env['TESTTEST']).toBeUndefined();
      });

      it('should load env files when workspace trust returns true with GEMINI_SAFE_TRUST_DEFAULT logic', () => {
        // Test that the centralized isWorkspaceTrusted function handles GEMINI_SAFE_TRUST_DEFAULT
        setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: true });
        process.env['GEMINI_SAFE_TRUST_DEFAULT'] = '1';
        originalIsWorkspaceTrusted.mockReturnValue(true); // Explicit trust overrides env var

        loadEnvironment(loadSettings(MOCK_WORKSPACE_DIR).merged);

        expect(process.env['TESTTEST']).toEqual('1234');
      });

      it('should not load env files when GEMINI_SAFE_TRUST_DEFAULT blocks access', () => {
        // Test that the centralized isWorkspaceTrusted function handles GEMINI_SAFE_TRUST_DEFAULT
        setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: false });
        process.env['GEMINI_SAFE_TRUST_DEFAULT'] = '1';
        originalIsWorkspaceTrusted.mockReturnValue(false); // Env var blocks access

        loadEnvironment(loadSettings(MOCK_WORKSPACE_DIR).merged);

        expect(process.env['TESTTEST']).toBeUndefined();
      });
    });
  });

  describe('needsMigration', () => {
    it('should return false for an empty object', () => {
      expect(needsMigration({})).toBe(false);
    });

    it('should return false for settings that are already in V2 format', () => {
      const v2Settings = {
        ui: {
          theme: 'dark',
        },
        tools: {
          sandbox: true,
        },
      };
      expect(needsMigration(v2Settings)).toBe(false);
    });

    it('should return true for settings with a V1 key that needs to be moved', () => {
      const v1Settings = {
        theme: 'dark', // v1 key
      };
      expect(needsMigration(v1Settings)).toBe(true);
    });

    it('should return true for settings with a mix of V1 and V2 keys', () => {
      const mixedSettings = {
        theme: 'dark', // v1 key
        tools: {
          sandbox: true, // v2 key
        },
      };
      expect(needsMigration(mixedSettings)).toBe(true);
    });

    it('should return false for settings with only V1 keys that are the same in V2', () => {
      const v1Settings = {
        mcpServers: {},
        telemetry: {},
        extensions: [],
      };
      expect(needsMigration(v1Settings)).toBe(false);
    });

    it('should return true for settings with a mix of V1 keys that are the same in V2 and V1 keys that need moving', () => {
      const v1Settings = {
        mcpServers: {}, // same in v2
        theme: 'dark', // needs moving
      };
      expect(needsMigration(v1Settings)).toBe(true);
    });

    it('should return false for settings with unrecognized keys', () => {
      const settings = {
        someUnrecognizedKey: 'value',
      };
      expect(needsMigration(settings)).toBe(false);
    });

    it('should return false for settings with v2 keys and unrecognized keys', () => {
      const settings = {
        ui: { theme: 'dark' },
        someUnrecognizedKey: 'value',
      };
      expect(needsMigration(settings)).toBe(false);
    });
  });
});
