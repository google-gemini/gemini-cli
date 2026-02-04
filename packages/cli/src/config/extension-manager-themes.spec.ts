/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  afterEach,
} from 'vitest';
import { createExtension } from '../test-utils/createExtension.js';
import { ExtensionManager } from './extension-manager.js';
import { themeManager, DEFAULT_THEME } from '../ui/themes/theme-manager.js';
import { GEMINI_DIR, type Config } from '@google/gemini-cli-core';
import { createTestMergedSettings, SettingScope } from './settings.js';

describe('ExtensionManager theme loading', () => {
  let extensionManager: ExtensionManager;
  let userExtensionsDir: string;
  let tempHomeDir: string;

  beforeAll(async () => {
    tempHomeDir = await fs.promises.mkdtemp(
      path.join(fs.realpathSync('/tmp'), 'gemini-cli-test-'),
    );
  });

  afterAll(async () => {
    if (tempHomeDir) {
      await fs.promises.rm(tempHomeDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    process.env['GEMINI_CLI_HOME'] = tempHomeDir;
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    // Ensure userExtensionsDir is clean for each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings({
        experimental: { extensionConfig: true },
        security: { blockGitExtensions: false },
        admin: { extensions: { enabled: true }, mcp: { enabled: true } },
      }),
      requestConsent: async () => true,
      requestSetting: async () => '',
      workspaceDir: tempHomeDir,
      enabledExtensionOverrides: [],
    });
    vi.clearAllMocks();
    themeManager.clearExtensionThemes();
    themeManager.loadCustomThemes({});
    themeManager.setActiveTheme(DEFAULT_THEME.name);
  });

  afterEach(() => {
    delete process.env['GEMINI_CLI_HOME'];
  });

  it('should register themes from an extension when started', async () => {
    const registerSpy = vi.spyOn(themeManager, 'registerExtensionThemes');
    createExtension({
      extensionsDir: userExtensionsDir,
      name: 'my-theme-extension',
      themes: [
        {
          name: 'My-Awesome-Theme',
          type: 'custom',
          text: {
            primary: '#FF00FF',
          },
        },
      ],
    });

    await extensionManager.loadExtensions();

    const mockConfig = {
      getEnableExtensionReloading: () => false,
      getMcpClientManager: () => ({
        startExtension: vi.fn().mockResolvedValue(undefined),
      }),
      getGeminiClient: () => ({
        isInitialized: () => false,
        updateSystemInstruction: vi.fn(),
        setTools: vi.fn(),
      }),
      getHookSystem: () => undefined,
      getWorkingDir: () => tempHomeDir,
      shouldLoadMemoryFromIncludeDirectories: () => false,
      getDebugMode: () => false,
      getFileExclusions: () => ({
        isIgnored: () => false,
      }),
      getGeminiMdFilePaths: () => [],
      getMcpServers: () => ({}),
      getAllowedMcpServers: () => [],
      getSanitizationConfig: () => ({
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      }),
      getShellExecutionConfig: () => ({
        terminalWidth: 80,
        terminalHeight: 24,
        showColor: false,
        pager: 'cat',
        sanitizationConfig: {
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
          enableEnvironmentVariableRedaction: false,
        },
      }),
      getToolRegistry: () => ({
        getTools: () => [],
      }),
      getProxy: () => undefined,
      getFileService: () => ({
        findFiles: async () => [],
      }),
      getExtensionLoader: () => ({
        getExtensions: () => [],
      }),
      isTrustedFolder: () => true,
      getImportFormat: () => 'tree',
      reloadSkills: vi.fn(),
    } as unknown as Config;

    await extensionManager.start(mockConfig);

    expect(registerSpy).toHaveBeenCalledWith('my-theme-extension', [
      {
        name: 'My-Awesome-Theme',
        type: 'custom',
        text: {
          primary: '#FF00FF',
        },
      },
    ]);
  });

  it('should revert to default theme when extension is stopped', async () => {
    const extensionName = 'my-theme-extension';
    const themeName = 'My-Awesome-Theme';
    const namespacedThemeName = `${themeName} (${extensionName})`;

    createExtension({
      extensionsDir: userExtensionsDir,
      name: extensionName,
      themes: [
        {
          name: themeName,
          type: 'custom',
          text: {
            primary: '#FF00FF',
          },
        },
      ],
    });

    await extensionManager.loadExtensions();

    const mockConfig = {
      getWorkingDir: () => tempHomeDir,
      shouldLoadMemoryFromIncludeDirectories: () => false,
      getWorkspaceContext: () => ({
        getDirectories: () => [],
      }),
      getDebugMode: () => false,
      getFileService: () => ({
        findFiles: async () => [],
      }),
      getExtensionLoader: () => ({
        getExtensions: () => [],
      }),
      isTrustedFolder: () => true,
      getImportFormat: () => 'tree',
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      getDiscoveryMaxDirs: () => 200,
      getMcpClientManager: () => ({
        getMcpInstructions: () => '',
        startExtension: vi.fn().mockResolvedValue(undefined),
        stopExtension: vi.fn().mockResolvedValue(undefined),
      }),
      setUserMemory: vi.fn(),
      setGeminiMdFileCount: vi.fn(),
      setGeminiMdFilePaths: vi.fn(),
      getEnableExtensionReloading: () => true,
      getGeminiClient: () => ({
        isInitialized: () => false,
        updateSystemInstruction: vi.fn(),
        setTools: vi.fn(),
      }),
      getHookSystem: () => undefined,
      getProxy: () => undefined,
      getAgentRegistry: () => ({
        reload: vi.fn().mockResolvedValue(undefined),
      }),
      reloadSkills: vi.fn(),
    } as unknown as Config;

    await extensionManager.start(mockConfig);

    // Set the active theme to the one from the extension
    themeManager.setActiveTheme(namespacedThemeName);
    expect(themeManager.getActiveTheme().name).toBe(namespacedThemeName);

    // Stop the extension
    await extensionManager.disableExtension(extensionName, SettingScope.User);

    // Check that the active theme has reverted to the default
    expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
  });
});
